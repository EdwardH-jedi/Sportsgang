import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { openLegal, PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
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
      <View style={styles.header}>
        <Text style={styles.wordmark}>sportsgang</Text>
        <Text style={styles.eyebrow}>Find sports partners</Text>
        <Text style={styles.title}>Create your{'\n'}account</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
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
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || isLoading) && styles.pressed,
          ]}
          onPress={handleRegister}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Create account</Text>
          )}
        </Pressable>

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
        <Pressable
          onPress={() => navigation.replace('LoginScreen')}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <Text style={styles.footerText}>
            Already have an account?{' '}
            <Text style={styles.footerLink}>Log in</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  wordmark: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    // Use explicit fontSize/fontWeight from the bodyLarge token but omit
    // lineHeight: setting lineHeight on a TextInput clips descenders (g, y, p)
    // on Android and is unnecessary since TextInput is single-line here.
    fontSize: typography.bodyLarge.fontSize,
    fontWeight: typography.bodyLarge.fontWeight,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 17,
  },
  pressed: {
    opacity: 0.65,
  },
  legalText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  legalLink: {
    color: colors.brand,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerLink: {
    color: colors.brand,
    fontWeight: '600',
  },
});
