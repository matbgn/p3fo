import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RolesTable } from './RolesTable';

vi.mock('@/hooks/useCircles', () => ({
  useCircles: vi.fn(),
}));

vi.mock('@/context/UsersContext', () => ({
  useUsersContext: vi.fn(),
}));

vi.mock('@/lib/collaboration', () => ({
  doc: { getXmlFragment: vi.fn(() => ({ length: 0 })) },
  isCollaborationEnabled: vi.fn(() => false),
  provider: null,
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: () => null,
  default: () => null,
}));

import { useCircles } from '@/hooks/useCircles';
import { useUsersContext } from '@/context/UsersContext';

 describe('RolesTable', () => {
  const mockUseCircles = useCircles as unknown as ReturnType<typeof vi.fn>;
  const mockUseUsers = useUsersContext as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders roles with mock data', () => {
    mockUseCircles.mockReturnValue({
      circles: [
        {
          id: 'c1', name: 'Engineering', parentId: null,
          nodeType: 'circle', createdAt: '', updatedAt: '',
          assignments: [],
        },
        {
          id: 'r1', name: 'Backend Dev', parentId: 'c1',
          nodeType: 'role', createdAt: '', updatedAt: '',
          assignments: [
            { userId: 'u1', involvementType: 'P' },
            { userId: 'u2', involvementType: 'CP' },
          ],
        },
        {
          id: 'r2', name: 'Frontend Dev', parentId: 'c1',
          nodeType: 'role', createdAt: '', updatedAt: '',
          assignments: [],
        },
      ],
    });

    mockUseUsers.mockReturnValue({
      users: [
        { userId: 'u1', username: 'Alice', trigram: 'ALI' },
        { userId: 'u2', username: 'Bob', trigram: 'BOB' },
      ],
    });

    render(<RolesTable />);
    expect(screen.getByText('Backend Dev')).toBeTruthy();
    expect(screen.getByText('Frontend Dev')).toBeTruthy();
    // Engineering appears twice as the parent circle for both roles
    expect(screen.getAllByText('Engineering').length).toBe(2);
    expect(screen.getByText('circles.involvement.P')).toBeTruthy();
    expect(screen.getByText('circles.involvement.CP')).toBeTruthy();
  });

  it('shows search field and toggle buttons', () => {
    mockUseCircles.mockReturnValue({ circles: [] });
    mockUseUsers.mockReturnValue({ users: [] });

    render(<RolesTable />);
    expect(screen.getByPlaceholderText('roles.searchPlaceholder')).toBeTruthy();
    expect(screen.getByText('roles.viewList')).toBeTruthy();
    expect(screen.getByText('roles.viewByUser')).toBeTruthy();
  });

  it('shows no roles message when circles array is empty', () => {
    mockUseCircles.mockReturnValue({ circles: [] });
    mockUseUsers.mockReturnValue({ users: [] });

    render(<RolesTable />);
    expect(screen.getByText('roles.noRolesMatch')).toBeTruthy();
  });
});
