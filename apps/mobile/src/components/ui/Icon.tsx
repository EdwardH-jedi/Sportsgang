import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, iconSizes, type IconSize } from '../../theme';

type FeatherGlyph = keyof typeof Feather.glyphMap;
type MciGlyph = keyof typeof MaterialCommunityIcons.glyphMap;

type IconSource =
  | { set: 'feather'; glyph: FeatherGlyph }
  | { set: 'mci'; glyph: MciGlyph };

const feather = (glyph: FeatherGlyph): IconSource => ({ set: 'feather', glyph });
const mci = (glyph: MciGlyph): IconSource => ({ set: 'mci', glyph });

/**
 * Semantic icon names → glyphs. Screens ask for *what* the icon means
 * ("pace", "crew"), never for a glyph, so swapping artwork is a one-line
 * change here. Feather draws UI chrome; MaterialCommunityIcons supplies
 * sport and run-specific glyphs Feather doesn't have.
 */
export const ICONS = {
  // Navigation / tabs
  run: mci('run'),
  crew: feather('users'),
  chat: feather('message-circle'),
  profile: feather('user'),
  home: feather('home'),

  // Chrome
  map: feather('map'),
  list: feather('list'),
  filter: feather('sliders'),
  plus: feather('plus'),
  minus: feather('minus'),
  back: feather('chevron-left'),
  close: feather('x'),
  'chevron-right': feather('chevron-right'),
  'chevron-down': feather('chevron-down'),
  'chevron-up': feather('chevron-up'),
  check: feather('check'),
  'check-circle': feather('check-circle'),
  more: feather('more-horizontal'),
  send: feather('send'),
  search: feather('search'),
  settings: feather('settings'),
  bell: feather('bell'),
  info: feather('info'),
  help: feather('help-circle'),
  alert: feather('alert-circle'),
  warning: feather('alert-triangle'),
  refresh: feather('rotate-cw'),
  'external-link': feather('external-link'),
  lock: feather('lock'),
  mail: feather('mail'),
  eye: feather('eye'),
  'eye-off': feather('eye-off'),
  image: feather('image'),
  camera: feather('camera'),
  edit: feather('edit-2'),
  trash: feather('trash-2'),
  logout: feather('log-out'),
  shield: feather('shield'),
  flag: feather('flag'),
  block: feather('slash'),
  heart: feather('heart'),
  star: feather('star'),
  'user-plus': feather('user-plus'),

  // Place & time
  location: feather('map-pin'),
  'my-location': feather('navigation'),
  calendar: feather('calendar'),
  clock: feather('clock'),

  // Run stats
  pace: mci('speedometer'),
  distance: mci('map-marker-distance'),
  timer: mci('timer-outline'),
  activity: feather('activity'),
  trending: feather('trending-up'),

  // Achievements
  trophy: mci('trophy-outline'),
  medal: mci('medal-outline'),
  award: feather('award'),
  finish: mci('flag-checkered'),
  battle: mci('sword-cross'),

  // Sports
  gym: mci('dumbbell'),
  tennis: mci('tennis'),
  golf: mci('golf'),
  basketball: mci('basketball'),
  soccer: mci('soccer'),
  badminton: mci('badminton'),
} as const satisfies Record<string, IconSource>;

export type IconName = keyof typeof ICONS;

/** Sport id (registry or battle vocabulary) → icon, with a neutral fallback. */
export function sportIconName(sport: string): IconName {
  switch (sport) {
    case 'running':
      return 'run';
    case 'gym':
    case 'tennis':
    case 'golf':
    case 'basketball':
    case 'soccer':
    case 'badminton':
      return sport;
    default:
      return 'activity';
  }
}

export interface IconProps {
  name: IconName;
  /** Token (`md` = 20) or a number of points. Default `md`. */
  size?: IconSize | number;
  /** Default `colors.textPrimary`. */
  color?: string;
  /**
   * Icons are decorative by default (hidden from screen readers — the
   * control around them carries the label). Pass a label only for a
   * standalone meaningful icon.
   */
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

export function Icon({
  name,
  size = 'md',
  color = colors.textPrimary,
  accessibilityLabel,
  style,
  testID,
}: IconProps) {
  const source: IconSource = ICONS[name];
  const px = typeof size === 'number' ? size : iconSizes[size];
  const a11y = accessibilityLabel
    ? {
        accessible: true,
        accessibilityRole: 'image' as const,
        accessibilityLabel,
      }
    : {
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

  if (source.set === 'mci') {
    return (
      <MaterialCommunityIcons
        name={source.glyph}
        size={px}
        color={color}
        style={style}
        testID={testID ?? `icon-${name}`}
        {...a11y}
      />
    );
  }
  return (
    <Feather
      name={source.glyph}
      size={px}
      color={color}
      style={style}
      testID={testID ?? `icon-${name}`}
      {...a11y}
    />
  );
}

/** Icon font files, preloaded with the brand fonts to avoid icon pop-in. */
export const iconFontSources = {
  ...Feather.font,
  ...MaterialCommunityIcons.font,
};
