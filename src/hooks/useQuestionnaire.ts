import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import type { Answers } from '@/lib/questionnaire';
import { supabase } from '@/lib/supabase';

const answeredKey = (userId: string | undefined) => ['questionnaire', userId] as const;

/** Whether the signed-in user has answered the questionnaire. */
export function useHasAnswered() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: answeredKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questionnaires')
        .select('user_id')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

/** Saves the answers once; the server validates them (submit_questionnaire). */
export function useSubmitAnswers() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (answers: Answers) => {
      const { error } = await supabase.rpc('submit_questionnaire', { answers });
      if (error) throw error;
    },
    onSuccess: () => queryClient.setQueryData(answeredKey(userId), true),
  });
}
