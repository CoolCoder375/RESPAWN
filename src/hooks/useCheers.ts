import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
const sentKey = (userId: string) => ['cheers', 'sent', userId] as const;

/** Cheers sent to you that you haven't dismissed. Updates live. */
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
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDismissCheers(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cheers')
        .update({ seen_at: new Date().toISOString() })
        .eq('to_user', userId)
        .is('seen_at', null);
      if (error) throw error;
    },
    onMutate: () => queryClient.setQueryData(unseenKey(userId), []),
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
      const { error } = await supabase
        .from('cheers')
        .insert({ to_user: to, message: toDb(message) });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: sentKey(userId) }),
  });
}

export function displayCheer(message: string) {
  return message.replace("'", '’');
}
