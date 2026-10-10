import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string;
  season_start: string; // YYYY-MM-DD
  timezone: string;
  pair_id: string | null;
  created_at: string;
};

export type ProfileInput = Pick<Profile, 'display_name' | 'season_start' | 'timezone'>;

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

/** The signed-in user's profile, or `null` if they haven't finished onboarding. */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Creates the profile on onboarding, or updates it from Settings. */
export function useSaveProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProfileInput): Promise<Profile> => {
      if (!userId) throw new Error('Not signed in');
      // Insert and update are separate so the column-level grants on `profiles`
      // never need to allow updating `id` (an upsert would set every column).
      const exists = !!queryClient.getQueryData<Profile | null>(profileKey(userId));
      const query = exists
        ? supabase.from('profiles').update(input).eq('id', userId)
        : supabase.from('profiles').insert({ id: userId, ...input });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(userId), profile);
    },
  });
}
