import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  Header,
  Screen,
  Skeleton,
  SkeletonText,
  TextField,
} from '../../components/ui';
import { useCrews } from '../../hooks/useCrews';
import { useHomeLocation } from '../../hooks/useHomeLocation';
import type { CrewListItem } from '../../lib/crews';
import type { RootStackParamList } from '../../navigation/types';
import { colors, layout, spacing, typography } from '../../theme';
import { CrewCard } from './components/CrewCard';

/** Radius for "Crews near you". */
export const CREW_RADIUS_KM = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Crews tab: search, "Your crews" (mine=true) and "Crews near you"
 * (geo, running). Without a location fix the second list shows the
 * newest crews and offers to set a location.
 */
export function CrewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coords, status, requestLocation } = useHomeLocation();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setQuery('');
      return;
    }
    const t = setTimeout(() => setQuery(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const searching = query.length > 0;
  const mine = useCrews({ mine: true, enabled: !searching });
  const nearby = useCrews({
    sport: 'running',
    lat: coords?.lat,
    lng: coords?.lng,
    radiusKm: coords ? CREW_RADIUS_KM : undefined,
    enabled: !searching,
  });
  const results = useCrews({ q: query, enabled: searching });

  const refreshMine = mine.refresh;
  const refreshNearby = nearby.refresh;
  useFocusEffect(
    useCallback(() => {
      void refreshMine();
      void refreshNearby();
    }, [refreshMine, refreshNearby])
  );

  const openCrew = (crew: CrewListItem) => navigation.navigate('CrewDetail', { crewId: crew.id });
  const createCrew = () => navigation.navigate('CreateCrew');

  // Crews already listed under "Your crews" aren't repeated below.
  const mineIds = new Set(mine.items.map((c) => c.id));
  const nearbyItems = nearby.items.filter((c) => !mineIds.has(c.id));

  return (
    <Screen
      padded={false}
      header={
        <Header
          large
          title="Crews"
          actions={[{ icon: 'plus', accessibilityLabel: 'Create crew', onPress: createCrew }]}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search crews or areas"
          leadingIcon="search"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={60}
          accessibilityLabel="Search crews"
        />

        {searching ? (
          <Section title="Results">
            <CrewList
              state={results}
              onOpen={openCrew}
              empty={
                <EmptyState
                  compact
                  icon="search"
                  title={`No crews match “${query}”`}
                  message="Try an area name, or start the crew yourself."
                  action={{ label: 'Create crew', icon: 'plus', onPress: createCrew }}
                />
              }
            />
          </Section>
        ) : (
          <>
            <Section title="Your crews">
              <CrewList
                state={mine}
                onOpen={openCrew}
                empty={
                  <Card variant="outline" padding="md" style={styles.inline}>
                    <Text style={styles.inlineTitle}>You're not in a crew yet</Text>
                    <Text style={styles.inlineBody}>
                      Join one below, or start your own and invite the people you run with.
                    </Text>
                    <Button label="Create crew" size="sm" leadingIcon="plus" onPress={createCrew} />
                  </Card>
                }
              />
            </Section>

            <Section title={coords ? 'Crews near you' : 'New crews'}>
              {!coords && status !== 'checking' && status !== 'locating' ? (
                <Card variant="outline" padding="md" style={styles.inline}>
                  <Text style={styles.inlineBody}>
                    {status === 'denied'
                      ? 'Location is off, so crews aren’t sorted by distance.'
                      : 'Set your location to see crews within 25 km.'}
                  </Text>
                  {status !== 'denied' ? (
                    <Button
                      label="Set location"
                      size="sm"
                      variant="secondary"
                      leadingIcon="my-location"
                      onPress={() => void requestLocation()}
                      accessibilityLabel="Set location for crews near you"
                    />
                  ) : null}
                </Card>
              ) : null}
              <CrewList
                state={{ ...nearby, items: nearbyItems }}
                onOpen={openCrew}
                empty={
                  <EmptyState
                    compact
                    icon="crew"
                    title={coords ? 'No crews near you yet' : 'No crews yet'}
                    message="Be the first — a crew is just people who run together."
                    action={{ label: 'Create crew', icon: 'plus', onPress: createCrew }}
                  />
                }
              />
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

interface CrewListProps {
  state: { items: CrewListItem[]; isLoading: boolean; error: string | null; refresh: () => Promise<void> };
  onOpen: (crew: CrewListItem) => void;
  empty: React.ReactNode;
}

function CrewList({ state, onOpen, empty }: CrewListProps) {
  if (state.isLoading && state.items.length === 0) {
    return (
      <Card testID="crew-card-skeleton">
        <Skeleton width="50%" height={18} />
        <SkeletonText lines={2} style={styles.skeletonText} />
      </Card>
    );
  }
  if (state.error && state.items.length === 0) {
    return (
      <EmptyState
        compact
        icon="alert"
        title="Couldn't load crews"
        message={state.error}
        action={{
          label: 'Try again',
          icon: 'refresh',
          onPress: () => void state.refresh(),
          accessibilityLabel: 'Retry loading crews',
        }}
      />
    );
  }
  if (state.items.length === 0) return <>{empty}</>;
  return (
    <View style={styles.list}>
      {state.items.map((crew) => (
        <CrewCard key={crew.id} crew={crew} onPress={() => onOpen(crew)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
  },
  list: {
    gap: spacing.md,
  },
  inline: {
    gap: spacing.sm,
  },
  inlineTitle: {
    ...typography.bodyStrong,
  },
  inlineBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  skeletonText: {
    marginTop: spacing.md,
  },
});
