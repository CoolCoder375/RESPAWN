import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';
import { AppText } from './AppText';

type Props<T extends string | number> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of mutually exclusive options. */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.item, selected && styles.selected]}
          >
            <AppText style={[styles.text, selected && styles.textSelected]}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
  },
  item: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.line },
  text: { fontFamily: fonts.bodyMedium, color: colors.muted },
  textSelected: { color: colors.text },
});
