export type LanguageCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "hi"
  | "ja"
  | "ko"
  | "ar"
  | "zh"
  | string;

export interface TranslateOptions {
  sourceLang?: LanguageCode;
  timeoutMs?: number;
  preserveFormatting?: boolean;
  context?: string;
  tenantId?: string;
}

export type RuntimeEnvironment = "dev" | "prod";

export type TranslationOrigin =
  | "memory_cache"
  | "persistent_cache"
  | "distributed_cache"
  | "override"
  | "stored"
  | "provider"
  | "same_language"
  | "fallback";

export interface TranslationResult {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  context: string;
  tenantId?: string;
  origin: TranslationOrigin;
  fromOverride: boolean;
  fromStored: boolean;
  fromFallback: boolean;
}

export interface Translator {
  translateText(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string>;
  translateTextDetailed(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<TranslationResult>;
  translateBatch(
    texts: string[],
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string[]>;
}

export interface TranslatorConfig {
  apiKey: string;
  model?: string;
  dangerouslyAllowBrowser?: boolean;
  defaultSourceLang?: LanguageCode;
  cacheTtlMs?: number;
  maxCacheSize?: number;
  supportedLanguages?: LanguageCode[];
  persistentCache?: PersistentTranslationCache;
  onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
  onCacheError?: (err: Error, meta: TranslationCacheErrorMeta) => void;
  onUsage?: (usage: TranslationUsage) => void;
}

export interface ProviderTranslateOptions {
  timeoutMs: number;
  preserveFormatting: boolean;
  context?: string;
}

export interface TranslationUsage {
  model: string;
  sourceLang: string;
  targetLang: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface PersistentTranslationCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export interface DistributedTranslationCacheEntry {
  text: string;
  fromOverride?: boolean;
  fromStored?: boolean;
  fromFallback?: boolean;
}

export interface DistributedTranslationCache {
  get(key: string): Promise<DistributedTranslationCacheEntry | undefined>;
  set(key: string, value: DistributedTranslationCacheEntry): Promise<void>;
  delete?(key: string): Promise<void>;
  close?(): Promise<void>;
}

export interface TranslationCacheErrorMeta {
  key: string;
  operation: "get" | "set" | "delete";
  cacheLayer?: "persistent" | "distributed";
  text: string;
  targetLang: string;
}
