import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { Select } from '../src/primitives/Select.js';
import { renderWithTheme } from './test-utils.js';

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
    { value: 'c', label: 'Charlie', disabled: true },
  ];

  function getTrigger(): HTMLElement {
    const el = document.querySelector('[role="combobox"]') as HTMLElement;
    if (!el) throw new Error('combobox trigger not found');
    return el;
  }

  function getMenuItem(label: string): HTMLElement {
    const items = document.querySelectorAll('[role="menuitem"]');
    for (const item of Array.from(items)) {
      if (item.textContent === label) return item as HTMLElement;
    }
    throw new Error(`menuitem "${label}" not found`);
  }

  it('renders the current selection label', () => {
    renderWithTheme(
      <Select options={options} value="b" onChange={() => {}} testID="sel" />,
    );
    expect(getTrigger().textContent).toContain('Bravo');
  });

  it('opens the popover on trigger click and shows all options', () => {
    renderWithTheme(
      <Select options={options} value="a" onChange={() => {}} testID="sel" />,
    );
    // Before opening: no menuitems exist.
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    fireEvent.click(getTrigger());
    // After opening: 3 menuitems (one per option).
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
  });

  it('calls onChange when an option is clicked', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Select options={options} value="a" onChange={onChange} testID="sel" />,
    );
    fireEvent.click(getTrigger());
    fireEvent.click(getMenuItem('Bravo'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not pick a disabled option', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Select options={options} value="a" onChange={onChange} testID="sel" />,
    );
    fireEvent.click(getTrigger());
    fireEvent.click(getMenuItem('Charlie'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not open when disabled', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Select options={options} value="a" onChange={onChange} disabled testID="sel" />,
    );
    fireEvent.click(getTrigger());
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the placeholder when value is empty', () => {
    renderWithTheme(
      <Select options={options} value="" onChange={() => {}} placeholder="Pick one" testID="sel" />,
    );
    expect(getTrigger().textContent).toContain('Pick one');
  });
});
