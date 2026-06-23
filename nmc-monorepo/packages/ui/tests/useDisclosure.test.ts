import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDisclosure } from '../src/hooks/useDisclosure.js';

describe('useDisclosure', () => {
  it('starts closed by default', () => {
    const { result } = renderHook(() => useDisclosure());
    expect(result.current.open).toBe(false);
  });

  it('honours the initial value', () => {
    const { result } = renderHook(() => useDisclosure(true));
    expect(result.current.open).toBe(true);
  });

  it('opens via onOpen and stays open', () => {
    const { result } = renderHook(() => useDisclosure());
    act(() => result.current.onOpen());
    expect(result.current.open).toBe(true);
  });

  it('closes via onClose', () => {
    const { result } = renderHook(() => useDisclosure(true));
    act(() => result.current.onClose());
    expect(result.current.open).toBe(false);
  });

  it('toggles state via onToggle', () => {
    const { result } = renderHook(() => useDisclosure(false));
    act(() => result.current.onToggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.onToggle());
    expect(result.current.open).toBe(false);
  });
});
