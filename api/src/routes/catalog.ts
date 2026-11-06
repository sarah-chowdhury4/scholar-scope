import { Router } from 'express';
import { z } from 'zod';
import {
  CATALOG_TAGS,
  addFromCatalog,
  filterCatalog,
  getAppConfig,
  loadCatalog,
  userDoc,
  writeAudit,
} from '@scholarscope/shared';

/** Discover page: browse, search and filter the scholarship catalog, and add one to "My scholarships". */
export const catalogRouter = Router();

const tagList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : []))
  .pipe(z.array(z.enum(CATALOG_TAGS)));

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  deadline: z.enum(['upcoming', '30', '90', 'all']).default('upcoming'),
  gpa: z.coerce.number().min(0).max(5).optional(),
  requires: tagList,
  excludes: tagList,
  organization: z.string().trim().max(200).optional(),
  sort: z.enum(['deadline', 'name', 'gpa']).default('deadline'),
});

catalogRouter.get('/', async (req, res) => {
  const query = catalogQuerySchema.parse(req.query);
  const [all, mine] = await Promise.all([
    loadCatalog(),
    userDoc(req.uid!).collection('scholarships').where('catalogId', '!=', null).get(),
  ]);
  const added = new Map(
    mine.docs.filter((d) => d.get('status') !== 'archived').map((d) => [d.get('catalogId') as string, d.id]),
  );
  const today = new Date().toISOString().slice(0, 10);
  const items = filterCatalog(all, query, today).map((e) => ({
    ...e,
    deadlinePassed: e.deadline !== null && e.deadline < today,
    addedScholarshipId: added.get(e.catalogId) ?? null,
  }));
  res.json({
    items,
    total: all.length,
    organizations: [...new Set(all.map((e) => e.organization).filter(Boolean))].sort(),
    tags: CATALOG_TAGS,
  });
});

catalogRouter.post('/:catalogId/add', async (req, res) => {
  const catalogId = z.string().regex(/^SCH-\d{3}$/).parse(req.params.catalogId);
  const { maxScholarshipsPerStudent } = await getAppConfig();
  const result = await addFromCatalog(req.uid!, catalogId, maxScholarshipsPerStudent);

  switch (result.status) {
    case 'not_found':
      return res.status(404).json({ error: 'That scholarship is no longer in the catalog.' });
    case 'limit_reached':
      return res.status(409).json({ error: `You can track up to ${result.limit} scholarships. Archive one to add another.`, code: 'limit_reached' });
    case 'already_added':
      return res.status(200).json({ scholarshipId: result.scholarshipId, alreadyAdded: true });
    case 'added':
      await writeAudit({
        actor: { type: 'student', id: req.uid! },
        subjectUid: req.uid!,
        action: 'scholarship.added_from_catalog',
        resource: `users/${req.uid}/scholarships/${result.scholarshipId}`,
        after: { catalogId },
      });
      return res.status(201).json({ scholarshipId: result.scholarshipId, alreadyAdded: false });
  }
});
