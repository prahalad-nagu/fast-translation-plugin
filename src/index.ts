import { OpenAITranslationProvider } from "./providers/openai.js";
import { TranslatorService } from "./translator.js";
import type { Translator, TranslatorConfig } from "./types.js";

export { TranslatorService } from "./translator.js";
export { OpenAITranslationProvider } from "./providers/openai.js";
export { createServerTranslator } from "./server/create-server-translator.js";
export { ServerTranslatorService } from "./server/server-translator.js";
export {
  createRedisDistributedCache,
  type RedisDistributedCacheOptions,
} from "./cache/distributed.js";
export {
  createIndexedDBPersistentCache,
  createLocalStoragePersistentCache,
} from "./cache/persistent.js";
export type {
  IndexedDBPersistentCacheOptions,
  LocalStoragePersistentCacheOptions,
} from "./cache/persistent.js";
export type {
  DistributedTranslationCache,
  DistributedTranslationCacheEntry,
  LanguageCode,
  PersistentTranslationCache,
  ProviderTranslateOptions,
  RuntimeEnvironment,
  TranslateOptions,
  TranslationCacheErrorMeta,
  TranslationOrigin,
  TranslationResult,
  TranslationUsage,
  Translator,
  TranslatorConfig,
} from "./types.js";
export type { TranslationProvider } from "./providers/base.js";
export type {
  ListOverridesFilter,
  OverrideQuery,
  OverrideRecord,
  OverrideUpsertInput,
  ServerDatabaseConfig,
  ServerDatabasePoolConfig,
  ServerDatabaseType,
  ServerTranslator,
  ServerTranslatorConfig,
  ServerTranslationResult,
} from "./server/types.js";

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
