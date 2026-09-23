import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { AgeRangeSelector } from '../components/AgeRangeSelector';

describe('AgeRangeSelector', () => {
  it('summarises the current range', () => {
    const { getByLabelText } = render(
      <AgeRangeSelector minAge={25} maxAge={40} onChange={jest.fn()} />
    );
    getByLabelText('Age range 25 to 40');
    getByLabelText('Partner age range selector');
  });

  it('steps each bound with the labelled buttons', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <AgeRangeSelector minAge={25} maxAge={40} onChange={onChange} />
    );
    fireEvent.press(getByLabelText('Increase minimum age'));
    expect(onChange).toHaveBeenLastCalledWith(26, 40);
    fireEvent.press(getByLabelText('Decrease maximum age'));
    expect(onChange).toHaveBeenLastCalledWith(25, 39);
  });

  it('disables steppers at the limits and when the bounds meet', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <AgeRangeSelector minAge={18} maxAge={18} onChange={onChange} />
    );
    expect(getByLabelText('Decrease minimum age').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(getByLabelText('Increase minimum age').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(getByLabelText('Decrease minimum age'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
