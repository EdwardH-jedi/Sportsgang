import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { EmptyState } from '../../components/ui';

describe('EmptyState', () => {
  it('renders title as header, message and icon', () => {
    const { getByRole, getByText, getByTestId } = render(
      <EmptyState icon="crew" title="Crews are coming" message="Soon." />
    );
    expect(getByRole('header', { name: 'Crews are coming' })).toBeTruthy();
    expect(getByText('Soon.')).toBeTruthy();
    expect(getByTestId('icon-crew', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders primary and secondary actions', () => {
    const primary = jest.fn();
    const secondary = jest.fn();
    const { getByRole } = render(
      <EmptyState
        title="No runs"
        action={{ label: 'Host a run', onPress: primary }}
        secondaryAction={{ label: 'Change filters', onPress: secondary }}
      />
    );
    fireEvent.press(getByRole('button', { name: 'Host a run' }));
    fireEvent.press(getByRole('button', { name: 'Change filters' }));
    expect(primary).toHaveBeenCalled();
    expect(secondary).toHaveBeenCalled();
  });

  it('renders without actions', () => {
    const { queryByRole } = render(<EmptyState title="Nothing" compact />);
    expect(queryByRole('button')).toBeNull();
  });
});

describe('EmptyState accessibility label', () => {
  it('reads as one element with the given label when it has no actions', () => {
    const { getByLabelText } = render(<EmptyState title="Host only" accessibilityLabel="Attendance check is host only" />);
    expect(getByLabelText('Attendance check is host only').props.accessible).toBe(true);
  });

  it('keeps action buttons reachable when labelled', () => {
    const { getByLabelText, getByRole } = render(
      <EmptyState title="Oops" accessibilityLabel="Load failed" action={{ label: 'Retry', onPress: jest.fn() }} />
    );
    expect(getByLabelText('Load failed').props.accessible).toBe(false);
    expect(getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
