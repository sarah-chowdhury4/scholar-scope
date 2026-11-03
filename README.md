# ScholarScope

**No source, no claim.** ScholarScope helps a student juggling several scholarship applications keep track of every requirement, see exactly where it came from, and notice when it changes.

- Upload a scholarship's guidelines (PDF, Word, image or text) or save its web page.
- Requirements, deadlines, word limits and eligibility rules are extracted, and **each one links to the exact page and sentence in the source**. Anything that can't be found in the source is shown as **Unverified**.
- Requirements are versioned, never overwritten. When a saved page changes, the affected requirement is flagged until the student acknowledges it.
- Deadline alerts go out 14, 7, 3 and 1 days before each deadline.

Everything runs on your own computer with Docker. **You don't need a cloud account or a payment method.**

---

## Contents

1. [Before you start](#before-you-start)
2. [Get started (about 30–45 minutes the first time)](#get-started)
3. [Local URLs](#local-urls)
4. [Everyday commands](#everyday-commands)
5. [Troubleshooting](#troubleshooting)
6. [How it's built](#how-its-built)
7. [Security model](#security-model)
8. [Project status](#project-status)
9. [Contributing](#contributing)

---

## Before you start

| Tool | Version | Check with |
|---|---|---|
| Docker Desktop (Windows: **WSL 2** engine) | recent; give Docker **≥ 6 GB RAM** | `docker info` prints a *Server* section · `wsl -l -v` shows `docker-desktop` version 2 |
| Node.js | **22.22.3 or newer** (Angular 22 refuses older 22.x) | `node -v` |
| Git | any recent | `git --version` |

**Windows users:** use **PowerShell** (not Command Prompt) for every command below. Run each code block's commands as written; a long command is **one line**, even if your screen wraps it.

---

## Get started

All commands run from the repository root unless a step says otherwise.

### 1. Clone

```powershell
git clone https://github.com/<org>/scholar-scope.git
cd scholar-scope
```

### 2. Get the free keys (no card needed)

| Key | Where | Goes in |
|---|---|---|
| LocalStack auth token | app.localstack.cloud → *Auth Token* (free account) | `.env` → `LOCALSTACK_AUTH_TOKEN` |
| Gemini API key | aistudio.google.com → *Get API key* | `.env.secrets` → `GEMINI_API_KEY` |
| Gemini model id | AI Studio → model list (exact id of the current Flash model) | `.env` → `GEMINI_MODEL` |
| NVIDIA NIM key (optional for now) | build.nvidia.com → *Get API Key* | `.env.secrets` → `NVIDIA_API_KEY` |

> **Synthetic documents only.** Free-tier AI inputs may be kept or used by the provider. Never upload real student records to a local setup.

Keep keys in a password manager, never in chat, screenshots or recordings.

### 3. Create your settings files

```powershell
Copy-Item .env.example .env
Copy-Item local\localstack\secrets.env.example .env.secrets
```

(macOS/Linux: `cp .env.example .env` and `cp local/localstack/secrets.env.example .env.secrets`.)

Fill the four MinIO secrets with random **hex** values. Hex matters: a value starting with `-` breaks the MinIO setup. This fills only those four lines:

```powershell
$keys = 'MINIO_ROOT_PASSWORD','MINIO_API_SECRET_KEY','MINIO_WORKER_SECRET_KEY','MINIO_DELETER_SECRET_KEY'
$c = Get-Content .env
foreach ($k in $keys) {
  $v = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
  $c = $c -replace "^$k=.*$", "$k=$v"
}
Set-Content .env $c -Encoding ascii
```

(macOS/Linux: for each of the four keys, `sed -i "s/^KEY=.*/KEY=$(openssl rand -hex 24)/" .env`.)

Then open `.env` and set `LOCALSTACK_AUTH_TOKEN` and `GEMINI_MODEL`; open `.env.secrets` and set `GEMINI_API_KEY`.

Both files are git-ignored. If this is a fresh copy rather than a clone, run `git init -b main` first, then confirm with `git status` that neither file is listed.

### 4. Check the image versions

`.env.example` already pins the images the team has tested:

- **MinIO:** MinIO's own images are gone (deleted from Docker Hub, private on quay.io), so this project uses **Chainguard's free MinIO build** (`cgr.dev/chainguard/minio`, `-dev` variant). It includes `mc`, so the same digest goes in both `MINIO_IMAGE` and `MC_IMAGE`.
- **LocalStack:** `localstack/localstack`, which needs your auth token from step 2.

Check that everything is filled in. This prints nothing when the config is valid:

```powershell
docker compose config -q
```

To move to newer images later, pull them, then copy the printed `name@sha256:…` into `.env.example` for everyone:

```powershell
docker pull cgr.dev/chainguard/minio:latest-dev
docker image inspect cgr.dev/chainguard/minio:latest-dev --format "{{index .RepoDigests 0}}"
docker pull localstack/localstack:latest
docker image inspect localstack/localstack:latest --format "{{index .RepoDigests 0}}"
```

### 5. Start the infrastructure

```powershell
docker compose up -d --build firebase minio minio-init localstack clamav mailpit
docker compose ps
```

The first start takes several minutes: the Firebase image downloads the emulators, and ClamAV downloads virus signatures.

**Done when:** `docker compose ps` shows `firebase`, `minio`, `localstack`, `clamav` and `mailpit` as **healthy** (`minio-init` runs once and exits), and

```powershell
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

```powershell
docker compose run --rm --entrypoint /bin/sh minio-init /init/test-permissions.sh
```

**Done when:** every line says `PASS` and the last line is `All storage permission tests passed.`

### 8. Start the API and worker

```powershell
docker compose up -d --build api worker
docker compose logs --tail 20 api worker
```

**Done when:** the logs show `api_started`, `worker_started` and three `queue_consumer_started` lines, and http://localhost:3000/api/health returns `{"status":"ok"}`.

### 9. Start the web app

In a second PowerShell window:

```powershell
cd web
npm ci
npm start
```

Open http://localhost:4200. You should see the sign-in page. Choose **Create an account** (any email, 12+ character password).

### 10. Try the full flow

1. Add a scholarship with a deadline **7 days from today**. It shows an **Unverified** badge, because you typed it and there's no source yet.
2. Trigger the deadline alert now: `docker compose exec worker npm run cron:deadline-alerts`. The email appears at http://localhost:8025.
3. Save this as `example-guidelines.txt` and upload it on the scholarship's page:

   ```text
   Example Award 2027 — Application Guidelines
   Applications close on December 1, 2026 at 11:59 PM Eastern Time.
   Essay: In 500 words or fewer, describe a challenge you have overcome.
   Applicants must have a minimum GPA of 3.0.
   Submit one recommendation letter from a teacher.
   ```

4. Each requirement now shows its quoted sentence and a **From source** / **Needs review** badge. **Open source** opens the stored file.

### Optional: seed demo records

Export a scholarship list to `api/seed/dataset.csv` (same columns as `api/seed/dataset.example.csv`, dates as `YYYY-MM-DD`), then:

```powershell
docker compose exec api npm run seed -- seed/dataset.csv demo@student.test "a-long-demo-password"
```

Seeded values have no citation, so they show as **Unverified** until real guidelines are uploaded. `api/seed/*.csv` is git-ignored except the example.

---

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
| Start / stop | `docker compose up -d` / `docker compose stop` |
| Recent logs | `docker compose logs --tail 30 worker` (add `-f` to follow) |
| Restart after changing code in `shared/` | `docker compose restart api worker` |
| Rebuild after changing a `package.json` | `docker compose up -d --build --renew-anon-volumes api worker` |
| Run the page re-check now | `docker compose exec worker npm run cron:recheck` |
| Run deadline alerts now | `docker compose exec worker npm run cron:deadline-alerts` |
| Failed jobs (dead-letter queue) | `docker compose exec localstack awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/gemini-dlq --attribute-names ApproximateNumberOfMessages` |
| Process "delete my data" requests | `docker compose run --rm deleter` |
| Delete one student now | `docker compose run --rm deleter <uid>` |
| Reset all local data | `docker compose down -v` |

## Tests

```powershell
npm ci; npm run check                       # typecheck + unit tests (shared, api, worker)
cd web; npx ng test --watch=false           # Angular tests
docker compose run --rm --entrypoint /bin/sh minio-init /init/test-permissions.sh
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `'clamav' is not recognized as an internal or external command` | A long command was split over two lines. Run it as one line, in PowerShell. |
| `required variable … is missing a value` | That value in `.env` is empty (step 3). |
| `pull access denied for minio/mc` or `401 Unauthorized` from quay.io | Old MinIO image names. Use the Chainguard digest from `.env.example` (step 4). |
| `No such image: localstack/…` | The pull didn't finish. Run `docker pull localstack/localstack:latest` again. |
| `minio-init`: `flag provided but not defined` | A MinIO secret starts with `-`. Refill the four with hex (step 3), then `docker compose rm -sf minio minio-init`, `docker volume rm scholarscope_minio-data`, `docker compose up -d minio minio-init`. |
| `localstack` exits or shows a licence error | `LOCALSTACK_AUTH_TOKEN` is missing or wrong. |
| Worker: `queue_receive_failed … ECONNREFUSED 127.0.0.1:4566` | You have an old copy of `shared/src/platform/queue/sqs.ts`. Pull the latest code, then `docker compose restart worker`. |
| `npm warn EBADENGINE` and Angular won't start | Node.js is older than 22.22.3. Install the latest Node 22 LTS, reopen PowerShell, run `npm ci` again. |
| Web app shows only the header | Pull the latest code (the sign-in guard fix), then reload. Otherwise press F12 → Console and check the red errors. |
| `/bin/sh^M: bad interpreter` | A `.sh` file got Windows line endings. `.gitattributes` prevents this for new clones; to fix now, open it in VS Code → *CRLF* → *LF* → save. |
| ClamAV unhealthy for several minutes | First signature download. Wait, or give Docker more RAM. |
| Upload fails with a signature or CORS error | `S3_PUBLIC_ENDPOINT` must be `http://localhost:9000` and the web app must run on `http://localhost:4200`. |
| Upload stuck on "Reading the requirements…" | `docker compose logs --tail 30 worker`. Usually a wrong Gemini key or model id. Fix it, then `docker compose restart localstack worker`. |
| Job status `paused_ai_off` | `config/app.aiEnabled` is `false` in the Emulator UI (Firestore); set it to `true`. |
| AI calls return 429 | AI Studio free-tier limit. Wait for the daily reset or lower `GEMINI_RATE_PER_SEC`. |
| Port already in use | Change the left-hand port in `docker-compose.yml`, e.g. `"127.0.0.1:3001:3000"`. |

Before pasting logs into an issue or chat, check them for passwords and keys.

---

## How it's built

| Part | Folder | Runs as |
|---|---|---|
| Web app (Angular 22) | `web/` | `npm start` on your machine |
| API (Node.js 22, Express) | `api/` | `api` container |
| Worker: virus scan, OCR, extraction, page re-checks, alerts | `worker/` | `worker` container |
| Shared code: data access, adapters, citation and deadline logic | `shared/` | used by API and worker |
| Local infrastructure | `local/`, `docker-compose.yml` | containers below |

| Production service (Google Cloud) | Local stand-in |
|---|---|
| Firestore, Identity Platform | Firebase emulators (`firebase`) |
| Cloud Storage | MinIO, Chainguard build (`minio`) |
| Cloud Tasks, Secret Manager | LocalStack SQS + Secrets Manager (`localstack`) |
| Malware scanning | ClamAV (`clamav`) |
| Email (Brevo) | Mailpit (`mailpit`) |
| Cloud Vision OCR | Tesseract inside the worker |
| Vertex AI Gemini | Gemini API, Google AI Studio free tier |
| NVIDIA NIM | Hosted NIM API |
| Cloud Scheduler | `node-cron` inside the worker |

All storage, queue, secret, AI and mail calls go through small adapters in `shared/src/platform/`, chosen by environment variables (`STORAGE_BACKEND`, `QUEUE_BACKEND`, `SECRETS_BACKEND`, `GEMINI_BACKEND`, `MAIL_BACKEND`). Moving to Google Cloud means writing the Google implementations next to the local ones (stubs are there) and changing configuration, not rewriting the job handlers.

```
api/        Express API: routes, sign-in check, validation, seed script
worker/     job handlers (scan, extract, fetch_url), cron jobs, delete-user job
shared/     Firestore access, adapters, citation + deadline logic
web/        Angular app
local/      emulator config, MinIO policies + tests, LocalStack init, dev Dockerfiles
.github/    CI workflow
```

---

## Security model

- **API keys stay on the server.** `.env.secrets` is read only by LocalStack, which stores the keys in its Secrets Manager; only the worker fetches them. The API and the browser never see them.
- **Least privilege for files.** Each service has its own MinIO user (`local/minio/policies/`): the API can only drop files into quarantine, the worker can add originals but never delete them, and only the deleter job can erase a student's files. Originals are versioned.
- **Every API route checks the sign-in token**, and all data paths come from the token's user id, so one student can't reach another's data. Sessions end after 30 minutes of inactivity.
- **Uploads are untrusted:** size limit, real file-type check from the file's bytes, then a ClamAV scan before anything reads them.
- **Saved web pages are fetched safely:** robots.txt is honoured, and private or internal addresses are blocked.
- **Document text is data, not instructions:** the AI is told to ignore instructions inside documents, and every extracted item must quote the source; quotes not found in the stored text become "Unverified".
- **Firestore rules deny all direct client access.**
- **Emulator settings can't reach a deployment:** the API and worker refuse to start if emulator variables are set outside `APP_ENV=local`.

The local setup does **not** provide encryption at rest, IAM enforcement in LocalStack, or signed sign-in tokens (the Auth emulator issues unsigned ones). Those come from the managed services in production.

---

## Project status

| Area | Status |
|---|---|
| Sign-up / sign-in, consent, idle timeout | Done (TOTP MFA screens to do) |
| Scholarship records (up to 15), dashboard sorted by deadline | Done |
| Upload → scan → store original → extract with citations | Done |
| OCR for images and scanned PDFs | Done (Tesseract locally) |
| Requirement versions + change flag on re-extraction | Done (basic pairing by requirement name) |
| Daily page re-check (robots.txt, change detection) | Done |
| Deadline alerts (in-app + email, de-duplicated) | Done |
| Delete my data | Done |
| Side-by-side diff view, acknowledging changes | To do |
| Material library, matching (NIM embeddings) | To do |
| Draft generation with citations, approval | To do |
| Calendar (ICS) and PDF/CSV export | To do |
| Google Cloud adapters (GCS, Cloud Tasks, Secret Manager) | Stubs in `shared/src/platform/` |

---

## Contributing

- Work on a branch and open a pull request into `main`. CI (`.github/workflows/ci.yml`) must pass: typecheck and unit tests, Angular build and tests, a `docker-compose.yml` check, shell-script checks and a gitleaks secret scan.
- **Never commit** `.env`, `.env.secrets`, real student documents or keys. If a key is ever committed or shown, revoke it and create a new one.
- Keep shell scripts and Dockerfiles with LF line endings (`.gitattributes` handles this).
- New image versions: test locally, then update the digests in `.env.example` in the same pull request.

## License

No license has been chosen yet. Until one is added, all rights are reserved by the authors.
