import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSaveProfile, type Profile } from '@/hooks/useProfile';
import { addDays, deviceTimezone, isValidDay, localDay } from '@/lib/dates';
import { colors, space } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { TextField } from './TextField';

type Props = {
  /** Existing profile when editing from Settings; omitted during onboarding. */
  initial?: Profile | null;
  submitLabel: string;
  onSaved?: () => void;
};

/** Name + season start form shared by onboarding and Settings. */
export function ProfileForm({ initial, submitLabel, onSaved }: Props) {
  const timezone = initial?.timezone ?? deviceTimezone();
  const today = localDay(timezone);

  const [name, setName] = useState(initial?.display_name ?? '');
  const [seasonStart, setSeasonStart] = useState(initial?.season_start ?? today);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveProfile();

  const trimmedName = name.trim();

  function submit() {
    if (trimmedName.length < 1 || trimmedName.length > 40) {
      setError('Name must be 1–40 characters.');
      return;
    }
    if (!isValidDay(seasonStart)) {
      setError('Season start must be a date like 2026-10-09.');
      return;
    }
    setError(null);
    save.mutate(
      { display_name: trimmedName, season_start: seasonStart, timezone: deviceTimezone() },
      { onSuccess: () => onSaved?.(), onError: (e) => setError(e.message) },
    );
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Display name"
        placeholder="What should your partner see?"
        value={name}
        onChangeText={setName}
        maxLength={40}
        autoCapitalize="words"
        textContentType="nickname"
      />
      <View style={styles.field}>
        <TextField
          label="Season start (YYYY-MM-DD)"
          value={seasonStart}
          onChangeText={setSeasonStart}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <View style={styles.row}>
          <Button
            title="Today"
            variant="ghost"
            onPress={() => setSeasonStart(today)}
            style={styles.flex}
          />
          <Button
            title="Tomorrow"
            variant="ghost"
            onPress={() => setSeasonStart(addDays(today, 1))}
            style={styles.flex}
          />
        </View>
      </View>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      <Button title={submitLabel} onPress={submit} loading={save.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  field: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  error: { color: colors.danger },
});
