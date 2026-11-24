import { describe, it, expect } from 'vitest';
import { getVotingStrings, type Locale } from './voting-i18n';

const LOCALES: Locale[] = ['en', 'fr', 'de'];

describe('voting i18n', () => {
  it.each(LOCALES)('exposes the attendance mode in %s', (locale) => {
    const strings = getVotingStrings(locale);
    expect(strings.modes.ATTENDANCE).toBeTruthy();
    expect(strings.modeDescriptions.ATTENDANCE).toBeTruthy();
    expect(strings.attendanceOptions.going).toBeTruthy();
    expect(strings.attendanceOptions.maybe).toBeTruthy();
    expect(strings.attendanceOptions.notGoing).toBeTruthy();
    expect(strings.attendance.attendees).toBeTruthy();
    expect(strings.messages.attendancePrompt).toBeTruthy();
  });
});
