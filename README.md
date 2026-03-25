# Diary (Google Apps Script)

Personal diary backed by a Google Sheet. This repo is the script project you copy into Apps Script (or sync with clasp).

## How the pieces fit together

```text
Browser (hosted UI from HtmlService — **no Vue**, vanilla JS + one list `innerHTML` paint per search)
    │
    │  window.DiaryTransport  ←─ list / create / update / …
    │         │
    ├─────────┼── google.script.run (same origin when served from GAS)
    │         │
    └─────────┴── fetch(webAppUrl)  (optional: static HTML / local server)
                  │
Server (.gs)      ▼
    WebAppHost.gs        doGet / doPost, api*, HTML template "Index"
           │
           ▼
    DiarySheetStore.gs   Sheet rows, import, tags (no HTTP)
```

| File | Role |
|------|------|
| **`WebAppHost.gs`** | Web app entry: `doGet` / `doPost`, `include()`, `google.script.run` handlers (`apiList`, …), `APP_CONFIG`. |
| **`DiarySheetStore.gs`** | All sheet logic: read/write entries, import, append tag. Callable from any future host. |
| **`Index.html`** | **Shell page**: markup, `DIARY_APP_CONFIG`, **inline** `window.DiaryTransport`, then `include('DiaryUiVanilla')` (~no framework). |
| **`DiaryTransport.inline.html`** | **Editable source** for that inline script — *not* loaded with `include()`; copy into `Index.html` after changes. |
| **`DiaryUiVanilla.html`** | **UI logic**: preload list once; `ref/script.js`-style match priority; **single DOM paint** for the entry list on each keystroke (fast, minimal JS). |
| **`DiaryStyles.html`** | CSS only (`include('DiaryStyles')`). |
| `appsscript.json` | Time zone, runtime, web-app defaults. |

**Why the odd “inline” file?** HtmlService often does **not** execute `<script>` inside files pulled in with `include()`. The transport **must** live in `Index.html` so `DiaryTransport` exists before `DiaryUiVanilla` runs. `DiaryTransport.inline.html` is the repo-friendly place to edit that logic; keep the two copies in sync.

## Configure

In **`WebAppHost.gs`**, set `APP_CONFIG.SS_ID` and `APP_CONFIG.SHEET_GID`.

Sheet row 1: `id`, `created_at`, `raw_text`, `summary`, `tags`, `sentiment`.

## Local preview

From the repo root, **`npm run preview`** (or `node dev/local-preview-server.js`) starts **`http://127.0.0.1:3333/`**. It assembles `Index.html` like HtmlService (`include` for styles + UI, sets `DIARY_APP_CONFIG.APPS_SCRIPT_URL` to that origin). The browser only talks to localhost; the Node process implements the same **`GET ?action=list`** and **`POST { action, payload }`** contract as `WebAppHost.gs`.

- **Offline / fake data:** leave **`DIARY_REMOTE_WEBAPP_URL`** unset. Entries live in **`dev/local-diary-data.json`** (gitignored).
- **Real Google Sheet (edit/delete against production data):** set **`DIARY_REMOTE_WEBAPP_URL`** (alias **`APPS_SCRIPT_WEBAPP_URL`**) to your deployed web app URL (`https://script.google.com/macros/s/…/exec`). The preview server **proxies** every list/create/update/delete/import/tag call to that URL, so Sheet behavior matches production while you iterate on HTML/CSS/JS locally. Use a deployment where the server can call the endpoint without an interactive login (e.g. **Execute as: Me**, **Who has access: Anyone** — or equivalent for your needs). **Node 18+** is required for this mode (`fetch`).

Examples: bash `DIARY_REMOTE_WEBAPP_URL="https://script.google.com/macros/s/XXX/exec" npm run preview` — PowerShell `$env:DIARY_REMOTE_WEBAPP_URL="https://script.google.com/macros/s/XXX/exec"; npm run preview`. Change the port with **`PORT`** (bash `PORT=4000 …`; PowerShell `$env:PORT=4000; …`).

**Cursor / VS Code:** press **F5** (or **Run → Start Debugging**). Pick **Local preview (offline JSON)** for `dev/local-diary-data.json`, or **Local preview (Google Sheet)** after copying **`.env.example`** to **`.env`** and setting **`DIARY_REMOTE_WEBAPP_URL`** (Cursor loads `.env` for that configuration). The integrated terminal shows the URL; open **`http://127.0.0.1:3333/`** in a browser.

## Deploy

1. **Deploy → New deployment** → **Web app**.
2. Execute as: you. Access: **Anyone** (or tighter if you prefer).
3. Use the `/exec` URL for the hosted UI.

`ScriptApp.getService().getUrl()` is empty until a deployment exists; `APPS_SCRIPT_URL` in the page may be blank until then.

## HTTP API (portable)

- **GET** `?action=list` → `{ ok, entries }`
- **POST** JSON: `{ "action": "create"|"update"|"delete"|"import"|"append_tag", "payload": { … } }`  
  Clients may send **`Content-Type: text/plain`** with the same JSON body to reduce CORS preflight.
