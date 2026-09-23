import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { PanGesture } from 'react-native-gesture-handler';

import { BottomSheet } from '../../components/ui';

describe('BottomSheet (non-modal)', () => {
  it('renders content, title and an adjustable handle', () => {
    const { getByText, getByRole } = render(
      <BottomSheet snapPoints={[100, 300]} title="12 runs">
        <Text>List</Text>
      </BottomSheet>
    );
    expect(getByText('List')).toBeTruthy();
    expect(getByRole('header', { name: '12 runs' })).toBeTruthy();
    const handle = getByRole('adjustable', { name: '12 runs handle' });
    expect(handle.props.accessibilityValue).toEqual({ text: 'Collapsed' });
  });

  it('is not modal and has no backdrop by default', () => {
    const { getByTestId, queryByTestId } = render(
      <BottomSheet snapPoints={[100]}>
        <Text>x</Text>
      </BottomSheet>
    );
    expect(getByTestId('bottom-sheet').props.accessibilityViewIsModal).toBe(false);
    expect(queryByTestId('bottom-sheet-backdrop')).toBeNull();
  });

  it('accessibility increment / decrement move between snap points', () => {
    const onIndexChange = jest.fn();
    const { getByRole } = render(
      <BottomSheet snapPoints={[100, 200, 300]} onIndexChange={onIndexChange} title="Runs">
        <Text>x</Text>
      </BottomSheet>
    );
    const handle = getByRole('adjustable');
    fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(getByRole('adjustable').props.accessibilityValue).toEqual({ text: 'Size 2 of 3' });
    fireEvent(getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    expect(getByRole('adjustable').props.accessibilityValue).toEqual({ text: 'Expanded' });
    fireEvent(getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('follows a controlled index', () => {
    const { getByRole, rerender } = render(
      <BottomSheet snapPoints={[100, 300]} index={0} title="S">
        <Text>x</Text>
      </BottomSheet>
    );
    expect(getByRole('adjustable').props.accessibilityValue).toEqual({ text: 'Collapsed' });
    rerender(
      <BottomSheet snapPoints={[100, 300]} index={1} title="S">
        <Text>x</Text>
      </BottomSheet>
    );
    expect(getByRole('adjustable').props.accessibilityValue).toEqual({ text: 'Expanded' });
  });

  it('snaps to the nearest point after a drag', async () => {
    const onIndexChange = jest.fn();
    render(
      <BottomSheet snapPoints={[100, 400]} onIndexChange={onIndexChange} testID="sheet">
        <Text>x</Text>
      </BottomSheet>
    );
    // Starts collapsed (translateY 300); drag up 280pt with an upward fling.
    fireGestureHandler<PanGesture>(getByGestureTestId('sheet-pan'), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: -100, velocityY: -500 },
      { state: State.ACTIVE, translationY: -280, velocityY: -800 },
      { state: State.END, translationY: -280, velocityY: -800 },
    ]);
    await waitFor(() => expect(onIndexChange).toHaveBeenCalledWith(1));
  });
});

describe('BottomSheet (modal)', () => {
  // The backdrop fades in with the open spring. Reanimated's jest mode does
  // not write animated styles back into the rendered props, so the tree
  // keeps the initial opacity 0 and the backdrop must be queried with
  // includeHiddenElements.
  const backdrop = (utils: { getByTestId: (id: string, o: object) => any }) =>
    utils.getByTestId('bottom-sheet-backdrop', { includeHiddenElements: true });

  it('is modal with a backdrop that closes it', () => {
    const onClose = jest.fn();
    const utils = render(
      <BottomSheet modal open onClose={onClose} snapPoints={['50%']} title="Filters">
        <Text>Filter body</Text>
      </BottomSheet>
    );
    expect(utils.getByTestId('bottom-sheet').props.accessibilityViewIsModal).toBe(true);
    const bd = backdrop(utils);
    expect(bd.props.accessibilityRole).toBe('button');
    expect(bd.props.accessibilityLabel).toBe('Close Filters');
    fireEvent.press(bd);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('accessibility escape and decrement at the lowest point dismiss it', () => {
    const onClose = jest.fn();
    const { getByRole, getByTestId } = render(
      <BottomSheet modal open onClose={onClose} snapPoints={[300]} title="Filters">
        <Text>x</Text>
      </BottomSheet>
    );
    fireEvent(getByTestId('bottom-sheet'), 'accessibilityEscape');
    fireEvent(getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('dragging down past the lowest snap dismisses', async () => {
    const onClose = jest.fn();
    render(
      <BottomSheet modal open onClose={onClose} snapPoints={[300]} testID="m">
        <Text>x</Text>
      </BottomSheet>
    );
    await act(async () => {
      fireGestureHandler<PanGesture>(getByGestureTestId('m-pan'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 150, velocityY: 900 },
        { state: State.END, translationY: 260, velocityY: 1200 },
      ]);
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('renders nothing while closed and unmounts after closing', async () => {
    const { queryByText, rerender } = render(
      <BottomSheet modal open={false} onClose={jest.fn()} snapPoints={[300]}>
        <Text>Hidden body</Text>
      </BottomSheet>
    );
    expect(queryByText('Hidden body')).toBeNull();
    rerender(
      <BottomSheet modal open onClose={jest.fn()} snapPoints={[300]}>
        <Text>Hidden body</Text>
      </BottomSheet>
    );
    expect(queryByText('Hidden body')).toBeTruthy();
    rerender(
      <BottomSheet modal open={false} onClose={jest.fn()} snapPoints={[300]}>
        <Text>Hidden body</Text>
      </BottomSheet>
    );
    await waitFor(() => expect(queryByText('Hidden body')).toBeNull(), { timeout: 3000 });
  });

  it('non-dismissible modal ignores the backdrop', () => {
    const onClose = jest.fn();
    const utils = render(
      <BottomSheet modal open dismissible={false} onClose={onClose} snapPoints={[300]} title="Must choose">
        <Text>x</Text>
      </BottomSheet>
    );
    fireEvent.press(backdrop(utils));
    expect(onClose).not.toHaveBeenCalled();
  });
});
