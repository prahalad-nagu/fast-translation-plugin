import type { LanguageCode } from "../types.js";

export const DEFAULT_SUPPORTED_LANGUAGES: ReadonlyArray<LanguageCode> = Object.freeze([
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "hi",
  "ja",
  "ko",
  "ar",
  "zh",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en",
  english: "en",
  es: "es",
  spanish: "es",
  fr: "fr",
  french: "fr",
  de: "de",
  german: "de",
  pt: "pt",
  portuguese: "pt",
  it: "it",
  italian: "it",
  hi: "hi",
  hindi: "hi",
  ja: "ja",
  japanese: "ja",
  ko: "ko",
  korean: "ko",
  ar: "ar",
  arabic: "ar",
  zh: "zh",
  chinese: "zh",
  mandarin: "zh",
};

export function normalizeLanguageCode(input: LanguageCode, label: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }

  const cleaned = input.trim().toLowerCase().replace(/_/g, "-");
  const aliasMatch = LANGUAGE_ALIASES[cleaned];
  if (aliasMatch) {
    return aliasMatch;
  }

  if (/^[a-z]{2,3}(-[a-z]{2,3})?$/.test(cleaned)) {
    const base = cleaned.split("-")[0];
    return LANGUAGE_ALIASES[base] ?? base;
  }

  throw new Error(`${label} is invalid: ${input}`);
}

export function normalizeSupportedLanguages(languages: LanguageCode[]): Set<string> {
  if (!Array.isArray(languages) || languages.length === 0) {
    throw new Error("supportedLanguages must include at least one language");
  }

  const normalized = new Set<string>();
  for (const language of languages) {
    normalized.add(normalizeLanguageCode(language, "supported language"));
  }

  return normalized;
}

export function assertSupportedLanguage(language: string, supported: Set<string>, label: string): void {
  if (!supported.has(language)) {
    throw new Error(`${label} '${language}' is not supported`);
  }
}
