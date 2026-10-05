import { useEffect, useState } from 'react';
import ConfigForm from './components/ConfigForm';
import MonitorView from './components/MonitorView';
import ThemeToggle from './components/ThemeToggle';
import { BOOTSTRAP_TIMEOUT_MS, DEFAULT_CONFIG } from './config';
import { useTheme } from './hooks/useTheme';
import { fetchConfiguration } from './lib/api';
import { clearStoredAlerts, loadStoredConfig, saveStoredConfig } from './lib/storage';
import './App.css';

const getInitialConfig = () => ({ ...DEFAULT_CONFIG, ...loadStoredConfig() });

/**
 * App shell. Phases:
 *  - checking:    ask the backend whether the consumer is already configured
 *  - configuring: show ConfigForm
 *  - monitoring:  show MonitorView (owns WebSocket + sync lifecycle)
 */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [phase, setPhase] = useState('checking');
  const [config, setConfig] = useState(getInitialConfig);

  // Resume monitoring after a page refresh if the backend is already configured,
  // instead of forcing the user to re-POST /api/configure (which could reset data).
  useEffect(() => {
    const { apiUrl } = getInitialConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
    let cancelled = false;

    fetchConfiguration(apiUrl, controller.signal)
      .then((server) => {
        if (cancelled) return;
        if (server.is_configured) {
          setConfig((prev) => ({ ...prev, mode: server.mode ?? prev.mode }));
          setPhase('monitoring');
        } else {
          setPhase('configuring');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('configuring');
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const handleConfigured = (nextConfig) => {
    // A backend reset wipes server-side alerts; drop the stale local cache too.
    if (nextConfig.conformance === 'reset') clearStoredAlerts();
    saveStoredConfig(nextConfig);
    setConfig(nextConfig);
    setPhase('monitoring');
  };

  return (
    <>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />

      {phase === 'checking' && (
        <main className="boot-screen" aria-busy="true">
          <span className="spinner spinner--accent" aria-hidden="true" />
          <p>Connecting to GO-TR backend...</p>
        </main>
      )}

      {phase === 'configuring' && (
        <ConfigForm initialConfig={config} onConfigured={handleConfigured} />
      )}

      {phase === 'monitoring' && (
        <MonitorView config={config} onReconfigure={() => setPhase('configuring')} />
      )}
    </>
  );
}