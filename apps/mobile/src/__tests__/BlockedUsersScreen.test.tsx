/**
 * BlockedUsersScreen tests
 *
 * Covers: loading, error/retry, empty state, populated list render,
 * unblock confirmation, optimistic row removal, failure-path keeps
 * row, and copy guarantees.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { BlockedUsersScreen } from '../screens/safety/BlockedUsersScreen';

const mockListBlockedUsers = jest.fn();
const mockUnblockUser = jest.fn();

jest.mock('../lib/safety', () => ({
  listBlockedUsers: (...args: unknown[]) => mockListBlockedUsers(...args),
  unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
}));

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

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block-1',
    blockerId: 'me-1',
    blockedId: 'user-a',
    createdAt: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  const navigation = makeNavigation();
  const utils = render(
    <BlockedUsersScreen
      navigation={navigation as any}
      route={{ params: undefined, key: 'k', name: 'BlockedUsers' } as any}
    />
  );
  return { ...utils, navigation };
}

function stubConfirmingAlert(action: 'Unblock' | 'Cancel' = 'Unblock') {
  return jest
    .spyOn(require('react-native').Alert, 'alert')
    .mockImplementation((...args: unknown[]) => {
      const buttons = args[2];
      if (!Array.isArray(buttons)) return;
      const btn = (buttons as { text: string; onPress?: () => void }[]).find(
        (b) => b.text === action
      );
      btn?.onPress?.();
    });
}

describe('BlockedUsersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading state on first mount', () => {
    mockListBlockedUsers.mockReturnValue(new Promise(() => {}));
    const { getByLabelText } = renderScreen();
    getByLabelText('Loading blocked users');
  });

  it('renders the empty state when there are no blocks', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({ items: [], total: 0 });
    const { findByLabelText, getByText } = renderScreen();
    await findByLabelText('No blocked users');
    getByText("You haven't blocked anyone yet.");
  });

  it('renders blocked users returned by the API', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [makeBlock({ blockedId: 'user-a' }), makeBlock({ id: 'block-2', blockedId: 'user-b' })],
      total: 2,
    });
    const { findByLabelText, getByLabelText } = renderScreen();
    await findByLabelText('Blocked user user-a');
    getByLabelText('Blocked user user-b');
  });

  it('renders an error + retry when the list fetch fails', async () => {
    mockListBlockedUsers.mockRejectedValueOnce(new Error('Network down'));
    const { findByText, getByLabelText } = renderScreen();
    await findByText('Network down');
    mockListBlockedUsers.mockResolvedValueOnce({ items: [], total: 0 });
    fireEvent.press(getByLabelText('Retry loading blocked users'));
    await waitFor(() => {
      expect(mockListBlockedUsers).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a confirmation prompt before unblocking and calls the API on confirm', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [makeBlock({ blockedId: 'user-a' })],
      total: 1,
    });
    mockUnblockUser.mockResolvedValueOnce(undefined);
    const alertSpy = stubConfirmingAlert('Unblock');
    const { findByLabelText, queryByLabelText } = renderScreen();
    await findByLabelText('Blocked user user-a');
    await act(async () => {
      fireEvent.press(await findByLabelText('Unblock user-a'));
    });
    expect(mockUnblockUser).toHaveBeenCalledWith('user-a');
    // Optimistic removal — the row should be gone after success.
    await waitFor(() => {
      expect(queryByLabelText('Blocked user user-a')).toBeNull();
    });
    // Confirmation title pinned.
    expect(
      alertSpy.mock.calls.some((c) => c[0] === 'Unblock this user?')
    ).toBe(true);
    alertSpy.mockRestore();
  });

  it('does not call the API when the confirmation is cancelled', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [makeBlock({ blockedId: 'user-a' })],
      total: 1,
    });
    const alertSpy = stubConfirmingAlert('Cancel');
    const { findByLabelText } = renderScreen();
    await findByLabelText('Blocked user user-a');
    const button = await findByLabelText('Unblock user-a');
    await act(async () => {
      fireEvent.press(button);
    });
    expect(mockUnblockUser).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('falls back to the empty state once the last block is removed', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [makeBlock({ blockedId: 'user-a' })],
      total: 1,
    });
    mockUnblockUser.mockResolvedValueOnce(undefined);
    const alertSpy = stubConfirmingAlert('Unblock');
    const { findByLabelText } = renderScreen();
    await findByLabelText('Blocked user user-a');
    const button = await findByLabelText('Unblock user-a');
    await act(async () => {
      fireEvent.press(button);
    });
    await findByLabelText('No blocked users');
    alertSpy.mockRestore();
  });

  it('keeps the row and shows an error when the unblock API fails', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({
      items: [makeBlock({ blockedId: 'user-a' })],
      total: 1,
    });
    mockUnblockUser.mockRejectedValueOnce(new Error('Could not unblock.'));
    const alertSpy = stubConfirmingAlert('Unblock');
    const { findByLabelText, findByText } = renderScreen();
    await findByLabelText('Blocked user user-a');
    const button = await findByLabelText('Unblock user-a');
    await act(async () => {
      fireEvent.press(button);
    });
    // Row error renders.
    await findByText('Could not unblock.');
    // Row is still present.
    await findByLabelText('Blocked user user-a');
    alertSpy.mockRestore();
  });

  // ── Copy guarantees ───────────────────────────────────────────────────────

  it('copy never mentions message blocking, AI moderation, verified, or leaderboard', async () => {
    mockListBlockedUsers.mockResolvedValueOnce({ items: [], total: 0 });
    const { findByLabelText, queryByText } = renderScreen();
    await findByLabelText('No blocked users');
    expect(queryByText(/cannot message/i)).toBeNull();
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/instant enforcement/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
  });
});
