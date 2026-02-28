import type { Knex } from "knex";

import { DEFAULT_TENANT_KEY } from "../types.js";

const KEY_COLUMNS = [
  "tenant_key",
  "source_lang",
  "target_lang",
  "source_text",
  "context_key",
] as const;

export async function ensureServerSchema(
  client: Knex,
  tableNames: { translations: string; overrides: string },
): Promise<void> {
  if (!(await client.schema.hasTable(tableNames.translations))) {
    await client.schema.createTable(tableNames.translations, (table) => {
      table.bigIncrements("id").primary();
      table.string("tenant_key", 191).notNullable().defaultTo(DEFAULT_TENANT_KEY);
      table.string("source_lang", 16).notNullable();
      table.string("target_lang", 16).notNullable();
      table.string("source_text", 512).notNullable();
      table.string("context_key", 255).notNullable().defaultTo("");
      table.text("translated_text").notNullable();
      table.string("model", 120).nullable();
      table.timestamp("created_at").notNullable().defaultTo(client.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(client.fn.now());
      table.unique([...KEY_COLUMNS]);
      table.index(["tenant_key", "target_lang"]);
    });
  }

  if (!(await client.schema.hasTable(tableNames.overrides))) {
    await client.schema.createTable(tableNames.overrides, (table) => {
      table.bigIncrements("id").primary();
      table.string("tenant_key", 191).notNullable().defaultTo(DEFAULT_TENANT_KEY);
      table.string("source_lang", 16).notNullable();
      table.string("target_lang", 16).notNullable();
      table.string("source_text", 512).notNullable();
      table.string("context_key", 255).notNullable().defaultTo("");
      table.text("override_text").notNullable();
      table.string("updated_by", 191).nullable();
      table.timestamp("created_at").notNullable().defaultTo(client.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(client.fn.now());
      table.unique([...KEY_COLUMNS]);
      table.index(["tenant_key", "target_lang"]);
    });
  }
}
