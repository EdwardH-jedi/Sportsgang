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
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { OnboardingStep4Screen } from '../screens/onboarding/OnboardingStep4Screen';

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockUpsertSportProfile = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', border: '#ccc', surface: '#fff',
    surfaceElevated: '#f5f5f5', background: '#fafafa', separator: '#e0e0e0',
    textPrimary: '#000', textSecondary: '#555', textTertiary: '#888',
    textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

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
