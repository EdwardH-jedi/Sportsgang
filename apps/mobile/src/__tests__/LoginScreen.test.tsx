/**
 * LoginScreen tests
 *
 * Mocks:
 *  - stores/auth (useAuthStore)
 *  - Screen component
 */

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { LoginScreen } from '../screens/auth/LoginScreen';

// "Log in" appears as both header title and submit button text — press by accessibilityLabel.

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockLogin = jest.fn();
const mockLoginWithApple = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: jest.fn(),
}));

// ─── Mock profile store (for the post-auth onboarding gate) ─────────────────

const mockFetchProfile = jest.fn();
const mockProfileGetState = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: Object.assign(jest.fn(() => ({})), {
    getState: (...args: unknown[]) => mockProfileGetState(...args),
  }),
}));

function setupProfileStore(profile: Record<string, unknown> | null) {
  mockProfileGetState.mockReturnValue({
    fetchProfile: mockFetchProfile,
    profile,
  });
}

function step1CompleteProfile() {
  return {
    id: 'p1',
    userId: 'u1',
    displayName: 'Jordan Lee',
    birthYear: 1990,
    suburb: 'Newtown',
    avatarUrl: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ─── Mock expo-apple-authentication ───────────────────────────────────────────

const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <View testID="apple-sign-in-button" accessibilityRole="button" onTouchEnd={onPress} />
    ),
  };
});

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { replace: jest.fn(), navigate: jest.fn() };
}

