import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type CoachMessage = Pick<Tables<'coach_messages'>, 'id' | 'role' | 'content' | 'created_at'>;

/** Messages per day, enforced by the coach Edge Function (supabase/functions/coach). */
export const COACH_DAILY_LIMIT = 30;
export const COACH_MAX_LENGTH = 1000;

const OFFLINE = 'Coach is offline right now, try again in a minute.';

export const coachKey = (userId: string) => ['coach', userId] as const;

/** Your chat with Future You, newest first. Private to you. */
export function useCoachMessages(userId: string) {
  return useQuery({
    queryKey: coachKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_messages')
        .select('id, role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Send a message to the coach. The Edge Function adds your context, asks Gemini and saves both
 * messages; nothing is saved if it fails, so the caller keeps the typed text.
 */
export function useSendCoach(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke<{ messages: CoachMessage[] }>(
        'coach',
        { body: { message } },
      );
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : OFFLINE);
        }
        throw new Error(OFFLINE);
      }
      return data?.messages ?? [];
    },
    onSuccess: (messages) => {
      queryClient.setQueryData<CoachMessage[]>(coachKey(userId), (old) => [
        ...[...messages].reverse(),
        ...(old ?? []),
      ]);
      queryClient.invalidateQueries({ queryKey: coachKey(userId) });
    },
  });
}
