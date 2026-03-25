# Diary — Google Apps Script bundle

Upload these files into one Apps Script project bound to (or using) your Google Sheet.

## Files

| File | Type | Role |
|------|------|------|
| `Code.gs` | Server | Web app entry: `doGet` / `doPost`, `include()`, `google.script.run` API wrappers |
| `Repo.gs` | Server | Sheet read/write, import, tags — portable to another backend later |
| `Index.html` | HTML | Shell markup + `DIARY_APP_CONFIG` |
| `Styles.html` | HTML | `<style>` — mirror of repo `styles.css` |
| `ApiClient.html` | HTML | **Edit source only** — same code is **inlined in `Index.html`** (HtmlService often does not run `<script>` inside `include()` files). |
| `App.html` | HTML | Vue app (same behavior as root `diary.js`) |

## Configure

In `Code.gs`, set `APP_CONFIG.SS_ID` and `APP_CONFIG.SHEET_GID` to your spreadsheet and sheet tab.

Sheet columns (row 1): `id`, `created_at`, `raw_text`, `summary`, `tags`, `sentiment`.

## Deploy

1. **Deploy → New deployment** → type **Web app**.
2. Execute as: your account. Access: **Anyone** (or restrict if you prefer).
3. Open the `/exec` URL. The UI uses `google.script.run` (no CORS).

`ScriptApp.getService().getUrl()` is empty until a Web App deployment exists; `DIARY_APP_CONFIG.APPS_SCRIPT_URL` in the template may be blank on first save — redeploy or open **Manage deployments** and copy the URL.

## Portable API

- **GET** `?action=list` → JSON `{ ok, entries }`.
- **POST** body JSON: `{ "action": "create"|"update"|"delete"|"import"|"append_tag", "payload": { ... } }`.  
  External clients can use `Content-Type: text/plain` with the same JSON string to avoid CORS preflight where needed.

The root project (`index.html`, `diary.js`, `styles.css`) is the static copy for local hosting; point `APPS_SCRIPT_URL` at this web app for HTTP mode.
