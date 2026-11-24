export interface EventIcsOptions {
  title: string;
  description?: string;
  startAt: string | Date;
  endAt?: string | Date;
  location?: string;
  url?: string;
}

const PRODID = '-//p3fo//Event RSVP//EN';
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function parseDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** RFC 5545 UTC timestamp, e.g. 20260501T100000Z. */
function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/** Escape a TEXT property value (summary, description, location). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * A URL property is a URI, not TEXT, so it is not run through escapeIcsText.
 * It still must not carry CR/LF (that would start a new iCalendar line and let
 * a configured link inject arbitrary properties) and must not smuggle a
 * non-HTTP scheme into the calendar file. The same guard is used before
 * rendering a configured link as an anchor, so a `javascript:` URL can never be
 * clicked into execution on the public page.
 */
export function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/[\r\n]+/g, '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

/** Fold a content line to the RFC 5545 75-octet guidance for plain ASCII. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function stableUid(title: string, start: Date): string {
  const input = `${title}|${start.toISOString()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}@p3fo`;
}

/**
 * Build a single-event calendar file. `endAt` is optional: an invalid or
 * missing end falls back to one hour after the start so DTEND is always valid.
 */
export function buildEventIcs(options: EventIcsOptions): string {
  const title = options.title?.trim();
  if (!title) throw new Error('An event title is required');

  const start = parseDate(options.startAt);
  if (!start) throw new Error('A valid event start is required');

  const parsedEnd = parseDate(options.endAt);
  const end =
    parsedEnd && parsedEnd.getTime() > start.getTime()
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stableUid(title, start)}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(options.description ?? '')}`,
    `LOCATION:${escapeIcsText(options.location ?? '')}`,
  ];
  const url = safeHttpUrl(options.url);
  if (url) lines.push(`URL:${url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** Trigger a browser download for an ICS payload. */
export function downloadEventIcs(filename: string, content: string): void {
  const name = filename.trim() || 'event.ics';
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.toLowerCase().endsWith('.ics') ? name : `${name}.ics`;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
