import { useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { FormErrorBanner } from '../../components/FormErrorBanner';
import { Button, Header, Screen, TextField } from '../../components/ui';
import { useAuthStore } from '../../stores/auth';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { AuthHeading } from './AuthHeading';
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
    <Screen
      padded
      scroll
      withKeyboard
      header={<Header onBack={() => navigation.navigate('AuthEntry')} backLabel="Back" />}
    >
      <AuthHeading eyebrow="Welcome back" title="Log in" />

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
        />

        <TextField
          label="Password"
          leadingIcon="lock"
          secure
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
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

        <FormErrorBanner message={error} />

        <Button
          label="Log in"
          size="lg"
          fullWidth
          loading={isLoading}
          onPress={handleLogin}
          accessibilityLabel="Log in"
          style={styles.submit}
        />

        {Platform.OS === 'ios' ? (
          <View style={styles.appleSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            {/* Apple's own button (HIG-compliant). WHITE style is the
                variant Apple recommends on dark backgrounds. */}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radii.lg}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account?</Text>
        <Button
          label="Sign up"
          variant="ghost"
          size="sm"
          onPress={() => navigation.replace('RegisterScreen')}
          accessibilityLabel="Sign up"
        />
      </View>
    </Screen>
  );
}

/**
 * TextField spreads `typography.bodyLarge` (lineHeight 26) into the input.
 * On a single-line TextInput that lineHeight clips descenders and the "@"
 * glyph on Android, so auth fields clear it.
 */

const styles = StyleSheet.create({
  form: {
    gap: spacing.md + spacing.xs,
  },
  submit: {
    marginTop: spacing.sm,
  },
  appleSection: {
    gap: spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  dividerText: {
    ...typography.caption,
  },
  appleButton: {
    width: '100%',
    height: touchTarget + spacing.md - spacing.xs,
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
