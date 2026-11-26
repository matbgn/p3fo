import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import { getVotingStrings, type Locale } from './voting-i18n';

const LOCALES: Locale[] = ['en', 'fr', 'de'];

describe('voting i18n', () => {
  it('follows a language change without a page reload', () => {
    // The resolved locale is cached (it is read per rendered cell), so the
    // cache must be dropped when i18next switches language.
    const previous = i18next.language;
    try {
      i18next.language = 'en';
      i18next.emit('languageChanged', 'en');
      expect(getVotingStrings()).toBe(getVotingStrings('en'));

      i18next.language = 'fr';
      i18next.emit('languageChanged', 'fr');
      expect(getVotingStrings()).toBe(getVotingStrings('fr'));
    } finally {
      i18next.language = previous;
      i18next.emit('languageChanged', previous);
    }
  });

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

  it.each(LOCALES)('exposes the scheduling mode and editor in %s', (locale) => {
    const strings = getVotingStrings(locale);
    expect(strings.modes.SCHEDULING).toBeTruthy();
    expect(strings.modeDescriptions.SCHEDULING).toBeTruthy();
    for (const key of [
      'timezone',
      'dateRange',
      'dailyStart',
      'dailyEnd',
      'duration',
      'minutes',
      'slotCount',
      'noSlots',
      'available',
      'ifNeeded',
      'unavailable',
      'unavailableNoAnswer',
      'coverage',
      'everyoneAvailable',
      'everyoneCanAttendIfNeeded',
      'selectAllAvailable',
      'clearAll',
      'bestTimes',
      'heatmap',
      'participants',
      'addToCalendar',
      'winningTime',
      'helpText',
    ] as const) {
      expect(strings.scheduling[key]).toBeTruthy();
    }
    for (const key of [
      'sectionTitle',
      'timezone',
      'timezoneHelp',
      'dates',
      'datesHelp',
      'dateRange',
      'startDate',
      'endDate',
      'weekdays',
      'weekdaysHelp',
      'dailyStart',
      'dailyEnd',
      'granularity',
      'granularityHelp',
      'duration',
      'durationHelp',
      'allowIfNeeded',
      'maxSlots',
      'maxSlotsHelp',
      'generateSlots',
      'slotCount',
      'preview',
      'noSlots',
      'removeSlot',
      'addDate',
      'removeDate',
      'minutesUnit',
      'fifteenMinutes',
      'thirtyMinutes',
      'sixtyMinutes',
    ] as const) {
      expect(strings.schedulingEditor[key]).toBeTruthy();
    }
  });
});
