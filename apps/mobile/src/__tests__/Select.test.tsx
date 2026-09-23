import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { Select } from '../components/Select';

const OPTIONS = [
  { value: 'bondi', label: 'Bondi' },
  { value: 'newtown', label: 'Newtown' },
  { value: 'glebe', label: 'Glebe' },
];

describe('Select', () => {
  it('shows the placeholder, then the selected label', () => {
    const { getByText, rerender } = render(
      <Select label="Suburb" value={null} options={OPTIONS} onChange={jest.fn()} placeholder="Pick one" />
    );
    getByText('Pick one');
    rerender(<Select label="Suburb" value="glebe" options={OPTIONS} onChange={jest.fn()} />);
    getByText('Glebe');
  });

  it('opens the sheet from the labelled trigger and selects an option', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <Select
        label="Suburb"
        value={null}
        options={OPTIONS}
        onChange={onChange}
        accessibilityLabel="Sydney suburb"
      />
    );
    fireEvent.press(getByLabelText('Sydney suburb'));
    fireEvent.press(getByLabelText('Newtown'));
    expect(onChange).toHaveBeenCalledWith('newtown');
  });

  it('marks the current value as selected in the list', () => {
    const { getByLabelText } = render(
      <Select label="Suburb" value="bondi" options={OPTIONS} onChange={jest.fn()} />
    );
    fireEvent.press(getByLabelText('Suburb'));
    expect(getByLabelText('Bondi').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByLabelText('Glebe').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('filters options when searchable', () => {
    const { getByLabelText, queryByLabelText, getByText } = render(
      <Select label="Suburb" value={null} options={OPTIONS} onChange={jest.fn()} searchable />
    );
    fireEvent.press(getByLabelText('Suburb'));
    fireEvent.changeText(getByLabelText('Search options'), 'new');
    getByLabelText('Newtown');
    expect(queryByLabelText('Bondi')).toBeNull();
    fireEvent.changeText(getByLabelText('Search options'), 'zzz');
    getByText('No matches');
  });
});
