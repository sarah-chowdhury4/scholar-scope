import { z } from 'zod';
import { SCHOLARSHIP_STATUSES } from '@scholarscope/shared';

const httpsOrHttpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'Must start with http:// or https://');

export const createScholarshipSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(200),
  url: httpsOrHttpUrl.nullable().optional(),
  awardAmount: z
    .object({ amount: z.number().nonnegative().max(10_000_000), currency: z.string().length(3).toUpperCase() })
    .nullable()
    .optional(),
  /** A deadline typed by the student is stored as "unverified" until a source confirms it. */
  deadline: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      timezone: z.string().min(1).max(64).default('UTC'),
    })
    .nullable()
    .optional(),
  catalogId: z.string().regex(/^SCH-\d{3}$/).nullable().optional(),
});

export const updateScholarshipSchema = createScholarshipSchema.partial().extend({
  status: z.enum(SCHOLARSHIP_STATUSES).exclude(['archived']).optional(),
});

export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const;

export const createUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.number().int().positive(),
  /** Scholarship guidelines (a source) or a library item (a material). */
  purpose: z.enum(['source', 'material']),
  scholarshipId: z.string().min(1).max(128).optional(),
  /** Set for a student's own application file (transcript, passport, and so on). */
  documentType: z
    .enum(['transcript', 'school_certificate', 'university_certificate', 'passport', 'birth_certificate', 'other'])
    .optional(),
  title: z.string().trim().max(120, 'The name must be 120 characters or fewer.').optional(),
});

export const documentLinksSchema = z
  .object({
    scholarshipIds: z.array(z.string().min(1).max(128)).max(15, 'A document can be shown on up to 15 scholarships.'),
  })
  .strict();

export const addUrlSourceSchema = z.object({
  scholarshipId: z.string().min(1).max(128),
  url: httpsOrHttpUrl,
});

export const consentSchema = z.object({ version: z.string().min(1).max(32) });

export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().max(80, 'Name must be 80 characters or fewer.').nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    notificationPrefs: z.object({ email: z.boolean() }).optional(),
    countriesOfInterest: z.array(z.string()).max(15, 'You can save up to 15 countries.').optional(),
    citizenships: z.array(z.string()).max(4, 'You can save up to 4 citizenships.').optional(),
    currentLocation: z.string().nullable().optional(),
    residencyStatus: z.string().nullable().optional(),
    schoolCountry: z.string().nullable().optional(),
    birthYear: z.number().int().nullable().optional(),
    studyLanguages: z.string().max(120, 'Languages must be 120 characters or fewer.').nullable().optional(),
    education: z
      .object({
        highestLevel: z.string().nullable().optional(),
        enrollment: z.string().nullable().optional(),
        fieldOfStudy: z.string().nullable().optional(),
        gpa: z.number().nullable().optional(),
        gpaScale: z.string().nullable().optional(),
        expectedGraduation: z.string().nullable().optional(),
      })
      .optional(),
  })
  .strict();

export const emailAddressSchema = z.object({ address: z.string().trim().min(1, 'Enter a valid email address.') }).strict();

export const changeEmailSchema = z
  .object({
    currentAddress: z.string().trim().min(1, 'Enter a valid email address.'),
    newAddress: z.string().trim().min(1, 'Enter a valid email address.'),
    currentPassword: z.string().optional(),
  })
  .strict();

export const verifyEmailSchema = z.object({ code: z.string().trim() }).strict();

export const primaryEmailSchema = z
  .object({
    address: z.string().trim().min(1, 'Enter a valid email address.'),
    currentPassword: z.string(),
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z
      .string()
      .min(12, 'Use a password with at least 12 characters.')
      .max(128, 'That password is too long.'),
  })
  .strict();

export const deleteAccountSchema = z.object({ currentPassword: z.string() }).strict();

export const passwordResetRequestSchema = z
  .object({ email: z.string().trim().min(1, 'Enter a valid email address.').max(254) })
  .strict();

export const passwordResetConfirmSchema = z
  .object({
    email: z.string().trim().min(1, 'Enter a valid email address.').max(254),
    code: z.string().trim(),
    newPassword: z
      .string()
      .min(12, 'Use a password with at least 12 characters.')
      .max(128, 'That password is too long.'),
  })
  .strict();

/** Keep only safe characters in object keys. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'file';
}
