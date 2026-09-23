import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Skeleton, SkeletonText } from '../../../components/ui';
import { spacing } from '../../../theme';

/** Placeholder with the RunCard's shape while runs load. */
export function RunCardSkeleton() {
  return (
    <Card testID="run-card-skeleton">
      <Skeleton width="40%" height={12} />
      <SkeletonText lines={1} style={styles.gap} />
      <View style={[styles.row, styles.gap]}>
        <Skeleton width={56} height={28} />
        <Skeleton width={72} height={28} />
        <Skeleton width={40} height={28} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
});
