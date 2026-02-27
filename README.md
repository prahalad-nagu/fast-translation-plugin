# Fast Translation Plugin (POC)

A lightweight TypeScript translation plugin for UI microcopy using OpenAI, with caching, timeout protection, and safe fallback behavior.

## Features

- Simple raw-text API: `translateText("Login", "es")`
- Batch API for arrays: `translateBatch(["Login", "SignUp"], "es")`
- OpenAI-backed translation provider
- In-memory LRU + TTL cache
- Optional persistent cache adapter (IndexedDB/localStorage)
- In-flight request deduplication
- Language alias normalization (`"Spanish" -> "es"`)
- Safe fallback: returns source text if provider fails or times out

## Install in Other Apps

For private repository usage inside your organization, install from GitHub using SSH:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git
```

For stable versions, install by tag:

```bash
npm install git+ssh://git@github.com/prahalad-nagu/fast-translation-plugin.git#v0.1.0
```

Notes:
- This repo is configured with `"private": true` in `package.json`, so it is not publishable to npm by default.
- Developers and CI need access to the GitHub repo and SSH key/token configuration.

## Quick Start (Server-side)

```ts
import { createTranslator } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
  onUsage: (usage) => {
    console.log("usage", usage);
  },
});

const login = await translator.translateText("Login", "es");
const changePassword = await translator.translateText(
  "Please change the password",
  "es",
);

console.log(login); // Iniciar sesión
console.log(changePassword);
```

Important: keep `OPENAI_API_KEY` on backend/server only.

## Client-Only Mode (Risky)

If you still want direct browser calls to OpenAI (no backend), enable browser mode:

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
- This exposes your API key to users and browser devtools.
- Use only for internal tools or short-lived POCs.
- Preferred architecture is backend translation endpoint.

## Client-Side Persistent Cache (IndexedDB / localStorage)

Use this pattern on frontend:
- call your backend translation API
- cache translated strings in browser storage
- on repeat requests, return from storage without another API call

```ts
import {
  TranslatorService,
  createIndexedDBPersistentCache,
  type TranslationProvider,
} from "@prahalad-nagu/fast-translation-plugin";

const apiProvider: TranslationProvider = {
  async translate(text, sourceLang, targetLang) {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLang, targetLang }),
    });

    if (!response.ok) {
      throw new Error(`Translation API failed: ${response.status}`);
    }

    const body = (await response.json()) as { translatedText: string };
    return body.translatedText;
  },
};

const translator = new TranslatorService(apiProvider, {
  persistentCache: createIndexedDBPersistentCache({
    dbName: "my-app-translations",
    storeName: "ui-text",
  }),
  onCacheError: (err, meta) => {
    console.warn("cache issue", meta, err.message);
  },
});

const loginText = await translator.translateText("Login", "es");
```

If you want simpler storage:

```ts
import { createLocalStoragePersistentCache } from "@prahalad-nagu/fast-translation-plugin";
// persistentCache: createLocalStoragePersistentCache({ keyPrefix: "my-app:" })
```

## Batch Translation (Array Input)

```ts
const translated = await translator.translateBatch(
  ["Login", "SignUp", "Please change the password", "Waiting for approval"],
  "es",
);
```

Behavior:
- Returns results in original order.
- Deduplicates repeated input strings.
- Falls back to source text if translation fails.
- Current implementation calls provider per unique string (not a single model call for the whole array).

## API

### `createTranslator(config)`

Creates a translator using OpenAI as the provider.

### `translateText(text, targetLang, options?)`

Translates one string.

- `text`: source text (usually English UI copy)
- `targetLang`: ISO code or alias, e.g. `"es"`, `"Spanish"`
- `options.sourceLang`: defaults to `"en"`
- `options.timeoutMs`: defaults to `4000`
- `options.preserveFormatting`: defaults to `true`
- `options.context`: optional domain hint

### `translateBatch(texts, targetLang, options?)`

Translates multiple strings and returns results in original order.

### `onUsage` logger

Pass `onUsage` in `createTranslator` config to log token usage per translation request:

```ts
const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  onUsage: (usage) => {
    // { model, sourceLang, targetLang, promptTokens, completionTokens, totalTokens }
    console.log(usage);
  },
});
```

### `persistentCache` and `onCacheError`

`persistentCache` lets you plug client-side storage (IndexedDB/localStorage) so repeated translations are served from storage before API.

`onCacheError` is optional and called when cache read/write fails; translation still continues.

## OpenAI Pricing

OpenAI API is generally paid (not permanently free). Cost is token-based and depends on model and usage volume.

Check latest pricing:
- https://platform.openai.com/pricing

For this plugin use case (short UI text), cost is typically low, especially with caching and deduplication.

## Defaults

- Supported languages: `en, es, fr, de, pt, it, hi, ja, ko, ar, zh`
- Cache TTL: 24 hours
- Cache size: 5000 entries
- Model: `gpt-4o-mini`

## Development

```bash
npm test
npm run build
```

## Local Testing

Run automated tests:

```bash
npm test
```

Run a real API smoke test (requires `OPENAI_API_KEY`):

```bash
OPENAI_API_KEY=your_key npm run smoke
```

Pass custom target language + texts:

```bash
OPENAI_API_KEY=your_key npm run smoke -- fr "Login" "SignUp"
```

Smoke logger supports optional cost/budget env vars:

```bash
OPENAI_PRICE_INPUT_PER_1M=0.15
OPENAI_PRICE_OUTPUT_PER_1M=0.60
OPENAI_CREDIT_BUDGET_USD=20
```

Note: exact remaining OpenAI account credits are not returned by this API key flow.
Use OpenAI Billing dashboard for exact balance.
Pending token count is also not exact upfront; actual token usage is returned after each response.

## Environment

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Set:

- `OPENAI_API_KEY=your_api_key`
