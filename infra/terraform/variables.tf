variable "project_id" {
  description = "Google Cloud project that hosts ScholarScope."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud Tasks, Cloud Scheduler, Artifact Registry and the buckets."
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore location (a region or multi-region such as nam5). Cannot be changed later."
  type        = string
  default     = "nam5"
}

variable "web_origin" {
  description = "Origin of the Angular site (Firebase Hosting), allowed by the API's CORS and the uploads bucket."
  type        = string
}

variable "image_tag" {
  description = "Container image tag for the api, worker and deleter images in Artifact Registry."
  type        = string
  default     = "latest"
}

variable "gemini_model" {
  description = "Vertex AI Gemini model used by the worker."
  type        = string
}

variable "mail_from" {
  description = "Sender of alert emails, verified in Brevo."
  type        = string
}

variable "time_zone" {
  description = "Time zone for the Cloud Scheduler jobs."
  type        = string
  default     = "Etc/UTC"
}

variable "cron_recheck" {
  description = "When the daily re-check of saved scholarship pages runs (same as CRON_RECHECK locally)."
  type        = string
  default     = "0 2 * * *"
}

variable "cron_deadline_alerts" {
  description = "When deadline reminder emails are sent (same as CRON_DEADLINE_ALERTS locally)."
  type        = string
  default     = "0 13 * * *"
}

variable "firebase_web_api_key" {
  description = "The Firebase web API key (public, also in the web app). The API uses it to re-check a password."
  type        = string
}

variable "clamav_image" {
  description = "ClamAV image for the worker's malware-scanner sidecar. Pin a tested tag."
  type        = string
  default     = "docker.io/clamav/clamav:1.4"
}

variable "api_max_instances" {
  description = "Upper limit of API instances, a cap on cost."
  type        = number
  default     = 3
}

variable "worker_max_instances" {
  description = "Upper limit of worker instances, a cap on cost and on parallel AI calls."
  type        = number
  default     = 2
}
