# ---------- API (public; every route except /api/health checks the student's Firebase ID token) ----------
resource "google_cloud_run_v2_service" "api" {
  name                = "scholarscope-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }

    containers {
      image = "${local.image_base}/api:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }
      env {
        name  = "GCLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "STORAGE_BACKEND"
        value = "gcs"
      }
      env {
        name  = "QUEUE_BACKEND"
        value = "cloudtasks"
      }
      env {
        name  = "TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "WORKER_URL"
        value = google_cloud_run_v2_service.worker.uri
      }
      env {
        name  = "TASKS_INVOKER_SA"
        value = google_service_account.invoker.email
      }
      env {
        name  = "BUCKET_UPLOADS"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "BUCKET_ORIGINALS"
        value = google_storage_bucket.originals.name
      }
      env {
        name  = "BUCKET_EXPORTS"
        value = google_storage_bucket.exports.name
      }
      env {
        name  = "CORS_ORIGIN"
        value = var.web_origin
      }
      env {
        name  = "FIREBASE_WEB_API_KEY"
        value = var.firebase_web_api_key
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

# Students reach the API from the browser; the API itself checks who they are.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  #checkov:skip=CKV_GCP_102:The API is the public backend of the website; each request is authenticated with a Firebase ID token.
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------- Worker (private; only Cloud Tasks and Cloud Scheduler may call it) ----------
resource "google_cloud_run_v2_service" "worker" {
  name                = "scholarscope-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL" # Cloud Tasks pushes from Google's network; IAM below keeps everyone else out.
  deletion_protection = false

  template {
    service_account = google_service_account.worker.email
    timeout         = "600s"

    scaling {
      min_instance_count = 0
      max_instance_count = var.worker_max_instances
    }

    containers {
      name       = "worker"
      image      = "${local.image_base}/worker:${var.image_tag}"
      depends_on = ["clamav"]

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = {
          APP_ENV                      = "production"
          GCLOUD_PROJECT               = var.project_id
          STORAGE_BACKEND              = "gcs"
          QUEUE_BACKEND                = "cloudtasks"
          TASKS_LOCATION               = var.region
          TASKS_INVOKER_SA             = google_service_account.invoker.email
          SECRETS_BACKEND              = "env"
          BUCKET_UPLOADS               = google_storage_bucket.uploads.name
          BUCKET_ORIGINALS             = google_storage_bucket.originals.name
          BUCKET_EXPORTS               = google_storage_bucket.exports.name
          CLAMAV_HOST                  = "localhost"
          CLAMAV_PORT                  = "3310"
          OCR_BACKEND                  = "tesseract"
          GEMINI_BACKEND               = "vertex"
          GCP_PROJECT                  = var.project_id
          GEMINI_LOCATION              = "global"
          GEMINI_MODEL                 = var.gemini_model
          NIM_ENABLED                  = "true"
          NIM_BASE_URL                 = "https://integrate.api.nvidia.com/v1"
          READER_BACKEND               = "jina"
          AI_REAL_STUDENT_DATA_ALLOWED = "true" # Vertex AI does not train on customer data.
          MAIL_BACKEND                 = "brevo"
          MAIL_FROM                    = var.mail_from
          SCHEDULER                    = "cloud-scheduler"
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      # API keys from Secret Manager, as plain env vars (SECRETS_BACKEND=env).
      dynamic "env" {
        for_each = google_secret_manager_secret.worker
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }

    # Malware scanner beside the worker; the worker talks to it on localhost:3310.
    containers {
      name  = "clamav"
      image = var.clamav_image

      resources {
        limits = {
          cpu    = "1"
          memory = "3Gi"
        }
        cpu_idle = true
      }

      startup_probe {
        tcp_socket {
          port = 3310
        }
        initial_delay_seconds = 30
        period_seconds        = 10
        failure_threshold     = 30
      }
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.worker_reads,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  name     = google_cloud_run_v2_service.worker.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker.email}"
}

# ---------- Account deleter (run on request: deletes one student's data everywhere) ----------
resource "google_cloud_run_v2_job" "deleter" {
  name                = "scholarscope-deleter"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.deleter.email
      max_retries     = 1
      timeout         = "900s"

      containers {
        image   = "${local.image_base}/worker:${var.image_tag}"
        command = ["npx", "tsx", "src/jobs/deleteUser.ts"]

        dynamic "env" {
          for_each = {
            APP_ENV          = "production"
            GCLOUD_PROJECT   = var.project_id
            STORAGE_BACKEND  = "gcs"
            BUCKET_UPLOADS   = google_storage_bucket.uploads.name
            BUCKET_ORIGINALS = google_storage_bucket.originals.name
            BUCKET_EXPORTS   = google_storage_bucket.exports.name
          }
          content {
            name  = env.key
            value = env.value
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  depends_on = [google_project_service.enabled]
}
