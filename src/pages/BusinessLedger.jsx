import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Calendar, ChevronRight, Clock, ArrowLeft, 
  AlertCircle, CheckCircle, Users, Search,
  Landmark, Smartphone, Banknote, 
  TrendingDown, TrendingUp, Briefcase, FileText,
  User, Wallet
} from "lucide-react";

export default function BusinessLedger({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); 
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState("daily"); 
  const [searchQuery, setSearchQuery] = useState(""); 

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    
    try {
      let payQ, accQ, expQ;

      // 1. DATE LOGIC
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      if (viewMode === "daily") {
        payQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
        expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
      } else {
        // Debtors View (Only Open Accounts)
        payQ = null; 
        expQ = null;
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("status", "==", "open"));
      }

      const [paySnap, accSnap, expSnap] = await Promise.all([
        payQ ? getDocs(payQ) : { docs: [] }, 
        getDocs(accQ),
        expQ ? getDocs(expQ) : { docs: [] }
      ]);

      // --- CREATE ACCOUNT LOOKUP MAP (ID -> Name) ---
      const accountMap = {};
      accSnap.docs.forEach(doc => {
        const d = doc.data();
        accountMap[doc.id] = d.description || d.jobName || "Unknown Account";
      });

      const merged = [
        // PAYMENTS (Sales/Deposits)
        ...paySnap.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ledgerType: 'payment', 
                linkedAccountName: data.accountId ? accountMap[data.accountId] : null, 
                // Capture Attendant Name
                staffName: doc.data().attendantName || "System",
                ...data 
            };
        }),
        // ACCOUNTS (Jobs/Credits)
        ...accSnap.docs.map(doc => ({ 
            id: doc.id, 
            ledgerType: 'account', 
            // Accounts are usually opened by the main user/attendant
            staffName: doc.data().attendantName || "Admin",
            ...doc.data() 
        })),
        // EXPENSES
        ...expSnap.docs.map(doc => ({ 
            id: doc.id, 
            ledgerType: 'expense', 
            // Expenses store user as 'userName'
            staffName: doc.data().userName || "Staff",
            ...doc.data() 
        })) 
      ];

      merged.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(merged);

    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  }, [businessId, selectedDate, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const viewAccountHistory = async (accountId, accountDescription) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const q = query(collection(db, "payments"), where("businessId", "==", businessId), where("accountId", "==", accountId));
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      history.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setSelectedAccount({ id: accountId, description: accountDescription || "Customer Account", history: history });
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const filteredRecords = records.filter(rec => {
    const desc = (rec.description || "").toLowerCase();
    const code = (rec.transactionCode || "").toLowerCase();
    const staff = (rec.staffName || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || code.includes(query) || staff.includes(query);
  });

  // --- TOTALS MATH ---
  const totals = filteredRecords.reduce((acc, rec) => {
    const amt = Number(rec.amount || rec.totalAmount || 0);

    if (rec.ledgerType === 'account') {
      acc.totalSalesValue += amt; 
      acc.debt += (amt - Number(rec.paidAmount || 0));
    } 
    else if (rec.ledgerType === 'payment') {
      acc.collected += amt;
      // If it's a direct sale (not linked to account), add to sales value
      if (!rec.accountId) {
        acc.totalSalesValue += amt;
      }
    } 
    else if (rec.ledgerType === 'expense') {
      acc.expenses += amt;
    }
    return acc;
  }, { totalSalesValue: 0, collected: 0, debt: 0, expenses: 0 });

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--";

  // --- UPDATED BADGE RENDERER ---
  const renderMethodBadge = (method) => {
    if (!method) return null;
    const m = method.toLowerCase();
    if (m === 'bank') return <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-indigo-200"><Landmark size={12} /> BANK</span>;
    if (m === 'mpesa') return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-emerald-200"><Smartphone size={12} /> M-PESA</span>;
    if (m === 'cash') return <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase border border-slate-200"><Banknote size={12} /> CASH</span>;
    return <span className="text-slate-400 text-[10px]">{method}</span>;
  };

  // --- ACCOUNT HISTORY VIEW ---
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
                    {renderMethodBadge(step.paymentMethod)}
                  </div>
                  {step.balanceAfter > 0 && <p className="text-xs font-bold text-rose-500 mb-1">Balance Remaining: KES {Number(step.balanceAfter).toLocaleString()}</p>}
                  <p className="text-xs text-slate-500">
                    {step.createdAt?.toDate().toLocaleDateString()} at {formatTime(step.createdAt)} by <span className="font-bold">{step.attendantName || "Staff"}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN LEDGER VIEW ---
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Business Ledger</h2>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
             <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner">
              <button onClick={() => setViewMode("daily")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Calendar size={14} /> DAILY LOGS</button>
              <button onClick={() => setViewMode("debtors")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'debtors' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}><Users size={14} /> DEBTORS</button>
            </div>
             {viewMode === "daily" && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
                <Calendar size={18} className="text-blue-600" />
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-black text-slate-700" />
              </div>
            )}
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm w-full lg:w-auto">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search code, desc, staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="outline-none text-sm font-semibold text-slate-700 w-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue Value</p>
            <p className="text-2xl font-black text-slate-900 font-mono">KES {totals.totalSalesValue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total Collected</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">KES {totals.collected.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Net Cash (In Hand)</p>
            <p className="text-2xl font-black text-blue-600 font-mono">KES {(totals.collected - totals.expenses).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-white">
            <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
              <th className="p-6">Time</th>
              <th className="p-6">Type</th>
              <th className="p-6">Description / Staff</th>
              <th className="p-6">Method</th>
              <th className="p-6 text-right">Amount</th>
              <th className="p-6 text-center">Balance / Status</th>
              <th className="p-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading records...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan="7" className="p-20 text-center text-slate-300 italic">No records found.</td></tr>
            ) : (
              filteredRecords.map((rec) => {
                const isExp = rec.ledgerType === 'expense';
                const isJob = rec.ledgerType === 'account'; 
                const isLinkedPayment = rec.ledgerType === 'payment' && rec.accountId; 
                
                const balance = isJob ? (Number(rec.totalAmount) - Number(rec.paidAmount)) : 0;

                return (
                  <tr key={rec.id} className={`hover:bg-slate-50 transition-colors group ${isExp ? 'bg-rose-50/40' : ''}`}>
                    <td className="p-6 text-xs font-black text-slate-400">
                      {viewMode === "daily" ? formatTime(rec.createdAt) : rec.createdAt?.toDate().toLocaleDateString()}
                    </td>
                    
                    <td className="p-6">
                      {isExp ? (
                        <span className="flex items-center gap-1 text-rose-600 font-black text-[10px] uppercase"><TrendingDown size={14} /> EXPENSE</span>
                      ) : isJob ? (
                        <span className="text-purple-600 font-black text-[10px] uppercase flex items-center gap-1"><Briefcase size={14}/> JOB ORDER</span>
                      ) : isLinkedPayment ? (
                        <span className="text-blue-500 font-black text-[10px] uppercase flex items-center gap-1"><FileText size={14}/> DEPOSIT</span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 font-black text-[10px] uppercase"><TrendingUp size={14} /> SALE</span>
                      )}
                    </td>

                    {/* ✅ DESCRIPTION & STAFF COLUMN */}
                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-sm leading-tight">
                         {rec.description || (isExp ? "Expense" : "Retail Sale")}
                         {/* Show Expense Category if available */}
                         {isExp && rec.category && <span className="text-[10px] text-rose-500 uppercase ml-2 border border-rose-200 px-1 rounded">{rec.category}</span>}
                      </p>
                      
                      {isLinkedPayment && (
                        <p className="text-[11px] text-blue-600 font-bold mt-1 bg-blue-50 px-2 py-1 rounded w-fit">
                           ↳ Paying: {rec.linkedAccountName || "Previous Account"}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-1.5">
                          {/* SHOW STAFF NAME */}
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                             <User size={10} /> {rec.staffName || "Staff"}
                          </span>
                          
                          {/* SHOW CODE */}
                          {rec.transactionCode && <span className="text-[10px] text-slate-400 font-mono uppercase">{rec.transactionCode}</span>}
                      </div>
                    </td>

                    <td className="p-6">{renderMethodBadge(rec.paymentMethod)}</td>

                    <td className={`p-6 text-right font-black text-lg ${isExp ? 'text-rose-600' : 'text-slate-900'}`}>
                      {isExp ? "-" : "+"} KES {Number(rec.amount || rec.totalAmount).toLocaleString()}
                    </td>

                    <td className="p-6 text-center">
                      {isJob ? (
                        balance > 0 ? (
                          <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-black border border-rose-200">
                            OWE: {balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-600 flex items-center justify-center gap-1 font-bold text-[10px]">
                            <CheckCircle size={14} /> PAID
                          </span>
                        )
                      ) : isExp ? (
                        <span className="text-slate-300 text-[10px] font-bold">---</span>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[10px]">SETTLED</span>
                      )}
                    </td>

                    <td className="p-6 text-center">
                      {(rec.ledgerType === 'account' || rec.accountId) ? (
                        <button onClick={() => viewAccountHistory(rec.ledgerType === 'account' ? rec.id : rec.accountId, rec.description)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                          <ChevronRight size={18} />
                        </button>
                      ) : <span className="text-[9px] text-slate-300 font-black">---</span>}
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














/*import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Calendar, ChevronRight, Clock, ArrowLeft, 
  AlertCircle, CheckCircle, Users, Search,
  Landmark, Smartphone, Banknote, 
  TrendingDown, TrendingUp, Briefcase, FileText
} from "lucide-react";

export default function BusinessLedger({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); 
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState("daily"); 
  const [searchQuery, setSearchQuery] = useState(""); 

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    
    try {
      let payQ, accQ, expQ;

      // 1. DATE LOGIC
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      if (viewMode === "daily") {
        payQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
        expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
      } else {
        // Debtors View
        payQ = null; 
        expQ = null;
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("status", "==", "open"));
      }

      const [paySnap, accSnap, expSnap] = await Promise.all([
        payQ ? getDocs(payQ) : { docs: [] }, 
        getDocs(accQ),
        expQ ? getDocs(expQ) : { docs: [] }
      ]);

      // --- CREATE ACCOUNT LOOKUP MAP (ID -> Name) ---
      // This allows us to find the name of the job/customer even inside a Payment row
      const accountMap = {};
      accSnap.docs.forEach(doc => {
        const d = doc.data();
        accountMap[doc.id] = d.description || d.jobName || "Unknown Account";
      });

      const merged = [
        // Pass the accountMap to the payment object so we can use it later
        ...paySnap.docs.map(doc => {
            const data = doc.data();
            // Try to find the Linked Account Name
            const linkedAccountName = data.accountId ? accountMap[data.accountId] : null;
            return { id: doc.id, ledgerType: 'payment', linkedAccountName, ...data };
        }),
        ...accSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'account', ...doc.data() })),
        ...expSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'expense', ...doc.data() })) 
      ];

      merged.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(merged);

    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  }, [businessId, selectedDate, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const viewAccountHistory = async (accountId, accountDescription) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const q = query(collection(db, "payments"), where("businessId", "==", businessId), where("accountId", "==", accountId));
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      history.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setSelectedAccount({ id: accountId, description: accountDescription || "Customer Account", history: history });
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const filteredRecords = records.filter(rec => {
    const desc = (rec.description || "").toLowerCase();
    const code = (rec.transactionCode || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || code.includes(query);
  });

  // --- TOTALS MATH ---
  const totals = filteredRecords.reduce((acc, rec) => {
    const amt = Number(rec.amount || rec.totalAmount || 0);

    if (rec.ledgerType === 'account') {
      acc.totalSalesValue += amt; 
      acc.debt += (amt - Number(rec.paidAmount || 0));
    } 
    else if (rec.ledgerType === 'payment') {
      acc.collected += amt;
      if (!rec.accountId) {
        acc.totalSalesValue += amt;
      }
    } 
    else if (rec.ledgerType === 'expense') {
      acc.expenses += amt;
    }
    return acc;
  }, { totalSalesValue: 0, collected: 0, debt: 0, expenses: 0 });

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--";

  const renderMethodBadge = (method) => {
    if (!method) return null;
    const m = method.toLowerCase();
    if (m === 'bank') return <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-indigo-200"><Landmark size={12} /> BANK / SACCO</span>;
    if (m === 'mpesa') return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-emerald-200"><Smartphone size={12} /> M-PESA</span>;
    if (m === 'cash') return <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase border border-slate-200"><Banknote size={12} /> CASH</span>;
    return <span className="text-slate-400 text-[10px]">{method}</span>;
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
                    {renderMethodBadge(step.paymentMethod)}
                  </div>
                  {step.balanceAfter > 0 && <p className="text-xs font-bold text-rose-500 mb-1">Balance Remaining: KES {Number(step.balanceAfter).toLocaleString()}</p>}
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
              <button onClick={() => setViewMode("daily")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Calendar size={14} /> DAILY LOGS</button>
              <button onClick={() => setViewMode("debtors")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'debtors' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}><Users size={14} /> DEBTORS</button>
            </div>
             {viewMode === "daily" && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
                <Calendar size={18} className="text-blue-600" />
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-black text-slate-700" />
              </div>
            )}
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm w-full lg:w-auto">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="outline-none text-sm font-semibold text-slate-700 w-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue Value</p>
            <p className="text-2xl font-black text-slate-900 font-mono">KES {totals.totalSalesValue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total Collected</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">KES {totals.collected.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Net Cash (In Hand)</p>
            <p className="text-2xl font-black text-blue-600 font-mono">KES {(totals.collected - totals.expenses).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-white">
            <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
              <th className="p-6">Time</th>
              <th className="p-6">Type</th>
              <th className="p-6">Description</th>
              <th className="p-6">Method</th>
              <th className="p-6 text-right">Amount</th>
              <th className="p-6 text-center">Balance / Status</th>
              <th className="p-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading records...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan="7" className="p-20 text-center text-slate-300 italic">No records found.</td></tr>
            ) : (
              filteredRecords.map((rec) => {
                const isExp = rec.ledgerType === 'expense';
                const isJob = rec.ledgerType === 'account'; 
                const isLinkedPayment = rec.ledgerType === 'payment' && rec.accountId; 
                
                const balance = isJob ? (Number(rec.totalAmount) - Number(rec.paidAmount)) : 0;

                return (
                  <tr key={rec.id} className={`hover:bg-slate-50 transition-colors group ${isExp ? 'bg-rose-50/40' : ''}`}>
                    <td className="p-6 text-xs font-black text-slate-400">
                      {viewMode === "daily" ? formatTime(rec.createdAt) : rec.createdAt?.toDate().toLocaleDateString()}
                    </td>
                    
                    <td className="p-6">
                      {isExp ? (
                        <span className="flex items-center gap-1 text-rose-600 font-black text-[10px] uppercase"><TrendingDown size={14} /> EXPENSE</span>
                      ) : isJob ? (
                        <span className="text-purple-600 font-black text-[10px] uppercase flex items-center gap-1"><Briefcase size={14}/> JOB ORDER</span>
                      ) : isLinkedPayment ? (
                        <span className="text-blue-500 font-black text-[10px] uppercase flex items-center gap-1"><FileText size={14}/> DEPOSIT</span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 font-black text-[10px] uppercase"><TrendingUp size={14} /> SALE</span>
                      )}
                    </td>

                    {/* ✅ DESCRIPTION COLUMN: Show Linked Account Name *//*
                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-sm leading-tight">{rec.description || (isExp ? "Expense" : "Retail Sale")}</p>
                      
                      {isLinkedPayment && (
                        <p className="text-[11px] text-blue-600 font-bold mt-1 bg-blue-50 px-2 py-1 rounded w-fit">
                           ↳ Paying: {rec.linkedAccountName || "Previous Account"}
                        </p>
                      )}
                      
                      {rec.transactionCode && <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{rec.transactionCode}</p>}
                    </td>

                    <td className="p-6">{renderMethodBadge(rec.paymentMethod)}</td>

                    <td className={`p-6 text-right font-black text-lg ${isExp ? 'text-rose-600' : 'text-slate-900'}`}>
                      {isExp ? "-" : "+"} KES {Number(rec.amount || rec.totalAmount).toLocaleString()}
                    </td>

                    <td className="p-6 text-center">
                      {isJob ? (
                        balance > 0 ? (
                          <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-black border border-rose-200">
                            OWE: {balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-600 flex items-center justify-center gap-1 font-bold text-[10px]">
                            <CheckCircle size={14} /> PAID
                          </span>
                        )
                      ) : isExp ? (
                        <span className="text-slate-300 text-[10px] font-bold">---</span>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[10px]">SETTLED</span>
                      )}
                    </td>

                    <td className="p-6 text-center">
                      {(rec.ledgerType === 'account' || rec.accountId) ? (
                        <button onClick={() => viewAccountHistory(rec.ledgerType === 'account' ? rec.id : rec.accountId, rec.description)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                          <ChevronRight size={18} />
                        </button>
                      ) : <span className="text-[9px] text-slate-300 font-black">---</span>}
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
}*/


















/*import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Calendar, ChevronRight, Clock, ArrowLeft, 
  AlertCircle, CheckCircle, Users, Search,
  Landmark, Smartphone, Banknote, 
  TrendingDown, TrendingUp
} from "lucide-react";

export default function BusinessLedger({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); 
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState("daily"); 
  const [searchQuery, setSearchQuery] = useState(""); 

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    
    try {
      let payQ, accQ, expQ;

      if (viewMode === "daily") {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const start = Timestamp.fromDate(new Date(year, month - 1, day, 0, 0, 0));
        const end = Timestamp.fromDate(new Date(year, month - 1, day, 23, 59, 59, 999));

        payQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", start), where("createdAt", "<=", end));
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("createdAt", ">=", start), where("createdAt", "<=", end));
        expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", start), where("createdAt", "<=", end));

      } else {
        // Debtors View: ONLY get Accounts that are Open (Owe Money)
        payQ = null; 
        expQ = null;
        accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("status", "==", "open"));
      }

      const [paySnap, accSnap, expSnap] = await Promise.all([
        payQ ? getDocs(payQ) : { docs: [] }, 
        getDocs(accQ),
        expQ ? getDocs(expQ) : { docs: [] }
      ]);

      const merged = [
        ...paySnap.docs.map(doc => ({ id: doc.id, ledgerType: 'payment', ...doc.data() })),
        ...accSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'account', ...doc.data() })),
        ...expSnap.docs.map(doc => ({ id: doc.id, ledgerType: 'expense', ...doc.data() })) 
      ];

      merged.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(merged);

    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  }, [businessId, selectedDate, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // View History
  const viewAccountHistory = async (accountId, accountDescription) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const q = query(collection(db, "payments"), where("businessId", "==", businessId), where("accountId", "==", accountId));
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      history.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setSelectedAccount({ id: accountId, description: accountDescription || "Customer Account", history: history });
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const filteredRecords = records.filter(rec => {
    const desc = (rec.description || "").toLowerCase();
    const code = (rec.transactionCode || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || code.includes(query);
  });

  const totals = filteredRecords.reduce((acc, rec) => {
    const amt = Number(rec.amount || rec.totalAmount || 0);
    if (rec.ledgerType === 'account') {
      acc.sales += amt;
      acc.debt += (amt - Number(rec.paidAmount || 0));
    } else if (rec.ledgerType === 'payment' && !rec.accountId) {
      acc.sales += amt;
      acc.collected += amt;
    } else if (rec.ledgerType === 'payment' && rec.accountId) {
      acc.collected += amt;
    } else if (rec.ledgerType === 'expense') {
      acc.expenses += amt;
    }
    return acc;
  }, { sales: 0, collected: 0, debt: 0, expenses: 0 });

  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--";

  const renderMethodBadge = (method) => {
    if (!method) return null;
    const m = method.toLowerCase();
    if (m === 'bank') return <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-indigo-200"><Landmark size={12} /> BANK</span>;
    if (m === 'mpesa') return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-emerald-200"><Smartphone size={12} /> M-PESA</span>;
    if (m === 'cash') return <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase border border-slate-200"><Banknote size={12} /> CASH</span>;
    return <span className="text-slate-400 text-[10px]">{method}</span>;
  };

  // --- HISTORY VIEW ---
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
                    {renderMethodBadge(step.paymentMethod)}
                  </div>
                  {/* SHOW BALANCE REMAINING AT TIME OF PAYMENT *//*
                  {step.balanceAfter > 0 && (
                    <p className="text-xs font-bold text-rose-500 mb-1">Balance Remaining: KES {Number(step.balanceAfter).toLocaleString()}</p>
                  )}
                  <p className="text-xs text-slate-500">{step.createdAt?.toDate().toLocaleDateString()} at {formatTime(step.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN TABLE VIEW ---
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Business Ledger</h2>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
             <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner">
              <button onClick={() => setViewMode("daily")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Calendar size={14} /> DAILY LOGS</button>
              <button onClick={() => setViewMode("debtors")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'debtors' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}><Users size={14} /> DEBTORS</button>
            </div>
             {viewMode === "daily" && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm">
                <Calendar size={18} className="text-blue-600" />
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-black text-slate-700" />
              </div>
            )}
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm w-full lg:w-auto">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="outline-none text-sm font-semibold text-slate-700 w-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Sales</p>
            <p className="text-2xl font-black text-slate-900 font-mono">KES {totals.sales.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Outstanding</p>
            <p className="text-2xl font-black text-rose-600 font-mono">KES {totals.debt.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Net Cash</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">KES {(totals.collected - totals.expenses).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-white">
            <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
              <th className="p-6">Time</th>
              <th className="p-6">Type</th>
              <th className="p-6">Description</th>
              <th className="p-6">Method</th>
              <th className="p-6 text-right">Amount</th>
              <th className="p-6 text-center">Balance / Status</th> 
              <th className="p-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading records...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan="7" className="p-20 text-center text-slate-300 italic">No records found.</td></tr>
            ) : (
              filteredRecords.map((rec) => {
                const isExp = rec.ledgerType === 'expense';
                const isJob = rec.ledgerType === 'account';
                
                // Calculate Balance for Jobs
                const balance = isJob ? (Number(rec.totalAmount) - Number(rec.paidAmount)) : 0;

                return (
                  <tr key={rec.id} className={`hover:bg-slate-50 transition-colors group ${isExp ? 'bg-rose-50/40' : ''}`}>
                    <td className="p-6 text-xs font-black text-slate-400">
                      {viewMode === "daily" ? formatTime(rec.createdAt) : rec.createdAt?.toDate().toLocaleDateString()}
                    </td>
                    
                    <td className="p-6">
                      {isExp ? <span className="flex items-center gap-1 text-rose-600 font-black text-[10px] uppercase"><TrendingDown size={14} /> EXPENSE</span> 
                      : isJob ? <span className="text-purple-600 font-black text-[10px] uppercase">JOB ORDER</span> 
                      : <span className="flex items-center gap-1 text-emerald-600 font-black text-[10px] uppercase"><TrendingUp size={14} /> SALE</span>}
                    </td>

                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-sm leading-tight">{rec.description || (isExp ? "Expense" : "Retail Sale")}</p>
                      {rec.transactionCode && <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{rec.transactionCode}</p>}
                    </td>

                    <td className="p-6">{renderMethodBadge(rec.paymentMethod)}</td>

                    <td className={`p-6 text-right font-black text-lg ${isExp ? 'text-rose-600' : 'text-slate-900'}`}>
                      {isExp ? "-" : "+"} KES {Number(rec.amount || rec.totalAmount).toLocaleString()}
                    </td>

                    {/* ✅ STATUS COLUMN LOGIC *//*
                    <td className="p-6 text-center">
                      {isJob ? (
                        balance > 0 ? (
                          <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-black border border-rose-200">
                            OWE: {balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-600 flex items-center justify-center gap-1 font-bold text-[10px]">
                            <CheckCircle size={14} /> PAID
                          </span>
                        )
                      ) : isExp ? (
                        <span className="text-slate-300 text-[10px] font-bold">---</span>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[10px]">SETTLED</span>
                      )}
                    </td>

                    <td className="p-6 text-center">
                      {(rec.ledgerType === 'account' || rec.accountId) ? (
                        <button onClick={() => viewAccountHistory(rec.ledgerType === 'account' ? rec.id : rec.accountId, rec.description)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                          <ChevronRight size={18} />
                        </button>
                      ) : <span className="text-[9px] text-slate-300 font-black">---</span>}
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
}*/


