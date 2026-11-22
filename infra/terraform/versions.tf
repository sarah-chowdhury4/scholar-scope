terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.10"
    }
  }

  # State lives in a GCS bucket you create once by hand (see infra/README.md):
  #   terraform init -backend-config="bucket=<project>-tfstate"
  # The local checks run `terraform init -backend=false`, so they need no bucket and no Google account.
  backend "gcs" {
    prefix = "scholarscope"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
