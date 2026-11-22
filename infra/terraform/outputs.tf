output "api_url" {
  description = "Public URL of the API (set as the web app's API address)."
  value       = google_cloud_run_v2_service.api.uri
}

output "worker_url" {
  description = "Private URL of the worker that Cloud Tasks and Cloud Scheduler call."
  value       = google_cloud_run_v2_service.worker.uri
}

output "image_repository" {
  description = "Where to push the api and worker images."
  value       = local.image_base
}

output "buckets" {
  description = "Bucket names for BUCKET_UPLOADS, BUCKET_ORIGINALS and BUCKET_EXPORTS."
  value = {
    uploads   = google_storage_bucket.uploads.name
    originals = google_storage_bucket.originals.name
    exports   = google_storage_bucket.exports.name
  }
}

output "secrets_to_fill" {
  description = "Secret Manager secrets that need a value added by hand."
  value       = [for s in google_secret_manager_secret.worker : s.secret_id]
}
