/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the API, e.g. https://bolalar-ai-api.onrender.com
   * Leave unset in development: the Vite dev server proxies /api to :4000.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
