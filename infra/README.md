# Infrastructure as code (Google Cloud)

`infra/terraform/` describes the Google Cloud setup ScholarScope runs on. Everything here can be checked
**on your own machine, for free, without a Google Cloud account**: nothing is created until someone runs
`terraform apply` against a real project.

## Check it locally

```bash
npm run infra:check            # fmt check, validate, tfsec, checkov, and infracost if a key is set
npm run infra:check -- --fix   # format the files first
```

Every tool runs in Docker with a pinned version, so only Docker is needed:

| Step | Tool | What it proves |
|---|---|---|
| Format | `terraform fmt -check` | Files follow the standard layout |
| Validate | `terraform init -backend=false` + `terraform validate` | The configuration is complete and consistent (no state bucket, no credentials) |
| Security | `tfsec`, `checkov` | No public buckets, least-privilege IAM, logging on, and so on |
| Cost | `infracost breakdown` | Expected monthly cost, from `infracost-usage.yml` |

CI runs the same script on every pull request (`.github/workflows/ci.yml`, job **infra**).

### Cost estimates (infracost)

infracost reads the Terraform and prices it against Google's price list. It never touches a cloud
account, but it needs a free infracost API key:

1. Get a key: `docker run --rm -it infracost/infracost:ci-0.10 infracost auth login`, or sign up at infracost.io.
2. Run with it: set `INFRACOST_API_KEY` in your shell, then `npm run infra:check`.
3. For CI, add the key as a repository secret named `INFRACOST_API_KEY`.

Usage-based costs (storage, operations) come from `infra/terraform/infracost-usage.yml`, sized for a pilot
of about 500 students. Firestore, Cloud Run and Vertex AI are priced per use and may show as "usage-based"
or not supported; their free tiers cover a small pilot.

### Accepted scanner findings

These are skipped on purpose, with the reason written next to the resource:

| Check | Where | Why it's accepted |
|---|---|---|
| Customer-managed encryption keys (tfsec `google-storage-bucket-encryption-customer-key`, checkov `CKV_GCP_84`) | Buckets, Artifact Registry | Google encrypts everything by default. Own keys add Cloud KMS cost, and a destroyed key makes every file unreadable. Revisit if a school or regulator requires it. |
| Bucket access logs (`CKV_GCP_62`) | All buckets | Access logs would record every student's file paths. Cloud Audit Logs cover data access. |
| Versioning (`CKV_GCP_78`) | `uploads`, `exports` | Quarantine files live 7 days and exports are regenerated, so old versions are never needed. `originals` is versioned. |
| Public Cloud Run invoker (`CKV_GCP_102`) | API | The API is the website's backend; every route checks the student's Firebase sign-in token. The worker is private. |

## What it creates

| Google Cloud | Local stand-in | File |
|---|---|---|
| Firestore (Native), point-in-time recovery, delete protection, indexes and TTL from `local/firebase/firestore.indexes.json` | Firebase emulator | `firestore.tf` |
| Cloud Storage: `uploads` (7-day quarantine), `originals` (versioned), `exports` (30 days), no public access | MinIO | `storage.tf` |
| Service accounts for the API, worker, deleter and task invoker, with the same permissions as the MinIO users | MinIO policies | `iam.tf`, `storage.tf` |
| Cloud Tasks: `gemini`, `nim`, `default` queues, rate-limited, 3 attempts | LocalStack SQS | `queues.tf` |
| Secret Manager: NVIDIA, Jina and Brevo keys (values added by hand, never in Terraform) | LocalStack Secrets Manager | `secrets.tf` |
| Cloud Run: public API, private worker with a ClamAV sidecar, deleter job | Docker Compose | `run.tf` |
| Cloud Scheduler: daily re-check and deadline alerts | node-cron in the worker | `scheduler.tf` |
| Artifact Registry for the images | local builds | `project.tf` |

Gemini runs on Vertex AI with the worker's own identity, so the cloud needs no Gemini API key.

## Before the first real deploy

The infrastructure is defined, but the app code for some Google services is still a stub
(`shared/src/platform/`), so a deploy would not work end to end yet:

- `storage/gcs.ts` and `queue/cloudTasks.ts` throw "not implemented".
- The worker only polls SQS. In the cloud it must accept pushes on `POST /tasks/:type` (Cloud Tasks)
  and `POST /cron/recheck`, `POST /cron/deadline-alerts` (Cloud Scheduler). These are the URLs the Terraform uses.
- The API and worker read `TASKS_LOCATION`, `WORKER_URL` and `TASKS_INVOKER_SA` once Cloud Tasks is implemented;
  Terraform already sets them.
- Firestore security rules are deployed with `firebase deploy --only firestore:rules`.

## Deploying (later, needs a Google Cloud project with billing)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars                # fill in; this file is git-ignored
gcloud storage buckets create gs://<project>-tfstate --location=<region> --uniform-bucket-level-access
terraform init -backend-config="bucket=<project>-tfstate"
terraform plan
terraform apply
# then add each secret's value, for example:
printf '%s' "$NVIDIA_API_KEY" | gcloud secrets versions add scholarscope-nvidia-api-key --data-file=-
```
