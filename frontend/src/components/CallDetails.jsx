import React from 'react';
import { X, FileText, Database, Radio, Clock, Activity, CornerDownRight } from 'lucide-react';

const CallDetails = ({ call, onClose }) => {
  if (!call) return null;

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-panel" onClick={e => e.stopPropagation()} style={{ borderLeft: '1.5px solid var(--accent-color)' }}>
        <header className="details-header" style={{ background: 'rgba(0, 255, 209, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: 'var(--accent-color)', padding: '10px' }}>
              <Database size={20} color="#000" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.9rem', letterSpacing: '0.15em' }}>SESSION_TRACE</h3>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--accent-color)', opacity: 0.8 }}>
                {call.call_id.toUpperCase()}
              </p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            [ X ]
          </button>
        </header>

        <div className="details-content">
          <section className="details-section">
            <h4 className="section-title">NODE_METRICS</h4>
            <div className="meta-grid" style={{ gap: '15px' }}>
              <MetaRow label="SRC" value={call.from_number || 'NULL_ADDR'} />
              <MetaRow label="DST" value={call.to_number || 'NULL_ADDR'} />
              <MetaRow label="TIME" value={new Date(call.created_at).toISOString().split('T')[1].split('.')[0]} />
              <MetaRow label="DUR" value={`${Math.round(call.duration_ms)}MS`} />
              <MetaRow label="STATUS" value={call.outcome.toUpperCase()} color="var(--accent-color)" />
            </div>
          </section>

          <section className="details-section">
            <h4 className="section-title">INTENT_CLASSIFICATION</h4>
            <div style={{ border: '1px solid var(--accent-color)', padding: '1.5rem', background: 'rgba(0, 255, 209, 0.02)' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                &gt; {call.intent ? call.intent.toUpperCase() : 'UNCERTAIN'}
              </div>
            </div>
          </section>

          <section className="details-section">
            <h4 className="section-title">TRANSCRIPTION_BUFFER</h4>
            <div className="transcript-box" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-dim)' }}>
              {call.transcript ? (
                <div style={{ fontSize: '0.85rem', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent-color)', marginRight: '8px' }}>[STREAM]:</span>
                  {call.transcript}
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.5 }}>
                  [ NO_AUDIO_DATA_CAPTURED ]
                </div>
              )}
            </div>
          </section>

          {call.error_message && (
            <section className="details-section">
              <h4 className="section-title" style={{ color: '#ef4444' }}>ERROR_TRACE</h4>
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.5rem', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                &gt; {call.error_message}
              </div>
            </section>
          )}
        </div>
      </div>

      <style>{`
        .details-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(2px);
          z-index: 100;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.15s steps(2);
        }

        .details-panel {
          width: 100%;
          max-width: 550px;
          background: #070b0d;
          height: 100%;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.2s steps(4);
        }

        .details-header {
          padding: 2rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--accent-color);
          cursor: pointer;
          font-weight: 700;
          font-size: 0.8rem;
          padding: 5px 10px;
        }

        .close-btn:hover {
          background: var(--accent-color);
          color: #000;
        }

        .details-content {
          flex: 1;
          overflow-y: auto;
          padding: 2.5rem;
        }

        .details-section {
          margin-bottom: 3.5rem;
        }

        .section-title {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
          font-weight: 800;
          border-left: 2px solid var(--border-dim);
          padding-left: 10px;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

const MetaRow = ({ label, value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '0.75rem' }}>
    <span style={{ color: 'var(--text-secondary)', width: '60px' }}>{label}:</span>
    <span style={{ color: color || 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
  </div>
);

export default CallDetails;
