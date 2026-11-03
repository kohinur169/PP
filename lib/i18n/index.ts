// path: lib/i18n/index.ts
import { en, type TranslationStrings } from './strings/en';

type Leaves<T> = T extends object
  ? { [K in keyof T]: `${Exclude<K, symbol>}${Leaves<T[K]> extends never ? '' : `.${Leaves<T[K]>}`}` }[keyof T]
  : never;

export type I18nKey = Leaves<TranslationStrings>;

/**
 * Retrieves a nested string by dot-separated path from the centralized English dictionary.
 * Supports template interpolation via {{param}} placeholders.
 *
 * Example: t('common.platformName') -> 'KD SOLUTION IT'
 * Example: t('auth.accountLockedError', { hours: 2 })
 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const parts = key.split('.');
  let current: unknown = en;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      // Fallback if key is missing
      return key;
    }
  }

  if (typeof current !== 'string') {
    return key;
  }

  if (!params) {
    return current;
  }

  // Interpolate {{param}} placeholders
  return current.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, paramName) => {
    if (paramName in params) {
      return String(params[paramName]);
    }
    return `{{${paramName}}}`;
  });
}

export { en };
