import type { Knex } from "knex";

import type {
  DistributedTranslationCache,
  LanguageCode,
  RuntimeEnvironment,
  TranslateOptions,
  TranslationCacheErrorMeta,
  TranslationResult,
  TranslationUsage,
  Translator,
} from "../types.js";
import type { TranslationProvider } from "../providers/base.js";

export type ServerDatabaseType = "postgres" | "mysql" | "sqlite";

export interface ServerTableNames {
  translations?: string;
  overrides?: string;
}

export interface ServerTenancyConfig {
  enabled?: boolean;
  requireTenantId?: boolean;
  defaultTenantId?: string;
}

export interface ServerDatabasePoolConfig {
  min?: number;
  max?: number;
  acquireTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export interface ServerDatabaseConfig {
  type: ServerDatabaseType;
  connectionString?: string;
  client?: Knex;
  autoCreateTables?: boolean;
  tableNames?: ServerTableNames;
  tenancy?: ServerTenancyConfig;
  pool?: ServerDatabasePoolConfig;
}

export interface ServerTranslatorConfig {
  apiKey?: string;
  model?: string;
  dangerouslyAllowBrowser?: boolean;
  provider?: TranslationProvider;
  defaultSourceLang?: LanguageCode;
  cacheTtlMs?: number;
  maxCacheSize?: number;
  supportedLanguages?: LanguageCode[];
  onError?: (err: Error, meta: { text: string; targetLang: string }) => void;
  onCacheError?: (err: Error, meta: TranslationCacheErrorMeta) => void;
  onUsage?: (usage: TranslationUsage) => void;
  environment?: RuntimeEnvironment;
  distributedCache?: DistributedTranslationCache;
  closeDistributedCacheOnShutdown?: boolean;
  database: ServerDatabaseConfig;
}

export interface OverrideKeyInput {
  sourceText: string;
  targetLang: LanguageCode;
  sourceLang?: LanguageCode;
  context?: string;
  tenantId?: string;
}

export interface OverrideUpsertInput extends OverrideKeyInput {
  overrideText: string;
  updatedBy?: string;
}

export type OverrideQuery = OverrideKeyInput;

export interface OverrideRecord {
  id: number;
  tenantId: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  context: string;
  overrideText: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOverridesFilter {
  tenantId?: string;
  targetLang?: LanguageCode;
  limit?: number;
  offset?: number;
}

export interface ServerTranslationResult extends TranslationResult {
  tenantId: string;
}

export interface ServerTranslator extends Translator {
  init(): Promise<void>;
  close(): Promise<void>;
  translateTextDetailed(
    text: string,
    targetLang: LanguageCode,
    options?: TranslateOptions,
  ): Promise<ServerTranslationResult>;
  setOverride(input: OverrideUpsertInput): Promise<void>;
  getOverride(query: OverrideQuery): Promise<string | undefined>;
  deleteOverride(query: OverrideQuery): Promise<boolean>;
  listOverrides(filter?: ListOverridesFilter): Promise<OverrideRecord[]>;
}

export interface ResolvedServerDatabaseConfig {
  type: ServerDatabaseType;
  autoCreateTables: boolean;
  tableNames: Required<ServerTableNames>;
  tenancy: Required<ServerTenancyConfig>;
  pool?: ServerDatabasePoolConfig;
}

export interface ResolvedServerContext {
  client: Knex;
  ownsClient: boolean;
  database: ResolvedServerDatabaseConfig;
}

export interface ResolvedTranslationRequest extends TranslateOptions {
  sourceLang: string;
  targetLang: string;
  context: string;
  tenantKey: string;
  sourceText: string;
}

export const DEFAULT_TRANSLATIONS_TABLE = "translation_records";
export const DEFAULT_OVERRIDES_TABLE = "translation_overrides";
export const DEFAULT_TENANT_KEY = "__global__";
