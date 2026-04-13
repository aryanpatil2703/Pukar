import React from 'react';
import { 
  Zap, 
  Target, 
  Clock, 
  AlertTriangle,
  Activity
} from 'lucide-react';

const Overview = ({ stats }) => {
  if (!stats) return null;

  const cards = [
    { 
      label: 'TOTAL_CALLS', 
      value: stats.total_calls, 
      icon: <Activity size={18} color="var(--accent-color)" />,
      sub: 'ALL_TIME_HISTORY'
    },
    { 
      label: 'TRANSFERRED', 
      value: stats.transferred, 
      icon: <Target size={18} color="var(--accent-color)" />,
      sub: `${Math.round((stats.transferred / stats.total_calls) * 100) || 0}%_SUCCESS_DETECTION`
    },
    { 
      label: 'AVG_TIME', 
      value: `${Math.round(stats.avg_duration_ms / 1000) || 0}S`, 
      icon: <Clock size={18} color="var(--accent-color)" />,
      sub: 'MS_PER_SESSION_AVG'
    },
    { 
      label: 'SYSTEM_ERRORS', 
      value: stats.errors || 0, 
      icon: <AlertTriangle size={18} color="#ef4444" />,
      sub: 'FAILURES_DETECTED'
    }
  ];

  return (
    <div className="geth-overview">
      <section style={{ marginBottom: '4rem' }}>
        <h1 style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>NETWORK_SNAPSHOT</h1>
        <div className="stats-grid">
          {cards.map((card, i) => (
            <div key={i} className="stats-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', opacity: 0.7 }}>
                <span className="stats-label">{card.label}</span>
                {card.icon}
              </div>
              <div className="stats-value">{card.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.75rem', textTransform: 'uppercase' }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid var(--border-color)', padding: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '2.5rem' }}>
          <ActivityIndicator active={stats.total_calls > 0} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>NODE_INTEGRITY_INDEX</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
          <div>
            <h3 style={{ fontSize: '0.75rem', marginBottom: '1.5rem', color: 'var(--accent-color)', opacity: 0.6 }}>INTENT_RECORDS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <IntentRow label="Available" value={stats.intent_available || 0} color="var(--accent-color)" />
              <IntentRow label="Not Available" value={stats.intent_not_available || 0} />
              <IntentRow label="Callback Later" value={stats.intent_callback || 0} />
              <IntentRow label="Unclear" value={stats.intent_unclear || 0} />
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '0.75rem', marginBottom: '1.5rem', color: 'var(--accent-color)', opacity: 0.6 }}>SYSTEM_DAEMONS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <StatusRow label="PG_RELATIONAL_DB" status="ONLINE" />
              <StatusRow label="REDIS_SESSION_STORE" status="STABLE" />
              <StatusRow label="GROQ_LLM_CLASSIFIER" status="OPERATIONAL" />
              <StatusRow label="STT_REALTIME_BRIDGE" status="ACTIVE" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const IntentRow = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid rgba(0, 255, 209, 0.1)', paddingBottom: '8px' }}>
    <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</span>
    <span style={{ color: color || 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
  </div>
);

const StatusRow = ({ label, status }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', marginBottom: '6px' }}>
    <div style={{ width: '4px', height: '4px', background: 'var(--accent-color)' }} />
    <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
    <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>{status}</span>
  </div>
);

const ActivityIndicator = ({ active }) => (
  <div style={{ position: 'relative', width: '12px', height: '12px' }}>
    <div style={{ 
      width: '12px', 
      height: '12px', 
      background: active ? 'var(--accent-color)' : '#1e2d31', 
      position: 'absolute'
    }} />
    {active && (
      <div style={{ 
        width: '12px', 
        height: '12px', 
        border: '1px solid var(--accent-color)',
        position: 'absolute',
        animation: 'ping 1.5s linear infinite'
      }} />
    )}
    <style>{`
      @keyframes ping {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(3.5); opacity: 0; }
      }
    `}</style>
  </div>
);

export default Overview;
