import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/Toast';
import { useRealtimeRefetch } from '@/hooks/useRealtime';
import { addDays, dayOfSeason } from '@/lib/dates';
import type { Tables } from '@/lib/database.types';
import { runStatus, scoreDay } from '@/lib/points';
import { supabase } from '@/lib/supabase';

export type Quest = Tables<'quests'>;

export const questsKey = (userId: string, day: string) => ['quests', userId, day] as const;
export const runKey = (userId: string, day: string) => ['run', userId, day] as const;

/**
 * The signed-in user's quests for today. The server generates them on the first call of the
 * local day (assign_quests) and returns the same ones after that.
 */
export function useTodayQuests(userId: string, today: string) {
  return useQuery({
    queryKey: questsKey(userId, today),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assign_quests');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Your partner's quests for their local day, read-only, refreshed live as they tick.
 * Empty until they open Respawn that day (that's when quests are generated).
 */
export function usePartnerQuests(partnerId: string, day: string) {
  const key = questsKey(partnerId, day);
  useRealtimeRefetch('quests', `user_id=eq.${partnerId}`, key);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quests')
        .select('*')
        .eq('user_id', partnerId)
        .eq('day', day)
        .order('slot');
      if (error) throw error;
      return data;
    },
  });
}

/** Today's RP score, Day X and streak, the same way for you and your partner. */
export function dayStatus(
  quests: Quest[],
  runThroughYesterday: number,
  seasonStart: string,
  today: string,
) {
  const score = scoreDay(quests.map((q) => ({ rp: q.rp, done: !!q.done_at })));
  const run = runStatus(runThroughYesterday, score.counts);
  const seasonDay = dayOfSeason(seasonStart, today);
  return {
    score,
    run,
    seasonDay,
    // Day X is the current run, but never beyond the days since the season started.
    day: Math.min(run.day, seasonDay),
    done: quests.filter((q) => q.done_at).length,
  };
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

/** Tick or untick a quest: updates the screen at once, rolls back with a toast on failure. */
export function useTickQuest(userId: string, today: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = questsKey(userId, today);
  const mutationKey = ['quest-tick', userId];

  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.rpc('set_quest_done', { quest: id, done });
      if (error) throw error;
    },
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Quest[]>(key);
      if (previous) {
        queryClient.setQueryData<Quest[]>(
          key,
          previous.map((q) =>
            q.id === id ? { ...q, done_at: done ? new Date().toISOString() : null } : q,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.show('Couldn’t save that tick. Check your connection and try again.');
    },
    onSettled: () => {
      // Refetch only after the last in-flight tick, so rapid taps don't flicker.
      if (queryClient.isMutating({ mutationKey }) === 1) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  return (quest: Quest, done: boolean) => mutation.mutate({ id: quest.id, done });
}
