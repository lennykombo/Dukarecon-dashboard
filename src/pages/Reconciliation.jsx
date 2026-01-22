import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  AlertCircle, 
  CheckCircle,
  Smartphone, 
  Landmark,   
  Calendar,
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  X,
  Eye,
  Truck,
  Loader2,
  Briefcase
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [sales, setSales] = useState([]);
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]); 
  
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [stats, setStats] = useState({
    smsMpesa: 0, smsBank: 0, smsExpenses: 0,
    appMpesa: 0, appBank: 0, appCash: 0,
    expCash: 0, expMpesa: 0, expBank: 0,
    unmatchedLogs: []
  });

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);

    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      // 1. SALES
      const salesQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
      
      // 2. LOGS
      const logsQ = query(collection(db, "mpesa_logs"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      // 3. EXPENSES
      const expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      const [salesSnap, logsSnap, expSnap] = await Promise.all([getDocs(salesQ), getDocs(logsQ), getDocs(expQ)]);

      const salesData = salesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const logsData = logsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const expData = expSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));

      setSales(salesData);
      setLogs(logsData);
      setExpenses(expData);

      // --- CALCULATIONS ---
      
      // A. LOGS
      let smsM = 0, smsB = 0, smsE = 0;
      logsData.forEach(d => {
        const amt = Number(d.amount || 0);
        if (d.category === 'income') {
            if (d.type === 'bank_transfer') smsB += amt;
            else smsM += amt;
        }
        else if (d.category === 'expense' || d.category === 'withdrawal') {
            smsE += amt;
        }
      });

      // B. SALES
      let appM = 0, appB = 0, appC = 0;
      salesData.forEach(d => {
        const amt = Number(d.amount || d.paidAmount || 0);
        const m = (d.paymentMethod || "").toLowerCase();
        //if (m === 'cash') appC += amt;
        //else if (m === 'mpesa') appM += amt;
        //else if (m === 'bank') appB += amt;
        // 1. CASH
if (m === 'cash') {
    appC += amt;
} 
// 2. BANK (Check for keywords like Equity, KCB, Sacco)
else if (m.includes('bank') || m.includes('equity') || m.includes('sacco') || m.includes('kcb')) {
    appB += amt;
}
// 3. M-PESA (Catch-all for 'mpesa', 'paybill', 'till', etc.)
else {
    appM += amt; 
}
      });

      // C. EXPENSES
      let expM = 0, expC = 0, expB = 0;
      expData.forEach(d => {
        const amt = Number(d.amount || 0);
        const m = (d.paymentMethod || "").toLowerCase();
        if (m === 'mpesa') expM += amt;
        else if (m === 'bank') expB += amt;
        else expC += amt;
      });

      // D. UNMATCHED LOGS
      const unmatched = logsData.filter(log => {
        if (log.category !== 'income') return false; // Only show missing INCOME in the unmatched list
        const match = salesData.some(sale => 
          (sale.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase() &&
          Number(sale.amount) === Number(log.amount)
        );
        return !match;
      });

      setStats({
        smsMpesa: smsM, smsBank: smsB, smsExpenses: smsE,
        appMpesa: appM, appBank: appB, appCash: appC,
        expMpesa: expM, expBank: expB, expCash: expC,
        unmatchedLogs: unmatched
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [businessId, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // VARIANCE
  const mpesaDiff = stats.smsMpesa - stats.appMpesa;
  const bankDiff = stats.smsBank - stats.appBank;
  const expenseDiff = stats.smsExpenses - (stats.expMpesa + stats.expBank); 
  const netCash = stats.appCash - stats.expCash; 

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase">Reconciling Accounts...</p>
      </div>
    );
  }

  // --- MODAL COMPONENT (Fixed to handle both Sales and Expenses) ---
  const TransactionModal = () => {
    if (!selectedTransaction) return null;

    // Detect if this is an Expense or a Sale
    const isExpense = selectedTransaction.category && !selectedTransaction.saleType;

    const { items, receiptText, description, jobName, saleType, balanceAfter, transactionCode, amount, createdAt, attendantName, userName, paymentMethod } = selectedTransaction;
    const hasItems = items && Array.isArray(items) && items.length > 0;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
          
          {/* HEADER */}
          <div className={`p-6 flex justify-between items-center text-white ${isExpense ? 'bg-orange-600' : 'bg-slate-900'}`}>
            <div>
              <h3 className="font-bold text-lg">{isExpense ? 'Expense Details' : 'Transaction Details'}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${isExpense ? 'bg-orange-800' : (saleType === 'job' ? 'bg-purple-600' : 'bg-emerald-600')}`}>
                  {isExpense ? 'EXPENSE' : (saleType === 'job' ? 'JOB ORDER' : 'RETAIL SALE')}
                </span>
                <span className="text-white/80 text-xs font-mono tracking-widest">{transactionCode || "NO REF"}</span>
              </div>
            </div>
            <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-black/20 rounded-full hover:bg-black/40 transition-colors"><X size={20} /></button>
          </div>

          {/* BODY */}
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-6">
            
            {/* CONTEXT CARD */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                {isExpense ? 'Expense Description' : (saleType === 'job' ? 'Job Description' : 'Customer / Reference')}
              </p>
              <p className="text-lg font-black text-slate-800">
                {jobName || description || "No Description"}
              </p>
              {balanceAfter > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold border border-rose-100">
                  <AlertCircle size={14} />
                  Balance Remaining: KES {Number(balanceAfter).toLocaleString()}
                </div>
              )}
            </div>

            {/* EXPENSE DETAILS (Only for Expenses) */}
            {isExpense && (
                <div className="flex gap-4">
                    <div className="flex-1 bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Category</p>
                        <p className="font-bold text-slate-800 capitalize">{selectedTransaction.category || "General"}</p>
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-xl border border-slate-200">
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Method</p>
                         <p className="font-bold text-slate-800 uppercase">{paymentMethod || "CASH"}</p>
                    </div>
                </div>
            )}

            {/* ITEMS TABLE (Only for Sales) */}
            {hasItems && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Items Sold</h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-black">
                      <tr><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-bold text-slate-700">{item.name}</td>
                          <td className="p-3 text-center text-slate-500">x{item.qty}</td>
                          <td className="p-3 text-right text-slate-500">{Number(item.price).toLocaleString()}</td>
                          <td className="p-3 text-right font-bold text-slate-900">{Number(item.qty * item.price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* RECEIPT PREVIEW (Only for Sales if exists) */}
            {receiptText && (
                <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Official Receipt Preview</h4>
                <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl font-mono text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed select-text">
                    {receiptText}
                </div>
                </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-500">Total Amount</span>
              <span className={`text-3xl font-black ${isExpense ? 'text-orange-600' : 'text-slate-900'}`}>
                 {isExpense ? '-' : ''} KES {Number(amount).toLocaleString()}
              </span>
            </div>
            <div className="mt-3 flex justify-between items-center text-xs text-slate-400">
               <span>Recorded by: <b className="text-slate-600">{attendantName || userName || "Unknown Staff"}</b></span>
               <span>{createdAt?.toDate ? createdAt.toDate().toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AuditCard = ({ title, icon: Icon, sms, app, diff, color, subtitle }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex-1 min-w-[300px]">
      <div className="flex justify-between mb-4">
        <div className={`p-3 rounded-xl ${color.bg} ${color.text}`}><Icon size={24} /></div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{title} VARIANCE</p>
          <p className={`text-2xl font-black ${diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {diff === 0 ? "BALANCED" : `${diff > 0 ? "MISSING" : "SURPLUS"} ${Math.abs(diff).toLocaleString()}`}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>{subtitle || "SMS/Bank Log"}:</span>
          <span className="text-slate-900 font-bold">{sms.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-slate-500 font-medium">
          <span>Recorded in App:</span>
          <span className="text-slate-900 font-bold">{app.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
      
      {/* --- ADDED: RENDER THE MODAL HERE --- */}
      <TransactionModal />

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Reconciliation</h2>
          <p className="text-slate-400 font-medium">Daily Audit & Cash Flow</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-bold text-slate-700 bg-transparent" />
        </div>
      </div>

      <StatementUpload businessId={businessId} />

      {/* 1. AUDIT ROW */}
      <div className="flex flex-wrap gap-6 mb-8 mt-8">
        <AuditCard title="M-Pesa" icon={Smartphone} sms={stats.smsMpesa} app={stats.appMpesa} diff={mpesaDiff} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <AuditCard title="Bank & Sacco" icon={Landmark} sms={stats.smsBank} app={stats.appBank} diff={bankDiff} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <AuditCard title="Digital Expenses" icon={Truck} sms={stats.smsExpenses} app={stats.expMpesa + stats.expBank} diff={expenseDiff} color={{ bg: 'bg-orange-100', text: 'text-orange-600' }} subtitle="SMS (Paid Out)" />
      </div>

      {/* 2. CASH FLOW ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingUp size={18} className="text-emerald-500" /><span className="text-xs font-black uppercase tracking-widest">Cash Sales (Drawer)</span></div>
          <p className="text-3xl font-black text-slate-900">KES {stats.appCash.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingDown size={18} className="text-rose-500" /><span className="text-xs font-black uppercase tracking-widest">Cash Expenses</span></div>
          <p className="text-3xl font-black text-rose-600">- KES {stats.expCash.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><Wallet size={18} className="text-blue-400" /><span className="text-xs font-black uppercase tracking-widest">Net Cash In Hand</span></div>
          <p className="text-4xl font-black">KES {netCash.toLocaleString()}</p>
        </div>
      </div>

      {/* 3. WARNING BANNER */}
      {stats.unmatchedLogs.length > 0 && (
        <div className="mb-6 bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-5">
          <div className="bg-amber-500 p-3 rounded-xl text-white shadow-lg"><AlertCircle size={28} /></div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">Attention: {stats.unmatchedLogs.length} Unclaimed Transactions</h4>
            <p className="text-amber-800 opacity-90 leading-relaxed font-medium">We found money in your logs that was not recorded as a sale in the app.</p>
          </div>
        </div>
      )}

      {/* 4. DETAILED TABLE */}
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-6">Source</th>
              <th className="p-6">Code / Ref</th>
              <th className="p-6">Description</th>
              <th className="p-6">App Amount</th>
              <th className="p-6">SMS Amount</th>
              <th className="p-6">Status</th>
              <th className="p-6 text-center">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* A. UNMATCHED LOGS */}
            {stats.unmatchedLogs.map((log, idx) => (
              <tr key={`ghost-${idx}`} className="bg-rose-50/50 hover:bg-rose-100/50 transition-colors">
                <td className="p-6 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${log.type === 'bank_transfer' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {log.type === 'bank_transfer' ? <Landmark size={20} /> : <Smartphone size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{log.type === 'bank_transfer' ? 'BANK/SACCO' : 'M-PESA'}</p>
                    <p className="text-[11px] font-bold text-slate-600 mt-0.5">Synced by: <span className="text-slate-800">{log.attendantName || "Unknown"}</span></p>
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Missing Sale</p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs font-black text-rose-800">{log.transactionCode}</td>
                <td className="p-6 text-xs font-bold text-slate-500">Received from {log.sender || "Unknown Sender"}</td>
                <td className="p-6 text-slate-300 font-bold">---</td>
                <td className="p-6 font-black text-rose-700">KES {Number(log.amount).toLocaleString()}</td>
                <td className="p-6"><span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm">UNCLAIMED</span></td>
                <td className="p-6 text-center text-slate-300">--</td>
              </tr>
            ))}

            {/* B. SALES (INCOME) */}
            {sales.map(sale => {
              const actualLog = logs.find(log => (log.transactionCode || "").toUpperCase() === (sale.transactionCode || "").toUpperCase() && log.category === 'income');
              const isMatched = actualLog && Number(actualLog.amount) === Number(sale.amount);
              return (
                <tr key={sale.id} onClick={() => setSelectedTransaction(sale)} className="hover:bg-blue-50/50 transition-colors cursor-pointer group">
                  <td className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-200 group-hover:text-blue-700 transition-colors"><Receipt size={20} /></div>
                    <div>
                      <p className="font-black text-slate-800 text-sm group-hover:text-blue-700">{sale.attendantName || "Staff App"}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{sale.paymentMethod || 'CASH'}</p>
                    </div>
                  </td>
                  <td className="p-6 font-mono text-xs text-slate-500 font-semibold">{sale.transactionCode || "---"}</td>
                  <td className="p-6 text-sm font-bold text-slate-700">{sale.description || "Retail Sale"}</td>
                  <td className="p-6"><span className="font-black text-slate-900">KES {Number(sale.amount).toLocaleString()}</span></td>
                  <td className="p-6 text-slate-500">{actualLog ? `KES ${Number(actualLog.amount).toLocaleString()}` : "--"}</td>
                  <td className="p-6">
                    {isMatched ? <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100 px-3 py-1 rounded-lg"><CheckCircle size={16} /><span className="text-[10px] font-bold">VERIFIED</span></div> : <span className="text-slate-400 text-[10px] font-bold bg-slate-100 px-3 py-1 rounded-lg">CASH</span>}
                  </td>
                  <td className="p-6 text-center text-slate-300"><Eye size={18} /></td>
                </tr>
              );
            })}

            {/* C. EXPENSES (MONEY OUT) - ADDED CLICK HANDLER */}
            {expenses.map(exp => (
              <tr 
                key={exp.id} 
                onClick={() => setSelectedTransaction(exp)} 
                className="bg-orange-50/30 hover:bg-orange-100 transition-colors cursor-pointer group"
              >
                <td className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">EXPENSE</p>
                    <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                      Recorded by: <span className="text-slate-800">{exp.userName || "Unknown"}</span>
                    </p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs text-slate-500 font-semibold">
                  {exp.transactionCode || "CASH-EXP"}
                </td>
                <td className="p-6 text-sm font-bold text-slate-700">
                  {exp.description || "Misc Expense"}
                  <span className="block text-[10px] text-orange-400 uppercase font-black tracking-widest mt-1">
                    {exp.category || "General"}
                  </span>
                </td>
                <td className="p-6">
                  <span className="font-black text-orange-600">- KES {Number(exp.amount).toLocaleString()}</span>
                </td>
                <td className="p-6 text-slate-300 font-bold">--</td>
                <td className="p-6">
                   <div className="flex items-center gap-2 text-orange-600 bg-orange-100 px-3 py-1 rounded-lg border border-orange-200">
                      <CheckCircle size={16} />
                      <span className="text-[10px] font-black uppercase">RECORDED</span>
                   </div>
                </td>
                <td className="p-6 text-center text-slate-300"><Eye size={18} /></td>
              </tr>
            ))}

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
  AlertCircle, 
  CheckCircle,
  Smartphone, 
  Landmark,   
  Calendar,
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  X,
  Eye
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [sales, setSales] = useState([]);
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [stats, setStats] = useState({
    smsMpesa: 0, smsBank: 0,
    appMpesa: 0, appBank: 0, appCash: 0,
    expCash: 0, expMpesa: 0,
    unmatchedLogs: []
  });

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);

    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      // 1. SALES
      const salesQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
      
      // 2. LOGS
      const logsQ = query(collection(db, "mpesa_logs"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      // 3. EXPENSES
      const expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      const [salesSnap, logsSnap, expSnap] = await Promise.all([getDocs(salesQ), getDocs(logsQ), getDocs(expQ)]);

      const salesData = salesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const logsData = logsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const expData = expSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));

      setSales(salesData);
      setLogs(logsData);
      setExpenses(expData);

      // --- CALCULATIONS ---
      let smsM = 0, smsB = 0;
      let appM = 0, appB = 0, appC = 0;
      let expM = 0, expC = 0;

      logsData.forEach(d => {
        if (d.type === 'bank') smsB += Number(d.amount || 0);
        else smsM += Number(d.amount || 0);
      });

      salesData.forEach(d => {
        const amt = Number(d.amount || d.paidAmount || 0);
        const m = (d.paymentMethod || "").toLowerCase();
        if (m === 'cash') appC += amt;
        else if (m === 'mpesa') appM += amt;
        else appB += amt;
      });

      expData.forEach(d => {
        const amt = Number(d.amount || 0);
        if (d.paymentMethod === 'mpesa') expM += amt;
        else expC += amt;
      });

      const unmatched = logsData.filter(log => 
        !salesData.some(sale => 
          (sale.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase() &&
          Number(sale.amount) === Number(log.amount)
        )
      );

      setStats({
        smsMpesa: smsM, smsBank: smsB,
        appMpesa: appM, appBank: appB, appCash: appC,
        expMpesa: expM, expCash: expC,
        unmatchedLogs: unmatched
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [businessId, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const mpesaDiff = stats.smsMpesa - stats.appMpesa;
  const bankDiff = stats.smsBank - stats.appBank;
  const netCash = stats.appCash - stats.expCash; 

  // --- MODAL ---
 /* const TransactionModal = () => {
    if (!selectedTransaction) return null;
    const { items, receiptText, description, jobName, saleType } = selectedTransaction;
    const hasItems = items && Array.isArray(items) && items.length > 0;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
            <div>
              <h3 className="font-bold text-lg">Transaction Details</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${saleType === 'job' ? 'bg-purple-600' : 'bg-emerald-600'}`}>
                  {saleType === 'job' ? 'JOB ORDER' : 'RETAIL SALE'}
                </span>
                <span className="text-slate-400 text-xs font-mono tracking-widest">{selectedTransaction.transactionCode || "NO REF"}</span>
              </div>
            </div>
            <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={20} /></button>
          </div>
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
            {saleType === 'job' && (
              <div className="mb-4 bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Job Description</p>
                <p className="text-lg font-black text-purple-900">{jobName || description || "Unnamed Job"}</p>
              </div>
            )}
            {hasItems ? (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-black">
                    <tr><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-700">{item.name}</td>
                        <td className="p-3 text-center text-slate-500">x{item.qty}</td>
                        <td className="p-3 text-right text-slate-500">{Number(item.price).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-slate-900">{Number(item.qty * item.price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm font-mono text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {receiptText || description || "No item details available."}
              </div>
            )}
          </div>
          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-500">Total Amount</span>
              <span className="text-3xl font-black text-slate-900">KES {Number(selectedTransaction.amount).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };*/

  // --- MODAL COMPONENT (UPDATED) --- 
 /* const TransactionModal = () => {
    if (!selectedTransaction) return null;

    const { items, receiptText, description, jobName, saleType, balanceAfter } = selectedTransaction;
    const hasItems = items && Array.isArray(items) && items.length > 0;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
          
          {/* 1. HEADER *//*
          <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
            <div>
              <h3 className="font-bold text-lg">Transaction Details</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${saleType === 'job' ? 'bg-purple-600' : 'bg-emerald-600'}`}>
                  {saleType === 'job' ? 'JOB ORDER' : 'RETAIL SALE'}
                </span>
                <span className="text-slate-400 text-xs font-mono tracking-widest">{selectedTransaction.transactionCode || "NO REF"}</span>
              </div>
            </div>
            <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={20} /></button>
          </div>

          {/* 2. BODY *//*
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-6">
            
            {/* A. CLIENT / JOB CONTEXT (Always Show) *//*
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                {saleType === 'job' ? 'Job Description' : 'Customer / Reference'}
              </p>
              <p className="text-lg font-black text-slate-800">
                {jobName || description || "Walk-in Customer"}
              </p>
              {balanceAfter > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold border border-rose-100">
                  <AlertCircle size={14} />
                  Balance Remaining: KES {Number(balanceAfter).toLocaleString()}
                </div>
              )}
            </div>

            {/* B. ITEMS TABLE (If available) *//*
            {hasItems && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Items Sold</h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-black">
                      <tr><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-bold text-slate-700">{item.name}</td>
                          <td className="p-3 text-center text-slate-500">x{item.qty}</td>
                          <td className="p-3 text-right text-slate-500">{Number(item.price).toLocaleString()}</td>
                          <td className="p-3 text-right font-bold text-slate-900">{Number(item.qty * item.price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* C. OFFICIAL RECEIPT TEXT (Always Show for verification) *//*
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Official Receipt Preview</h4>
              <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl font-mono text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed select-text">
                {receiptText || "No receipt text generated."}
              </div>
            </div>

          </div>

          {/* 3. FOOTER *//*
          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-500">Total Amount</span>
              <span className="text-3xl font-black text-slate-900">KES {Number(selectedTransaction.amount).toLocaleString()}</span>
            </div>
            <div className="mt-3 flex justify-between items-center text-xs text-slate-400">
               <span>Recorded by: <b className="text-slate-600">{selectedTransaction.attendantName || "Unknown Staff"}</b></span>
               <span>{selectedTransaction.createdAt?.toDate().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AuditCard = ({ title, icon: Icon, sms, app, diff, color }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex-1 min-w-[300px]">
      <div className="flex justify-between mb-4">
        <div className={`p-3 rounded-xl ${color.bg} ${color.text}`}><Icon size={24} /></div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{title} VARIANCE</p>
          <p className={`text-2xl font-black ${diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {diff === 0 ? "BALANCED" : `${diff > 0 ? "MISSING" : "SURPLUS"} ${Math.abs(diff).toLocaleString()}`}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>SMS/Bank Log:</span>
          <span className="text-slate-900 font-bold">{sms.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-slate-500 font-medium">
          <span>App Recorded:</span>
          <span className="text-slate-900 font-bold">{app.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
      <TransactionModal />

      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Reconciliation</h2>
          <p className="text-slate-400 font-medium">Daily Audit & Cash Flow</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-bold text-slate-700 bg-transparent" />
        </div>
      </div>

      <StatementUpload businessId={businessId} />

      {/* 1. AUDIT ROW *//*
      <div className="flex flex-wrap gap-6 mb-8 mt-8">
        <AuditCard title="M-Pesa" icon={Smartphone} sms={stats.smsMpesa} app={stats.appMpesa} diff={mpesaDiff} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <AuditCard title="Bank & Sacco" icon={Landmark} sms={stats.smsBank} app={stats.appBank} diff={bankDiff} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
      </div>

      {/* 2. CASH & EXPENSE ROW *//*
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingUp size={18} className="text-emerald-500" /><span className="text-xs font-black uppercase tracking-widest">Cash Sales</span></div>
          <p className="text-3xl font-black text-slate-900">KES {stats.appCash.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingDown size={18} className="text-rose-500" /><span className="text-xs font-black uppercase tracking-widest">Total Expenses</span></div>
          <p className="text-3xl font-black text-rose-600">- KES {(stats.expCash + stats.expMpesa).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><Wallet size={18} className="text-blue-400" /><span className="text-xs font-black uppercase tracking-widest">Net Cash In Hand</span></div>
          <p className="text-4xl font-black">KES {netCash.toLocaleString()}</p>
        </div>
      </div>

      {/* 3. WARNING BANNER *//*
      {stats.unmatchedLogs.length > 0 && (
        <div className="mb-6 bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-5">
          <div className="bg-amber-500 p-3 rounded-xl text-white shadow-lg"><AlertCircle size={28} /></div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">Attention: {stats.unmatchedLogs.length} Unclaimed Transactions</h4>
            <p className="text-amber-800 opacity-90 leading-relaxed font-medium">We found money in your logs that was not recorded as a sale in the app.</p>
          </div>
        </div>
      )}

      {/* 4. DETAILED TABLE *//*
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-6">Source</th>
              <th className="p-6">Transaction Code</th>
              <th className="p-6">Description</th> 
              <th className="p-6">App Amount</th>
              <th className="p-6">Bank/SMS Amount</th>
              <th className="p-6">Status</th>
              <th className="p-6 text-center">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* A. UNMATCHED LOGS *//*
            {stats.unmatchedLogs.map((log, idx) => (
              <tr key={`ghost-${idx}`} className="bg-rose-50/50 hover:bg-rose-100/50 transition-colors">
                <td className="p-6 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${log.type === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {log.type === 'bank' ? <Landmark size={20} /> : <Smartphone size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{log.type === 'bank' ? 'BANK/SACCO' : 'M-PESA'}</p>
                    <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                      Synced by: <span className="text-slate-800">{log.attendantName || "Unknown Device"}</span></p>
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Missing Sale</p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs font-black text-rose-800">{log.transactionCode}</td>
                {/* UNMATCHED DESCRIPTION *//*
                <td className="p-6 text-xs font-bold text-slate-500">
                  SMS from {log.sender || "Unknown Sender"}
                </td>
                <td className="p-6 text-slate-300 font-bold">---</td>
                <td className="p-6 font-black text-rose-700">KES {Number(log.amount).toLocaleString()}</td>
                <td className="p-6"><span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm">UNCLAIMED</span></td>
                <td className="p-6 text-center text-slate-300 text-xs">--</td>
              </tr>
            ))}

            {/* B. APP SALES *//*
            {sales.map(sale => {
              const actualLog = logs.find(log => (log.transactionCode || "").toUpperCase() === (sale.transactionCode || "").toUpperCase());
              const isMatched = actualLog && Number(actualLog.amount) === Number(sale.amount);
              const isMismatch = actualLog && Number(actualLog.amount) !== Number(sale.amount);
              const isFakeCode = (sale.paymentMethod === 'mpesa' || sale.paymentMethod === 'bank') && !actualLog;

              return (
                <tr key={sale.id} onClick={() => setSelectedTransaction(sale)} className="hover:bg-blue-50/50 transition-colors cursor-pointer group">
                  <td className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-200 group-hover:text-blue-700 transition-colors">
                      <Receipt size={20} />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm group-hover:text-blue-700">{sale.attendantName || "Staff App"}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{sale.paymentMethod || 'CASH'}</p>
                    </div>
                  </td>
                  <td className="p-6 font-mono text-xs text-slate-500 font-semibold">{sale.transactionCode || "---"}</td>
                  
                  {/* MATCHED DESCRIPTION *//*
                  <td className="p-6 text-sm font-bold text-slate-700">
                    {sale.description || (sale.saleType === 'job' ? sale.jobName : "Retail Sale")}
                  </td>

                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 group-hover:text-blue-700">KES {Number(sale.amount).toLocaleString()}</span>
                      {sale.balanceAfter > 0 && <span className="text-[10px] font-bold text-rose-500 mt-1">Bal: {Number(sale.balanceAfter).toLocaleString()}</span>}
                    </div>
                  </td>
                  <td className={`p-6 font-black ${isMismatch ? 'text-rose-600 underline' : 'text-slate-500'}`}>
                    {actualLog ? `KES ${Number(actualLog.amount).toLocaleString()}` : "--"}
                  </td>
                  <td className="p-6">
                    {isMatched ? <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100/50 w-fit px-3 py-1.5 rounded-lg border border-emerald-200"><CheckCircle size={16} /><span className="text-[10px] font-black uppercase">Verified</span></div> : 
                     isMismatch ? <div className="flex items-center gap-2 text-amber-600 bg-amber-100/50 w-fit px-3 py-1.5 rounded-lg border border-amber-200"><AlertCircle size={16} /><span className="text-[10px] font-black uppercase">Diff</span></div> : 
                     isFakeCode ? <div className="flex items-center gap-2 text-rose-600 bg-rose-100/50 w-fit px-3 py-1.5 rounded-lg border border-rose-200"><AlertCircle size={16} /><span className="text-[10px] font-black uppercase">No Log</span></div> : 
                     <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg">Cash</span>}
                  </td>
                  <td className="p-6 text-center text-slate-300 group-hover:text-blue-500"><Eye size={18} /></td>
                </tr>
              );
            })}
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
  AlertCircle, 
  CheckCircle,
  Smartphone, 
  Landmark,   
  Calendar,
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  X,   // New: Close Icon
  Eye  // New: View Icon
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Data States
  const [sales, setSales] = useState([]);
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]); // Keep track of expenses separately if needed
  
  // Modal State (NEW)
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  // Calculated Stats
  const [stats, setStats] = useState({
    smsMpesa: 0, smsBank: 0,
    appMpesa: 0, appBank: 0, appCash: 0,
    expCash: 0, expMpesa: 0,
    unmatchedLogs: []
  });

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);

    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      // 1. SALES
      const salesQ = query(
        collection(db, "payments"), 
        where("businessId", "==", businessId), 
        where("createdAt", ">=", fireStart), 
        where("createdAt", "<=", fireEnd)
      );
      
      // 2. LOGS (Using createdAt so old data appears)
      const logsQ = query(
        collection(db, "mpesa_logs"), 
        where("businessId", "==", businessId), 
        where("createdAt", ">=", fireStart), 
        where("createdAt", "<=", fireEnd)
      );

      // 3. EXPENSES
      const expQ = query(
        collection(db, "expenses"), 
        where("businessId", "==", businessId), 
        where("createdAt", ">=", fireStart), 
        where("createdAt", "<=", fireEnd)
      );

      const [salesSnap, logsSnap, expSnap] = await Promise.all([getDocs(salesQ), getDocs(logsQ), getDocs(expQ)]);

      const salesData = salesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const logsData = logsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const expData = expSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));

      setSales(salesData);
      setLogs(logsData);
      setExpenses(expData);

      // --- CALCULATIONS ---
      let smsM = 0, smsB = 0;
      let appM = 0, appB = 0, appC = 0;
      let expM = 0, expC = 0;

      // Logs
      logsData.forEach(d => {
        if (d.type === 'bank') smsB += Number(d.amount || 0);
        else smsM += Number(d.amount || 0);
      });

      // Sales
      salesData.forEach(d => {
        const amt = Number(d.amount || d.paidAmount || 0);
        const m = (d.paymentMethod || "").toLowerCase();
        if (m === 'cash') appC += amt;
        else if (m === 'mpesa') appM += amt;
        else appB += amt;
      });

      // Expenses
      expData.forEach(d => {
        const amt = Number(d.amount || 0);
        if (d.paymentMethod === 'mpesa') expM += amt;
        else expC += amt;
      });

      // Find Unmatched (Ghost Money)
      const unmatched = logsData.filter(log => 
        !salesData.some(sale => 
          (sale.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase() &&
          Number(sale.amount) === Number(log.amount)
        )
      );

      setStats({
        smsMpesa: smsM, smsBank: smsB,
        appMpesa: appM, appBank: appB, appCash: appC,
        expMpesa: expM, expCash: expC,
        unmatchedLogs: unmatched
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [businessId, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Variances
  const mpesaDiff = stats.smsMpesa - stats.appMpesa;
  const bankDiff = stats.smsBank - stats.appBank;
  const netCash = stats.appCash - stats.expCash; 

  // --- MODAL COMPONENT (NEW) ---
  const TransactionModal = () => {
    if (!selectedTransaction) return null;

    // Use the stored receipt text or a fallback
    const details = selectedTransaction.receiptText 
      ? selectedTransaction.receiptText 
      : `Description: ${selectedTransaction.description || "N/A"}\n\n(No itemized receipt available)`;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
          
          {/* Modal Header *//*
          <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
            <div>
              <h3 className="font-bold text-lg">Transaction Details</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black bg-slate-700 px-2 py-0.5 rounded uppercase text-slate-300">
                  {selectedTransaction.paymentMethod || "CASH"}
                </span>
                <span className="text-slate-400 text-xs font-mono tracking-widest">
                  {selectedTransaction.transactionCode || "NO REF"}
                </span>
              </div>
            </div>
            <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Modal Body (Receipt) *//*
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
            <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm font-mono text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {details}
            </div>
          </div>

          {/* Modal Footer *//*
          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-500">Total Amount</span>
              <span className="text-3xl font-black text-slate-900">KES {Number(selectedTransaction.amount).toLocaleString()}</span>
            </div>
            <div className="mt-3 flex justify-between items-center text-xs text-slate-400">
               <span>Recorded by: <b className="text-slate-600">{selectedTransaction.attendantName || "Unknown Staff"}</b></span>
               <span>{selectedTransaction.createdAt?.toDate().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AuditCard = ({ title, icon: Icon, sms, app, diff, color }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex-1 min-w-[300px]">
      <div className="flex justify-between mb-4">
        <div className={`p-3 rounded-xl ${color.bg} ${color.text}`}><Icon size={24} /></div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{title} VARIANCE</p>
          <p className={`text-2xl font-black ${diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {diff === 0 ? "BALANCED" : `${diff > 0 ? "MISSING" : "SURPLUS"} ${Math.abs(diff).toLocaleString()}`}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>SMS/Bank Log:</span>
          <span className="text-slate-900 font-bold">{sms.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-slate-500 font-medium">
          <span>App Recorded:</span>
          <span className="text-slate-900 font-bold">{app.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
      
      {/* RENDER MODAL *//*
      <TransactionModal />

      {/* HEADER *//*
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Reconciliation</h2>
          <p className="text-slate-400 font-medium">Daily Audit & Cash Flow</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-bold text-slate-700 bg-transparent" />
        </div>
      </div>

      <StatementUpload businessId={businessId} />

      {/* 1. DIGITAL AUDIT ROW *//*
      <div className="flex flex-wrap gap-6 mb-8 mt-8">
        <AuditCard title="M-Pesa" icon={Smartphone} sms={stats.smsMpesa} app={stats.appMpesa} diff={mpesaDiff} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <AuditCard title="Bank & Sacco" icon={Landmark} sms={stats.smsBank} app={stats.appBank} diff={bankDiff} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
      </div>

      {/* 2. CASH & EXPENSE ROW *//*
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <TrendingUp size={18} className="text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-widest">Cash Sales</span>
          </div>
          <p className="text-3xl font-black text-slate-900">KES {stats.appCash.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <TrendingDown size={18} className="text-rose-500" />
            <span className="text-xs font-black uppercase tracking-widest">Total Expenses</span>
          </div>
          <p className="text-3xl font-black text-rose-600">- KES {(stats.expCash + stats.expMpesa).toLocaleString()}</p>
          <div className="flex justify-between mt-2 text-xs font-bold text-slate-400">
             <span>Cash: {stats.expCash.toLocaleString()}</span>
             <span>M-Pesa: {stats.expMpesa.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Wallet size={18} className="text-blue-400" />
            <span className="text-xs font-black uppercase tracking-widest">Net Cash In Hand</span>
          </div>
          <p className="text-4xl font-black">KES {netCash.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">Physical cash expected in drawer</p>
        </div>
      </div>

      {/* 3. WARNING BANNER FOR UNMATCHED LOGS *//*
      {stats.unmatchedLogs.length > 0 && (
        <div className="mb-6 bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-5">
          <div className="bg-amber-500 p-3 rounded-xl text-white shadow-lg">
            <AlertCircle size={28} />
          </div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">Attention: {stats.unmatchedLogs.length} Unclaimed Transactions</h4>
            <p className="text-amber-800 opacity-90 leading-relaxed font-medium">
              We found money in your logs (Bank/M-Pesa) that was not recorded as a sale in the app.
            </p>
          </div>
        </div>
      )}

      {/* 4. DETAILED TABLE *//*
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-6">Source</th>
              <th className="p-6">Transaction Code</th>
              <th className="p-6">Description</th>
              <th className="p-6">App Amount</th>
              <th className="p-6">Bank/SMS Amount</th>
              <th className="p-6">Status</th>
              <th className="p-6 text-center">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* A. UNMATCHED LOGS (Ghost Money - Not Clickable) *//*
            {stats.unmatchedLogs.map((log, idx) => (
              <tr key={`ghost-${idx}`} className="bg-rose-50/50 hover:bg-rose-100/50 transition-colors">
                <td className="p-6 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${log.type === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {log.type === 'bank' ? <Landmark size={20} /> : <Smartphone size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{log.type === 'bank' ? 'BANK/SACCO' : 'M-PESA'}</p>
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Missing Sale</p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs font-black text-rose-800">{log.transactionCode}</td>
                <td className="p-6 text-slate-300 font-bold">---</td>
                <td className="p-6 font-black text-rose-700">KES {Number(log.amount).toLocaleString()}</td>
                <td className="p-6"><span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm">UNCLAIMED</span></td>
                <td className="p-6 text-center text-slate-300 text-xs">--</td>
              </tr>
            ))}

            {/* B. APP SALES RECORDS (Clickable) *//*
            {sales.map(sale => {
              const actualLog = logs.find(log => (log.transactionCode || "").toUpperCase() === (sale.transactionCode || "").toUpperCase());
              const isMatched = actualLog && Number(actualLog.amount) === Number(sale.amount);
              const isMismatch = actualLog && Number(actualLog.amount) !== Number(sale.amount);
              const isFakeCode = (sale.paymentMethod === 'mpesa' || sale.paymentMethod === 'bank') && !actualLog;

              return (
                <tr 
                  key={sale.id} 
                  onClick={() => setSelectedTransaction(sale)} // ✅ CLICK HANDLER
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                >
                  <td className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-200 group-hover:text-blue-700 transition-colors">
                      <Receipt size={20} />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm group-hover:text-blue-700">{sale.attendantName || "Staff App"}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{sale.paymentMethod || 'CASH'}</p>
                    </div>
                  </td>
                  <td className="p-6 font-mono text-xs text-slate-500 font-semibold">{sale.transactionCode || "---"}</td>
                
                  <td className="p-6">
  <div className="flex flex-col">
    <span className="font-black text-slate-900 group-hover:text-blue-700">
        KES {Number(sale.amount).toLocaleString()}
    </span>

    {sale.balanceAfter > 0 && (
       <span className="text-[10px] font-bold text-rose-500 mt-1">
         Bal: {Number(sale.balanceAfter).toLocaleString()}
       </span>
    )}
  </div>
</td>
                  <td className={`p-6 font-black ${isMismatch ? 'text-rose-600 underline' : 'text-slate-500'}`}>
                    {actualLog ? `KES ${Number(actualLog.amount).toLocaleString()}` : "--"}
                  </td>
                  <td className="p-6">
                    {isMatched ? (
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100/50 w-fit px-3 py-1.5 rounded-lg border border-emerald-200"><CheckCircle size={16} /><span className="text-[10px] font-black uppercase">Verified</span></div>
                    ) : isMismatch ? (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-100/50 w-fit px-3 py-1.5 rounded-lg border border-amber-200"><AlertCircle size={16} /><span className="text-[10px] font-black uppercase">Diff</span></div>
                    ) : isFakeCode ? (
                      <div className="flex items-center gap-2 text-rose-600 bg-rose-100/50 w-fit px-3 py-1.5 rounded-lg border border-rose-200"><AlertCircle size={16} /><span className="text-[10px] font-black uppercase">No Log</span></div>
                    ) : (
                      <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg">Cash</span>
                    )}
                  </td>
                  <td className="p-6 text-center text-slate-300 group-hover:text-blue-500">
                    <Eye size={18} />
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













/*import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  AlertCircle, 
  CheckCircle, 
  Info, 
  Smartphone, // M-Pesa Icon
  Landmark,   // Bank Icon
  Receipt, 
  Calendar,
  TrendingDown,
  ArrowRight
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [sales, setSales] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default to Today's date
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!businessId) return;

    const fetchData = async () => {
      setLoading(true);
      const [year, month, day] = selectedDate.split('-').map(Number);
      
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);

      try {
        // 1. Fetch Sales (App)
        const salesQ = query(
          collection(db, "payments"), 
          where("businessId", "==", businessId),
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end))
        );

        // 2. Fetch Logs (SMS/Bank)
        const logsQ = query(
          collection(db, "mpesa_logs"), 
          where("businessId", "==", businessId),
          where("receivedAt", ">=", Timestamp.fromDate(start)),
          where("receivedAt", "<=", Timestamp.fromDate(end))
        );

        const [salesSnap, logsSnap] = await Promise.all([getDocs(salesQ), getDocs(logsQ)]);
        
        setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLogs(logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
      } catch (error) {
        console.error("Query Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [businessId, selectedDate]);

  // --- CALCULATION LOGIC ---

  // 1. Calculate Totals based on SOURCE (Bank vs Mpesa)
  const actualMpesaTotal = logs.filter(l => l.type !== 'bank').reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const actualBankTotal = logs.filter(l => l.type === 'bank').reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalActual = actualMpesaTotal + actualBankTotal;

  // 2. Verified Sales (Matches found)
  const verifiedSales = sales.filter(s => {
    return logs.some(l => 
      l.transactionCode?.toUpperCase() === s.transactionCode?.toUpperCase() &&
      Number(l.amount) === Number(s.amount)
    );
  });
  const totalVerified = verifiedSales.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  // 3. Discrepancy
  const discrepancy = totalActual - totalVerified;

  // 4. Ghost Money (Logs with no matching sale)
  const unmatchedLogs = logs.filter(log => 
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
      
      {/* HEADER & DATE *//*
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Reconciliation Engine</h2>
          <div className="flex items-center gap-4">
            <p className="text-slate-500 font-medium">Business ID: <span className="text-slate-800 font-bold">{businessId}</span></p>
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
        
        {/* SUMMARY CARDS *//*
        <div className="flex flex-wrap gap-4">
          {/* M-Pesa Total *//*
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={14} className="text-emerald-500"/>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">M-Pesa SMS</p>
            </div>
            <p className="text-2xl font-black text-slate-800 font-mono">KES {actualMpesaTotal.toLocaleString()}</p>
          </div>

          {/* Bank Total *//*
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Landmark size={14} className="text-indigo-500"/>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank SMS</p>
            </div>
            <p className="text-2xl font-black text-slate-800 font-mono">KES {actualBankTotal.toLocaleString()}</p>
          </div>

          {/* Discrepancy Card *//*
          <div className={`p-5 rounded-2xl border shadow-md min-w-[180px] transition-all ${discrepancy > 0 ? 'bg-rose-600 border-rose-700' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-[10px] font-black uppercase tracking-widest ${discrepancy > 0 ? 'text-rose-100' : 'text-emerald-600'}`}>Unaccounted</p>
              {discrepancy > 0 && <TrendingDown size={14} className="text-white animate-bounce" />}
            </div>
            <p className={`text-2xl font-black font-mono ${discrepancy > 0 ? 'text-white' : 'text-emerald-700'}`}>
              KES {discrepancy.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <StatementUpload businessId={businessId} />
      </div>

      {/* WARNING BANNER *//*
      {unmatchedLogs.length > 0 && (
        <div className="mb-6 bg-amber-50 border-l-8 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-5">
          <div className="bg-amber-500 p-3 rounded-xl text-white shadow-lg">
            <AlertCircle size={28} />
          </div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">Attention: {unmatchedLogs.length} Unclaimed Transactions</h4>
            <p className="text-amber-800 opacity-90 leading-relaxed font-medium">
              We found money in your logs (Bank/M-Pesa) that was not recorded as a sale in the app.
            </p>
          </div>
        </div>
      )}

      {/* TABLE *//*
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-6">Source</th>
              <th className="p-6">Transaction Code</th>
              <th className="p-6">App Amount</th>
              <th className="p-6">Bank/SMS Amount</th>
              <th className="p-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* 1. UNMATCHED LOGS (Ghost Money) *//*
            {unmatchedLogs.map((log, idx) => (
              <tr key={`ghost-${idx}`} className="bg-rose-50/50 hover:bg-rose-100/50 transition-colors">
                <td className="p-6 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${log.type === 'bank' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {log.type === 'bank' ? <Landmark size={20} /> : <Smartphone size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{log.type === 'bank' ? 'BANK' : 'M-PESA'}</p>
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Missing Sale</p>
                  </div>
                </td>
                <td className="p-6 font-mono text-xs font-black text-rose-800">{log.transactionCode}</td>
                <td className="p-6 text-slate-300 font-bold">---</td>
                <td className="p-6 font-black text-rose-700">KES {Number(log.amount).toLocaleString()}</td>
                <td className="p-6">
                  <span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm">UNCLAIMED</span>
                </td>
              </tr>
            ))}

            {/* 2. APP SALES RECORDS *//*
            {sales.map(sale => {
              const actualLog = logs.find(log => 
                log.transactionCode?.toUpperCase() === sale.transactionCode?.toUpperCase()
              );
              
              const isMatched = actualLog && Number(actualLog.amount) === Number(sale.amount);
              const isMismatch = actualLog && Number(actualLog.amount) !== Number(sale.amount);
              const isFakeCode = (sale.paymentMethod === 'mpesa' || sale.paymentMethod === 'bank') && !actualLog;

              return (
                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center">
                      <Receipt size={20} />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{sale.attendantName || "Staff App"}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        {sale.paymentMethod || 'CASH'}
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
                        <span className="text-[10px] font-black uppercase">Verified</span>
                      </div>
                    ) : isMismatch ? (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-100/50 w-fit px-3 py-1.5 rounded-lg border border-amber-200">
                        <AlertCircle size={16} />
                        <span className="text-[10px] font-black uppercase">Amount Diff</span>
                      </div>
                    ) : isFakeCode ? (
                      <div className="flex items-center gap-2 text-rose-600 bg-rose-100/50 w-fit px-3 py-1.5 rounded-lg border border-rose-200 animate-pulse">
                        <AlertCircle size={16} />
                        <span className="text-[10px] font-black uppercase">No Log Found</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg">
                        Cash / Unverifiable
                      </span>
                    )}
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

























/*import React, { useState, useEffect } from "react";
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
      {/* HEADER SECTION *//*
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Reconciliation Engine</h2>
          <div className="flex items-center gap-4">
            <p className="text-slate-500 font-medium">Auditing Daily Logs for Business ID: <span className="text-slate-800 font-bold">{businessId}</span></p>
            
            {/* DATE PICKER *//*
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
        
        {/* SUMMARY CARDS *//*
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

      {/* THEFT ALERT BOX *//*
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

      {/* MAIN DATA TABLE *//*
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
            
            {/* 1. RENDER GHOST PAYMENTS (UNMATCHED BANK LOGS) *//*
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

            {/* 2. RENDER SALES RECORDS *//*
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

            {/* EMPTY STATE *//*
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
}*/












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