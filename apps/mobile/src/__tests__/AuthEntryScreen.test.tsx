/**
 * AuthEntryScreen tests
 *
 * Mocks:
 *  - Screen component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { AuthEntryScreen } from '../screens/auth/AuthEntryScreen';

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
  return { navigate: jest.fn(), replace: jest.fn() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthEntryScreen', () => {
  it('renders the running-first headline copy and wordmark', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('sportsgang');
    getByText('Find your run.');
    getByText('Find your people.');
  });

  it('renders the sport / city eyebrow', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Sydney');
  });

  it('renders the v1-safe tagline (no overpromise on booking)', () => {
    const { getByText, queryByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Group runs, running crews and training partners near you.');
    expect(queryByText(/book your next session/i)).toBeNull();
  });

  it('renders Get started and Log in buttons', () => {
    const { getByText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Get started');
    getByText('Log in');
  });

  it('exposes Get started and Log in as labelled buttons', () => {
    const { getByLabelText } = render(
      <AuthEntryScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(getByLabelText('Get started').props.accessibilityRole).toBe('button');
    expect(getByLabelText('Log in').props.accessibilityRole).toBe('button');
  });

  it('navigates to RegisterScreen when Get started is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <AuthEntryScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Get started'));
    expect(nav.navigate).toHaveBeenCalledWith('RegisterScreen');
  });

  it('navigates to LoginScreen when Log in is pressed', () => {
    const nav = makeNavigation();
    const { getByText } = render(
      <AuthEntryScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByText('Log in'));
    expect(nav.navigate).toHaveBeenCalledWith('LoginScreen');
  });
});
