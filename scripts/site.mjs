#!/usr/bin/env node
// Start or stop the whole local ScholarScope site with one command.
//
//   npm start   Starts Docker if needed, then every service (web app included), and waits until the site answers.
//   npm stop    Saves the accounts and data first, then stops every service. Nothing is deleted.
//
// Works on Windows, macOS and Linux. Uses only Node's standard library.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPOSE = ['compose', '--profile', 'web'];
const SITE = 'http://localhost:4200';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function say(text) {
  console.log(`\n▸ ${text}`);
}

function fail(text) {
  console.error(`\n✕ ${text}`);
  process.exit(1);
}

/** Run docker with output shown live; resolves to the exit code. */
function docker(args) {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function dockerQuiet(args) {
  const r = spawnSync('docker', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const engineRunning = () => dockerQuiet(['info', '--format', '{{.ServerVersion}}']).ok;

function launchDockerDesktop() {
  if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
    ];
    const exe = candidates.find((p) => existsSync(p));
    if (!exe) return false;
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  return false; // Linux: Docker Engine runs as a system service.
}

async function waitFor(check, seconds, label) {
  const until = Date.now() + seconds * 1000;
  let dots = 0;
  while (Date.now() < until) {
    if (await check()) {
      if (dots) process.stdout.write('\n');
      return true;
    }
    process.stdout.write(dots++ ? '.' : `  waiting for ${label} `);
    await sleep(3000);
  }
  if (dots) process.stdout.write('\n');
  return false;
}

async function answers(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function start() {
  if (!engineRunning()) {
    say('Docker is not running. Starting Docker Desktop…');
    if (!launchDockerDesktop()) fail('Start Docker (Docker Desktop, or the docker service on Linux), then run npm start again.');
    if (!(await waitFor(async () => engineRunning(), 180, 'Docker'))) fail('Docker did not start within 3 minutes. Open Docker Desktop, then run npm start again.');
  }

  say('Starting ScholarScope (accounts and data from the last stop are loaded)…');
  if ((await docker([...COMPOSE, 'up', '-d'])) !== 0) fail('docker compose could not start the services. The messages above say why.');

  say('Waiting for the site to answer (the web app takes about a minute on a fresh start)…');
  const apiUp = await waitFor(() => answers('http://localhost:3000/api/health'), 180, 'the API');
  const webUp = await waitFor(() => answers(SITE), 300, 'the web app');
  if (!apiUp || !webUp) fail(`Not answering yet. Check: docker compose ${apiUp ? '--profile web logs web' : 'logs api'}`);

  console.log(`
✓ ScholarScope is running.

  Site                       ${SITE}
  Test inbox (emails)        http://localhost:8025
  Firebase emulator          http://localhost:4000
  Sample scholarship site    http://sample-scholarship.localhost:8088

  Stop it with: npm stop   (saves accounts and data first)
`);
}

async function stop() {
  if (!engineRunning()) {
    console.log('Docker is not running, so ScholarScope is already stopped.');
    return;
  }
  const running = dockerQuiet([...COMPOSE, 'ps', '--status', 'running', '--services']).out.split(/\r?\n/).filter(Boolean);
  if (running.length === 0) {
    console.log('ScholarScope is already stopped.');
    return;
  }

  if (running.includes('firebase')) {
    // Save first, explicitly: the emulator also saves when it is stopped, but only if it gets the time to.
    say('Saving accounts and data…');
    const code = await docker([...COMPOSE, 'exec', '-T', 'firebase', 'firebase', 'emulators:export', '/data/export', '--project', 'demo-scholarscope', '--force']);
    if (code !== 0) {
      fail('Saving the data failed, so nothing was stopped (stopping now could lose accounts). The messages above say why; run npm stop again once it is fixed.');
    }
  }

  say('Stopping every service…');
  if ((await docker([...COMPOSE, 'stop'])) !== 0) fail('docker compose could not stop every service. The messages above say why.');
  console.log('\n✓ ScholarScope is stopped. Your accounts and data are saved; npm start brings them back.\n');
}

const command = process.argv[2];
if (command === 'start') await start();
else if (command === 'stop') await stop();
else fail('Use: node scripts/site.mjs start | stop   (or npm start / npm stop)');
