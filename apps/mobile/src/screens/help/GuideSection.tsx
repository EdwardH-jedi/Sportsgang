import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, type IconName } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../theme';

interface GuideSectionProps {
  title: string;
  icon: IconName;
  /** Short statements, rendered as a lime-marked list. */
  lines?: readonly string[];
  /** Extra content under the list (actions, badges). */
  children?: React.ReactNode;
}

/**
 * One titled block of an informational guide (Honor Guide, Safety
 * Center). Labelled `Section <title>` for screen readers and tests.
 */
export function GuideSection({ title, icon, lines = [], children }: GuideSectionProps) {
  return (
    <Card accessibilityLabel={`Section ${title}`} padding="lg" style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size="md" color={colors.brand} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {lines.length > 0 ? (
        <View style={styles.lines}>
          {lines.map((line) => (
            <View key={line} style={styles.lineRow}>
              <View style={styles.marker} />
              <Text style={styles.line}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** Small lime list marker, vertically centred on the first body line. */
const MARKER = spacing.xs + spacing.xs / 2;

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  iconWrap: {
    width: spacing.xl + spacing.xs,
    height: spacing.xl + spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  lines: {
    gap: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
  },
  marker: {
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    backgroundColor: colors.brand,
    marginTop: (typography.body.lineHeight - MARKER) / 2,
  },
  line: {
    ...typography.body,
    flex: 1,
  },
});
