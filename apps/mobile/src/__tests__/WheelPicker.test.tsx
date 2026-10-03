/**
 * WheelPicker — component tests.
 *
 * Tap path is what the tests exercise (tap-an-off-center-row); the
 * snap-scroll path is exercised by real-device QA. Both are equivalent
 * from the consumer's perspective — the wheel reports onChange either
 * way.
 */

import React from 'react';
import { ScrollView } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import { WheelPicker } from '../components/WheelPicker';

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#0f0', brandSoft: '#0f01', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

const ITEMS = [0, 1, 2, 3, 4, 5];

describe('WheelPicker', () => {
  it('renders one row per item with the formatted label', () => {
    const { getByText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `#${n}`}
      />
    );
    for (const n of ITEMS) {
      expect(getByText(`#${n}`)).toBeTruthy();
    }
  });

  it('uses "Set" as the default accessibility row prefix', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
      />
    );
    expect(getByLabelText('Set 3')).toBeTruthy();
  });

  it('honors a custom accessibility row prefix', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
        accessibilityRowLabelPrefix="Pick number"
      />
    );
    expect(getByLabelText('Pick number 3')).toBeTruthy();
  });

  it('calls onChange when a non-selected row is tapped', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={onChange}
        formatItem={(n) => `${n}`}
      />
    );
    fireEvent.press(getByLabelText('Set 4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not call onChange when the already-selected row is tapped', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={onChange}
        formatItem={(n) => `${n}`}
      />
    );
    fireEvent.press(getByLabelText('Set 2'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the parent label as accessibilityLabel on the column', () => {
    const { getByLabelText } = render(
      <WheelPicker
        items={ITEMS}
        selected={2}
        onChange={() => {}}
        formatItem={(n) => `${n}`}
        accessibilityLabel="My wheel"
      />
    );
    expect(getByLabelText('My wheel')).toBeTruthy();
  });
});

// ─── One selection/scroll authority (review R5) ────────────────────────────
//
// Natively (iOS, Expo Go) a tap used to start an animated scroll, the
// parent's re-render then jumped to the same row, the animation carried on one
// row further and its momentum end was read as a user selection: 45 → tap 30
// → 15, 15 → tap 30 → 45 (traces in docs/run-golf-v2/r1-r7-evidence/r5-native).
// Native verification is recorded there; these tests pin the callback rules.

const ROW = 44;
const MINUTES = [0, 15, 30, 45];

function scrollEvent(y: number) {
  return { nativeEvent: { contentOffset: { x: 0, y } } };
}

function Controlled({ initial, onChange }: { initial: number; onChange: jest.Mock }) {
  const [value, setValue] = React.useState(initial);
  return (
    <WheelPicker
      items={MINUTES}
      selected={value}
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
      formatItem={(n) => `${n}`}
      accessibilityRowLabelPrefix="Set minute"
    />
  );
}

describe('WheelPicker selection authority (review R5)', () => {
  function setup(initial = 45) {
    const onChange = jest.fn();
    const utils = render(<Controlled initial={initial} onChange={onChange} />);
    const scrollView = utils.UNSAFE_getByType(ScrollView);
    const scrollTo = scrollView.instance.scrollTo as jest.Mock;
    scrollTo.mockClear();
    return { ...utils, onChange, scrollView, scrollTo };
  }

  it('a tap scrolls once, and the parent update does not scroll again', () => {
    const { getByLabelText, onChange, scrollTo } = setup(45);
    fireEvent.press(getByLabelText('Set minute 30'));
    expect(onChange).toHaveBeenCalledWith(30);
    expect(scrollTo.mock.calls).toEqual([[{ y: 2 * ROW, animated: true }]]);
  });

  it('the end of the tap animation is not a second selection', () => {
    const { getByLabelText, onChange, scrollView } = setup(45);
    fireEvent.press(getByLabelText('Set minute 30'));
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(2 * ROW));
    expect(onChange.mock.calls).toEqual([[30]]);
  });

  it('a momentum end for another row while the tap animation runs is ignored', () => {
    const { getByLabelText, onChange, scrollView } = setup(15);
    fireEvent.press(getByLabelText('Set minute 30'));
    // What the unfixed wheel committed: one row past the tapped one.
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(3 * ROW));
    expect(onChange.mock.calls).toEqual([[30]]);
  });

  it('rapid taps retarget; the replaced animation’s end is ignored', () => {
    const { getByLabelText, onChange, scrollView, scrollTo } = setup(0);
    fireEvent.press(getByLabelText('Set minute 15'));
    fireEvent.press(getByLabelText('Set minute 45'));
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(1 * ROW));
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(3 * ROW));
    expect(onChange.mock.calls).toEqual([[15], [45]]);
    expect(scrollTo.mock.calls).toEqual([
      [{ y: 1 * ROW, animated: true }],
      [{ y: 3 * ROW, animated: true }],
    ]);
  });

  it('a user drag selects the row it settles on', () => {
    const { getByLabelText, onChange, scrollView } = setup(45);
    fireEvent.press(getByLabelText('Set minute 30'));
    fireEvent(scrollView, 'scrollBeginDrag', scrollEvent(2 * ROW));
    fireEvent(scrollView, 'scrollEndDrag', scrollEvent(70));
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(0));
    expect(onChange.mock.calls).toEqual([[30], [0]]);
  });

  it('a drag released exactly on a row selects it without a momentum phase', () => {
    const { onChange, scrollView } = setup(45);
    fireEvent(scrollView, 'scrollBeginDrag', scrollEvent(3 * ROW));
    fireEvent(scrollView, 'scrollEndDrag', scrollEvent(1 * ROW));
    expect(onChange.mock.calls).toEqual([[15]]);
  });

  it('a value set by the parent moves the wheel without reporting a change', () => {
    const onChange = jest.fn();
    const utils = render(
      <WheelPicker items={MINUTES} selected={0} onChange={onChange} formatItem={(n) => `${n}`} />
    );
    const scrollView = utils.UNSAFE_getByType(ScrollView);
    const scrollTo = scrollView.instance.scrollTo as jest.Mock;
    scrollTo.mockClear();
    utils.rerender(<WheelPicker items={MINUTES} selected={30} onChange={onChange} formatItem={(n) => `${n}`} />);
    expect(scrollTo.mock.calls).toEqual([[{ y: 2 * ROW, animated: false }]]);
    // iOS reports the end of that programmatic jump as a momentum end.
    fireEvent(scrollView, 'momentumScrollEnd', scrollEvent(2 * ROW));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the initial contentOffset instead of re-applying it on every selection', () => {
    const { getByLabelText, UNSAFE_getByType } = setup(45);
    expect(UNSAFE_getByType(ScrollView).props.contentOffset).toEqual({ x: 0, y: 3 * ROW });
    fireEvent.press(getByLabelText('Set minute 15'));
    expect(UNSAFE_getByType(ScrollView).props.contentOffset).toEqual({ x: 0, y: 3 * ROW });
  });

  it('caps row text scaling so digits fit the fixed rows', () => {
    const { getByText } = setup(45);
    expect(getByText('30').props.maxFontSizeMultiplier).toBe(1.6);
  });
});
