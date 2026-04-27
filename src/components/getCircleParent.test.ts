import { describe, it, expect } from 'vitest';
import { CircleEntity } from '@/lib/persistence-types';
import { getCircleParent } from '@/components/RolesTable';

describe('getCircleParent', () => {
  const buildMap = (circles: CircleEntity[]) => {
    const map = new Map<string, CircleEntity>();
    circles.forEach(c => map.set(c.id, c));
    return map;
  };

  it('returns "No Circle" for orphaned roles (no parentId)', () => {
    const role: CircleEntity = {
      id: 'role-1', name: 'Role A', parentId: null,
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(role, buildMap([]));
    expect(result).toEqual({ id: 'none', name: 'No Circle' });
  });

  it('returns the immediate non-role parent (circle)', () => {
    const circle: CircleEntity = {
      id: 'circle-1', name: 'Engineering', parentId: null,
      nodeType: 'circle', createdAt: '', updatedAt: '',
    };
    const role: CircleEntity = {
      id: 'role-1', name: 'Backend Dev', parentId: 'circle-1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(role, buildMap([circle, role]));
    expect(result).toEqual({ id: 'circle-1', name: 'Engineering' });
  });

  it('skips intermediate role parents to find the containing circle', () => {
    const circle: CircleEntity = {
      id: 'circle-1', name: 'Engineering', parentId: null,
      nodeType: 'circle', createdAt: '', updatedAt: '',
    };
    const roleA: CircleEntity = {
      id: 'role-a', name: 'Senior Dev', parentId: 'circle-1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const roleB: CircleEntity = {
      id: 'role-b', name: 'Junior Dev', parentId: 'role-a',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(roleB, buildMap([circle, roleA, roleB]));
    expect(result).toEqual({ id: 'circle-1', name: 'Engineering' });
  });

  it('handles deep nesting of roles', () => {
    const org: CircleEntity = {
      id: 'org', name: 'Acme Corp', parentId: null,
      nodeType: 'organization', createdAt: '', updatedAt: '',
    };
    const circle: CircleEntity = {
      id: 'c1', name: 'Product', parentId: 'org',
      nodeType: 'circle', createdAt: '', updatedAt: '',
    };
    const r1: CircleEntity = {
      id: 'r1', name: 'PM', parentId: 'c1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const r2: CircleEntity = {
      id: 'r2', name: 'APM', parentId: 'r1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const r3: CircleEntity = {
      id: 'r3', name: 'Intern', parentId: 'r2',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(r3, buildMap([org, circle, r1, r2, r3]));
    expect(result).toEqual({ id: 'c1', name: 'Product' });
  });

  it('returns "Unknown" name when circle name is missing', () => {
    const circle: CircleEntity = {
      id: 'circle-1', name: '', parentId: null,
      nodeType: 'circle', createdAt: '', updatedAt: '',
    };
    const role: CircleEntity = {
      id: 'role-1', name: 'Dev', parentId: 'circle-1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(role, buildMap([circle, role]));
    expect(result).toEqual({ id: 'circle-1', name: 'Unknown' });
  });

  it('returns "No Circle" for dangling parentId (parent not in map)', () => {
    const role: CircleEntity = {
      id: 'role-1', name: 'Dev', parentId: 'missing-circle',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(role, buildMap([role]));
    expect(result).toEqual({ id: 'none', name: 'No Circle' });
  });

  it('finds a group node as parent if it is the first non-role ancestor', () => {
    const group: CircleEntity = {
      id: 'group-1', name: 'Squad A', parentId: null,
      nodeType: 'group', createdAt: '', updatedAt: '',
    };
    const role: CircleEntity = {
      id: 'role-1', name: 'Member', parentId: 'group-1',
      nodeType: 'role', createdAt: '', updatedAt: '',
    };
    const result = getCircleParent(role, buildMap([group, role]));
    expect(result).toEqual({ id: 'group-1', name: 'Squad A' });
  });
});
