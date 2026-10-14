import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { PairingPanel } from '@/components/PairingPanel';
import { PlayerCard } from '@/components/PlayerCard';
import { QuestRow } from '@/components/QuestRow';
import { Screen } from '@/components/Screen';
import { CHEERS, CHEERS_PER_DAY, useCheersSentToday, useSendCheer } from '@/hooks/useCheers';
import { useLocalDay } from '@/hooks/useLocalDay';
import { profileKey, useProfile, type Profile } from '@/hooks/useProfile';
import { usePartner } from '@/hooks/usePartner';
import {
  dayStatus,
  usePartnerQuests,
  useRunThroughYesterday,
  useTodayQuests,
} from '@/hooks/useQuests';
import { colors, space } from '@/theme';

export default function DuoScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  return <Duo me={profile} />;
}

function Duo({ me }: { me: Profile }) {
  const queryClient = useQueryClient();
  const partner = usePartner(me);

  // Pairing and unpairing happen on the other phone too, so recheck the profile on focus.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: profileKey(me.id) });
    }, [queryClient, me.id]),
  );

  if (!me.pair_id) {
    return (
      <Screen edges={[]}>
        <PairingPanel me={me} />
      </Screen>
    );
  }

  if (partner.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (partner.isError || !partner.data) {
    return (
      <Screen edges={[]}>
        <AppText variant="title">Couldn’t load your partner</AppText>
        {partner.isError ? <AppText variant="muted">{partner.error.message}</AppText> : null}
        <Button
          title="Try again"
          onPress={() => {
            partner.refetch();
            queryClient.invalidateQueries({ queryKey: profileKey(me.id) });
          }}
        />
      </Screen>
    );
  }

  return <Paired me={me} partner={partner.data} />;
}

function Paired({ me, partner }: { me: Profile; partner: Profile }) {
  const myToday = useLocalDay(me.timezone);
  const theirToday = useLocalDay(partner.timezone);

  const myQuests = useTodayQuests(me.id, myToday);
  const myRun = useRunThroughYesterday(me.id, myToday);
  const theirQuests = usePartnerQuests(partner.id, theirToday);
  const theirRun = useRunThroughYesterday(partner.id, theirToday);

  const mine = myQuests.data ?? [];
  const theirs = theirQuests.data ?? [];

  const myStatus = mine.length ? dayStatus(mine, myRun.data ?? 0, me.season_start, myToday) : null;
  const theirStatus = theirs.length
    ? dayStatus(theirs, theirRun.data ?? 0, partner.season_start, theirToday)
    : null;

  return (
    <Screen edges={[]}>
      <View style={styles.cards}>
        <PlayerCard label="You" name={me.display_name} status={myStatus} total={mine.length} />
        <PlayerCard
          label="Partner"
          name={partner.display_name}
          status={theirStatus}
          total={theirs.length}
        />
      </View>

      <Cheers me={me} partner={partner} today={myToday} />

      <View style={styles.list}>
        <AppText variant="label">{partner.display_name}’s quests today</AppText>
        {theirQuests.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : theirQuests.isError ? (
          <AppText variant="muted">{theirQuests.error.message}</AppText>
        ) : theirs.length === 0 ? (
          <AppText variant="muted">
            {partner.display_name} hasn’t opened Respawn today yet. Their quests appear once they
            do.
          </AppText>
        ) : (
          theirs.map((quest) => <QuestRow key={quest.id} quest={quest} />)
        )}
      </View>
    </Screen>
  );
}

function Cheers({ me, partner, today }: { me: Profile; partner: Profile; today: string }) {
  const sent = useCheersSentToday(me.id, me.timezone, today);
  const send = useSendCheer(me.id);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const left = Math.max(CHEERS_PER_DAY - (sent.data ?? 0), 0);

  function cheer(message: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLastSent(null);
    send.mutate({ to: partner.id, message }, { onSuccess: () => setLastSent(message) });
  }

  return (
    <View style={styles.list}>
      <View style={styles.row}>
        <AppText variant="label">Cheer {partner.display_name}</AppText>
        <AppText variant="label">{left} left today</AppText>
      </View>
      <View style={styles.cheers}>
        {CHEERS.map((message) => (
          <Button
            key={message}
            title={message}
            variant="ghost"
            disabled={left === 0 || send.isPending}
            onPress={() => cheer(message)}
            style={styles.cheer}
          />
        ))}
      </View>
      {send.isError ? (
        <AppText color={colors.danger}>{send.error.message}</AppText>
      ) : lastSent ? (
        <AppText variant="muted">
          Sent “{lastSent}”. {partner.display_name} sees it on their Today tab.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  cards: { flexDirection: 'row', gap: space.sm },
  list: { gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cheers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cheer: { flexGrow: 1, paddingHorizontal: space.md },
});
