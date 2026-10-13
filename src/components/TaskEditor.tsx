import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Task, TaskChanges } from '@/hooks/useTasks';
import { isCategory, type Category } from '@/lib/categories';
import { PRIORITY_OPTIONS, type Priority } from '@/lib/points';
import { colors, radius, space } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Segmented } from './Segmented';
import { TextField } from './TextField';

type Props = {
  task: Task | null;
  onClose: () => void;
  onSave: (changes: TaskChanges) => void;
  onDelete: () => void;
};

/** Bottom sheet for renaming, re-tagging or deleting a task. */
export function TaskEditor({ task, onClose, ...actions }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!task} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          {/* Keyed by task so the form starts fresh for each task. */}
          {task ? <EditorForm key={task.id} task={task} onClose={onClose} {...actions} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditorForm({ task, onClose, onSave, onDelete }: Props & { task: Task }) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<Category | null>(
    isCategory(task.category) ? task.category : null,
  );
  const [priority, setPriority] = useState<Priority>(task.priority);
  const trimmed = title.trim();
  const save = () => trimmed && onSave({ title: trimmed, category, priority });

  function confirmDelete() {
    Alert.alert('Delete task?', `“${task.title}” will be removed. Past ticks still count.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <>
      <AppText variant="title">Edit task</AppText>
      <TextField
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <Segmented options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
      <CategoryPicker value={category} onChange={setCategory} />
      <Button title="Save" onPress={save} disabled={!trimmed} />
      <View style={styles.row}>
        <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
        <Button title="Delete" variant="danger" onPress={confirmDelete} style={styles.flex} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
  },
  row: { flexDirection: 'row', gap: space.sm },
});
