import React from 'react';
import { render } from '@testing-library/react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { ICONS, Icon, sportIconName, type IconName } from '../../components/ui/Icon';
import { colors, iconSizes } from '../../theme';

describe('Icon', () => {
  it('maps every semantic name to a real glyph in its icon set', () => {
    for (const [name, source] of Object.entries(ICONS)) {
      const map = (
        source.set === 'feather' ? Feather.glyphMap : MaterialCommunityIcons.glyphMap
      ) as unknown as Record<string, number>;
      expect({ name, found: source.glyph in map }).toEqual({ name, found: true });
    }
  });

  it('covers the names the design brief requires', () => {
    const required: IconName[] = [
      'run', 'crew', 'chat', 'profile', 'map', 'list', 'filter', 'plus', 'back',
      'close', 'chevron-right', 'location', 'calendar', 'clock', 'pace',
      'distance', 'check', 'more', 'send', 'shield', 'flag', 'logout', 'trash',
      'edit', 'camera', 'search', 'star', 'trophy', 'gym', 'tennis', 'golf',
      'bell', 'settings', 'info', 'alert',
    ];
    for (const name of required) expect(ICONS[name]).toBeDefined();
  });

  it('uses Feather for chrome and MaterialCommunityIcons for sport glyphs', () => {
    expect(ICONS.back.set).toBe('feather');
    expect(ICONS.chat.set).toBe('feather');
    expect(ICONS.run.set).toBe('mci');
    expect(ICONS.gym.set).toBe('mci');
    expect(ICONS.tennis.set).toBe('mci');
    expect(ICONS.golf.set).toBe('mci');
  });

  it('renders with token size and default colour', () => {
    const { getByTestId } = render(<Icon name="pace" size="lg" />);
    const node = getByTestId('icon-pace', { includeHiddenElements: true });
    const style = [node.props.style].flat(Infinity).reduce((a, b) => ({ ...a, ...b }), {});
    expect(style.fontSize).toBe(iconSizes.lg);
    expect(style.color).toBe(colors.textPrimary);
  });

  it('accepts a numeric size and custom colour', () => {
    const { getByTestId } = render(<Icon name="back" size={30} color={colors.brand} />);
    const style = [getByTestId('icon-back', { includeHiddenElements: true }).props.style]
      .flat(Infinity)
      .reduce((a, b) => ({ ...a, ...b }), {});
    expect(style.fontSize).toBe(30);
    expect(style.color).toBe(colors.brand);
  });

  it('is hidden from screen readers by default', () => {
    const { getByTestId, queryByTestId } = render(<Icon name="send" />);
    expect(queryByTestId('icon-send')).toBeNull();
    const node = getByTestId('icon-send', { includeHiddenElements: true });
    expect(node.props.accessible).toBe(false);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('exposes an image role when given a label', () => {
    const { getByLabelText } = render(<Icon name="trophy" accessibilityLabel="Winner" />);
    expect(getByLabelText('Winner').props.accessibilityRole).toBe('image');
  });

  it('maps sport ids to glyphs with a fallback', () => {
    expect(sportIconName('running')).toBe('run');
    expect(sportIconName('gym')).toBe('gym');
    expect(sportIconName('badminton')).toBe('badminton');
    expect(sportIconName('curling')).toBe('activity');
  });
});
