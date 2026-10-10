// Design tokens for Respawn. Every color, font and size used by the app lives here.

export const colors = {
  bg: '#0D0E11',
  surface: '#17191E',
  line: '#262930',
  text: '#F2F3F5',
  muted: '#9BA1AB',
  accent: '#C8F04A',
  // Text drawn on top of the accent color.
  onAccent: '#0D0E11',
  danger: '#FF6B6B',
  // Category tags
  body: '#C8F04A',
  mind: '#8AB4FF',
  focus: '#FFB067',
  recovery: '#C4A8FF',
  other: '#9BA1AB',
} as const;

export const fonts = {
  display: 'Unbounded_800ExtraBold',
  displayMedium: 'Unbounded_600SemiBold',
  body: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodyBold: 'SpaceGrotesk_700Bold',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Minimum touch target, per the plan (44 px). */
export const touch = 48;
