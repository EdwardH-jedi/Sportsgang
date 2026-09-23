import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { SegmentedControl } from '../../components/ui';

const segments = [
  { value: 'group', label: 'Group runs', icon: 'crew' },
  { value: 'runners', label: 'Runners', icon: 'run' },
] as const;

beforeEach(() => jest.clearAllMocks());

describe('SegmentedControl', () => {
  it('renders a labelled tablist with one tab per segment', () => {
    const { getByLabelText, getAllByRole } = render(
      <SegmentedControl segments={segments} value="group" onChange={jest.fn()} accessibilityLabel="Run view" />
    );
    // The container is not itself focusable (that would swallow the tabs).
    expect(getByLabelText('Run view').props.accessibilityRole).toBe('tablist');
    expect(getAllByRole('tab')).toHaveLength(2);
  });

  it('marks the current segment selected', () => {
    const { getByRole } = render(<SegmentedControl segments={segments} value="runners" onChange={jest.fn()} />);
    expect(getByRole('tab', { name: 'Runners' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(getByRole('tab', { name: 'Group runs' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('calls onChange with the value and a selection haptic', () => {
    const onChange = jest.fn();
    const { getByRole } = render(<SegmentedControl segments={segments} value="group" onChange={onChange} />);
    fireEvent.press(getByRole('tab', { name: 'Runners' }));
    expect(onChange).toHaveBeenCalledWith('runners');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('ignores presses on the already-selected segment', () => {
    const onChange = jest.fn();
    const { getByRole } = render(<SegmentedControl segments={segments} value="group" onChange={onChange} />);
    fireEvent.press(getByRole('tab', { name: 'Group runs' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the sliding thumb after layout', () => {
    const { getByLabelText, toJSON } = render(
      <SegmentedControl segments={segments} value="group" onChange={jest.fn()} accessibilityLabel="View" />
    );
    fireEvent(getByLabelText('View'), 'layout', { nativeEvent: { layout: { width: 306, height: 44 } } });
    expect(JSON.stringify(toJSON())).toContain('"width":150');
  });
});
