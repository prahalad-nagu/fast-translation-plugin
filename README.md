# Fast Translation Plugin

Production-ready TypeScript translation platform for UI microcopy.

This package supports:
- backend translation with OpenAI
- client translation with safe backend-provider pattern
- SQL persistence for server-side translated content
- user override management
- tenant-aware lookup keys
- multi-layer caching (memory, browser persistent cache, Redis distributed cache)

---

## Table of Contents

1. What this package is
2. Architecture modes
3. Installation
4. Quick starts
5. Core concepts and behavior
6. API reference
7. Database model and read/write flow
8. Caching model
9. Production deployment guidance
10. Framework integration notes
11. Migrations
12. Pricing
13. Validation and troubleshooting

---

## 1) What This Package Is

This package is a translation engine for short product text, for example:
- `Login`
- `SignUp`
- `Please change the password`
- `Waiting for approval`

It is designed to ensure UI text rendering does not break:
- on provider failure, translation falls back to source text
- manual overrides take precedence
- repeated text requests are deduplicated and cached

---

## 2) Architecture Modes

Use the mode that matches your runtime.

### Mode A: Server scalable mode (recommended for production)
- Factory: `createServerTranslator(config)`
- Best for: NestJS services, Node APIs, centralized translation service
- Features: SQL persistence, overrides CRUD, tenancy, Redis distributed cache, detailed metadata

### Mode B: Standard translator mode
- Factory: `createTranslator(config)`
- Best for: backend scripts or lightweight translation runtime
- Features: OpenAI provider, in-memory cache, optional browser persistent cache support

### Mode C: Client with backend provider (recommended for frontend)
- Class: `new TranslatorService(customProvider, config)`
- Best for: browser apps (React/Vite/Next client-side)
- Features: IndexedDB/localStorage caching, request through your backend endpoint
- Security: API keys stay on server

### Mode D: Client-only OpenAI (POC only, risky)
- Factory: `createTranslator({ dangerouslyAllowBrowser: true, ... })`
- Warning: exposes OpenAI API key in browser

---

## 3) Installation

This repository is private and intended for git-based install.

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#main
```

Install by tag:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#v0.1.0
```

Optional runtime peer dependencies:
- `pg` (Postgres)
- `mysql2` (MySQL)
- `sqlite3` (SQLite)
- `redis` (distributed cache)
- `react` (for `/react` entrypoint)

---

## 4) Quick Starts

## 4.1 Server scalable mode (Postgres + Redis + prod-safe config)

```ts
import {
  createRedisDistributedCache,
  createServerTranslator,
} from "@prahalad-nagu/fast-translation-plugin";

const distributedCache = createRedisDistributedCache({
  url: process.env.REDIS_URL!,
  ttlSeconds: 24 * 60 * 60,
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
    autoCreateTables: false, // use migrations in prod
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
      enabled: true,
      requireTenantId: false,
      defaultTenantId: "__global__",
    },
  },
});

await translator.init();

const detailed = await translator.translateTextDetailed("Login", "es", {
  sourceLang: "en",
  context: "auth-button",
  tenantId: "tenant-a",
});

console.log(detailed.translatedText, detailed.origin);

await translator.setOverride({
  sourceText: "Login",
  sourceLang: "en",
  targetLang: "es",
  context: "auth-button",
  tenantId: "tenant-a",
  overrideText: "Acceder",
  updatedBy: "admin@acme.com",
});

await translator.close();
```

## 4.2 Client with backend provider (recommended frontend pattern)

```ts
import {
  TranslatorService,
  createIndexedDBPersistentCache,
  type TranslationProvider,
} from "@prahalad-nagu/fast-translation-plugin";

const provider: TranslationProvider = {
  async translate(text, sourceLang, targetLang, options) {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
        context: options.context,
      }),
    });
    const body = await res.json();
    return body.translatedText;
  },
};

export const translator = new TranslatorService(provider, {
  defaultSourceLang: "en",
  persistentCache: createIndexedDBPersistentCache(),
  cacheTtlMs: 24 * 60 * 60 * 1000,
  maxCacheSize: 5000,
});
```

## 4.3 React usage (`@.../react`)

