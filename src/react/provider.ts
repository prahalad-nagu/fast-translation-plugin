import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  LanguageCode,
  TranslateOptions,
  TranslationResult,
  Translator,
} from "../types.js";

export interface TranslationProviderProps extends PropsWithChildren {
  translator: Translator;
  initialLanguage?: LanguageCode;
  defaultSourceLang?: LanguageCode;
  onLanguageChange?: (language: LanguageCode) => void;
}

export interface TranslationContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  translateText: (text: string, options?: TranslateOptions) => Promise<string>;
  translateTextDetailed: (
    text: string,
    options?: TranslateOptions,
  ) => Promise<TranslationResult>;
  translateBatch: (texts: string[], options?: TranslateOptions) => Promise<string[]>;
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

export function TranslationProvider(props: TranslationProviderProps) {
  const {
    translator,
    initialLanguage = "en",
    defaultSourceLang = "en",
    onLanguageChange,
    children,
  } = props;

  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage);

  const setLanguage = useCallback(
    (nextLanguage: LanguageCode) => {
      setLanguageState(nextLanguage);
      if (onLanguageChange) {
        onLanguageChange(nextLanguage);
      }
    },
    [onLanguageChange],
  );

  const withSourceDefault = useCallback(
    (options?: TranslateOptions): TranslateOptions => ({
      ...options,
      sourceLang: options?.sourceLang ?? defaultSourceLang,
    }),
    [defaultSourceLang],
  );

  const translateText = useCallback(
    (text: string, options?: TranslateOptions) =>
      translator.translateText(text, language, withSourceDefault(options)),
    [language, translator, withSourceDefault],
  );

  const translateTextDetailed = useCallback(
    (text: string, options?: TranslateOptions) =>
      translator.translateTextDetailed(text, language, withSourceDefault(options)),
    [language, translator, withSourceDefault],
  );

  const translateBatch = useCallback(
    (texts: string[], options?: TranslateOptions) =>
      translator.translateBatch(texts, language, withSourceDefault(options)),
    [language, translator, withSourceDefault],
  );

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage,
      translateText,
      translateTextDetailed,
      translateBatch,
    }),
    [language, setLanguage, translateText, translateTextDetailed, translateBatch],
  );

  return createElement(TranslationContext.Provider, { value }, children);
}

export function useTranslation(): TranslationContextValue {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within TranslationProvider");
  }

  return context;
}

export const useTranslate = useTranslation;
