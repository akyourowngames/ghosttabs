// Platform registry. Single entry point for conversation capture (PART A #1).
// Keeps all ChatGPT/Claude-specific logic inside src/content/platforms/*.

import type { ConversationContext, ConversationExtractor } from "@/types";
import { extractGeneric, genericExtractor } from "./generic";
import { chatgptExtractor } from "./chatgpt";
import { claudeExtractor } from "./claude";

const EXTRACTORS: ConversationExtractor[] = [
  chatgptExtractor(),
  claudeExtractor(),
  genericExtractor(),
];

export function getExtractor(url: string): ConversationExtractor {
  return (
    EXTRACTORS.find((e) => {
      try {
        return e.canHandle(url);
      } catch {
        return false;
      }
    }) ?? genericExtractor()
  );
}

/**
 * Run the best matching extractor. Falls back to the generic extractor on any
 * failure so capture never hard-fails (PART A #42).
 */
export async function extractConversation(url: string): Promise<ConversationContext> {
  const extractor = getExtractor(url);
  try {
    return await extractor.extract();
  } catch (err) {
    console.warn("[GhostTab] platform extractor failed, using generic:", err);
    return extractGeneric();
  }
}

export { extractGeneric } from "./generic";
export { extractChatGPT } from "./chatgpt";
export { extractClaude } from "./claude";
