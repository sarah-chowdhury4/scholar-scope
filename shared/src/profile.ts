import { COUNTRIES, POPULAR_COUNTRIES, matchCountry } from './countries';

/** Caps and timings shared by the API and the profile page. */
export const LIMITS = {
  maxEmails: 5,
  maxCountriesOfInterest: 15,
  maxCitizenships: 4,
  minPasswordLength: 12,
  maxPasswordLength: 128,
  codeTtlMs: 15 * 60 * 1000,
  resendCooldownMs: 60 * 1000,
  maxCodeAttempts: 5,
  minBirthYear: 1940,
} as const;

export const EDUCATION_LEVELS = [
  { id: 'secondary', label: 'Secondary school (high school)' },
  { id: 'associate', label: 'Associate degree or equivalent' },
  { id: 'bachelor', label: "Bachelor's degree" },
  { id: 'master', label: "Master's degree" },
  { id: 'doctoral', label: 'Doctoral degree' },
  { id: 'other', label: 'Other' },
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]['id'];

/** What the student is doing now. This is separate from the highest level they have finished. */
export const ENROLLMENTS = [
  { id: 'secondary', label: 'In secondary school' },
  { id: 'undergraduate', label: 'Undergraduate student' },
  { id: 'graduate', label: 'Graduate student' },
  { id: 'gap', label: 'Gap year or not currently enrolled' },
  { id: 'graduated', label: 'Finished school and not enrolled' },
] as const;
export type Enrollment = (typeof ENROLLMENTS)[number]['id'];

/**
 * Status in the country where the student lives now.
 * Citizen and permanent resident count as domestic for that country.
 * A student visa or a temporary stay does not.
 */
export const RESIDENCY_STATUSES = [
  { id: 'citizen', label: 'Citizen of this country' },
  { id: 'permanent_resident', label: 'Permanent resident' },
  { id: 'student_visa', label: 'Student visa or study permit' },
  { id: 'temporary', label: 'Temporary stay (work, visit, or other visa)' },
  { id: 'other', label: 'Other' },
] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number]['id'];

/** GPA scales students actually report. Stored as text so 4.3 is not a float key. */
export const GPA_SCALES = [
  { id: '4', label: 'Out of 4.0' },
  { id: '4.3', label: 'Out of 4.3' },
  { id: '5', label: 'Out of 5.0' },
  { id: '10', label: 'Out of 10' },
  { id: '100', label: 'Out of 100' },
] as const;
export type GpaScale = (typeof GPA_SCALES)[number]['id'];

export type Education = {
  highestLevel: EducationLevel | null;
  enrollment: Enrollment | null;
  fieldOfStudy: string | null;
  gpa: number | null;
  gpaScale: GpaScale | null;
  expectedGraduation: string | null;
};

export type SavedEmail = {
  address: string;
  verified: boolean;
  primary: boolean;
};

export type ProfileRecord = {
  displayName: string | null;
  timezone: string;
  /** False until the student saves a zone. New deadlines keep using the device zone until then. */
  timezoneChosen: boolean;
  notificationPrefs: { email: boolean; inApp: true };
  countriesOfInterest: string[];
  citizenships: string[];
  currentLocation: string | null;
  residencyStatus: ResidencyStatus | null;
  /** Country of the school they attend now. Not a domestic-status flag by itself. */
  schoolCountry: string | null;
  /** Optional. Some awards have an age cutoff. A year is enough; we do not store a full date of birth. */
  birthYear: number | null;
  /** Optional free text, for awards that require a language of study. */
  studyLanguages: string | null;
  education: Education;
};

export type ProfilePatch = {
  displayName?: string | null;
  timezone?: string;
  notificationPrefs?: { email: boolean };
  countriesOfInterest?: string[];
  citizenships?: string[];
  currentLocation?: string | null;
  residencyStatus?: string | null;
  schoolCountry?: string | null;
  birthYear?: number | null;
  studyLanguages?: string | null;
  education?: {
    highestLevel?: string | null;
    enrollment?: string | null;
    fieldOfStudy?: string | null;
    gpa?: number | null;
    gpaScale?: string | null;
    expectedGraduation?: string | null;
  };
};

