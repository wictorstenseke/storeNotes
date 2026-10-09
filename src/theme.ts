import { readSetting, writeSetting } from './state/deviceSettings';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Per device. Unset means follow the system.
export function storedDarkMode(): boolean | null {
  const value = readSetting('darkMode');
  return value === null ? null : value === 'true';
}

export function isDarkMode(): boolean {
  return storedDarkMode() ?? window.matchMedia(DARK_QUERY).matches;
}

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', isDarkMode());
}

export function setDarkMode(dark: boolean): void {
  writeSetting('darkMode', String(dark));
  applyTheme();
}

export function followSystemTheme(): void {
  applyTheme();
  window.matchMedia(DARK_QUERY).addEventListener('change', applyTheme);
}
