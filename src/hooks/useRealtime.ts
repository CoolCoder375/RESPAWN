import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Refetches `queryKey` whenever a row in `table` matching `filter` changes.
 * RLS applies, so you only hear about rows you're allowed to read.
 */
export function useRealtimeRefetch(
  table: 'quests' | 'cheers',
  filter: string | null,
  queryKey: QueryKey,
) {
  const queryClient = useQueryClient();
  const keyString = JSON.stringify(queryKey);

  useEffect(() => {
    if (!filter) return;
    const key = JSON.parse(keyString) as QueryKey;
    const channel = supabase
      .channel(`${table}:${filter}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => {
        queryClient.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, keyString, queryClient]);
}
