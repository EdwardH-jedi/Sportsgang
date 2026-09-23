/**
 * HonorBadge tests
 *
 * Covers: level + score render, compact mode, fallback when summary
 * unavailable, loading state, and truthful copy guarantees.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { HonorBadge } from '../components/HonorBadge';

describe('HonorBadge', () => {
  it('renders the honor level when provided', () => {
    const { getByText } = render(<HonorBadge honorLevel="Trusted" />);
    getByText('Trusted');
  });

  it('renders level and score in full mode with the app-wide middle dot', () => {
    const { getByText, queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    getByText('Trusted');
    getByText('\u00B7 126');
    // Regression guard: the middle dot once mojibaked to "쨌" in some
    // encodings; the source now writes it as an escape.
    expect(queryByText(/쨌/)).toBeNull();
    expect(queryByText(/- 126/)).toBeNull();
  });

  it('hides the score in compact mode', () => {
    const { getByText, queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} compact />
    );
    getByText('Trusted');
    expect(queryByText('\u00B7 126')).toBeNull();
  });

  it('renders the New player fallback when summary unavailable', () => {
    const { getByText, getByLabelText } = render(<HonorBadge />);
    getByText('New player');
    getByLabelText('New player');
  });

  it('renders the loading state when isLoading is true', () => {
    const { getByText, getByLabelText } = render(
      <HonorBadge isLoading />
    );
    getByText('Honor');
    getByLabelText('Honor loading');
  });

  it('uses the provided accessibility label when supplied', () => {
    const { getByLabelText } = render(
      <HonorBadge honorLevel="Captain" accessibilityLabel="Host honor Captain" />
    );
    getByLabelText('Host honor Captain');
  });

  // ── Copy guarantees ───────────────────────────────────────────────────────

  it('copy never describes Honor as popularity or a leaderboard', () => {
    const { queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/popularity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
  });

  it('copy never claims AI moderation or verified identity', () => {
    const { queryByText } = render(
      <HonorBadge honorLevel="Trusted" honorScore={126} />
    );
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
  });
});
