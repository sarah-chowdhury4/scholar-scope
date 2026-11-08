import { describe, expect, it } from 'vitest';
import { COUNTRIES, POPULAR_COUNTRIES } from '../src/countries';
import {
  applyProfilePatch,
  domesticCountries,
  emptyProfileRecord,
  missingForRecommendations,
  primaryBlock,
  readinessPercent,
  readProfileRecord,
  removalBlock,
  schoolNote,
  type ProfileRecord,
} from '../src/profile';

function saved(patch: Parameters<typeof applyProfilePatch>[1]): ProfileRecord {
  const result = applyProfilePatch(emptyProfileRecord(), patch);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('country list', () => {
  it('has unique spellings, including the names that are easy to get wrong', () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    expect(COUNTRIES).toContain('Ivory Coast');
    expect(COUNTRIES).toContain('DR Congo');
    expect(COUNTRIES).toContain('Czech Republic');
    expect(COUNTRIES).toContain('United States');
  });

  it('only offers popular countries that exist in the full list', () => {
    for (const country of POPULAR_COUNTRIES) expect(COUNTRIES).toContain(country);
  });
});

describe('applyProfilePatch', () => {
  it('canonicalises country spelling and ignores duplicates', () => {
    const result = saved({
      citizenships: ['canada', 'Canada', 'Bangladesh'],
      currentLocation: 'canada',
      residencyStatus: 'citizen',
    });
    expect(result.citizenships).toEqual(['Canada', 'Bangladesh']);
    expect(result.currentLocation).toBe('Canada');
  });

  it('rejects an unknown country', () => {
    const result = applyProfilePatch(emptyProfileRecord(), { countriesOfInterest: ['Narnia'] });
    expect(result.ok).toBe(false);
  });

  it('requires a status when a current country is set', () => {
    const result = applyProfilePatch(emptyProfileRecord(), { currentLocation: 'Germany' });
    expect(result.ok).toBe(false);
  });

  it('does not keep the old status when the student moves to a different country', () => {
    const current = saved({ currentLocation: 'Canada', residencyStatus: 'citizen', citizenships: ['Canada'] });
    const moved = applyProfilePatch(current, { currentLocation: 'Germany' });
    expect(moved.ok).toBe(false);
  });

  it('clears a current-school country once the student is not enrolled', () => {
    const current = saved({
      currentLocation: 'Germany',
      residencyStatus: 'student_visa',
      schoolCountry: 'Germany',
      education: { enrollment: 'undergraduate' },
    });
    const result = applyProfilePatch(current, { education: { enrollment: 'graduated' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.schoolCountry).toBeNull();
  });

  it('accepts a GPA only when it fits the scale', () => {
    expect(applyProfilePatch(emptyProfileRecord(), { education: { gpa: 3.3, gpaScale: '4' } }).ok).toBe(true);
    expect(applyProfilePatch(emptyProfileRecord(), { education: { gpa: 0, gpaScale: '4' } }).ok).toBe(true);
    expect(applyProfilePatch(emptyProfileRecord(), { education: { gpa: 5, gpaScale: '4' } }).ok).toBe(false);
    expect(applyProfilePatch(emptyProfileRecord(), { education: { gpa: 3.3 } }).ok).toBe(false);
  });

  it('rejects an unknown time zone and marks a valid one as chosen', () => {
    expect(applyProfilePatch(emptyProfileRecord(), { timezone: 'Not/AZone' }).ok).toBe(false);
    const result = applyProfilePatch(emptyProfileRecord(), { timezone: 'Asia/Dhaka' });
    expect(result.ok && result.value.timezoneChosen && result.value.timezone).toBe('Asia/Dhaka');
  });
});

describe('domestic or international standing', () => {
  it('treats every citizenship as domestic', () => {
    const record = saved({ citizenships: ['Bangladesh', 'Canada'] });
    expect(domesticCountries(record)).toEqual(['Bangladesh', 'Canada']);
  });

  it('treats permanent residence as domestic and a student visa as international', () => {
    const resident = saved({ currentLocation: 'Canada', residencyStatus: 'permanent_resident' });
    expect(domesticCountries(resident)).toEqual(['Canada']);
    const visa = saved({
      citizenships: ['Bangladesh'],
      currentLocation: 'Germany',
      residencyStatus: 'student_visa',
    });
    expect(domesticCountries(visa)).toEqual(['Bangladesh']);
    expect(schoolNote({ ...visa, schoolCountry: 'Germany' })).toMatch(/international/i);
  });

  it('counts a citizen status even if that country was left off the citizenship list', () => {
    const record = saved({ currentLocation: 'United States', residencyStatus: 'citizen' });
    expect(domesticCountries(record)).toEqual(['United States']);
  });

  it('lists what recommendations still need', () => {
    expect(missingForRecommendations(emptyProfileRecord()).length).toBeGreaterThan(0);
    expect(readinessPercent(emptyProfileRecord())).toBe(0);
    const ready = saved({
      citizenships: ['Canada'],
      currentLocation: 'Canada',
      residencyStatus: 'citizen',
      countriesOfInterest: ['Canada', 'Germany'],
      schoolCountry: 'Canada',
      education: {
        highestLevel: 'secondary',
        enrollment: 'secondary',
        fieldOfStudy: 'Biology',
        gpa: 3.8,
        gpaScale: '4',
      },
    });
    expect(missingForRecommendations(ready)).toEqual([]);
    expect(readinessPercent(ready)).toBe(100);
  });
});

describe('email list rules', () => {
  const primary = { address: 'a@student.test', verified: true, primary: true };
  const extra = { address: 'b@student.test', verified: true, primary: false };

  it('refuses to remove the primary or the last address', () => {
    expect(removalBlock([primary], primary.address)).toMatch(/at least one/i);
    expect(removalBlock([primary, extra], primary.address)).toMatch(/primary/i);
    expect(removalBlock([primary, extra], extra.address)).toBeNull();
  });

  it('refuses to make an unconfirmed address the primary', () => {
    const pending = { address: 'c@student.test', verified: false, primary: false };
    expect(primaryBlock([primary, pending], pending.address)).toMatch(/confirm/i);
    expect(primaryBlock([primary, extra], extra.address)).toBeNull();
    expect(primaryBlock([primary, extra], primary.address)).toMatch(/already/i);
  });
});

describe('readProfileRecord', () => {
  it('drops unknown countries and enum values instead of throwing', () => {
    const record = readProfileRecord({
      citizenships: ['Canada', 'Narnia'],
      residencyStatus: 'king',
      education: { highestLevel: 'phd', gpa: 3 },
      timezone: 'America/New_York',
    });
    expect(record.citizenships).toEqual(['Canada']);
    expect(record.residencyStatus).toBeNull();
    expect(record.education.highestLevel).toBeNull();
    expect(record.timezone).toBe('America/New_York');
  });
});
