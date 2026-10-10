import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode() {
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setCodeSent(true);
      setCode('');
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code,
      type: 'email',
    });
    setBusy(false);
    // On success, onAuthStateChange updates the session and the auth gate routes onward.
    if (error) setError(error.message);
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <AppText variant="display">
          RESPAWN
          <AppText variant="display" color={colors.accent}>
            .
          </AppText>
        </AppText>
        <AppText variant="muted">60 days. One partner. Start again.</AppText>
      </View>

      {!codeSent ? (
        <View style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={sendCode}
            error={error}
          />
          <Button title="Send code" onPress={sendCode} loading={busy} />
        </View>
      ) : (
        <View style={styles.form}>
          <AppText variant="muted">
            We sent a code to <AppText color={colors.text}>{cleanEmail}</AppText>.
          </AppText>
          <TextField
            label="Code"
            placeholder="Code from the email"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={verifyCode}
            error={error}
            style={styles.code}
          />
          <Button title="Sign in" onPress={verifyCode} loading={busy} disabled={code.length < 6} />
          <View style={styles.row}>
            <Button
              title="Resend code"
              variant="ghost"
              onPress={sendCode}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              title="Change email"
              variant="ghost"
              onPress={() => {
                setCodeSent(false);
                setError(null);
              }}
              disabled={busy}
              style={styles.flex}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.xl * 2, gap: space.sm },
  form: { gap: space.md },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
