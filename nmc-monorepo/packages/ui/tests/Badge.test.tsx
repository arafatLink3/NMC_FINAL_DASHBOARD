import { describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { Badge } from '../src/primitives/Badge.js';
import { useToast, ToastHost, toastBus } from '../src/primitives/Toast.js';
import { renderWithTheme } from './test-utils.js';

const KINDS = ['primary', 'success', 'warn', 'danger', 'info', 'muted'] as const;
const VARIANTS = ['status', 'tag'] as const;

describe('Badge', () => {
  for (const variant of VARIANTS) {
    for (const kind of KINDS) {
      it(`renders ${variant} × ${kind} without crashing`, () => {
        const { getByText } = renderWithTheme(
          <Badge kind={kind} variant={variant} testID={`b-${variant}-${kind}`}>
            {kind}
          </Badge>,
        );
        expect(getByText(kind)).toBeTruthy();
      });
    }
  }

  it('uses the children prop for the label', () => {
    const { getByText } = renderWithTheme(
      <Badge kind="success" variant="status">
        Saved
      </Badge>,
    );
    expect(getByText('Saved')).toBeTruthy();
  });
});

/**
 * Test harness: exposes `useToast()` on a ref so tests can call it
 * after the component has mounted (hooks must be called inside a render).
 * The callback fires from a `useEffect` so the assignment is guaranteed
 * to run after `<ToastHost>` has subscribed in its own `useEffect`.
 */
function ToastHarness({
  cb,
}: {
  cb: (t: ReturnType<typeof useToast>) => void;
}) {
  const t = useToast();
  useEffect(() => {
    cb(t);
  }, [cb, t]);
  return null;
}

describe('Toast bus + ToastHost', () => {
  it('subscribes and dispatches a toast from the bus', async () => {
    let t: ReturnType<typeof useToast> | undefined;
    const { getByText, unmount } = render(
      <>
        <ToastHarness cb={(x) => (t = x)} />
        <ToastHost testID="host" />
      </>,
    );
    // Wait until the harness's useEffect has captured the callable AND
    // the ToastHost's subscription effect has fired.
    await waitFor(() => expect(t).toBeDefined());
    act(() => {
      t!.success('Saved', 'Your changes were committed');
    });
    expect(getByText('Saved')).toBeTruthy();
    expect(getByText('Your changes were committed')).toBeTruthy();
    unmount();
  });

  it('toastBus.push returns monotonically increasing ids', () => {
    const a = toastBus.push({ title: 'A' });
    const b = toastBus.push({ title: 'B' });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('uses the kind-specific border colour via the danger shortcut', async () => {
    let t: ReturnType<typeof useToast> | undefined;
    const { getByText, unmount } = render(
      <>
        <ToastHarness cb={(x) => (t = x)} />
        <ToastHost />
      </>,
    );
    await waitFor(() => expect(t).toBeDefined());
    act(() => {
      t!.danger('Boom');
    });
    expect(getByText('Boom')).toBeTruthy();
    unmount();
  });

  it('does not throw when no listener is registered', () => {
    expect(() => toastBus.push({ title: 'orphan' })).not.toThrow();
  });

  it('fires onPress when a toast is clicked', async () => {
    const onPress = vi.fn();
    let t: ReturnType<typeof useToast> | undefined;
    const { getByText, unmount } = render(
      <>
        <ToastHarness cb={(x) => (t = x)} />
        <ToastHost />
      </>,
    );
    await waitFor(() => expect(t).toBeDefined());
    act(() => {
      // `.info(title, message?)` shortcuts don't accept options — use the
      // callable form to pass `onPress` (and any other ToastOptions).
      t!({ kind: 'info', title: 'Click me', message: 'body', onPress });
    });
    const card = getByText('Click me');
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
    unmount();
  });
});
