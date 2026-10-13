import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { QuestRow } from '@/components/QuestRow';
import { Screen } from '@/components/Screen';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useProfile, type Profile } from '@/hooks/useProfile';
import {
  dayStatus,
  useRunThroughYesterday,
  useTickQuest,
  useTodayQuests,
  type Quest,
} from '@/hooks/useQuests';
import { SEASON_LENGTH } from '@/lib/dates';
import type { DayScore } from '@/lib/points';
import { colors, fonts, space } from '@/theme';

const TIERS = ['Foundation', 'Build', 'Push', 'Master'];

export default function TodayScreen() {
  const { data: profile } = useProfile();
  // The auth gate only shows the tabs once the profile exists.
  if (!profile) return null;
  return <Today profile={profile} />;
}

function Today({ profile }: { profile: Profile }) {
  const userId = profile.id;
  const today = useLocalDay(profile.timezone);
  const questsQuery = useTodayQuests(userId, today);
  const pastRun = useRunThroughYesterday(userId, today);
  const tick = useTickQuest(userId, today);

  if (questsQuery.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (questsQuery.isError) {
    return (
      <Screen edges={[]}>
        <AppText variant="title">Couldn’t load today’s quests</AppText>
        <AppText variant="muted">{questsQuery.error.message}</AppText>
        <Button title="Try again" onPress={() => questsQuery.refetch()} />
      </Screen>
    );
  }

  const quests = questsQuery.data;
  const { score, run, seasonDay, day } = dayStatus(
    quests,
    pastRun.data ?? 0,
    profile.season_start,
    today,
  );
  const tier = quests[0]?.tier;

  function toggle(quest: Quest) {
    const done = !quest.done_at;
    const securesToday = done && !score.counts && (score.earned + quest.rp) * 2 >= score.possible;
    if (securesToday) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    tick(quest, done);
  }

  return (
    <Screen edges={[]}>
      <View style={styles.header}>
        <AppText variant="label">Hey {profile.display_name}</AppText>
        <SeasonTitle day={seasonDay < 1 ? seasonDay : day} />
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="flame" size={18} color={colors.focus} />
            <AppText style={styles.statText}>{run.streak} day streak</AppText>
          </View>
          <AppText style={styles.statText}>
            {score.earned} / {score.possible} RP
          </AppText>
        </View>
        <ProgressBar value={score.earned} max={score.possible} marker={score.needed} />
        <AppText variant="muted">{statusLine(score, run.day)}</AppText>
      </View>

      <View style={styles.list}>
        <View style={styles.listHeader}>
          <AppText variant="label">Today’s quests</AppText>
          {tier ? <AppText variant="label">{TIERS[tier - 1]} tier</AppText> : null}
        </View>
        {quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} onToggle={() => toggle(quest)} />
        ))}
      </View>

      <View style={styles.note}>
        <Ionicons name="lock-closed" size={14} color={colors.muted} />
        <AppText variant="muted" style={styles.noteText}>
          Quests are set by Respawn from your answers and get harder as your run grows. Tick only
          what you’ve really done.
        </AppText>
      </View>
    </Screen>
  );
}

function statusLine(score: DayScore, runDay: number): string {
  if (score.counts) return 'Today counts. Every extra RP is a bonus.';
  const left = score.needed - score.earned;
  const rp = `${left} more RP`;
  return runDay > 1
    ? `Earn ${rp} today to keep your run, or it's back to Day 1.`
    : `Earn ${rp} to lock in today.`;
}

function SeasonTitle({ day }: { day: number }) {
  if (day < 1) {
    const daysLeft = 1 - day;
    return (
      <AppText variant="display">
        Starts in{' '}
        <AppText variant="display" color={colors.accent}>
          {daysLeft}
        </AppText>{' '}
        {daysLeft === 1 ? 'day' : 'days'}
      </AppText>
    );
  }
  if (day > SEASON_LENGTH) {
    return (
      <AppText variant="display">
        Season{' '}
        <AppText variant="display" color={colors.accent}>
          done
        </AppText>
      </AppText>
    );
  }
  return (
    <AppText variant="display">
      Day{' '}
      <AppText variant="display" color={colors.accent}>
        {day}
      </AppText>{' '}
      of {SEASON_LENGTH}
    </AppText>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { gap: space.sm },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statText: { fontFamily: fonts.bodyMedium, color: colors.text },
  list: { gap: space.sm },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  noteText: { flex: 1 },
});
