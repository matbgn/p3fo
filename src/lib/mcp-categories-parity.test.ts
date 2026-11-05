import { describe, expect, it } from 'vitest';
import { CATEGORIES as APP_CATEGORIES } from '@/data/categories';
import { CATEGORIES as MCP_CATEGORIES } from '../../mcp-server/src/categories';

describe('MCP category list parity', () => {
  it('matches the app category list', () => {
    expect([...MCP_CATEGORIES]).toEqual([...APP_CATEGORIES]);
  });
});
