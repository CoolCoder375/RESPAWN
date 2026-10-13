import { colors } from '@/theme';

export const CATEGORIES = ['body', 'mind', 'focus', 'recovery', 'other'] as const;

export type Category = (typeof CATEGORIES)[number];

export const categoryLabel: Record<Category, string> = {
  body: 'Body',
  mind: 'Mind',
  focus: 'Focus',
  recovery: 'Recovery',
  other: 'Other',
};

export const categoryColor: Record<Category, string> = {
  body: colors.body,
  mind: colors.mind,
  focus: colors.focus,
  recovery: colors.recovery,
  other: colors.other,
};

export function isCategory(value: string | null): value is Category {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}