```ts
import { createRoot } from "react-dom/client";
import {
  TranslatorService,
  createIndexedDBPersistentCache,
} from "@prahalad-nagu/fast-translation-plugin";
import {
  TranslationProvider,
  useTranslation,
} from "@prahalad-nagu/fast-translation-plugin/react";

const translator = new TranslatorService(
  {
    async translate(text, sourceLang, targetLang, options) {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceLang, targetLang, context: options.context }),
      });
      const body = await res.json();
      return body.translatedText;
    },
  },
  { persistentCache: createIndexedDBPersistentCache() },
);

function LoginButton() {
  const { language, setLanguage, translateText } = useTranslation();
  return (
    <>
      <button onClick={() => setLanguage("es")}>ES</button>
      <button onClick={() => setLanguage("fr")}>FR</button>
      <button
        onClick={async () => {
          const label = await translateText("Login");
          console.log(language, label);
        }}
      >
        Translate
      </button>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <TranslationProvider translator={translator} initialLanguage="en" defaultSourceLang="en">
    <LoginButton />
  </TranslationProvider>,
);
```

## 4.4 Standard OpenAI mode

```ts
import { createTranslator } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  onUsage: (usage) => console.log(usage),
});

const text = await translator.translateText("Waiting for approval", "fr");
```

---

## 5) Core Concepts and Behavior

### Translation lookup priority (server mode)

For each request:
1. normalize language, context, tenant
2. check memory cache
3. check distributed cache (if enabled)
4. query `translation_overrides`
5. query `translation_records`
6. call AI provider
7. persist AI result into `translation_records`
8. return translated text

Failure behavior:
- if provider fails, return source text
- trigger `onError`

### Translation origins (`TranslationResult.origin`)

Possible origin values:
- `memory_cache`
- `persistent_cache`
- `distributed_cache`
- `override`
- `stored`
- `provider`
- `same_language`
- `fallback`

### Language normalization

Default supported languages:
- `en, es, fr, de, pt, it, hi, ja, ko, ar, zh`

Aliases are normalized (examples):
- `Spanish` -> `es`
- `French` -> `fr`

If unsupported, request throws validation error.

### Batching and dedupe

`translateBatch`:
- preserves input order
- deduplicates repeated input strings in same call
- reuses cache/in-flight work

---

## 6) API Reference

## 6.1 Factories and exports

Main exports:
- `createTranslator(config)`
- `createServerTranslator(config)`
- `TranslatorService`
- `ServerTranslatorService`
- `OpenAITranslationProvider`
- `createIndexedDBPersistentCache(...)`
- `createLocalStoragePersistentCache(...)`
- `createRedisDistributedCache(...)`

React exports:
- `@prahalad-nagu/fast-translation-plugin/react`
- `TranslationProvider`
- `useTranslation` / `useTranslate`

## 6.2 `Translator` interface

Methods:
- `translateText(text, targetLang, options?) => Promise<string>`
- `translateTextDetailed(text, targetLang, options?) => Promise<TranslationResult>`
- `translateBatch(texts, targetLang, options?) => Promise<string[]>`

## 6.3 `TranslateOptions`

- `sourceLang?: LanguageCode` (default `en`)
- `timeoutMs?: number` (default `4000`)
- `preserveFormatting?: boolean` (default `true`)
- `context?: string`
- `tenantId?: string` (server mode)

## 6.4 `TranslatorConfig` (`createTranslator`)

- `apiKey: string`
- `model?: string` (default `gpt-4o-mini`)
- `dangerouslyAllowBrowser?: boolean`
- `defaultSourceLang?: LanguageCode`
- `cacheTtlMs?: number` (default `24h`)
- `maxCacheSize?: number` (default `5000`)
- `supportedLanguages?: LanguageCode[]`
- `persistentCache?: PersistentTranslationCache`
- `onError?: (err, { text, targetLang }) => void`
- `onCacheError?: (err, { key, operation, cacheLayer, text, targetLang }) => void`
- `onUsage?: (usage) => void`

## 6.5 `ServerTranslatorConfig` (`createServerTranslator`)

Top-level:
- `apiKey?: string` (required unless custom `provider` is used)
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
- `database: ServerDatabaseConfig`

`ServerDatabaseConfig`:
- `type: "postgres" | "mysql" | "sqlite"`
- `connectionString?: string` (required if `client` not provided)
- `client?: Knex` (recommended in mature app architecture)
- `autoCreateTables?: boolean` (default `false`)
- `tableNames?: { translations?: string; overrides?: string }`
- `tenancy?: { enabled?: boolean; requireTenantId?: boolean; defaultTenantId?: string }`
- `pool?: { min?: number; max?: number; acquireTimeoutMillis?: number; idleTimeoutMillis?: number }`

Production safeguard:
- if `environment = "prod"` and `autoCreateTables = true`, `init()` throws

## 6.6 `ServerTranslator` additional methods

- `init(): Promise<void>`
- `close(): Promise<void>`
- `setOverride(input): Promise<void>`
- `getOverride(query): Promise<string | undefined>`
- `deleteOverride(query): Promise<boolean>`
- `listOverrides(filter?): Promise<OverrideRecord[]>`

