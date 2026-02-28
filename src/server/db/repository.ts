import type { Knex } from "knex";

const KEY_COLUMNS = [
  "tenant_key",
  "source_lang",
  "target_lang",
  "source_text",
  "context_key",
] as const;

export interface RepositoryLookupKey {
  tenantKey: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  contextKey: string;
}

export interface TranslationRecordInput extends RepositoryLookupKey {
  translatedText: string;
  model?: string;
}

export interface TranslationRecord {
  id: number;
  tenantKey: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  contextKey: string;
  translatedText: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverrideRecordInput extends RepositoryLookupKey {
  overrideText: string;
  updatedBy?: string;
}

export interface OverrideRecord {
  id: number;
  tenantKey: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  contextKey: string;
  overrideText: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOverrideFilter {
  tenantKey?: string;
  targetLang?: string;
  limit?: number;
  offset?: number;
}

export class TranslationRepository {
  constructor(
    private readonly client: Knex,
    private readonly tableNames: { translations: string; overrides: string },
  ) {}

  async getTranslation(key: RepositoryLookupKey): Promise<TranslationRecord | undefined> {
    const row = await this.client(this.tableNames.translations)
      .where(toDatabaseKey(key))
      .first();

    return row ? mapTranslationRecord(row) : undefined;
  }

  async upsertTranslation(input: TranslationRecordInput): Promise<void> {
    const now = new Date();
    await this.client(this.tableNames.translations)
      .insert({
        ...toDatabaseKey(input),
        translated_text: input.translatedText,
        model: input.model ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict([...KEY_COLUMNS])
      .merge({
        translated_text: input.translatedText,
        model: input.model ?? null,
        updated_at: now,
      });
  }

  async getOverride(key: RepositoryLookupKey): Promise<OverrideRecord | undefined> {
    const row = await this.client(this.tableNames.overrides)
      .where(toDatabaseKey(key))
      .first();

    return row ? mapOverrideRecord(row) : undefined;
  }

  async upsertOverride(input: OverrideRecordInput): Promise<void> {
    const now = new Date();
    await this.client(this.tableNames.overrides)
      .insert({
        ...toDatabaseKey(input),
        override_text: input.overrideText,
        updated_by: input.updatedBy ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict([...KEY_COLUMNS])
      .merge({
        override_text: input.overrideText,
        updated_by: input.updatedBy ?? null,
        updated_at: now,
      });
  }

  async deleteOverride(key: RepositoryLookupKey): Promise<boolean> {
    const deletedCount = await this.client(this.tableNames.overrides)
      .where(toDatabaseKey(key))
      .del();

    return deletedCount > 0;
  }

  async listOverrides(filter: ListOverrideFilter = {}): Promise<OverrideRecord[]> {
    const query = this.client(this.tableNames.overrides).select("*");

    if (filter.tenantKey) {
      query.where("tenant_key", filter.tenantKey);
    }

    if (filter.targetLang) {
      query.where("target_lang", filter.targetLang);
    }

    query.orderBy("updated_at", "desc");

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    query.limit(Math.max(1, limit));
    query.offset(Math.max(0, offset));

    const rows = await query;
    return rows.map((row) => mapOverrideRecord(row));
  }
}

function toDatabaseKey(key: RepositoryLookupKey): {
  tenant_key: string;
  source_lang: string;
  target_lang: string;
  source_text: string;
  context_key: string;
} {
  return {
    tenant_key: key.tenantKey,
    source_lang: key.sourceLang,
    target_lang: key.targetLang,
    source_text: key.sourceText,
    context_key: key.contextKey,
  };
}

function mapTranslationRecord(row: Record<string, unknown>): TranslationRecord {
  return {
    id: Number(row.id),
    tenantKey: String(row.tenant_key),
    sourceLang: String(row.source_lang),
    targetLang: String(row.target_lang),
    sourceText: String(row.source_text),
    contextKey: String(row.context_key ?? ""),
    translatedText: String(row.translated_text),
    model: row.model == null ? undefined : String(row.model),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapOverrideRecord(row: Record<string, unknown>): OverrideRecord {
  return {
    id: Number(row.id),
    tenantKey: String(row.tenant_key),
    sourceLang: String(row.source_lang),
    targetLang: String(row.target_lang),
    sourceText: String(row.source_text),
    contextKey: String(row.context_key ?? ""),
    overrideText: String(row.override_text),
    updatedBy: row.updated_by == null ? undefined : String(row.updated_by),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toISOString();
}