function setupStore(overrides: { isLoading?: boolean } = {}) {
  const { useAuthStore } = require('../stores/auth');
  (useAuthStore as jest.Mock).mockReturnValue({
    login: mockLogin,
    loginWithApple: mockLoginWithApple,
    isLoading: overrides.isLoading ?? false,
  });
}

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the title and form labels', () => {
    const { getByText, getAllByText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(getAllByText('Log in').length).toBeGreaterThanOrEqual(1);
    getByText('Email');
    getByText('Password');
  });

  it('renders the sign-up footer link', () => {
    const { getByText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Sign up');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows an error when submitting with empty fields', async () => {
    const { getByText, getByLabelText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => getByText('Please enter your email and password.'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows an error when only email is provided', async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => getByText('Please enter your email and password.'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator when isLoading is true', () => {
    setupStore({ isLoading: true });
    const { UNSAFE_queryAllByType } = render(
      <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Successful login ───────────────────────────────────────────────────────

  it('calls login with trimmed email and password', async () => {
    mockLogin.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  user@test.com  ');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'secret123');
    });
  });

  it('navigates to Main after successful login when Step 1 profile fields are complete', async () => {
    mockLogin.mockResolvedValue(undefined);
    mockFetchProfile.mockResolvedValue(undefined);
    setupProfileStore(step1CompleteProfile());
    const nav = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('Main');
    });
  });

  it('navigates to OnboardingStep1 after successful login when profile fetch fails', async () => {
    mockLogin.mockResolvedValue(undefined);
    mockFetchProfile.mockRejectedValue(new Error('Profile not found'));
    setupProfileStore(null);
    const nav = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
    });
  });

  it('navigates to OnboardingStep1 after successful login when display_name is blank', async () => {
    mockLogin.mockResolvedValue(undefined);
    mockFetchProfile.mockResolvedValue(undefined);
    setupProfileStore({ ...step1CompleteProfile(), displayName: '   ' });
    const nav = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'secret123');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
    });
  });

  // ── Failed login ───────────────────────────────────────────────────────────

  it('shows the error message returned by login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const nav = makeNavigation();
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Your password'), 'wrongpass');
    fireEvent.press(getByLabelText('Log in'));
    await waitFor(() => getByText('Invalid credentials'));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  // ── Footer navigation ──────────────────────────────────────────────────────

  it('navigates to RegisterScreen when Sign up is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <LoginScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Sign up'));
    expect(nav.replace).toHaveBeenCalledWith('RegisterScreen');
  });

  // ── Apple Sign-in ──────────────────────────────────────────────────────────

  describe('Apple Sign-in', () => {
    afterEach(() => setPlatform('ios'));

    it('renders the Apple Sign-in button on iOS', () => {
      setPlatform('ios');
      const { queryByTestId } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      expect(queryByTestId('apple-sign-in-button')).not.toBeNull();
    });

    it('does not render the Apple Sign-in button on Android', () => {
      setPlatform('android');
      const { queryByTestId } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      expect(queryByTestId('apple-sign-in-button')).toBeNull();
    });

    it('posts identityToken + nonce to loginWithApple on success', async () => {
      setPlatform('ios');
      mockSignInAsync.mockResolvedValue({
        identityToken: 'apple.jwt.token',
        authorizationCode: 'apple.auth.code',
        email: 'user@privaterelay.appleid.com',
        fullName: { givenName: 'Alex', familyName: 'Kim' },
      });
      mockLoginWithApple.mockResolvedValue(undefined);
      mockFetchProfile.mockResolvedValue(undefined);
      setupProfileStore(step1CompleteProfile());
      const nav = makeNavigation();
      const { getByTestId } = render(
        <LoginScreen navigation={nav as any} route={{} as any} />
      );
      fireEvent(getByTestId('apple-sign-in-button'), 'touchEnd');
      await waitFor(() => expect(mockLoginWithApple).toHaveBeenCalled());
      const payload = mockLoginWithApple.mock.calls[0][0];
      expect(payload.identityToken).toBe('apple.jwt.token');
      expect(payload.authorizationCode).toBe('apple.auth.code');
      expect(typeof payload.nonce).toBe('string');
      expect(payload.nonce.length).toBeGreaterThan(0);
      expect(payload.email).toBe('user@privaterelay.appleid.com');
      expect(payload.name).toBe('Alex Kim');
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('Main'));
    });

    it('silently ignores user cancellation', async () => {
      setPlatform('ios');
      mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
      const { getByTestId, queryByText } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent(getByTestId('apple-sign-in-button'), 'touchEnd');
      await waitFor(() => expect(mockSignInAsync).toHaveBeenCalled());
      expect(mockLoginWithApple).not.toHaveBeenCalled();
      expect(queryByText(/Apple Sign-in failed/)).toBeNull();
    });
  });

  // ── Email input rendering regression ───────────────────────────────────────
  // Spreading typography.bodyLarge into a single-line TextInput style pulls
  // in `lineHeight: 26`, which clips descenders and the '@' glyph on Android
  // — making typed email addresses look truncated. Pin the contract.
  describe('email input rendering (regression)', () => {
    it('does not set a TextInput lineHeight that would clip "@"/descenders on Android', () => {
      const { getByPlaceholderText } = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getByPlaceholderText('you@example.com');
      const style = Array.isArray(input.props.style)
        ? Object.assign({}, ...input.props.style)
        : input.props.style;
      expect(style.lineHeight).toBeUndefined();
    });
  });

  // ── iOS Password Autofill contract ────────────────────────────────────────
  // Sign-in flows must use `current-password` so iOS retrieves an existing
  // keychain credential cleanly. autoCapitalize/autoCorrect off prevents
  // iOS from silently mutating typed characters before login submits.
  describe('password input autofill contract', () => {
    function getPasswordInput(utils: ReturnType<typeof render>) {
      return utils.getByPlaceholderText('Your password');
    }

    it('declares the existing-credential content type', () => {
      const utils = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getPasswordInput(utils);
      expect(input.props.textContentType).toBe('password');
      expect(input.props.autoComplete).toBe('current-password');
      expect(input.props.secureTextEntry).toBe(true);
    });

    it('disables capitalisation and autocorrect so iOS cannot mutate typed characters', () => {
      const utils = render(
        <LoginScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getPasswordInput(utils);
      expect(input.props.autoCapitalize).toBe('none');
      expect(input.props.autoCorrect).toBe(false);
    });
  });
});
