import type { LanguageCode, ProviderTranslateOptions } from "../types.js";

export interface TranslationProvider {
  translate(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    options: ProviderTranslateOptions,
  ): Promise<string>;
}
