/**
 * Main tab configuration: Run / Crews / Chats / Profile in that order,
 * v1 route names kept for unchanged screens, Events no longer a tab, the
 * custom TabBar wired in, and semantic icons per tab.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { MAIN_TABS, MainTabs } from '../navigation/MainTabs';
import { TabBar } from '../navigation/TabBar';
import { CrewsScreen } from '../screens/crews/CrewsScreen';

type ScreenRecord = { name: string; component: unknown; options: Record<string, unknown> };
const mockScreens: ScreenRecord[] = [];
const mockNavigatorProps: Record<string, unknown>[] = [];

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: (props: { children: React.ReactNode }) => {
      mockNavigatorProps.push(props);
      const { View } = require('react-native');
      return <View>{props.children}</View>;
    },
    Screen: (props: ScreenRecord) => {
      mockScreens.push(props);
      return null;
    },
  }),
}));

jest.mock('../screens/run/RunHomeScreen', () => ({ RunHomeScreen: () => null }));
jest.mock('../screens/matches/MatchesScreen', () => ({ MatchesScreen: () => null }));
jest.mock('../screens/profile/ProfileScreen', () => ({ ProfileScreen: () => null }));

beforeEach(() => {
  mockScreens.length = 0;
  mockNavigatorProps.length = 0;
});

describe('MainTabs', () => {
  it('registers Run, Crews, Chats, Profile in order', () => {
    render(<MainTabs />);
    expect(mockScreens.map((s) => s.name)).toEqual(['RunHome', 'Crews', 'Matches', 'Profile']);
    expect(mockScreens.map((s) => s.options.tabBarLabel)).toEqual(['Run', 'Crews', 'Chats', 'Profile']);
  });

  it('no longer has an Events or Discovery tab', () => {
    render(<MainTabs />);
    const names = mockScreens.map((s) => s.name);
    expect(names).not.toContain('Events');
    expect(names).not.toContain('Discovery');
  });

  it('keeps the Matches and Profile route names for unchanged screens', () => {
    const { MatchesScreen } = jest.requireMock('../screens/matches/MatchesScreen');
    const { ProfileScreen } = jest.requireMock('../screens/profile/ProfileScreen');
    const { RunHomeScreen } = jest.requireMock('../screens/run/RunHomeScreen');
    render(<MainTabs />);
    const byName = Object.fromEntries(mockScreens.map((s) => [s.name, s.component]));
    expect(byName.Matches).toBe(MatchesScreen);
    expect(byName.Profile).toBe(ProfileScreen);
    expect(byName.RunHome).toBe(RunHomeScreen);
    expect(byName.Crews).toBe(CrewsScreen);
  });

  it('uses the custom tab bar, starts on Run and hides native headers', () => {
    render(<MainTabs />);
    const nav = mockNavigatorProps[0] as {
      tabBar: (p: unknown) => React.ReactElement;
      initialRouteName: string;
      screenOptions: { headerShown: boolean };
    };
    expect(nav.initialRouteName).toBe('RunHome');
    expect(nav.screenOptions.headerShown).toBe(false);
    expect(nav.tabBar({}).type).toBe(TabBar);
  });

  it('gives every tab a semantic icon', () => {
    expect(MAIN_TABS.map((t) => t.icon)).toEqual(['run', 'crew', 'chat', 'profile']);
    render(<MainTabs />);
    const icon = (mockScreens[0].options.tabBarIcon as (a: object) => React.ReactElement)({
      focused: true,
      color: '#fff',
      size: 24,
    });
    expect(icon.props).toMatchObject({ name: 'run', color: '#fff', size: 24 });
  });
});
