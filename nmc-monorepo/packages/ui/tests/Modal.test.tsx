import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { Modal } from '../src/primitives/Modal.js';
import { renderWithTheme } from './test-utils.js';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { queryByText } = renderWithTheme(
      <Modal open={false} onClose={() => {}}>
        Body
      </Modal>,
    );
    expect(queryByText('Body')).toBeNull();
  });

  it('renders the children when open', () => {
    const { getByText } = renderWithTheme(
      <Modal open onClose={() => {}}>
        Body
      </Modal>,
    );
    expect(getByText('Body')).toBeTruthy();
  });

  it('renders the title in the header', () => {
    const { getByText } = renderWithTheme(
      <Modal open onClose={() => {}} title="Hello">
        Body
      </Modal>,
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = renderWithTheme(
      <Modal open onClose={onClose} title="Hello">
        Body
      </Modal>,
    );
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close button when hideCloseButton is set', () => {
    const { queryByLabelText } = renderWithTheme(
      <Modal open onClose={() => {}} hideCloseButton>
        Body
      </Modal>,
    );
    expect(queryByLabelText('Close')).toBeNull();
  });

  it('fires onClose on ESC keydown when persistent is false', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open onClose={onClose}>
        Body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose on ESC when persistent is true', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open onClose={onClose} persistent>
        Body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
