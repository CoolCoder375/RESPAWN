import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth';

/** A saved verse, by Verse.id. Stored on this device only. */
export type SavedVerse = { id: string; savedAt: string };

const storageKey = (userId: string) => `respawn:saved-verses:${userId}`;
const savedKey = (userId: string) => ['saved-verses', userId] as const;

async function readSaved(userId: string): Promise<SavedVerse[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is SavedVerse => typeof s?.id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function useSavedThoughts() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: savedKey(userId),
    queryFn: () => readSaved(userId),
    staleTime: Infinity,
  });

  // Save if not saved, unsave if saved. Newest first.
  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const current = await readSaved(userId);
      const next = current.some((s) => s.id === id)
        ? current.filter((s) => s.id !== id)
        : [{ id, savedAt: new Date().toISOString() }, ...current];
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(savedKey(userId), next),
  });

  const saved = query.data ?? [];
  return {
    saved,
    isSaved: (id: string) => saved.some((s) => s.id === id),
    toggle: (id: string) => toggle.mutate(id),
  };
}
