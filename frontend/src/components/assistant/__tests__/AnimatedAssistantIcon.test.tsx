import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnimatedAssistantIcon } from '../AnimatedAssistantIcon';
import { GlobalAIAssistant } from '../../GlobalAIAssistant';
import { assistantService } from '../../../services/assistantService';

describe('AnimatedAssistantIcon - Interactive State Machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  it('1. Static icon appears initially on mount', () => {
    render(<AnimatedAssistantIcon disableReducedMotionCheck />);
    const iconRoot = screen.getByTestId('animated-assistant-icon');
    expect(iconRoot).toBeDefined();
    expect(iconRoot.getAttribute('data-state')).toBe('static');

    const img = iconRoot.querySelector('img');
    expect(img).toBeDefined();
    expect(img?.getAttribute('src')).toContain('static.svg');
  });

  it('2. Hover immediately activates the long animation', () => {
    const handleStateChange = vi.fn();
    render(
      <AnimatedAssistantIcon
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Mouse enter
    act(() => {
      fireEvent.mouseEnter(iconRoot);
    });

    expect(iconRoot.getAttribute('data-state')).toBe('hover');
    const img = iconRoot.querySelector('img');
    expect(img?.getAttribute('src')).toContain('long-animation.svg');
    expect(handleStateChange).toHaveBeenCalledWith('hover');
  });

  it('3. Leaving hover resets the icon to static and starts the timer', () => {
    render(<AnimatedAssistantIcon disableReducedMotionCheck />);
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Hover
    act(() => {
      fireEvent.mouseEnter(iconRoot);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');

    // Leave hover
    act(() => {
      fireEvent.mouseLeave(iconRoot);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');
    const img = iconRoot.querySelector('img');
    expect(img?.getAttribute('src')).toContain('static.svg');
  });

  it('4. Hovering cancels the idle timer', () => {
    const handleStateChange = vi.fn();
    render(
      <AnimatedAssistantIcon
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Advance 50 seconds without hover
    act(() => {
      vi.advanceTimersByTime(50000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // Hover at 50s
    act(() => {
      fireEvent.mouseEnter(iconRoot);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');

    // Advance past original 60s mark (another 30s) while hovered
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    // Still in hover, idle timer was cancelled
    expect(iconRoot.getAttribute('data-state')).toBe('hover');
    expect(handleStateChange).not.toHaveBeenCalledWith('idle');
  });

  it('5. The short animation activates after 60 seconds without hover', () => {
    const handleStateChange = vi.fn();
    render(
      <AnimatedAssistantIcon
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // Advance 59.9 seconds
    act(() => {
      vi.advanceTimersByTime(59900);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // Reach 60 seconds (60,000 ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');
    const img = iconRoot.querySelector('img');
    expect(img?.getAttribute('src')).toContain('short-animation.svg');
    expect(handleStateChange).toHaveBeenCalledWith('idle');
  });

  it('6. The short animation returns to static after its configured duration', () => {
    const handleStateChange = vi.fn();
    render(
      <AnimatedAssistantIcon
        config={{ shortAnimationDurationMs: 2400 }}
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Trigger idle at 60s
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // Advance 2,390 ms (almost finished)
    act(() => {
      vi.advanceTimersByTime(2390);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // Advance remaining 10 ms (total 2400 ms)
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');
    const img = iconRoot.querySelector('img');
    expect(img?.getAttribute('src')).toContain('static.svg');
  });

  it('7. The idle animation can repeat after another 60 seconds', () => {
    render(
      <AnimatedAssistantIcon
        config={{ idleTimeoutMs: 60000, shortAnimationDurationMs: 2400 }}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // First cycle: 60s -> idle
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // Duration finishes: 2400ms -> static
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // Second cycle: 60s without hover -> idle again!
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // Returns to static again after 2400ms
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');
  });

  it('8. Hovering during the short animation interrupts it correctly', () => {
    const handleStateChange = vi.fn();
    render(
      <AnimatedAssistantIcon
        config={{ idleTimeoutMs: 60000, shortAnimationDurationMs: 2400 }}
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Enter idle state at 60s
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // Advance 1000ms into the short animation
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');

    // User hovers while short animation is playing!
    act(() => {
      fireEvent.mouseEnter(iconRoot);
    });
    // Immediately switches to hover
    expect(iconRoot.getAttribute('data-state')).toBe('hover');
    expect(iconRoot.querySelector('img')?.getAttribute('src')).toContain('long-animation.svg');

    // Advance another 5000ms: should NOT return to static because pointer is still hovering
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');
  });

  it('9. Unmounting clears timers and avoids stale callbacks', () => {
    const handleStateChange = vi.fn();
    const { unmount } = render(
      <AnimatedAssistantIcon
        onStateChange={handleStateChange}
        disableReducedMotionCheck
      />
    );

    // Unmount at 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    unmount();

    // Advance past 60s
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // No updates dispatched post unmount
    expect(handleStateChange).not.toHaveBeenCalledWith('idle');
  });

  it('10. Keyboard focus and blur behave correctly', () => {
    render(<AnimatedAssistantIcon disableReducedMotionCheck />);
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Focus via keyboard
    act(() => {
      fireEvent.focus(iconRoot);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');

    // Blur via keyboard
    act(() => {
      fireEvent.blur(iconRoot);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // After 60s from blur, enters idle
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('idle');
  });

  it('11. Gracefully falls back to static icon when asset error occurs', () => {
    render(
      <AnimatedAssistantIcon
        config={{
          longAnimationAsset: '/assets/assistant/non-existent-animation.gif',
        }}
        disableReducedMotionCheck
      />
    );
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    // Hover to trigger long animation
    act(() => {
      fireEvent.mouseEnter(iconRoot);
    });

    // Simulate img onError
    const img = iconRoot.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/assets/assistant/non-existent-animation.gif');

    act(() => {
      fireEvent.error(img);
    });

    // Fallback applies: displays static asset
    const fallbackImg = iconRoot.querySelector('img')!;
    expect(fallbackImg.getAttribute('src')).toContain('static.svg');
  });
});

describe('GlobalAIAssistant Launcher Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(assistantService, 'listConversations').mockResolvedValue({
      data: [],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  it('12. There is only one floating launcher button in the document', () => {
    render(
      <MemoryRouter>
        <GlobalAIAssistant />
      </MemoryRouter>
    );

    const launchers = document.querySelectorAll('#global-ai-assistant-btn');
    expect(launchers.length).toBe(1);
  });

  it('11. Clicking launcher opens the existing AI drawer', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <GlobalAIAssistant />
        </MemoryRouter>
      );
    });

    const launcherBtn = document.getElementById('global-ai-assistant-btn') as HTMLButtonElement;
    expect(launcherBtn).toBeDefined();
    expect(launcherBtn.getAttribute('aria-expanded')).toBe('false');

    // Click to open drawer
    await act(async () => {
      fireEvent.click(launcherBtn);
    });

    expect(launcherBtn.getAttribute('aria-expanded')).toBe('true');
    const drawerPanel = document.querySelector('.global-ai-panel');
    expect(drawerPanel?.classList.contains('open')).toBe(true);

    // Click again to close drawer
    await act(async () => {
      fireEvent.click(launcherBtn);
    });
    expect(launcherBtn.getAttribute('aria-expanded')).toBe('false');
    expect(drawerPanel?.classList.contains('open')).toBe(false);
  });

  it('Hovering and focusing the launcher button animates the icon', () => {
    render(
      <MemoryRouter>
        <GlobalAIAssistant />
      </MemoryRouter>
    );

    const launcherBtn = document.getElementById('global-ai-assistant-btn') as HTMLButtonElement;
    const iconRoot = screen.getByTestId('animated-assistant-icon');

    expect(iconRoot.getAttribute('data-state')).toBe('static');

    // Hover launcher button
    act(() => {
      fireEvent.mouseEnter(launcherBtn);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');
    expect(launcherBtn.classList.contains('hovered')).toBe(true);

    // Leave launcher button
    act(() => {
      fireEvent.mouseLeave(launcherBtn);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('static');
    expect(launcherBtn.classList.contains('hovered')).toBe(false);

    // Focus launcher button
    act(() => {
      fireEvent.focus(launcherBtn);
    });
    expect(iconRoot.getAttribute('data-state')).toBe('hover');
  });
});
