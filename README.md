# Fast Translation Plugin

A TypeScript translation package for UI microcopy with:
- OpenAI translation provider
- in-memory cache + optional persistent cache
- new scalable server mode with SQL persistence and user override management
- production-safe server defaults + migration scaffolding

## Highlights

- `translateText("Login", "es")`
- `translateTextDetailed("Login", "es")` with origin/fallback metadata
- `translateBatch(["Login", "SignUp"], "es")`
- Built-in OpenAI provider (`createTranslator`)
- Scalable server translator with DB persistence (`createServerTranslator`)
- Override CRUD for user-managed renamed translations
- Optional tenant-aware server mode
- Optional Redis distributed cache for multi-instance deployments
- IndexedDB/localStorage adapters for client caching

## Installation

This repo is private and intended for Git install.

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#main
```

Tagged install:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#v0.1.0
```

## Exports

- `createTranslator(config)`
- `createServerTranslator(config)`
- `TranslatorService`
- `ServerTranslatorService`
- `OpenAITranslationProvider`
- `createRedisDistributedCache(...)`
- `createIndexedDBPersistentCache(...)`
- `createLocalStoragePersistentCache(...)`

Types:

- `TranslatorConfig`, `ServerTranslatorConfig`
- `Translator`, `ServerTranslator`
- `TranslateOptions`, `TranslationResult`, `ServerTranslationResult`
- `OverrideUpsertInput`, `OverrideQuery`, `OverrideRecord`, `ListOverridesFilter`
- `PersistentTranslationCache`, `DistributedTranslationCache`, `TranslationUsage`, `TranslationCacheErrorMeta`

## 1) Scalable Server Mode (Recommended for production)

Use `createServerTranslator(...)` for DB-backed translation + override CRUD.

```ts
import {
  createRedisDistributedCache,
  createServerTranslator,
} from "@prahalad-nagu/fast-translation-plugin";

const distributedCache = createRedisDistributedCache({
  url: process.env.REDIS_URL!,
  ttlSeconds: 86400,
});

const translator = createServerTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  environment: "prod",
  distributedCache,
  closeDistributedCacheOnShutdown: true,
  database: {
    type: "postgres",
    connectionString: process.env.DATABASE_URL!,
    autoCreateTables: false,
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    tableNames: {
      translations: "translation_records",
      overrides: "translation_overrides",
    },
    tenancy: {
      enabled: false,
      requireTenantId: false,
      defaultTenantId: "__global__",
    },
  },
});

await translator.init();

const detailed = await translator.translateTextDetailed("Login", "es");
console.log(detailed.origin, detailed.fromFallback);

await translator.setOverride({
  sourceText: "Login",
  targetLang: "es",
  overrideText: "Acceder",
  updatedBy: "admin@acme",
});

const effective = await translator.translateText("Login", "es"); // "Acceder"

await translator.close();
```

### Server lookup order

For each server translation request:

1. Normalize input + tenant key
2. Check memory cache
3. Check distributed cache (if configured)
4. Check overrides table
5. Check translations table
6. Call AI provider on miss
7. Persist translation row
8. Return translation

If AI/provider fails, it returns source text and calls `onError`.

Note: this package does **not** create databases (`CREATE DATABASE`). It only checks/creates tables in an existing database during `init()`.

### Override CRUD methods

`ServerTranslator` adds:

- `init(): Promise<void>`
- `close(): Promise<void>`
- `setOverride(input)`
- `getOverride(query)`
- `deleteOverride(query)`
- `listOverrides(filter?)`

### Tenancy behavior

Defaults are single-tenant:

- `tenancy.enabled: false`
- tenant key defaults to `"__global__"`

If `tenancy.enabled: true`:

- provide `tenantId` in `TranslateOptions` / override inputs
- if `requireTenantId: true`, missing tenantId throws

## 2) Standard OpenAI Mode (existing behavior)

`createTranslator(...)` keeps current behavior and is useful for non-DB flows.

```ts
import { createTranslator } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  onUsage: (usage) => console.log(usage),
});

const text = await translator.translateText("Waiting for approval", "fr");
```

## 3) Client with backend endpoint (recommended client architecture)

Use `TranslatorService` with a custom provider that calls your backend `/api/translate`.

```ts
import {
  TranslatorService,
  createIndexedDBPersistentCache,
  type TranslationProvider,
} from "@prahalad-nagu/fast-translation-plugin";

const provider: TranslationProvider = {
  async translate(text, sourceLang, targetLang) {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLang, targetLang }),
    });
    const body = await res.json();
    return body.translatedText;
  },
};

const translator = new TranslatorService(provider, {
  persistentCache: createIndexedDBPersistentCache(),
});
```

## 4) Client-only OpenAI mode (risky)

```ts
const translator = createTranslator({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});
```

Warning: this exposes API keys in browser environments.

## API Reference

## `translateTextDetailed(text, targetLang, options?)`

Returns `TranslationResult` metadata:

- `translatedText`
- `origin`: `memory_cache | persistent_cache | distributed_cache | override | stored | provider | same_language | fallback`
- `fromOverride`
- `fromStored`
- `fromFallback`

