import { useCallback, useEffect, useRef, useState } from 'react';
import ConfigForm from './components/ConfigForm';
import HeaderBar from './components/HeaderBar';
import ModelView from './components/ModelView';
import MonitorView from './components/MonitorView';
import Sidebar from './components/Sidebar';
import { BOOTSTRAP_TIMEOUT_MS, DEFAULT_CONFIG } from './config';
import { useAlertStream } from './hooks/useAlertStream';
import { useTheme } from './hooks/useTheme';
import { fetchConfiguration } from './lib/api';
import { clearStoredAlerts, loadStoredConfig, saveStoredConfig } from './lib/storage';
import './App.css';

const getInitialConfig = () => ({ ...DEFAULT_CONFIG, ...loadStoredConfig() });

/**
 * Connected Monitoring Shell (mounted once configured).
 * Maintains background WebSocket connection across tab changes.
 */
function MonitoringWorkspace({ config, onReconfigure, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = useState('monitor');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const configFormRef = useRef(null);

  const {
    alerts,
    stats,
    activeCasesList,
    latestLifecycleEvent,
    connectionStatus,
    statusMessage,
    syncNow,
    clearAlerts,
  } = useAlertStream(config);

  const handleSyncWithFeedback = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncNow();
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [syncNow]);

  const handleInspectCase = useCallback((caseId) => {
    setSelectedCaseId(caseId);
    setActiveTab('model');
  }, []);

  return (
    <div className="app-shell">
      {/* Cupertino Native Sidebar (NO traffic lights) */}
      <Sidebar
        currentTab={activeTab}
        onSelectTab={setActiveTab}
        connectionStatus={connectionStatus}
        engineMode={config.mode}
        onSync={handleSyncWithFeedback}
        isSyncing={isSyncing}
      />

      {/* Main App Workspace */}
      <div className="app-workspace">
        <HeaderBar
          currentTab={activeTab}
          title={activeTab === 'monitor' ? 'GO-TR Real-time Deviation Monitor' : 'Engine Settings'}
          onReconfigure={() => setActiveTab('settings')}
          onRevertDefaults={() => configFormRef.current?.revertToDefaults()}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />

        <div className={`app-content-scroll ${activeTab === 'model' ? 'app-content-scroll--canvas' : ''}`}>
          {activeTab === 'monitor' && (
            <MonitorView
              alerts={alerts}
              stats={stats}
              activeCasesList={activeCasesList}
              statusMessage={statusMessage}
              clearAlerts={clearAlerts}
              onInspectCase={handleInspectCase}
            />
          )}

          {activeTab === 'model' && (
            <ModelView
              apiUrl={config.apiUrl}
              theme={theme}
              selectedCaseId={selectedCaseId}
              onSelectCase={setSelectedCaseId}
              activeCasesList={activeCasesList}
              latestLifecycleEvent={latestLifecycleEvent}
            />
          )}

          {activeTab === 'settings' && (
            <div className="settings-panel-container">
              <ConfigForm
                ref={configFormRef}
                initialConfig={config}
                onConfigured={(next) => {
                  onReconfigure(next);
                  setActiveTab('monitor');
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * App Root Orchestrator
 */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [phase, setPhase] = useState('checking');
  const [config, setConfig] = useState(getInitialConfig);

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
    if (nextConfig.conformance === 'reset') clearStoredAlerts();
    saveStoredConfig(nextConfig);
    setConfig(nextConfig);
    setPhase('monitoring');
  };

  return (
    <>
      {phase === 'checking' && (
        <main className="boot-screen" aria-busy="true">
          <div className="boot-screen__logo" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="9" fill="var(--system-blue)" />
              <circle cx="18" cy="18" r="10" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
              <circle cx="18" cy="18" r="6.2" stroke="white" strokeWidth="2" strokeOpacity="0.75" />
              <circle cx="18" cy="18" r="2.8" fill="white" />
            </svg>
          </div>
          <span className="spinner spinner--accent" aria-hidden="true" />
          <p className="boot-screen__text">Connecting to GO-TR Process Engine...</p>
        </main>
      )}

      {phase === 'configuring' && (
        <div className="app-shell app-shell--unconfigured">
          <Sidebar
            currentTab="settings"
            onSelectTab={() => {}}
            connectionStatus="disconnected"
            engineMode={config.mode}
            onSync={() => {}}
          />
          <div className="app-workspace">
            <HeaderBar
              title="GO-TR Engine Configuration"
              onReconfigure={() => {}}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
            <div className="app-content-scroll">
              <div className="settings-panel-container">
                <ConfigForm initialConfig={config} onConfigured={handleConfigured} />
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'monitoring' && (
        <MonitoringWorkspace
          config={config}
          onReconfigure={handleConfigured}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
    </>
  );
}