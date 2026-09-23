import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { Badge, Tag } from '../../components/ui';
import { colors } from '../../theme';

describe('Badge', () => {
  it('renders an accessible text label', () => {
    const { getByLabelText, getByText } = render(<Badge label="3 spots left" />);
    expect(getByText('3 spots left')).toBeTruthy();
    expect(getByLabelText('3 spots left').props.accessibilityRole).toBe('text');
  });

  it.each([
    ['soft', 'brand', colors.brandSoft, colors.brand],
    ['solid', 'brand', colors.brand, colors.textInverse],
    ['outline', 'error', 'transparent', colors.error],
    ['soft', 'warning', colors.warningSoft, colors.warning],
    ['soft', 'success', colors.successSoft, colors.success],
  ] as const)('%s %s colours', (variant, tone, bg, fg) => {
    const { getByTestId, getByText } = render(<Badge label="L" variant={variant} tone={tone} testID="b" />);
    expect(StyleSheet.flatten(getByTestId('b').props.style).backgroundColor).toBe(bg);
    expect(StyleSheet.flatten(getByText('L').props.style).color).toBe(fg);
  });

  it('renders an icon and custom a11y label', () => {
    const { getByLabelText, getByTestId } = render(
      <Badge label="5:30" icon="pace" accessibilityLabel="Pace 5:30 per km" />
    );
    expect(getByLabelText('Pace 5:30 per km')).toBeTruthy();
    expect(getByTestId('icon-pace', { includeHiddenElements: true })).toBeTruthy();
  });

  it('Tag is the same component', () => {
    expect(Tag).toBe(Badge);
  });
});
