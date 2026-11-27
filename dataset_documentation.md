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

### 3.1 Dataset Structure (`Dataset/ScholarScope Updated Dataset.csv`)
*`npm start` loads it automatically.
* To load it by hand, run `docker compose exec api npm run seed:catalog` with no file name.
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
* The app never changes the dataset's `Data Status / Version Flag` column.
* Instead, every requirement keeps its own version history: a correction or a changed web page saves a new version, and **History** lists them all.
\---

## 4. Confidence Threshold, Student Review & Unverified Status
* **Confidence threshold:** The app uses **85%**, (`confidenceThreshold: 0.85` in `shared/src/config.ts`).
  * Items at or above 85% show **From source**.
  * Items below 85% show **Needs review**.
* **No locking:** Nothing is locked. The item shows a **Needs review** badge, and the student checks it with **Looks right**, **Fix**, or **Not a requirement**.
* **When something is Unverified:**
  * A catalog entry is Unverified when it has no source URL or its status says Unverified.
  * A requirement read from a document is Unverified when its quote cannot be found in the source.
  * A deadline the student typed in is Unverified too.
\---

## 5\. Local Setup \& Testing Workflow

### 5.1 Seeding the Dataset
* The app loads `Dataset/ScholarScope Updated Dataset.csv` automatically on `npm start`, or manually with `docker compose exec api npm run seed:catalog` (no file name).

