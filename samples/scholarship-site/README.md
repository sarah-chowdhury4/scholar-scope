# Sample scholarship website (fictional)

A small made-up scholarship site, the **Riverbend Future Leaders Scholarship**, for testing how ScholarScope reads a
scholarship page and reacts when the page changes. Nothing on it is real.

It has three pages:

- `index.html`: the overview, with the **Important dates** table (application deadline, recommendation letters,
  finalist interviews, award notification) and what to submit.
- `eligibility.html`: GPA, citizenship, financial need. Linked from the overview, so ScholarScope reads it too.
- `faq.html`: transcript and recommendation-letter rules. Also linked.

## Run it

It starts with the rest of the stack (`docker compose up -d`, service `sample-site`).
Open it at **http://sample-scholarship.localhost:8088/**.

The worker reaches the same address on the Docker network. Its guard against private addresses lets this one host
through only because `FETCH_ALLOW_PRIVATE_HOSTS=sample-scholarship.localhost` is set for the worker and
`APP_ENV=local`. Jina Reader is skipped for it (Jina is on the internet and can't reach your machine).

## Test a deadline change

1. In ScholarScope, **Add your own** scholarship with the official page `http://sample-scholarship.localhost:8088/`
   (or open an existing one, press **Add guidelines**, paste the address and press **Save page**).
2. Wait about a minute: the requirements appear, each quoting the page it came from, and the deadline shows
   **Jan 15, 2027** (11:59 PM Eastern Time).
3. Edit `index.html`, for example change `January 15, 2027` in the **Application deadline** row to
   `December 20, 2026`, and save the file. The site serves the new text immediately.
4. In ScholarScope press **Add guidelines** → **Save page** to re-check now (or wait for the daily re-check at 2 AM).
5. Expect:
   - the deadline at the top and the days-left count change;
   - the deadline requirement shows **Changed**, with the old and new wording side by side and a short summary;
   - an alert on the **Alerts** page, and an alert email (Mailpit at http://localhost:8025 unless you set up
     Brevo or Gmail).

Other things to try: change only the **Award notification** date (it is not the application deadline, so the
scholarship's deadline must not move), raise the minimum GPA on `eligibility.html`, or remove a document from
**What to submit**.

Each re-check that finds a change uses Gemini twice (reading the page, then summarising the change). On the free tier
(20 requests a day) that is plenty for a few tests a day.