export const EMPTY_EDUCATION: Education = {
  highestLevel: null,
  enrollment: null,
  fieldOfStudy: null,
  gpa: null,
  gpaScale: null,
  expectedGraduation: null,
};

export function emptyProfileRecord(): ProfileRecord {
  return {
    displayName: null,
    timezone: 'UTC',
    timezoneChosen: false,
    notificationPrefs: { email: true, inApp: true },
    countriesOfInterest: [],
    citizenships: [],
    currentLocation: null,
    residencyStatus: null,
    schoolCountry: null,
    birthYear: null,
    studyLanguages: null,
    education: { ...EMPTY_EDUCATION },
  };
}

export function profileOptions() {
  return {
    countries: COUNTRIES,
    popularCountries: POPULAR_COUNTRIES,
    educationLevels: EDUCATION_LEVELS,
    enrollments: ENROLLMENTS,
    residencyStatuses: RESIDENCY_STATUSES,
    gpaScales: GPA_SCALES,
    limits: LIMITS,
  };
}

/** Lower-case mailbox, or null if it cannot be stored (bad shape, or a slash that cannot be a document id). */
export function normalizeEmail(value: string): string | null {
  const email = value.normalize('NFKC').trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (email.includes('/') || email.includes('\\')) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function idOf<T extends string>(list: readonly { id: T }[], value: string): T | null {
  return list.find((item) => item.id === value)?.id ?? null;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.normalize('NFKC').trim();
  return trimmed ? trimmed : null;
}

function countriesFrom(inputs: string[], max: number, label: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (inputs.length > max) return { ok: false, error: `You can save up to ${max} ${label}.` };
  const value: string[] = [];
  for (const raw of inputs) {
    const country = matchCountry(raw);
    if (!country) return { ok: false, error: `We don't have a country named "${String(raw).trim()}". Pick one from the list.` };
    if (!value.includes(country)) value.push(country);
  }
  return { ok: true, value };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? blankToNull(value) : null;
}

function readCountryList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const found: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const country = matchCountry(item);
    if (country && !found.includes(country)) found.push(country);
    if (found.length >= max) break;
  }
  return found;
}

/** Best-effort read of a stored profile. Unknown countries and enum values are dropped so a bad write cannot break the page. */
export function readProfileRecord(data: Record<string, unknown> | undefined): ProfileRecord {
  const base = emptyProfileRecord();
  if (!data) return base;
  const educationRaw = data.education;
  const education = educationRaw && typeof educationRaw === 'object' ? (educationRaw as Record<string, unknown>) : {};
  const prefsRaw = data.notificationPrefs;
  const prefs = prefsRaw && typeof prefsRaw === 'object' ? (prefsRaw as Record<string, unknown>) : {};
  const highest = readString(education.highestLevel);
  const enrollment = readString(education.enrollment);
  const scale = readString(education.gpaScale);
  const gpa = typeof education.gpa === 'number' && Number.isFinite(education.gpa) ? education.gpa : null;
  const graduation = readString(education.expectedGraduation);
  const birth = typeof data.birthYear === 'number' && Number.isInteger(data.birthYear) ? data.birthYear : null;
  const timezone = readString(data.timezone);
  return {
    displayName: readString(data.displayName),
    timezone: timezone && isTimeZone(timezone) ? timezone : 'UTC',
    timezoneChosen: data.timezoneChosen === true,
    notificationPrefs: { email: prefs.email !== false, inApp: true },
    countriesOfInterest: readCountryList(data.countriesOfInterest, LIMITS.maxCountriesOfInterest),
    citizenships: readCountryList(data.citizenships, LIMITS.maxCitizenships),
    currentLocation: typeof data.currentLocation === 'string' ? matchCountry(data.currentLocation) : null,
    residencyStatus: typeof data.residencyStatus === 'string' ? idOf(RESIDENCY_STATUSES, data.residencyStatus) : null,
    schoolCountry: typeof data.schoolCountry === 'string' ? matchCountry(data.schoolCountry) : null,
    birthYear: birth,
    studyLanguages: readString(data.studyLanguages)?.slice(0, 120) ?? null,
    education: {
      highestLevel: highest ? idOf(EDUCATION_LEVELS, highest) : null,
      enrollment: enrollment ? idOf(ENROLLMENTS, enrollment) : null,
      fieldOfStudy: readString(education.fieldOfStudy)?.slice(0, 120) ?? null,
      gpa,
      gpaScale: scale ? idOf(GPA_SCALES, scale) : null,
      expectedGraduation: graduation && /^\d{4}-(0[1-9]|1[0-2])$/.test(graduation) ? graduation : null,
    },
  };
}

