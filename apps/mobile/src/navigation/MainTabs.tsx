import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { Icon, type IconName } from '../components/ui';
import { CrewsScreen } from '../screens/crews/CrewsScreen';
import { MatchesScreen } from '../screens/matches/MatchesScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { RunHomeScreen } from '../screens/run/RunHomeScreen';
import { TabBar } from './TabBar';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabConfig {
  name: keyof MainTabParamList;
  label: string;
  icon: IconName;
  component: React.ComponentType;
}

/**
 * The four main tabs, in order. Route names are kept where the screen is
 * unchanged (`Matches`, `Profile`) so existing navigation keeps working.
 */
export const MAIN_TABS: readonly TabConfig[] = [
  { name: 'RunHome', label: 'Run', icon: 'run', component: RunHomeScreen },
  { name: 'Crews', label: 'Crews', icon: 'crew', component: CrewsScreen },
  { name: 'Matches', label: 'Chats', icon: 'chat', component: MatchesScreen },
  { name: 'Profile', label: 'Profile', icon: 'profile', component: ProfileScreen },
];

const renderTabBar = (props: React.ComponentProps<typeof TabBar>) => <TabBar {...props} />;

export function MainTabs() {
  return (
    <Tab.Navigator initialRouteName="RunHome" tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      {MAIN_TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.label,
            tabBarLabel: tab.label,
            tabBarTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
