/**
 * RegisterScreen tests
 *
 * Mocks:
 *  - stores/auth (useAuthStore)
 *  - Screen component
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { RegisterScreen } from '../screens/auth/RegisterScreen';

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockRegister = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: jest.fn(),
}));

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
    register: mockRegister,
    isLoading: overrides.isLoading ?? false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the title and form labels', () => {
    const { getByText } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    // Title is rendered as "Create your\naccount" in one Text node, so match via regex.
    getByText(/Create your/);
    getByText('Email');
    getByText('Password');
  });

  it('renders the Create account button', () => {
    const { getByText } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Create account');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows an error when email is empty', async () => {
    const { getByText } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText('Create account'));
    await waitFor(() => getByText('Please enter your email address.'));
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows an error when password is shorter than 8 characters', async () => {
    const { getByText, getByPlaceholderText } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'user@test.com');
    fireEvent.changeText(getByPlaceholderText('Min. 8 characters'), 'short');
    fireEvent.press(getByText('Create account'));
    await waitFor(() => getByText('Password must be at least 8 characters.'));
    expect(mockRegister).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator when isLoading is true', () => {
    setupStore({ isLoading: true });
    const { UNSAFE_queryAllByType } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Successful registration ────────────────────────────────────────────────

  it('calls register with trimmed email and password', async () => {
    mockRegister.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <RegisterScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  new@test.com  ');
    fireEvent.changeText(getByPlaceholderText('Min. 8 characters'), 'password123');
    fireEvent.press(getByText('Create account'));
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@test.com', 'password123');
    });
  });

  it('navigates to OnboardingStep1 after successful registration', async () => {
    mockRegister.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <RegisterScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'new@test.com');
    fireEvent.changeText(getByPlaceholderText('Min. 8 characters'), 'password123');
    fireEvent.press(getByText('Create account'));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
    });
  });

  // ── Failed registration ────────────────────────────────────────────────────

  it('shows the error message returned by register', async () => {
    mockRegister.mockRejectedValue(new Error('Email already in use'));
    const nav = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <RegisterScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'taken@test.com');
    fireEvent.changeText(getByPlaceholderText('Min. 8 characters'), 'password123');
    fireEvent.press(getByText('Create account'));
    await waitFor(() => getByText('Email already in use'));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  // ── Footer navigation ──────────────────────────────────────────────────────

  it('navigates to LoginScreen when Log in footer link is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <RegisterScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Log in'));
    expect(nav.replace).toHaveBeenCalledWith('LoginScreen');
  });

  // ── Email input rendering bug regression ───────────────────────────────────
  // Earlier the email input visibly clipped descenders ("g", "y", "p") near
  // the bottom of the field. The cause was the input style spreading a
  // typography token whose lineHeight (26) was larger than the fontSize on a
  // single-line TextInput, which clips descenders on Android.
  it('does not set a TextInput lineHeight that would clip the email text', () => {
    const { getByPlaceholderText } = render(
      <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    const input = getByPlaceholderText('you@example.com');
    const style = Array.isArray(input.props.style)
      ? Object.assign({}, ...input.props.style)
      : input.props.style;
    expect(style.lineHeight).toBeUndefined();
  });

  // ── iOS Strong Password autofill opt-out contract ────────────────────────
  // V1 ships with iOS Strong Password / Password Autofill DISABLED on the
  // Register password field. Earlier attempts engaged Strong Password
  // (textContentType="newPassword"), and the resulting overlay carried
  // into OnboardingStep1 — yellowing the displayName field and capturing
  // its keystrokes on real iPhones. Pinning the opt-out shape here is the
  // only structural guard against accidental regression to "newPassword".
  describe('password input autofill opt-out', () => {
    function getPasswordInput(utils: ReturnType<typeof render>) {
      return utils.getByPlaceholderText('Min. 8 characters');
    }

    it('disables iOS Password Autofill (textContentType=none, autoComplete=off)', () => {
      const utils = render(
        <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getPasswordInput(utils);
      expect(input.props.textContentType).toBe('none');
      expect(input.props.autoComplete).toBe('off');
      // Must NOT engage Strong Password: any *Password content type
      // re-introduces the carry-over overlay on real devices.
      expect(input.props.textContentType).not.toBe('newPassword');
      expect(input.props.textContentType).not.toBe('password');
    });

    it('disables Android system autofill so the OS cannot inject the field', () => {
      const utils = render(
        <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getPasswordInput(utils);
      expect(input.props.importantForAutofill).toBe('no');
    });

    it('keeps secureTextEntry on and disables capitalisation, autocorrect, and spellcheck', () => {
      const utils = render(
        <RegisterScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getPasswordInput(utils);
      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.autoCapitalize).toBe('none');
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.spellCheck).toBe(false);
    });
  });
});
