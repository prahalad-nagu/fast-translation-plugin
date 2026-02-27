import OpenAI from "openai";

import type { TranslationProvider } from "./base.js";
import type { LanguageCode, ProviderTranslateOptions, TranslationUsage } from "../types.js";

export interface OpenAITranslationProviderConfig {
  apiKey: string;
  model?: string;
  dangerouslyAllowBrowser?: boolean;
  onUsage?: (usage: TranslationUsage) => void;
}

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAITranslationProvider implements TranslationProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly onUsage?: (usage: TranslationUsage) => void;

  constructor(config: OpenAITranslationProviderConfig) {
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error("OpenAI apiKey is required");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: config.dangerouslyAllowBrowser ?? false,
    });
    this.model = config.model ?? DEFAULT_MODEL;
    this.onUsage = config.onUsage;
  }

  async translate(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    options: ProviderTranslateOptions,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);

    const systemPrompt = [
      "You are a translation engine for short UI microcopy.",
      "Translate accurately and naturally for the target language.",
      "Return only translated text, without explanation, markdown, or quotes.",
      options.preserveFormatting
        ? "Preserve placeholders and tokens exactly: examples {name}, {{value}}, %s, %d, and HTML/XML tags."
        : "Formatting and placeholders do not need strict preservation.",
    ].join(" ");

    const userPrompt = [
      `Source language: ${sourceLang}`,
      `Target language: ${targetLang}`,
      options.context ? `Context: ${options.context}` : "",
      `Text: ${text}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: controller.signal },
      );

      const translated = response.choices?.[0]?.message?.content?.trim();
      if (!translated) {
        throw new Error("OpenAI returned an empty translation");
      }

      if (response.usage && this.onUsage) {
        this.onUsage({
          model: this.model,
          sourceLang: String(sourceLang),
          targetLang: String(targetLang),
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      return stripMatchingQuotes(translated);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function stripMatchingQuotes(input: string): string {
  if (input.length < 2) {
    return input;
  }

  const first = input[0];
  const last = input[input.length - 1];
  const isMatchingQuote =
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`");

  if (!isMatchingQuote) {
    return input;
  }

  return input.slice(1, -1).trim();
}
