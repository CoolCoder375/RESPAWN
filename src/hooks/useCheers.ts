import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/Toast';
import { useRealtimeRefetch } from '@/hooks/useRealtime';
import type { Tables } from '@/lib/database.types';
import { localDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

export type Cheer = Tables<'cheers'>;

/** The preset messages; the database only accepts these. */
export const CHEERS = ['Keep going', 'Proud of you', 'You’ve got this'] as const;
/** The database stores a straight apostrophe. */
const toDb = (message: string) => message.replace('’', "'");

export const CHEERS_PER_DAY = 5;

const unseenKey = (userId: string) => ['cheers', 'unseen', userId] as const;

/** Older cheers don't show in the banner; they're marked seen with the next dismissal. */
const BANNER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const sentKey = (userId: string) => ['cheers', 'sent', userId] as const;

/** Cheers from the last day that you haven't dismissed. Updates live. */
export function useUnseenCheers(userId: string) {
  useRealtimeRefetch('cheers', `to_user=eq.${userId}`, unseenKey(userId));
  return useQuery({
    queryKey: unseenKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cheers')
        .select('*')
        .eq('to_user', userId)
        .is('seen_at', null)
        .gte('created_at', new Date(Date.now() - BANNER_MAX_AGE_MS).toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDismissCheers(userId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    // A dismissal that fails would bring the banner back on the next refetch.
    retry: 3,
    mutationFn: async () => {
      const { error } = await supabase
        .from('cheers')
        .update({ seen_at: new Date().toISOString() })
        .eq('to_user', userId)
        .is('seen_at', null);
      if (error) throw error;
    },
    onMutate: () => queryClient.setQueryData(unseenKey(userId), []),
    onError: (error) => toast.show(`Couldn’t clear the cheer: ${error.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: unseenKey(userId) }),
  });
}

/** How many cheers you've sent on your local day (the server allows 5). */
export function useCheersSentToday(userId: string, timezone: string, today: string) {
  return useQuery({
    queryKey: [...sentKey(userId), today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cheers')
        .select('created_at')
        .eq('from_user', userId)
        .order('created_at', { ascending: false })
        .limit(CHEERS_PER_DAY);
      if (error) throw error;
      return data.filter((c) => localDay(timezone, new Date(c.created_at)) === today).length;
    },
  });
}

export function useSendCheer(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ to, message }: { to: string; message: string }) => {
      const { data, error } = await supabase
        .from('cheers')
        .insert({ to_user: to, message: toDb(message) })
        .select('id')
        .single();
      if (error) throw error;
      // Push it to their phone. The cheer is saved either way; the banner shows it in the app.
      supabase.functions
        .invoke('notify', { body: { cheer_id: data.id } })
        .catch((e) => console.warn('Cheer push failed', e));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: sentKey(userId) }),
  });
}

export function displayCheer(message: string) {
  return message.replace("'", '’');
}
