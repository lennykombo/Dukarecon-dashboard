import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { auth } from "./firebase";
import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";
import Reconciliation from "./pages/Reconciliation";
import Staff from "./pages/Staff";
import Login from "./pages/Login";
import Signup from "./pages/Signup"; 
import BusinessLedger from "./pages/BusinessLedger";

function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [isSigningUp, setIsSigningUp] = useState(false); // State to toggle screens

  if (loading) return <div className="loading">Loading...</div>;
  
  // 1. Logic for users who are NOT logged in
  if (!user) {
    return isSigningUp ? (
      <div className="auth-container">
        <Signup />
        <button 
           onClick={() => setIsSigningUp(false)} 
           style={{ display: 'block', margin: '20px auto', color: '#1565c0' }}
        >
          Already have a shop? Login here
        </button>
      </div>
    ) : (
      <div className="auth-container">
        <Login />
        <button 
           onClick={() => setIsSigningUp(true)} 
           style={{ display: 'block', margin: '20px auto', color: '#1565c0' }}
        >
          Don't have a shop? Register here
        </button>
      </div>
    );
  }

  // 2. Logic for users who ARE logged in
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={() => auth.signOut()} 
      />
      
      <main style={{ flex: 1 }}>
        {activeTab === 'overview' && <Overview businessId={user.businessId} />}
        {activeTab === 'reconciliation' && <Reconciliation businessId={user.businessId} />}
        {activeTab === 'staff' && <Staff businessId={user.businessId} />}
        {activeTab === 'ledger' && <BusinessLedger businessId={user.businessId} />}
      </main>
    </div>
  );
}

export default App;