export type PatchResult = { ok: true; value: ProfileRecord; changed: string[] } | { ok: false; error: string };

/**
 * Apply a profile edit onto the saved record.
 * Cross-field rules (GPA scale, residency, school country) live here so the route and the tests share them.
 */
export function applyProfilePatch(current: ProfileRecord, patch: ProfilePatch): PatchResult {
  const next: ProfileRecord = {
    ...current,
    notificationPrefs: { email: current.notificationPrefs.email, inApp: true },
    countriesOfInterest: [...current.countriesOfInterest],
    citizenships: [...current.citizenships],
    education: { ...current.education },
  };

  if (patch.displayName !== undefined) {
    const name = blankToNull(patch.displayName);
    if (name && name.length > 80) return { ok: false, error: 'Name must be 80 characters or fewer.' };
    next.displayName = name;
  }

  if (patch.timezone !== undefined) {
    const zone = patch.timezone.trim();
    if (!isTimeZone(zone)) return { ok: false, error: 'Unknown time zone. Use a name like America/New_York.' };
    next.timezone = zone;
    next.timezoneChosen = true;
  }

  if (patch.notificationPrefs) {
    next.notificationPrefs = { email: patch.notificationPrefs.email, inApp: true };
  }

  if (patch.countriesOfInterest) {
    const parsed = countriesFrom(patch.countriesOfInterest, LIMITS.maxCountriesOfInterest, 'countries');
    if (!parsed.ok) return parsed;
    next.countriesOfInterest = parsed.value;
  }

  if (patch.citizenships) {
    const parsed = countriesFrom(patch.citizenships, LIMITS.maxCitizenships, 'citizenships');
    if (!parsed.ok) return parsed;
    next.citizenships = parsed.value;
  }

  if (patch.currentLocation !== undefined) {
    if (patch.currentLocation == null || patch.currentLocation.trim() === '') {
      next.currentLocation = null;
    } else {
      const country = matchCountry(patch.currentLocation);
      if (!country) return { ok: false, error: `We don't have a country named "${patch.currentLocation.trim()}". Pick one from the list.` };
      next.currentLocation = country;
    }
  }

  if (patch.residencyStatus !== undefined) {
    if (patch.residencyStatus == null || patch.residencyStatus.trim() === '') {
      next.residencyStatus = null;
    } else {
      const status = idOf(RESIDENCY_STATUSES, patch.residencyStatus.trim());
      if (!status) return { ok: false, error: 'Choose a status from the list.' };
      next.residencyStatus = status;
    }
  }

  const locationChanged = patch.currentLocation !== undefined && next.currentLocation !== current.currentLocation;
  // Moving to a different country must not keep the old status (a citizen of Canada is not automatically a citizen of Germany).
  if (locationChanged && patch.residencyStatus === undefined) next.residencyStatus = null;

  if (next.currentLocation === null) {
    if (patch.residencyStatus && next.residencyStatus) {
      return { ok: false, error: 'Pick the country you live in before setting your status there.' };
    }
    next.residencyStatus = null;
  } else if (!next.residencyStatus && (patch.currentLocation !== undefined || patch.residencyStatus !== undefined)) {
    return { ok: false, error: 'Say whether you are a citizen, a permanent resident, or a visitor in the country where you live.' };
  }

  if (patch.schoolCountry !== undefined) {
    if (patch.schoolCountry == null || patch.schoolCountry.trim() === '') {
      next.schoolCountry = null;
    } else {
      const country = matchCountry(patch.schoolCountry);
      if (!country) return { ok: false, error: `We don't have a country named "${patch.schoolCountry.trim()}". Pick one from the list.` };
      next.schoolCountry = country;
    }
  }

  if (patch.birthYear !== undefined) {
    if (patch.birthYear == null) {
      next.birthYear = null;
    } else if (!Number.isInteger(patch.birthYear)) {
      return { ok: false, error: 'Birth year must be a whole number.' };
    } else {
      const maxYear = new Date().getFullYear() - 10;
      if (patch.birthYear < LIMITS.minBirthYear || patch.birthYear > maxYear) {
        return { ok: false, error: `Birth year should be between ${LIMITS.minBirthYear} and ${maxYear}.` };
      }
      next.birthYear = patch.birthYear;
    }
  }

  if (patch.studyLanguages !== undefined) {
    const languages = blankToNull(patch.studyLanguages);
    if (languages && languages.length > 120) return { ok: false, error: 'Languages must be 120 characters or fewer.' };
    next.studyLanguages = languages;
  }

  if (patch.education) {
    const education: Education = { ...next.education };
    const incoming = patch.education;
    if (incoming.highestLevel !== undefined) {
      const value = blankToNull(incoming.highestLevel);
      if (!value) education.highestLevel = null;
      else {
        const level = idOf(EDUCATION_LEVELS, value);
        if (!level) return { ok: false, error: 'Choose a level of education from the list.' };
        education.highestLevel = level;
      }
    }
    if (incoming.enrollment !== undefined) {
      const value = blankToNull(incoming.enrollment);
      if (!value) education.enrollment = null;
      else {
        const enrollment = idOf(ENROLLMENTS, value);
        if (!enrollment) return { ok: false, error: 'Choose your current enrollment from the list.' };
        education.enrollment = enrollment;
      }
    }
    if (incoming.fieldOfStudy !== undefined) {
      const field = blankToNull(incoming.fieldOfStudy);
      if (field && field.length < 2) return { ok: false, error: 'Enter a field of study, or leave it blank.' };
      if (field && field.length > 120) return { ok: false, error: 'Field of study must be 120 characters or fewer.' };
      education.fieldOfStudy = field;
    }
    if (incoming.gpa !== undefined) education.gpa = incoming.gpa;
    if (incoming.gpaScale !== undefined) {
      const scale = blankToNull(incoming.gpaScale);
      if (!scale) education.gpaScale = null;
      else {
        const parsed = idOf(GPA_SCALES, scale);
        if (!parsed) return { ok: false, error: 'Choose a GPA scale from the list.' };
        education.gpaScale = parsed;
      }
    }
    if (incoming.expectedGraduation !== undefined) {
      const month = blankToNull(incoming.expectedGraduation);
      if (!month) education.expectedGraduation = null;
      else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: 'Graduation month must look like 2027-05.' };
      else education.expectedGraduation = month;
    }
    if (education.gpa != null && !Number.isFinite(education.gpa)) return { ok: false, error: 'GPA must be a number.' };
    if ((education.gpa == null) !== (education.gpaScale == null)) {
      return { ok: false, error: 'Enter both your GPA and the scale it uses, or leave both blank.' };
    }
    if (education.gpa != null && education.gpaScale != null) {
      const rounded = Math.round(education.gpa * 100) / 100;
      if (rounded < 0 || rounded > Number(education.gpaScale) + 0.001) {
        return { ok: false, error: `GPA must be between 0 and ${education.gpaScale}.` };
      }
      education.gpa = rounded;
    }
    next.education = education;
  }

  const outOfSchool = next.education.enrollment === 'gap' || next.education.enrollment === 'graduated';
  if (outOfSchool) next.schoolCountry = null;

  const changed: string[] = [];
  const keys = [
    'displayName',
    'timezone',
    'timezoneChosen',
    'notificationPrefs',
    'countriesOfInterest',
    'citizenships',
    'currentLocation',
    'residencyStatus',
    'schoolCountry',
    'birthYear',
    'studyLanguages',
    'education',
  ] as const;
  for (const key of keys) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) changed.push(key);
  }
  return { ok: true, value: next, changed };
}

