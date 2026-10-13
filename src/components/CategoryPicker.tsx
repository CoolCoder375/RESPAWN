import { Pressable, StyleSheet, View } from 'react-native';

import { CATEGORIES, categoryColor, categoryLabel, type Category } from '@/lib/categories';
import { colors, fonts, radius, space } from '@/theme';
import { AppText } from './AppText';

type Props = { value: Category | null; onChange: (value: Category | null) => void };

/** Optional category chips; tapping the selected chip clears it. */
export function CategoryPicker({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {CATEGORIES.map((category) => {
        const selected = value === category;
        const color = categoryColor[category];
        return (
          <Pressable
            key={category}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : category)}
            style={[styles.chip, selected && { borderColor: color, backgroundColor: `${color}22` }]}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <AppText style={[styles.text, selected && { color }]}>
              {categoryLabel[category]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md - 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.muted },
});
