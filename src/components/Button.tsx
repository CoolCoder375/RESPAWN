import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: Props) {
  const inactive = disabled || loading;
  const textColor =
    variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && styles.pressed,
        inactive && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <AppText style={[styles.text, { color: textColor }]}>{title}</AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  text: { fontFamily: fonts.bodyBold, fontSize: 16 },
});
