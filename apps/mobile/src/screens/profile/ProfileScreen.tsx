import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FocusSport, SportProfile } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import {
  Button,
  Card,
  EmptyState,
  InfoChip,
  LoadingState,
  ScreenHeader,
  SectionTitle,
} from '../../components/ui';
import { api } from '../../lib/api';
import { openLegal, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../../lib/legal';
import {
  FOCUS_SPORTS,
  FOCUS_SPORT_LABEL,
  TIME_OPTIONS,
  golfChips,
  isConfigured,
  levelLabel,
  runChips,
} from '../../lib/sportPreferences';
import { useAuthStore } from '../../stores/auth';
import { sportLabel, useProfileStore } from '../../stores/profile';
import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Profile tab (v2): identity, running/golf preferences and account settings.
 *
 * Rank / Honor / local-champion / battle / tournament / challenge surfaces
 * are intentionally not shown here any more (their APIs and stored data are
 * untouched). Upcoming sessions moved to the My Plans tab.
 */
export function ProfileScreen() {
  const { logout } = useAuthStore();
  const { profile, sportProfiles, fetchProfile } = useProfileStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local guard so a double-tap or repeat confirmation cannot fire
  // DELETE /auth/me twice. Also blocks Log out while a delete is mid-flight.
  // A ref (not state) is required because Alert button onPress callbacks close
  // over stale state — `.current` always reflects the latest value across
  // consecutive invocations.
  const isDeletingRef = useRef(false);

  useEffect(() => {
    fetchProfile()
      .catch((err) => {
        // 404 = profile not yet created — show prompt rather than error
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('404') && !msg.includes('not found')) {
          setError(msg || 'Failed to load profile.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [fetchProfile]);

  // Reset the root stack to AuthEntry. RootNavigator's auth-state effect also
  // forces this when `token` transitions to null, but we keep this explicit
  // reset on the success path so navigation lands instantly without waiting
  // on the store -> effect cycle.
  const resetToAuthEntry = useCallback(() => {
    const parent = navigation.getParent();
    (parent ?? navigation).reset({ index: 0, routes: [{ name: 'AuthEntry' }] });
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    if (isDeletingRef.current) return;
    await logout();
    resetToAuthEntry();
  }, [logout, resetToAuthEntry]);

  const handleDeleteAccount = useCallback(() => {
    if (isDeletingRef.current) return;
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, matches, chat history, and bookings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            // The Alert button can fire twice if the OS retains a stale onPress
            // over a long press. Read the ref instead of state.
            if (isDeletingRef.current) return;
            isDeletingRef.current = true;
            try {
              await api.delete('/auth/me');
              // Order matters: clear local session first (logout drops the
              // token + resets the profile store), then reset navigation so
              // we never re-render Profile against stale state.
              await logout();
              resetToAuthEntry();
            } catch (err) {
              // Failure must NOT logout — the account still exists on the
              // server, the user must stay signed in to retry.
              Alert.alert(
                'Delete failed',
                err instanceof Error
                  ? err.message
                  : "Couldn't delete your account. Please try again or contact support."
              );
            } finally {
              isDeletingRef.current = false;
            }
          },
        },
      ]
    );
  }, [logout, resetToAuthEntry]);

  if (isLoading) {
    return (
      <Screen padded>
        <LoadingState label="Loading your profile…" />
      </Screen>
    );
  }

  const rows = sportProfiles ?? [];
  const legacyRows = rows.filter((sp) => !FOCUS_SPORTS.includes(sp.sport as FocusSport));

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Account"
          title="Profile"
          right={
            profile && !error ? (
              <Button
                label="Edit profile"
                variant="secondary"
                onPress={() => navigation.navigate('EditProfile')}
                accessibilityHint="Edit your name, suburb, photos and bio"
                style={styles.editButton}
                testID="edit-profile"
              />
            ) : undefined
          }
        />

        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : profile ? (
          <Card style={styles.identityCard}>
            <View style={styles.identityRow}>
              {profile.avatarUrl ? (
                <Image
                  source={{ uri: profile.avatarUrl }}
                  style={styles.avatar}
                  accessibilityLabel={`${profile.displayName}'s photo`}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]} accessibilityElementsHidden>
                  <Text style={styles.avatarText}>{profile.displayName?.charAt(0).toUpperCase() ?? '·'}</Text>
                </View>
              )}
              <View style={styles.identityText}>
                <Text style={styles.displayName}>{profile.displayName}</Text>
                {profile.suburb ? <Text style={styles.suburb}>{profile.suburb}</Text> : null}
              </View>
            </View>
            {profile.bio ? <Text style={styles.bioText}>{profile.bio}</Text> : null}
          </Card>
        ) : (
          <EmptyState
            title="Profile not set up"
            body="Finish the basics to start finding running and golf partners."
            actionLabel="Finish setting up"
            onAction={() => navigation.navigate('OnboardingStep1')}
          />
        )}

        {!error && profile ? (
          <View style={styles.section}>
            <SectionTitle hint="These decide who you see — and who sees you.">Your sports</SectionTitle>
            {FOCUS_SPORTS.map((sport) => {
              const row = rows.find((sp) => sp.sport === sport) ?? null;
              return row ? (
                <SportCard
                  key={sport}
                  sport={sport}
                  row={row}
                  onEdit={() => navigation.navigate('EditSportPreferences', { sport })}
                />
              ) : (
                <Card key={sport} style={styles.addCard}>
                  <Text style={styles.addTitle}>{FOCUS_SPORT_LABEL[sport]}</Text>
                  <Text style={styles.addBody}>Not on your profile yet.</Text>
                  <Button
                    label={`Add ${FOCUS_SPORT_LABEL[sport].toLowerCase()}`}
                    variant="secondary"
                    onPress={() => navigation.navigate('SetupSports', { mode: 'add' })}
                  />
                </Card>
              );
            })}
            {legacyRows.length > 0 ? (
              <Text style={styles.legacyNote}>
                Also saved from earlier versions:{' '}
                {legacyRows
                  .map((sp) => `${sportLabel(sp.sport)} (${levelLabel(sp.level) ?? sp.level})`)
                  .join(', ')}
                . They stay on your account but are not part of running and golf matching.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle>Settings</SectionTitle>
          <Card style={styles.listCard}>
            {profile ? (
              <>
                <LinkRow
                  label="Photos & bio"
                  detail="Optional"
                  onPress={() => navigation.navigate('OnboardingStep2')}
                />
                <LinkRow
                  label="Partner preferences"
                  detail="Optional — not used for matching yet"
                  onPress={() => navigation.navigate('OnboardingStep3')}
                />
              </>
            ) : null}
            <LinkRow label="Blocked users" onPress={() => navigation.navigate('BlockedUsers')} />
            <LinkRow
              label="Safety Center"
              detail="Reports, blocking, and community rules"
              onPress={() => navigation.navigate('SafetyCenter')}
              last
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Legal</SectionTitle>
          <Card style={styles.listCard}>
            <LinkRow label="Privacy Policy" role="link" onPress={() => openLegal(PRIVACY_URL, 'Privacy Policy')} />
            <LinkRow label="Terms of Service" role="link" onPress={() => openLegal(TERMS_URL, 'Terms of Service')} />
            <LinkRow label="Support" role="link" onPress={() => openLegal(SUPPORT_URL, 'Support')} last />
          </Card>
        </View>

        <View style={styles.actions}>
          <Button label="Log out" variant="secondary" onPress={handleLogout} />
          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SportCard({ sport, row, onEdit }: { sport: FocusSport; row: SportProfile; onEdit: () => void }) {
  const configured = isConfigured(row);
  const chips = configured ? (sport === 'golf' ? golfChips(row) : runChips(row)) : [];
  const times = (row.preferredTimes ?? [])
    .map((t) => TIME_OPTIONS.find((o) => o.value === t)?.label)
    .filter((t): t is string => !!t);
  return (
    <Card style={styles.sportCard} testID={`sport-card-${sport}`}>
      <View style={styles.sportHeader}>
        <Text style={styles.sportName}>{FOCUS_SPORT_LABEL[sport]}</Text>
        <InfoChip label={levelLabel(row.level) ?? row.level} />
      </View>
      {configured ? (
        <>
          <View style={styles.chips}>
            {chips.map((c) => (
              <InfoChip key={c} label={c} tone="brand" />
            ))}
          </View>
          {times.length > 0 ? <Text style={styles.times}>{times.join(' · ')}</Text> : null}
          <Button
            label={`Edit ${FOCUS_SPORT_LABEL[sport].toLowerCase()} preferences`}
            variant="secondary"
            onPress={onEdit}
          />
        </>
      ) : (
        <>
          <Text style={styles.setupBody}>
            Add your {sport === 'golf' ? 'handicap, experience and who you want to play with' : 'pace and how you like to run'} so
            we can show who fits.
          </Text>
          <Button label={`Set up ${FOCUS_SPORT_LABEL[sport].toLowerCase()} preferences`} onPress={onEdit} />
        </>
      )}
    </Card>
  );
}

function LinkRow({
  label,
  detail,
  onPress,
  role = 'button',
  last = false,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  role?: 'button' | 'link';
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={({ pressed }) => [styles.linkRow, !last && styles.linkRowBorder, pressed && styles.pressed]}
    >
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        {detail ? <Text style={styles.linkDetail}>{detail}</Text> : null}
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

const AVATAR_SIZE = 64;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  pressed: { opacity: 0.7 },
  editButton: { minHeight: TOUCH_TARGET, paddingHorizontal: spacing.md },
  errorText: { ...typography.body, color: colors.error, marginVertical: spacing.md },

  identityCard: { marginBottom: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radii.full },
  avatarFallback: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '700', color: colors.brand },
  identityText: { flex: 1 },
  displayName: { ...typography.h2 },
  suburb: { ...typography.body, marginTop: 2 },
  bioText: { ...typography.body, marginTop: spacing.md },

  section: { marginBottom: spacing.lg },
  sportCard: { marginBottom: spacing.sm, gap: spacing.sm },
  sportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sportName: { ...typography.h3, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  times: { ...typography.bodySmall },
  setupBody: { ...typography.body },
  addCard: { marginBottom: spacing.sm, gap: spacing.xs, borderStyle: 'dashed', borderColor: colors.border },
  addTitle: { ...typography.h3 },
  addBody: { ...typography.body, marginBottom: spacing.xs },
  legacyNote: { ...typography.bodySmall, marginTop: spacing.xs },

  listCard: { paddingVertical: 0 },
  linkRow: {
    minHeight: TOUCH_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  linkText: { flex: 1 },
  linkLabel: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  linkDetail: { ...typography.bodySmall, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textTertiary, marginLeft: spacing.sm },

  actions: { gap: spacing.md, marginTop: spacing.sm },
  deleteButton: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.error },
});
