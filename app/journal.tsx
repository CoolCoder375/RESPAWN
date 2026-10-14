import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useJournal, useSaveJournal, type JournalEntry } from '@/hooks/useJournal';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { useTodayQuests } from '@/hooks/useQuests';
import { isJournalQuest, JOURNAL_MAX_LENGTH, lineCount, linesNeeded } from '@/lib/journal';
import { colors, fonts, radius, space } from '@/theme';

export default function JournalScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  return <Journal profile={profile} />;
}

function Journal({ profile }: { profile: Profile }) {
  const today = useLocalDay(profile.timezone);
  const journal = useJournal(profile.id);

  if (journal.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (journal.isError) {
    return (
      <Screen edges={['bottom']}>
        <AppText variant="title">Couldn’t load your journal</AppText>
        <AppText variant="muted">{journal.error.message}</AppText>
        <Button title="Try again" onPress={() => journal.refetch()} />
      </Screen>
    );
  }

  const entries = journal.data;
  const todays = entries.find((e) => e.day === today);
  const past = entries.filter((e) => e.day !== today);

  return (
    <Screen edges={['bottom']}>
      {/* Remount at midnight so the editor starts empty for the new day. */}
      <TodayEntry key={today} profile={profile} today={today} saved={todays?.body ?? ''} />

      <View style={styles.list}>
        <AppText variant="label">Past entries</AppText>
        {past.length === 0 ? (
          <AppText variant="muted">
            Your earlier entries will show here. Only you can read them.
          </AppText>
        ) : (
          past.map((entry) => <PastEntry key={entry.day} entry={entry} />)
        )}
      </View>
    </Screen>
  );
}

function TodayEntry({ profile, today, saved }: { profile: Profile; today: string; saved: string }) {
  const [body, setBody] = useState(saved);
  const quests = useTodayQuests(profile.id, today);
  const save = useSaveJournal(profile.id, today);

  const quest = quests.data?.find(isJournalQuest);
  const needed = quest ? linesNeeded(quest.tier) : null;
  const lines = lineCount(body);
  const changed = body.trim() !== saved;

  function submit() {
    save.mutate(body, {
      onSuccess: () => {
        if (needed && lines >= needed) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
    });
  }

  return (
    <View style={styles.today}>
      <View style={styles.row}>
        <AppText variant="label">Today</AppText>
        {needed ? (
          <AppText variant="label" color={lines >= needed ? colors.accent : undefined}>
            {Math.min(lines, needed)} / {needed} {needed === 1 ? 'line' : 'lines'}
          </AppText>
        ) : null}
      </View>
      <TextField
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={JOURNAL_MAX_LENGTH}
        placeholder={'How did today go?\nWhat was hard? What went well?'}
        style={styles.editor}
        accessibilityLabel="Today’s journal entry"
      />
      {save.isError ? <AppText color={colors.danger}>{save.error.message}</AppText> : null}
      <Button title="Save" loading={save.isPending} disabled={!changed} onPress={submit} />
      <AppText variant="muted">
        {quest?.done_at
          ? 'Journal quest done. You can keep editing until midnight.'
          : needed
            ? `Write ${needed} ${needed === 1 ? 'line' : 'lines'} and save to complete today’s journal quest. Only you can read this, not even your partner.`
            : 'Only you can read this, not even your partner.'}
      </AppText>
    </View>
  );
}

function PastEntry({ entry }: { entry: JournalEntry }) {
  const date = new Date(`${entry.day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return (
    <View style={styles.card}>
      <AppText variant="label">{date}</AppText>
      <AppText style={styles.body}>{entry.body}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  today: { gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  editor: {
    minHeight: 160,
    paddingTop: space.md,
    paddingBottom: space.md,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  list: { gap: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
