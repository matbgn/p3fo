import { describe, expect, it } from 'vitest';
import { isRichTextEmpty, richTextToPlainText } from './rich-text';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('richTextToPlainText', () => {
  it('keeps line breaks between BlockNote blocks', () => {
    const value = JSON.stringify([
      paragraph('Topics'),
      paragraph('Sub-topic one'),
      paragraph('Sub-topic two'),
    ]);
    expect(richTextToPlainText(value)).toBe(
      'Topics\nSub-topic one\nSub-topic two',
    );
  });

  it('renders nested list items with indentation', () => {
    const value = JSON.stringify([
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Topic' }],
        children: [
          {
            type: 'bulletListItem',
            content: [{ type: 'text', text: 'Sub-topic' }],
          },
        ],
      },
    ]);
    expect(richTextToPlainText(value)).toBe('- Topic\n  - Sub-topic');
  });

  it('keeps legacy plain text and its line breaks', () => {
    expect(richTextToPlainText('Topic\nSub-topic')).toBe('Topic\nSub-topic');
  });

  it('returns an empty string for empty content', () => {
    expect(richTextToPlainText(undefined)).toBe('');
    expect(richTextToPlainText('   ')).toBe('');
  });
});

describe('isRichTextEmpty', () => {
  it('treats an empty BlockNote document as empty', () => {
    const value = JSON.stringify([
      { type: 'paragraph', content: [], children: [] },
    ]);
    expect(isRichTextEmpty(value)).toBe(true);
  });

  it('treats a non-text block as content', () => {
    const value = JSON.stringify([{ type: 'image', props: { url: 'x' } }]);
    expect(isRichTextEmpty(value)).toBe(false);
  });

  it('treats legacy text as content', () => {
    expect(isRichTextEmpty('Topic')).toBe(false);
  });
});
