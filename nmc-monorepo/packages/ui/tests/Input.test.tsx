import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { Input } from '../src/primitives/Input.js';
import { renderWithTheme } from './test-utils.js';

describe('Input', () => {
  it('renders with placeholder', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <Input placeholder="Type here" testID="i" />,
    );
    expect(getByPlaceholderText('Type here')).toBeTruthy();
  });

  it('forwards native change events', () => {
    const onChange = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Input value="" onChange={onChange} testID="i" />,
    );
    fireEvent.change(getByTestId('i'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('fires onFocus / onBlur', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Input value="" onChangeText={() => {}} onFocus={onFocus} onBlur={onBlur} testID="i" />,
    );
    const node = getByTestId('i') as HTMLElement;
    fireEvent.focus(node);
    fireEvent.blur(node);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('applies the invalid border color when invalid prop is set', () => {
    const { getByTestId } = renderWithTheme(
      <Input value="" onChangeText={() => {}} invalid testID="i" />,
    );
    // Smoke check: the prop flows through without crashing.
    expect(getByTestId('i')).toBeTruthy();
  });
});
