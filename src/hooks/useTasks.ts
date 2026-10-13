import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useToast } from '@/components/Toast';
import type { Category } from '@/lib/categories';
import { addDays } from '@/lib/dates';
import type { Tables } from '@/lib/database.types';
import { asPriority, scoreDay, type Priority } from '@/lib/points';
import { supabase } from '@/lib/supabase';

export type TaskKind = 'daily' | 'once';

export type Task = Pick<
  Tables<'tasks'>,
  'id' | 'user_id' | 'title' | 'category' | 'position' | 'created_at'
> & { kind: TaskKind; priority: Priority };

/** Everything the Today screen needs for one user on one local day. */
export type DayData = {
  tasks: Task[];
  /** Ids of tasks completed on this day. */
  doneToday: string[];
  /** One-off tasks that are done, mapped to the day they were completed. */
  onceDoneOn: Record<string, string>;
};

export type DayTask = Task & { done: boolean };

const TASK_COLUMNS = 'id, user_id, title, kind, category, priority, position, created_at';

export const dayKey = (userId: string, day: string) => ['day', userId, day] as const;
export const runKey = (userId: string, day: string) => ['run', userId, day] as const;

/** Works for the signed-in user and (read-only, via RLS) for their partner. */
export async function fetchDay(userId: string, day: string): Promise<DayData> {
  const [tasks, today, once] = await Promise.all([
    supabase
      .from('tasks')
      .select(TASK_COLUMNS)
      .eq('user_id', userId)
      .eq('archived', false)
      .order('position')
      .order('created_at'),
    supabase.from('task_completions').select('task_id').eq('user_id', userId).eq('day', day),
    supabase
      .from('task_completions')
      .select('task_id, day, tasks!inner(kind)')
      .eq('user_id', userId)
      .eq('tasks.kind', 'once'),
  ]);
  if (tasks.error) throw tasks.error;
  if (today.error) throw today.error;
  if (once.error) throw once.error;

  const onceDoneOn: Record<string, string> = {};
  for (const c of once.data) {
    if (!onceDoneOn[c.task_id] || c.day < onceDoneOn[c.task_id]) onceDoneOn[c.task_id] = c.day;
  }

  return {
    tasks: tasks.data.map((t) => ({
      ...t,
      kind: t.kind as TaskKind,
      priority: asPriority(t.priority),
    })),
    doneToday: today.data.map((c) => c.task_id),
    onceDoneOn,
  };
}

/** Highest RP first, then the user's own order. */
function byPriority(a: Task, b: Task) {
  return b.priority - a.priority || a.position - b.position;
}

/**
 * Splits a day into the main list (daily tasks + one-offs not finished before today),
 * the Done list (one-offs finished on an earlier day), and the day's RP score.
 */
export function splitDay(data: DayData, day: string) {
  const doneToday = new Set(data.doneToday);
  const list: DayTask[] = [];
  const finished: DayTask[] = [];

  for (const task of [...data.tasks].sort(byPriority)) {
    if (task.kind === 'daily') {
      list.push({ ...task, done: doneToday.has(task.id) });
    } else {
      const doneOn = data.onceDoneOn[task.id];
      if (doneOn && doneOn < day) finished.push({ ...task, done: true });
      else list.push({ ...task, done: !!doneOn });
    }
  }

  const done = list.filter((t) => t.done).length;
  return {
    list,
    finished,
    progress: { done, total: list.length },
    score: scoreDay(list.filter((t) => t.kind === 'daily')),
  };
}

export function useDay(userId: string, day: string) {
  return useQuery({ queryKey: dayKey(userId, day), queryFn: () => fetchDay(userId, day) });
}

