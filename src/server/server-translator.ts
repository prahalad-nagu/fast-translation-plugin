import { LruTtlCache } from "../cache/lru.js";
import { OpenAITranslationProvider } from "../providers/openai.js";
import type { TranslationProvider } from "../providers/base.js";
import type { DistributedTranslationCacheEntry, LanguageCode, TranslateOptions } from "../types.js";
import {
  assertSupportedLanguage,
  DEFAULT_SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  normalizeSupportedLanguages,
} from "../utils/language.js";
import { hashKey } from "../utils/hash.js";
import {
  type ListOverridesFilter,
  type OverrideKeyInput,
  type OverrideQuery,
  type OverrideRecord,
  type OverrideUpsertInput,
  type ResolvedServerContext,
  type ResolvedTranslationRequest,
  type ServerTranslationResult,
  type ServerTranslator,
  type ServerTranslatorConfig,
} from "./types.js";
import { createServerContext } from "./db/knex-client.js";
import {
  type RepositoryLookupKey,
  type TranslationRepository,
  type OverrideRecord as RepositoryOverrideRecord,
} from "./db/repository.js";
import { TranslationRepository as TranslationRepositoryImpl } from "./db/repository.js";
import { ensureServerSchema } from "./db/schema.js";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_CACHE_SIZE = 5_000;
const DEFAULT_MODEL = "gpt-4o-mini";

interface CachedTranslation {
  translatedText: string;
  origin: ServerTranslationResult["origin"];
  fromOverride: boolean;
  fromStored: boolean;
  fromFallback: boolean;
  overrideRevision: number;
}

interface TranslationOutcome {
  translatedText: string;
  origin: ServerTranslationResult["origin"];
  fromOverride: boolean;
  fromStored: boolean;
  fromFallback: boolean;
}

export class ServerTranslatorService implements ServerTranslator {
  private readonly provider: TranslationProvider;
  private readonly defaultSourceLang: string;
  private readonly supportedLanguages: Set<string>;
  private readonly cache: LruTtlCache<string, CachedTranslation>;
  private readonly onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
  private readonly onCacheError?: ServerTranslatorConfig["onCacheError"];
  private readonly modelName: string;
  private readonly environment: NonNullable<ServerTranslatorConfig["environment"]>;
  private readonly distributedCache?: ServerTranslatorConfig["distributedCache"];
  private readonly closeDistributedCacheOnShutdown: boolean;
  private readonly config: ServerTranslatorConfig;

  private readonly inFlight = new Map<string, Promise<TranslationOutcome>>();
  private overrideRevision = 0;
  private context?: ResolvedServerContext;
  private repository?: TranslationRepository;

  constructor(config: ServerTranslatorConfig) {
    if (!config.database) {
      throw new Error("database config is required for createServerTranslator");
    }

    this.config = config;
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
    this.onCacheError = config.onCacheError;
    this.environment = config.environment ?? "dev";
    this.distributedCache = config.distributedCache;
    this.closeDistributedCacheOnShutdown = config.closeDistributedCacheOnShutdown ?? false;

    const providerFromConfig = config.provider;
    if (providerFromConfig) {
      this.provider = providerFromConfig;
      this.modelName = config.model ?? "custom-provider";
      return;
    }

    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error("apiKey is required unless a custom provider is provided");
    }

