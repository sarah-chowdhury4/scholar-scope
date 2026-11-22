# The secret containers only. Their values are added by hand (see infra/README.md), so API keys never
# appear in Terraform files or state. Locally the same names live in LocalStack Secrets Manager.
# Gemini runs on Vertex AI in the cloud (worker's own identity), so it needs no API key here.
locals {
  worker_secrets = {
    NVIDIA_API_KEY = "nvidia-api-key"
    JINA_API_KEY   = "jina-api-key"
    BREVO_API_KEY  = "brevo-api-key"
  }
}

resource "google_secret_manager_secret" "worker" {
  for_each  = local.worker_secrets
  secret_id = "scholarscope-${each.value}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "worker_reads" {
  for_each  = google_secret_manager_secret.worker
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
