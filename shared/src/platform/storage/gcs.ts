import type { Storage } from './index';

/**
 * Google Cloud Storage implementation — TODO when deploying to Google Cloud.
 * Use @google-cloud/storage:
 *   uploadUrl  -> file.getSignedUrl({ version: 'v4', action: 'write', contentType, expires,
 *                 extensionHeaders: { 'x-goog-content-length-range': '0,26214400' } })
 *   versionId  -> the object's `generation`
 *   deletePrefix -> bucket.getFiles({ prefix, versions: true }) then file.delete() per generation
 */
export function createGcsStorage(): Storage {
  throw new Error('GCS storage is not implemented yet. Use STORAGE_BACKEND=s3 locally.');
}
