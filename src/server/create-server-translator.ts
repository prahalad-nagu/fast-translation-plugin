import type { ServerTranslator, ServerTranslatorConfig } from "./types.js";
import { ServerTranslatorService } from "./server-translator.js";

export function createServerTranslator(config: ServerTranslatorConfig): ServerTranslator {
  return new ServerTranslatorService(config);
}
