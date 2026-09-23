import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  AvatarGroup,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  ICONS,
  Icon,
  IconButton,
  ListRow,
  Screen,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  StatBlock,
  TextField,
  type IconName,
} from '../../components/ui';
import type { UiGalleryScreenProps } from '../../navigation/types';
import { colors, elevation, radii, spacing, typography } from '../../theme';

/**
 * DEV ONLY — every primitive and variant on one scrollable page, so the
 * design system can be reviewed on a simulator. Registered in the root
 * stack only when `__DEV__` (Profile → Developer → UI gallery).
 */
export function UiGalleryScreen({ navigation }: UiGalleryScreenProps) {
  const [segment, setSegment] = useState<'group' | 'runners'>('group');
  const [chips, setChips] = useState<string[]>(['today']);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inlineIndex, setInlineIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');

  const toggleChip = (id: string) =>
    setChips((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <Screen
      scroll
      header={<Header title="UI gallery" subtitle="Design system v2" onBack={() => navigation.goBack()} />}
    >
      <Section title="Typography">
        <Text style={typography.display}>Display 48</Text>
        <Text style={typography.h1}>H1 Runs near you</Text>
        <Text style={typography.h2}>H2 Inter Bold</Text>
        <Text style={typography.h3}>H3 Inter SemiBold</Text>
        <Text style={typography.bodyLarge}>Body large — Inter Regular 17</Text>
        <Text style={typography.body}>Body — Inter Regular 15, secondary</Text>
        <Text style={typography.bodyStrong}>Body strong — Inter SemiBold 15</Text>
        <Text style={typography.bodySmall}>Body small — tertiary 13</Text>
        <Text style={typography.caption}>Caption — Inter Medium 12</Text>
        <Text style={typography.label}>Label — uppercase tracking</Text>
        <Text style={typography.statHero}>10.42</Text>
        <Text style={typography.statLarge}>5:12 /KM</Text>
        <Text style={typography.stat}>1,284</Text>
        <Text style={typography.statSmall}>42.2</Text>
      </Section>

      <Section title="Colours & surfaces">
        <View style={styles.swatches}>
          {(
            [
              'background',
              'surface',
              'surfaceElevated',
              'surfaceHigh',
              'surfacePressed',
              'brand',
              'brandDark',
              'accent',
              'brandSoft',
              'border',
              'borderStrong',
              'success',
              'warning',
              'error',
            ] as const
          ).map((key) => (
            <View key={key} style={styles.swatchItem}>
              <View style={[styles.swatch, { backgroundColor: colors[key] }]} />
              <Text style={styles.swatchLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {key}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          {(['sm', 'md', 'lg'] as const).map((level) => (
            <View key={level} style={[styles.elevationBox, elevation[level]]}>
              <Text style={typography.caption}>elevation.{level}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Button">
        {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((variant) => (
          <View key={variant} style={styles.row}>
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <Button
                key={size}
                label={`${variant} ${size}`}
                variant={variant}
                size={size}
                onPress={() => undefined}
                // Buttons self-align to flex-start; centre them so sm / md / lg
                // share a centre line (visible with the fill-less ghost).
                style={styles.centerSelf}
              />
            ))}
          </View>
        ))}
        <Button label="Host a run" leadingIcon="plus" fullWidth onPress={() => undefined} />
        <View style={styles.row}>
          <Button
            label="Tap to load"
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button label="Disabled" disabled />
          <Button label="Next" variant="secondary" trailingIcon="chevron-right" />
        </View>
      </Section>

      <Section title="IconButton">
        <View style={styles.row}>
          {(['plain', 'filled', 'outline', 'brand'] as const).map((variant) => (
            <IconButton key={variant} icon="filter" variant={variant} accessibilityLabel={`Filter ${variant}`} />
          ))}
          <IconButton icon="bell" variant="filled" badge accessibilityLabel="Notifications" />
          <IconButton icon="plus" variant="brand" size="lg" accessibilityLabel="Host a run" />
          <IconButton icon="close" size="sm" accessibilityLabel="Close" />
          <IconButton icon="trash" disabled accessibilityLabel="Delete" />
        </View>
      </Section>

      <Section title="TextField">
        <TextField label="Crew name" placeholder="e.g. Bondi Dawn Patrol" value={text} onChangeText={setText} helper="Shown on every run you host." />
        <TextField label="Meeting point" leadingIcon="location" placeholder="Search a place" />
        <TextField label="Distance" error="Enter a distance between 1 and 50 km" defaultValue="0" keyboardType="decimal-pad" />
        <TextField label="Password" secure placeholder="At least 8 characters" />
        <TextField label="About the run" multiline placeholder="Pace, route, coffee after…" />
        <TextField label="Disabled" disabled defaultValue="Can't edit" />
      </Section>

      <Section title="Card">
        <Card>
          <Text style={typography.bodyStrong}>Default card</Text>
          <Text style={typography.body}>Static surface level 1.</Text>
        </Card>
        <Card variant="elevated">
          <Text style={typography.bodyStrong}>Elevated card</Text>
        </Card>
        <Card variant="outline">
          <Text style={typography.bodyStrong}>Outline card</Text>
        </Card>
        <Card variant="brand">
          <Text style={typography.bodyStrong}>Brand card — Next up</Text>
        </Card>
        <Card onPress={() => undefined} accessibilityLabel="Saturday long run, 12 km">
          <View style={styles.cardRow}>
            <View style={styles.flex}>
              <Text style={typography.label}>SAT 7:00</Text>
              <Text style={typography.h3}>Saturday long run</Text>
              <Text style={typography.bodySmall}>Bondi Dawn Patrol · 1.2 km away</Text>
            </View>
            <StatBlock value="12" unit="km" label="Distance" size="sm" />
          </View>
          <View style={[styles.row, styles.mtSm]}>
            <Badge label="5:30–6:00 /km" icon="pace" />
            <Badge label="3 spots left" tone="warning" />
          </View>
        </Card>
      </Section>

      <Section title="Chip">
        <View style={styles.row}>
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This week' },
            { id: 'all', label: 'All' },
          ].map((c) => (
            <Chip key={c.id} label={c.label} selected={chips.includes(c.id)} onPress={() => toggleChip(c.id)} />
          ))}
        </View>
        <View style={styles.row}>
          <Chip label="Running" icon="run" selected onPress={() => undefined} />
          <Chip label="Gym" icon="gym" onPress={() => undefined} />
          <Chip label="Tennis" icon="tennis" size="sm" onPress={() => undefined} />
          <Chip label="Static" />
          <Chip label="Disabled" disabled onPress={() => undefined} />
        </View>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          accessibilityLabel="Run view"
          value={segment}
          onChange={setSegment}
          segments={[
            { value: 'group', label: 'Group runs', icon: 'crew' },
            { value: 'runners', label: 'Runners', icon: 'run' },
          ]}
        />
      </Section>

      <Section title="Badge / Tag">
        {(['soft', 'solid', 'outline'] as const).map((variant) => (
          <View key={variant} style={styles.row}>
            {(['neutral', 'brand', 'success', 'warning', 'error'] as const).map((tone) => (
              <Badge key={tone} label={tone} tone={tone} variant={variant} />
            ))}
          </View>
        ))}
        <View style={styles.row}>
          <Badge label="Crew owner" icon="shield" tone="brand" size="sm" />
          <Badge label="Confirmed" icon="check" tone="success" size="sm" />
        </View>
      </Section>

      <Section title="Avatar">
        <View style={styles.row}>
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <Avatar key={size} name="Jordan Lee" size={size} />
          ))}
          <Avatar name="Sam Park" size="lg" ring />
          <Avatar name="Broken Image" size="lg" uri="https://invalid.example/avatar.png" />
        </View>
        <AvatarGroup
          people={[{ name: 'Ana Ruiz' }, { name: 'Ben Ho' }, { name: 'Cleo Diaz' }, { name: 'Dev Rao' }, { name: 'Eli Ng' }]}
          total={18}
        />
      </Section>

      <Section title="Header">
        <View style={styles.framed}>
          <Header title="Crew details" onBack={() => undefined} backLabel="Back (demo)" actions={[{ icon: 'more', onPress: () => undefined, accessibilityLabel: 'More options' }]} />
        </View>
        <View style={styles.framed}>
          <Header
            large
            eyebrow="Bondi · 2 km radius"
            title="Runs near you"
            actions={[
              { icon: 'filter', onPress: () => undefined, accessibilityLabel: 'Filters' },
              { icon: 'bell', onPress: () => undefined, accessibilityLabel: 'Notifications', badge: true },
            ]}
          />
        </View>
      </Section>

      <Section title="ListRow">
        <View style={styles.framed}>
          <ListRow icon="calendar" title="Upcoming sessions" subtitle="2 confirmed" onPress={() => undefined} />
          <ListRow icon="trophy" title="Games & challenges" value="3" onPress={() => undefined} />
          <ListRow leading={<Avatar name="Jordan Lee" size="md" />} title="Jordan Lee" subtitle="Newtown · 5:15 /km" onPress={() => undefined} />
          <ListRow icon="shield" title="Static row" subtitle="No chevron" />
          <ListRow icon="trash" title="Delete my account" destructive onPress={() => undefined} />
        </View>
      </Section>

      <Section title="StatBlock">
        <View style={styles.statRow}>
          <StatBlock value="5.2" unit="km" label="Distance" icon="distance" />
          <StatBlock value="5:12" unit="/km" label="Avg pace" icon="pace" />
          <StatBlock value={14} label="Runs" />
        </View>
        <StatBlock value="42.2" unit="km" label="This month" size="hero" accent align="center" />
        <StatBlock value="1,284" label="Gang score" size="lg" />
      </Section>

      <Section title="Skeleton">
        <View style={styles.cardRow} accessible accessibilityLabel="Loading">
          <Skeleton circle height={48} />
          <View style={styles.flex}>
            <SkeletonText lines={2} />
          </View>
        </View>
        <Skeleton height={120} radius={radii.lg} />
      </Section>

      <Section title="EmptyState">
        <View style={styles.framed}>
          <EmptyState
            compact
            icon="crew"
            title="Crews are coming"
            message="Run with the same people every week."
            action={{ label: 'Find runners', icon: 'run', onPress: () => undefined }}
            secondaryAction={{ label: 'Learn more', onPress: () => undefined }}
          />
        </View>
      </Section>

      <Section title="BottomSheet">
        <Button label="Open modal sheet" variant="secondary" onPress={() => setSheetOpen(true)} />
        <View style={styles.sheetStage}>
          <Text style={[typography.bodySmall, styles.stageText]}>Map area (non-modal sheet, snap {inlineIndex})</Text>
          <BottomSheet
            snapPoints={[64, 160, 250]}
            index={inlineIndex}
            onIndexChange={setInlineIndex}
            title="12 runs this week"
            testID="gallery-inline-sheet"
          >
            <View style={styles.sheetBody}>
              <ListRow icon="run" title="Sunrise 5k" subtitle="Tomorrow 6:00" onPress={() => undefined} />
            </View>
          </BottomSheet>
        </View>
      </Section>

      <Section title="Icons">
        <View style={styles.iconGrid}>
          {(Object.keys(ICONS) as IconName[]).map((name) => (
            <View key={name} style={styles.iconCell}>
              <Icon name={name} size="lg" />
              <Text style={styles.iconName} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <BottomSheet
        modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        snapPoints={['45%', '85%']}
        title="Filters"
        testID="gallery-modal-sheet"
      >
        <View style={styles.sheetBody}>
          <Text style={typography.label}>When</Text>
          <View style={styles.row}>
            <Chip label="Today" selected onPress={() => undefined} />
            <Chip label="This week" onPress={() => undefined} />
          </View>
          <Button label="Show runs" fullWidth onPress={() => setSheetOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  sectionBody: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mtSm: {
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  // Three per row on a 375pt phone, wide enough for "surfaceElevated".
  swatchItem: {
    width: 100,
    gap: spacing.xs,
  },
  swatchLabel: {
    ...typography.caption,
    fontSize: typography.label.fontSize,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  swatch: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  elevationBox: {
    width: 96,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  framed: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetStage: {
    height: 300,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageText: {
    padding: spacing.md,
  },
  sheetBody: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconCell: {
    width: 76,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  iconName: {
    ...typography.caption,
    fontSize: 10,
  },
});
