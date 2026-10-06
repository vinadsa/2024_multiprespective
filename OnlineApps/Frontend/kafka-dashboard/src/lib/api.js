// Thin client for the KafkaConsumer FastAPI service (OnlineApps/Backend/KafkaConsumer/Main.py).

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Server responded with status ${response.status}`);
  }
  return response.json();
}

/** POST /api/configure — returns `{ status: 'success' | 'error', message, ... }`. */
export function configureConsumer(apiUrl, { mode, conformance }, signal) {
  return requestJson(`${apiUrl}/api/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, conformance }),
    signal,
  });
}

/** GET /api/configuration — `{ is_configured, mode }`. */
export function fetchConfiguration(apiUrl, signal) {
  return requestJson(`${apiUrl}/api/configuration`, { signal });
}

/** GET /api/status — `{ is_configured, mode, is_running, active_cases, active_cases_list, total_alerts, ... }`. */
export function fetchStatus(apiUrl, signal) {
  return requestJson(`${apiUrl}/api/status`, { signal });
}

/** GET /api/cases/active — `{ active_cases_count, cases }`. */
export function fetchActiveCases(apiUrl, signal) {
  return requestJson(`${apiUrl}/api/cases/active`, { signal });
}

/**
 * GET /api/alerts/recent
 * `since` must be a timestamp string exactly as emitted by the server
 * (naive local ISO), otherwise the backend's datetime comparison fails.
 */
export function fetchRecentAlerts(apiUrl, { limit, since }, signal) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since_timestamp', since);
  return requestJson(`${apiUrl}/api/alerts/recent?${params}`, { signal });
}

/** GET /api/model/master — `{ status: 'success', data: { nodes, edges, stats } }`. */
export function fetchMasterModel(apiUrl, signal) {
  return requestJson(`${apiUrl}/api/model/master`, { signal });
}

/** GET /api/cases/{caseId}/marking — `{ status: 'success', case_id, data: { marking, enabled_transitions, total_active_tokens, total_missing_tokens, is_active, ... } }`. */
export function fetchCaseMarking(apiUrl, caseId, signal) {
  return requestJson(`${apiUrl}/api/cases/${encodeURIComponent(caseId)}/marking`, { signal });
}

