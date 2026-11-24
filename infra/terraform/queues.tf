# The three job queues (LocalStack SQS locally, see local/localstack/init-ready.sh).
# Rate limits match the worker's local limits: Gemini 1 per second, NIM 30 per minute. At most 3 attempts.
locals {
  queues = {
    gemini  = { per_second = 1, concurrent = 2 }
    nim     = { per_second = 0.5, concurrent = 2 }
    default = { per_second = 5, concurrent = 10 }
  }
}

resource "google_cloud_tasks_queue" "jobs" {
  for_each = local.queues
  name     = "${each.key}-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = each.value.per_second
    max_concurrent_dispatches = each.value.concurrent
  }

  retry_config {
    max_attempts  = 3
    min_backoff   = "10s"
    max_backoff   = "300s"
    max_doublings = 3
  }

  stackdriver_logging_config {
    sampling_ratio = 1.0
  }

  depends_on = [google_project_service.enabled]
}
