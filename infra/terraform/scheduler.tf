# Daily jobs (node-cron in the worker locally, SCHEDULER=cron). Times are UTC, like the local cron.
locals {
  scheduled = {
    recheck         = { schedule = var.cron_recheck, path = "/cron/recheck", what = "Re-check saved scholarship pages for changes" }
    deadline-alerts = { schedule = var.cron_deadline_alerts, path = "/cron/deadline-alerts", what = "Send deadline reminder emails" }
  }
}

resource "google_cloud_scheduler_job" "daily" {
  for_each         = local.scheduled
  name             = "scholarscope-${each.key}"
  description      = each.value.what
  region           = var.region
  schedule         = each.value.schedule
  time_zone        = var.time_zone
  attempt_deadline = "600s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}${each.value.path}"

    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }

  depends_on = [google_project_service.enabled]
}
