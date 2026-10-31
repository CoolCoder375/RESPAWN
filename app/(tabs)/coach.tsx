import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import {
  COACH_DAILY_LIMIT,
  COACH_MAX_LENGTH,
  useCoachMessages,
  useSendCoach,
  type CoachMessage,
} from '@/hooks/useCoach';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { localDay } from '@/lib/dates';
import { colors, fonts, maxFontScale, radius, space, touch } from '@/theme';

const CHIPS = ['Plan my day', 'Low energy today', 'I missed yesterday', 'Review my week'];

/** A row in the chat list: a saved message, or the one being sent and the coach "typing". */
type Row = CoachMessage | { id: string; role: 'user' | 'typing'; content: string };

export default function CoachScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  return <Coach profile={profile} />;
}

function Coach({ profile }: { profile: Profile }) {
  const today = useLocalDay(profile.timezone);
  const messages = useCoachMessages(profile.id);
  const send = useSendCoach(profile.id);
  const [draft, setDraft] = useState('');

  if (messages.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (messages.isError) {
    return (
      <View style={[styles.center, styles.padded]}>
        <AppText variant="title">Couldn’t load your chat</AppText>
        <AppText variant="muted">{messages.error.message}</AppText>
        <Button title="Try again" onPress={() => messages.refetch()} />
      </View>
    );
  }

  const sentToday = messages.data.filter(
    (m) => m.role === 'user' && localDay(profile.timezone, new Date(m.created_at)) === today,
  ).length;
  const left = Math.max(COACH_DAILY_LIMIT - sentToday, 0);

  // Sending keeps the text in the box until the coach answers, so a failure loses nothing.
  function submit(text: string) {
    const message = text.trim();
    if (!message || send.isPending || left === 0) return;
    setDraft(message);
    send.mutate(message, {
      onSuccess: () => setDraft((current) => (current.trim() === message ? '' : current)),
    });
  }

  const rows: Row[] = send.isPending
    ? [
        { id: 'typing', role: 'typing', content: '' },
        { id: 'sending', role: 'user', content: send.variables ?? '' },
        ...messages.data,
      ]
    : messages.data;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={rows}
        inverted
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Bubble row={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListFooterComponent={rows.length === 0 ? <Intro name={profile.display_name} /> : null}
      />

      <View style={styles.composer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {CHIPS.map((chip) => (
            <Pressable
              key={chip}
              accessibilityRole="button"
              disabled={send.isPending || left === 0}
              onPress={() => submit(chip)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <AppText style={styles.chipText}>{chip}</AppText>
            </Pressable>
          ))}
        </ScrollView>

        {send.isError ? <AppText color={colors.danger}>{send.error.message}</AppText> : null}
        {left === 0 ? (
          <AppText variant="muted">
            That’s {COACH_DAILY_LIMIT} messages today. Go do the next quest, and we’ll talk
            tomorrow.
          </AppText>
        ) : left <= 5 ? (
          <AppText variant="muted">
            {left} {left === 1 ? 'message' : 'messages'} left today
          </AppText>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COACH_MAX_LENGTH}
            editable={left > 0}
            placeholder="Talk to Future You"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            keyboardAppearance="dark"
            maxFontSizeMultiplier={maxFontScale.input}
            style={styles.input}
            accessibilityLabel="Message to your coach"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !draft.trim() || send.isPending || left === 0 }}
            disabled={!draft.trim() || send.isPending || left === 0}
            onPress={() => submit(draft)}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || send.isPending || left === 0) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {send.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Intro({ name }: { name: string }) {
  return (
    <View style={styles.intro}>
      <AppText variant="title">Hey {name}, it’s you, from Day 60.</AppText>
      <AppText variant="muted">
        I know today’s quests, your Day X and your last week. Ask me to plan the day, shrink it on a
        low-energy day, or get back on track after a miss. Only you can see this chat.
      </AppText>
    </View>
  );
}

function Bubble({ row }: { row: Row }) {
  if (row.role === 'typing') {
    return (
      <View style={[styles.bubble, styles.coach]}>
        <AppText variant="muted">Future You is typing…</AppText>
      </View>
    );
  }
  const mine = row.role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.coach]}>
      <AppText style={[styles.text, mine && styles.mineText]} selectable>
        {row.content}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: space.md,
  },
  padded: { padding: space.lg },
  list: { padding: space.md, gap: space.sm, flexGrow: 1 },
  intro: { gap: space.sm, paddingVertical: space.lg },
  bubble: { maxWidth: '85%', borderRadius: radius.md, padding: space.md },
  coach: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  mineText: { color: colors.onAccent },
  composer: {
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  chips: { gap: space.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minHeight: touch,
    maxHeight: 140,
    paddingHorizontal: space.md,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  send: {
    width: touch,
    height: touch,
    borderRadius: touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
