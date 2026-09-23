/**
 * Custom bottom tab bar: roles / labels / selected state, tabPress
 * semantics (navigate only when not focused and not prevented), haptic on
 * switch, 44pt targets, safe-area padding, badges and the lime indicator.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { TabBar } from '../navigation/TabBar';
import { colors, layout } from '../theme';

const routes = [
  { key: 'RunHome-1', name: 'RunHome', label: 'Run' },
  { key: 'Crews-1', name: 'Crews', label: 'Crews' },
  { key: 'Matches-1', name: 'Matches', label: 'Chats' },
  { key: 'Profile-1', name: 'Profile', label: 'Profile' },
];

function setup(opts: { index?: number; prevent?: boolean; badge?: Record<string, string | number> } = {}) {
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: Boolean(opts.prevent) }));
  const descriptors = Object.fromEntries(
    routes.map((r) => [
      r.key,
      {
        options: {
          title: r.label,
          tabBarLabel: r.label,
          tabBarBadge: opts.badge?.[r.name],
          tabBarIcon: ({ color }: { color: string }) => <Text testID={`icon-${r.name}`}>{color}</Text>,
        },
      },
    ])
  );
  const props = {
    state: {
      index: opts.index ?? 0,
      routes: routes.map((r) => ({ key: r.key, name: r.name, params: undefined })),
    },
    descriptors,
    navigation: { navigate, emit },
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
  const utils = render(<TabBar {...props} />);
  return { ...utils, navigate, emit };
}

beforeEach(() => jest.clearAllMocks());

describe('TabBar', () => {
  it('renders one labelled tab per route in order', () => {
    const { getAllByRole } = setup();
    expect(getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual([
      'Run',
      'Crews',
      'Chats',
      'Profile',
    ]);
  });

  it('marks the focused tab selected and tints it lime', () => {
    const { getByRole, getByTestId } = setup({ index: 2 });
    expect(getByRole('tab', { name: 'Chats' }).props.accessibilityState).toEqual({ selected: true });
    expect(getByRole('tab', { name: 'Run' }).props.accessibilityState).toEqual({ selected: false });
    expect(getByTestId('icon-Matches').props.children).toBe(colors.brand);
    expect(getByTestId('icon-RunHome').props.children).toBe(colors.textTertiary);
  });

  it('navigates to an unfocused tab with a selection haptic', () => {
    const { getByRole, navigate, emit } = setup({ index: 0 });
    fireEvent.press(getByRole('tab', { name: 'Profile' }));
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'Profile-1', canPreventDefault: true });
    expect(navigate).toHaveBeenCalledWith('Profile', undefined);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not navigate or buzz when the focused tab is pressed', () => {
    const { getByRole, navigate, emit } = setup({ index: 0 });
    fireEvent.press(getByRole('tab', { name: 'Run' }));
    expect(emit).toHaveBeenCalled(); // listeners (e.g. scroll-to-top) still hear it
    expect(navigate).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('respects a prevented tabPress', () => {
    const { getByRole, navigate } = setup({ index: 0, prevent: true });
    fireEvent.press(getByRole('tab', { name: 'Crews' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('emits tabLongPress', () => {
    const { getByRole, emit } = setup();
    fireEvent(getByRole('tab', { name: 'Crews' }), 'longPress');
    expect(emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'Crews-1' });
  });

  it('pads for the home indicator and keeps 44pt targets', () => {
    const { getByTestId, getAllByRole } = setup();
    const bar = StyleSheet.flatten(getByTestId('main-tab-bar').props.style);
    expect(bar.paddingBottom).toBe(34);
    expect(bar.height).toBe(layout.tabBarHeight + 34);
    for (const tab of getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('shows badges and includes them in the label', () => {
    const { getByText, getByRole } = setup({ badge: { Matches: 3 } });
    expect(getByText('3')).toBeTruthy();
    expect(getByRole('tab', { name: 'Chats, 3 new' })).toBeTruthy();
  });

  it('draws the active indicator once measured', () => {
    const { getByTestId, queryByTestId } = setup();
    expect(queryByTestId('tab-indicator')).toBeNull();
    fireEvent(getByTestId('main-tab-bar'), 'layout', { nativeEvent: { layout: { width: 400, height: 94 } } });
    expect(getByTestId('tab-indicator')).toBeTruthy();
  });
});