---

## 7) Database Model and Read/Write Flow

## 7.1 Tables

### `translation_records`
- stores provider-generated translations
- columns include:
  - `tenant_key`
  - `source_lang`
  - `target_lang`
  - `source_text`
  - `context_key`
  - `translated_text`
  - `model`
  - timestamps
- unique composite key:
  - `(tenant_key, source_lang, target_lang, source_text, context_key)`

### `translation_overrides`
- stores manual override text
- columns include:
  - same key columns
  - `override_text`
  - `updated_by`
  - timestamps
- same composite unique key

## 7.2 How reads happen

For `translateText(...)` in server mode:
- key is built from tenant + source lang + target lang + source text + context
- query override table first
- then query stored translation table
- then provider on miss

## 7.3 How writes happen

- provider success:
  - upsert row in `translation_records`
  - populate cache layers
- override set:
  - upsert row in `translation_overrides`
  - immediately update/invalidate cache key
- override delete:
  - delete row from `translation_overrides`
  - invalidate cache key

## 7.4 Tenancy behavior

Defaults:
- single-tenant
- tenant key defaults to `__global__`

When enabled:
- pass `tenantId` in translate options and override keys
- if `requireTenantId = true`, missing tenant ID throws

## 7.5 Important DB constraint note

This package does not create databases.
- it only creates/checks tables when `autoCreateTables = true`
- for production, use migrations and keep `autoCreateTables = false`

---

## 8) Caching Model

Layer 1: in-memory LRU+TTL
- fastest cache
- per-process

Layer 2: client persistent cache (optional)
- `createIndexedDBPersistentCache`
- `createLocalStoragePersistentCache`

Layer 3: distributed cache (optional, server)
- `createRedisDistributedCache`
- helps multi-instance deployments share cache

Cache error handling:
- cache failures never break translation response
- use `onCacheError` for observability

---

## 9) Production Deployment Guidance

### Security

- keep `OPENAI_API_KEY` server-only
- avoid `dangerouslyAllowBrowser` in production
- prefer client -> backend translation endpoint pattern

### DB and schema

- use migration pipeline (CI/CD) for schema rollout
- prefer injected DB client from host framework when possible
- tune connection pool based on workload

### Lifecycle

- call `await translator.init()` once during service startup
- call `await translator.close()` on graceful shutdown

### Observability

- wire `onError` and `onCacheError`
- wire `onUsage` for token/cost tracking
- log origin from `translateTextDetailed` in API layer

---

## 10) Framework Integration Notes

## 10.1 NestJS

Recommended pattern:
- create one singleton `ServerTranslator` provider
- initialize in `onModuleInit`
- close in `onModuleDestroy`
- expose app endpoints (`/v1/translate`, `/v1/overrides`) in controllers

## 10.2 Django / FastAPI

Recommended pattern:
- run this package as internal Node translation service
- Python services call that API (REST/OpenAPI client)
- keep translation persistence centralized

---

## 11) Migrations

Use provided SQL scaffolding:
- `migrations/postgres/0001_translation_tables.sql`
- `migrations/mysql/0001_translation_tables.sql`
- `migrations/sqlite/0001_translation_tables.sql`

Migration reference:
- `migrations/README.md`

---

## 12) Pricing

OpenAI pricing is token-based and can change.

Verified on **February 27, 2026** for `gpt-4o-mini`:
- input: `$0.15 / 1M tokens`
- cached input: `$0.075 / 1M tokens`
- output: `$0.60 / 1M tokens`

Source:
- https://platform.openai.com/pricing

---

## 13) Validation and Troubleshooting

## 13.1 Local validation

```bash
npm install
npm test
npm run build
```

Smoke test:

```bash
OPENAI_API_KEY=your_key npm run smoke -- es "Login" "SignUp"
```

Optional smoke script cost estimation envs:

```bash
OPENAI_PRICE_INPUT_PER_1M=0.15
OPENAI_PRICE_OUTPUT_PER_1M=0.60
OPENAI_CREDIT_BUDGET_USD=20
```

## 13.2 Common issues

1. Browser OpenAI runtime error
- reason: OpenAI SDK blocks browser key usage by default
- fix: use backend provider pattern, or set `dangerouslyAllowBrowser: true` only for POC

2. `node:crypto` externalized in Vite
- fix: use latest package build (hashing is browser-safe in current version)

3. Git tag install fails (`pathspec did not match`)
- fix: ensure tag exists on remote and is pushed

4. `tenantId is required` errors
- reason: `tenancy.requireTenantId = true`
- fix: pass `tenantId` in translate/override calls

---

## Roadmap Note

- MongoDB support is intentionally deferred and not included in current server mode.
