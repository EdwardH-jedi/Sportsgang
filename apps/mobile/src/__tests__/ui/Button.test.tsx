import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Button } from '../../components/ui';
import { colors } from '../../theme';

const flat = (node: { props: { style: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

beforeEach(() => jest.clearAllMocks());

describe('Button', () => {
  it('renders the label as an accessible button', () => {
    const { getByRole } = render(<Button label="Host a run" />);
    const btn = getByRole('button', { name: 'Host a run' });
    expect(btn).toBeTruthy();
  });

  it('calls onPress with a light haptic for primary', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Join" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Join' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('skips the haptic for secondary unless asked', () => {
    const { getByRole, rerender } = render(<Button label="Later" variant="secondary" onPress={jest.fn()} />);
    fireEvent.press(getByRole('button'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    rerender(<Button label="Later" variant="secondary" haptic onPress={jest.fn()} />);
    fireEvent.press(getByRole('button'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['primary', colors.brand, colors.textInverse],
    ['secondary', colors.surfaceElevated, colors.textPrimary],
    ['ghost', 'transparent', colors.brand],
    ['destructive', colors.errorSoft, colors.error],
  ] as const)('%s variant colours', (variant, bg, fg) => {
    const { getByRole, getByText } = render(<Button label="X" variant={variant} />);
    expect(flat(getByRole('button')).backgroundColor).toBe(bg);
    expect(flat(getByText('X')).color).toBe(fg);
  });

  it.each([
    ['sm', 36],
    ['md', 48],
    ['lg', 56],
  ] as const)('%s size is %ipt tall and reaches a 44pt target', (size, height) => {
    const { getByRole } = render(<Button label="X" size={size} />);
    const node = getByRole('button');
    expect(flat(node).height).toBe(height);
    const slop = (node.props.hitSlop?.top ?? 0) + (node.props.hitSlop?.bottom ?? 0);
    expect(height + slop).toBeGreaterThanOrEqual(44);
  });

  it('disabled: no press, disabled state, dimmed', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Send" disabled onPress={onPress} />);
    const btn = getByRole('button');
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn).toBeDisabled();
    expect(flat(btn).opacity).toBe(0.4);
  });

  it('loading: spinner, busy state, no press, keeps label for a11y', () => {
    const onPress = jest.fn();
    const { getByRole, getByTestId } = render(<Button label="Save" loading onPress={onPress} testID="save" />);
    const btn = getByRole('button', { name: 'Save' });
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(getByTestId('save-spinner')).toBeTruthy();
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders leading and trailing icons', () => {
    const { getByTestId } = render(<Button label="Add" leadingIcon="plus" trailingIcon="chevron-right" />);
    expect(getByTestId('icon-plus', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('icon-chevron-right', { includeHiddenElements: true })).toBeTruthy();
  });

  it('supports a custom accessibility label and full width', () => {
    const { getByRole } = render(<Button label="Go" accessibilityLabel="Start the run" fullWidth />);
    const btn = getByRole('button', { name: 'Start the run' });
    expect(flat(btn).alignSelf).toBe('stretch');
  });
});
