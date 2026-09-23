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
