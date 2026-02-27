import { LruTtlCache } from "./cache/lru.js";
import type { TranslationProvider } from "./providers/base.js";
import type {
  LanguageCode,
  TranslateOptions,
  Translator,
  TranslatorConfig,
} from "./types.js";
import {
  assertSupportedLanguage,
  DEFAULT_SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  normalizeSupportedLanguages,
} from "./utils/language.js";
import { hashKey } from "./utils/hash.js";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_CACHE_SIZE = 5_000;

export type TranslatorServiceConfig = Omit<TranslatorConfig, "apiKey" | "model">;

export class TranslatorService implements Translator {
  private readonly provider: TranslationProvider;
  private readonly defaultSourceLang: string;
  private readonly supportedLanguages: Set<string>;
  private readonly cache: LruTtlCache<string, string>;
  private readonly onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(provider: TranslationProvider, config: TranslatorServiceConfig = {}) {
    this.provider = provider;
    this.supportedLanguages = normalizeSupportedLanguages(
      config.supportedLanguages ?? [...DEFAULT_SUPPORTED_LANGUAGES],
    );

    const normalizedSource = normalizeLanguageCode(
      config.defaultSourceLang ?? "en",
      "sourceLang",
    );
    assertSupportedLanguage(normalizedSource, this.supportedLanguages, "source language");

    this.defaultSourceLang = normalizedSource;
    this.cache = new LruTtlCache(
      config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE,
      config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    );
    this.onError = config.onError;
  }

  async translateText(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string> {
    if (typeof text !== "string") {
      throw new Error("text must be a string");
    }

    if (text.length === 0) {
      return text;
    }

    const sourceLang = normalizeLanguageCode(
      options?.sourceLang ?? this.defaultSourceLang,
      "sourceLang",
    );
    const normalizedTargetLang = normalizeLanguageCode(targetLang, "targetLang");

    assertSupportedLanguage(sourceLang, this.supportedLanguages, "source language");
    assertSupportedLanguage(normalizedTargetLang, this.supportedLanguages, "target language");

    if (sourceLang === normalizedTargetLang) {
      return text;
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive number");
    }

    const preserveFormatting = options?.preserveFormatting ?? true;
    const context = options?.context?.trim();

    const cacheKey = hashKey(`${sourceLang}|${normalizedTargetLang}|${context ?? ""}|${text}`);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const existingRequest = this.inFlight.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const translationPromise = this.translateWithFallback(
      text,
      sourceLang,
      normalizedTargetLang,
      { timeoutMs, preserveFormatting, context },
      cacheKey,
    ).finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, translationPromise);

    return translationPromise;
  }

  async translateBatch(
    texts: string[],
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string[]> {
    if (!Array.isArray(texts)) {
      throw new Error("texts must be an array of strings");
    }

    if (texts.length === 0) {
      return [];
    }

    const unique = new Map<string, Promise<string>>();

    for (const text of texts) {
      if (!unique.has(text)) {
        unique.set(text, this.translateText(text, targetLang, options));
      }
    }

    return Promise.all(texts.map((text) => unique.get(text)!));
  }

  private async translateWithFallback(
    text: string,
    sourceLang: string,
    targetLang: string,
    options: { timeoutMs: number; preserveFormatting: boolean; context?: string },
    cacheKey: string,
  ): Promise<string> {
    try {
      const translated = await this.provider.translate(text, sourceLang, targetLang, options);
      this.cache.set(cacheKey, translated);
      return translated;
    } catch (error) {
      if (this.onError) {
        this.onError(asError(error), { text, targetLang });
      }
      return text;
    }
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