    this.provider = new OpenAITranslationProvider({
      apiKey: config.apiKey,
      model: config.model,
      dangerouslyAllowBrowser: config.dangerouslyAllowBrowser,
      onUsage: config.onUsage,
    });
    this.modelName = config.model ?? DEFAULT_MODEL;
  }

  async init(): Promise<void> {
    if (this.context && this.repository) {
      return;
    }

    const context = createServerContext(this.config.database, this.environment);

    try {
      if (context.database.autoCreateTables) {
        await ensureServerSchema(context.client, context.database.tableNames);
      }

      this.context = context;
      this.repository = new TranslationRepositoryImpl(context.client, context.database.tableNames);
    } catch (error) {
      if (context.ownsClient) {
        await context.client.destroy();
      }
      throw asError(error);
    }
  }

  async close(): Promise<void> {
    if (!this.context) {
      return;
    }

    if (this.context.ownsClient) {
      await this.context.client.destroy();
    }

    if (this.closeDistributedCacheOnShutdown && this.distributedCache?.close) {
      await this.distributedCache.close();
    }

    this.context = undefined;
    this.repository = undefined;
    this.cache.clear();
    this.inFlight.clear();
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
  ): Promise<ServerTranslationResult> {
    this.requireInitialized();

    if (typeof text !== "string") {
      throw new Error("text must be a string");
    }

    const request = this.resolveTranslationRequest(text, targetLang, options);

    if (text.length === 0 || request.sourceLang === request.targetLang) {
      return this.toDetailedResult(request, {
        translatedText: text,
        origin: "same_language",
        fromOverride: false,
        fromStored: false,
        fromFallback: false,
      });
    }

    const cacheKey = this.createCacheKey(request);
    const cacheEntry = this.cache.get(cacheKey);
    if (cacheEntry !== undefined) {
      if (cacheEntry.overrideRevision === this.overrideRevision) {
        return this.toDetailedResult(request, {
          translatedText: cacheEntry.translatedText,
          origin: "memory_cache",
          fromOverride: cacheEntry.fromOverride,
          fromStored: cacheEntry.fromStored,
          fromFallback: cacheEntry.fromFallback,
        });
      }

      this.cache.delete(cacheKey);
    }

    const requestRevision = this.overrideRevision;
    const inFlightKey = this.createInFlightKey(cacheKey, requestRevision);
    const inFlight = this.inFlight.get(inFlightKey);
    if (inFlight) {
      const outcome = await inFlight;
      return this.toDetailedResult(request, outcome);
    }

    const translationPromise = this.resolveTranslation(cacheKey, request, requestRevision).finally(() => {
      this.inFlight.delete(inFlightKey);
    });

    this.inFlight.set(inFlightKey, translationPromise);

    const outcome = await translationPromise;
    return this.toDetailedResult(request, outcome);
  }

  async translateBatch(
    texts: string[],
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<string[]> {
    this.requireInitialized();

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

  async setOverride(input: OverrideUpsertInput): Promise<void> {
    const repository = this.requireRepository();

    const key = this.resolveRepositoryKey(input);
    if (typeof input.overrideText !== "string" || !input.overrideText.trim()) {
      throw new Error("overrideText must be a non-empty string");
    }

    await repository.upsertOverride({
      ...key,
      overrideText: input.overrideText,
      updatedBy: input.updatedBy,
    });

    this.overrideRevision += 1;
    const cacheKey = this.createCacheKeyFromLookup(key);
    const outcome: TranslationOutcome = {
      translatedText: input.overrideText,
      origin: "override",
      fromOverride: true,
      fromStored: false,
      fromFallback: false,
    };
    this.setCacheValue(cacheKey, outcome, this.overrideRevision);
    await this.setDistributedCacheValue(
      cacheKey,
      outcome,
      input.sourceText,
      key.targetLang,
      this.overrideRevision,
    );
  }

  async getOverride(query: OverrideQuery): Promise<string | undefined> {
    const repository = this.requireRepository();
    const key = this.resolveRepositoryKey(query);

    const record = await repository.getOverride(key);
    return record?.overrideText;
  }

  async deleteOverride(query: OverrideQuery): Promise<boolean> {
    const repository = this.requireRepository();
    const key = this.resolveRepositoryKey(query);

    const deleted = await repository.deleteOverride(key);
    if (deleted) {
      this.overrideRevision += 1;
      const cacheKey = this.createCacheKeyFromLookup(key);
      this.cache.delete(cacheKey);
      await this.deleteDistributedCacheValue(cacheKey, key.sourceText, key.targetLang);
    }

    return deleted;
  }

  async listOverrides(filter: ListOverridesFilter = {}): Promise<OverrideRecord[]> {
    const repository = this.requireRepository();
    const tenantKey = this.resolveTenantKey(filter.tenantId);

    const normalizedTarget = filter.targetLang
      ? normalizeLanguageCode(filter.targetLang, "targetLang")
      : undefined;

    const records = await repository.listOverrides({
      tenantKey,
      targetLang: normalizedTarget,
      limit: filter.limit,
      offset: filter.offset,
    });

    return records.map((record) => this.mapOverrideRecord(record));
  }

  private async resolveTranslation(
    cacheKey: string,
    request: ResolvedTranslationRequest,
    requestRevision: number,
  ): Promise<TranslationOutcome> {
    const repository = this.requireRepository();
    const lookup = this.toRepositoryLookup(request);

    const distributed = await this.getDistributedCacheValue(
      cacheKey,
      request.sourceText,
      request.targetLang,
    );
    if (distributed) {
      const outcome: TranslationOutcome = {
        translatedText: distributed.text,
        origin: "distributed_cache",
        fromOverride: Boolean(distributed.fromOverride),
        fromStored: Boolean(distributed.fromStored),
        fromFallback: Boolean(distributed.fromFallback),
      };
      this.setCacheValue(cacheKey, outcome, requestRevision);
      return outcome;
    }

    const override = await this.safeGetOverride(repository, lookup, request);
    if (override) {
      const outcome: TranslationOutcome = {
        translatedText: override.overrideText,
        origin: "override",
        fromOverride: true,
        fromStored: false,
        fromFallback: false,
      };
      this.setCacheValue(cacheKey, outcome, requestRevision);
      await this.setDistributedCacheValue(
        cacheKey,
        outcome,
        request.sourceText,
        request.targetLang,
        requestRevision,
      );
      return outcome;
    }

    const stored = await this.safeGetStoredTranslation(repository, lookup, request);
    if (stored) {
      const outcome: TranslationOutcome = {
        translatedText: stored.translatedText,
        origin: "stored",
        fromOverride: false,
        fromStored: true,
        fromFallback: false,
      };
      this.setCacheValue(cacheKey, outcome, requestRevision);
      await this.setDistributedCacheValue(
        cacheKey,
        outcome,
        request.sourceText,
        request.targetLang,
        requestRevision,
      );
      return outcome;
    }

    try {
      const translated = await this.provider.translate(
        request.sourceText,
        request.sourceLang,
        request.targetLang,
        {
          timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          preserveFormatting: request.preserveFormatting ?? true,
          context: request.context,
        },
      );

      const outcome: TranslationOutcome = {
        translatedText: translated,
        origin: "provider",
        fromOverride: false,
        fromStored: false,
        fromFallback: false,
      };
      this.setCacheValue(cacheKey, outcome, requestRevision);
      await this.setDistributedCacheValue(
        cacheKey,
        outcome,
        request.sourceText,
        request.targetLang,
        requestRevision,
      );

      try {
        await repository.upsertTranslation({
          ...lookup,
          translatedText: translated,
          model: this.modelName,
        });
      } catch (error) {
        this.reportError(error, request.sourceText, request.targetLang);
      }

      return outcome;
    } catch (error) {
      this.reportError(error, request.sourceText, request.targetLang);
      return {
        translatedText: request.sourceText,
        origin: "fallback",
        fromOverride: false,
        fromStored: false,
        fromFallback: true,
      };
    }
  }

  private async safeGetOverride(
    repository: TranslationRepository,
    lookup: RepositoryLookupKey,
    request: ResolvedTranslationRequest,
  ): Promise<RepositoryOverrideRecord | undefined> {
    try {
      return await repository.getOverride(lookup);
    } catch (error) {
      this.reportError(error, request.sourceText, request.targetLang);
      return undefined;
    }
  }

  private async safeGetStoredTranslation(
    repository: TranslationRepository,
    lookup: RepositoryLookupKey,
    request: ResolvedTranslationRequest,
  ): Promise<{ translatedText: string } | undefined> {
    try {
      return await repository.getTranslation(lookup);
    } catch (error) {
      this.reportError(error, request.sourceText, request.targetLang);
      return undefined;
    }
  }

  private resolveTranslationRequest(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): ResolvedTranslationRequest {
    const sourceLang = normalizeLanguageCode(
      options?.sourceLang ?? this.defaultSourceLang,
      "sourceLang",
    );
    const normalizedTargetLang = normalizeLanguageCode(targetLang, "targetLang");

    assertSupportedLanguage(sourceLang, this.supportedLanguages, "source language");
    assertSupportedLanguage(normalizedTargetLang, this.supportedLanguages, "target language");

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive number");
    }

    return {
      sourceText: text,
      sourceLang,
      targetLang: normalizedTargetLang,
      timeoutMs,
      preserveFormatting: options?.preserveFormatting ?? true,
      context: options?.context?.trim() ?? "",
      tenantId: options?.tenantId,
      tenantKey: this.resolveTenantKey(options?.tenantId),
    };
  }

  private resolveRepositoryKey(input: OverrideKeyInput): RepositoryLookupKey {
    if (typeof input.sourceText !== "string" || !input.sourceText.length) {
      throw new Error("sourceText must be a non-empty string");
    }

    const sourceLang = normalizeLanguageCode(
      input.sourceLang ?? this.defaultSourceLang,
      "sourceLang",
    );
    const targetLang = normalizeLanguageCode(input.targetLang, "targetLang");

    assertSupportedLanguage(sourceLang, this.supportedLanguages, "source language");
    assertSupportedLanguage(targetLang, this.supportedLanguages, "target language");

    return {
      tenantKey: this.resolveTenantKey(input.tenantId),
      sourceLang,
      targetLang,
      sourceText: input.sourceText,
      contextKey: input.context?.trim() ?? "",
    };
  }

  private resolveTenantKey(tenantId?: string): string {
    const context = this.requireContext();
    const tenancy = context.database.tenancy;

    if (!tenancy.enabled) {
      return tenancy.defaultTenantId;
    }

    const normalized = tenantId?.trim();
    if (normalized) {
      return normalized;
    }

    if (tenancy.requireTenantId) {
      throw new Error("tenantId is required when tenancy.requireTenantId is enabled");
    }

    return tenancy.defaultTenantId;
  }

  private createCacheKey(request: ResolvedTranslationRequest): string {
    return hashKey(
      `${request.tenantKey}|${request.sourceLang}|${request.targetLang}|${request.context}|${request.sourceText}`,
    );
  }

  private createCacheKeyFromLookup(lookup: RepositoryLookupKey): string {
    return hashKey(
      `${lookup.tenantKey}|${lookup.sourceLang}|${lookup.targetLang}|${lookup.contextKey}|${lookup.sourceText}`,
    );
  }

  private createInFlightKey(cacheKey: string, requestRevision: number): string {
    return `${cacheKey}:${requestRevision}`;
  }

  private toRepositoryLookup(request: ResolvedTranslationRequest): RepositoryLookupKey {
    return {
      tenantKey: request.tenantKey,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      sourceText: request.sourceText,
      contextKey: request.context,
    };
  }

  private mapOverrideRecord(record: RepositoryOverrideRecord): OverrideRecord {
    return {
      id: record.id,
      tenantId: record.tenantKey,
      sourceLang: record.sourceLang,
      targetLang: record.targetLang,
      sourceText: record.sourceText,
      context: record.contextKey,
      overrideText: record.overrideText,
      updatedBy: record.updatedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private requireInitialized(): void {
    if (!this.context || !this.repository) {
      throw new Error("Server translator is not initialized. Call init() first.");
    }
  }

  private requireContext(): ResolvedServerContext {
    this.requireInitialized();
    return this.context!;
  }

  private requireRepository(): TranslationRepository {
    this.requireInitialized();
    return this.repository!;
  }

  private setCacheValue(cacheKey: string, outcome: TranslationOutcome, requestRevision: number): void {
    if (requestRevision !== this.overrideRevision) {
      return;
    }

    this.cache.set(cacheKey, {
      translatedText: outcome.translatedText,
      origin: outcome.origin,
      fromOverride: outcome.fromOverride,
      fromStored: outcome.fromStored,
      fromFallback: outcome.fromFallback,
      overrideRevision: requestRevision,
    });
  }

  private async getDistributedCacheValue(
    cacheKey: string,
    text: string,
    targetLang: string,
  ): Promise<DistributedTranslationCacheEntry | undefined> {
    if (!this.distributedCache) {
      return undefined;
    }

    try {
      return await this.distributedCache.get(cacheKey);
    } catch (error) {
      this.reportCacheError(error, {
        key: cacheKey,
        operation: "get",
        cacheLayer: "distributed",
        text,
        targetLang,
      });
      return undefined;
    }
  }

  private async setDistributedCacheValue(
    cacheKey: string,
    outcome: TranslationOutcome,
    text: string,
    targetLang: string,
    requestRevision: number,
  ): Promise<void> {
    if (!this.distributedCache) {
      return;
    }

    if (requestRevision !== this.overrideRevision) {
      return;
    }

    if (outcome.fromFallback) {
      return;
    }

    try {
      await this.distributedCache.set(cacheKey, {
        text: outcome.translatedText,
        fromOverride: outcome.fromOverride,
        fromStored: outcome.fromStored,
        fromFallback: outcome.fromFallback,
      });
    } catch (error) {
      this.reportCacheError(error, {
        key: cacheKey,
        operation: "set",
        cacheLayer: "distributed",
        text,
        targetLang,
      });
    }
  }

  private async deleteDistributedCacheValue(
    cacheKey: string,
    text: string,
    targetLang: string,
  ): Promise<void> {
    if (!this.distributedCache?.delete) {
      return;
    }

    try {
      await this.distributedCache.delete(cacheKey);
    } catch (error) {
      this.reportCacheError(error, {
        key: cacheKey,
        operation: "delete",
        cacheLayer: "distributed",
        text,
        targetLang,
      });
    }
  }

  private toDetailedResult(
    request: ResolvedTranslationRequest,
    outcome: TranslationOutcome,
  ): ServerTranslationResult {
    return {
      sourceText: request.sourceText,
      translatedText: outcome.translatedText,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      context: request.context,
      tenantId: request.tenantKey,
      origin: outcome.origin,
      fromOverride: outcome.fromOverride,
      fromStored: outcome.fromStored,
      fromFallback: outcome.fromFallback,
    };
  }

  private reportCacheError(
    error: unknown,
    meta: NonNullable<Parameters<NonNullable<ServerTranslatorConfig["onCacheError"]>>[1]>,
  ): void {
    if (this.onCacheError) {
      this.onCacheError(asError(error), meta);
    }
  }

  private reportError(error: unknown, text: string, targetLang: string): void {
    if (this.onError) {
      this.onError(asError(error), { text, targetLang });
    }
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
