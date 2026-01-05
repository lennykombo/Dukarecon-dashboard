import React from 'react';
import logo from '../assets/dukalogo.png'

export default function Sidebar({ activeTab, setActiveTab, onLogout }) {
  const navItemStyle = (tab) => ({
    cursor: 'pointer', 
    padding: '12px 15px', 
    borderRadius: '8px',
    marginBottom: '5px',
    transition: '0.2s',
    background: activeTab === tab ? '#2563eb' : 'transparent',
    color: activeTab === tab ? 'white' : '#94a3b8'
  });

  return (
    <div style={{ 
      width: 250, 
      backgroundColor: '#0f172a', 
      color: 'white', 
      padding: 20, 
      display: 'flex', 
      flexDirection: 'column',
      borderRight: '1px solid #1e293b'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        marginBottom: '40px',
        paddingLeft: '5px' 
      }}>
        <img 
          src={logo} 
          alt="DukaRecon" 
          style={{ width: '40px', height: '60px', objectFit: 'contain' }} 
        />
        <h1 style={{ color: '#3b82f6', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
          DukaRecon
        </h1>
      </div>
      
      <nav style={{ flex: 1 }}>
        <div onClick={() => setActiveTab('overview')} style={navItemStyle('overview')}>
          Dashboard
        </div>
        <div onClick={() => setActiveTab('reconciliation')} style={navItemStyle('reconciliation')}>
          Reconciliation
        </div>
        <div onClick={() => setActiveTab('ledger')} style={navItemStyle('ledger')}>
          Business Ledger
        </div>
        <div onClick={() => setActiveTab('staff')} style={navItemStyle('staff')}>
          Staff Management
        </div>
      </nav>

      <button 
        onClick={onLogout} 
        style={{ 
          padding: '12px',
          color: '#f87171', 
          background: '#1e293b', 
          border: 'none', 
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: 'auto' // Pushes button to bottom
        }}
      >
        Logout
      </button>
    </div>
  );
}