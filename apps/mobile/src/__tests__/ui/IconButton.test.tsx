import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { IconButton } from '../../components/ui';
import { colors } from '../../theme';

const flat = (node: { props: { style: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

beforeEach(() => jest.clearAllMocks());

describe('IconButton', () => {
  it('is a labelled button that calls onPress', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<IconButton icon="close" accessibilityLabel="Close" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reaches 44pt with hitSlop at every size', () => {
    for (const [size, d] of [['sm', 32], ['md', 40], ['lg', 56]] as const) {
      const { getByRole, unmount } = render(<IconButton icon="plus" size={size} accessibilityLabel="Add" />);
      const node = getByRole('button');
      expect(flat(node).width).toBe(d);
      const slop = (node.props.hitSlop?.left ?? 0) + (node.props.hitSlop?.right ?? 0);
      expect(d + slop).toBeGreaterThanOrEqual(44);
      unmount();
    }
  });

  it('brand variant is lime with a haptic', () => {
    const { getByRole } = render(<IconButton icon="plus" variant="brand" accessibilityLabel="Host" onPress={jest.fn()} />);
    expect(flat(getByRole('button')).backgroundColor).toBe(colors.brand);
    fireEvent.press(getByRole('button'));
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('outline variant has a border; plain has none', () => {
    const { getByRole, rerender } = render(<IconButton icon="map" variant="outline" accessibilityLabel="Map" />);
    expect(flat(getByRole('button')).borderWidth).toBe(1);
    rerender(<IconButton icon="map" variant="plain" accessibilityLabel="Map" />);
    expect(flat(getByRole('button')).borderWidth).toBe(0);
  });

  it('disabled blocks presses', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<IconButton icon="trash" disabled accessibilityLabel="Delete" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByRole('button')).toBeDisabled();
  });

  it('shows a badge dot', () => {
    const { getByTestId } = render(<IconButton icon="bell" badge accessibilityLabel="Alerts" testID="bell" />);
    expect(getByTestId('bell-badge')).toBeTruthy();
  });
});
