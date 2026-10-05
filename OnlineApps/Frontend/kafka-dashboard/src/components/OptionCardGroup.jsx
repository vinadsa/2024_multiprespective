/**
 * Accessible card-style radio group (native radios, so arrow keys work).
 * options: [{ value, title, description, Icon }]
 */
export default function OptionCardGroup({ name, legend, description, options, value, onChange }) {
  return (
    <fieldset className="config-section">
      <legend className="section-title">{legend}</legend>
      {description && <p className="section-desc">{description}</p>}
      <div className="card-group">
        {options.map(({ value: optionValue, title, description: optionDesc, Icon }) => {
          const checked = optionValue === value;
          return (
            <label
              key={optionValue}
              className={`config-card${checked ? ' selected' : ''}`}
            >
              <input
                type="radio"
                id={`${name}-${optionValue}`}
                className="visually-hidden"
                name={name}
                value={optionValue}
                checked={checked}
                onChange={() => onChange(optionValue)}
              />
              <span className="card-header">
                {Icon && <Icon size={24} className="card-icon" aria-hidden="true" />}
                <span className="card-title">{title}</span>
              </span>
              <span className="card-desc">{optionDesc}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
