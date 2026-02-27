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
}

export interface Translator {
  translateText(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string>;
  translateBatch(
    texts: string[],
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string[]>;
}

export interface TranslatorConfig {
  apiKey: string;
  model?: string;
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

export interface TranslationCacheErrorMeta {
  key: string;
  operation: "get" | "set";
  text: string;
  targetLang: string;
}
