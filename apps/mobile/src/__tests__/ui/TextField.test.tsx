import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { TextField } from '../../components/ui';
import { colors } from '../../theme';

describe('TextField', () => {
  it('renders the label and uses it as the accessible name', () => {
    const { getByText, getByLabelText } = render(<TextField label="Crew name" />);
    expect(getByText('Crew name')).toBeTruthy();
    expect(getByLabelText('Crew name')).toBeTruthy();
  });

  it('forwards value / onChangeText', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(<TextField label="Name" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(getByLabelText('Name'), 'Bondi');
    expect(onChangeText).toHaveBeenCalledWith('Bondi');
  });

  it('shows helper text', () => {
    const { getByText, getByLabelText } = render(<TextField label="Name" helper="Shown on runs" />);
    expect(getByText('Shown on runs')).toBeTruthy();
    expect(getByLabelText('Name').props.accessibilityHint).toBe('Shown on runs');
  });

  it('shows the error instead of helper, as an alert, with a red border', () => {
    const { getByText, queryByText, getByRole, getByLabelText } = render(
      <TextField label="Distance" helper="In km" error="Too far" testID="dist" />
    );
    expect(getByText('Too far')).toBeTruthy();
    expect(queryByText('In km')).toBeNull();
    expect(getByRole('alert')).toBeTruthy();
    expect(getByLabelText('Distance').props.accessibilityHint).toBe('Too far');
    const field = getByLabelText('Distance').parent?.parent;
    expect(StyleSheet.flatten(field?.props.style).borderColor).toBe(colors.error);
  });

  it('highlights the border on focus', () => {
    const { getByLabelText } = render(<TextField label="Name" />);
    const input = getByLabelText('Name');
    fireEvent(input, 'focus');
    const field = getByLabelText('Name').parent?.parent;
    expect(StyleSheet.flatten(field?.props.style).borderColor).toBe(colors.brand);
  });

  it('secure: hides text and toggles with an accessible button', () => {
    const { getByLabelText, getByRole } = render(<TextField label="Password" secure />);
    expect(getByLabelText('Password').props.secureTextEntry).toBe(true);
    fireEvent.press(getByRole('button', { name: 'Show password' }));
    expect(getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });

  it('multiline passes through', () => {
    const { getByLabelText } = render(<TextField label="Notes" multiline />);
    expect(getByLabelText('Notes').props.multiline).toBe(true);
  });

  it('disabled is not editable', () => {
    const { getByLabelText } = render(<TextField label="Locked" disabled />);
    expect(getByLabelText('Locked').props.editable).toBe(false);
  });

  it('forwards the ref to the TextInput', () => {
    const ref = React.createRef<TextInput>();
    render(<TextField label="Ref" ref={ref} />);
    expect(ref.current).toBeTruthy();
  });
});
