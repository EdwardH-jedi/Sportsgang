import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { StatBlock } from '../../components/ui';
import { colors, fonts, typography } from '../../theme';

describe('StatBlock', () => {
  it('renders value, unit and label as one accessible element', () => {
    const { getByText, getByLabelText } = render(<StatBlock value="5.2" unit="km" label="Distance" />);
    expect(getByText('5.2')).toBeTruthy();
    expect(getByText('km')).toBeTruthy();
    expect(getByText('Distance')).toBeTruthy();
    expect(getByLabelText('5.2 km, Distance').props.accessibilityRole).toBe('text');
  });

  it('accepts numbers and omits the unit', () => {
    const { getByLabelText } = render(<StatBlock value={14} label="Runs" />);
    expect(getByLabelText('14, Runs')).toBeTruthy();
  });

  it.each([
    ['sm', typography.statSmall.fontSize],
    ['md', typography.stat.fontSize],
    ['lg', typography.statLarge.fontSize],
    ['hero', typography.statHero.fontSize],
  ] as const)('%s size uses the stat preset (condensed, tabular)', (size, fontSize) => {
    const { getByText } = render(<StatBlock value="42" label="L" size={size} />);
    const style = StyleSheet.flatten(getByText('42').props.style);
    expect(style.fontSize).toBe(fontSize);
    expect(style.fontVariant).toEqual(['tabular-nums']);
    expect([fonts.displayBold, fonts.displaySemibold]).toContain(style.fontFamily);
  });

  it('accent colours the value lime', () => {
    const { getByText } = render(<StatBlock value="10" label="L" accent />);
    expect(StyleSheet.flatten(getByText('10').props.style).color).toBe(colors.brand);
  });

  it('supports a custom a11y label and icon', () => {
    const { getByLabelText, getByTestId } = render(
      <StatBlock value="5:12" unit="/km" label="Pace" icon="pace" accessibilityLabel="Pace 5 minutes 12 per km" />
    );
    expect(getByLabelText('Pace 5 minutes 12 per km')).toBeTruthy();
    expect(getByTestId('icon-pace', { includeHiddenElements: true })).toBeTruthy();
  });
});
