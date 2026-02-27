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
  onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
}

export interface ProviderTranslateOptions {
  timeoutMs: number;
  preserveFormatting: boolean;
  context?: string;
}
