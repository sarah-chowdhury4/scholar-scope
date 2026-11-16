# ScholarScope — Project Documentation

## 1\. Overview \& Core Principle

ScholarScope is an academic award tracking and document verification platform designed to help students manage high-stakes scholarship applications.

The platform operates under a strict data lineage rule: **"No source, no claim."** Every extracted scholarship requirement, deadline, and GPA cutoff must link directly back to an official, auditable source document.

\---

## 2\. System Capabilities \& Current Status

* **Authentication \& Security:** User sign-up/sign-in, consent flows, idle timeout, and data deletion controls.
* **Scholarship Catalog \& Discovery:** Pre-seeded catalog of 15 structured scholarships with search, filtering (by deadline, GPA, provider, and required materials), and custom scholarship entry.
* **Document Ingestion \& OCR:** Supports uploading scholarship documents with local Tesseract OCR for scanned PDFs and images, extracting requirements with source citations.
* **Change Detection \& Alerts:** Daily page re-checks (respecting `robots.txt`), requirement version tracking, and de-duplicated deadline email alerts.
* **Cloud Deployment:** Includes local Docker setup with Google Cloud adapter stubs (GCS, Cloud Tasks, Secret Manager) located in `shared/src/platform/`.

\---

## 3\. Data Analytics \& Schema Architecture

*Lead: Alexis (Cloud Data Analytics Lead)*

### 3.1 Dataset Structure (`api/seed/dataset.csv`)

The seed dataset contains **15 structured scholarship records** split into two primary categories:

* **Domestic \& Major Grants (`SCH-001` to `SCH-005`, `SCH-011` to `SCH-015`):** Standard academic awards featuring GPA cutoffs, essay prompts, transcripts, and letters of recommendation.
* **International \& Study Abroad Grants (`SCH-006` to `SCH-010`):** Complex awards requiring foreign residency checks, language certificates, and multi-document verification (evaluating requirement **NFR-3.1**).

### 3.2 Database Schema \& Data Dictionary

|Column Name (DB Key)|Display Name|Storage Data Type|Technical Constraint \& Business Rule|Lineage \& Audit Role|
|-|-|-|-|-|
|`scholarship\_id`|Scholarship ID|`STRING` (Text)|Primary Key (`SCH-001` through `SCH-015`) to prevent duplicates.|Unique routing index.|
|`organization`|Sponsoring Organization|`STRING` (Text)|Official name of sponsoring foundation, agency, or donor.|Identifies source entity.|
|`scholarship\_name`|Scholarship Name|`STRING` (Text)|Official title of the award.|Dashboard display title.|
|`current\_deadline`|Current Deadline|`DATE` (`YYYY-MM-DD`)|**Strict ISO Rule:** Formatted as `YYYY-MM-DD` for calendar integration.|Triggers calendar events \& deadline alerts.|
|`min\_gpa`|Min GPA|`NUMERIC` (Decimal)|**Numeric Rule:** Stored as raw float/decimal (e.g., `3.00`) for filtering.|Algorithmic profile GPA matching.|
|`essay\_prompt`|Required Essay Prompt / Materials|`STRING` (Long Text)|Extracted prompt text and required document checklist.|Input payload for draft matching.|
|`verified\_source\_url`|Verified Source URL|`STRING` (URL)|Direct deep link pointing to official rules/guidelines page.|**Zero-Hallucination Guardrail**.|
|`version\_flag`|Data Status / Version Flag|`STRING` (Text)|Allowed flags: `v1.0 - Active`, `v2.1 - Deadline Changed`, `Unverified`.|Enables immutable version history tracking.|

\---

## 4\. Confidence Scoring \& Lineage Guardrails

* **95% Confidence Threshold (`FR-2.4`):**

  * **Automated Acceptance ($\\ge 95%$):** Extracted fields automatically populate on the student dashboard.
  * **"Needs Review" Warning ($< 95%$):** Ambiguous phrasing or low-OCR confidence triggers a yellow **Needs Review** badge, locking the item until manually confirmed.
* **Zero-Hallucination Guardrail (`FR-4.2`, `NFR-2.1`):** If `verified\_source\_url` is missing or invalid, `version\_flag` defaults to `Unverified`, preventing unverified claims from reaching students.
* **Immutable Snapshotting (`FR-3.2`, `NFR-2.2`):** Re-fetching or re-uploading documents never overwrites existing records; updates increment the `version\_flag` (e.g., `v1.0` $\\rightarrow$ `v2.0`) and log a delta diff.

\---

## 5\. Local Setup \& Testing Workflow

### 5.1 Seeding the Dataset

1. Place the 15-scholarship dataset into `api/seed/dataset.csv`.
2. Run the catalog seed command inside the API container:

```bash
   docker compose exec api npm run seed:catalog -- seed/dataset.csv
   ```

