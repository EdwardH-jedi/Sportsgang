import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Header, Screen } from '../../components/ui';
import { colors, face, layout, spacing, typography } from '../../theme';
import { GuideSection } from './GuideSection';
import type { HonorGuideScreenProps } from '../../navigation/types';

/**
 * Honor Guide — informational explainer for Honor / Gang Score /
 * Sport Levels. Copy is deliberately specific:
 *   - "Honor is not popularity."
 *   - "It reflects attendance, fair play, and reliable hosting."
 * Never describe Honor as a leaderboard, never claim AI moderation,
 * instant enforcement, or verified identity.
 */

const HONOR_LEVELS = [
  'Rookie',
  'Regular',
  'Trusted',
  'Captain',
  'Legend',
] as const;

export function HonorGuideScreen({ navigation }: HonorGuideScreenProps) {
  return (
    <Screen
      padded={false}
      header={
        <Header
          title="Honor Guide"
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Build your Honor
          </Text>
          <Text style={styles.leadStrong}>Honor is not popularity.</Text>
          <Text style={styles.lead}>
            It reflects attendance, fair play, and reliable hosting.
          </Text>
        </View>

        <GuideSection
          title="Honor"
          icon="award"
          lines={[
            'Honor reflects how reliable you are in the SportsGang community.',
            'Showing up, playing fairly, and hosting responsibly help build trust.',
          ]}
        />

        <GuideSection
          title="Gang Score"
          icon="activity"
          lines={[
            'Gang Score reflects your activity and contribution.',
            'Completing games and hosting reliable events can increase your Gang Score.',
          ]}
        />

        <GuideSection
          title="Sport Levels"
          icon="trending"
          lines={[
            'Each sport has its own level.',
            'Sport Levels reflect experience in that sport, not overall popularity.',
          ]}
        />

        <GuideSection
          title="No-show policy"
          icon="clock"
          lines={[
            'Only join games you can attend.',
            'No-shows can lower Honor.',
            'Excused attendance does not lower Honor.',
          ]}
        />

        <GuideSection
          title="Reports and safety"
          icon="shield"
          lines={[
            'Reports help us review unsafe or unreliable behavior.',
            "Reports do not automatically change someone's Honor.",
            'Only reviewed actioned reports may affect Honor.',
          ]}
        />

        <GuideSection title="Honor levels" icon="medal">
          <View style={styles.levelList}>
            {HONOR_LEVELS.map((level, i) => (
              <Badge
                key={level}
                label={level}
                tone={i >= 2 ? 'brand' : 'neutral'}
                variant={i === HONOR_LEVELS.length - 1 ? 'solid' : 'soft'}
              />
            ))}
          </View>
        </GuideSection>
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
  leadStrong: {
    ...typography.bodyLarge,
    ...face('semibold', '600'),
    color: colors.brand,
  },
  lead: {
    ...typography.body,
  },
  levelList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
