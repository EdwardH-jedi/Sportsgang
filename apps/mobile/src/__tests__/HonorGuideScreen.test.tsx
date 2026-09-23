/**
 * HonorGuideScreen tests
 *
 * Pins required copy and the truthful-copy guarantees (no popularity
 * leaderboard, no AI moderation, no instant enforcement, no verified
 * identity wording).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { HonorGuideScreen } from '../screens/help/HonorGuideScreen';

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

function makeNavigation() {
  return { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
}

function renderScreen() {
  const navigation = makeNavigation();
  const utils = render(
    <HonorGuideScreen
      navigation={navigation as any}
      route={{ params: undefined, key: 'k', name: 'HonorGuide' } as any}
    />
  );
  return { ...utils, navigation };
}

describe('HonorGuideScreen', () => {
  it('renders the headline trust copy', () => {
    const { getByText } = renderScreen();
    getByText('Build your Honor');
    getByText('Honor is not popularity.');
    getByText('It reflects attendance, fair play, and reliable hosting.');
  });

  it('renders Honor, Gang Score, Sport Levels, and Honor levels sections', () => {
    const { getByLabelText } = renderScreen();
    getByLabelText('Section Honor');
    getByLabelText('Section Gang Score');
    getByLabelText('Section Sport Levels');
    getByLabelText('Section Honor levels');
  });

  it('renders every Honor level pill', () => {
    const { getByText } = renderScreen();
    getByText('Rookie');
    getByText('Regular');
    getByText('Trusted');
    getByText('Captain');
    getByText('Legend');
  });

  it('renders the no-show policy copy', () => {
    const { getByText } = renderScreen();
    getByText('Only join games you can attend.');
    getByText('No-shows can lower Honor.');
    getByText('Excused attendance does not lower Honor.');
  });

  it('renders the reports-and-safety honesty copy', () => {
    const { getByText } = renderScreen();
    getByText("Reports do not automatically change someone's Honor.");
    getByText('Only reviewed actioned reports may affect Honor.');
  });

  it('copy does not include AI moderation / instant enforcement / verified identity / leaderboard', () => {
    const { queryByText } = renderScreen();
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/instant enforcement/i)).toBeNull();
    expect(queryByText(/verified identity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/popularity leaderboard/i)).toBeNull();
  });

  it('Back button calls navigation.goBack', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
