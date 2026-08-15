// Minimal OpenAI-compatible client for the Kilo AI Gateway.
// Isolated here so the rest of the app never imports a provider SDK directly
// and a tiny serverless proxy can be swapped in later without touching the engine.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const DEFAULT_BASE_URL = "https://api.kilo.ai/api/gateway";
// Default model works WITHOUT signing in (free tier) so the AI path succeeds
// out of the box. Some models (e.g. anthropic/claude-sonnet-4.5) require a
// signed-in Kilo account and return PAID_MODEL_AUTH_REQUIRED.
const DEFAULT_MODEL = "tencent/hy3:free";
// Used to auto-recover when the chosen model needs paid sign-in.
export const FALLBACK_MODEL = "tencent/hy3:free";

export interface KiloClientOptions {
  apiKey: string;
  baseURL?: string;
  /** Override the model; falls back to VITE_KILO_MODEL then the default. */
  model?: string;
}

export class KiloClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;

  constructor(opts: KiloClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model =
      opts.model ?? import.meta.env.VITE_KILO_MODEL ?? DEFAULT_MODEL;
  }

  async chat(
    messages: ChatMessage[],
    opts?: { json?: boolean; temperature?: number }
  ): Promise<string> {
    if (!this.apiKey) throw new Error("Missing Kilo API key");

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.3,
    };
    if (opts?.json) body.response_format = { type: "json_object" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Kilo ${res.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string; code?: string; error_type?: string };
      };

      // Kilo sometimes returns 200 with an error object in the body
      // (e.g. PAID_MODEL_AUTH_REQUIRED). Surface that clearly.
      if (data.error) {
        const detail =
          data.error.message || data.error.code || data.error.error_type || "unknown error";
        throw new Error(`Kilo error: ${detail}`);
      }

      return data.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Streaming completion. Yields incremental content deltas as they arrive.
   * Falls back to a single one-shot JSON parse if the gateway does not speak
   * Server-Sent Events (so streaming degrades gracefully instead of breaking).
   */
  async *streamChat(
    messages: ChatMessage[],
    opts?: { temperature?: number }
  ): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey) throw new Error("Missing Kilo API key");

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      stream: true,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Kilo ${res.status}: ${detail.slice(0, 200)}`);
      }

      // Graceful fallback: the gateway returned a plain JSON completion
      // instead of an SSE stream.
      const ct = res.headers.get("content-type") || "";
      if (!/text\/event-stream|stream/i.test(ct) || !res.body) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string; code?: string; error_type?: string };
        };
        if (data.error) {
          const detail =
            data.error.message || data.error.code || data.error.error_type || "unknown error";
          throw new Error(`Kilo error: ${detail}`);
        }
        yield data.choices?.[0]?.message?.content ?? "";
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = rawEvent
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          try {
            const json = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
              error?: { message?: string; code?: string };
            };
            if (json.error) {
              const msg =
                json.error.message || json.error.code || "stream error";
              throw new Error(`Kilo error: ${msg}`);
            }
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch (e) {
            if (e instanceof SyntaxError) continue; // ignore partial chunks
            throw e;
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Lightweight connectivity check used by the Settings "Test connection" button. */
export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: "Enter your Kilo API key first." };
  }
  try {
    const client = new KiloClient({ apiKey, model });
    const content = await client.chat(
      [{ role: "user", content: "Reply with the single word: OK" }],
      { temperature: 0 }
    );
    return { ok: true, message: `Connected (${model}). Model replied: ${content.slice(0, 60).trim()}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/PAID_MODEL_AUTH_REQUIRED|sign in to use this model/i.test(msg)) {
      return {
        ok: false,
        message:
          "This model needs a signed-in Kilo account. Switch the model to tencent/hy3:free (or another :free model) to use it without signing in.",
      };
    }
    return { ok: false, message: msg.slice(0, 200) };
  }
}
