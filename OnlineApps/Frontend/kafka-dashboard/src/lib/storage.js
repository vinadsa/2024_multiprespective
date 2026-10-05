import { ALERTS_STORAGE_KEY, CONFIG_STORAGE_KEY, MAX_STORED_ALERTS } from '../config';

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`Failed to read "${key}" from localStorage:`, error);
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write "${key}" to localStorage:`, error);
  }
}

/**
 * Returns `{ alerts, since }`.
 * `since` is the newest server timestamp already seen/acknowledged — it must
 * outlive "Clear All Alerts", otherwise the next full sync re-downloads
 * everything the user just cleared.
 */
export function loadStoredAlerts() {
  const data = readJson(ALERTS_STORAGE_KEY);
  return {
    alerts: Array.isArray(data?.alerts) ? data.alerts : [],
    since: typeof data?.since === 'string' ? data.since : null,
  };
}

export function saveStoredAlerts(alerts, since) {
  writeJson(ALERTS_STORAGE_KEY, {
    alerts: alerts.slice(0, MAX_STORED_ALERTS),
    since,
    savedAt: new Date().toISOString(),
  });
}

/** Removes alerts AND the watermark (use when the backend itself was reset). */
export function clearStoredAlerts() {
  localStorage.removeItem(ALERTS_STORAGE_KEY);
}

export function loadStoredConfig() {
  return readJson(CONFIG_STORAGE_KEY);
}

export function saveStoredConfig(config) {
  writeJson(CONFIG_STORAGE_KEY, config);
}
