# Fast Translation Plugin (POC)

A TypeScript translation plugin for short UI text with OpenAI, in-memory caching, optional persistent browser cache, and fallback-safe behavior.

## What This Package Solves

- Translate short UI text like `"Login"`, `"SignUp"`, and status messages.
- Reuse translations using cache to reduce API calls and cost.
- Support both:
  - server-side OpenAI usage (`createTranslator`)
  - client-side custom provider usage (`TranslatorService` + your API)
- Optional client-side persistent cache (IndexedDB/localStorage).

## Features

- `translateText("Login", "es")`
- `translateBatch(["Login", "SignUp"], "es")`
- OpenAI-backed provider with timeout and formatting-preservation prompt
- In-memory LRU + TTL cache
- Optional persistent cache adapter (`IndexedDB`, `localStorage`, or custom)
- In-flight deduplication for concurrent identical requests
- Language alias normalization (`"Spanish" -> "es"`)
- Safe fallback to original text when translation fails
- Token usage callback (`onUsage`) and cache error callback (`onCacheError`)

## Installation

This repository is configured as private and intended for Git-based install.

Install latest from main:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#main
```

Install a tagged version:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#v0.1.0
```

Install from local path:

```bash
npm install /Users/prahaladyr/Desktop/Codespace/language-translation
```

## Exported API

### Main

- `createTranslator(config: TranslatorConfig): Translator`
- `TranslatorService`
- `OpenAITranslationProvider`

### Cache Adapters

- `createIndexedDBPersistentCache(options?)`
- `createLocalStoragePersistentCache(options?)`

### Types

- `TranslatorConfig`
- `Translator`
- `TranslateOptions`
- `TranslationProvider`
- `TranslationUsage`
- `PersistentTranslationCache`
- `TranslationCacheErrorMeta`
- `LanguageCode`

## Core Types

### `TranslatorConfig`

- `apiKey: string` (required)
- `model?: string` (default: `"gpt-4o-mini"`)
- `dangerouslyAllowBrowser?: boolean` (default: `false`)
- `defaultSourceLang?: LanguageCode` (default: `"en"`)
- `cacheTtlMs?: number` (default: `86400000` / 24h)
- `maxCacheSize?: number` (default: `5000`)
- `supportedLanguages?: LanguageCode[]`
- `persistentCache?: PersistentTranslationCache`
- `onError?: (err, { text, targetLang }) => void`
- `onCacheError?: (err, { key, operation, text, targetLang }) => void`
- `onUsage?: (usage) => void`

### `TranslateOptions`

- `sourceLang?: LanguageCode`
- `timeoutMs?: number` (default: `4000`)
- `preserveFormatting?: boolean` (default: `true`)
- `context?: string`

### `TranslationUsage`

- `model`
- `sourceLang`
- `targetLang`
- `promptTokens`
- `completionTokens`
- `totalTokens`

## Supported Language Defaults

Default supported languages:

- `en, es, fr, de, pt, it, hi, ja, ko, ar, zh`

Aliases supported out of the box include names like `English`, `Spanish`, `French`, `Chinese`, etc.

## Usage Patterns

### 1) Server-Side OpenAI (Recommended)

```ts
import { createTranslator } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  onUsage: (usage) => console.log("usage", usage),
  onError: (err, meta) => console.error("translation failed", meta, err.message),
});

const loginEs = await translator.translateText("Login", "es");
const batch = await translator.translateBatch(
  ["Login", "SignUp", "Please change the password"],
  "fr",
);
```

### 2) Client-Only OpenAI (Risky)

This enables direct browser-to-OpenAI usage.

```ts
import { createTranslator, createIndexedDBPersistentCache } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  model: "gpt-4o-mini",
  dangerouslyAllowBrowser: true,
  persistentCache: createIndexedDBPersistentCache(),
});
```

Warning:

- Your API key is exposed to end users/devtools.
- Use only for internal tools or short-lived POCs.
- Prefer a backend proxy in production.

### 3) Client + Backend Translation Endpoint (Best Client Architecture)

Frontend uses `TranslatorService` with a custom provider that calls your backend:

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

    if (!res.ok) {
      throw new Error(`Translation API failed: ${res.status}`);
    }

    const body = (await res.json()) as { translatedText: string };
    return body.translatedText;
  },
};

