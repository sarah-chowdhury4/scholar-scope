resource "google_firestore_database" "main" {
  name                              = "(default)"
  location_id                       = var.firestore_location
  type                              = "FIRESTORE_NATIVE"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"

  depends_on = [google_project_service.enabled]
}

# Indexes come from the same file the local emulator uses, so the two can't drift apart.
# Security rules are deployed with `firebase deploy --only firestore:rules` (Terraform has no clean resource for them).
locals {
  index_file = jsondecode(file("${path.module}/../../local/firebase/firestore.indexes.json"))

  composite_indexes = {
    for i in local.index_file.indexes :
    "${i.collectionGroup}-${i.queryScope}-${join("-", [for f in i.fields : f.fieldPath])}" => i
    if length(i.fields) > 1
  }

  # A one-field index on a collection group is a field setting in Firestore, not a composite index.
  single_field_indexes = {
    for i in local.index_file.indexes :
    "${i.collectionGroup}-${i.fields[0].fieldPath}" => i
    if length(i.fields) == 1
  }

  ttl_fields = {
    for o in local.index_file.fieldOverrides :
    "${o.collectionGroup}-${o.fieldPath}" => o
    if try(o.ttl, false)
  }
}

resource "google_firestore_index" "composite" {
  for_each    = local.composite_indexes
  database    = google_firestore_database.main.name
  collection  = each.value.collectionGroup
  query_scope = each.value.queryScope

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path = fields.value.fieldPath
      order      = fields.value.order
    }
  }
}

resource "google_firestore_field" "single" {
  for_each   = local.single_field_indexes
  database   = google_firestore_database.main.name
  collection = each.value.collectionGroup
  field      = each.value.fields[0].fieldPath

  index_config {
    indexes {
      order       = each.value.fields[0].order
      query_scope = each.value.queryScope
    }
  }
}

# Audit logs delete themselves at expireAt.
resource "google_firestore_field" "ttl" {
  for_each   = local.ttl_fields
  database   = google_firestore_database.main.name
  collection = each.value.collectionGroup
  field      = each.value.fieldPath

  ttl_config {}
  index_config {}
}
