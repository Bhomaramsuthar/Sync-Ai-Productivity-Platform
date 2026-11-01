import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KineticTextReveal } from '../KineticTextReveal';

describe('KineticTextReveal', () => {
  it('renders semantic heading element matching the "as" prop', () => {
    const { container } = render(
      <KineticTextReveal text="Team Workspaces" as="h1" className="page-hero-title" />
    );
    const heading = container.querySelector('h1');
    expect(heading).toBeDefined();
    expect(heading?.className).toContain('page-hero-title');
  });

  it('preserves screen-reader readable text in sr-only element', () => {
    render(<KineticTextReveal text="Create Workspace" as="h2" />);
    // The screen-reader-only element contains full un-split string
    const srElement = screen.getByText('Create Workspace');
    expect(srElement).toBeDefined();
    expect(srElement.className).toContain('sr-only');
  });

  it('splits words correctly into aria-hidden visual spans', () => {
    const { container } = render(
      <KineticTextReveal text="Welcome back Teammate" as="h1" splitBy="words" />
    );
    const visualWords = Array.from(container.querySelectorAll('[aria-hidden="true"]')).map(el => el.textContent);
    expect(visualWords).toContain('Welcome');
    expect(visualWords).toContain('back');
    expect(visualWords).toContain('Teammate');
  });

  it('handles empty or blank text gracefully without crashing', () => {
    const { container } = render(<KineticTextReveal text="" as="p" />);
    const p = container.querySelector('p');
    expect(p).toBeDefined();
  });
});
