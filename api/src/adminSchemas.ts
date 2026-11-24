import { z } from 'zod';

/** A scholarship as an admin enters it. The ID is chosen by the server for new entries. */
export const adminCatalogEntrySchema = z
  .object({
    name: z.string().trim().min(2, 'Give the scholarship a name.').max(200),
    organization: z.string().trim().min(2, 'Give the provider.').max(200),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-01-15.')
      .nullable(),
    minGpa: z.number().min(0).max(5).nullable(),
    promptOrMaterials: z.string().trim().max(4000),
    sourceUrl: z
      .string()
      .trim()
      .url('Use a full web address starting with https://')
      .refine((u) => /^https?:\/\//i.test(u), 'Use a web address starting with https://')
      .nullable(),
    verified: z.boolean(),
  })
  .refine((e) => !e.verified || e.sourceUrl, { message: 'A verified scholarship needs its official page.', path: ['sourceUrl'] });

export type AdminCatalogEntryInput = z.infer<typeof adminCatalogEntrySchema>;

export const catalogIdSchema = z.string().regex(/^SCH-\d{3}$/, 'Unknown scholarship ID.');

/** The settings an admin may change. Upload sizes stay in code: the storage and scanning limits depend on them. */
export const adminSettingsSchema = z
  .object({
    aiEnabled: z.boolean(),
    aiPausedReason: z.string().trim().max(200).nullable(),
    maxScholarshipsPerStudent: z.number().int().min(1).max(100),
    dailyDraftLimit: z.number().int().min(0).max(200),
    dailyPageLimit: z.number().int().min(0).max(1000),
    alertOffsetsDays: z
      .array(z.number().int().min(1).max(60))
      .min(1, 'Keep at least one reminder.')
      .max(6, 'Six reminders at most.')
      .refine((list) => new Set(list).size === list.length, 'Each reminder day only once.'),
  })
  .partial();

export const adminRoleSchema = z.object({ admin: z.boolean() });

/** The admin types the student's email to confirm a deletion, so a mis-click can't erase an account. */
export const adminDeleteSchema = z.object({ confirmEmail: z.string().trim().min(3) });

export const auditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
