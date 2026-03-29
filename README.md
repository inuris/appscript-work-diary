# Diary (GitHub Pages frontend + Google Sheets backend)

This project now publishes the website from **GitHub Pages** and keeps data in **Google Sheets** through a deployed **Apps Script Web App API**.

## Architecture

```text
GitHub Pages (static files)
  index.html + app.js + transport.js + styles.css + config.js
      |
      | fetch (GET/POST JSON)
      v
Apps Script Web App (/exec)
  appsscript/WebAppHost.gs + appsscript/DiarySheetStore.gs
      |
      v
Google Sheet (diary rows)
```

## Files

| File | Role |
|------|------|
| `index.html` | Static page shell (GitHub Pages entry). |
| `styles.css` | App styles. |
| `app.js` | UI behavior (search, create/update/delete/import, bulk actions). |
| `transport.js` | HTTP transport to Apps Script API. |
| `config.js` | Runtime config (`APPS_SCRIPT_URL`). |
| `appsscript/WebAppHost.gs` | Apps Script JSON API entrypoint (`doGet`, `doPost`). |
| `appsscript/DiarySheetStore.gs` | Google Sheets persistence and domain logic. |
| `appsscript/appsscript.json` | Apps Script manifest for API deployment. |
| `appsscript/README.md` | Keep/delete checklist for Apps Script-only backend. |
| `dev/local-preview-server.js` | Local dev server (static assets + optional API proxy). |

## Configure backend (Apps Script)

In `appsscript/WebAppHost.gs`, set:

- `APP_CONFIG.SS_ID`
- `APP_CONFIG.SHEET_GID`

Deploy Apps Script as **Web app** and copy the `/exec` URL.

The backend sheet expects columns in this order:
`Timestamp`, `created_at`, `raw_text`, `title`, `summary`, `tags`, `sentiment`

## Configure frontend (GitHub Pages)

This repo uses `.github/workflows/pages.yml` and environment **`work-diary`**.
At deploy time, the workflow writes `config.js` from:

- `secrets.APPS_SCRIPT_URL` (in environment `work-diary`)

So you do **not** need to commit the real Apps Script URL to source.

For local preview, you can still set `config.js` manually (or use the local proxy mode).

## Local preview

Run:

```bash
npm run preview
```

Then open:

`http://127.0.0.1:3333/`

Modes:

- **Offline local JSON store:** leave `DIARY_REMOTE_WEBAPP_URL` unset (`dev/local-diary-data.json`).
- **Live Google Sheet proxy mode:** set `DIARY_REMOTE_WEBAPP_URL` (or `APPS_SCRIPT_WEBAPP_URL`) to Apps Script `/exec`.

Example:

```bash
DIARY_REMOTE_WEBAPP_URL="https://script.google.com/macros/s/XXX/exec" npm run preview
```

## API contract

- `GET ?action=list` → `{ ok, entries }`
- `POST` JSON body:
  `{ "action": "create"|"update"|"delete"|"import"|"append_tag"|"ai_diary_input", "payload": { ... } }`
