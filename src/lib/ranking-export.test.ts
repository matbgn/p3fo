import { describe, expect, it } from 'vitest';
import {
  buildPlainRankingList,
  buildRankedList,
  buildRankingCsv,
  buildRankingJson,
  type RankingExportItem,
} from './ranking-export';

const items: RankingExportItem[] = [
  { rank: 1, id: 'a', title: 'Alpha', score: 1.2, tied: true },
  { rank: 1, id: 'b', title: 'Beta, "quoted"', score: 1.2, tied: true },
  { rank: 3, id: 'c', title: 'Gamma', score: 0.4 },
];

describe('ranking export', () => {
  it('exports one title per line for batch import', () => {
    expect(buildPlainRankingList(items)).toBe('Alpha\nBeta, "quoted"\nGamma');
  });

  it('exports rank-prefixed lines preserving ties', () => {
    expect(buildRankedList(items)).toBe('1. Alpha\n1. Beta, "quoted"\n3. Gamma');
  });

  it('escapes CSV values and includes metadata', () => {
    const csv = buildRankingCsv(items);
    expect(csv.split('\n')[0]).toBe('rank,title,id,score,tied');
    expect(csv).toContain('1,"Beta, ""quoted""","b",1.2,true');
  });

  it('neutralizes spreadsheet formula injection in titles', () => {
    const csv = buildRankingCsv([
      { rank: 1, id: 'a', title: '=HYPERLINK("http://evil")' },
      { rank: 2, id: 'b', title: '+1+1' },
      { rank: 3, id: 'c', title: '@SUM(1)' },
      { rank: 4, id: 'd', title: '-2+3' },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).toContain(`"'-2+3"`);
  });

  it('exports JSON metadata', () => {
    expect(JSON.parse(buildRankingJson(items))).toEqual(items);
  });
});
