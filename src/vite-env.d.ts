/// <reference types="vite/client" />

// Kilo AI Gateway configuration (dev convenience; runtime key comes from Settings).
interface ImportMetaEnv {
  readonly VITE_KILO_API_KEY?: string;
  readonly VITE_KILO_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
