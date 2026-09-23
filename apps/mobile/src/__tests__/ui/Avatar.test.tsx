import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { Avatar, AvatarGroup, avatarColorFor, initialsFor } from '../../components/ui';
import { avatarColors, colors } from '../../theme';

describe('Avatar', () => {
  it('computes initials', () => {
    expect(initialsFor('Jordan Lee')).toBe('JL');
    expect(initialsFor('  cher  ')).toBe('C');
    expect(initialsFor('Mary Anne Smith')).toBe('MS');
    expect(initialsFor('')).toBe('?');
  });

  it('shows initials without an image and is an image for screen readers', () => {
    const { getByText, getByLabelText } = render(<Avatar name="Jordan Lee" />);
    expect(getByText('JL')).toBeTruthy();
    expect(getByLabelText('Jordan Lee').props.accessibilityRole).toBe('image');
  });

  it('renders the image and falls back to initials on error', () => {
    const { UNSAFE_getByType, getByText, queryByText } = render(
      <Avatar name="Sam Park" uri="https://example.com/a.png" />
    );
    expect(queryByText('SP')).toBeNull();
    fireEvent(UNSAFE_getByType(Image), 'error');
    expect(getByText('SP')).toBeTruthy();
  });

  it('supports size tokens, numbers and a lime ring', () => {
    const { getByLabelText, rerender } = render(<Avatar name="A B" size="xl" ring testID="a" />);
    const ringView = getByLabelText('A B').children[0] as unknown as { props: { style: unknown } };
    const style = StyleSheet.flatten(ringView.props.style as never) as Record<string, unknown>;
    expect(style.width).toBe(88);
    expect(style.borderColor).toBe(colors.brand);
    rerender(<Avatar name="A B" size={50} />);
    const s2 = StyleSheet.flatten(
      (getByLabelText('A B').children[0] as unknown as { props: { style: never } }).props.style
    ) as Record<string, unknown>;
    expect(s2.width).toBe(50);
  });

  it('is a button when pressable', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Avatar name="Jordan Lee" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Jordan Lee' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('AvatarGroup', () => {
  const people = ['Ana Ruiz', 'Ben Ho', 'Cleo Diaz', 'Dev Rao', 'Eli Ng'].map((name) => ({ name }));

  it('shows up to `max` avatars plus a counter and announces the total', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <AvatarGroup people={people} max={3} total={18} />
    );
    expect(getByLabelText('18 members')).toBeTruthy();
    expect(getByText('+15')).toBeTruthy();
    expect(queryByText('DR')).toBeNull();
  });

  it('omits the counter when everyone fits', () => {
    const { queryByText, getByLabelText } = render(<AvatarGroup people={people.slice(0, 1)} />);
    expect(queryByText(/^\+/)).toBeNull();
    expect(getByLabelText('1 member')).toBeTruthy();
  });
});

describe('Avatar initials palette', () => {
  it('picks a stable fill from the avatarColors tokens', () => {
    expect(avatarColors).toContain(avatarColorFor('Mia Chen'));
    expect(avatarColorFor('Mia Chen')).toBe(avatarColorFor('  mia chen '));
    const fills = new Set(['Mia Chen', 'Tom Walker', 'Priya Nair', 'Jack O’Brien', 'Sofia Rossi', 'Liam Park'].map(avatarColorFor));
    expect(fills.size).toBeGreaterThan(1);
  });

  it('uses the name fill behind the initials', () => {
    const { getByText } = render(<Avatar name="Tom Walker" />);
    const fallback = getByText('TW').parent?.parent;
    expect(StyleSheet.flatten(fallback?.props.style).backgroundColor).toBe(avatarColorFor('Tom Walker'));
  });
});

describe('AvatarGroup stacking', () => {
  const people = ['A B', 'C D', 'E F', 'G H', 'I J', 'K L'].map((name) => ({ name }));

  it('draws the "+N" counter above every avatar with a ring in the surface colour', () => {
    const { getByTestId, getByText } = render(
      <AvatarGroup people={people} max={3} total={21} ringColor={colors.surface} testID="grp" />
    );
    expect(getByText('+18')).toBeTruthy();
    const more = StyleSheet.flatten(getByTestId('grp-more').props.style);
    expect(more.zIndex).toBeGreaterThan(3);
    expect(more.borderColor).toBe(colors.surface);
  });
});