/**
 * Countries where this student counts as a domestic applicant.
 * Citizenship always counts. The country they live in counts only for citizens and permanent residents.
 */
export function domesticCountries(record: Pick<ProfileRecord, 'citizenships' | 'currentLocation' | 'residencyStatus'>): string[] {
  const found: string[] = [];
  const add = (country: string | null) => {
    if (country && !found.includes(country)) found.push(country);
  };
  for (const country of record.citizenships) add(country);
  if (
    record.currentLocation &&
    (record.residencyStatus === 'citizen' || record.residencyStatus === 'permanent_resident')
  ) {
    add(record.currentLocation);
  }
  return found;
}

export function schoolNote(record: Pick<ProfileRecord, 'citizenships' | 'currentLocation' | 'residencyStatus' | 'schoolCountry'>): string | null {
  if (!record.schoolCountry) return null;
  if (domesticCountries(record).includes(record.schoolCountry)) {
    return `Your current school is in ${record.schoolCountry}, where you count as a domestic student.`;
  }
  return `Your current school is in ${record.schoolCountry}. Awards there will usually treat you as an international applicant.`;
}

export function profileHints(record: ProfileRecord): string[] {
  const hints: string[] = [];
  if (
    record.currentLocation &&
    record.residencyStatus === 'citizen' &&
    !record.citizenships.includes(record.currentLocation)
  ) {
    hints.push(`${record.currentLocation} is not listed under your citizenships. Add it there if you are a citizen.`);
  }
  if (record.residencyStatus === 'student_visa' && record.currentLocation) {
    hints.push(`A student visa in ${record.currentLocation} does not make you a domestic applicant there.`);
  }
  if (record.residencyStatus === 'temporary' && record.currentLocation) {
    hints.push(`A temporary stay in ${record.currentLocation} does not make you a domestic applicant there.`);
  }
  return hints;
}

