import React, { useState } from 'react';
import axios from 'axios';
import { Terminal, Send, Cpu, AlertCircle, CheckCircle } from 'lucide-react';

const Dialer = ({ config }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleDial = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await axios.post('/api/calls/outbound', { to: phoneNumber });
      setSuccess(true);
      setPhoneNumber('');
    } catch (err) {
      setError(err.response?.data?.error || 'CRITICAL_FAILURE: UNABLE_TO_INITIALIZE_PROTOCOL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="geth-dialer">
      <h1 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>SEQUENCE_OVERRIDE</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '3rem', borderLeft: '2px solid var(--accent-color)', paddingLeft: '1rem' }}>
        PROTOCOL: OUTBOUND_SEQUENCE_V2<br/>
        SYSTEM: MANUAL_DIALER_INIT<br/>
        ENCRYPTION: ENABLED
      </p>

      <div style={{ border: '1px solid var(--border-color)', padding: '3rem', background: 'var(--card-bg)' }}>
        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.7rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>ACTIVE_INTERFACE:</span>
          <span style={{ background: 'var(--accent-color)', color: '#000', padding: '2px 8px', fontWeight: 800 }}>{config?.provider?.toUpperCase()}</span>
        </div>

        <form onSubmit={handleDial}>
          <div style={{ position: 'relative', marginBottom: '2rem' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-color)', fontSize: '0.9rem', fontWeight: 700 }}>&gt;_</span>
            <input 
              type="tel" 
              placeholder="ADDR_ENTRY (E.164)" 
              className="search-input"
              style={{ width: '100%', paddingLeft: '3.5rem', fontSize: '1.1rem', backgroundColor: 'rgba(255,255,255,0.02)' }}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', height: '4rem', fontSize: '1rem' }}
            disabled={loading || !phoneNumber}
          >
            {loading ? 'RUNNING_SEQUENCE...' : 'INITIALIZE_PROTOCOL'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: '2rem', padding: '1.25rem', border: '1px solid #ef4444', color: '#ef4444', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.05)' }}>
            <div style={{ fontWeight: 900, marginBottom: '5px' }}>[!] FAULT_DETECTED</div>
            {error}
          </div>
        )}

        {success && (
          <div style={{ marginTop: '2rem', padding: '1.25rem', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', fontSize: '0.75rem', background: 'rgba(0, 255, 209, 0.05)' }}>
            <div style={{ fontWeight: 900, marginBottom: '5px' }}>[*] SEQUENCE_INITIALIZED</div>
            OUTBOUND_CHANNEL_ESTABLISHED. CHECK_DEPLOYMENT_LOGS.
          </div>
        )}
      </div>

      <section style={{ marginTop: '4rem' }}>
        <h3 style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>VALIDATION_CONSTRAINTS</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', lineHeight: '1.8', opacity: 0.6 }}>
          01 // TARGET_ADDRESS_MUST_COMPLY_WITH_E164<br/>
          02 // TRIAL_NODES_REQUIRE_PRE_VERIFICATION<br/>
          03 // RATE_LIMITING_ACTIVE_PER_INTERFACE
        </div>
      </section>
    </div>
  );
};

export default Dialer;
