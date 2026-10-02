import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Screen } from '../../components/Screen';
import { useAuthStore } from '../../stores/auth';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LoginScreen'>;

function generateNonce(): string {
  // 32 chars of url-safe entropy. The backend verifies by computing
  // SHA256(nonce) and comparing against the identityToken's nonce claim.
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { login, loginWithApple, isLoading } = useAuthStore();

  async function routeAfterAuth() {
    // Mirror SplashScreen's onboarding gate so a returning user with a
    // missing/incomplete Step 1 lands in onboarding instead of Main with
    // a blank display name.
    try {
      await useProfileStore.getState().fetchProfile();
      const { profile } = useProfileStore.getState();
      const step1Complete =
        !!profile &&
        !!profile.displayName &&
        profile.displayName.trim().length > 0 &&
        !!profile.birthYear &&
        !!profile.suburb;
      navigation.replace(step1Complete ? 'Main' : 'OnboardingStep1');
    } catch {
      navigation.replace('OnboardingStep1');
    }
  }

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    // Dismiss the keyboard SYNCHRONOUSLY — before the network round-trip.
    // iOS Password Autofill anchors its yellow overlay to the keyboard;
    // dismissing after `await login()` (the previous attempt) lets the
    // overlay survive the network call and re-attach to the next screen
    // when navigation.replace mounts it. Dismiss first, await second,
    // navigate third — that order severs the overlay before iOS can
    // carry it forward.
    Keyboard.dismiss();
    try {
      await login(email.trim(), password);
      await routeAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  }

  async function handleAppleSignIn() {
    setError(null);
    // Same rationale as handleLogin: dismiss before the system Apple sheet
    // opens. Apple Sign-In doesn't use the standard keyboard, but if the
    // user had focused the email/password fields first, the keyboard is up
    // and any pending Strong-Password overlay needs to be torn down before
    // the auth flow takes over the screen.
    Keyboard.dismiss();
    try {
      const nonce = generateNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) {
        setError('Apple Sign-in did not return an identity token.');
        return;
      }
      const fullName = credential.fullName;
      const composedName = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim() || null
        : null;
      await loginWithApple({
        identityToken: credential.identityToken,
        nonce,
        email: credential.email ?? null,
        name: composedName,
        // One-time code the backend exchanges for a refresh token so account
        // deletion can revoke Apple tokens (App Store 5.1.1(v)).
        authorizationCode: credential.authorizationCode ?? null,
      });
      await routeAfterAuth();
    } catch (err) {
      // User canceling the sheet is not a real error — swallow silently.
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Apple Sign-in failed. Please try again.');
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.header}>
        <Text style={styles.wordmark}>sportsgang</Text>
        <Text style={styles.eyebrow}>Welcome back</Text>
        <Text style={styles.title}>Log in</Text>
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
            placeholder="Your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            // Same defenses as RegisterScreen: prevent iOS title-casing
            // / autocorrect from silently mutating the typed password
            // before it lands in React state.
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            // `current-password` is the AHA-spec value for sign-in flows
            // and is the React Native canonical token for retrieving an
            // existing credential. The previous `password` value worked
            // but is the spec's "any-password" alias — `current-password`
            // is unambiguous and matches `new-password` on Register.
            autoComplete="current-password"
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || isLoading) && styles.pressed,
          ]}
          onPress={handleLogin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Log in</Text>
          )}
        </Pressable>

        {Platform.OS === 'ios' ? (
          <View style={styles.appleSection}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radii.md}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.replace('RegisterScreen')}
          accessibilityRole="button"
          accessibilityLabel="Sign up"
        >
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Text style={styles.footerLink}>Sign up</Text>
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
    // lineHeight: setting lineHeight on a single-line TextInput clips
    // descenders (g, y, p — and the '@' glyph in email addresses) on
    // Android. The email field is the visible symptom; the workaround
    // mirrors RegisterScreen / OnboardingStep1.
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
  appleSection: {
    marginTop: spacing.md,
  },
  appleButton: {
    width: '100%',
    height: 52,
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
