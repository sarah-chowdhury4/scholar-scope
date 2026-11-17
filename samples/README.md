# Sample documents for testing

Fictional files for testing the AI document check. Every school, exam board, person and number is invented, and each page carries a **SAMPLE** watermark and a "fictional sample made for software testing" footer, so none of them can pass as a real record. Use these (or other made-up files) instead of real student documents: the free Gemini tier may keep what it is sent.

Regenerate or extend them with `python samples/make_sample_documents.py` (Pillow is needed only for the PNG).

| File | What it is | Upload as | Expected result |
|---|---|---|---|
| `transcript-high-school-test-student.pdf` | High school transcript, GPA 3.62 / 4.00 | Transcript | Looks like a transcript; name matches a profile named "Test Student" |
| `transcript-scanned-test-student.png` | The same transcript as a tilted, noisy scan | Transcript | Same as above, read by OCR |
| `transcript-university-ana-lucia-perez.pdf` | University transcript, GPA 3.48 | Transcript | Looks like a transcript; name differs from "Test Student" |
| `transcript-unofficial-test-student.pdf` | Transcript marked "UNOFFICIAL COPY", GPA 3.10 | Transcript | Warning: unofficial copy (a problem for scholarships that ask for an official transcript) |
| `transcript-percentage-scale-test-student.pdf` | Statement of marks, 85.4 / 100 | Transcript | Warning on scholarships with a 4.0-scale minimum GPA: different grading scale |
| `transcript-low-gpa-test-student.pdf` | Transcript, GPA 2.40 / 4.00 | Transcript | Problem on scholarships with a minimum GPA above 2.4 (e.g. Gates Scholarship, 3.3) |
| `not-a-transcript-ml-results-table.pdf` | Table of machine-learning model scores | Transcript | **Problem: not a transcript** |
| `not-a-transcript-exam-certificate.pdf` | Exam certificate and statement of results | Transcript | **Problem: looks like a school certificate** (correct if uploaded as a school certificate) |
| `not-a-transcript-class-timetable.pdf` | Class timetable (courses, no grades) | Transcript | **Problem: not a transcript** |

## Try them without uploading

The worker can run the real check (text extraction or OCR, Gemini, quote verification, rules) on local files and print the verdict, without saving anything:

```bash
docker compose exec worker npm run check:documents -- ../samples/documents
```

Options: `--as school_certificate` (what the file is saved as, default `transcript`), `--name "Ana Lucia Perez"` (the profile name, default `Test Student`), `--pause 10` (seconds between files; the free Gemini tier allows only a few requests a minute and a limited number a day).

Set your profile name to **Test Student** to see the name check match when you upload them in the app.
