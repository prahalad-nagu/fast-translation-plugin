# Fast Translation Plugin (POC)

A lightweight TypeScript translation module for UI microcopy using OpenAI, with caching, timeout protection, and safe fallback behavior.

## Features

- Simple raw-text API: `translateText("Login", "es")`
- OpenAI-backed translation provider
- In-memory LRU + TTL cache
- In-flight request deduplication
- Language alias normalization (`"Spanish" -> "es"`)
- Safe fallback: returns source text if provider fails or times out

## Install

```bash
npm install @prahalad-nagu/fast-translation-plugin
```

Or install directly from GitHub:

```bash
npm install git+https://github.com/prahalad-nagu/fast-translation-plugin.git
```

## Quick Start

```ts
import { createTranslator } from "@prahalad-nagu/fast-translation-plugin";

const translator = createTranslator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
});

const login = await translator.translateText("Login", "es");
const changePassword = await translator.translateText(
  "Please change the password",
  "es",
);

console.log(login); // Iniciar sesión
console.log(changePassword);
```

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

## Publish

```bash
npm login
npm test
npm run build
npm publish --access public
```

## Environment

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Set:

- `OPENAI_API_KEY=your_api_key`
