export type ParsedTaskInput = {
  text: string;
  time: string | null;
};

const LEADING_TIME = /^(\d{1,2}):(\d{2})\s+(\S.*)$/su;

export function parseSmartTime(input: string): ParsedTaskInput {
  const text = input.trim();
  const match = LEADING_TIME.exec(text);

  if (match === null) {
    return { text, time: null };
  }

  const [, hours, minutes, rest] = match;

  if (Number(hours) > 23 || Number(minutes) > 59) {
    return { text, time: null };
  }

  return { text: rest.trim(), time: `${hours.padStart(2, '0')}:${minutes}` };
}
