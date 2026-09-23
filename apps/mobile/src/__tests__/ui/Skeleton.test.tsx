import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { Skeleton, SkeletonText } from '../../components/ui';

describe('Skeleton', () => {
  it('is hidden from screen readers', () => {
    const { queryByTestId, getByTestId } = render(<Skeleton testID="s" />);
    expect(queryByTestId('s')).toBeNull();
    expect(getByTestId('s', { includeHiddenElements: true }).props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('sizes blocks and circles', () => {
    const { getByTestId, rerender } = render(<Skeleton testID="s" width={120} height={20} radius={4} />);
    let style = StyleSheet.flatten(getByTestId('s', { includeHiddenElements: true }).props.style);
    expect(style).toMatchObject({ width: 120, height: 20, borderRadius: 4 });
    rerender(<Skeleton testID="s" circle height={48} />);
    style = StyleSheet.flatten(getByTestId('s', { includeHiddenElements: true }).props.style);
    expect(style).toMatchObject({ width: 48, height: 48, borderRadius: 24 });
  });

  it('SkeletonText renders N lines with a shorter last line', () => {
    const { getByTestId } = render(<SkeletonText testID="t" lines={3} lastLineWidth="40%" />);
    const lines = getByTestId('t').children as unknown as { props: { width: unknown } }[];
    expect(lines).toHaveLength(3);
    expect(lines[2].props.width).toBe('40%');
    expect(lines[0].props.width).toBe('100%');
  });
});