/** What is still missing before recommendations and domestic/international checks have enough to go on. */
export function missingForRecommendations(record: ProfileRecord): string[] {
  const missing: string[] = [];
  if (!domesticCountries(record).length) {
    missing.push('a citizenship, or permanent residence in the country where you live');
  }
  if (!record.currentLocation) missing.push('the country you live in now');
  if (!record.education.highestLevel) missing.push('your highest level of education');
  if (!record.education.enrollment) missing.push('whether you are in school');
  if (!record.education.fieldOfStudy) missing.push('your field of study');
  if (record.education.gpa == null) missing.push('your GPA');
  if (!record.countriesOfInterest.length) missing.push('countries where you want to find scholarships');
  const inSchool =
    record.education.enrollment === 'secondary' ||
    record.education.enrollment === 'undergraduate' ||
    record.education.enrollment === 'graduate';
  if (inSchool && !record.schoolCountry) missing.push('the country of your current school');
  return missing;
}

/** 0–100. Optional fields (birth year, languages, graduation month, name) are not required to reach 100. */
export function readinessPercent(record: ProfileRecord): number {
  let score = 0;
  if (domesticCountries(record).length) score += 20;
  if (record.currentLocation && record.residencyStatus) score += 15;
  if (record.education.highestLevel) score += 15;
  if (record.education.enrollment) score += 10;
  if (record.education.fieldOfStudy) score += 10;
  if (record.education.gpa != null && record.education.gpaScale) score += 10;
  if (record.countriesOfInterest.length) score += 15;
  const inSchool =
    record.education.enrollment === 'secondary' ||
    record.education.enrollment === 'undergraduate' ||
    record.education.enrollment === 'graduate';
  const outOfSchool = record.education.enrollment === 'gap' || record.education.enrollment === 'graduated';
  if ((inSchool && record.schoolCountry) || outOfSchool) score += 5;
  return score;
}

export function removalBlock(emails: SavedEmail[], address: string): string | null {
  const target = emails.find((email) => email.address === address);
  if (!target) return 'That email is not on your profile.';
  if (emails.length <= 1) return 'Keep at least one email on your account.';
  if (target.primary) return 'Choose another primary email before removing this one.';
  return null;
}

export function primaryBlock(emails: SavedEmail[], address: string): string | null {
  const target = emails.find((email) => email.address === address);
  if (!target) return 'Add and confirm that email first.';
  if (!target.verified) return 'Confirm that email before making it your primary.';
  if (target.primary) return 'That email is already your primary.';
  return null;
}
