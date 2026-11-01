import { DynamicColorIOS, Platform, useColorScheme, type ColorValue } from 'react-native';

/**
 * Two palettes with one identity: a near-black night ground with a yellow that glows like a bedside lamp, and a warm
 * paper day. Night is the default, because alarm clocks are read in the dark. Mint, coral and indigo are small
 * accents with a meaning: on time, at risk, and the assistant.
 */
export interface Palette {
  /** The ground. */
  paper: string;
  /** Primary text, strong lines, and light fills. */
  ink: string;
  muted: string;
  line: string;
  /** A raised surface. */
  card: string;
  dark: string;
  primary: string;
  /** Dark text and icons that sit on the yellow. */
  onPrimary: string;
  danger: string;
  /** Lighter secondary text. */
  quiet: string;
  /** Underlines and dividers. */
  hairline: string;
  dim: string;
  faint: string;
  border: string;
  raised: string;
  /** On time, done, success. */
  mint: string;
  /** Delayed, at risk, a mistake. */
  coral: string;
  /** The assistant: planning and purpose. */
  indigo: string;
  indigoSoft: string;
  /** A thin edge on a yellow surface. */
  ring: string;
  /** The halo round a large numeral. Clear by day. */
  glow: string;
}

export const NIGHT: Palette = {
  paper: '#01010D',
  ink: '#F2F2F7',
  muted: '#8E8EA0',
  line: '#23232F',
  card: '#0D0D18',
  dark: '#0D0D18',
  primary: '#F5E74B',
  onPrimary: '#0B0B12',
  danger: '#FD6E88',
  quiet: '#B3B3C4',
  hairline: '#2C2C3A',
  dim: '#6E6E82',
  faint: '#4B4B5E',
  border: '#1C1C29',
  raised: '#161622',
  mint: '#88F9C0',
  coral: '#FD6E88',
  indigo: '#6331FB',
  indigoSoft: '#A48BFF',
  ring: 'rgba(0,0,0,0.28)',
  glow: 'rgba(245,231,75,0.38)',
};

export const DAY: Palette = {
  paper: '#F5F5F2',
  ink: '#202020',
  muted: '#6B6B66',
  line: '#E3E3DE',
  card: '#FFFFFF',
  dark: '#1C1C1C',
  primary: '#F5E74B',
  onPrimary: '#0B0B12',
  danger: '#C2410C',
  quiet: '#5E5E59',
  hairline: '#CFCFC9',
  dim: '#8A8A84',
  faint: '#9A9A94',
  border: '#ECECE7',
  raised: '#DADAD4',
  mint: '#0B8F5A',
  coral: '#D63A5A',
  indigo: '#6331FB',
  indigoSoft: '#5B3FD6',
  ring: 'rgba(32,32,32,0.12)',
  glow: 'rgba(245,231,75,0)',
};

/** One colour that is `day` in a light interface and `night` in a dark one. iOS switches it by itself when the scheme changes. */
const both = (day: string, night: string): ColorValue => (Platform.OS === 'ios' ? DynamicColorIOS({ light: day, dark: night }) : night);

/** Use these in styles. Each follows the app's light or dark setting without the screen having to redraw. */
export const colors: Record<keyof Palette, ColorValue> = (Object.keys(NIGHT) as (keyof Palette)[]).reduce(
  (all, key) => ({ ...all, [key]: key === 'primary' || key === 'onPrimary' || key === 'indigo' ? NIGHT[key] : both(DAY[key], NIGHT[key]) }),
  {} as Record<keyof Palette, ColorValue>,
);

/** The halo that makes a large numeral glow in the dark. Spread into a Text style. */
export const glow = {
  textShadowColor: colors.glow,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 26,
} as const;

/**
 * The current palette as plain strings, for things that cannot take a dynamic colour, such as drawn icons.
 * It changes when the setting does.
 */
export function useTheme(): { scheme: 'dark' | 'light'; c: Palette } {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return { scheme, c: scheme === 'light' ? DAY : NIGHT };
}

/** Monospaced numerals give the times a dot-matrix, instrument-panel feel. */
export const fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;

export const radius = { pill: 999, card: 16, button: 14 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const type = {
  display: { fontSize: 72, fontWeight: '200' as const, letterSpacing: -2 },
  title: { fontSize: 22, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
} as const;
