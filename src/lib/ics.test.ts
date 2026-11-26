import { describe, expect, it } from 'vitest';
import { buildAllDayEventIcs, buildEventIcs, escapeIcsText } from './ics';

describe('buildEventIcs', () => {
  it('builds a VCALENDAR with UTC start and end stamps', () => {
    const ics = buildEventIcs({
      title: 'Team lunch, Q3',
      description: 'Line one\nLine two; bring\\stuff',
      startAt: '2026-05-01T10:00:00.000Z',
      endAt: '2026-05-01T11:30:00.000Z',
      location: 'Room 1, HQ',
      url: 'https://example.com/events/1',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260501T100000Z');
    expect(ics).toContain('DTEND:20260501T113000Z');
    expect(ics).toContain('SUMMARY:Team lunch\\, Q3');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\\; bring\\\\stuff');
    expect(ics).toContain('LOCATION:Room 1\\, HQ');
    expect(ics).toContain('URL:https://example.com/events/1');
    expect(ics).toMatch(/^UID:.+@p3fo$/m);
    expect(ics).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/m);
    expect(ics).toMatch(/^PRODID:/m);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('defaults the end to one hour after the start', () => {
    const ics = buildEventIcs({
      title: 'Short meetup',
      startAt: '2026-05-01T10:00:00Z',
    });
    expect(ics).toContain('DTEND:20260501T110000Z');
    expect(ics).toContain('DESCRIPTION:');
    expect(ics).toContain('LOCATION:');
  });

  it('rejects a missing title or invalid start', () => {
    expect(() => buildEventIcs({ title: '   ', startAt: '2026-05-01T10:00:00Z' })).toThrow();
    expect(() => buildEventIcs({ title: 'Event', startAt: 'not-a-date' })).toThrow();
  });

  it('never injects extra calendar lines through the URL property', () => {
    const ics = buildEventIcs({
      title: 'Meetup',
      startAt: '2026-05-01T10:00:00Z',
      url: 'https://example.com/a\r\nATTENDEE:mailto:attacker@example.com',
    });
    // The CR/LF is stripped, so the payload cannot start a new content line.
    expect(ics).not.toMatch(/^ATTENDEE:/m);
    expect(ics).toContain('URL:https://example.com/aATTENDEE:mailto:attacker@example.com');
  });

  it('drops non-HTTP(S) URL schemes', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      const ics = buildEventIcs({ title: 'Meetup', startAt: '2026-05-01T10:00:00Z', url });
      expect(ics).not.toContain('URL:');
    }
  });
});

describe('escapeIcsText', () => {
  it('escapes backslashes, separators and newlines', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(escapeIcsText('first\r\nsecond')).toBe('first\\nsecond');
  });
});

describe('buildAllDayEventIcs', () => {
  it('emits DATE-valued DTSTART and the next day as DTEND', () => {
    const ics = buildAllDayEventIcs({
      title: 'Offsite, day one',
      description: 'Bring; notes\\and a pen',
      dateKey: '2026-06-01',
      url: 'https://example.com/offsite',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601');
    expect(ics).toContain('DTEND;VALUE=DATE:20260602');
    expect(ics).toContain('SUMMARY:Offsite\\, day one');
    expect(ics).toContain('DESCRIPTION:Bring\\; notes\\\\and a pen');
    expect(ics).toContain('URL:https://example.com/offsite');
    expect(ics).toMatch(/^UID:.+@p3fo$/m);
    expect(ics).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/m);
    expect(ics).toMatch(/^PRODID:/m);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('advances across a year boundary', () => {
    const ics = buildAllDayEventIcs({
      title: 'New Year',
      dateKey: '2026-12-31',
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
    expect(ics).toContain('DESCRIPTION:');
  });

  it('rejects a missing title or an invalid date', () => {
    expect(() => buildAllDayEventIcs({ title: '  ', dateKey: '2026-06-01' })).toThrow();
    expect(() => buildAllDayEventIcs({ title: 'Event', dateKey: 'not-a-date' })).toThrow();
  });
});
