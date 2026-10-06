import { Check, CheckCircle2 } from 'lucide-react';

/**
 * Accessible Cupertino Native card-style radio group.
 * Supports top category badges, icon bubbles, verified marks, footer labels, and custom radio checks.
 */
export default function OptionCardGroup({
  name,
  legend,
  categoryTag = null,
  description = null,
  options = [],
  value,
  onChange,
}) {
  return (
    <fieldset className="settings-section">
      <div className="settings-section__header">
        <div className="settings-section__title-wrap">
          <legend className="settings-section__title">{legend}</legend>
          {categoryTag && <span className="settings-section__tag">{categoryTag}</span>}
        </div>
        {description && <p className="settings-section__desc">{description}</p>}
      </div>

      <div className="settings-cards-grid">
        {options.map((opt) => {
          const checked = opt.value === value;
          const Icon = opt.Icon;

          return (
            <label
              key={opt.value}
              className={`settings-card ${checked ? 'settings-card--selected' : ''}`}
            >
              <input
                type="radio"
                id={`${name}-${opt.value}`}
                className="visually-hidden"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
              />

              {/* Card Top: Icon Bubble & Badge */}
              <div className="settings-card__top">
                <span className={`settings-card__icon-bubble ${checked ? 'settings-card__icon-bubble--active' : ''}`}>
                  {Icon && <Icon size={20} strokeWidth={2.2} />}
                </span>
                {opt.badge && (
                  <span className={`settings-card__badge settings-card__badge--${opt.badgeTone || 'neutral'}`}>
                    {opt.badge}
                  </span>
                )}
              </div>

              {/* Card Body: Title & Description */}
              <div className="settings-card__body">
                <div className="settings-card__title-row">
                  <span className="settings-card__title">{opt.title}</span>
                  {opt.isVerified && (
                    <span className="settings-card__verified" title="Verified Policy Model">
                      <CheckCircle2 size={15} fill="var(--system-blue)" stroke="#ffffff" />
                    </span>
                  )}
                </div>
                <p className="settings-card__desc">{opt.description}</p>
              </div>

              {/* Card Footer: Metadata label & Radio Checkmark */}
              <div className="settings-card__footer">
                <span className={`settings-card__footer-label ${checked ? 'settings-card__footer-label--active' : ''}`}>
                  {opt.footerLabel}
                </span>

                <span className={`settings-card__radio ${checked ? 'settings-card__radio--checked' : ''}`} aria-hidden="true">
                  {checked ? <Check size={13} strokeWidth={3} /> : null}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
