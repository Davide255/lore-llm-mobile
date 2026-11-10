import { Platform, useColorScheme } from 'react-native';

import { useAppearance } from './appearance';

/**
 * Athly design-system tokens mapped for the KB app.
 * Dark values come straight from the wireframes (dark-first brand);
 * light values follow the DS `.athly-light` scheme.
 */

export const brand = {
  purple: '#8f5cff',
  purpleShade: '#7a46f0',
  purpleTint: '#a37aff',
  blue: '#3a86ff',
  gradient: 'linear-gradient(90deg, #8f5cff 0%, #3a86ff 100%)',
};

const dark = {
  scheme: 'dark' as 'dark' | 'light',
  background: '#121211',
  /** Tablet sidebar (Lore LLM Desktop's). */
  sidebar: '#161518',
  cell: '#1c1b20',
  cellRaised: '#232129',
  sheet: '#26252b',
  text: '#faf9f5',
  textBody: 'rgba(250,249,245,0.78)',
  textSecondary: 'rgba(250,249,245,0.60)',
  textMuted: 'rgba(250,249,245,0.38)',
  hairline: 'rgba(250,249,245,0.10)',
  fill: 'rgba(250,249,245,0.08)',
  fillSubtle: 'rgba(250,249,245,0.05)',
  track: 'rgba(250,249,245,0.12)',
  iconWell: '#2a2537',
  accent: brand.purple,
  accentText: brand.purpleTint,
  accentWell: 'rgba(143,92,255,0.18)',
  accentSoft: 'rgba(143,92,255,0.16)',
  highlight: 'rgba(143,92,255,0.28)',
  folder: '#7aa9ff',
  folderWell: 'rgba(58,134,255,0.18)',
  info: '#5ac8fa',
  infoWell: 'rgba(90,200,250,0.16)',
  infoSoft: 'rgba(90,200,250,0.10)',
  success: '#5cc87c',
  successSoft: 'rgba(92,200,124,0.16)',
  successLine: 'rgba(92,200,124,0.13)',
  successText: '#9be0ae',
  warning: '#f5a623',
  danger: '#ff3b30',
  error: '#ff6b6b',
  errorSoft: 'rgba(255,107,107,0.14)',
  errorLine: 'rgba(255,107,107,0.13)',
  errorText: '#ff9b9b',
  swipeNeutral: '#5a5a60',
};

export type Theme = typeof dark;

const light: Theme = {
  scheme: 'light',
  background: '#f5f3ee',
  sidebar: '#ece9e2',
  cell: '#ffffff',
  cellRaised: '#f3eeff',
  sheet: '#ffffff',
  text: '#111110',
  textBody: 'rgba(17,17,16,0.82)',
  textSecondary: 'rgba(17,17,16,0.62)',
  textMuted: 'rgba(17,17,16,0.42)',
  hairline: 'rgba(17,17,16,0.10)',
  fill: 'rgba(17,17,16,0.06)',
  fillSubtle: 'rgba(17,17,16,0.04)',
  track: 'rgba(17,17,16,0.10)',
  iconWell: '#eee9ff',
  accent: brand.purple,
  accentText: brand.purpleShade,
  accentWell: 'rgba(143,92,255,0.14)',
  accentSoft: 'rgba(143,92,255,0.12)',
  highlight: 'rgba(143,92,255,0.22)',
  folder: '#3a86ff',
  folderWell: 'rgba(58,134,255,0.14)',
  info: '#0a8fc7',
  infoWell: 'rgba(10,143,199,0.14)',
  infoSoft: 'rgba(10,143,199,0.08)',
  success: '#2f9e55',
  successSoft: 'rgba(47,158,85,0.14)',
  successLine: 'rgba(47,158,85,0.12)',
  successText: '#1f7a3f',
  warning: '#c77c00',
  danger: '#ff3b30',
  error: '#d93636',
  errorSoft: 'rgba(217,54,54,0.12)',
  errorLine: 'rgba(217,54,54,0.10)',
  errorText: '#b42424',
  swipeNeutral: '#8e8e93',
};

/** Resolved palette: the in-app choice (Settings › Aspetto) or the system scheme. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useAppearance();
  const scheme = pref === 'system' ? system : pref;
  return scheme === 'light' ? light : dark;
}

export const fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }),
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 9999 } as const;
