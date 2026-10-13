import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NewTask, TaskKind } from '@/hooks/useTasks';
import type { Category } from '@/lib/categories';
import { DEFAULT_PRIORITY, PRIORITY_OPTIONS, type Priority } from '@/lib/points';
import { colors, radius, space } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Segmented } from './Segmented';
import { TextField } from './TextField';

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'once', label: 'One-off' },
];

export function AddTaskForm({ onAdd }: { onAdd: (task: NewTask) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('daily');
  const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);
  const [category, setCategory] = useState<Category | null>(null);

  const trimmed = title.trim();

  function submit() {
    if (!trimmed) return;
    onAdd({ title: trimmed, kind, category, priority });
    setTitle('');
  }

  return (
    <View style={styles.card}>
      <TextField
        placeholder="Add a task"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={submit}
        submitBehavior="submit"
      />
      <Segmented options={KINDS} value={kind} onChange={setKind} />
      <View style={styles.field}>
        <AppText variant="label">Priority (RP)</AppText>
        <Segmented options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
      </View>
      <CategoryPicker value={category} onChange={setCategory} />
      <Button title="Add task" onPress={submit} disabled={!trimmed} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  field: { gap: space.sm },
});
