import { fr } from './fr';
import { en } from './en';

export type Locale = 'fr' | 'en';

export type TranslationKeys = typeof fr;

const translations: Record<Locale, TranslationKeys> = { fr, en };

export function t(locale: Locale, key: string): string {
  const keys = key.split('.');
  let value: any = translations[locale];
  for (const k of keys) {
    if (value === undefined) return key;
    value = value[k];
  }
  return typeof value === 'string' ? value : key;
}

export { fr, en };
