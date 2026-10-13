import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { useSubmitAnswers } from '@/hooks/useQuestionnaire';
import { isAnswered, QUESTIONS, type Answers, type Question } from '@/lib/questionnaire';
import { colors, fonts, radius, space, touch } from '@/theme';

/** 20 tap-only questions, one per screen, then a confirm step. */
export default function Questionnaire() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const submit = useSubmitAnswers();

  const total = QUESTIONS.length;
  const reviewing = index === total;

  function next() {
    setIndex((i) => Math.min(i + 1, total));
  }

  function pickSingle(question: Question, value: string) {
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, [question.id]: value }));
    next();
  }

  function toggleMulti(question: Question, value: string) {
    const current = (answers[question.id] as string[] | undefined) ?? [];
    let picked: string[];
    if (current.includes(value)) picked = current.filter((v) => v !== value);
    else if (current.length < (question.maxPicks ?? 1)) picked = [...current, value];
    else return;
    Haptics.selectionAsync();
    setAnswers((a) => ({ ...a, [question.id]: picked }));
  }

  if (reviewing) {
    return (
      <Screen>
        <View style={styles.hero}>
          <AppText variant="display">Ready to respawn</AppText>
          <AppText variant="muted">
            Respawn will now set your quests every day from these answers. You can’t add, edit or
            skip quests, and the answers stay fixed for this season.
          </AppText>
        </View>
        {submit.isError ? <AppText color={colors.danger}>{submit.error.message}</AppText> : null}
        <View style={styles.actions}>
          <Button
            title="Start my quests"
            loading={submit.isPending}
            onPress={() => submit.mutate(answers)}
          />
          <Button
            title="Change an answer"
            variant="ghost"
            disabled={submit.isPending}
            onPress={() => setIndex(total - 1)}
          />
        </View>
      </Screen>
    );
  }

  const question = QUESTIONS[index];
  const answer = answers[question.id];
  const multi = !!question.maxPicks;

  return (
    <Screen>
      <View style={styles.progress}>
        <View style={styles.progressRow}>
          <AppText variant="label">{question.section}</AppText>
          <AppText variant="label">
            {index + 1} / {total}
          </AppText>
        </View>
        <ProgressBar value={index} max={total} />
      </View>

      <View style={styles.hero}>
        <AppText variant="title" style={styles.question}>
          {question.text}
        </AppText>
        {multi ? (
          <AppText variant="muted">
            {question.maxPicks === question.options.length
              ? 'Pick all that apply.'
              : `Pick up to ${question.maxPicks}.`}
          </AppText>
        ) : null}
      </View>

      <View style={styles.options}>
        {question.options.map((option) => {
          const selected = multi
            ? Array.isArray(answer) && answer.includes(option.value)
            : answer === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: selected }}
              onPress={() =>
                multi ? toggleMulti(question, option.value) : pickSingle(question, option.value)
              }
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option.label}
              </AppText>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.onAccent} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.nav}>
        {index > 0 ? (
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setIndex((i) => i - 1)}
            style={styles.flex}
          />
        ) : null}
        {multi || isAnswered(question, answer) ? (
          <Button
            title="Next"
            disabled={!isAnswered(question, answer)}
            onPress={next}
            style={styles.flex}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { gap: space.sm, marginTop: space.md },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hero: { gap: space.sm, marginTop: space.md },
  question: { fontSize: 22, lineHeight: 30 },
  options: { gap: space.sm },
  option: {
    minHeight: touch + 8,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  optionTextSelected: { color: colors.onAccent },
  pressed: { opacity: 0.8 },
  nav: { flexDirection: 'row', gap: space.sm, marginTop: 'auto' },
  flex: { flex: 1 },
  actions: { gap: space.sm },
});
