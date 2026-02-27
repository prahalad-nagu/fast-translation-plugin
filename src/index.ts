import { OpenAITranslationProvider } from "./providers/openai.js";
import { TranslatorService } from "./translator.js";
import type { Translator, TranslatorConfig } from "./types.js";

export { TranslatorService } from "./translator.js";
export { OpenAITranslationProvider } from "./providers/openai.js";
export type {
  LanguageCode,
  ProviderTranslateOptions,
  TranslateOptions,
  Translator,
  TranslatorConfig,
} from "./types.js";
export type { TranslationProvider } from "./providers/base.js";

export function createTranslator(config: TranslatorConfig): Translator {
  const { apiKey, model, ...serviceConfig } = config;

  const provider = new OpenAITranslationProvider({ apiKey, model });
  return new TranslatorService(provider, serviceConfig);
}
