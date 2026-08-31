export const AdminThemeMode = {
  Light: 'light',
  Dark: 'dark',
  System: 'system',
} as const;
export type AdminThemeMode = (typeof AdminThemeMode)[keyof typeof AdminThemeMode];

const THEME_STORAGE_KEY = 'zhiyuan.admin.theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const DARK_CLASS = 'dark';

function htmlElement(): HTMLElement {
  if (typeof document === 'undefined') throw new Error('Zhiyuan admin console requires a DOM.');
  return document.documentElement;
}

function prefersDark(mode: AdminThemeMode): boolean {
  return (
    mode === AdminThemeMode.Dark ||
    (mode === AdminThemeMode.System && Boolean(globalThis.matchMedia?.(DARK_MEDIA_QUERY).matches))
  );
}

export function initialAdminTheme(): AdminThemeMode {
  const mode = readStoredMode() ?? AdminThemeMode.System;
  applyAdminTheme(mode);
  return mode;
}

export function applyAdminTheme(mode: AdminThemeMode): void {
  htmlElement().classList.toggle(DARK_CLASS, prefersDark(mode));
}

export function subscribeToSystemTheme(listener: () => void): () => void {
  if (!globalThis.matchMedia) return () => undefined;
  const media = globalThis.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function readStoredMode(): AdminThemeMode | null {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (raw === AdminThemeMode.Light || raw === AdminThemeMode.Dark || raw === AdminThemeMode.System)
      return raw;
  } catch {
    // Storage access can be denied in restricted browser profiles; fall back to system.
  }
  return null;
}

export function persistAdminTheme(mode: AdminThemeMode): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage persistence is best-effort only.
  }
  applyAdminTheme(mode);
}
