# One service account per job, each with only what it needs (the same split as the local MinIO users).

resource "google_service_account" "api" {
  account_id   = "scholarscope-api"
  display_name = "ScholarScope API"
}

resource "google_service_account" "worker" {
  account_id   = "scholarscope-worker"
  display_name = "ScholarScope worker"
}

resource "google_service_account" "deleter" {
  account_id   = "scholarscope-deleter"
  display_name = "ScholarScope account deleter"
}

# Cloud Tasks and Cloud Scheduler sign their requests to the worker as this account.
resource "google_service_account" "invoker" {
  account_id   = "scholarscope-invoker"
  display_name = "ScholarScope task and scheduler invoker"
}

locals {
  project_roles = {
    api_firestore     = { sa = google_service_account.api.email, role = "roles/datastore.user" }
    api_auth          = { sa = google_service_account.api.email, role = "roles/firebaseauth.viewer" }
    api_tasks         = { sa = google_service_account.api.email, role = "roles/cloudtasks.enqueuer" }
    worker_firestore  = { sa = google_service_account.worker.email, role = "roles/datastore.user" }
    worker_tasks      = { sa = google_service_account.worker.email, role = "roles/cloudtasks.enqueuer" }
    worker_vertex     = { sa = google_service_account.worker.email, role = "roles/aiplatform.user" }
    deleter_firestore = { sa = google_service_account.deleter.email, role = "roles/datastore.user" }
    deleter_auth      = { sa = google_service_account.deleter.email, role = "roles/firebaseauth.admin" }
  }
}

resource "google_project_iam_member" "roles" {
  for_each = local.project_roles
  project  = var.project_id
  role     = each.value.role
  member   = "serviceAccount:${each.value.sa}"
}

# Signed upload URLs: the API signs them with its own identity (no key file).
resource "google_service_account_iam_member" "api_signs_urls" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api.email}"
}

# Cloud Tasks may attach the invoker's identity to the tasks the API and worker create.
resource "google_service_account_iam_member" "enqueuers_act_as_invoker" {
  for_each = {
    api    = google_service_account.api.email
    worker = google_service_account.worker.email
  }
  service_account_id = google_service_account.invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${each.value}"
}