const translator = new TranslatorService(provider, {
  persistentCache: createIndexedDBPersistentCache({
    dbName: "my-app-translations",
    storeName: "ui-text",
  }),
  onCacheError: (err, meta) => {
    console.warn("cache error", meta, err.message);
  },
});
```

## Caching Behavior (Exact Flow)

For each `translateText` call:

1. Validate input and normalize language codes.
2. Check in-memory LRU cache.
3. If configured, check persistent cache (`persistentCache.get`).
4. If not cached, call provider.
5. Save successful result to:
   - in-memory cache
   - persistent cache (`persistentCache.set`)
6. If provider fails, return original source text.

Additional behavior:

- Concurrent identical requests are deduplicated via in-flight map.
- Batch translation deduplicates repeated text values in the same batch.

## Persistent Cache Adapters

### IndexedDB

```ts
import { createIndexedDBPersistentCache } from "@prahalad-nagu/fast-translation-plugin";

const cache = createIndexedDBPersistentCache({
  dbName: "fast-translation-plugin",
  storeName: "translations",
  version: 1,
});
```

### LocalStorage

```ts
import { createLocalStoragePersistentCache } from "@prahalad-nagu/fast-translation-plugin";

const cache = createLocalStoragePersistentCache({
  keyPrefix: "fast-translation:",
});
```

### Custom Cache Adapter

```ts
import type { PersistentTranslationCache } from "@prahalad-nagu/fast-translation-plugin";

const cache: PersistentTranslationCache = {
  async get(key) {
    return undefined;
  },
  async set(key, value) {
    // store value
  },
};
```

## OpenAI Pricing (For This Plugin)

The default model in this plugin is `gpt-4o-mini`.

From OpenAI pricing page (verified on **February 27, 2026**):

- Input: **$0.15 / 1M tokens**
- Cached input: **$0.075 / 1M tokens**
- Output: **$0.60 / 1M tokens**

Source:

- https://platform.openai.com/pricing

Note:

- Pricing can change; always verify on the pricing page.
- Exact remaining account credit is not available from this plugin call flow.
- Use OpenAI Billing dashboard for exact remaining balance.

## Smoke Test Script

A local smoke script exists at `scripts/smoke.ts`.

Run:

```bash
OPENAI_API_KEY=your_key npm run smoke
```

With custom language/texts:

```bash
OPENAI_API_KEY=your_key npm run smoke -- fr "Login" "SignUp"
```

Optional envs for cost estimation in smoke output:

```bash
OPENAI_PRICE_INPUT_PER_1M=0.15
OPENAI_PRICE_OUTPUT_PER_1M=0.60
OPENAI_CREDIT_BUDGET_USD=20
```

## Error Handling and Fallbacks

- Provider failure: returns original text and triggers `onError`.
- Persistent cache read/write failure: translation continues and triggers `onCacheError`.
- Invalid language code: throws explicit validation error.

## Common Troubleshooting

### 1) Browser error: `OpenAIError: running in a browser-like environment`

Cause: OpenAI client used in browser without browser opt-in.

Fix:

- Set `dangerouslyAllowBrowser: true` (POC only), or
- Use backend endpoint pattern.

### 2) Vite error: `node:crypto has been externalized`

Cause: Old plugin build using Node crypto.

Fix:

- Reinstall latest plugin build/tag.
- Current implementation uses browser-safe hashing.

### 3) Always getting English text back

Cause: Provider call failed and fallback returned source text.

Fix:

- Add `onError` logger to inspect root cause (key, quota, model access, timeout).

### 4) Git tag install error: `git reference could not be found`

Cause: Tag not pushed to remote.

Fix:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

## Security Guidance

- Never commit API keys.
- Keep `.env` out of git.
- Prefer server-side key usage.
- If forced into client-only mode, use restricted/rotated keys and treat as temporary.

## Development

```bash
npm install
npm test
npm run build
```

## Project Scripts

- `npm run build` - compile TypeScript to `dist/`
- `npm test` - run vitest tests
- `npm run test:watch` - watch-mode tests
- `npm run smoke` - live translation smoke test

## Repository Notes

- Package name: `@prahalad-nagu/fast-translation-plugin`
- Repo is currently configured as private (`"private": true` in `package.json`).
