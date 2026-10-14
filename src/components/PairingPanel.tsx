import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { profileKey, type Profile } from '@/hooks/useProfile';
import { useCreateInvite, useLiveInvite, useRedeemInvite } from '@/hooks/usePartner';
import { colors, fonts, radius, space } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { TextField } from './TextField';

/** Unpaired Duo tab: share your invite code, or enter your partner's. */
export function PairingPanel({ me }: { me: Profile }) {
  const queryClient = useQueryClient();
  const invite = useLiveInvite(me.id, true);
  const create = useCreateInvite(me.id);
  const redeem = useRedeemInvite(me.id);
  const [code, setCode] = useState('');

  const live = invite.data;

  // While your code is out there, check every few seconds whether your partner has used it.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: profileKey(me.id) });
    }, 5000);
    return () => clearInterval(timer);
  }, [live, me.id, queryClient]);

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <AppText variant="display">Find your duo</AppText>
        <AppText variant="muted">
          One partner who sees your quests and streak, and cheers you on. They never see your coach
          chats or questionnaire answers.
        </AppText>
      </View>

      <View style={styles.card}>
        <AppText variant="label">Invite your partner</AppText>
        {live ? (
          <>
            <AppText
              style={styles.code}
              selectable
              accessibilityLabel={live.code.split('').join(' ')}
            >
              {live.code}
            </AppText>
            <AppText variant="muted">
              Valid until {formatExpiry(live.expires_at)}. Works once. This screen updates when they
              join.
            </AppText>
            <Button
              title="Share code"
              onPress={() =>
                Share.share({
                  message: `Join me on Respawn. Open the Duo tab and enter this code: ${live.code}`,
                })
              }
            />
            <Button
              title="New code"
              variant="ghost"
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          </>
        ) : (
          <Button
            title="Create invite code"
            loading={create.isPending || invite.isPending}
            onPress={() => create.mutate()}
          />
        )}
        {create.isError ? <AppText color={colors.danger}>{create.error.message}</AppText> : null}
      </View>

      <View style={styles.card}>
        <AppText variant="label">Got a code?</AppText>
        <TextField
          value={code}
          onChangeText={(text) => {
            setCode(text);
            redeem.reset();
          }}
          placeholder="6-character code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.codeInput}
          error={redeem.isError ? redeem.error.message : null}
        />
        <Button
          title="Join"
          disabled={cleanCode.length !== 6}
          loading={redeem.isPending}
          onPress={() => redeem.mutate(cleanCode)}
        />
      </View>
    </View>
  );
}

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  hero: { gap: space.sm },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  code: {
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: 6,
    color: colors.accent,
    textAlign: 'center',
    paddingVertical: space.sm,
  },
  codeInput: { fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: 4 },
});
