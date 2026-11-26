import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES as APP_CATEGORIES } from '@/lib/workspace-taxonomy';
import { CATEGORIES as MCP_CATEGORIES } from '../../mcp-server/src/categories';

describe('MCP category list parity', () => {
  it('matches the app category list', () => {
    expect([...MCP_CATEGORIES]).toEqual([...APP_CATEGORIES]);
  });
});
