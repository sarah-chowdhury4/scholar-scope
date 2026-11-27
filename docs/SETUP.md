# ScholarScope local setup

The full guide to running ScholarScope on your own computer with Docker. You don't need a cloud account or a payment method. For what ScholarScope is and how it works, see the [README](../README.md).

## Contents

1. [Before you start](#before-you-start)
2. [Get started (about 30–45 minutes the first time)](#get-started)
3. [Local URLs](#local-urls)
4. [Everyday commands](#everyday-commands)
5. [Tests](#tests)
6. [Troubleshooting](#troubleshooting)
7. [Contributing](#contributing)

---

## Before you start

You need Docker (with Compose v2), Node.js **22.22.3 or newer** (Angular 22 refuses older 22.x) and Git. Docker needs **at least 6 GB RAM**; ClamAV alone uses about 1.5 GB.

| | Windows 10/11 | macOS (Intel or Apple Silicon) | Linux (Ubuntu, Debian, Fedora…) |
|---|---|---|---|
| Docker | Docker Desktop with the **WSL 2** engine | Docker Desktop (OrbStack or Colima also work) | Docker Engine + the `docker compose` plugin |
| Docker memory | Settings → Resources (or WSL default: half your RAM) | Settings → Resources → Memory ≥ 6 GB | uses system RAM directly |
| Node.js 22 | Installer from nodejs.org | `nvm install 22` ([nvm](https://github.com/nvm-sh/nvm)) or `brew install node@22` | `nvm install 22` ([nvm](https://github.com/nvm-sh/nvm)) |
| Git | git-scm.com | `xcode-select --install` or `brew install git` | `sudo apt install git` / `sudo dnf install git` |
| Terminal | **PowerShell** (not Command Prompt) | Terminal (zsh) | any shell (bash) |

**Linux only:** let your user run Docker without `sudo`: `sudo usermod -aG docker $USER`, then log out and back in.

Check the installs (same on every system):

```bash
docker info              # prints a "Server" section with no errors
docker compose version   # v2.x or newer
node -v                  # v22.22.3 or newer
git --version
```

Windows only: `wsl -l -v` should list `docker-desktop` with VERSION 2.

Code blocks below are labelled **PowerShell** (Windows) or **bash** (macOS/Linux). Unlabelled `docker …` commands are the same everywhere. Run each command as **one line**, even if your screen wraps it.

---

## Get started

All commands run from the repository root unless a step says otherwise.

### 1. Clone

```bash
git clone https://github.com/sarah-chowdhury4/scholar-scope.git
cd scholar-scope
```

(Same command in PowerShell.)

### 2. Get the free keys (no card needed)

| Key | Where | Goes in |
|---|---|---|
| LocalStack auth token | app.localstack.cloud → *Auth Token* (free account) | `.env` → `LOCALSTACK_AUTH_TOKEN` |
| Gemini API key | aistudio.google.com → *Get API key* | `.env.secrets` → `GEMINI_API_KEY` |
| Gemini model id | AI Studio → model list (exact id of the current Flash model) | `.env` → `GEMINI_MODEL` |
| Gmail app password (optional: real emails) | Google Account → Security → *App passwords* (needs 2-Step Verification). Without it, every email goes to Mailpit. Brevo also works; see *Send real emails* | `.env.secrets` → `SMTP_PASSWORD`, `.env` → `SMTP_USER` |
| Jina Reader key (optional) | jina.ai → *Get API key*. Without one, saved pages are still read at 20 requests a minute | `.env.secrets` → `JINA_API_KEY` |
| NVIDIA NIM key (optional; required for `AI_PROVIDER=nim` or `auto`) | build.nvidia.com → *Get API Key*. No key? Set `NIM_ENABLED=false` in `.env` and NIM calls run on Gemini | `.env.secrets` → `NVIDIA_API_KEY` |

> **Synthetic documents only.** Free-tier AI inputs may be kept or used by the provider. Never upload real student records to a local setup.

Keep keys in a password manager, never in chat, screenshots or recordings.

### 3. Create your settings files

**PowerShell**

```powershell
Copy-Item .env.example .env
Copy-Item local\localstack\secrets.env.example .env.secrets
```

**bash**

```bash
cp .env.example .env
cp local/localstack/secrets.env.example .env.secrets
chmod 600 .env .env.secrets
```

Fill the four MinIO secrets with random **hex** values. Hex matters: a value starting with `-` breaks the MinIO setup. These commands fill only those four lines:

**PowerShell**

```powershell
$keys = 'MINIO_ROOT_PASSWORD','MINIO_API_SECRET_KEY','MINIO_WORKER_SECRET_KEY','MINIO_DELETER_SECRET_KEY'
$c = Get-Content .env
foreach ($k in $keys) {
  $v = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
  $c = $c -replace "^$k=.*$", "$k=$v"
}
Set-Content .env $c -Encoding ascii
```

**bash** (works with both macOS and GNU `sed`)

```bash
for k in MINIO_ROOT_PASSWORD MINIO_API_SECRET_KEY MINIO_WORKER_SECRET_KEY MINIO_DELETER_SECRET_KEY; do
  v=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  sed -i.bak "s/^$k=.*/$k=$v/" .env
done
rm .env.bak
```

Then open `.env` and set `LOCALSTACK_AUTH_TOKEN` and `GEMINI_MODEL`; open `.env.secrets` and set `GEMINI_API_KEY`. If you have an NVIDIA key, set `NVIDIA_API_KEY` too; if not, set `NIM_ENABLED=false` in `.env` so the NIM jobs run on Gemini. Use any text editor: `notepad .env` (Windows), `open -e .env` (macOS) or `nano .env` (Linux).

**Choose the AI.** `AI_PROVIDER` in `.env` picks which AI reads requirements, checks documents, summarises changes and drafts essays:

| Value | What it does |
|---|---|
| `gemini` (default) | Gemini only. Needs `GEMINI_API_KEY`. |
| `nim` | NVIDIA NIM only. Needs `NVIDIA_API_KEY`; Gemini is not called. The search for a scholarship's official pages uses Google Search through Gemini, so it is skipped. |
| `auto` | Gemini first; when it is busy or out of its free quota, NIM answers instead. Needs both keys. |

Each AI result records the model that produced it. After changing the value, run `docker compose up -d worker`.

Both files are git-ignored. If this is a fresh copy rather than a clone, run `git init -b main` first, then confirm with `git status` that neither file is listed.

### 4. Check the image versions

`.env.example` already pins the images the team has tested:

- **MinIO:** MinIO's own images are gone (deleted from Docker Hub, private on quay.io), so this project uses **Chainguard's free MinIO build** (`cgr.dev/chainguard/minio`, `-dev` variant). It includes `mc`, so the same digest goes in both `MINIO_IMAGE` and `MC_IMAGE`.
- **LocalStack:** `localstack/localstack`, which needs your auth token from step 2.

Check that everything is filled in. This prints nothing when the config is valid:

```bash
docker compose config -q
```

To move to newer images later, pull them, then copy the printed `name@sha256:…` into `.env.example` for everyone:

```bash
docker pull cgr.dev/chainguard/minio:latest-dev
docker image inspect cgr.dev/chainguard/minio:latest-dev --format "{{index .RepoDigests 0}}"
docker pull localstack/localstack:latest
docker image inspect localstack/localstack:latest --format "{{index .RepoDigests 0}}"
```

### 5. Start the infrastructure

```bash
docker compose up -d --build firebase minio minio-init localstack clamav mailpit
docker compose ps
```

The first start takes several minutes: the Firebase image downloads the emulators, and ClamAV downloads virus signatures.

**Done when:** `docker compose ps` shows `firebase`, `minio`, `localstack`, `clamav` and `mailpit` as **healthy** (`minio-init` runs once and exits), and

```bash
docker compose logs --tail 20 minio-init localstack
```

contains `MinIO ready: …` and `LocalStack ready: 3 queues + DLQs, secrets loaded.`

### 6. Check each service

| Check | How | Expected |
|---|---|---|
| Firebase | open http://localhost:4000 | Emulator UI with Firestore and Authentication |
| MinIO | open http://localhost:9001, log in with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env` | buckets `uploads`, `originals`, `exports` |
| Queues | `docker compose exec localstack awslocal sqs list-queues` | six queues (`gemini`, `nim`, `default`, each with a `-dlq`) |
| Secrets (names only) | `docker compose exec localstack awslocal secretsmanager list-secrets --query "SecretList[].Name"` | `scholarscope/gemini-api-key` (+ `nvidia-api-key` if set) |
| Mailpit | open http://localhost:8025 | empty inbox |

The `awslocal is deprecated` banner is harmless.

### 7. Run the storage permission tests

```bash
docker compose run --rm --entrypoint /bin/sh minio-init /init/test-permissions.sh
```

**Done when:** every line says `PASS` and the last line is `All storage permission tests passed.`

### 8. Start the API and worker

```bash
docker compose up -d --build api worker
docker compose logs --tail 20 api worker
```

**Done when:** the logs show `api_started`, `worker_started` and three `queue_consumer_started` lines, and http://localhost:3000/api/health returns `{"status":"ok"}`.

### 9. Load the scholarship catalog

The **Discover** page lists the scholarships in the catalog. The team dataset (15 scholarships) is in `Dataset/ScholarScope Updated Dataset.csv`; load it with:

```bash
docker compose exec api npm run seed:catalog
```

`npm start` runs it for you on every start. Run it again after the dataset changes: rows are matched by `Scholarship ID`, so it updates them instead of adding copies, and scholarships no longer in the file are removed from Discover (students who already added one keep their copy). To load another export instead, put it in `api/seed/` (columns as in `api/seed/dataset.example.csv`, or the dataset sheet's headers; dates as `YYYY-MM-DD`) and run `… seed:catalog -- seed/<file>.csv`.

**Done when:** it prints `Catalog: 15 scholarships saved.`

### 10. Start the web app

In a second terminal window, from the repository root:

```bash
cd web
npm ci
npm start
```

(Same commands in PowerShell.)

Open http://localhost:4200. You should see the sign-in page. Choose **Create an account** (any email, 12+ character password). A new account starts with an **empty dashboard** with two buttons: **Discover scholarships** and **Add one that isn't listed**.

### 11. Try the full flow

1. Open **Discover** (top menu). Search (e.g. `leadership`), filter by deadline, your GPA, provider or what the application asks for (essay, video, recommendation…), then **Add to my scholarships**. The button changes to **Added · open**.
2. Back on **My scholarships**, choose **Add your own** and add a scholarship that isn't listed, with a deadline **7 days from today**. It shows an **Unverified** badge, because you typed it and there's no source yet.
3. Trigger the deadline alert now: `docker compose exec worker npm run cron:deadline-alerts`. The email appears at http://localhost:8025.
4. Save this as `example-guidelines.txt` and upload it on the scholarship's page:

   ```text
   Example Award 2027 — Application Guidelines
   Applications close on December 1, 2026 at 11:59 PM Eastern Time.
   Essay: In 500 words or fewer, describe a challenge you have overcome.
   Applicants must have a minimum GPA of 3.0.
   Submit one recommendation letter from a teacher.
   ```

5. Each requirement now shows its quoted sentence and a **From source** / **Needs review** badge. **Open source** opens the stored file.
6. On a requirement, try **Looks right**, **Fix** (saved as a new version) and **Not a requirement**; tick the box when it's done. **History** lists every version.
7. Paste a page address under **Or paste the scholarship's web page**. Run `docker compose exec worker npm run cron:recheck` after the page changes: the scholarship shows **What changed** with the old and new wording side by side, and **Alerts** in the top menu gets a new item.
8. In **Documents**, upload a synthetic transcript or passport. After the virus scan, the AI check lists what it found (wrong kind of file, name differs from your profile, passport expiry). The scholarship page adds checks against its deadline and minimum GPA.
9. On an essay requirement, open **Draft this essay with AI**, write a few lines of notes, and **Write a draft**. Sentences not based on your notes are marked; edit, then **Approve this draft**.
10. On the dashboard, download the calendar (.ics) or checklist (.csv), or open **Print or save as PDF**.

### Optional: a demo student with scholarships already added

```bash
docker compose exec api npm run seed -- seed/dataset.csv demo@student.test "a-long-demo-password"
```

This loads the catalog and adds catalog scholarships (up to 15) to a demo account. Entries the team checked against the official page (a source URL and a dataset status that isn't `Unverified`) show as **From source**; any others show as **Unverified** until real guidelines are uploaded.

---

### Optional: send real emails (free)

Locally every email (confirmation codes, password resets, deadline and change alerts) goes to the Mailpit test inbox at http://localhost:8025. To deliver them to real inboxes, use a Gmail account (simplest) or Brevo.

**Gmail** (about 500 emails a day; use a Gmail account made for the project, not your personal one):

1. On that Google account, turn on **2-Step Verification** (Google Account → Security).
2. Open **Google Account → Security → App passwords** (or search "App passwords" in the account settings), create one named `ScholarScope`, and copy the 16-character password.
3. Put it in `.env.secrets` as `SMTP_PASSWORD=...` (spaces don't matter).
4. In `.env`, set `MAIL_BACKEND=gmail` and `SMTP_USER=the-gmail-address@gmail.com`. Optionally `MAIL_FROM=ScholarScope <the-gmail-address@gmail.com>` for the display name.
5. Run `docker compose up -d --build localstack worker`.

**Brevo** (about 300 a day; the sign-up asks for company details): create a free account at brevo.com, verify a sender under **Senders**, create a key under **SMTP & API → API keys**, put it in `.env.secrets` as `BREVO_API_KEY`, and set `MAIL_BACKEND=brevo` and `MAIL_FROM=ScholarScope <the verified address>` in `.env`. Then run the same command as step 5.

**Check it:** `docker compose exec worker npm run mail:test -- you@example.com` checks the settings (for Brevo: the key, and that `MAIL_FROM` is a verified sender), sends one test email, and says exactly what is missing if anything is.

**Done when:** adding an email on your profile says *Code sent* and the code arrives (check spam the first time). If it says *We could not send the email*, `docker compose logs --tail 20 worker` says why (for Gmail, usually a normal password used instead of an app password). Real addresses then get real emails, and the daily limit is shared by everyone using the account or key.

## Local URLs

| What | URL |
|---|---|
| Web app | http://localhost:4200 |
| API health | http://localhost:3000/api/health |
| Firebase Emulator UI (data, users) | http://localhost:4000 |
| MinIO console (files) | http://localhost:9001 |
| Mailpit (alert emails) | http://localhost:8025 |

All ports listen on `127.0.0.1` only.

---

## Everyday commands

| Task | Command |
|---|---|
| Start everything (starts Docker Desktop if needed, waits until the site answers) | `npm start` |
| Stop everything (saves accounts and data first; stop before shutting down the computer or quitting Docker) | `npm stop` |
| Start / stop without the helper | `docker compose --profile web up -d` / `docker compose --profile web stop` |
| Recent logs | `docker compose logs --tail 30 worker` (add `-f` to follow) |
| Restart after changing code in `shared/` | `docker compose restart api worker` |
| Rebuild after changing a `package.json` | `docker compose up -d --build --renew-anon-volumes api worker` |
| Run the page re-check now | `docker compose exec worker npm run cron:recheck` |
| Run deadline alerts now | `docker compose exec worker npm run cron:deadline-alerts` |
| Failed jobs (dead-letter queue) | `docker compose exec localstack awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/gemini-dlq --attribute-names ApproximateNumberOfMessages` |
| Make someone an admin (they sign up first, then sign out and in again) | `npm run admin -- grant someone@example.com` |
| Remove an admin / list admins | `npm run admin -- revoke someone@example.com` / `npm run admin -- list` |
| Process "delete my data" requests (and accounts an admin deleted) | `docker compose run --rm deleter` |
| Delete one student now | `docker compose run --rm deleter <uid>` |
| Save accounts and data now (they are also saved on `docker compose stop`) | `docker compose exec firebase firebase emulators:export /data/export --project demo-scholarscope --force` (Git Bash: put `MSYS_NO_PATHCONV=1 ` in front) |
| Convert deadlines saved before time zones were stored (once; add `-- --apply` to write) | `docker compose exec api npm run migrate:deadlines` |
| Reset all local data | `docker compose down -v` |

## Tests

```bash
npm ci && npm run check                     # typecheck + unit tests (shared, api, worker)
cd web && npx ng test --watch=false && cd ..   # Angular tests
docker compose run --rm --entrypoint /bin/sh minio-init /init/test-permissions.sh
npm run infra:check                         # Terraform: fmt, validate, tfsec, checkov, infracost (Docker only, no cloud account)
```

In Windows PowerShell 5, use `;` instead of `&&`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `'clamav' is not recognized…` (Windows) or `clamav: command not found` (macOS/Linux) | A long command was split over two lines. Run it as one line. |
| `required variable … is missing a value` | That value in `.env` is empty (step 3). |
| `pull access denied for minio/mc` or `401 Unauthorized` from quay.io | Old MinIO image names. Use the Chainguard digest from `.env.example` (step 4). |
| `No such image: localstack/…` | The pull didn't finish. Run `docker pull localstack/localstack:latest` again. |
| `minio-init`: `flag provided but not defined` | A MinIO secret starts with `-`. Refill the four with hex (step 3), then `docker compose rm -sf minio minio-init`, `docker volume rm scholarscope_minio-data`, `docker compose up -d minio minio-init`. |
| `localstack` exits or shows a licence error | `LOCALSTACK_AUTH_TOKEN` is missing or wrong. |
| Worker: `queue_receive_failed … ECONNREFUSED 127.0.0.1:4566` | You have an old copy of `shared/src/platform/queue/sqs.ts`. Pull the latest code, then `docker compose restart worker`. |
| `npm warn EBADENGINE` and Angular won't start | Node.js is older than 22.22.3. Install the latest Node 22 LTS (Windows: nodejs.org installer; macOS/Linux: `nvm install 22 && nvm alias default 22`), open a new terminal, run `npm ci` again. |
| Linux: `permission denied while trying to connect to the Docker daemon socket` | Add yourself to the `docker` group (see *Before you start*), then log out and back in. |
| Linux: `docker: 'compose' is not a docker command` | Install the Compose v2 plugin (`sudo apt install docker-compose-plugin` on Docker's apt repo). The old `docker-compose` v1 tool isn't supported. |
| Apple Silicon: `no matching manifest for linux/arm64` for one image | Create `docker-compose.override.yml` with `services: { <service>: { platform: linux/amd64 } }` (Docker Desktop runs it under emulation), or pin a newer multi-arch digest. |
| Containers slow or killed on a Mac | Docker Desktop → Settings → Resources → Memory ≥ 6 GB. |
| Web app shows only the header | Pull the latest code (the sign-in guard fix), then reload. Otherwise press F12 → Console and check the red errors. |
| `/bin/sh^M: bad interpreter` | A `.sh` file got Windows line endings. `.gitattributes` prevents this for new clones; to fix now, open it in VS Code → *CRLF* → *LF* → save (macOS/Linux: `sed -i.bak 's/\r$//' file.sh`). |
| ClamAV unhealthy for several minutes | First signature download. Wait, or give Docker more RAM. |
| Upload fails with a signature or CORS error | `S3_PUBLIC_ENDPOINT` must be `http://localhost:9000` and the web app must run on `http://localhost:4200`. |
| Upload stuck on "Reading the requirements…" | `docker compose logs --tail 30 worker`. Usually a wrong Gemini key or model id (or NVIDIA key with `AI_PROVIDER=nim`). Fix it, then `docker compose restart localstack worker`. |
| Job status `paused_ai_off` | `config/app.aiEnabled` is `false` in the Emulator UI (Firestore); set it to `true`. |
| AI calls return 429 | AI Studio free-tier limit. Wait for the daily reset, lower `GEMINI_RATE_PER_SEC`, or set `AI_PROVIDER=auto` (or `nim`) so NVIDIA NIM answers instead. |
| Accounts gone after a restart | Data is saved only on a clean `docker compose stop`. Quitting Docker Desktop or shutting down with containers running skips the save; run the "Save accounts and data now" command first. |
| Port already in use | Change the left-hand port in `docker-compose.yml`, e.g. `"127.0.0.1:3001:3000"`. |

Before pasting logs into an issue or chat, check them for passwords and keys.

---

## Contributing

- Work on a branch and open a pull request into `main`. CI (`.github/workflows/ci.yml`) must pass: typecheck and unit tests, Angular build and tests, a `docker-compose.yml` check, shell-script checks, Terraform checks (`npm run infra:check`) and a gitleaks secret scan.
- **Never commit** `.env`, `.env.secrets`, real student documents or keys. If a key is ever committed or shown, revoke it and create a new one.
- Keep shell scripts and Dockerfiles with LF line endings (`.gitattributes` handles this).
- UI: the site follows the team's profile page design (`Profile setup/`). Colors, fonts and shared components live in `web/src/styles.css`; change a color in its `:root` block, not in a page.
- New image versions: test locally, then update the digests in `.env.example` in the same pull request.
