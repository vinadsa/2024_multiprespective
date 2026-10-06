import { Activity, RotateCw, SlidersHorizontal } from 'lucide-react';
import { MODE_LABELS } from '../config';

const STATUS_CONFIG = {
  connected: { label: 'Connected', tone: 'connected' },
  connecting: { label: 'Connecting...', tone: 'connecting' },
  disconnected: { label: 'Disconnected', tone: 'disconnected' },
  error: { label: 'Error', tone: 'disconnected' },
};

export default function Sidebar({
  currentTab = 'monitor',
  onSelectTab,
  connectionStatus = 'connecting',
  engineMode = 'multi',
  onSync,
  isSyncing = false,
}) {
  const statusInfo = STATUS_CONFIG[connectionStatus] ?? STATUS_CONFIG.connecting;
  const modeLabel = MODE_LABELS[engineMode] ?? engineMode ?? 'Multi-organizational';

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="9" fill="var(--system-blue)" />
            <circle cx="18" cy="18" r="10" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
            <circle cx="18" cy="18" r="6.2" stroke="white" strokeWidth="2" strokeOpacity="0.75" />
            <circle cx="18" cy="18" r="2.8" fill="white" />
          </svg>
        </div>
        <div className="brand-info">
          <div className="brand-title-wrap">
            <span className="brand-title">GO-TR</span>
          </div>
          <span className="brand-subtitle">Deviation Monitor</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="sidebar-nav">
        <button
          type="button"
          className={`sidebar-nav-item ${currentTab === 'monitor' ? 'sidebar-nav-item--active' : ''}`}
          onClick={() => onSelectTab('monitor')}
        >
          <span className="nav-item-icon">
            <Activity size={18} />
          </span>
          <span className="nav-item-text">Real-time Monitor</span>
          <span className="nav-live-dot" title="Live stream active" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${currentTab === 'settings' ? 'sidebar-nav-item--active' : ''}`}
          onClick={() => onSelectTab('settings')}
        >
          <span className="nav-item-icon">
            <SlidersHorizontal size={18} />
          </span>
          <span className="nav-item-text">Engine Settings</span>
        </button>
      </nav>

      {/* Bottom Pinned Status Card */}
      <div className="sidebar-footer">
        <div className="sidebar-status-card">
          <div className="status-card-row status-card-header">
            <span className="status-card-caption">STATUS</span>
            <span className={`status-pill status-pill--${statusInfo.tone}`}>
              <span className="status-dot" aria-hidden="true" />
              {statusInfo.label}
            </span>
          </div>

          <div className="status-card-row status-mode-row">
            <span className="mode-label">Engine Mode</span>
            <span className="mode-val" title={modeLabel}>{modeLabel}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn-sidebar-sync"
          onClick={onSync}
          disabled={isSyncing}
          title="Sinkronisasi manual event & state dengan server"
        >
          <RotateCw size={14} className={isSyncing ? 'spin-icon' : ''} aria-hidden="true" />
          <span>Sync with Server</span>
        </button>
      </div>
    </aside>
  );
}
