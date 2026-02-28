import { LruTtlCache } from "./cache/lru.js";
import type { TranslationProvider } from "./providers/base.js";
import type {
  LanguageCode,
  TranslateOptions,
  TranslationResult,
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

export type TranslatorServiceConfig = Omit<TranslatorConfig, "apiKey" | "model" | "onUsage">;

export class TranslatorService implements Translator {
  private readonly provider: TranslationProvider;
  private readonly defaultSourceLang: string;
  private readonly supportedLanguages: Set<string>;
  private readonly cache: LruTtlCache<string, string>;
  private readonly persistentCache?: TranslatorConfig["persistentCache"];
  private readonly onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
  private readonly onCacheError?: TranslatorConfig["onCacheError"];
  private readonly inFlight = new Map<string, Promise<TranslationResult>>();

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
    this.persistentCache = config.persistentCache;
    this.onError = config.onError;
    this.onCacheError = config.onCacheError;
  }

  async translateText(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string> {
    const result = await this.translateTextDetailed(text, targetLang, options);
    return result.translatedText;
  }

  async translateTextDetailed(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<TranslationResult> {
    if (typeof text !== "string") {
      throw new Error("text must be a string");
    }

    const sourceLang = normalizeLanguageCode(
      options?.sourceLang ?? this.defaultSourceLang,
      "sourceLang",
    );
    const normalizedTargetLang = normalizeLanguageCode(targetLang, "targetLang");

    assertSupportedLanguage(sourceLang, this.supportedLanguages, "source language");
    assertSupportedLanguage(normalizedTargetLang, this.supportedLanguages, "target language");

    if (text.length === 0 || sourceLang === normalizedTargetLang) {
      return this.buildResult({
        sourceText: text,
        translatedText: text,
        sourceLang,
        targetLang: normalizedTargetLang,
        context: options?.context?.trim() ?? "",
        origin: "same_language",
        fromFallback: false,
      });
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive number");
    }

    const preserveFormatting = options?.preserveFormatting ?? true;
    const context = options?.context?.trim() ?? "";

    const cacheKey = hashKey(`${sourceLang}|${normalizedTargetLang}|${context}|${text}`);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return this.buildResult({
        sourceText: text,
        translatedText: cached,
        sourceLang,
        targetLang: normalizedTargetLang,
        context,
        origin: "memory_cache",
        fromFallback: false,
      });
    }

    const existingRequest = this.inFlight.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const translationPromise = this.resolveTranslation(
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
  ): Promise<TranslationResult> {
    try {
      const translated = await this.provider.translate(text, sourceLang, targetLang, options);
      this.cache.set(cacheKey, translated);
      await this.setPersistentCacheValue(cacheKey, translated, text, targetLang);
      return this.buildResult({
        sourceText: text,
        translatedText: translated,
        sourceLang,
        targetLang,
        context: options.context ?? "",
        origin: "provider",
        fromFallback: false,
      });
    } catch (error) {
      if (this.onError) {
        this.onError(asError(error), { text, targetLang });
      }
      return this.buildResult({
        sourceText: text,
        translatedText: text,
        sourceLang,
        targetLang,
        context: options.context ?? "",
        origin: "fallback",
        fromFallback: true,
      });
    }
  }

  private async resolveTranslation(
    text: string,
    sourceLang: string,
    targetLang: string,
    options: { timeoutMs: number; preserveFormatting: boolean; context?: string },
    cacheKey: string,
  ): Promise<TranslationResult> {
    const persistentCached = await this.getPersistentCacheValue(cacheKey, text, targetLang);
    if (persistentCached !== undefined) {
      this.cache.set(cacheKey, persistentCached);
      return this.buildResult({
        sourceText: text,
        translatedText: persistentCached,
        sourceLang,
        targetLang,
        context: options.context ?? "",
        origin: "persistent_cache",
        fromFallback: false,
      });
    }

    return this.translateWithFallback(text, sourceLang, targetLang, options, cacheKey);
  }

  private async getPersistentCacheValue(
    cacheKey: string,
    text: string,
    targetLang: string,
  ): Promise<string | undefined> {
    if (!this.persistentCache) {
      return undefined;
    }

    try {
      return await this.persistentCache.get(cacheKey);
    } catch (error) {
      this.reportCacheError(error, {
        key: cacheKey,
        operation: "get",
        cacheLayer: "persistent",
        text,
        targetLang,
      });
      return undefined;
    }
  }

  private async setPersistentCacheValue(
    cacheKey: string,
    translated: string,
    text: string,
    targetLang: string,
  ): Promise<void> {
    if (!this.persistentCache) {
      return;
    }

    try {
      await this.persistentCache.set(cacheKey, translated);
    } catch (error) {
      this.reportCacheError(error, {
        key: cacheKey,
        operation: "set",
        cacheLayer: "persistent",
        text,
        targetLang,
      });
    }
  }

  private reportCacheError(
    error: unknown,
    meta: NonNullable<Parameters<NonNullable<TranslatorConfig["onCacheError"]>>[1]>,
  ): void {
    if (this.onCacheError) {
      this.onCacheError(asError(error), meta);
    }
  }

  private buildResult(input: {
    sourceText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    context: string;
    origin: TranslationResult["origin"];
    fromFallback: boolean;
  }): TranslationResult {
    return {
      sourceText: input.sourceText,
      translatedText: input.translatedText,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      context: input.context,
      origin: input.origin,
      fromOverride: false,
      fromStored: false,
      fromFallback: input.fromFallback,
    };
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
