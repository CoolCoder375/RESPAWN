import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type Props = TextInputProps & { label?: string; error?: string | null };

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        keyboardAppearance="dark"
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  input: {
    minHeight: touch,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 14 },
});
