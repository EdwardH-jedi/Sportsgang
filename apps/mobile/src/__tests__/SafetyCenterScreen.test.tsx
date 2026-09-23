/**
 * SafetyCenterScreen tests
 *
 * Pins required copy + truthful-copy guarantees (no chat-blocking
 * claim, no AI moderation, no instant enforcement, no verified
 * identity, no leaderboard wording).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SafetyCenterScreen } from '../screens/help/SafetyCenterScreen';

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
    <SafetyCenterScreen
      navigation={navigation as any}
      route={{ params: undefined, key: 'k', name: 'SafetyCenter' } as any}
    />
  );
  return { ...utils, navigation };
}

describe('SafetyCenterScreen', () => {
  it('renders the header title and lead copy', () => {
    const { getAllByText, getByText } = renderScreen();
    // Title appears in both the header and the intro block.
    expect(getAllByText('Safety Center').length).toBeGreaterThan(0);
    getByText(
      'How reports, blocking, and community rules work on SportsGang.'
    );
  });

  it('renders Report a problem section copy', () => {
    const { getByLabelText, getByText } = renderScreen();
    getByLabelText('Section Report a problem');
    getByText('Report unsafe, fraudulent, or unreliable behavior.');
    getByText("We'll review reports and take action when appropriate.");
  });

  it('renders Blocking copy without a message-blocking claim', () => {
    const { getByLabelText, getByText, queryByText } = renderScreen();
    getByLabelText('Section Blocking');
    getByText(
      'Blocked users are restricted from supported interactions such as joining your games where supported.'
    );
    expect(queryByText(/cannot message/i)).toBeNull();
    expect(queryByText(/message blocking/i)).toBeNull();
  });

  it('renders No-show policy section', () => {
    const { getByLabelText, getByText } = renderScreen();
    getByLabelText('Section No-show policy');
    getByText('Only join games you can attend.');
    getByText('If plans change, leave before the game when possible.');
    getByText('Repeated no-shows may lower Honor.');
  });

  it('renders Event safety tips section', () => {
    const { getByLabelText, getByText } = renderScreen();
    getByLabelText('Section Event safety tips');
    getByText('Meet in public sports venues.');
    getByText('Check event details before joining.');
    getByText('Trust your instincts and report unsafe behavior.');
  });

  it('renders Community rules section', () => {
    const { getByLabelText, getByText } = renderScreen();
    getByLabelText('Section Community rules');
    getByText('Be respectful.');
    getByText('Do not harass, scam, or impersonate others.');
    getByText('Keep games safe, fair, and sports-first.');
  });

  it('copy does not include AI moderation / instant enforcement / verified / leaderboard / cannot message', () => {
    const { queryByText } = renderScreen();
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/instant enforcement/i)).toBeNull();
    expect(queryByText(/verified identity/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/popularity leaderboard/i)).toBeNull();
    expect(queryByText(/cannot message/i)).toBeNull();
  });

  it('Back button calls navigation.goBack', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('renders a Manage blocked users entry that navigates to BlockedUsers', () => {
    const { getByLabelText, navigation } = renderScreen();
    const entry = getByLabelText('Manage blocked users');
    fireEvent.press(entry);
    expect(navigation.navigate).toHaveBeenCalledWith('BlockedUsers');
  });
});
