import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HoldToDeleteButton } from '../HoldToDeleteButton';

describe('HoldToDeleteButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  it('renders with default label and icon', () => {
    render(<HoldToDeleteButton onConfirm={vi.fn()} label="Hold to Delete Item" itemName="Project X" />);
    const button = screen.getByRole('button');
    expect(button).toBeDefined();
    expect(screen.getByText('Hold to Delete Item')).toBeDefined();
    expect(button.getAttribute('aria-label')).toContain('Hold to delete Project X');
  });

  it('triggers onConfirm after holding for the full duration', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        label="Delete Item"
      />
    );
    const button = screen.getByRole('button');

    // Start holding via mousedown
    act(() => {
      fireEvent.mouseDown(button, { button: 0 });
    });

    // Advance performance now by 1050ms
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels hold when pointer leaves the button before completion', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        label="Delete Item"
      />
    );
    const button = screen.getByRole('button');

    act(() => {
      fireEvent.mouseDown(button, { button: 0 });
    });

    // Advance halfway
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Pointer leaves
    act(() => {
      fireEvent.mouseLeave(button);
    });

    // Advance beyond original duration
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('cancels hold on mouseUp before completion', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        label="Delete Item"
      />
    );
    const button = screen.getByRole('button');

    act(() => {
      fireEvent.mouseDown(button, { button: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    act(() => {
      fireEvent.mouseUp(button);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('supports keyboard hold with Space or Enter key', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        label="Delete Item"
      />
    );
    const button = screen.getByRole('button');

    act(() => {
      fireEvent.keyDown(button, { key: ' ' });
    });

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels hold on keyUp before completion', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        label="Delete Item"
      />
    );
    const button = screen.getByRole('button');

    act(() => {
      fireEvent.keyDown(button, { key: 'Enter' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      fireEvent.keyUp(button, { key: 'Enter' });
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('does not start hold if disabled or loading', () => {
    const handleConfirm = vi.fn();
    render(
      <HoldToDeleteButton
        onConfirm={handleConfirm}
        holdDuration={1000}
        disabled
      />
    );
    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(true);

    act(() => {
      fireEvent.mouseDown(button, { button: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(handleConfirm).not.toHaveBeenCalled();
  });
});
