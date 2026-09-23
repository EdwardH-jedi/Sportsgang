import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';

interface Props {
  eyebrow: string;
  title: string;
}

/** Shared top block for Login / Register: small wordmark, eyebrow, big title. */
export function AuthHeading({ eyebrow, title }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Icon name="run" size="lg" color={colors.brand} />
        <Text style={styles.wordmark}>sportsgang</Text>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  wordmark: {
    ...typography.statSmall,
    color: colors.brand,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  title: {
    ...typography.display,
  },
});
