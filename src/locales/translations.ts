import React, { createContext, useContext } from 'react';
import type { LanguageCode } from '../../shared/types';
import ar from './ar';
import de from './de';
import en from './en';
import es from './es';
import fr from './fr';
import hu from './hu';
import it from './it';
import ja from './ja';
import { HU_PHRASE_LIST, type PhraseKey } from './phraseKeys';
import pt from './pt';
import ru from './ru';
import {
  SUPPORTED_LANGUAGES,
  type LanguageOption,
  type LocaleBundle,
  type TranslationKeys,
} from './types';
import zh from './zh';

export { SUPPORTED_LANGUAGES, HU_PHRASE_LIST };
export type { LanguageOption, LocaleBundle, PhraseKey, TranslationKeys };

export const LANG_STORAGE_KEY = 'novaswarm_lang_v1';

export const LOCALES: Record<LanguageCode, LocaleBundle<PhraseKey>> = {
  hu,
  en,
  de,
  es,
  fr,
  it,
  pt,
  ru,
  zh,
  ja,
  ar,
};

const VALID_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return typeof code === 'string' && VALID_CODES.has(code);
}

export function getSavedLanguage(fallback: LanguageCode = 'hu'): LanguageCode {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (isSupportedLanguage(saved)) return saved;
    } catch {
      // ignore storage restrictions
    }
    try {
      const nav = window.navigator?.language?.slice(0, 2).toLowerCase();
      if (isSupportedLanguage(nav)) return nav;
    } catch {
      // ignore navigator access issues
    }
  }
  return fallback;
}

export function saveLanguagePreference(lang: LanguageCode): void {
  if (typeof window === 'undefined' || !isSupportedLanguage(lang)) return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore storage quota errors
  }
}

export function getLanguageDir(lang: LanguageCode): 'ltr' | 'rtl' {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';
}

export function getIntlLocale(lang: LanguageCode): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.speechLocale ?? 'en-US';
}

export function tr(
  lang: LanguageCode,
  key: keyof TranslationKeys,
  ...args: Array<string | number>
): string {
  const bundle = LOCALES[lang] ?? LOCALES.en;
  let template = bundle.core[key] ?? LOCALES.en.core[key] ?? LOCALES.hu.core[key] ?? String(key);
  if (args.length > 0) {
    template = template.replace(/\{(\d+)\}/g, (_, idxStr: string) => {
      const idx = Number(idxStr);
      return idx < args.length && args[idx] !== undefined ? String(args[idx]) : `{${idxStr}}`;
    });
  }
  return template;
}

export function tx(
  lang: LanguageCode,
  phrase: PhraseKey | string,
  ...args: Array<string | number>
): string {
  const bundle = LOCALES[lang] ?? LOCALES.en;
  const phrasesMap = bundle.phrases as Record<string, string>;
  const enPhrases = LOCALES.en.phrases as Record<string, string>;
  let template = phrasesMap[phrase] ?? enPhrases[phrase] ?? phrase;
  if (args.length > 0) {
    template = template.replace(/\{(\d+)\}/g, (_, idxStr: string) => {
      const idx = Number(idxStr);
      return idx < args.length && args[idx] !== undefined ? String(args[idx]) : `{${idxStr}}`;
    });
  }
  return template;
}

export function speakBrowserTts(text: string, lang: LanguageCode): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
  utter.lang = getIntlLocale(lang);
  window.speechSynthesis.speak(utter);
}

export interface LocaleContextValue {
  lang: LanguageCode;
  dir: 'ltr' | 'rtl';
  intlLocale: string;
  setLang: (next: LanguageCode) => void;
  t: (key: keyof TranslationKeys, ...args: Array<string | number>) => string;
  tx: (phrase: PhraseKey, ...args: Array<string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  lang: 'hu',
  dir: 'ltr',
  intlLocale: 'hu-HU',
  setLang: () => {},
  t: (key, ...args) => tr('hu', key, ...args),
  tx: (phrase, ...args) => tx('hu', phrase, ...args),
});

export interface LocaleProviderProps {
  lang: LanguageCode;
  setLang?: (next: LanguageCode) => void;
  children: React.ReactNode;
}

export function LocaleProvider({ lang, setLang, children }: LocaleProviderProps) {
  const safeLang: LanguageCode = isSupportedLanguage(lang) ? lang : 'hu';
  const dir = getLanguageDir(safeLang);
  const intlLocale = getIntlLocale(safeLang);

  const value: LocaleContextValue = {
    lang: safeLang,
    dir,
    intlLocale,
    setLang: setLang ?? (() => {}),
    t: (key, ...args) => tr(safeLang, key, ...args),
    tx: (phrase, ...args) => tx(safeLang, phrase, ...args),
  };

  return React.createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
