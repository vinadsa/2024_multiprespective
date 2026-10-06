import { Handle, Position } from '@xyflow/react';

export default function PlaceNode({ data, targetPosition, sourcePosition }) {
  const { name, label, is_source, is_sink, token = 0, missing = 0 } = data;
  const isStart = is_source || name === 'source';
  const isEnd = is_sink || name === 'sink';
  const hasToken = token > 0;
  const hasMissing = missing > 0;

  const tPos = targetPosition === 'top' ? Position.Top : Position.Left;
  const sPos = sourcePosition === 'bottom' ? Position.Bottom : Position.Right;

  return (
    <div
      className={`petri-place ${isStart ? 'petri-place--start' : ''} ${isEnd ? 'petri-place--end' : ''} ${
        hasToken ? 'petri-place--token-active' : ''
      }`}
      title={`Place: ${name}${isStart ? ' (Start Marking)' : ''}${isEnd ? ' (Final Marking)' : ''}${
        hasToken ? ` • Tokens: ${token}` : ''
      }${hasMissing ? ` • Missing: ${missing}` : ''}`}
    >
      <Handle type="target" position={tPos} className="petri-handle" isConnectable={false} />

      <div className="petri-place__circle">
        {isEnd && <div className="petri-place__inner-ring" />}

        {hasToken ? (
          <div className="petri-place__token" title={`${token} active token(s)`}>
            {token > 1 ? token : ''}
          </div>
        ) : (
          <span className="petri-place__name">{label || name}</span>
        )}
      </div>

      {hasMissing && (
        <span className="petri-place__missing-badge" title={`${missing} missing token(s) inserted`}>
          ⚠️ +{missing}
        </span>
      )}

      {isStart && !hasMissing && <span className="petri-place__tag petri-place__tag--start">START</span>}
      {isEnd && !hasMissing && <span className="petri-place__tag petri-place__tag--end">END</span>}

      <Handle type="source" position={sPos} className="petri-handle" isConnectable={false} />
    </div>
  );
}
