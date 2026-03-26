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
  WebAppHost.gs + DiarySheetStore.gs
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
| `WebAppHost.gs` | Apps Script JSON API entrypoint (`doGet`, `doPost`). |
| `DiarySheetStore.gs` | Google Sheets persistence and domain logic. |
| `dev/local-preview-server.js` | Local dev server (static assets + optional API proxy). |

## Configure backend (Apps Script)

In `WebAppHost.gs`, set:

- `APP_CONFIG.SS_ID`
- `APP_CONFIG.SHEET_GID`

Deploy Apps Script as **Web app** and copy the `/exec` URL.

The backend sheet expects columns:
`id`, `created_at`, `raw_text`, `summary`, `tags`, `sentiment`

## Configure frontend (GitHub Pages)

Edit `config.js`:

```js
window.DIARY_APP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};
```

Commit/push, then publish from GitHub Pages (branch-based Pages is fine).

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
  `{ "action": "create"|"update"|"delete"|"import"|"append_tag", "payload": { ... } }`
