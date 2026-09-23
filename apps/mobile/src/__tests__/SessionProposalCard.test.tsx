import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SessionProposalCard } from '../components/SessionProposalCard';

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    matchId: 'match-1',
    proposerId: 'partner-1',
    partnerId: 'me',
    sport: 'running',
    startsAt: '2026-04-09T09:00:00Z',
    endsAt: '2026-04-09T10:00:00Z',
    location: 'Centennial Park',
    notes: 'Easy 5k',
    status: 'proposed',
    partner: { displayName: 'Sarah' },
    venue: null,
    ...overrides,
  };
}

function renderCard(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const handlers = { onAccept: jest.fn(), onDecline: jest.fn(), onView: jest.fn() };
  const utils = render(
    <SessionProposalCard
      proposal={makeProposal(overrides)}
      currentUserId="me"
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
}

describe('SessionProposalCard', () => {
  it('shows Accept / Decline for the receiver with the proposer name', () => {
    const { getByText, getByLabelText } = renderCard();
    getByText('Session proposal');
    getByText('Sarah proposed a session');
    getByText('Running');
    getByText('Centennial Park');
    getByText('Easy 5k');
    expect(getByLabelText('Accept session proposal')).toBeTruthy();
    expect(getByLabelText('Decline session proposal')).toBeTruthy();
  });

  it('Accept / Decline call their handlers without opening the detail', () => {
    const { getByLabelText, onAccept, onDecline, onView } = renderCard();
    fireEvent.press(getByLabelText('Accept session proposal'), { stopPropagation: jest.fn() });
    fireEvent.press(getByLabelText('Decline session proposal'), { stopPropagation: jest.fn() });
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it('pressing the card opens the detail', () => {
    const { getByLabelText, onView } = renderCard();
    fireEvent.press(getByLabelText('Open session proposal'));
    expect(onView).toHaveBeenCalled();
  });

  it('while acting, Accept is busy and Decline is disabled', () => {
    const { getByLabelText, onDecline } = renderCard({}, { isActing: true });
    expect(getByLabelText('Accept session proposal').props.accessibilityState).toMatchObject({
      busy: true,
    });
    const decline = getByLabelText('Decline session proposal');
    expect(decline.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(decline);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('shows an awaiting badge and no actions for the proposer', () => {
    const { getByText, queryByLabelText } = renderCard({ proposerId: 'me', partnerId: 'partner-1' });
    getByText('Session proposal sent');
    getByText('AWAITING CONFIRMATION');
    expect(queryByLabelText('Accept session proposal')).toBeNull();
  });

  it.each([
    ['confirmed', 'Session confirmed', 'CONFIRMED'],
    ['declined', 'Session declined', 'DECLINED'],
  ])('renders the %s state with a status badge', (status, title, badge) => {
    const { getByText, queryByLabelText } = renderCard({ status });
    getByText(title);
    getByText(badge);
    expect(queryByLabelText('Accept session proposal')).toBeNull();
  });

  it('prefers the venue name + address over the free-text location', () => {
    const { getByText, queryByText } = renderCard({
      venue: { name: 'Bondi Track', address: '1 Beach Rd' },
    });
    getByText('Bondi Track · 1 Beach Rd');
    expect(queryByText('Centennial Park')).toBeNull();
  });
});
