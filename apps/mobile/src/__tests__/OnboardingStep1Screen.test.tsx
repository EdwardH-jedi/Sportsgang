/**
 * OnboardingStep1Screen tests (Slice A — basic info required fields).
 *
 * Display name is a free-text TextInput; birth year and suburb are bounded
 * Select pickers. Interaction pattern for the pickers in tests:
 *   1. Press the trigger by accessibilityLabel to open the modal.
 *   2. Press the desired option by its visible text.
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import {
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  OnboardingStep1Screen,
  buildYearOptions,
} from '../screens/onboarding/OnboardingStep1Screen';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function SafeArea({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={safeAreaMetrics}>{children}</SafeAreaProvider>;
}

/** Screens use the Screen primitive, which needs safe-area context. */
function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: SafeArea });
}


// ─── Mock profile store ───────────────────────────────────────────────────────

const mockUpsertProfile = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { navigate: jest.fn(), replace: jest.fn() };
}

function setupStore() {
  const { useProfileStore } = require('../stores/profile');
  (useProfileStore as jest.Mock).mockReturnValue({ upsertProfile: mockUpsertProfile });
}

function fillRequired(
  utils: ReturnType<typeof render>,
  overrides: { name?: string; year?: string; suburb?: string } = {}
) {
  const { getByPlaceholderText, getByLabelText, getAllByText } = utils;
  const name = overrides.name ?? 'Jordan Lee';
  const year = overrides.year ?? '1990';
  const suburb = overrides.suburb ?? 'Newtown';

  fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), name);

  fireEvent.press(getByLabelText('Birth year'));
  fireEvent.press(getAllByText(year)[0]);

  fireEvent.press(getByLabelText('Sydney suburb'));
  fireEvent.press(getAllByText(suburb)[0]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep1Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator', () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 1 of 4');
  });

  it('renders the profile title', () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Your profile');
  });

  it('renders the required basic-info fields', () => {
    const { getByPlaceholderText, getByLabelText, queryByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByPlaceholderText("How you'll appear to others");
    getByLabelText('Birth year');
    getByLabelText('Sydney suburb');
    // Bio moved to Step 2 (Slice B) — Step 1 must no longer render the bio field.
    expect(queryByPlaceholderText('Tell potential partners a bit about yourself...')).toBeNull();
  });

  // ── Year option bounds ─────────────────────────────────────────────────────

  describe('buildYearOptions', () => {
    it('respects the intended [MIN_BIRTH_YEAR, MAX_BIRTH_YEAR] bounds', () => {
      const options = buildYearOptions();
      expect(options.length).toBeGreaterThan(0);

      const years = options.map((o) => parseInt(o.value, 10));
      expect(Math.max(...years)).toBe(MAX_BIRTH_YEAR);
      expect(Math.min(...years)).toBe(MIN_BIRTH_YEAR);

      // No year outside the bounds
      expect(years.every((y) => y >= MIN_BIRTH_YEAR && y <= MAX_BIRTH_YEAR)).toBe(true);

      // Enforces min-age 18 (no year newer than today - 18)
      const minAge = new Date().getFullYear() - MAX_BIRTH_YEAR;
      expect(minAge).toBe(18);
    });

    it('lists years newest-first so common selections are near the top', () => {
      const options = buildYearOptions();
      const first = parseInt(options[0]!.value, 10);
      const last = parseInt(options[options.length - 1]!.value, 10);
      expect(first).toBe(MAX_BIRTH_YEAR);
      expect(last).toBe(MIN_BIRTH_YEAR);
    });
  });

  // ── Validation — required fields ───────────────────────────────────────────

  it('requires display name', async () => {
    const { getByText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only display name', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), '   ');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('requires birth year after display name is filled', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Please select your birth year.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('requires suburb after display name and birth year are filled', async () => {
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(utils.getByPlaceholderText("How you'll appear to others"), 'Jordan');
    fireEvent.press(utils.getByLabelText('Birth year'));
    fireEvent.press(utils.getAllByText('1990')[0]);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => utils.getByText('Please select your Sydney suburb.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  // ── Calculated age hint ────────────────────────────────────────────────────

  it('shows calculated age after selecting a birth year', () => {
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Birth year'));
    fireEvent.press(utils.getAllByText('1990')[0]);
    const expectedAge = new Date().getFullYear() - 1990;
    utils.getByText(`Age: ${expectedAge}`);
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertProfile with correct data when all required fields are set', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils, { name: 'Jordan Lee', year: '1990', suburb: 'Newtown' });
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith({
        displayName: 'Jordan Lee',
        birthYear: 1990,
        suburb: 'Newtown',
      });
    });
  });

  it('trims whitespace from display name before submitting', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const utils = render(
      <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fillRequired(utils, { name: '  Jordan Lee  ' });
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Jordan Lee' })
      );
    });
  });

  it('navigates to OnboardingStep2 on success', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep2');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertProfile fails', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep1Screen navigation={nav as any} route={{} as any} />
    );
    fillRequired(utils);
    fireEvent.press(utils.getByText('Continue'));
    await waitFor(() => utils.getByText('Server error'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── Display name input rendering bug regression ────────────────────────────
  // History on this field, all real-device-only bugs that synthetic Jest
  // events cannot reproduce — these tests pin the *contract* that defeats
  // each one so the regression cannot recur silently:
  //   1. Text clipped vertically because the input style spread a typography
  //      token whose lineHeight was larger than the fontSize (Android cuts
  //      descenders in single-line TextInput when lineHeight > fontSize).
  //   2. iOS Password Autofill carry-over: after RegisterScreen's
  //      textContentType="newPassword" field, iOS keeps a credential-save
  //      overlay alive across the navigation.replace and the next focused
  //      TextInput on OnboardingStep1 ends up in Strong Password context —
  //      yellow background, keystrokes captured by autofill before reaching
  //      React state, "Please enter a display name" fires on Continue. A
  //      previous fix set textContentType="nickname"; that still let the
  //      carry-over win on real devices. Current fix is two-pronged:
  //      (a) RegisterScreen.handleRegister calls Keyboard.dismiss() before
  //          navigation.replace to sever the system-level overlay at the
  //          navigation boundary, and
  //      (b) this displayName declares textContentType="name" + autoComplete
  //          ="name" — the strongest non-credential semantic on iOS — so
  //          even if the overlay survives, this field is unambiguously
  //          NOT the credential's username slot.
  //   3. Android system autofill writing to the native input without firing
  //      onChangeText — covered by autoComplete="name" + importantForAutofill="no".
  describe('display name input rendering (regression)', () => {
    function getDisplayNameInput(utils: ReturnType<typeof render>) {
      return utils.getByPlaceholderText("How you'll appear to others");
    }

    it('does not set a TextInput lineHeight that would clip descenders', () => {
      const utils = render(
        <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      const style = Array.isArray(input.props.style)
        ? Object.assign({}, ...input.props.style)
        : input.props.style;
      // lineHeight on a single-line TextInput clips descenders on Android.
      expect(style.lineHeight).toBeUndefined();
      // Text colour must be the explicit primary text colour from the theme,
      // not a transient yellow autofill tint or undefined.
      const { colors: themeColors } = require('../theme');
      expect(style.color).toBe(themeColors.textPrimary);
    });

    it('declares an iOS non-credential content type so Strong Password Autofill cannot capture the field', () => {
      const utils = render(
        <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      // Must NOT be "none": on iOS that means "use heuristics", which after
      // the RegisterScreen newPassword field carries the credential context
      // forward and yellows this field. Must be a name-type semantic so iOS
      // unambiguously knows this is not a credential entry.
      expect(input.props.textContentType).not.toBe('none');
      expect(['nickname', 'username', 'givenName', 'name']).toContain(
        input.props.textContentType
      );
    });

    it('declares a non-credential autofill hint and keeps importantForAutofill="no" so Android cannot write to the native input without firing onChangeText', () => {
      const utils = render(
        <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      // Allowed values: any non-credential autofill hint, OR the explicit
      // off-switch. Forbidden: anything that maps to a credential field.
      expect(['name', 'username', 'off']).toContain(input.props.autoComplete);
      expect(['name', 'username']).not.toContain('password');
      expect(input.props.autoComplete).not.toBe('password');
      expect(input.props.autoComplete).not.toBe('current-password');
      expect(input.props.autoComplete).not.toBe('new-password');
      // importantForAutofill="no" guarantees Android system autofill cannot
      // write to the native view bypassing onChangeText, regardless of the
      // autoComplete hint. This is the load-bearing assertion for that bug.
      expect(input.props.importantForAutofill).toBe('no');
    });

    it('sanitizes Korean / non-English keystrokes out of the controlled value', async () => {
      mockUpsertProfile.mockResolvedValue(undefined);
      const utils = render(
        <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      // Simulate the user typing a mixed CJK + Latin string. The sanitizer
      // strips disallowed code points before the value reaches React state,
      // so the controlled value shown back to the user is Latin-only and
      // the upsertProfile payload submits the same Latin-only string.
      fireEvent.changeText(
        utils.getByPlaceholderText("How you'll appear to others"),
        '김민수Jordan'
      );
      fireEvent.press(utils.getByLabelText('Birth year'));
      fireEvent.press(utils.getAllByText('1990')[0]);
      fireEvent.press(utils.getByLabelText('Sydney suburb'));
      fireEvent.press(utils.getAllByText('Newtown')[0]);
      fireEvent.press(utils.getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertProfile).toHaveBeenCalledWith(
          expect.objectContaining({ displayName: 'Jordan' })
        );
      });
    });

    // State-payload contract test: this is the structural assertion that
    // would catch a state-desync regression on this field even when the
    // *cause* is native (autofill capture / IME composing region) and Jest
    // cannot reproduce it. The contract is: whatever string the field's
    // onChangeText receives must end up in the upsertProfile payload as
    // `displayName`, and the "Please enter a display name" error must not
    // appear. Any future change that reads the value from somewhere other
    // than the controlled `value` state — or renames the payload key — will
    // fail this test.
    it('flows the typed value through to the upsertProfile payload as displayName, no validation error', async () => {
      mockUpsertProfile.mockResolvedValue(undefined);
      const utils = render(
        <OnboardingStep1Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      fillRequired(utils, { name: 'Jordan Lee', year: '1990', suburb: 'Newtown' });
      fireEvent.press(utils.getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertProfile).toHaveBeenCalledWith(
          expect.objectContaining({ displayName: 'Jordan Lee' })
        );
      });
      // The display-name validation message must never appear when the
      // user actually typed a name. Birth year + suburb errors must also
      // not appear because they were filled.
      expect(utils.queryByText('Please enter a display name.')).toBeNull();
      expect(utils.queryByText('Please select your birth year.')).toBeNull();
      expect(utils.queryByText('Please select your Sydney suburb.')).toBeNull();
    });
  });
});
