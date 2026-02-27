import { OpenAITranslationProvider } from "./providers/openai.js";
import { TranslatorService } from "./translator.js";
import type { Translator, TranslatorConfig } from "./types.js";

export { TranslatorService } from "./translator.js";
export { OpenAITranslationProvider } from "./providers/openai.js";
export {
  createIndexedDBPersistentCache,
  createLocalStoragePersistentCache,
} from "./cache/persistent.js";
export type {
  IndexedDBPersistentCacheOptions,
  LocalStoragePersistentCacheOptions,
} from "./cache/persistent.js";
export type {
  LanguageCode,
  PersistentTranslationCache,
  ProviderTranslateOptions,
  TranslateOptions,
  TranslationCacheErrorMeta,
  TranslationUsage,
  Translator,
  TranslatorConfig,
} from "./types.js";
export type { TranslationProvider } from "./providers/base.js";

export function createTranslator(config: TranslatorConfig): Translator {
  const { apiKey, model, dangerouslyAllowBrowser, onUsage, ...serviceConfig } = config;

  const provider = new OpenAITranslationProvider({
    apiKey,
    model,
    dangerouslyAllowBrowser,
    onUsage,
  });
  return new TranslatorService(provider, serviceConfig);
}
