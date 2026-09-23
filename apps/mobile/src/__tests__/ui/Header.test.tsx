import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { Header } from '../../components/ui';

describe('Header', () => {
  it('renders the title as a header', () => {
    const { getByRole } = render(<Header title="Crew details" />);
    expect(getByRole('header', { name: 'Crew details' })).toBeTruthy();
  });

  it('shows a back button only with onBack', () => {
    const onBack = jest.fn();
    const { getByRole, queryByRole, rerender } = render(<Header title="T" />);
    expect(queryByRole('button', { name: 'Go back' })).toBeNull();
    rerender(<Header title="T" onBack={onBack} />);
    fireEvent.press(getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('supports a custom back label', () => {
    const { getByRole } = render(<Header title="T" onBack={jest.fn()} backLabel="Back to runs" />);
    expect(getByRole('button', { name: 'Back to runs' })).toBeTruthy();
  });

  it('renders right actions as labelled buttons', () => {
    const onFilter = jest.fn();
    const { getByRole } = render(
      <Header
        title="Runs"
        actions={[
          { icon: 'filter', onPress: onFilter, accessibilityLabel: 'Filters' },
          { icon: 'bell', onPress: jest.fn(), accessibilityLabel: 'Notifications' },
        ]}
      />
    );
    fireEvent.press(getByRole('button', { name: 'Filters' }));
    expect(onFilter).toHaveBeenCalled();
    expect(getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('large mode shows eyebrow, title and subtitle', () => {
    const { getByText, getByRole } = render(
      <Header large eyebrow="Bondi" title="Runs near you" subtitle="Location on" right={<Text>R</Text>} />
    );
    expect(getByText('Bondi')).toBeTruthy();
    expect(getByRole('header', { name: 'Runs near you' })).toBeTruthy();
    expect(getByText('Location on')).toBeTruthy();
    expect(getByText('R')).toBeTruthy();
  });
});

describe('Header slots', () => {
  it('renders a leading slot next to the back button', () => {
    const { getByText, getByRole } = render(
      <Header title="Edit profile" leading={<Text>Cancel</Text>} />
    );
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByRole('header', { name: 'Edit profile' })).toBeTruthy();
  });

  it('renders an identity bar when there is a leading block but no title', () => {
    const { getByText, getByRole } = render(
      <Header onBack={jest.fn()} backLabel="Back" leading={<Text>Mia Chen</Text>} />
    );
    expect(getByText('Mia Chen')).toBeTruthy();
    expect(getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('large headers keep the action row height even without actions', () => {
    const { getByTestId } = render(<Header large title="Chats" testID="hdr" />);
    // Bar row + title: the bar is always present so titles align across tabs.
    expect(getByTestId('hdr').children).toHaveLength(2);
  });
});
