import { Moon, RotateCcw, Settings, Sun } from 'lucide-react';

export default function HeaderBar({
  currentTab = 'monitor',
  title = 'GO-TR Real-time Deviation Monitor',
  onReconfigure,
  onRevertDefaults,
  theme = 'light',
  onToggleTheme,
}) {
  const isSettings = currentTab === 'settings';
  const isModel = currentTab === 'model';

  let displayTitle = title;
  if (isSettings) displayTitle = 'Engine Settings';
  else if (isModel) displayTitle = 'Master Process Model (Petri Net)';

  return (
    <header className="header-bar">
      <div className="header-bar__title-group">
        <h1 className="header-bar__title">{displayTitle}</h1>
      </div>

      <div className="header-bar__actions">
        {isSettings ? (
          <button
            type="button"
            className="header-btn header-btn--revert"
            onClick={onRevertDefaults}
            title="Reset form ke pengaturan default sistem"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Revert to Defaults</span>
          </button>
        ) : (
          <button
            type="button"
            className="header-btn header-btn--reconfigure"
            onClick={onReconfigure}
            title="Buka pengaturan engine & mode konformansi"
          >
            <Settings size={15} aria-hidden="true" />
            <span>Reconfigure</span>
          </button>
        )}

        <span className="header-divider" aria-hidden="true" />

        <button
          type="button"
          className="header-btn header-btn--theme"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
