import type { Category } from '@/hooks/useTasks';

export interface TaskTemplateChild {
  title: string;
  difficulty?: 0.5 | 1 | 2 | 3 | 5 | 8;
  category?: Category;
}

export interface TaskTemplate {
  id: string;
  name: string;
  parentTitle: string;
  children: TaskTemplateChild[];
  scope: 'workspace' | 'user';
}

export const DEFAULT_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tpl-dev-workflow',
    name: 'Development workflow',
    parentTitle: 'Feature',
    children: [
      { title: 'Write failing tests', difficulty: 2, category: 'Testing' },
      { title: 'Implement', difficulty: 3, category: 'Development' },
      { title: 'Tests pass', difficulty: 1, category: 'Testing' },
      { title: 'Documentation updated', difficulty: 1, category: 'Documentation' },
      { title: 'PR opened', difficulty: 0.5, category: 'Development' },
      { title: 'Stakeholders informed', difficulty: 0.5, category: 'Consulting' },
    ],
    scope: 'workspace',
  },
  {
    id: 'tpl-bug-fix',
    name: 'Bug fix',
    parentTitle: 'Bug',
    children: [
      { title: 'Reproduce the issue', difficulty: 1, category: 'Testing' },
      { title: 'Identify root cause', difficulty: 2, category: 'Development' },
      { title: 'Fix the bug', difficulty: 2, category: 'Development' },
      { title: 'Verify fix', difficulty: 1, category: 'Testing' },
      { title: 'Stakeholders informed', difficulty: 0.5, category: 'Consulting' },
    ],
    scope: 'workspace',
  },
  {
    id: 'tpl-release',
    name: 'Release',
    parentTitle: 'Release',
    children: [
      { title: 'Changelog written', difficulty: 1, category: 'Documentation' },
      { title: 'Version bumped', difficulty: 0.5, category: 'Development' },
      { title: 'Deployment notes added', difficulty: 0.5, category: 'Documentation' },
      { title: 'Stakeholders informed', difficulty: 0.5, category: 'Consulting' },
    ],
    scope: 'workspace',
  },
];

const STORAGE_KEY_WORKSPACE = 'p3fo_templates_workspace';
const STORAGE_KEY_USER = 'p3fo_templates_user';

export function loadTemplates(scope: 'workspace' | 'user'): TaskTemplate[] {
  const key = scope === 'workspace' ? STORAGE_KEY_WORKSPACE : STORAGE_KEY_USER;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return scope === 'workspace' ? DEFAULT_TEMPLATES : [];
}

export function saveTemplates(scope: 'workspace' | 'user', templates: TaskTemplate[]): void {
  const key = scope === 'workspace' ? STORAGE_KEY_WORKSPACE : STORAGE_KEY_USER;
  try {
    localStorage.setItem(key, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

export function getAllTemplates(): TaskTemplate[] {
  return [...loadTemplates('workspace'), ...loadTemplates('user')];
}