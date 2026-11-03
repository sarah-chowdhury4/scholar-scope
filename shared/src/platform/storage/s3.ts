import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireEnv } from '../../env';
import { buckets, type Storage } from './index';

export function createS3Storage(): Storage {
  const credentials = {
    accessKeyId: requireEnv('S3_ACCESS_KEY'),
    secretAccessKey: requireEnv('S3_SECRET_KEY'),
  };
  const base = { region: process.env.AWS_REGION || 'us-east-1', forcePathStyle: true, credentials };
  const s3 = new S3Client({ ...base, endpoint: process.env.S3_ENDPOINT });
  // Presigned URLs are signed for a specific host: use the one the BROWSER reaches (localhost:9000),
  // not the Docker-internal one (minio:9000), or the signature check fails.
  const signer = new S3Client({ ...base, endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT });

  return {
    uploadUrl: (key, contentType) =>
      getSignedUrl(signer, new PutObjectCommand({ Bucket: buckets.uploads(), Key: key, ContentType: contentType }), {
        expiresIn: 600,
      }),

    viewUrl: (bucket, key, versionId) =>
      getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }), {
        expiresIn: 300,
      }),

    async put(bucket, key, body, contentType) {
      const r = await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      return { versionId: r.VersionId };
    },

    async get(bucket, key, versionId) {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
      if (!r.Body) throw new Error(`Empty object ${bucket}/${key}`);
      return Buffer.from(await r.Body.transformToByteArray());
    },

    async head(bucket, key) {
      try {
        const r = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: r.ContentLength ?? 0, contentType: r.ContentType };
      } catch (err) {
        if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
        throw err;
      }
    },

    async deletePrefix(bucket, prefix) {
      let deleted = 0;
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }),
        );
        const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
          .filter((v) => v.Key)
          .map((v) => ({ Key: v.Key!, VersionId: v.VersionId }));
        if (objects.length > 0) {
          await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
          deleted += objects.length;
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
      } while (keyMarker);
      return deleted;
    },
  };
}
