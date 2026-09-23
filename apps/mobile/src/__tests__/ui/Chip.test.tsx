import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Chip } from '../../components/ui';
import { colors } from '../../theme';

beforeEach(() => jest.clearAllMocks());

describe('Chip', () => {
  it('is a button exposing its selected state', () => {
    const { getByRole } = render(<Chip label="Today" selected onPress={jest.fn()} />);
    const chip = getByRole('button', { name: 'Today' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(StyleSheet.flatten(chip.props.style).backgroundColor).toBe(colors.brand);
  });

  it('unselected uses the elevated surface', () => {
    const { getByRole } = render(<Chip label="All" onPress={jest.fn()} />);
    const chip = getByRole('button');
    expect(chip.props.accessibilityState).toMatchObject({ selected: false });
    expect(StyleSheet.flatten(chip.props.style).backgroundColor).toBe(colors.surfaceElevated);
  });

  it('calls onPress with a selection haptic', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Gym" icon="gym" onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('renders an icon', () => {
    const { getByTestId } = render(<Chip label="Run" icon="run" onPress={jest.fn()} />);
    expect(getByTestId('icon-run', { includeHiddenElements: true })).toBeTruthy();
  });

  it('disabled ignores presses', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Chip label="Full" disabled onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('without onPress it is static text, not a button', () => {
    const { getByText, queryByRole } = render(<Chip label="Static" />);
    expect(getByText('Static')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('reaches a 44pt touch target', () => {
    const { getByRole } = render(<Chip label="sm" size="sm" onPress={jest.fn()} />);
    const node = getByRole('button');
    const h = StyleSheet.flatten(node.props.style).height as number;
    expect(h + node.props.hitSlop.top + node.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
  });
});
