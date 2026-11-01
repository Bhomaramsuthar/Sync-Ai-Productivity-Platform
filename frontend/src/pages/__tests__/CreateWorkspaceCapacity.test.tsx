import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateWorkspace from '../CreateWorkspace';
import { workspaceService } from '../../services/workspaceService';

vi.mock('../../services/workspaceService', () => ({
  workspaceService: {
    create: vi.fn(),
  },
}));

describe('CreateWorkspace — Member Capacity & Policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders capacity step with default capacity of 50 seats', () => {
    render(
      <MemoryRouter>
        <CreateWorkspace />
      </MemoryRouter>
    );

    const capacityInput = screen.getByLabelText(/Member Capacity/i) as HTMLInputElement;
    expect(capacityInput).toBeDefined();
    expect(capacityInput.value).toBe('50');
    expect(screen.getByText(/How many people can join\?/i)).toBeDefined();
    expect(screen.getByText(/You can change this limit later in Workspace Settings/i)).toBeDefined();
    expect(screen.getByText(/Owner occupies 1 seat/i)).toBeDefined();
  });

  it('validates capacity input on change', () => {
    render(
      <MemoryRouter>
        <CreateWorkspace />
      </MemoryRouter>
    );

    const capacityInput = screen.getByLabelText(/Member Capacity/i) as HTMLInputElement;
    fireEvent.change(capacityInput, { target: { value: '25' } });
    expect(capacityInput.value).toBe('25');
  });

  it('submits name, description, max_capacity, and requires_approval to workspaceService.create', async () => {
    (workspaceService.create as any).mockResolvedValueOnce({
      data: { id: 'ws-123', name: 'Engineering', max_capacity: 75 },
    });

    render(
      <MemoryRouter>
        <CreateWorkspace />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/Workspace Name \*/i);
    const capacityInput = screen.getByLabelText(/Member Capacity/i);
    const submitBtn = screen.getByRole('button', { name: /Create Workspace/i });

    fireEvent.change(nameInput, { target: { value: 'Engineering' } });
    fireEvent.change(capacityInput, { target: { value: '75' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(workspaceService.create).toHaveBeenCalledWith({
        name: 'Engineering',
        description: undefined,
        max_capacity: 75,
        requires_approval: true,
      });
    });
  });

  it('renders clear Cancel button alongside Create Workspace action', () => {
    render(
      <MemoryRouter>
        <CreateWorkspace />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Create Workspace/i })).toBeDefined();
  });
});
