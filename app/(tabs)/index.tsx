import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AddTaskForm } from '@/components/AddTaskForm';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyTasks } from '@/components/EmptyTasks';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { TaskEditor } from '@/components/TaskEditor';
import { TaskRow } from '@/components/TaskRow';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useProfile, type Profile } from '@/hooks/useProfile';
import {
  splitDay,
  useDay,
  useRunThroughYesterday,
  useTaskActions,
  type DayTask,
  type NewTask,
  type Task,
} from '@/hooks/useTasks';
import { dayOfSeason, SEASON_LENGTH } from '@/lib/dates';
import { runStatus, type DayScore } from '@/lib/points';
import { colors, fonts, space } from '@/theme';

export default function TodayScreen() {
  const { data: profile } = useProfile();
  // The auth gate only shows the tabs once the profile exists.
  if (!profile) return null;
  return <Today profile={profile} />;
}

function Today({ profile }: { profile: Profile }) {
  const userId = profile.id;
  const today = useLocalDay(profile.timezone);
  const dayQuery = useDay(userId, today);
  const pastRun = useRunThroughYesterday(userId, today);
  const actions = useTaskActions(userId, today);
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);

  const seasonDay = dayOfSeason(profile.season_start, today);

  if (dayQuery.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (dayQuery.isError) {
    return (
      <Screen edges={[]}>
        <AppText variant="title">Couldn’t load today’s tasks</AppText>
        <AppText variant="muted">{dayQuery.error.message}</AppText>
        <Button title="Try again" onPress={() => dayQuery.refetch()} />
      </Screen>
    );
  }

  const data = dayQuery.data;
  const { list, finished, score } = splitDay(data, today);
  const run = runStatus(pastRun.data ?? 0, score.counts);
  // Day X is your current run, but never beyond the days since your season started.
  const day = Math.min(run.day, seasonDay);

  function toggle(task: DayTask) {
    const done = !task.done;
    const securesToday =
      done &&
      task.kind === 'daily' &&
      !score.counts &&
      (score.earned + task.priority) * 2 >= score.possible;
    if (securesToday) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    actions.toggle(task, done);
  }

  function add(task: NewTask) {
    actions.add(task, data.tasks);
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

      {list.length === 0 ? (
        <EmptyTasks onAdd={add} />
      ) : (
        <View style={styles.list}>
          {list.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggle(task)}
              onPress={() => setEditing(task)}
            />
          ))}
        </View>
      )}

      <AddTaskForm onAdd={add} />

      {finished.length > 0 ? (
        <View style={styles.list}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone((v) => !v)}
            style={styles.doneHeader}
          >
            <AppText variant="label">Done ({finished.length})</AppText>
            <Ionicons
              name={showDone ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.muted}
            />
          </Pressable>
          {showDone
            ? finished.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggle(task)}
                  onPress={() => setEditing(task)}
                />
              ))
            : null}
        </View>
      ) : null}

      <TaskEditor
        task={editing}
        onClose={() => setEditing(null)}
        onSave={(changes) => {
          if (editing) actions.edit(editing.id, changes);
          setEditing(null);
        }}
        onDelete={() => {
          if (editing) actions.archive(editing.id);
          setEditing(null);
        }}
      />
    </Screen>
  );
}

function statusLine(score: DayScore, runDay: number): string {
  if (score.possible === 0) return 'Add a daily task to start your run.';
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
  doneHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
