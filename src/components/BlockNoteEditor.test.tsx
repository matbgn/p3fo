import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BlockNoteEditor } from './BlockNoteEditor';

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(() => ({
    document: [],
    onChange: vi.fn((_cb: (_editor: unknown) => void) => () => {}),
    replaceBlocks: vi.fn(),
  })),
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: () => null,
}));

describe('BlockNoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const onChange = vi.fn();
    const { container } = render(<BlockNoteEditor onChange={onChange} />);
    expect(container.querySelector('[class*="border"]')).toBeTruthy();
  });

  it('renders with initialContent without crashing', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlockNoteEditor onChange={onChange} initialContent="Hello\n\nWorld" />
    );
    expect(container.querySelector('[class*="border"]')).toBeTruthy();
  });

  it('applies custom className', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlockNoteEditor onChange={onChange} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });
});
