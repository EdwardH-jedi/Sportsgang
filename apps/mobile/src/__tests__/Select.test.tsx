/**
 * Select (onboarding birth year / suburb picker) — accessibility contract.
 *
 * On the iOS simulator the options used to be exposed as ONE accessibility
 * element ("Birth year, 2008, 2007, …") because the sheet was wrapped in a
 * pressable backdrop, and the trigger did not expose the chosen value.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Select } from '../components/Select';

const YEARS = [
  { value: '2001', label: '2001' },
  { value: '2000', label: '2000' },
  { value: '1999', label: '1999' },
];

function renderSelect(value: string | null = null, onChange = jest.fn()) {
  render(
    <Select label="Birth year" modalTitle="Birth year" value={value} options={YEARS} onChange={onChange} searchable />
  );
  return onChange;
}

it('exposes the chosen value and expanded state on the trigger', () => {
  renderSelect('2000');
  const trigger = screen.getByRole('button', { name: 'Birth year' });
  expect(trigger.props.accessibilityValue).toEqual({ text: '2000' });
  expect(trigger.props.accessibilityState).toMatchObject({ expanded: false });
  fireEvent.press(trigger);
  expect(screen.getByRole('button', { name: 'Birth year' }).props.accessibilityState).toMatchObject({
    expanded: true,
  });
});

it('says when nothing is chosen yet', () => {
  renderSelect(null);
  expect(screen.getByRole('button', { name: 'Birth year' }).props.accessibilityValue).toEqual({
    text: 'Not selected',
  });
});

it('exposes each option separately with its selected state', () => {
  renderSelect('2000');
  fireEvent.press(screen.getByRole('button', { name: 'Birth year' }));
  for (const year of ['2001', '2000', '1999']) {
    const option = screen.getByLabelText(year, { exact: true });
    expect(option.props.accessibilityRole).toBe('button');
    expect(option.props.accessibilityState).toEqual({ selected: year === '2000' });
  }
  // Nothing around the options is itself a focusable element.
  const sheet = screen.getByRole('header', { name: 'Birth year' }).parent?.parent;
  expect(sheet?.props.accessible).not.toBe(true);
});

it('selects by touch and closes', () => {
  const onChange = renderSelect(null);
  fireEvent.press(screen.getByRole('button', { name: 'Birth year' }));
  fireEvent.press(screen.getByRole('button', { name: '1999' }));
  expect(onChange).toHaveBeenCalledWith('1999');
  expect(screen.queryByRole('button', { name: 'Close Birth year' })).toBeNull();
});

it('can be closed without choosing, and search shows an honest empty state', () => {
  const onChange = renderSelect(null);
  fireEvent.press(screen.getByRole('button', { name: 'Birth year' }));
  fireEvent.changeText(screen.getByLabelText('Search options'), '1888');
  expect(screen.getByText('No matches')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Close Birth year' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByText('No matches')).toBeNull();
  // Reopening starts from the full list again.
  fireEvent.press(screen.getByRole('button', { name: 'Birth year' }));
  expect(screen.getByRole('button', { name: '2001' })).toBeTruthy();
});