/** Consecutive counting days up to and including yesterday (today is scored live). */
export function useRunThroughYesterday(userId: string, today: string) {
  return useQuery({
    queryKey: runKey(userId, today),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('run_length', {
        target: userId,
        through: addDays(today, -1),
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * A mutation that updates the cached day immediately, writes to Supabase,
 * and rolls back with a toast if the write fails.
 */
function useOptimisticDayMutation<TVars>(
  userId: string,
  day: string,
  write: (vars: TVars) => Promise<void>,
  apply: (data: DayData, vars: TVars) => DayData,
  errorMessage: string,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = dayKey(userId, day);

  return useMutation({
    mutationKey: ['day-write', userId],
    mutationFn: write,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DayData>(key);
      if (previous) queryClient.setQueryData<DayData>(key, apply(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.show(errorMessage);
    },
    onSettled: () => {
      // Refetch only after the last in-flight write, so rapid ticks don't flicker.
      if (queryClient.isMutating({ mutationKey: ['day-write', userId] }) === 1) {
        queryClient.invalidateQueries({ queryKey: key });
        // Priority edits re-score past days, so refresh the run too.
        queryClient.invalidateQueries({ queryKey: runKey(userId, day) });
      }
    },
  });
}

async function check<T extends { error: { code?: string; message: string } | null }>(
  request: PromiseLike<T>,
  ignoreCodes: string[] = [],
) {
  const { error } = await request;
  if (error && !ignoreCodes.includes(error.code ?? '')) throw error;
}

export type NewTask = {
  title: string;
  kind: TaskKind;
  category: Category | null;
  priority: Priority;
};

export type TaskChanges = Pick<Task, 'title' | 'priority'> & { category: Category | null };

/** Add / tick / edit / archive for the signed-in user's tasks on `day`. */
export function useTaskActions(userId: string, day: string) {
  const toggle = useOptimisticDayMutation<{ task: Task; done: boolean }>(
    userId,
    day,
    async ({ task, done }) => {
      if (done) {
        // 23505 = already ticked (e.g. double tap); that's fine.
        await check(supabase.from('task_completions').insert({ task_id: task.id, day }), ['23505']);
      } else {
        let query = supabase.from('task_completions').delete().eq('task_id', task.id);
        // A one-off is "done" by any completion, so unticking clears them all.
        if (task.kind === 'daily') query = query.eq('day', day);
        await check(query);
      }
    },
    (data, { task, done }) => {
      const doneToday = data.doneToday.filter((id) => id !== task.id);
      if (done) doneToday.push(task.id);
      const onceDoneOn = { ...data.onceDoneOn };
      if (task.kind === 'once') {
        if (done) onceDoneOn[task.id] = day;
        else delete onceDoneOn[task.id];
      }
      return { ...data, doneToday, onceDoneOn };
    },
    'Couldn’t save that tick. Check your connection and try again.',
  );

  const add = useOptimisticDayMutation<NewTask & { id: string; position: number }>(
    userId,
    day,
    async ({ id, title, kind, category, priority, position }) => {
      await check(supabase.from('tasks').insert({ id, title, kind, category, priority, position }));
    },
    (data, task) => ({
      ...data,
      tasks: [...data.tasks, { ...task, user_id: userId, created_at: new Date().toISOString() }],
    }),
    'Couldn’t add that task. Try again.',
  );

  const edit = useOptimisticDayMutation<{ id: string; changes: TaskChanges }>(
    userId,
    day,
    async ({ id, changes }) => {
      await check(supabase.from('tasks').update(changes).eq('id', id));
    },
    (data, { id, changes }) => ({
      ...data,
      tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }),
    'Couldn’t save your changes. Try again.',
  );

  // Archived, not deleted, so completion history (and streaks) survive.
  const archive = useOptimisticDayMutation<{ id: string }>(
    userId,
    day,
    async ({ id }) => {
      await check(supabase.from('tasks').update({ archived: true }).eq('id', id));
    },
    (data, { id }) => ({ ...data, tasks: data.tasks.filter((t) => t.id !== id) }),
    'Couldn’t delete that task. Try again.',
  );

  return {
    toggle: (task: Task, done: boolean) => toggle.mutate({ task, done }),
    add: (task: NewTask, existing: Task[]) =>
      add.mutate({
        ...task,
        id: Crypto.randomUUID(),
        position: existing.reduce((max, t) => Math.max(max, t.position), -1) + 1,
      }),
    edit: (id: string, changes: TaskChanges) => edit.mutate({ id, changes }),
    archive: (id: string) => archive.mutate({ id }),
  };
}
