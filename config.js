/**
 * Frontend runtime config.
 * - Local/dev: set APPS_SCRIPT_URL manually in this file.
 * - GitHub Pages workflow: this file is overwritten at deploy time from
 *   environment secret APPS_SCRIPT_URL.
 */
window.DIARY_APP_CONFIG = Object.assign(
  {
    APPS_SCRIPT_URL: "",
  },
  window.DIARY_APP_CONFIG || {}
);
