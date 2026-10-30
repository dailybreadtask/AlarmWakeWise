import { Platform } from 'react-native';

/**
 * The approved v3.0 mockup: off-white paper, black ink, and one signal yellow
 * for the primary action on each screen. Black text sits on yellow.
 */
export const colors = {
  paper: '#F4F4F2',
  ink: '#111111',
  muted: '#6B6B68',
  line: '#D6D6D2',
  card: '#FFFFFF',
  dark: '#1C1C1C',
  primary: '#F5E14B',
  onPrimary: '#111111',
  danger: '#C2410C',
} as const;

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
