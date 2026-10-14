import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { questsKey } from '@/hooks/useQuests';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type JournalEntry = Tables<'journal_entries'>;

export const journalKey = (userId: string) => ['journal', userId] as const;

/** Your journal, newest first. Private: not even your partner can read it. */
export function useJournal(userId: string) {
  return useQuery({
    queryKey: journalKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('day', { ascending: false })
        .limit(120);
      if (error) throw error;
      return data;
    },
  });
}

/** Save today's entry. The server ticks or unticks the journal quest from the line count. */
export function useSaveJournal(userId: string, today: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc('save_journal', { day: today, body });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: journalKey(userId) }),
        queryClient.invalidateQueries({ queryKey: questsKey(userId, today) }),
      ]),
  });
}
