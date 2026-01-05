import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Calendar, 
  ChevronRight, 
  Clock, 
  ArrowLeft, 
  AlertCircle,
  CheckCircle,
  Users,
  Search // <--- Imported Search Icon
} from "lucide-react";

export default function BusinessLedger({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); 
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState("daily"); 
  const [searchQuery, setSearchQuery] = useState(""); // <--- Search State

  useEffect(() => {
    if (!businessId) return;
    fetchDailyRecords();
  }, [businessId, selectedDate, viewMode]);

  const fetchDailyRecords = async () => {
    setLoading(true);
    
    try {
      let payQ;
      let accQ;

      if (viewMode === "daily") {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const start = Timestamp.fromDate(new Date(year, month - 1, day, 0, 0, 0));
        const end = Timestamp.fromDate(new Date(year, month - 1, day, 23, 59, 59, 999));

        payQ = query(
          collection(db, "payments"), 
          where("businessId", "==", businessId),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        );

        accQ = query(
          collection(db, "accounts"), 
          where("businessId", "==", businessId),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        );
      } else {
        payQ = null; 
        accQ = query(
          collection(db, "accounts"), 
          where("businessId", "==", businessId),
          where("status", "==", "open") 
        );
      }

      const [paySnap, accSnap] = await Promise.all([
        payQ ? getDocs(payQ) : { docs: [] }, 
        getDocs(accQ)
      ]);

      const combinedRecords = [
        ...paySnap.docs.map(doc => ({ id: doc.id, ledgerType: 'payment', ...doc.data() })),
        ...accSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'account', ...doc.data() }))
      ];

      combinedRecords.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(combinedRecords);
    } catch (err) {
      console.error("Ledger Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const viewAccountHistory = async (accountId, accountDescription) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "payments"), 
        where("businessId", "==", businessId),
        where("accountId", "==", accountId)
      );
      
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      history.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      
      setSelectedAccount({
        id: accountId,
        description: accountDescription || "Customer Account",
        history: history
      });
    } catch (err) {
      console.error(err);
      alert("Error fetching account history");
    } finally {
      setLoading(false);
    }
  };

  // --- FILTERED RECORDS (SEARCH LOGIC) ---
  const filteredRecords = records.filter(rec => {
    const desc = (rec.description || "").toLowerCase();
    const code = (rec.transactionCode || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || code.includes(query);
  });

  // --- FINANCIAL SUMMARY MATH (Based on Filtered Data) ---
  const totals = filteredRecords.reduce((acc, rec) => {
    if (rec.ledgerType === 'account') {
      acc.sales += Number(rec.totalAmount || 0);
      acc.debt += (Number(rec.totalAmount || 0) - Number(rec.paidAmount || 0));
    } else if (rec.ledgerType === 'payment' && !rec.accountId) {
      acc.sales += Number(rec.amount || 0);
      acc.collected += Number(rec.amount || 0);
    } else if (rec.ledgerType === 'payment' && rec.accountId) {
      acc.collected += Number(rec.amount || 0);
    }
    return acc;
  }, { sales: 0, collected: 0, debt: 0 });

  const formatTime = (createdAt) => {
    if (!createdAt) return "---";
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (selectedAccount) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        <button onClick={() => setSelectedAccount(null)} className="flex items-center gap-2 text-slate-600 mb-8 font-bold hover:text-blue-600">
          <ArrowLeft size={20} /> Back to Ledger
        </button>
        <div className="bg-white rounded-[2rem] shadow-xl border p-10 max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-slate-800">{selectedAccount.description}</h2>
          <p className="text-slate-400 mb-10">Payment History Timeline</p>
          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-slate-100">
            {selectedAccount.history.map((step, index) => (
              <div key={index} className="relative flex items-center gap-8 group">
                <div className="absolute left-0 w-10 h-10 rounded-2xl bg-white border-2 border-blue-500 flex items-center justify-center z-10">
                  <Clock size={16} className="text-blue-600" />
                </div>
                <div className="ml-16 bg-white p-6 rounded-2xl border border-slate-100 w-full shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-black text-xl">KES {Number(step.amount).toLocaleString()}</span>
                    <span className="px-2 py-1 bg-slate-100 text-[10px] font-black uppercase rounded">{step.paymentMethod}</span>
                  </div>
                  <p className="text-xs text-slate-500">{step.createdAt?.toDate().toLocaleDateString()} at {formatTime(step.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Business Ledger</h2>
          
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner">
              <button 
                onClick={() => setViewMode("daily")}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                <Calendar size={14} /> DAILY LOGS
              </button>
              <button 
                onClick={() => setViewMode("debtors")}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'debtors' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}
              >
                <Users size={14} /> ALL DEBTORS
              </button>
            </div>

            {viewMode === "daily" && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
                <Calendar size={18} className="text-blue-600" />
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-black text-slate-700" />
              </div>
            )}

            {/* --- SEARCH INPUT --- */}
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm w-full lg:w-auto">
              <Search size={18} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Search name or code..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outline-none text-sm font-semibold text-slate-700 w-full" 
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sales</p>
            <p className="text-2xl font-black text-slate-900 font-mono">KES {totals.sales.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Collected</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">KES {totals.collected.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Outstanding</p>
            <p className="text-2xl font-black text-rose-600 font-mono">KES {totals.debt.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-white">
            <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
              <th className="p-6">Time / Date</th>
              <th className="p-6">Type</th>
              <th className="p-6">Description</th>
              <th className="p-6">Amount</th>
              <th className="p-6">Job Status</th>
              <th className="p-6 text-center">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="6" className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading records...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan="6" className="p-20 text-center text-slate-300 italic">No records found.</td></tr>
            ) : (
              filteredRecords.map((record) => {
                const isJob = record.ledgerType === 'account';
                const balance = isJob ? (record.totalAmount - record.paidAmount) : 0;

                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-6 text-xs font-black text-slate-400">
                      {viewMode === "daily" ? formatTime(record.createdAt) : record.createdAt?.toDate().toLocaleDateString()}
                    </td>
                    <td className="p-6">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase border ${isJob ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                        {isJob ? "Job Order" : "Payment"}
                      </span>
                    </td>
                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-sm leading-tight">{record.description || "Retail Sale"}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{record.transactionCode || "---"}</p>
                    </td>
                    <td className="p-6">
                      <span className={`font-black text-lg ${isJob ? 'text-slate-900' : 'text-emerald-600'}`}>
                        KES {Number(isJob ? record.totalAmount : record.amount).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-6">
                      {isJob ? (
                        <div className={`flex items-center gap-1.5 font-black text-xs ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {balance > 0 ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                          {balance > 0 ? `OWED: KES ${balance.toLocaleString()}` : "CLEARED"}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[10px] font-bold">---</span>
                      )}
                    </td>
                    <td className="p-6 text-center">
                      {(record.ledgerType === 'account' || record.accountId) ? (
                        <button 
                          onClick={() => viewAccountHistory(record.ledgerType === 'account' ? record.id : record.accountId, record.description)}
                          className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        >
                          <ChevronRight size={18} />
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-200 font-black uppercase">One-off</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}























/*import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Calendar, ChevronRight, User, Clock, ArrowLeft, Receipt, Briefcase } from "lucide-react";

export default function BusinessLedger({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); 
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!businessId) return;
    fetchDailyRecords();
  }, [businessId, dateFilter]);

  const fetchDailyRecords = async () => {
    setLoading(true);
    try {
      // Fetching all for debug, but you can add date filters back once confirmed
      const payQ = query(collection(db, "payments"), where("businessId", "==", businessId));
      const accQ = query(collection(db, "accounts"), where("businessId", "==", businessId));

      const [paySnap, accSnap] = await Promise.all([getDocs(payQ), getDocs(accQ)]);

      const combinedRecords = [
        ...paySnap.docs.map(doc => ({ id: doc.id, ledgerType: 'payment', ...doc.data() })),
        ...accSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'account', ...doc.data() }))
      ];

      combinedRecords.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(combinedRecords);
    } catch (err) {
      console.error("Ledger Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };



  const viewAccountHistory = async (accountId, accountDescription) => {
    if (!accountId) {
      alert("Error: No Account ID found for this record.");
      return;
    }

    setLoading(true);
    console.log("DEBUG: Fetching history for Account ID:", accountId, "under Business:", businessId);

    try {
      // THE FIX: You MUST include businessId here to satisfy Security Rules
      const q = query(
        collection(db, "payments"), 
        where("businessId", "==", businessId), // Added this line
        where("accountId", "==", accountId)
      );
      
      const snap = await getDocs(q);
      console.log(`DEBUG: Successfully found ${snap.size} payment records.`);

      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort manually in JS to avoid needing a complex index
      history.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      
      setSelectedAccount({
        description: accountDescription || "Customer Job",
        history: history
      });

      if (history.length === 0) {
        console.warn("DEBUG: No payments found linked to this accountId.");
      }
    } catch (err) {
      console.error("DETAILED ERROR:", err.code, err.message);
      // This will now tell you exactly if it's "permission-denied"
      alert("Error: " + (err.code === 'permission-denied' ? "Access Denied by Security Rules" : err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (createdAt) => {
    if (!createdAt) return "No Date";
    try {
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return "---"; }
  };

  
  // --- 1. THE HISTORY VIEW (PAYMENT TIMELINE) ---
  if (selectedAccount) {
    return (
      <div className="p-8">
        <button 
          onClick={() => setSelectedAccount(null)} 
          className="flex items-center gap-2 text-blue-600 mb-6 font-bold hover:underline"
        >
          <ArrowLeft size={20} /> Back to List
        </button>

        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-2xl">
          <h2 className="text-2xl font-bold text-slate-800">{selectedAccount.description}</h2>
          <p className="text-slate-500 mb-8 font-medium">Payment Timeline & Process</p>

          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-slate-100">
            {selectedAccount.history.length === 0 ? (
              <p className="text-slate-400 ml-10 italic text-sm">No payment records found for this account.</p>
            ) : (
              selectedAccount.history.map((step, index) => (
                <div key={index} className="relative flex items-center gap-6">
                  <div className="absolute left-0 w-10 h-10 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center z-10">
                    <Clock size={16} className="text-blue-600" />
                  </div>
                  <div className="ml-14 bg-slate-50 p-4 rounded-xl border border-slate-100 w-full">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-slate-900">KES {Number(step.amount).toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-blue-600 uppercase">{step.paymentMethod}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {step.createdAt?.toDate().toLocaleDateString()} at {formatTime(step.createdAt)}
                    </p>
                    {step.transactionCode && <p className="text-[10px] text-slate-400 mt-1 font-mono">{step.transactionCode}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- 2. THE MAIN LIST VIEW ---
  return (
    <div className="p-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Sales Ledger</h2>
          <p className="text-slate-400 text-sm font-medium">Found {records.length} records in your system</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Time</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Type</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Description</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((record) => (
              <tr key={record.id} className="hover:bg-slate-50 group">
                <td className="p-4 text-sm text-slate-500 font-medium">
                  {formatTime(record.createdAt)}
                </td>
                <td className="p-4">
                  {record.ledgerType === 'account' ? (
                    <span className="bg-purple-100 text-purple-700 text-[9px] px-2 py-1 rounded-full font-bold border border-purple-200 uppercase">New Job</span>
                  ) : (
                    <span className="bg-green-100 text-green-700 text-[9px] px-2 py-1 rounded-full font-bold border border-green-200 uppercase">Payment</span>
                  )}
                </td>
                <td className="p-4">
                  <p className="font-bold text-slate-800 leading-tight">
                    {record.description || (record.type === 'job' ? "Job Order" : "Retail Sale")}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{record.transactionCode || "No Reference"}</p>
                </td>
                <td className="p-4">
                  <span className="font-extrabold text-slate-900">
                    KES {Number(record.ledgerType === 'account' ? record.totalAmount : record.amount).toLocaleString()}
                  </span>
                </td>
                {/*<td className="p-4 text-center">
                  
                  {(record.ledgerType === 'account' || record.accountId) && (
                    <button 
                      onClick={() => viewAccountHistory(record.ledgerType === 'account' ? record.id : record.accountId, record.description)}
                      className="inline-flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                    >
                      Details <ChevronRight size={14} />
                    </button>
                  )}
                </td>*//*
                <td className="p-4 text-center">
  
  {(record.ledgerType === 'account' || (record.ledgerType === 'payment' && record.accountId)) ? (
    <button 
      onClick={() => viewAccountHistory(
        record.ledgerType === 'account' ? record.id : record.accountId, 
        record.description || "Customer Job"
      )}
      className="inline-flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
    >
      Details <ChevronRight size={14} />
    </button>
  ) : (
    <span className="text-[10px] text-slate-300 italic">One-off Sale</span>
  )}
</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}*/