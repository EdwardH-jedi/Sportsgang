import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { FormErrorBanner } from '../../components/FormErrorBanner';
import { Button, Screen, TextField } from '../../components/ui';
import { openLegal, PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { useAuthStore } from '../../stores/auth';
import { colors, face, spacing, typography } from '../../theme';
import { AuthHeading } from './AuthHeading';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterScreen'>;

export function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { register, isLoading } = useAuthStore();

  async function handleRegister() {
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    // Dismiss the keyboard SYNCHRONOUSLY — before the network round-trip.
    // iOS Strong Password Autofill anchors its yellow "save credential"
    // overlay to the keyboard. While `await register()` runs (50–2000ms
    // of network), the keyboard is still up and the overlay is still
    // attached. iOS commits the credential and tears down the overlay
    // when it sees the keyboard dismiss + form-submission signal — so
    // dismiss FIRST, then await, then navigate. Dismissing after the
    // await (the previous attempt) lets the overlay survive until the
    // next screen mounts, where iOS re-attaches it to the displayName
    // field — yellowing it and capturing keystrokes.
    Keyboard.dismiss();
    try {
      await register(email.trim(), password);
      // New users always complete onboarding first
      navigation.replace('OnboardingStep1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <AuthHeading eyebrow="Join the gang" title={'Create your\naccount'} />

      <View style={styles.form}>
        <TextField
          label="Email"
          leadingIcon="mail"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          inputStyle={singleLineInput}
        />

        <TextField
          label="Password"
          leadingIcon="lock"
          secure
          helper="At least 8 characters."
          value={password}
          onChangeText={setPassword}
          placeholder="Min. 8 characters"
          // V1 trade-off: opt this field fully out of iOS Strong
          // Password / Password Autofill. The previous attempt
          // (textContentType="newPassword") engaged iOS Strong Password
          // and the resulting autofill overlay carried into the next
          // screen, painting the OnboardingStep1 displayName field
          // yellow and capturing keystrokes. We accept the trade-off
          // that iOS will not auto-save this credential to the
          // keychain — Login still works fine for manual or autofilled
          // existing passwords (those properties are unchanged). The
          // five "off" signals below are belt-and-braces; iOS honours
          // textContentType="none" + autoComplete="off" together as
          // the strongest opt-out for a secureTextEntry field.
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textContentType="none"
          autoComplete="off"
          importantForAutofill="no"
          inputStyle={singleLineInput}
        />

        <FormErrorBanner message={error} />

        <Button
          label="Create account"
          size="lg"
          fullWidth
          loading={isLoading}
          onPress={handleRegister}
          accessibilityLabel="Create account"
          style={styles.submit}
        />

        <Text style={styles.legalText}>
          By creating an account you agree to our{' '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => openLegal(TERMS_URL, 'Terms of Service')}
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            accessibilityRole="link"
            onPress={() => openLegal(PRIVACY_URL, 'Privacy Policy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Button
          label="Log in"
          variant="ghost"
          size="sm"
          onPress={() => navigation.replace('LoginScreen')}
          accessibilityLabel="Log in"
        />
      </View>
    </Screen>
  );
}

/**
 * TextField spreads `typography.bodyLarge` (lineHeight 26) into the input.
 * On a single-line TextInput that lineHeight clips descenders (g, y, p) on
 * Android, so auth fields clear it.
 */
const singleLineInput = { lineHeight: undefined };

const styles = StyleSheet.create({
  form: {
    gap: spacing.md + spacing.xs,
  },
  submit: {
    marginTop: spacing.sm,
  },
  legalText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  legalLink: {
    ...typography.bodySmall,
    ...face('semibold', '600'),
    color: colors.brand,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  footerText: {
    ...typography.body,
  },
});
