import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ChevronRight,
  Terminal,
  Cpu,
  RefreshCw,
  Search
} from 'lucide-react';
import CallDetails from './CallDetails';

const CallHistory = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState(null);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/calls');
      setCalls(res.data);
    } catch (err) {
      console.error('Failed to fetch calls', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const getStatusBadge = (outcome) => {
    const cls = outcome === 'transferred' ? 'badge-success' :
      outcome === 'error' ? 'badge-error' : '';
    return <span className={`badge ${cls}`}>{outcome}</span>;
  };

  return (
    <div className="geth-history">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '10px' }}>DEPLOYMENT_LOGS</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SEQUENCE_TRACE_V1.0_STABLE</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button className="btn" style={{ background: 'transparent', color: 'var(--accent-color)' }} onClick={fetchCalls}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            REFRESH
          </button>
        </div>
      </div>

      <div className="call-table-container">
        <table>
          <thead>
            <tr>
              <th>HEX_SID</th>
              <th>DIR</th>
              <th>TO_NUMBER</th>
              <th>INTENT_TAG</th>
              <th>OUTCOME_STATUS</th>
              <th>TIME_MS</th>
              <th>STAMP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id} onClick={() => setSelectedCall(call)} style={{ cursor: 'pointer' }}>
                <td style={{ color: 'var(--accent-color)', opacity: 0.7 }}>
                  {call.call_id.substring(0, 8).toUpperCase()}
                </td>
                <td style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>{call.direction}</td>
                <td style={{ color: 'var(--text-primary)' }}>{call.to_number || call.from_number}</td>
                <td style={{ fontWeight: 700, color: call.intent === 'available' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                  {call.intent ? call.intent.toUpperCase() : 'NO_INTENT'}
                </td>
                <td>{getStatusBadge(call.outcome)}</td>
                <td style={{ fontFamily: 'monospace' }}>{Math.round(call.duration_ms)}MS</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {new Intl.DateTimeFormat('en-GB', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
                  }).format(new Date(call.created_at))}
                </td>
                <td>
                  <ChevronRight size={14} color="var(--accent-color)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {calls.length === 0 && !loading && (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
            [ EMPTY_LOG_STREAM ]
          </div>
        )}
      </div>

      {selectedCall && (
        <CallDetails
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
        />
      )}

      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CallHistory;
