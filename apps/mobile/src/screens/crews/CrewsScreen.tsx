import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { EmptyState, Header, Screen } from '../../components/ui';
import type { MainTabParamList } from '../../navigation/types';

/**
 * Crews tab — placeholder until the Crews feature lands (Phase 4 replaces
 * this with "Your crews" / "Crews near you"). Built only from primitives.
 */
export function CrewsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  return (
    <Screen padded={false} header={<Header large title="Crews" />}>
      <EmptyState
        icon="crew"
        title="Crews are coming"
        message="Run with the same people every week. Until crews arrive, find running partners on the Run tab."
        action={{
          label: 'Find runners',
          icon: 'run',
          onPress: () => navigation.navigate('RunHome'),
        }}
        testID="crews-placeholder"
      />
    </Screen>
  );
}
