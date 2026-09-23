/**
 * OnboardingStep3Screen tests (identity preferences, renumbered to 3 of 4
 * after Slice B inserted photos + bio as Step 2).
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import { OnboardingStep3Screen } from '../screens/onboarding/OnboardingStep3Screen';

const mockRequestLocation = jest.fn();
let mockLocationStatus = 'undetermined';
jest.mock('../hooks/useHomeLocation', () => ({
  useHomeLocation: () => ({
    status: mockLocationStatus,
    requestLocation: mockRequestLocation,
    isBusy: false,
    openSettings: jest.fn(),
  }),
}));

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

const mockUpsertIdentityPreferences = jest.fn();

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
  (useProfileStore as jest.Mock).mockReturnValue({
    upsertIdentityPreferences: mockUpsertIdentityPreferences,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep3Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator for 4-step flow', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 3 of 4');
  });

  it('renders the preference options', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Any');
    getByText('Men');
    getByText('Women');
    getByText('Non-binary');
  });

  it('renders the distance options', () => {
    const { getByText } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('5 km');
    getByText('10 km');
    getByText('20 km');
    getByText('50 km');
  });

  // ── Open-to toggles ────────────────────────────────────────────────────────

  it('starts with Any selected', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    const anyCheckbox = getByRole('checkbox', { name: 'Any' });
    expect(anyCheckbox.props.accessibilityState.checked).toBe(true);
  });

  it('deselects Any when another option is tapped', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Men' }));
    expect(getByRole('checkbox', { name: 'Any' }).props.accessibilityState.checked).toBe(false);
    expect(getByRole('checkbox', { name: 'Men' }).props.accessibilityState.checked).toBe(true);
  });

  it('resets to Any when the last non-any option is deselected', () => {
    const { getByRole } = render(
      <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Women' }));
    fireEvent.press(getByRole('checkbox', { name: 'Women' })); // deselect
    expect(getByRole('checkbox', { name: 'Any' }).props.accessibilityState.checked).toBe(true);
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertIdentityPreferences with correct defaults', async () => {
    mockUpsertIdentityPreferences.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith({
        openTo: ['any'],
        ageRangeMin: 18,
        ageRangeMax: 65,
        maxDistanceKm: 20,
      });
    });
  });

  it('navigates to OnboardingStep4 on success', async () => {
    mockUpsertIdentityPreferences.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep4');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertIdentityPreferences fails', async () => {
    mockUpsertIdentityPreferences.mockRejectedValue(new Error('Network error'));
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep3Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => getByText('Network error'));
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── Age range selector (keyboard-free, replaces TextInputs) ───────────────
  // Real-device QA: iOS number-pad has no Done/Return key, so age TextInputs
  // were unusable. Replaced with a stepper-based selector that never opens
  // the keyboard. These tests pin the keyboard-free contract and clamp logic.
  describe('age range selector', () => {
    it('does not render any TextInput in the partner age range section', () => {
      const { UNSAFE_queryAllByType } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const { TextInput } = require('react-native');
      // No numeric input fields anywhere on this screen — the selector is
      // entirely Pressable-driven.
      expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
    });

    it('increments min age via the + control and submits the new value', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Increase minimum age'));
      fireEvent.press(getByLabelText('Increase minimum age'));
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 20, ageRangeMax: 65 })
        );
      });
    });

    it('decrements max age via the − control and submits the new value', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      fireEvent.press(getByLabelText('Decrease maximum age'));
      fireEvent.press(getByLabelText('Decrease maximum age'));
      fireEvent.press(getByLabelText('Decrease maximum age'));
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 18, ageRangeMax: 62 })
        );
      });
    });

    it('disables min − at the floor (18) on first render', () => {
      const { getByLabelText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const minMinus = getByLabelText('Decrease minimum age');
      expect(minMinus.props.accessibilityState.disabled).toBe(true);
    });

    it('renders 80 as the upper scale label (limit is 18–80)', () => {
      const { getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      // The selector renders both edge labels; 80 confirms maxLimit propagated.
      getByText('80');
    });

    it('max + is enabled at default (65) and disables only at the ceiling (80)', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const maxPlus = getByLabelText('Increase maximum age');
      // Default max is 65 — well below the new ceiling, so + is live.
      expect(maxPlus.props.accessibilityState.disabled).toBe(false);
      // 15 presses lifts max from 65 to 80, the new ceiling.
      for (let i = 0; i < 15; i += 1) fireEvent.press(maxPlus);
      expect(getByLabelText('Increase maximum age').props.accessibilityState.disabled).toBe(true);
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 18, ageRangeMax: 80 })
        );
      });
    });

    it('cannot push min above max — pressing min + when min equals max is blocked', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      // Drive max all the way down to 18 (47 presses from 65).
      const dec = getByLabelText('Decrease maximum age');
      for (let i = 0; i < 47; i += 1) fireEvent.press(dec);
      // Now min = max = 18. Pressing min + should be a no-op (disabled).
      const minPlus = getByLabelText('Increase minimum age');
      expect(minPlus.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(minPlus);
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 18, ageRangeMax: 18 })
        );
      });
    });

    it('cannot push max below min — pressing max − when max equals min is blocked', () => {
      const { getByLabelText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      // Drive min all the way up to 65 (47 presses from 18).
      const inc = getByLabelText('Increase minimum age');
      for (let i = 0; i < 47; i += 1) fireEvent.press(inc);
      const maxMinus = getByLabelText('Decrease maximum age');
      expect(maxMinus.props.accessibilityState.disabled).toBe(true);
    });

    // ── Touchable bar (tap + drag) ─────────────────────────────────────────
    // The bar wrapper claims the touch responder so iPhone users can set the
    // range without keyboard or stepper. These tests pin the existence of
    // the responder hooks and the x→age math at the boundaries.

    it('exposes the bar as a touch responder with termination protection', () => {
      const { getByLabelText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const bar = getByLabelText('Age range bar');
      expect(typeof bar.props.onStartShouldSetResponder).toBe('function');
      expect(typeof bar.props.onResponderGrant).toBe('function');
      expect(typeof bar.props.onResponderMove).toBe('function');
      // Parent <Screen scroll> will request termination on vertical drift —
      // the bar must refuse so a drag isn't hijacked mid-gesture.
      expect(bar.props.onResponderTerminationRequest()).toBe(false);
      expect(bar.props.onStartShouldSetResponder()).toBe(true);
    });

    it('tap near the left edge moves the min handle (nearest-handle rule)', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const bar = getByLabelText('Age range bar');
      // bar width 100 makes x→age trivial: range = 80 - 18 = 62, so age =
      // round(18 + x/100 * 62). x=10 → 24. min thumb is at x=0 (closer than
      // max thumb at ~75.8), so the min handle picks up the tap.
      fireEvent(bar, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 56 } },
      });
      fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 10 } });
      fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 10 } });
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 24, ageRangeMax: 65 })
        );
      });
    });

    it('drag on the bar updates the same handle continuously and clamps at the ceiling', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const bar = getByLabelText('Age range bar');
      fireEvent(bar, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 56 } },
      });
      // Grant near max thumb (x≈75.8) → max handle picked. Drag past the
      // right edge (x=200) — xToAge clamps to barWidth, so age clamps to 80.
      fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 80 } });
      fireEvent(bar, 'responderMove', { nativeEvent: { locationX: 200 } });
      fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 200 } });
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 18, ageRangeMax: 80 })
        );
      });
    });

    it('drag on the min handle cannot cross the max value', async () => {
      mockUpsertIdentityPreferences.mockResolvedValue(undefined);
      const { getByLabelText, getByText } = render(
        <OnboardingStep3Screen navigation={makeNavigation() as any} route={{} as any} />
      );
      const bar = getByLabelText('Age range bar');
      fireEvent(bar, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 56 } },
      });
      // Grab min (x=0 closer than max x≈75.8 for a tap at x=5), then drag
      // far right (x=300). Min must not exceed default max (65).
      fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 5 } });
      fireEvent(bar, 'responderMove', { nativeEvent: { locationX: 300 } });
      fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 300 } });
      fireEvent.press(getByText('Continue'));
      await waitFor(() => {
        expect(mockUpsertIdentityPreferences).toHaveBeenCalledWith(
          expect.objectContaining({ ageRangeMin: 65, ageRangeMax: 65 })
        );
      });
    });
  });
});

describe('OnboardingStep3Screen location (skippable)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useProfileStore } = require('../stores/profile');
    (useProfileStore as jest.Mock).mockReturnValue({
      upsertIdentityPreferences: jest.fn().mockResolvedValue(undefined),
    });
    mockLocationStatus = 'undetermined';
  });

  function renderStep() {
    const nav = { navigate: jest.fn(), replace: jest.fn() };
    const utils = render(<OnboardingStep3Screen navigation={nav as any} route={{} as any} />);
    return { ...utils, nav };
  }

  it('offers "Use my location", which requests and saves it', () => {
    const { getByLabelText, getByText } = renderStep();
    getByText('Where do you usually run?');
    fireEvent.press(getByLabelText('Use my location'));
    expect(mockRequestLocation).toHaveBeenCalledWith();
  });

  it('confirms once the location is saved', () => {
    mockLocationStatus = 'ready';
    const { getByText, queryByLabelText } = renderStep();
    getByText("Location saved. We'll show what's near you.");
    expect(queryByLabelText('Use my location')).toBeNull();
  });

  it('explains a denied permission and still lets the user continue', async () => {
    mockLocationStatus = 'denied';
    const { getByText, nav } = renderStep();
    getByText(/Location is off/);
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep4'));
    expect(mockRequestLocation).not.toHaveBeenCalled();
  });
});
