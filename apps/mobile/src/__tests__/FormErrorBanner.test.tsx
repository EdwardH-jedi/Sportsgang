import React from 'react';
import { render } from '@testing-library/react-native';

import { FormErrorBanner } from '../components/FormErrorBanner';

describe('FormErrorBanner', () => {
  it('renders nothing without a message', () => {
    const { toJSON } = render(<FormErrorBanner message={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the message as an announced alert', () => {
    const { getByText, getByRole } = render(
      <FormErrorBanner message="Something went wrong" testID="err" />
    );
    getByText('Something went wrong');
    const alert = getByRole('alert');
    expect(alert.props.accessibilityLabel).toBe('Something went wrong');
  });
});
