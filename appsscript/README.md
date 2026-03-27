# Apps Script API Backend (Keep/Delete Guide)

This folder contains only the backend code that must live in your Google Apps Script project.

## Keep in Apps Script project

- `WebAppHost.gs`
- `DiarySheetStore.gs`
- `appsscript.json`

## Delete from Apps Script project

Do NOT upload frontend/static files to Apps Script anymore:

- `index.html`
- `app.js`
- `styles.css`
- `transport.js`
- `config.js`
- `.github/`, `dev/`, and other local/web files

Apps Script is API-only now.

## Required setup in Apps Script

1. Open Script Properties and set:
   - `GOOGLE_AI_API_KEY` = your Google AI Studio API key
2. In `WebAppHost.gs`, set:
   - `APP_CONFIG.SS_ID`
   - `APP_CONFIG.SHEET_GID`
3. Deploy as Web App (`/exec` URL).

Sheet columns (in order):

- `Timestamp`
- `created_at`
- `raw_text`
- `title`
- `summary`
- `tags`
- `sentiment`

## Frontend wiring

GitHub Pages frontend uses `config.js` with:

- `APPS_SCRIPT_URL` (in GitHub Environment secret)

The frontend calls Apps Script via HTTP:

- `GET ?action=list`
- `POST { action, payload }`

Supported actions:

- `create`
- `update`
- `delete`
- `import`
- `append_tag`
- `ai_diary_input`
