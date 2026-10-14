import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { profileKey, type Profile } from '@/hooks/useProfile';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Invite = Tables<'pair_invites'>;

const partnerKey = (pairId: string | null) => ['partner', pairId] as const;
const inviteKey = (userId: string) => ['invite', userId] as const;

/** Your partner's profile (readable through RLS while you share a pair), or null. */
export function usePartner(me: Profile) {
  return useQuery({
    queryKey: partnerKey(me.pair_id),
    enabled: !!me.pair_id,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('pair_id', me.pair_id!)
        .neq('id', me.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Your live (unused, unexpired) invite code, if any. */
export function useLiveInvite(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: inviteKey(userId),
    enabled,
    queryFn: async (): Promise<Invite | null> => {
      const { data, error } = await supabase
        .from('pair_invites')
        .select('*')
        .eq('created_by', userId)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateInvite(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_invite');
      if (error) throw error;
      return data;
    },
    onSuccess: (invite) => queryClient.setQueryData(inviteKey(userId), invite),
  });
}

/** Redeem or unpair, then reload your profile so the new pair_id flows through. */
function usePairingMutation<TVars>(userId: string, run: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}

export function useRedeemInvite(userId: string) {
  return usePairingMutation(userId, async (code: string) => {
    const { error } = await supabase.rpc('redeem_invite', { invite_code: code });
    if (error) throw error;
  });
}

export function useUnpair(userId: string) {
  return usePairingMutation(userId, async () => {
    const { error } = await supabase.rpc('unpair');
    if (error) throw error;
  });
}
