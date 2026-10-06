// Pure helpers for working with GO-TR alert payloads.

export const DEVIATION_TITLES = {
  missing_token: 'Missing Token (Sequence/SOP Violation)',
  organizational: 'Organizational Violation (Unauthorized Role)',
  unknown_activity: 'Unknown Activity (Activity not in SOP)',
};

export const ORG_ISSUE_TEXT = {
  wrong_team: 'The resource does not belong to the required team.',
  wrong_structure: 'The resource does not have the required role for this activity.',
};

export const getDeviationTitle = (type) => DEVIATION_TITLES[type] ?? type ?? 'Unknown';

export const isCritical = (alert) => alert.type === 'critical_alert';

// Mirrors the backend id format: f"{timestamp}_{case_id}"
export const getAlertId = (alert) => alert.alert_id ?? `${alert.timestamp}_${alert.case_id}`;

export function toTime(timestamp) {
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? 0 : time;
}

export function formatTimestamp(timestamp) {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return String(timestamp ?? '');
  const d = new Date(time);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${timeStr} • ${dateStr}`;
}

/** Returns whichever timestamp string is newer (keeps the original server format). */
export function newerTimestamp(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return toTime(b) > toTime(a) ? b : a;
}

/**
 * Merge incoming alerts into the current list (deduplicated by id),
 * sorted newest-first and capped at `max`. Returns `current` unchanged
 * when nothing new was added so React can bail out of re-rendering.
 */
export function mergeAlerts(current, incoming, max) {
  if (!incoming?.length) return current;

  const byId = new Map(current.map((alert) => [alert.alert_id, alert]));
  let changed = false;

  for (const raw of incoming) {
    const id = getAlertId(raw);
    if (!byId.has(id)) {
      byId.set(id, { ...raw, alert_id: id });
      changed = true;
    }
  }

  if (!changed) return current;

  return [...byId.values()]
    .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp))
    .slice(0, max);
}

/**
 * Normalise both payload shapes (single `deviation_type` + `details`,
 * or multi-perspective `violations[]`) into one list.
 */
export function getViolations(alert) {
  const details = alert.details ?? {};

  if (Array.isArray(alert.violations) && alert.violations.length > 0) {
    return alert.violations.map((v) => ({
      type: v.type,
      activity: v.activity ?? details.activity,
      actor: v.actor ?? v.resource ?? details.actor ?? details.resource,
      orgIssues: v.org_issues ?? details.org_issues ?? [],
    }));
  }

  return [{
    type: alert.deviation_type,
    activity: details.activity,
    actor: details.resource ?? details.actor,
    orgIssues: details.org_issues ?? [],
  }];
}
