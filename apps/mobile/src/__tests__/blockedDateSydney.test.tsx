/**
 * @jest-environment ./jest.sydney-env.js
 *
 * Blocked Users shows the block's instant as a Sydney date (review R6,
 * docs/run-golf-v2/CONTRACTS.md §9): a 15:30Z block is 3 Oct in Sydney,
 * whether the API sends "…Z" or, from an older API, no offset.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { BlockedUsersScreen } from '../screens/safety/BlockedUsersScreen';

const mockListBlockedUsers = jest.fn();

jest.mock('../lib/safety', () => ({
  listBlockedUsers: (...args: unknown[]) => mockListBlockedUsers(...args),
  unblockUser: jest.fn(),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

function renderScreen() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  return render(
    <BlockedUsersScreen
      navigation={navigation as never}
      route={{ params: undefined, key: 'k', name: 'BlockedUsers' } as never}
    />
  );
}

it('runs as a Sydney device', () => {
  expect(new Date(Date.UTC(2026, 9, 2, 15, 30)).getDate()).toBe(3);
});

it('a 15:30Z block reads as 3 Oct for both spellings', async () => {
  const expected = `Blocked ${new Date(Date.UTC(2026, 9, 3, 1, 30)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
  for (const createdAt of ['2026-10-02T15:30:00Z', '2026-10-02T15:30:00']) {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [{ id: 'k1', blockerId: 'me', blockedId: 'u1', blockedDisplayName: 'Alex', createdAt }],
      total: 1,
    });
    const { findByText, unmount } = renderScreen();
    expect(await findByText(expected)).toBeTruthy();
    unmount();
  }
});
