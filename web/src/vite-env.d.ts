/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the API, e.g. https://bolalar-ai-api.onrender.com
   * Leave unset in development: the Vite dev server proxies /api to :4000.
   */
  readonly VITE_API_URL?: string;
  /**
   * Google OAuth client ID. When unset, the "continue with Google" button is
   * not rendered at all — a button that cannot work is worse than no button.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
