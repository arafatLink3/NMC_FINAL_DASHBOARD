/**
 * useDisclosure — small state hook for open/close UI (Modal, Drawer, Popover).
 *
 * Returns a stable `boolean` plus imperative `onOpen` / `onClose` / `onToggle`
 * helpers. The state is local to the component, so no context wrapper is
 * needed; for global open-state (e.g. "the new-ticket drawer"), lift it up
 * or use a dedicated store.
 */
import { useCallback, useState } from 'react';

export interface UseDisclosureResult {
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onToggle: () => void;
}

export function useDisclosure(initial = false): UseDisclosureResult {
  const [open, setOpen] = useState<boolean>(initial);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const onToggle = useCallback(() => setOpen((v) => !v), []);
  return { open, onOpen, onClose, onToggle };
}
