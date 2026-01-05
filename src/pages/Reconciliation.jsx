import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  AlertCircle, 
  CheckCircle, 
  Info, 
  Smartphone, 
  Receipt, 
  Calendar,
  TrendingDown,
  Search
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [sales, setSales] = useState([]);
  const [mpesaLogs, setMpesaLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. DATE STATE: Default to Today's date (local time)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!businessId) return;

    const fetchData = async () => {
  if (!businessId) {
    console.log("❌ Error: businessId is missing");
    return;
  }
  
  setLoading(true);

  // Parse YYYY-MM-DD manually to avoid timezone shifting
  const [year, month, day] = selectedDate.split('-').map(Number);
  
  // Create dates in LOCAL TIME (Kenya Time)
  const start = new Date(year, month - 1, day, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  console.log("🔍 Fetching for:", selectedDate);
  console.log("🔍 Search Range:", start.toLocaleString(), "to", end.toLocaleString());
  console.log("🔍 BusinessID:", businessId);

  try {
    const salesQ = query(
      collection(db, "payments"), 
      where("businessId", "==", businessId),
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end))
    );

    const mpesaQ = query(
      collection(db, "mpesa_logs"), 
      where("businessId", "==", businessId),
      where("receivedAt", ">=", Timestamp.fromDate(start)),
      where("receivedAt", "<=", Timestamp.fromDate(end))
    );

    const [salesSnap, mpesaSnap] = await Promise.all([getDocs(salesQ), getDocs(mpesaQ)]);
    
    console.log("✅ Results Found - Sales:", salesSnap.size, " | Logs:", mpesaSnap.size);

    setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setMpesaLogs(mpesaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    
  } catch (error) {
    console.error("🔥 Firestore Query Error:", error);
    // If you see a "The query requires an index" error here, click the link in the console!
  } finally {
    setLoading(false);
  }
};

    fetchData();
  }, [businessId, selectedDate]);

  // --- RECONCILIATION LOGIC ---

  // 1. Total Money confirmed by SMS/Bank
  const totalActualMpesa = mpesaLogs.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  // 2. Total Money verified by Staff in the App (Code + Amount must match bank)
  const totalVerifiedMpesa = sales.reduce((sum, s) => {
    const matchingLog = mpesaLogs.find(log => 
      log.transactionCode?.toUpperCase() === s.transactionCode?.toUpperCase() &&
      Number(log.amount) === Number(s.amount)
    );
    return matchingLog ? sum + Number(s.amount || 0) : sum;
  }, 0);

  // 3. The GAP (Money received by bank but not correctly recorded in app)
  const totalMissingMoney = totalActualMpesa - totalVerifiedMpesa;

  // 4. Identify GHOST MONEY (M-Pesa logs that have no matching sale at all)
  const unmatchedLogs = mpesaLogs.filter(log => 
    !sales.some(sale => 
      sale.transactionCode?.toUpperCase() === log.transactionCode?.toUpperCase() &&
      Number(sale.amount) === Number(log.amount)
    )
  );

  if (loading) return (
    <div className="p-20 text-center flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p className="text-slate-500 font-medium tracking-tight">Syncing with Bank Logs...</p>
    </div>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Reconciliation Engine</h2>
          <div className="flex items-center gap-4">
            <p className="text-slate-500 font-medium">Auditing Daily Logs for Business ID: <span className="text-slate-800 font-bold">{businessId}</span></p>
            
            {/* DATE PICKER */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-blue-400">
              <Calendar size={16} className="text-blue-600" />
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                className="outline-none text-sm font-bold text-slate-700 bg-transparent"
              />
            </div>
          </div>
        </div>
        
        {/* SUMMARY CARDS */}
        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[160px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bank Total (SMS)</p>
            <p className="text-2xl font-black text-blue-600 font-mono">KES {totalActualMpesa.toLocaleString()}</p>
          </div>
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[160px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Verified App Sales</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">KES {totalVerifiedMpesa.toLocaleString()}</p>
          </div>

          <div className={`p-5 rounded-2xl border shadow-md min-w-[180px] transition-all ${totalMissingMoney > 0 ? 'bg-red-600 border-red-700' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-[10px] font-black uppercase tracking-widest ${totalMissingMoney > 0 ? 'text-red-100' : 'text-emerald-600'}`}>Daily Discrepancy</p>
              {totalMissingMoney > 0 && <TrendingDown size={14} className="text-white animate-bounce" />}
            </div>
            <p className={`text-2xl font-black font-mono ${totalMissingMoney > 0 ? 'text-white' : 'text-emerald-700'}`}>
              KES {totalMissingMoney.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <StatementUpload businessId={businessId} />
      </div>

      {/* THEFT ALERT BOX */}
      {unmatchedLogs.length > 0 && (
        <div className="mb-6 bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-5">
          <div className="bg-amber-500 p-3 rounded-xl text-white shadow-lg">
            <AlertCircle size={28} />
          </div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">Warning: {unmatchedLogs.length} Unclaimed Payments</h4>
            <p className="text-amber-800 opacity-90 leading-relaxed font-medium">
              We detected M-Pesa messages for this day that do not have a matching sale in the app. 
              This usually means an attendant received money but did not "Okay" or save the transaction.
            </p>
          </div>
        </div>
      )}

      {/* MAIN DATA TABLE */}
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-6">Origin / Staff</th>
              <th className="p-6">Transaction Code</th>
              <th className="p-6">App Amount</th>
              <th className="p-6">Bank Amount</th>
              <th className="p-6">Final Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* 1. RENDER GHOST PAYMENTS (UNMATCHED BANK LOGS) */}
            {unmatchedLogs.map((log, idx) => (
              <tr key={`unmatched-${idx}`} className="bg-rose-50/50 hover:bg-rose-100/50 transition-colors">
                <td className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 bg-rose-200 rounded-2xl flex items-center justify-center text-rose-700 shadow-inner">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <p className="font-black text-rose-700 text-sm">BANK LOG ONLY</p>
                    <p className="text-[11px] text-rose-400 font-bold italic tracking-tighter">No sale entry found</p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs font-black text-rose-800 select-all">{log.transactionCode}</td>
                <td className="p-6 text-slate-300 font-bold">---</td>
                <td className="p-6 font-black text-rose-700">KES {Number(log.amount).toLocaleString()}</td>
                <td className="p-6">
                  <span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm">MISSING SALE</span>
                </td>
              </tr>
            ))}

            {/* 2. RENDER SALES RECORDS */}
            {sales.map(sale => {
              const actualLog = mpesaLogs.find(log => 
                log.transactionCode?.toUpperCase() === sale.transactionCode?.toUpperCase()
              );
              
              const isMpesaLabel = sale.paymentMethod?.toLowerCase() === 'mpesa';
              const isMatched = actualLog && Number(actualLog.amount) === Number(sale.amount);
              const isMismatch = actualLog && Number(actualLog.amount) !== Number(sale.amount);
              const isFake = isMpesaLabel && !actualLog;

              return (
                <tr key={sale.id} className={`${isFake || isMismatch ? 'bg-amber-50/30' : 'hover:bg-slate-50'} transition-colors group`}>
                  <td className="p-6 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:scale-110 ${actualLog ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      {actualLog ? <Smartphone size={20} /> : <Receipt size={20} />}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm tracking-tight">{sale.attendantName || sale.userName || "Unknown Staff"}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        {actualLog ? 'M-PESA' : (sale.paymentMethod || 'CASH')}
                      </p>
                    </div>
                  </td>
                  
                  <td className="p-6 font-mono text-xs text-slate-500 font-semibold">{sale.transactionCode || "---"}</td>
                  
                  <td className="p-6 font-black text-slate-900">KES {Number(sale.amount).toLocaleString()}</td>
                  
                  <td className={`p-6 font-black ${isMismatch ? 'text-rose-600 underline' : 'text-slate-500'}`}>
                    {actualLog ? `KES ${Number(actualLog.amount).toLocaleString()}` : "--"}
                  </td>

                  <td className="p-6">
                    {isMatched ? (
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100/50 w-fit px-3 py-1.5 rounded-lg border border-emerald-200">
                        <CheckCircle size={16} />
                        <span className="text-[10px] font-black uppercase">Verified Match</span>
                      </div>
                    ) : isMismatch ? (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-100/50 w-fit px-3 py-1.5 rounded-lg border border-amber-200">
                        <AlertCircle size={16} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Amount Mismatch</span>
                      </div>
                    ) : isFake ? (
                      <div className="flex items-center gap-2 text-rose-600 bg-rose-100/50 w-fit px-3 py-1.5 rounded-lg border border-rose-200 animate-pulse">
                        <AlertCircle size={16} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Code Not Found</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg">
                        Unverified Cash
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* EMPTY STATE */}
            {sales.length === 0 && mpesaLogs.length === 0 && (
              <tr>
                <td colSpan="5" className="p-20 text-center flex flex-col items-center">
                   <Info size={40} className="text-slate-200 mb-4" />
                   <p className="text-slate-400 font-black text-lg">No records found for this date.</p>
                   <p className="text-slate-400 text-sm">Select a different day or wait for sales to sync.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}












/*import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { Search, AlertCircle, CheckCircle } from "lucide-react";

export default function Reconciliation({ businessId }) {
  const [sales, setSales] = useState([]);
  const [mpesaLogs, setMpesaLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Sales (Filtered by Business)
        const salesQ = query(
          collection(db, "payments"), 
          where("businessId", "==", businessId)
          // Note: If you add orderBy("createdAt"), you MUST create a composite index in Firebase
        );
        
        // 2. Fetch M-Pesa Official Logs (from SMS Reader)
        const mpesaQ = query(
          collection(db, "mpesa_logs"), 
          where("businessId", "==", businessId)
        );

        const [salesSnap, mpesaSnap] = await Promise.all([getDocs(salesQ), getDocs(mpesaQ)]);
        
        setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setMpesaLogs(mpesaSnap.docs.map(doc => doc.data()));
      } catch (error) {
        console.error("Reconciliation fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [businessId]);

  if (loading) return <div className="p-8">Loading records...</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">M-Pesa Reconciliation Engine</h2>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-4 text-sm font-semibold text-slate-600">Attendant</th>
              <th className="p-4 text-sm font-semibold text-slate-600">Sale Amount</th>
              <th className="p-4 text-sm font-semibold text-slate-600">M-Pesa Code</th>
              <th className="p-4 text-sm font-semibold text-slate-600">Verification Status</th>
              <th className="p-4 text-sm font-semibold text-slate-600">Actual M-Pesa</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(sale => {
              // THE MATCHING LOGIC
              const actualLog = mpesaLogs.find(log => log.transactionCode === sale.transactionCode);
              const isMpesa = sale.paymentMethod === 'mpesa';
              const isFake = isMpesa && !actualLog;

              return (
                <tr key={sale.id} className={`border-b ${isFake ? 'bg-red-50' : ''}`}>
                  <td className="p-4">{sale.attendantName || "Staff"}</td>
                  <td className="p-4 font-bold">KES {sale.amount}</td>
                  <td className="p-4 font-mono text-sm">{sale.transactionCode}</td>
                  <td className="p-4">
                    {!isMpesa ? (
                      <span className="text-slate-400 text-xs">CASH</span>
                    ) : actualLog ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle size={14} />
                        <span className="text-xs font-bold">VERIFIED</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600">
                        <AlertCircle size={14} />
                        <span className="text-xs font-bold">FAKE / MISSING</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-slate-500">
                    {actualLog ? `KES ${actualLog.amount}` : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}*/