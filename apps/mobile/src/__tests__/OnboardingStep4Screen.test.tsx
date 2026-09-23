/**
 * OnboardingStep4Screen tests (sport profile, renumbered to 4 of 4 after
 * Slice B inserted photos + bio as Step 2).
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import { OnboardingStep4Screen } from '../screens/onboarding/OnboardingStep4Screen';

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

const mockUpsertSportProfile = jest.fn();

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
    upsertSportProfile: mockUpsertSportProfile,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep4Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator for 4-step flow', () => {
    const { getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 4 of 4');
  });

  it('renders all four sport options, running first', () => {
    const { getByRole, getAllByRole } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByRole('checkbox', { name: 'Gym' });
    getByRole('checkbox', { name: 'Golf' });
    getByRole('checkbox', { name: 'Tennis' });
    getByRole('checkbox', { name: 'Running' });
    // The first four checkboxes are the sport toggles (time-slot checkboxes
    // for the pre-selected sport follow).
    expect(
      getAllByRole('checkbox')
        .slice(0, 4)
        .map((c) => c.props.accessibilityLabel)
    ).toEqual([
      'Running',
      'Gym',
      'Tennis',
      'Golf',
    ]);
  });

  it('pre-selects Running and shows its detail fields', () => {
    const { getByRole, getByText, getByPlaceholderText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(getByRole('checkbox', { name: 'Running' }).props.accessibilityState).toEqual({
      checked: true,
    });
    expect(getByRole('checkbox', { name: 'Gym' }).props.accessibilityState).toEqual({
      checked: false,
    });
    getByText('Beginner');
    getByPlaceholderText('e.g. Centennial Park loop');
  });

  it('renders the Let\'s go button', () => {
    const { getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText("Let's go");
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows error when no sport is selected', async () => {
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' })); // deselect default
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => getByText('Please select at least one sport.'));
    expect(mockUpsertSportProfile).not.toHaveBeenCalled();
  });

  // ── Sport selection ────────────────────────────────────────────────────────

  it('shows sport detail fields when a sport is selected', () => {
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' })); // deselect default
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    getByText('Beginner');
    getByText('Intermediate');
    getByText('Advanced');
  });

  it('hides detail fields when a sport is deselected', () => {
    const { getByRole, queryByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' })); // deselect default
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByRole('checkbox', { name: 'Gym' })); // deselect
    expect(queryByText('Beginner')).toBeNull();
  });

  it('shows preferred time slots once a sport is selected', () => {
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' })); // deselect default
    fireEvent.press(getByRole('checkbox', { name: 'Golf' }));
    getByText('Morning');
    getByText('Afternoon');
    getByText('Evening');
    getByText('Flexible');
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('calls upsertSportProfile once when a single sport is selected', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Running' })); // deselect default
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(mockUpsertSportProfile).toHaveBeenCalledTimes(1);
      expect(mockUpsertSportProfile).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'gym', level: 'beginner' })
      );
    });
  });

  it('submits the default Running profile without any extra taps', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const { getByText } = render(
      <OnboardingStep4Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(mockUpsertSportProfile).toHaveBeenCalledTimes(1);
    });
    expect(mockUpsertSportProfile).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'running', gymName: undefined, golfClub: undefined })
    );
  });

  it('calls upsertSportProfile for each selected sport', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Gym' }));
    fireEvent.press(getByRole('checkbox', { name: 'Golf' }));
    fireEvent.press(getByText("Let's go"));
    // Running is pre-selected, so Gym + Golf make three profiles.
    await waitFor(() => {
      expect(mockUpsertSportProfile).toHaveBeenCalledTimes(3);
    });
    const sports = mockUpsertSportProfile.mock.calls.map((c: any[]) => c[0].sport);
    expect(sports).toContain('running');
    expect(sports).toContain('gym');
    expect(sports).toContain('golf');
  });

  it('navigates to Main after successful submission', async () => {
    mockUpsertSportProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const { getByText } = render(
      <OnboardingStep4Screen navigation={nav as any} route={{} as any} />
    );
    // Running is pre-selected — no sport tap needed.
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith('Main');
    });
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('shows error message when upsertSportProfile fails', async () => {
    mockUpsertSportProfile.mockRejectedValue(new Error('Save failed'));
    const nav = makeNavigation();
    const { getByRole, getByText } = render(
      <OnboardingStep4Screen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByRole('checkbox', { name: 'Tennis' }));
    fireEvent.press(getByText("Let's go"));
    await waitFor(() => getByText('Save failed'));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('OnboardingStep4Screen back affordance', () => {
  it('goes back to the previous step', () => {
    const { useProfileStore } = require('../stores/profile');
    (useProfileStore as jest.Mock).mockReturnValue({ upsertSportProfile: jest.fn() });
    const nav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
    const { getByLabelText } = render(<OnboardingStep4Screen navigation={nav as any} route={{} as any} />);
    fireEvent.press(getByLabelText('Back'));
    expect(nav.goBack).toHaveBeenCalled();
  });
});
