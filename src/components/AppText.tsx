import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'muted';

type Props = TextProps & { variant?: Variant; color?: string };

/** Text with the app fonts applied. Font scaling follows the system setting. */
export function AppText({ variant = 'body', color, style, ...rest }: Props) {
  return <Text style={[styles[variant], color ? { color } : null, style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.text },
  title: { fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  muted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
});
