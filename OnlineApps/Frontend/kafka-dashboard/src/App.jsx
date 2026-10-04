import React, { useState, useEffect, useRef, useCallback } from 'react';
import "./App.css"

const GOTRMonitor = () => {
  // Configuration state
  const [isConfigured, setIsConfigured] = useState(false);
  const [wsUrl, setWsUrl] = useState('ws://localhost:8000/ws');
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const [mode, setMode] = useState('online');
  const [conformance, setConformance] = useState('continue');
  const [configError, setConfigError] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const reconnectIntervalRef = useRef(null);

  // Alerts state
  const [alertsMap] = useState(new Map());
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    totalAlerts: 0,
    criticalCount: 0,
    deviationCount: 0,
    activeCases: 0,
    syncedAlerts: 0
  });
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(null);

  // Constants
  const ALERTS_STORAGE_KEY = 'gotr_alerts_v2';
  const MAX_STORED_ALERTS = 200;
  const SYNC_INTERVAL = 30000;

  // Configure and start monitoring
  const handleConfigure = async () => {
    setConfigError('');
    setIsConfiguring(true);

    try {
      // Send configuration to API
      const response = await fetch(`${apiUrl}/api/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode, conformance })
      });

      const data = await response.json();

      if (data.status === 'success') {
        setIsConfigured(true);
        // Load from localStorage and start monitoring
        loadFromLocalStorage();
        await syncWithServer();
        connectWebSocket();
      } else {
        setConfigError(data.message || 'Configuration failed');
      }
    } catch (error) {
      setConfigError(`Configuration error: ${error.message}`);
    } finally {
      setIsConfiguring(false);
    }
  };

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connection') {
        console.log('Connection established:', data.message);
      } else if (data.type === 'deviation_alert' || data.type === 'critical_alert') {
        addAlert(data, 'websocket');
      }
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
      
      if (!reconnectIntervalRef.current) {
        reconnectIntervalRef.current = setInterval(() => {
          console.log('Attempting to reconnect...');
          connectWebSocket();
        }, 5000);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = websocket;
    setWs(websocket);
  }, [wsUrl]);

  // Alert management
  const addAlert = useCallback((alertData, source = 'unknown') => {
    if (!alertData.alert_id) {
      alertData.alert_id = `${alertData.timestamp}_${alertData.case_id}`;
    }
    
    if (alertsMap.has(alertData.alert_id)) {
      console.log(`Duplicate alert ignored: ${alertData.alert_id}`);
      return;
    }
    
    alertsMap.set(alertData.alert_id, alertData);
    
    // Update alerts array for rendering
    setAlerts(Array.from(alertsMap.values()).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    ).slice(0, MAX_STORED_ALERTS));
    
    updateStatistics();
  }, [alertsMap]);

  // Fixed statistics calculation based on 'type' field
  const updateStatistics = useCallback(() => {
    const alertsArray = Array.from(alertsMap.values());
    
    // Count based on 'type' field instead of 'severity'
    const criticalAlerts = alertsArray.filter(a => a.type === 'critical_alert');
    const deviationAlerts = alertsArray.filter(a => a.type === 'deviation_alert');
    
    setStats(prev => ({
      ...prev,
      totalAlerts: alertsMap.size,
      criticalCount: criticalAlerts.length,
      deviationCount: deviationAlerts.length,
      syncedAlerts: alertsMap.size
    }));
  }, [alertsMap]);

  // Local Storage
  const saveToLocalStorage = useCallback(() => {
    try {
        const dataToStore = {
            alerts: Array.from(alertsMap.values()).slice(0, MAX_STORED_ALERTS),
            lastSync: lastSyncTimestamp,
        };
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
    }, []);

  const loadFromLocalStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (!stored) return;
      
      const data = JSON.parse(stored);
      console.log(`Loading ${data.alerts.length} alerts from localStorage`);
      
      data.alerts.forEach(alert => addAlert(alert, 'localStorage'));
      setLastSyncTimestamp(data.lastSync);
      showSyncStatus(`Loaded ${data.alerts.length} alerts from local cache`);
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }, [addAlert]);

  // Server synchronization
  const apiUrlRef = useRef(apiUrl);
  apiUrlRef.current = apiUrl;
  const syncWithServer = useCallback(async () => {
    try {
        showSyncStatus('Syncing with server...');
        
        const url = lastSyncTimestamp 
            ? `${apiUrlRef.current}/api/alerts/recent?limit=100&since_timestamp=${lastSyncTimestamp}`
            : `${apiUrlRef.current}/api/alerts/recent?limit=100`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }
        const data = await response.json();

        let newAlerts = 0;
        data.alerts.forEach(alert => {
          if (!alertsMap.has(alert.alert_id)) {
            addAlert(alert, 'server-sync');
            newAlerts++;
          }
        });

        setLastSyncTimestamp(new Date().toISOString());
        showSyncStatus(`Sync complete: Found ${newAlerts} new alerts.`);

        await updateServerStats();
        } catch (error) {
        console.error('Error syncing with server:', error);
        showSyncStatus('Sync failed: ' + error.message, true);
        }
    }, []);

  const updateServerStats = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/stats`);
      if (!response.ok) return;
      const serverStats = await response.json();
      
      if (serverStats.active_cases !== undefined) {
        setStats(prev => ({ ...prev, activeCases: serverStats.active_cases }));
      }
    } catch (error) {
      console.error('Error fetching server stats:', error);
    }
  };

  const showSyncStatus = (message, isError = false) => {
    setSyncStatus({ message, isError });
    setTimeout(() => setSyncStatus(''), 3000);
  };

  // User actions
  const clearAlerts = () => {
    if (!window.confirm('Are you sure you want to clear all alerts? This only affects your local view.')) {
      return;
    }
    
    alertsMap.clear();
    setAlerts([]);
    updateStatistics();
    localStorage.removeItem(ALERTS_STORAGE_KEY);
    showSyncStatus('All local alerts have been cleared.');
  };

  const exportAlerts = () => {
    if (alertsMap.size === 0) {
      alert('No alerts to export.');
      return;
    }

    const alertsArray = Array.from(alertsMap.values());
    const headers = ['timestamp', 'case_id', 'deviation_type', 'type', 'severity', 'cumulative_score', 'message', 'event_history'];
    
    const escapeCSV = (str) => {
      if (str === null || str === undefined) return '';
      let result = String(str);
      if (result.includes(',') || result.includes('"') || result.includes('\n')) {
        result = '"' + result.replace(/"/g, '""') + '"';
      }
      return result;
    };

    const csvRows = [headers.join(',')];
    alertsArray.forEach(alert => {
      const row = [
        alert.timestamp,
        alert.case_id,
        alert.deviation_type,
        alert.type,
        alert.severity || '',
        alert.cumulative_score?.toFixed(4) || '0',
        alert.message,
        alert.event_history ? alert.event_history.join(' | ') : ''
      ].map(escapeCSV);
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `gotr-alerts-${date}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Effects
  useEffect(() => {
      if (!isConfigured) return;

      connectWebSocket();

      return () => {
          if (reconnectIntervalRef.current) {
              clearInterval(reconnectIntervalRef.current);
          }
          if (wsRef.current) {
              wsRef.current.close();
          }
      };
  }, [isConfigured, connectWebSocket]);

  useEffect(() => {
      if (!isConfigured) return;

      const saveInterval = setInterval(saveToLocalStorage, 5000);
      const syncInterval = setInterval(syncWithServer, SYNC_INTERVAL);

      return () => {
          clearInterval(saveInterval);
          clearInterval(syncInterval);
      };
  }, [isConfigured]);

  // Configuration Form Component
  if (!isConfigured) {
    return (
      <div className="configuration-container">
        <div className="configuration-form modern-config">
          <div className="config-header">
            <h1 className="configuration-title">GO-TR Monitor</h1>
            <p className="config-subtitle">Configure your real-time process mining engine</p>
          </div>
          
          <div className="config-section">
            <h3 className="section-title">1. Conformance Mode</h3>
            <p className="section-desc">Select the depth of anomaly detection.</p>
            <div className="card-group">
              <div 
                className={`config-card ${mode === 'online' ? 'selected' : ''}`}
                onClick={() => setMode('online')}
              >
                <div className="card-header">
                  <span className="card-icon">⏱️</span>
                  <span className="card-title">Online (Control-Flow)</span>
                </div>
                <p className="card-desc">Standard mode. Evaluates if the event sequence follows the master Petri Net strictly (detects missing tokens or skipped tasks).</p>
              </div>
              <div 
                className={`config-card ${mode === 'multi' ? 'selected' : ''}`}
                onClick={() => setMode('multi')}
              >
                <div className="card-header">
                  <span className="card-icon">🏢</span>
                  <span className="card-title">Multi-organizational</span>
                </div>
                <p className="card-desc">Advanced mode. Evaluates control-flow PLUS organizational rules (validates if the actor has the correct Role and Team per the YAML config).</p>
              </div>
            </div>
          </div>
          
          <div className="config-section">
            <h3 className="section-title">2. Running Mode</h3>
            <p className="section-desc">Choose how the engine handles existing history and data.</p>
            <div className="card-group">
              <div 
                className={`config-card ${conformance === 'continue' ? 'selected' : ''}`}
                onClick={() => setConformance('continue')}
              >
                <div className="card-header">
                  <span className="card-icon">▶️</span>
                  <span className="card-title">Continue</span>
                </div>
                <p className="card-desc">Resume from where it left off. Preserves existing Replay Images in Neo4j and resumes Kafka from the last committed offset.</p>
              </div>
              <div 
                className={`config-card ${conformance === 'reset' ? 'selected' : ''}`}
                onClick={() => setConformance('reset')}
              >
                <div className="card-header">
                  <span className="card-icon">🔄</span>
                  <span className="card-title">Reset (Clean Slate)</span>
                </div>
                <p className="card-desc">Start fresh. Deletes all Replay Images in Neo4j, flushes memory buffers, and resets Kafka to read from the beginning.</p>
              </div>
            </div>
          </div>

          <details className="advanced-settings">
            <summary>Advanced Settings</summary>
            <div className="form-group advanced-group">
              <label htmlFor="wsUrl">WebSocket Server URL:</label>
              <input
                id="wsUrl"
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://localhost:8000/ws"
                required
              />
              <small className="help-text">Only change this if the backend is running on a different host/port.</small>
            </div>
          </details>

          <div className="action-section">
            <button 
              onClick={handleConfigure} 
              type="button" 
              className={`configure-button pulse ${isConfiguring ? 'loading' : ''}`}
              disabled={isConfiguring}
            >
              {isConfiguring ? (
                <span className="loading-text">
                  <span className="spinner"></span> Configuring...
                </span>
              ) : 'Start Monitoring'}
            </button>
            
            {configError && (
              <div className="error-message bounce-in">
                ⚠️ {configError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
    
  // Main Monitor Component
  return (
    <div className="monitor-container">
      <h1 className="monitor-title">GO-TR Real-time Deviation Monitor</h1>
      
      <div className={`status ${connectionStatus}`}>
        {connectionStatus === 'connected' ? 'Connected' : 'Disconnected - Reconnecting...'}
      </div>
      
      <div className="stats">
        <div className="stat-item">
          <div className="stat-value total">{stats.totalAlerts}</div>
          <div className="stat-label">Total Alerts</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-value critical-stat">{stats.criticalCount}</div>
          <div className="stat-label">Critical Alerts</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-value deviation-stat">{stats.deviationCount}</div>
          <div className="stat-label">Deviation Alerts</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-value active">{stats.activeCases}</div>
          <div className="stat-label">Active Cases</div>
        </div>
      </div>
      
      <div className="mode-indicator">
        Mode: <strong>{mode === 'multi' ? 'Multi-organizational' : 'Online'}</strong>
      </div>
      
      <div className="buttons">
        <button onClick={clearAlerts} className="danger">
          Clear All Alerts
        </button>
        <button onClick={exportAlerts} className="success">
          Export Alerts
        </button>
        <button onClick={syncWithServer}>
          Sync with Server
        </button>
      </div>
      
      {syncStatus && (
        <div className={`sync-status ${syncStatus.isError ? 'error' : ''}`}>
          {syncStatus.message}
        </div>
      )}
      
      <div className="alerts">
        {alerts.map((alert) => {
          const getDeviationTitle = (type) => {
            if (type === 'missing_token') return 'Missing Token (Sequence/SOP Violation)';
            if (type === 'organizational') return 'Organizational Violation (Unauthorized Role)';
            if (type === 'unknown_activity') return 'Unknown Activity (Activity not in SOP)';
            return type || 'Unknown';
          };
          
          return (
          <div 
            key={alert.alert_id} 
            className={`alert ${alert.type === 'critical_alert' ? 'critical-alert' : 'deviation'}`}
          >
            <div className="alert-header">
              <div className="alert-content">
                <div className="timestamp">{new Date(alert.timestamp).toLocaleString()}</div>
                <div className="case-id">Case: {alert.case_id}</div>
                
                <div className="deviation-title" style={{marginTop: "8px", fontSize: "1.1em", color: alert.type === 'critical_alert' ? '#ff4d4f' : '#faad14', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                  {(alert.violations && alert.violations.length > 0) ? (
                    alert.violations.map((v, idx) => (
                      <strong key={idx}>⚠️ {getDeviationTitle(v.type)}</strong>
                    ))
                  ) : (
                    <strong>⚠️ {getDeviationTitle(alert.deviation_type)}</strong>
                  )}
                </div>

                <div className="deviation-context" style={{marginTop: "8px", backgroundColor: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "4px"}}>
                  {(alert.violations && alert.violations.length > 0) ? (
                    alert.violations.map((v, idx) => (
                      <div key={idx} style={{marginBottom: idx < alert.violations.length - 1 ? '10px' : '0', paddingBottom: idx < alert.violations.length - 1 ? '10px' : '0', borderBottom: idx < alert.violations.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'}}>
                        {v.type === 'missing_token' && (
                          <div>
                            <strong>Context:</strong> Activity <code>{v.activity || alert.details?.activity}</code> was executed, but it is out of order or skipped a required prerequisite in the SOP.
                          </div>
                        )}
                        {v.type === 'organizational' && (
                          <div>
                            <strong>Context:</strong> Activity <code>{v.activity || alert.details?.activity}</code> was executed by <code>{v.actor || alert.details?.actor}</code>, but they do not have the required authorization.
                            <ul>
                              {v.org_issues?.includes('wrong_team') && <li>The resource does not belong to the required team.</li>}
                              {v.org_issues?.includes('wrong_structure') && <li>The resource does not have the required role for this activity.</li>}
                            </ul>
                          </div>
                        )}
                        {v.type === 'unknown_activity' && (
                          <div>
                            <strong>Context:</strong> Activity <code>{v.activity || alert.details?.activity}</code> is not recognized in the Master Model (SOP).
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <>
                      {alert.deviation_type === 'missing_token' && alert.details && (
                        <div>
                          <strong>Context:</strong> Activity <code>{alert.details.activity}</code> was executed, but it is out of order or skipped a required prerequisite in the SOP.
                        </div>
                      )}
                      
                      {alert.deviation_type === 'organizational' && alert.details && (
                        <div>
                          <strong>Context:</strong> Activity <code>{alert.details.activity}</code> was executed by <code>{alert.details.resource || alert.details.actor}</code>, but they do not have the required authorization.
                          <ul>
                            {alert.details.org_issues?.includes('wrong_team') && <li>The resource does not belong to the required team.</li>}
                            {alert.details.org_issues?.includes('wrong_structure') && <li>The resource does not have the required role for this activity.</li>}
                          </ul>
                        </div>
                      )}

                      {alert.deviation_type === 'unknown_activity' && alert.details && (
                        <div>
                          <strong>Context:</strong> Activity <code>{alert.details.activity}</code> is not recognized in the Master Model (SOP).
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                <div style={{marginTop: "8px"}}><strong>System Message:</strong> {alert.message}</div>
                <div><strong>Anomaly Score:</strong> {alert.cumulative_score?.toFixed(2) || '0.00'}</div>
                
                {alert.event_history && alert.event_history.length > 0 && (
                  <div style={{marginTop: "8px", fontSize: "0.9em", color: "#888"}}>
                    <strong>Recent History:</strong> {alert.event_history.join(' ➔ ')}
                  </div>
                )}
              </div>
              <div className={`alert-badge ${alert.type === 'critical_alert' ? 'critical' : 'deviation'}`}>
                {alert.type === 'critical_alert' ? 'CRITICAL' : 'DEVIATION'}
              </div>
            </div>
          </div>
        )})}
        {alerts.length === 0 && (
          <div className="no-alerts">
            No alerts yet. Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
};

export default GOTRMonitor;