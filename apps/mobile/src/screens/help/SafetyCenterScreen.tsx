import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Header, ListRow, Screen } from '../../components/ui';
import { colors, layout, spacing, typography } from '../../theme';
import { GuideSection } from './GuideSection';
import type { SafetyCenterScreenProps } from '../../navigation/types';

/**
 * Safety Center — informational explainer for reports, blocking, and
 * community rules. Copy is deliberately truthful:
 *   - Block scope is "restricted from supported interactions".
 *   - No claim of chat blocking (not implemented in this stream).
 *   - No AI moderation or instant enforcement claims.
 *   - No verified-identity claim.
 */
export function SafetyCenterScreen({ navigation }: SafetyCenterScreenProps) {
  return (
    <Screen
      padded={false}
      header={
        <Header
          title="Safety Center"
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Safety Center
          </Text>
          <Text style={styles.lead}>
            How reports, blocking, and community rules work on SportsGang.
          </Text>
        </View>

        <GuideSection
          title="Report a problem"
          icon="flag"
          lines={[
            'Report unsafe, fraudulent, or unreliable behavior.',
            "We'll review reports and take action when appropriate.",
          ]}
        />

        <GuideSection
          title="Blocking"
          icon="block"
          lines={[
            'Blocked users are restricted from supported interactions such as joining your games where supported.',
          ]}
        >
          <View style={styles.manageRow}>
            <ListRow
              icon="crew"
              title="Manage blocked users"
              subtitle="Manage people you've blocked."
              accessibilityLabel="Manage blocked users"
              onPress={() => navigation.navigate('BlockedUsers')}
            />
          </View>
        </GuideSection>

        <GuideSection
          title="No-show policy"
          icon="clock"
          lines={[
            'Only join games you can attend.',
            'If plans change, leave before the game when possible.',
            'Repeated no-shows may lower Honor.',
          ]}
        />

        <GuideSection
          title="Event safety tips"
          icon="location"
          lines={[
            'Meet in public sports venues.',
            'Check event details before joining.',
            'Trust your instincts and report unsafe behavior.',
          ]}
        />

        <GuideSection
          title="Community rules"
          icon="heart"
          lines={[
            'Be respectful.',
            'Do not harass, scam, or impersonate others.',
            'Keep games safe, fair, and sports-first.',
          ]}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  intro: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
  },
  lead: {
    ...typography.body,
  },
  manageRow: {
    marginHorizontal: -spacing.md,
    marginBottom: -spacing.sm,
  },
});
