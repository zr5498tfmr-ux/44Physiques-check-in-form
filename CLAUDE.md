# 44 Physiques — Project Notes

## ⚠️ Google account for ALL Apps Script changes
Every change to the Google Apps Script — for **both** the check-in form (this repo)
and the website progress dashboard (`-Team-44-Physiques-` repo) — MUST be made while
logged into the **Cindy Bot** Google account:

> **cindybot1231@gmail.com**

That account owns:
- the Apps Script project behind the live web app (deployment URL ends in
  `.../AKfycbzQsJLZGRyvYLWfbEOLjdBP-pLIyotG6GPfQXcQPUMaKGIStfG-57sXL8apAmLDXTgslw/exec`),
- the **"44 Physiques Check-In Data"** spreadsheet (with the `Athletes` access-code tab),
- the **"44 Physiques Check-Ins"** Drive folder (where athlete photos live).

Editing or deploying from any other Google login creates a **disconnected copy** and
the changes will NOT reach the live site. If a `script.google.com/macros/u/1/...`
URL shows "unable to open," you're in the wrong account — switch to Cindy Bot.

## How the system fits together
- **`index.html`** — the weekly check-in form (GitHub Pages). POSTs JSON to the
  Apps Script web app.
- **`google-apps-script.gs`** — the Apps Script source (paste into the editor; it is
  NOT auto-deployed by GitHub). Handles `doPost` (save photos to Drive, log a row,
  generate the athlete's 6-char access code, email coach + athlete) and `doGet`
  (JSONP `?action=history&email=&code=&callback=` for the dashboard).
- The website dashboard (`progress.html` in `-Team-44-Physiques-`) reads from the
  same web app via JSONP.

## Deploying an Apps Script change (in the Cindy Bot account)
1. Paste the full `google-apps-script.gs` over `Code.gs` → **Ctrl+S**.
2. Run **`testSetup`** (approve permission prompts).
3. (When photos changed) run **`backfillPhotos`** once.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
   The `/exec` URL stays the same, so the HTML files need no change.

## Verifying you're in the right project
Deploy → Manage deployments → the **Deployment ID** must start with
`AKfycbzQsJLZGRyvYLWfbEOLjdBP-pLIyotG6GP…`. If it doesn't, you're in the wrong
project/account.
