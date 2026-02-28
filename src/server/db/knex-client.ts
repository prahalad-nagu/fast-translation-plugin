import createKnex, { type Knex } from "knex";
import type { RuntimeEnvironment } from "../../types.js";

import {
  DEFAULT_OVERRIDES_TABLE,
  DEFAULT_TENANT_KEY,
  DEFAULT_TRANSLATIONS_TABLE,
  type ResolvedServerContext,
  type ServerDatabaseConfig,
  type ServerDatabasePoolConfig,
  type ServerDatabaseType,
} from "../types.js";

const KNEX_CLIENT_BY_TYPE: Record<ServerDatabaseType, string> = {
  postgres: "pg",
  mysql: "mysql2",
  sqlite: "sqlite3",
};

export function createServerContext(
  database: ServerDatabaseConfig,
  environment: RuntimeEnvironment,
): ResolvedServerContext {
  const type = database.type;
  if (!type || !KNEX_CLIENT_BY_TYPE[type]) {
    throw new Error(`Unsupported database type: ${String(type)}`);
  }

  const translationsTable = normalizeTableName(
    database.tableNames?.translations,
    DEFAULT_TRANSLATIONS_TABLE,
    "translations table",
  );
  const overridesTable = normalizeTableName(
    database.tableNames?.overrides,
    DEFAULT_OVERRIDES_TABLE,
    "overrides table",
  );

  const requireTenantId = Boolean(database.tenancy?.requireTenantId);
  const enabled = Boolean(database.tenancy?.enabled) || requireTenantId;
  const defaultTenantId = normalizeTenantDefault(database.tenancy?.defaultTenantId);
  const autoCreateTables = database.autoCreateTables ?? false;
  const pool = normalizePool(database.pool);

  if (environment === "prod" && autoCreateTables) {
    throw new Error(
      "database.autoCreateTables=true is not allowed in prod. Run schema migrations separately.",
    );
  }

  const resolvedDatabase = {
    type,
    autoCreateTables,
    tableNames: {
      translations: translationsTable,
      overrides: overridesTable,
    },
    tenancy: {
      enabled,
      requireTenantId,
      defaultTenantId,
    },
    pool,
  };

  if (database.client) {
    return {
      client: database.client,
      ownsClient: false,
      database: resolvedDatabase,
    };
  }

  const connectionString = normalizeConnectionString(database.connectionString);

  const knexConfig: Knex.Config = {
    client: KNEX_CLIENT_BY_TYPE[type],
    connection:
      type === "sqlite"
        ? {
            filename: connectionString,
          }
        : connectionString,
  };
  if (pool) {
    knexConfig.pool = {
      min: pool.min,
      max: pool.max,
      acquireTimeoutMillis: pool.acquireTimeoutMillis,
      idleTimeoutMillis: pool.idleTimeoutMillis,
    };
  }

  if (type === "sqlite") {
    knexConfig.useNullAsDefault = true;
  }

  return {
    client: createKnex(knexConfig),
    ownsClient: true,
    database: resolvedDatabase,
  };
}

function normalizeConnectionString(connectionString: string | undefined): string {
  if (!connectionString || !connectionString.trim()) {
    throw new Error("database.connectionString is required when database.client is not provided");
  }

  return connectionString.trim();
}

function normalizeTableName(value: string | undefined, defaultValue: string, label: string): string {
  if (value === undefined) {
    return defaultValue;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return trimmed;
}

function normalizeTenantDefault(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_TENANT_KEY;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("tenancy.defaultTenantId must be a non-empty string");
  }

  return trimmed;
}

function normalizePool(value: ServerDatabasePoolConfig | undefined): ServerDatabasePoolConfig | undefined {
  if (!value) {
    return undefined;
  }

  const normalized: ServerDatabasePoolConfig = {};

  if (value.min !== undefined) {
    if (!Number.isInteger(value.min) || value.min < 0) {
      throw new Error("database.pool.min must be a non-negative integer");
    }
    normalized.min = value.min;
  }

  if (value.max !== undefined) {
    if (!Number.isInteger(value.max) || value.max <= 0) {
      throw new Error("database.pool.max must be a positive integer");
    }
    normalized.max = value.max;
  }

  if (normalized.min !== undefined && normalized.max !== undefined && normalized.min > normalized.max) {
    throw new Error("database.pool.min cannot be greater than database.pool.max");
  }

  if (value.acquireTimeoutMillis !== undefined) {
    if (!Number.isFinite(value.acquireTimeoutMillis) || value.acquireTimeoutMillis <= 0) {
      throw new Error("database.pool.acquireTimeoutMillis must be a positive number");
    }
    normalized.acquireTimeoutMillis = value.acquireTimeoutMillis;
  }

  if (value.idleTimeoutMillis !== undefined) {
    if (!Number.isFinite(value.idleTimeoutMillis) || value.idleTimeoutMillis <= 0) {
      throw new Error("database.pool.idleTimeoutMillis must be a positive number");
    }
    normalized.idleTimeoutMillis = value.idleTimeoutMillis;
  }

  if (
    normalized.min === undefined &&
    normalized.max === undefined &&
    normalized.acquireTimeoutMillis === undefined &&
    normalized.idleTimeoutMillis === undefined
  ) {
    return undefined;
  }

  return normalized;
}
