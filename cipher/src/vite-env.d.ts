/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Room server origin, e.g. wss://cipher-rooms.example.workers.dev. Unset = online rooms unavailable. */
  readonly VITE_CIPHER_SERVER?: string;
}
