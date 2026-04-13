import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart3, 
  History, 
  PhoneCall, 
  Settings, 
  Terminal, 
  Activity,
  ChevronRight,
  Search,
  ExternalLink,
  Cpu
} from 'lucide-react';
import './App.css';

// Components
import Overview from './components/Overview';
import CallHistory from './components/CallHistory';
import Dialer from './components/Dialer';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, configRes] = await Promise.all([
          axios.get('/api/stats'),
          axios.get('/api/config')
        ]);
        setStats(statsRes.data);
        setConfig(configRes.data);
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <>
      {/* SIDEBAR */}
      <nav className="sidebar">
        <div style={{ marginBottom: '3.5rem' }}>
          <div className="logo-frame">
            PUKAR
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--accent-color)', marginTop: '8px', opacity: 0.6, letterSpacing: '0.1em' }}>
            V2.4.0_STABLE
          </div>
        </div>

        <div className="nav-section">
          <p className="nav-title">MONITORING</p>
          <div 
            className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 size={16} />
            NODE_SNAPSHOT
          </div>
          <div 
            className={`nav-link ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} />
            HISTORY_LOGS
          </div>
        </div>

        <div className="nav-section">
          <p className="nav-title">INTERACTIONS</p>
          <div 
            className={`nav-link ${activeTab === 'dialer' ? 'active' : ''}`}
            onClick={() => setActiveTab('dialer')}
          >
            <PhoneCall size={16} />
            DIAL_SEQUENCE
          </div>
        </div>

        <div className="nav-section" style={{ marginTop: 'auto' }}>
          <p className="nav-title">INFRASTRUCTURE</p>
          <div className="nav-link">
            <Terminal size={16} />
            TERMINAL_DOCS
          </div>
          <div className="nav-link">
            <Cpu size={16} />
            CONFIG_MAP
          </div>
        </div>

        {config && (
          <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0, 255, 209, 0.05)', border: '1px solid var(--border-dim)', fontSize: '0.65rem' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>PRIMARY_INTERFACE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)', fontWeight: 800 }}>
              <div style={{ width: '4px', height: '4px', background: 'var(--accent-color)' }}></div>
              {config.provider.toUpperCase()}
            </div>
          </div>
        )}
      </nav>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <div className="content-inner">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>
              <span style={{ color: 'var(--accent-color)' }}>PUKAR_SYSTEM</span>
              <span style={{ opacity: 0.3 }}>/</span>
              <span style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>{activeTab}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-color)' }} />
              <input 
                type="text" 
                placeholder="SEARCH_LOGS..." 
                className="search-input" 
                style={{ width: '260px', paddingLeft: '36px', height: '36px', fontSize: '0.75rem' }}
              />
            </div>
          </header>

          {loading ? (
            <div style={{ display: 'flex', height: '50vh', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', letterSpacing: '0.2em', fontSize: '0.8rem' }}>
              LOADING_BYTE_STREAM...
            </div>
          ) : (
            <>
              {activeTab === 'overview' && <Overview stats={stats} />}
              {activeTab === 'history' && <CallHistory />}
              {activeTab === 'dialer' && <Dialer config={config} />}
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default App;
