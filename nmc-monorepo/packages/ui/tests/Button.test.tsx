import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { Button } from '../src/primitives/Button.js';
import { renderWithTheme } from './test-utils.js';

describe('Button', () => {
  it('renders the label as text when no children are passed', () => {
    const { getByText } = renderWithTheme(<Button label="Save" testID="save" />);
    expect(getByText('Save')).toBeTruthy();
  });

  it('renders children instead of label when both are present', () => {
    const { getByText, queryByText } = renderWithTheme(
      <Button label="ignored" testID="x">
        <span>child</span>
      </Button>,
    );
    expect(getByText('child')).toBeTruthy();
    expect(queryByText('ignored')).toBeNull();
  });

  it('fires onPress when not disabled', () => {
    const onPress = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Button label="Tap" testID="tap" onPress={onPress} />,
    );
    fireEvent.click(getByTestId('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onPress when disabled', () => {
    const onPress = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Button label="Tap" testID="tap" disabled onPress={onPress} />,
    );
    fireEvent.click(getByTestId('tap'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does NOT fire onPress when loading', () => {
    const onPress = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Button label="Tap" testID="tap" loading onPress={onPress} />,
    );
    fireEvent.click(getByTestId('tap'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('forwards leftIcon and rightIcon as visible text nodes', () => {
    const { getByText } = renderWithTheme(
      <Button label="Save" testID="save" leftIcon="💾" rightIcon="→" />,
    );
    expect(getByText('💾')).toBeTruthy();
    expect(getByText('→')).toBeTruthy();
  });
});
