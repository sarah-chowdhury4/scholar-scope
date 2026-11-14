/**
 * API keys, read by the WORKER only. The API and the browser never receive them.
 *   SECRETS_BACKEND=aws -> LocalStack Secrets Manager locally (loaded from .env.secrets)
 *   SECRETS_BACKEND=env -> plain env vars injected by Cloud Run `--set-secrets` (Secret Manager)
 */
export type SecretName = 'gemini-api-key' | 'nvidia-api-key' | 'brevo-api-key';

const cache = new Map<SecretName, string>();

export async function getSecret(name: SecretName): Promise<string> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  let value: string;
  switch (process.env.SECRETS_BACKEND) {
    case 'aws':
      value = await (await import('./aws')).readAwsSecret(`scholarscope/${name}`);
      break;
    case 'env':
      value = process.env[name.toUpperCase().replace(/-/g, '_')] ?? '';
      break;
    default:
      throw new Error('SECRETS_BACKEND must be "aws" or "env"');
  }
  cache.set(name, value);
  return value;
}
