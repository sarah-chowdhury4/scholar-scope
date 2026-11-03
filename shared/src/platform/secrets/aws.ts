import {
  SecretsManagerClient,
  GetSecretValueCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

/** Returns '' when the secret was never set (e.g. optional Brevo key). Never log the value. */
export async function readAwsSecret(id: string): Promise<string> {
  try {
    const r = await client.send(new GetSecretValueCommand({ SecretId: id }));
    return r.SecretString ?? '';
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return '';
    throw err;
  }
}
