import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { ListRow } from '../../components/ui';
import { colors } from '../../theme';

describe('ListRow', () => {
  it('pressable row is a button with a chevron', () => {
    const onPress = jest.fn();
    const { getByRole, getByTestId } = render(
      <ListRow icon="trophy" title="Games & challenges" subtitle="Battles" onPress={onPress} />
    );
    const row = getByRole('button', { name: 'Games & challenges, Battles' });
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
    expect(getByTestId('icon-chevron-right', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('icon-trophy', { includeHiddenElements: true })).toBeTruthy();
  });

  it('static row has no button role or chevron', () => {
    const { queryByRole, queryByTestId, getByLabelText } = render(<ListRow title="Version" value="1.0.0" />);
    expect(queryByRole('button')).toBeNull();
    expect(queryByTestId('icon-chevron-right', { includeHiddenElements: true })).toBeNull();
    expect(getByLabelText('Version, 1.0.0')).toBeTruthy();
  });

  it('renders value, trailing and leading content', () => {
    const { getByText } = render(
      <ListRow title="Crews" value="3" leading={<Text>L</Text>} trailing={<Text>T</Text>} onPress={jest.fn()} chevron={false} />
    );
    expect(getByText('3')).toBeTruthy();
    expect(getByText('L')).toBeTruthy();
    expect(getByText('T')).toBeTruthy();
  });

  it('destructive title is red', () => {
    const { getByText } = render(<ListRow title="Delete my account" destructive onPress={jest.fn()} />);
    expect(StyleSheet.flatten(getByText('Delete my account').props.style).color).toBe(colors.error);
  });

  it('disabled row ignores presses', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<ListRow title="Off" disabled onPress={onPress} />);
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses a custom accessibility label', () => {
    const { getByRole } = render(<ListRow title="Help" accessibilityLabel="Open help" onPress={jest.fn()} />);
    expect(getByRole('button', { name: 'Open help' })).toBeTruthy();
  });
});
