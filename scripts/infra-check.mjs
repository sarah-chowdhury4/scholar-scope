#!/usr/bin/env node
// Check the Terraform in infra/terraform without a Google Cloud account and without creating anything.
//
//   npm run infra:check         terraform fmt (check) + validate, tfsec, checkov, and infracost if a key is set
//   npm run infra:check -- --fix   rewrite the files with terraform fmt first
//
// Every tool runs in Docker (pinned versions), so nothing needs installing. infracost needs a free API key
// (`infracost auth login`, or INFRACOST_API_KEY in your environment); without one the cost step is skipped.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = '/repo/infra/terraform';
const IMAGES = {
  terraform: 'hashicorp/terraform:1.9.8',
  tfsec: 'aquasec/tfsec:v1.28.13',
  checkov: 'bridgecrew/checkov:3.2.334',
  infracost: 'infracost/infracost:ci-0.10',
};
const fix = process.argv.includes('--fix');
const results = [];

// Through the shell, like scripts/site.mjs: on Windows docker is often only found that way.
// Arguments are quoted, since the repo path can contain spaces.
function docker(args, stdio = 'inherit') {
  const quoted = args.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`));
  return spawnSync('docker', quoted, { stdio, shell: true });
}

function run(name, image, args, env = {}) {
  console.log(`\n▸ ${name}`);
  // Only the variable's name is passed: docker copies its value from this environment, so it never shows in a command line.
  const envArgs = Object.keys(env).flatMap((k) => ['-e', k]);
  const r = docker(['run', '--rm', '-v', `${ROOT}:/repo`, '-w', DIR, ...envArgs, '--entrypoint', '', image, ...args]);
  const ok = r.status === 0;
  results.push({ name, ok });
  return ok;
}

if (docker(['version'], 'ignore').status !== 0) {
  console.error('✕ Docker is not running. Start Docker Desktop (or run npm start), then try again.');
  process.exit(1);
}

const tf = IMAGES.terraform;
if (fix) run('terraform fmt (rewrite)', tf, ['terraform', 'fmt', '-recursive']);
run('terraform fmt -check', tf, ['terraform', 'fmt', '-check', '-recursive', '-diff']);
if (run('terraform init -backend=false', tf, ['terraform', 'init', '-backend=false', '-input=false', '-no-color'])) {
  run('terraform validate', tf, ['terraform', 'validate', '-no-color']);
}
run('tfsec (security)', IMAGES.tfsec, ['tfsec', '.', '--no-color', '--concise-output']);
run('checkov (security)', IMAGES.checkov, ['checkov', '-d', '.', '--framework', 'terraform', '--compact', '--quiet']);

const key = process.env.INFRACOST_API_KEY;
if (key) {
  run('infracost (monthly cost estimate)', IMAGES.infracost, [
    'infracost', 'breakdown', '--path', '.',
    '--terraform-var-file', 'terraform.tfvars.example',
    '--usage-file', 'infracost-usage.yml',
    '--show-skipped',
  ], { INFRACOST_API_KEY: key });
} else {
  console.log('\n▸ infracost skipped: set INFRACOST_API_KEY (free key from `infracost auth login` or infracost.io) to see costs.');
}

console.log('\nSummary');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✕'} ${r.name}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
