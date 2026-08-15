// Minimal OpenAI-compatible client for the Kilo AI Gateway.
// Isolated here so the rest of the app never imports a provider SDK directly
// and a tiny serverless proxy can be swapped in later without touching the engine.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const DEFAULT_BASE_URL = "https://api.kilo.ai/api/gateway";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

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
}
