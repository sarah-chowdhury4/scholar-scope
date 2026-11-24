# The same three buckets and rules as local/minio/init.sh:
#   uploads   - quarantine for browser uploads, deleted after 7 days (the worker scans and copies clean files out)
#   originals - clean files, versioned, old versions kept 30 days
#   exports   - generated checklists and exports, deleted after 30 days

# Google-managed encryption (on by default). Customer-managed keys would add Cloud KMS cost and a key that,
# if destroyed, makes every file unreadable; revisit if a school or regulator requires them.
#tfsec:ignore:google-storage-bucket-encryption-customer-key
resource "google_storage_bucket" "uploads" {
  #checkov:skip=CKV_GCP_62:Access logs would store every student's file paths; Cloud Audit Logs cover data access instead.
  #checkov:skip=CKV_GCP_78:Quarantine files are deleted after 7 days, so old versions are never needed.
  name                        = "${var.project_id}-uploads"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "Delete"
    }
  }

  # The browser PUTs files here with a signed URL.
  cors {
    origin          = [var.web_origin]
    method          = ["PUT"]
    response_header = ["Content-Type", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.enabled]
}

#tfsec:ignore:google-storage-bucket-encryption-customer-key
resource "google_storage_bucket" "originals" {
  #checkov:skip=CKV_GCP_62:Access logs would store every student's file paths; Cloud Audit Logs cover data access instead.
  name                        = "${var.project_id}-originals"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.enabled]
}

#tfsec:ignore:google-storage-bucket-encryption-customer-key
resource "google_storage_bucket" "exports" {
  #checkov:skip=CKV_GCP_62:Access logs would store every student's file paths; Cloud Audit Logs cover data access instead.
  #checkov:skip=CKV_GCP_78:Exports are regenerated on demand and deleted after 30 days.
  name                        = "${var.project_id}-exports"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.enabled]
}

# ---- Who may do what (mirrors local/minio/policies) ----

# API: put new uploads into quarantine; read clean files and exports.
resource "google_storage_bucket_iam_member" "api_uploads_create" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "api_read" {
  for_each = {
    originals = google_storage_bucket.originals.name
    exports   = google_storage_bucket.exports.name
  }
  bucket = each.value
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.api.email}"
}

# Worker: read quarantine; add and read originals and exports. It can never delete (no objectAdmin).
resource "google_storage_bucket_iam_member" "worker_read" {
  for_each = {
    uploads   = google_storage_bucket.uploads.name
    originals = google_storage_bucket.originals.name
    exports   = google_storage_bucket.exports.name
  }
  bucket = each.value
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "worker_create" {
  for_each = {
    originals = google_storage_bucket.originals.name
    exports   = google_storage_bucket.exports.name
  }
  bucket = each.value
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.worker.email}"
}

# Deleter: the only identity that can remove a student's files (account deletion).
resource "google_storage_bucket_iam_member" "deleter_admin" {
  for_each = {
    uploads   = google_storage_bucket.uploads.name
    originals = google_storage_bucket.originals.name
    exports   = google_storage_bucket.exports.name
  }
  bucket = each.value
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deleter.email}"
}