## `TranslateOptions`

- `sourceLang?: LanguageCode`
- `targetLang` is method argument
- `timeoutMs?: number` (default `4000`)
- `preserveFormatting?: boolean` (default `true`)
- `context?: string`
- `tenantId?: string` (used in server mode)

## `TranslatorConfig` (`createTranslator`)

- `apiKey: string` (required)
- `model?: string` (default `gpt-4o-mini`)
- `dangerouslyAllowBrowser?: boolean` (default `false`)
- `defaultSourceLang?: LanguageCode`
- `cacheTtlMs?: number`
- `maxCacheSize?: number`
- `supportedLanguages?: LanguageCode[]`
- `persistentCache?: PersistentTranslationCache`
- `onError?: (err, { text, targetLang }) => void`
- `onCacheError?: (err, { key, operation, cacheLayer, text, targetLang }) => void`
- `onUsage?: (usage) => void`

## `ServerTranslatorConfig` (`createServerTranslator`)

Top-level:

- `apiKey?: string` (required unless custom `provider` is supplied)
- `provider?: TranslationProvider`
- `model?: string`
- `dangerouslyAllowBrowser?: boolean`
- `defaultSourceLang?: LanguageCode`
- `cacheTtlMs?: number`
- `maxCacheSize?: number`
- `supportedLanguages?: LanguageCode[]`
- `onError?: (err, { text, targetLang }) => void`
- `onCacheError?: (err, { key, operation, cacheLayer, text, targetLang }) => void`
- `onUsage?: (usage) => void`
- `environment?: "dev" | "prod"` (default `dev`)
- `distributedCache?: DistributedTranslationCache`
- `closeDistributedCacheOnShutdown?: boolean` (default `false`)
- `database: ServerDatabaseConfig` (required)

`ServerDatabaseConfig`:

- `type: "postgres" | "mysql" | "sqlite"`
- `connectionString?: string` (required if `client` not provided)
- `client?: Knex` (existing knex client)
- `autoCreateTables?: boolean` (default `false`)
- `tableNames?: { translations?: string; overrides?: string }`
- `tenancy?: { enabled?: boolean; requireTenantId?: boolean; defaultTenantId?: string }`
- `pool?: { min?: number; max?: number; acquireTimeoutMillis?: number; idleTimeoutMillis?: number }`

Prod safeguard:

- if `environment="prod"` and `autoCreateTables=true`, `init()` throws.
- run DB migrations separately using the scaffolding in `migrations/`.

## Server SQL Schema

When `autoCreateTables=true`, the package ensures two tables exist.

### `translation_records`

- `id` big auto-increment primary key
- `tenant_key` not null, default `__global__`
- `source_lang` not null
- `target_lang` not null
- `source_text` not null
- `context_key` not null, default `""`
- `translated_text` not null
- `model` nullable
- `created_at`, `updated_at`
- unique composite key on: `(tenant_key, source_lang, target_lang, source_text, context_key)`
- index on: `(tenant_key, target_lang)`

### `translation_overrides`

- `id` big auto-increment primary key
- `tenant_key` not null, default `__global__`
- `source_lang` not null
- `target_lang` not null
- `source_text` not null
- `context_key` not null, default `""`
- `override_text` not null
- `updated_by` nullable
- `created_at`, `updated_at`
- unique composite key on: `(tenant_key, source_lang, target_lang, source_text, context_key)`
- index on: `(tenant_key, target_lang)`

## DB Driver Notes

`knex` is included. Runtime DB drivers are optional peers:

- postgres: `pg`
- mysql: `mysql2`
- sqlite: `sqlite3`
- redis (optional distributed cache): `redis`

Install the one your app uses.

## OpenAI Pricing (gpt-4o-mini)

Verified from OpenAI pricing page on **February 27, 2026**:

- Input: **$0.15 / 1M tokens**
- Cached input: **$0.075 / 1M tokens**
- Output: **$0.60 / 1M tokens**

Source:

- https://platform.openai.com/pricing

Pricing may change; always verify the pricing page.

## Migrations (Production)

Use SQL scaffolding:

- `migrations/postgres/0001_translation_tables.sql`
- `migrations/mysql/0001_translation_tables.sql`
- `migrations/sqlite/0001_translation_tables.sql`

Reference guide: `migrations/README.md`

## Local Validation

```bash
npm install
npm test
npm run build
```

Smoke test:

```bash
OPENAI_API_KEY=your_key npm run smoke -- es "Login" "SignUp"
```

Optional cost-estimation vars for smoke script:

```bash
OPENAI_PRICE_INPUT_PER_1M=0.15
OPENAI_PRICE_OUTPUT_PER_1M=0.60
OPENAI_CREDIT_BUDGET_USD=20
```

## Troubleshooting

1. Browser OpenAI error (`running in browser-like environment`)
- set `dangerouslyAllowBrowser: true` for POC, or use backend endpoint.

2. `node:crypto` externalized in Vite
- install latest package version/tag; hashing is browser-safe in current build.

3. Tag install fails (`git reference could not be found`)
- push the tag to remote before install.

## Roadmap Note

- MongoDB is intentionally deferred and not included in v1 server mode.
