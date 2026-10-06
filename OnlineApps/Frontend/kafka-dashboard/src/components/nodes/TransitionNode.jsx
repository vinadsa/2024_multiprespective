import { Handle, Position } from '@xyflow/react';
import { Play, User } from 'lucide-react';

export default function TransitionNode({ data, targetPosition, sourcePosition }) {
  const { label, role, team, isEnabled, isActive } = data;
  const tPos = targetPosition === 'top' ? Position.Top : Position.Left;
  const sPos = sourcePosition === 'bottom' ? Position.Bottom : Position.Right;

  const roleOrTeam = role || team;

  return (
    <div
      className={`petri-transition ${isEnabled ? 'petri-transition--enabled' : ''} ${
        isActive ? 'petri-transition--active' : ''
      }`}
      title={`Transition: ${label}${role ? ` (${role})` : ''}${isEnabled ? ' [Enabled / Ready to fire]' : ''}${
        isActive ? ' [Last executed]' : ''
      }`}
    >
      <Handle type="target" position={tPos} className="petri-handle" isConnectable={false} />

      <div className="petri-transition__body">
        {roleOrTeam && (
          <div className="petri-transition__badge">
            <User size={10} aria-hidden="true" />
            <span className="petri-transition__role">{roleOrTeam}</span>
          </div>
        )}

        <div className="petri-transition__label-wrap">
          <span className="petri-transition__label">{label}</span>
        </div>

        {isEnabled && (
          <div className="petri-transition__status petri-transition__status--ready">
            <Play size={8} fill="currentColor" aria-hidden="true" />
            <span>READY</span>
          </div>
        )}

        {isActive && !isEnabled && (
          <div className="petri-transition__status petri-transition__status--fired">
            <span className="petri-transition__status-dot" />
            <span>LAST FIRED</span>
          </div>
        )}
      </div>

      <Handle type="source" position={sPos} className="petri-handle" isConnectable={false} />
    </div>
  );
}
