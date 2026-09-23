import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { Card } from '../../components/ui';
import { colors } from '../../theme';

describe('Card', () => {
  it('renders static content without a button role', () => {
    const { getByText, queryByRole } = render(
      <Card>
        <Text>Inside</Text>
      </Card>
    );
    expect(getByText('Inside')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it.each([
    ['default', colors.surface],
    ['elevated', colors.surfaceElevated],
    ['outline', 'transparent'],
    ['brand', colors.brandSoft],
  ] as const)('%s variant surface', (variant, bg) => {
    const { getByTestId } = render(
      <Card variant={variant} testID="c">
        <Text>x</Text>
      </Card>
    );
    expect(StyleSheet.flatten(getByTestId('c').props.style).backgroundColor).toBe(bg);
  });

  it('is a labelled button when pressable', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <Card onPress={onPress} accessibilityLabel="Saturday long run">
        <Text>Run</Text>
      </Card>
    );
    fireEvent.press(getByRole('button', { name: 'Saturday long run' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled pressable card ignores presses', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <Card onPress={onPress} disabled accessibilityLabel="Full run">
        <Text>Run</Text>
      </Card>
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByRole('button')).toBeDisabled();
  });

  it('applies padding tokens', () => {
    const { getByTestId } = render(
      <Card padding="none" testID="c">
        <Text>x</Text>
      </Card>
    );
    expect(StyleSheet.flatten(getByTestId('c').props.style).padding).toBe(0);
  });
});
