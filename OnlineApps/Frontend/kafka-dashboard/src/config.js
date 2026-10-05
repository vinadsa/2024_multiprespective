// Central configuration for the GO-TR dashboard.

export const DEFAULT_API_URL = 'http://localhost:8000';
export const DEFAULT_WS_URL = 'ws://localhost:8000/ws';

export const DEFAULT_CONFIG = {
  mode: 'online',
  conformance: 'continue',
  apiUrl: DEFAULT_API_URL,
  wsUrl: DEFAULT_WS_URL,
};

export const MODE_LABELS = {
  online: 'Online (Control-Flow)',
  multi: 'Multi-organizational',
};

// localStorage keys
export const ALERTS_STORAGE_KEY = 'gotr_alerts_v2';
export const CONFIG_STORAGE_KEY = 'gotr_config_v1';
export const THEME_STORAGE_KEY = 'theme';

// Limits & timings
export const MAX_STORED_ALERTS = 200;
export const SYNC_PAGE_LIMIT = 100;
export const SYNC_INTERVAL_MS = 30_000;
export const RECONNECT_DELAY_MS = 5_000;
export const PERSIST_DEBOUNCE_MS = 1_000;
export const STATUS_MESSAGE_MS = 3_000;
export const BOOTSTRAP_TIMEOUT_MS = 3_000;

// WebSocket message types that carry an alert payload
export const ALERT_MESSAGE_TYPES = new Set(['deviation_alert', 'critical_alert']);
