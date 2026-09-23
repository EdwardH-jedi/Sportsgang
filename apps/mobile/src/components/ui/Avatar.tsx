import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, face, radii } from '../../theme';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 };

export interface AvatarProps {
  /** Person's display name: initials fallback + accessible name. */
  name: string;
  uri?: string | null;
  size?: AvatarSize | number;
  /** Lime ring (e.g. crew owner, "you", active runner). */
  ring?: boolean;
  onPress?: () => void;
  /** Defaults to `name`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Round profile image with an initials fallback (also used on load error). */
export function Avatar({
  name,
  uri,
  size = 'md',
  ring = false,
  onPress,
  accessibilityLabel,
  testID,
  style,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const d = typeof size === 'number' ? size : SIZES[size];
  const ringWidth = ring ? Math.max(2, Math.round(d / 24)) : 0;
  const inner = d - ringWidth * 4;
  const showImage = Boolean(uri) && !failed;

  const body = (
    <View
      style={[
        styles.ring,
        { width: d, height: d, borderRadius: d / 2, borderWidth: ringWidth },
        ring && styles.ringOn,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          onError={() => setFailed(true)}
          style={{ width: ring ? inner : d, height: ring ? inner : d, borderRadius: d / 2 }}
          testID={testID ? `${testID}-image` : undefined}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: ring ? inner : d, height: ring ? inner : d, borderRadius: d / 2 },
          ]}
        >
          <Text style={[styles.initials, { fontSize: Math.max(10, Math.round(d * 0.38)) }]}>
            {initialsFor(name)}
          </Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? name}
        testID={testID}
        hitSlop={d < 44 ? Math.ceil((44 - d) / 2) : undefined}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? name} testID={testID}>
      {body}
    </View>
  );
}

export interface AvatarGroupProps {
  people: readonly { name: string; uri?: string | null }[];
  /** Visible avatars before the "+N" counter. Default 4. */
  max?: number;
  size?: AvatarSize;
  /** Total member count when `people` is a preview slice. */
  total?: number;
  testID?: string;
}

/** Overlapping avatar stack with a "+N" counter (crew members). */
export function AvatarGroup({ people, max = 4, size = 'sm', total, testID }: AvatarGroupProps) {
  const d = SIZES[size];
  const shown = people.slice(0, max);
  const count = total ?? people.length;
  const extra = count - shown.length;
  const label = `${count} ${count === 1 ? 'member' : 'members'}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={styles.group}
      testID={testID}
    >
      {shown.map((p, i) => (
        <View
          key={`${p.name}-${i}`}
          style={[styles.groupItem, { marginLeft: i === 0 ? 0 : -d * 0.3, zIndex: shown.length - i }]}
        >
          <Avatar name={p.name} uri={p.uri} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.more,
            { width: d, height: d, borderRadius: d / 2, marginLeft: -d * 0.3 },
          ]}
        >
          <Text style={[styles.moreText, { fontSize: Math.max(10, Math.round(d * 0.34)) }]}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
  },
  ringOn: {
    borderColor: colors.brand,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  initials: {
    ...face('displayBold', '700'),
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupItem: {
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.background,
  },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.background,
  },
  moreText: {
    ...face('semibold', '600'),
    color: colors.textSecondary,
  },
});
