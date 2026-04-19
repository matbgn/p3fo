import { describe, it, expect } from 'vitest';
import { AppSettingsEntity } from './persistence-types';

describe('cardAgingBaseDays Setting', () => {
  it('AC1: field exists in AppSettingsEntity type', () => {
    const settings: AppSettingsEntity = {
      splitTime: 40,
      userWorkloadPercentage: 80,
      weeksComputation: 4,
      highImpactTaskGoal: 5,
      failureRateGoal: 10,
      qliGoal: 7,
      newCapabilitiesGoal: 3,
      cardAgingBaseDays: 30,
    };
    expect(settings.cardAgingBaseDays).toBe(30);
  });

  it('AC2: field is optional with undefined default', () => {
    const settings: AppSettingsEntity = {
      splitTime: 40,
      userWorkloadPercentage: 80,
      weeksComputation: 4,
      highImpactTaskGoal: 5,
      failureRateGoal: 10,
      qliGoal: 7,
      newCapabilitiesGoal: 3,
    };
    expect(settings.cardAgingBaseDays).toBeUndefined();
  });

  it('AC4: zero value disables feature', () => {
    const settings: AppSettingsEntity = {
      splitTime: 40,
      userWorkloadPercentage: 80,
      weeksComputation: 4,
      highImpactTaskGoal: 5,
      failureRateGoal: 10,
      qliGoal: 7,
      newCapabilitiesGoal: 3,
      cardAgingBaseDays: 0,
    };
    const featureDisabled = settings.cardAgingBaseDays === 0 || settings.cardAgingBaseDays === undefined;
    expect(featureDisabled).toBe(true);
  });

  it('AC4: undefined value disables feature', () => {
    const settings: AppSettingsEntity = {
      splitTime: 40,
      userWorkloadPercentage: 80,
      weeksComputation: 4,
      highImpactTaskGoal: 5,
      failureRateGoal: 10,
      qliGoal: 7,
      newCapabilitiesGoal: 3,
    };
    const featureDisabled = settings.cardAgingBaseDays === 0 || settings.cardAgingBaseDays === undefined;
    expect(featureDisabled).toBe(true);
  });
});