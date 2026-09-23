import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Venue } from '@protin/shared-types';

import { VenueCard } from '../components/VenueCard';

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'v1',
    name: 'Centennial Park Track',
    sportTags: ['running', 'tennis'],
    area: 'Paddington',
    address: 'Grand Dr, Centennial Park',
    latitude: -33.9,
    longitude: 151.2,
    isBookable: false,
    distanceKm: 2.34,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('VenueCard', () => {
  it('renders name, distance, one tag per sport, area and address', () => {
    const { getByText, getByLabelText } = render(<VenueCard venue={makeVenue()} onUse={jest.fn()} />);
    getByLabelText('Venue Centennial Park Track');
    getByText('Centennial Park Track');
    getByText('2.3 km');
    getByText('RUNNING');
    getByText('TENNIS');
    getByText('Paddington');
    getByText('Grand Dr, Centennial Park');
  });

  it('formats sub-kilometre distances in metres and hides a missing distance', () => {
    const { getByText, rerender, queryByText } = render(
      <VenueCard venue={makeVenue({ distanceKm: 0.4 })} onUse={jest.fn()} />
    );
    getByText('400 m');
    rerender(<VenueCard venue={makeVenue({ distanceKm: null })} onUse={jest.fn()} />);
    expect(queryByText(/km|m$/)).toBeNull();
  });

  it('calls onUse from the labelled primary action', () => {
    const onUse = jest.fn();
    const { getByLabelText } = render(<VenueCard venue={makeVenue()} onUse={onUse} />);
    fireEvent.press(getByLabelText('Use Centennial Park Track for session'));
    expect(onUse).toHaveBeenCalled();
  });

  it('only offers Open booking for a genuinely bookable venue with a URL', () => {
    const onOpen = jest.fn();
    const { queryByLabelText, rerender, getByLabelText } = render(
      <VenueCard venue={makeVenue({ bookingUrl: 'https://x.test' })} onUse={jest.fn()} onOpenBookingUrl={onOpen} />
    );
    expect(queryByLabelText('Open booking for Centennial Park Track')).toBeNull();
    rerender(
      <VenueCard
        venue={makeVenue({ isBookable: true, bookingUrl: 'https://x.test' })}
        onUse={jest.fn()}
        onOpenBookingUrl={onOpen}
      />
    );
    fireEvent.press(getByLabelText('Open booking for Centennial Park Track'));
    expect(onOpen).toHaveBeenCalled();
  });
});
