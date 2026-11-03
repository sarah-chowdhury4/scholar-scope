#!/bin/bash
# LocalStack "ready" hook: runs every time LocalStack starts.
# Creates the three job queues (stand-ins for Cloud Tasks) with dead-letter queues,
# and loads API keys from .env.secrets into LocalStack Secrets Manager.
set -euo pipefail

# --- Queues: gemini-queue, nim-queue, default-queue -------------------------
# maxReceiveCount=3 matches "at most 3 attempts" on Cloud Tasks. SQS has no
# dispatch-rate setting, so the worker enforces 1/s (Gemini) and 30/min (NIM).
for Q in gemini nim default; do
  awslocal sqs create-queue --queue-name "${Q}-dlq" >/dev/null
  DLQ_URL=$(awslocal sqs get-queue-url --queue-name "${Q}-dlq" --query QueueUrl --output text)
  DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "$DLQ_URL" \
            --attribute-names QueueArn --query Attributes.QueueArn --output text)
  ATTRS=$(python3 -c 'import json,sys; print(json.dumps({
      "VisibilityTimeout": "300",
      "ReceiveMessageWaitTimeSeconds": "20",
      "RedrivePolicy": json.dumps({"deadLetterTargetArn": sys.argv[1], "maxReceiveCount": "3"})}))' "$DLQ_ARN")
  awslocal sqs create-queue --queue-name "${Q}-queue" --attributes "$ATTRS" >/dev/null
done

# --- Secrets ------------------------------------------------------------------
put_secret() {  # $1=name  $2=value
  if [ -z "$2" ]; then echo "secret $1: not set, skipped"; return; fi
  if awslocal secretsmanager describe-secret --secret-id "$1" >/dev/null 2>&1; then
    awslocal secretsmanager put-secret-value --secret-id "$1" --secret-string "$2" >/dev/null
  else
    awslocal secretsmanager create-secret --name "$1" --secret-string "$2" >/dev/null
  fi
  echo "secret $1: stored"
}
put_secret scholarscope/gemini-api-key "${GEMINI_API_KEY:-}"
put_secret scholarscope/nvidia-api-key "${NVIDIA_API_KEY:-}"
put_secret scholarscope/brevo-api-key  "${BREVO_API_KEY:-}"

echo "LocalStack ready: 3 queues + DLQs, secrets loaded."
