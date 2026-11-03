/**
 * Object storage behind one interface.
 *   STORAGE_BACKEND=s3  -> MinIO locally (or any S3-compatible store)
 *   STORAGE_BACKEND=gcs -> Google Cloud Storage (to be implemented when deploying)
 * The rest of the code never imports a storage SDK directly.
 */
export interface Storage {
  /** Short-lived URL the browser PUTs a file to. Only the uploads (quarantine) bucket. */
  uploadUrl(key: string, contentType: string): Promise<string>;
  /** Short-lived URL to view a stored file (one-click source, FR-4.1). */
  viewUrl(bucket: string, key: string, versionId?: string): Promise<string>;
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<{ versionId?: string }>;
  get(bucket: string, key: string, versionId?: string): Promise<Buffer>;
  head(bucket: string, key: string): Promise<{ size: number; contentType?: string } | null>;
  /** Delete every object and version under a prefix. Only the deleter's credentials allow this. */
  deletePrefix(bucket: string, prefix: string): Promise<number>;
}

export const buckets = {
  uploads: () => process.env.BUCKET_UPLOADS || 'uploads',
  originals: () => process.env.BUCKET_ORIGINALS || 'originals',
  exports: () => process.env.BUCKET_EXPORTS || 'exports',
};

let instance: Promise<Storage> | undefined;

export function storage(): Promise<Storage> {
  instance ??= (async () => {
    switch (process.env.STORAGE_BACKEND) {
      case 's3':
        return (await import('./s3')).createS3Storage();
      case 'gcs':
        return (await import('./gcs')).createGcsStorage();
      default:
        throw new Error('STORAGE_BACKEND must be "s3" or "gcs"');
    }
  })();
  return instance;
}
