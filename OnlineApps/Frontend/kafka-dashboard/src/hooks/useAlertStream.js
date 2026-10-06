import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALERT_MESSAGE_TYPES,
  CASE_LIFECYCLE_TYPE,
  CONFIG_MESSAGE_TYPE,
  MAX_STORED_ALERTS,
  PERSIST_DEBOUNCE_MS,
  RECONNECT_DELAY_MS,
  STATUS_MESSAGE_MS,
  SYNC_INTERVAL_MS,
  SYNC_PAGE_LIMIT,
} from '../config';
import { fetchRecentAlerts, fetchStatus } from '../lib/api';
import { getAlertId, isCritical, mergeAlerts, newerTimestamp } from '../lib/alerts';
import { loadStoredAlerts, saveStoredAlerts } from '../lib/storage';

const newestTimestampOf = (alerts) =>
  alerts.reduce((latest, alert) => newerTimestamp(latest, alert.timestamp), null);

/**
 * Owns the real-time alert pipeline for the monitor view:
 * localStorage cache → REST sync (incremental) → WebSocket push.
 *
 * The hook is meant to be mounted only while monitoring; unmounting it
 * closes the socket and stops every timer.
 */
export function useAlertStream({ apiUrl, wsUrl }) {
  const [initial] = useState(() => {
    const stored = loadStoredAlerts();
    const alerts = mergeAlerts([], stored.alerts, MAX_STORED_ALERTS);
    return { alerts, since: newerTimestamp(stored.since, newestTimestampOf(alerts)) };
  });
  const [alerts, setAlerts] = useState(initial.alerts);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeCases, setActiveCases] = useState(0);
  const [activeCasesList, setActiveCasesList] = useState([]);
  const [latestLifecycleEvent, setLatestLifecycleEvent] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Latest alerts for async callbacks (avoids stale closures).
  const alertsRef = useRef(alerts);
  // Newest server timestamp ever seen. Persisted and intentionally NOT reset on
  // "clear", so cleared alerts aren't re-downloaded on the next sync — even
  // after Reconfigure (which remounts this hook) or a page refresh.
  const sinceRef = useRef(initial.since);
  const statusTimerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // One AbortController per mount; cancels in-flight requests on unmount.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      controller.abort();
      clearTimeout(statusTimerRef.current);
    };
  }, []);

  const showStatus = useCallback((message, isError = false) => {
    clearTimeout(statusTimerRef.current);
    setStatusMessage({ message, isError });
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_MS);
  }, []);

  const ingest = useCallback((incoming) => {
    if (!incoming.length) return;
    sinceRef.current = newerTimestamp(sinceRef.current, newestTimestampOf(incoming));
    setAlerts((prev) => mergeAlerts(prev, incoming, MAX_STORED_ALERTS));
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await fetchStatus(apiUrl, abortRef.current?.signal);
      if (typeof status.active_cases === 'number') setActiveCases(status.active_cases);
      if (Array.isArray(status.active_cases_list)) setActiveCasesList(status.active_cases_list);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Error fetching server status:', error);
    }
  }, [apiUrl]);

  const sync = useCallback(async ({ silent = false } = {}) => {
    if (!silent) showStatus('Syncing with server...');
    try {
      const known = new Set(alertsRef.current.map((a) => a.alert_id));
      const data = await fetchRecentAlerts(
        apiUrl,
        { limit: SYNC_PAGE_LIMIT, since: sinceRef.current },
        abortRef.current?.signal,
      );
      const incoming = Array.isArray(data.alerts) ? data.alerts : [];
      const fresh = incoming.filter((a) => !known.has(getAlertId(a)));
      ingest(fresh);
      await refreshStatus();

      if (!silent || fresh.length > 0) {
        showStatus(`Sync complete: found ${fresh.length} new alert${fresh.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Error syncing with server:', error);
      showStatus(`Sync failed: ${error.message}`, true);
    }
  }, [apiUrl, ingest, refreshStatus, showStatus]);

  // Initial sync + periodic polling.
  useEffect(() => {
    sync({ silent: true });
    const id = setInterval(() => sync({ silent: true }), SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sync]);

  // WebSocket with self-contained reconnect logic (StrictMode-safe).
  useEffect(() => {
    let socket = null;
    let retryTimer = null;
    let disposed = false;
    let hasOpened = false;

    const connect = () => {
      setConnectionStatus('connecting');
      try {
        socket = new WebSocket(wsUrl);
      } catch (error) {
        console.error('Invalid WebSocket URL:', error);
        setConnectionStatus('error');
        return;
      }

      socket.onopen = () => {
        setConnectionStatus('connected');
        // Fill any gap that happened while we were disconnected.
        if (hasOpened) sync({ silent: true });
        hasOpened = true;
      };

      socket.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (ALERT_MESSAGE_TYPES.has(data.type)) {
          ingest([data]);
        } else if (data.type === CASE_LIFECYCLE_TYPE) {
          setLatestLifecycleEvent(data);
          if (typeof data.active_cases_count === 'number') {
            setActiveCases(data.active_cases_count);
          }
          if (Array.isArray(data.active_cases)) {
            setActiveCasesList(data.active_cases);
          }
          if (data.action === 'started') {
            showStatus(`Case ${data.case_id} started: ${data.activity}`);
          } else if (data.action === 'completed') {
            showStatus(`Case ${data.case_id} completed (Fitness: ${(data.fitness ?? 1).toFixed(2)})`);
          } else if (data.action === 'timeout') {
            showStatus(`Case ${data.case_id} timed out after 30s inactivity.`);
          }
        } else if (data.type === CONFIG_MESSAGE_TYPE) {
          setActiveCases(0);
          setActiveCasesList([]);
          refreshStatus();
        }
      };

      socket.onerror = (error) => {
        // Closing a still-connecting socket on unmount (e.g. StrictMode) also fires onerror.
        if (!disposed) console.error('WebSocket error:', error);
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnectionStatus('disconnected');
        retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [wsUrl, ingest, sync, refreshStatus, showStatus]);

  // Debounced persistence instead of a blind 5s interval.
  useEffect(() => {
    const id = setTimeout(() => saveStoredAlerts(alerts, sinceRef.current), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [alerts]);

  // Flush on unmount (e.g. "Reconfigure") so a pending debounced save isn't lost.
  useEffect(() => () => saveStoredAlerts(alertsRef.current, sinceRef.current), []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    // Keep the watermark: only the local view is cleared, the server still has them.
    saveStoredAlerts([], sinceRef.current);
    showStatus('All local alerts have been cleared.');
  }, [showStatus]);

  const syncNow = useCallback(() => sync({ silent: false }), [sync]);

  const stats = useMemo(() => {
    const criticalCount = alerts.filter(isCritical).length;
    return {
      totalAlerts: alerts.length,
      criticalCount,
      deviationCount: alerts.length - criticalCount,
      activeCases,
    };
  }, [alerts, activeCases]);

  return { alerts, stats, activeCasesList, latestLifecycleEvent, connectionStatus, statusMessage, syncNow, clearAlerts };
}
