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
  Briefcase,
  ArrowRightLeft,
  FileText
} from "lucide-react";
import StatementUpload from "../components/StatementUpload";

export default function Reconciliation({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'sales', 'expenses', 'float', 'unmatched'
  
  // Data State
  const [sales, setSales] = useState([]);
  const [jobs, setJobs] = useState([]); // From 'accounts'
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]); 
  
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [stats, setStats] = useState({
    smsMpesa: 0, smsBank: 0, smsExpenses: 0, smsFloat: 0,
    appMpesa: 0, appBank: 0, appCash: 0,
    expCash: 0, expDigital: 0, 
    unmatchedLogs: [],
    unmatchedExpenses: []
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

      // 1. SALES (Payments)
      const salesQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
      
      // 2. JOBS (Accounts)
      const accountsQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      // 3. LOGS (Mpesa Logs)
      const logsQ = query(collection(db, "mpesa_logs"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      // 4. EXPENSES
      const expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));

      const [salesSnap, accountsSnap, logsSnap, expSnap] = await Promise.all([
        getDocs(salesQ), 
        getDocs(accountsQ), 
        getDocs(logsQ), 
        getDocs(expQ)
      ]);

      const salesData = salesSnap.docs.map(doc => ({id: doc.id, ...doc.data(), source: 'payment'}));
      const jobsData = accountsSnap.docs.map(doc => ({id: doc.id, ...doc.data(), source: 'account'}));
      const logsData = logsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      const expData = expSnap.docs.map(doc => ({id: doc.id, ...doc.data(), source: 'expense'}));

      setSales(salesData);
      setJobs(jobsData);
      setLogs(logsData);
      setExpenses(expData);

      // --- CALCULATIONS ---
      
      // A. PROCESS LOGS (The Truth Source)
      /*let smsM = 0, smsB = 0, smsE = 0, smsF = 0;
      
      logsData.forEach(d => {
        const amt = Number(d.amount || 0);
        
        if (d.category === 'income') {
            // Check parser type OR keyword fallback for Bank
            const isBank = d.type === 'bank_transfer_sale' || 
                           d.type === 'bank_transfer' || 
                           (d.sender && /bank|sacco|equity|kcb|co-op|ncba/i.test(d.sender));
            
            if (isBank) smsB += amt;
            else smsM += amt;
        }
        else if (d.category === 'expense' || d.category === 'withdrawal') {
            smsE += amt;
        }
        else if (d.category === 'float_in') {
            smsF += amt;
        }
      });*/
      // A. PROCESS LOGS (The Truth Source)
      let smsM = 0, smsB = 0, smsP = 0, smsE = 0, smsF = 0; // <--- ADD smsP

logsData.forEach(d => {
  const amt = Number(d.amount || 0);

  if (d.category === 'income') {
      // 1. IS IT PAYBILL? (From your updated Parser)
      if (d.type === 'paybill_sale') {
          smsP += amt;
      }
      // 2. IS IT BANK? (Direct transfer)
      else if (d.type === 'bank_transfer_sale' || 
               d.type === 'bank_transfer' || 
               (d.sender && /bank|sacco|equity|kcb|co-op/i.test(d.sender))) {
          smsB += amt;
      } 
      // 3. IS IT NORMAL M-PESA?
      else {
          smsM += amt;
      }
  }
  else if (d.category === 'expense' || d.category === 'withdrawal') {
      smsE += amt;
  }
  else if (d.category === 'float_in') {
      smsF += amt;
  }
});
  

      // B. PROCESS SALES (App Sales)
      let appM = 0, appB = 0, appP = 0, appC = 0; // <--- ADD appP

// Sum Payments
salesData.forEach(d => {
    const amt = Number(d.amount || 0);
    const method = (d.paymentMethod || "").toLowerCase(); // Ensure your App sends 'paybill' or 'till' as method

    if (method === 'cash') {
       appC += amt; 
    }
    // Check for Paybill/Till
    else if (method.includes('paybill') || method.includes('till') || method.includes('buy goods')) {
       appP += amt;
    }
    // Check for Bank
    else if (method.includes('bank') || method.includes('cheque') || method.includes('pesalink')) {
       appB += amt;
    }
    else {
       appM += amt;
    }
});

      // C. PROCESS EXPENSES (App Expenses)
      let expDigital = 0, expC = 0;
      expData.forEach(d => {
        const amt = Number(d.amount || 0);
        const m = (d.paymentMethod || "").toLowerCase();
        
        // Check for ANY digital method
        if (m === 'mpesa' || m === 'paybill' || m === 'till' || m === 'bank') {
            expDigital += amt;
        } else {
            expC += amt; // Cash
        }
      });

      // D. FIND UNMATCHED
      // 1. Missing Sales (Money came in, no sale recorded)
      const unmatchedLogs = logsData.filter(log => {
        if (log.category !== 'income') return false; 
        
        // Check Sales & Jobs
        const matchSale = salesData.some(sale => (sale.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase());
        const matchJob = jobsData.some(job => (job.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase());

        return !matchSale && !matchJob;
      });

      // 2. Missing Expenses (Money left, no expense recorded)
      const unmatchedExpenses = logsData.filter(log => {
         if (log.category !== 'expense' && log.category !== 'withdrawal') return false;
         
         const matchExp = expData.some(e => (e.transactionCode || "").toUpperCase() === (log.transactionCode || "").toUpperCase());
         return !matchExp;
      });

      setStats({
  smsMpesa: smsM, smsBank: smsB, smsPaybill: smsP, // <--- ADDED
  smsExpenses: smsE, smsFloat: smsF,
  appMpesa: appM, appBank: appB, appPaybill: appP, // <--- ADDED
  appCash: appC,
  expCash: expC, expDigital: expDigital,
  unmatchedLogs, unmatchedExpenses
});

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [businessId, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // VARIANCE CALCS
  const mpesaDiff = stats.smsMpesa - stats.appMpesa;
  const bankDiff = stats.smsBank - stats.appBank;
  const expenseDiff = stats.smsExpenses - stats.expDigital; 
  const netCash = stats.appCash - stats.expCash; 

  const paybillDiff = stats.smsPaybill - stats.appPaybill;
  // --- MERGE LISTS FOR TABLE DISPLAY ---
  /*const getDisplayData = () => {
    const combined = [];

    // 1. Sales & Jobs
    if (activeTab === 'all' || activeTab === 'sales') {
        sales.forEach(s => combined.push({ ...s, type: 'sale', date: s.createdAt }));
        jobs.filter(j => j.paidAmount > 0).forEach(j => combined.push({ ...j, type: 'job', amount: j.paidAmount, date: j.createdAt }));
    }

    // 2. Expenses
    if (activeTab === 'all' || activeTab === 'expenses') {
        expenses.forEach(e => combined.push({ ...e, type: 'app_expense', date: e.createdAt }));
    }

    // 3. Float Logs (Only from SMS)
    if (activeTab === 'all' || activeTab === 'float') {
        logs.filter(l => l.category === 'float_in').forEach(l => combined.push({ ...l, type: 'float_log', date: l.createdAt, description: "Float Deposit / B2C" }));
    }

    // 4. Unmatched
    if (activeTab === 'unmatched') {
        stats.unmatchedLogs.forEach(l => combined.push({ ...l, type: 'missing_sale', date: l.createdAt, description: "Unrecorded Sale" }));
        stats.unmatchedExpenses.forEach(l => combined.push({ ...l, type: 'missing_expense', date: l.createdAt, description: "Unrecorded Expense" }));
    }

    return combined.sort((a, b) => b.date.seconds - a.date.seconds);
  };*/

   // --- MERGE LISTS FOR TABLE DISPLAY ---
  const getDisplayData = () => {
    const combined = [];

    // =========================================================
    // 1. PROCESS SALES & JOBS (Money In - App Side)
    // =========================================================
    if (activeTab === 'all' || activeTab === 'sales' || activeTab === 'paybill') {
        
        // --- A. Process Sales (Direct Payments) ---
        sales.forEach(s => {
            const method = (s.paymentMethod || "").toLowerCase();
            const isPaybill = method.includes('paybill') || method.includes('till') || method.includes('buy goods');

            // FILTER: If tab is 'paybill', ONLY show paybill items
            if (activeTab === 'paybill' && !isPaybill) return;

            // FILTER: If tab is 'sales', HIDE paybill items (show only Personal M-Pesa/Bank/Cash)
            if (activeTab === 'sales' && isPaybill) return;

            combined.push({ 
                ...s, 
                type: 'sale', 
                date: s.createdAt 
            });
        });

        // --- B. Process Jobs (Account Deposits) ---
        /*jobs.filter(j => j.paidAmount > 0).forEach(j => {
            const method = (j.paymentMethod || "cash").toLowerCase();
            const isPaybill = method.includes('paybill') || method.includes('till') || method.includes('buy goods');

            // FILTER: If tab is 'paybill', ONLY show paybill items
            if (activeTab === 'paybill' && !isPaybill) return;

            // FILTER: If tab is 'sales', HIDE paybill items
            if (activeTab === 'sales' && isPaybill) return;

            combined.push({ 
                ...j, 
                type: 'job', 
                amount: j.paidAmount, 
                date: j.createdAt 
            });
        });*/
        // --- B. Process Jobs (Account Deposits) ---
// ONLY show jobs if they are NOT already recorded as a payment.
// If your system creates a 'payment' doc for every job, you can comment this entire block out.
jobs.filter(j => j.paidAmount > 0).forEach(j => {
    
    // 1. Check if this job payment already exists in the 'sales' list
    // We check if a sale exists with the same Amount AND roughly the same Time (within 1 min)
    const isDuplicate = sales.some(s => 
        Math.abs(s.amount - j.paidAmount) < 1 && // Amounts match
        Math.abs(s.createdAt.seconds - j.createdAt.seconds) < 60 // Created within 60 seconds of each other
    );

    // If it's a duplicate, SKIP IT.
    if (isDuplicate) return;

    // Standard Filters
    const method = (j.paymentMethod || "cash").toLowerCase();
    const isPaybill = method.includes('paybill') || method.includes('till') || method.includes('buy goods');

    if (activeTab === 'paybill' && !isPaybill) return;
    if (activeTab === 'sales' && isPaybill) return;

    combined.push({ 
        ...j, 
        type: 'job', 
        amount: j.paidAmount, 
        date: j.createdAt 
    });
});
    }

    // =========================================================
    // 2. PROCESS EXPENSES (Money Out - App Side)
    // =========================================================
    if (activeTab === 'all' || activeTab === 'expenses') {
        expenses.forEach(e => {
            combined.push({ 
                ...e, 
                type: 'app_expense', 
                date: e.createdAt 
            });
        });
    }

    // =========================================================
    // 3. PROCESS PAYBILL LOGS (Money In - SMS Side)
    // =========================================================
    // This shows the raw SMS log for paybill so you can compare with App Sales
    /*if (activeTab === 'all' || activeTab === 'paybill') {
        logs.filter(l => l.type === 'paybill_sale').forEach(l => {
            combined.push({ 
                ...l, 
                type: 'paybill_log', 
                date: l.createdAt, 
                description: "Paybill Income (SMS)" 
            });
        });
    }*/
    if (activeTab === 'all' || activeTab === 'paybill') {
        logs.filter(l => l.type === 'paybill_sale').forEach(l => {
            
            const logCode = (l.transactionCode || "").toUpperCase();

            // 1. Check if this log is already shown as a SALE
            const existsInSales = sales.some(s => (s.transactionCode || "").toUpperCase() === logCode);

            // 2. Check if this log is already shown as a JOB
            const existsInJobs = jobs.some(j => (j.transactionCode || "").toUpperCase() === logCode);

            // 🛑 STOP: If we found this transaction in Sales or Jobs, DO NOT add the raw log.
            // The "SALE" row will handle showing it (and will be marked VERIFIED).
            if (existsInSales || existsInJobs) return;

            combined.push({ 
                ...l, 
                type: 'paybill_log', 
                date: l.createdAt, 
                description: "Paybill Income (SMS)" 
            });
        });
    }

    // =========================================================
    // 4. PROCESS FLOAT / SYSTEM LOGS (Internal - SMS Side)
    // =========================================================
    if (activeTab === 'all' || activeTab === 'float') {
        logs.filter(l => l.category === 'float_in').forEach(l => {
            combined.push({ 
                ...l, 
                type: 'float_log', 
                date: l.createdAt, 
                description: "Float Deposit / B2C" 
            });
        });
    }

    // =========================================================
    // 5. PROCESS UNMATCHED (Discrepancies)
    // =========================================================
    if (activeTab === 'unmatched') {
        // Missing Sales (Money received but no App record)
        stats.unmatchedLogs.forEach(l => {
            combined.push({ 
                ...l, 
                type: 'missing_sale', 
                date: l.createdAt, 
                description: "Unrecorded Sale" 
            });
        });

        // Missing Expenses (Money sent but no App record)
        stats.unmatchedExpenses.forEach(l => {
            combined.push({ 
                ...l, 
                type: 'missing_expense', 
                date: l.createdAt, 
                description: "Unrecorded Expense" 
            });
        });
    }

    // =========================================================
    // 6. SORT BY DATE (Newest First)
    // =========================================================
    return combined.sort((a, b) => b.date.seconds - a.date.seconds);
  };

  const displayData = getDisplayData();

  


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase">Reconciling Accounts...</p>
      </div>
    );
  }

  // --- MODAL COMPONENT ---
  const TransactionModal = () => {
    if (!selectedTransaction) return null;

    const { type, category, saleType, receiptText, items } = selectedTransaction;
    
    // 1. Determine Color Scheme
    const isExpense = type.includes('expense');
    const isFloat = type.includes('float');
    const isJob = type === 'job' || saleType === 'job';
    
    let headerColor = 'bg-slate-900';
    if(isExpense) headerColor = 'bg-orange-600';
    if(isFloat) headerColor = 'bg-blue-600';
    if(isJob) headerColor = 'bg-purple-700';

    // 2. Determine Who Recorded It
    const recordedBy = selectedTransaction.attendantName || 
                       selectedTransaction.userName || 
                       selectedTransaction.createdBy || 
                       "System Auto-Sync";

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
          
          {/* HEADER */}
          <div className={`p-6 flex justify-between items-center text-white ${headerColor}`}>
            <div>
              <h3 className="font-bold text-lg">
                  {isExpense ? "Expense Details" : isFloat ? "Float / Transfer" : "Sale Details"}
              </h3>
              <p className="text-xs opacity-80 uppercase tracking-widest mt-1">
                  {selectedTransaction.transactionCode || "NO REF"}
              </p>
            </div>
            <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-black/20 rounded-full hover:bg-black/40"><X size={20} /></button>
          </div>

          {/* BODY */}
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
             
             {/* MAIN CARD */}
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Description / Sender</p>
                 <p className="text-lg font-black text-slate-800">
                    {selectedTransaction.description || selectedTransaction.jobName || selectedTransaction.sender || "N/A"}
                 </p>
                 <div className="mt-3 flex justify-between items-end border-t border-slate-100 pt-2">
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Recorded By</p>
                        <p className="font-bold text-slate-700">{recordedBy}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase text-right">Date</p>
                        <p className="font-bold text-slate-700 text-xs">
                            {selectedTransaction.createdAt?.toDate ? selectedTransaction.createdAt.toDate().toLocaleString() : "N/A"}
                        </p>
                    </div>
                 </div>
             </div>

             {/* ITEMS LIST (If Retail Sale) */}
             {items && items.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Items Sold</h4>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-500 font-bold">
                                <tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Price</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((i, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2">{i.name}</td>
                                        <td className="p-2 text-right">{i.qty}</td>
                                        <td className="p-2 text-right">{i.price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
             )}

             {/* RECEIPT PREVIEW (Restored) */}
             {receiptText && (
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Receipt Preview</h4>
                    <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl font-mono text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed select-text shadow-inner">
                        {receiptText}
                    </div>
                </div>
             )}

             {/* Raw Data (Hidden details for Float/Logs) */}
             {!receiptText && !items && (
                 <div className="bg-blue-50 p-4 rounded-xl text-xs text-blue-800 font-medium">
                    This is a raw transaction log. No app receipt was generated for this entry.
                 </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  const AuditCard = ({ title, icon: Icon, sms, app, diff, color, subtitle }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex-1 min-w-[250px]">
      <div className="flex justify-between mb-4">
        <div className={`p-3 rounded-xl ${color.bg} ${color.text}`}><Icon size={24} /></div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{title}</p>
          <p className={`text-2xl font-black ${diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {diff === 0 ? "BALANCED" : `${diff > 0 ? "MISSING" : "SURPLUS"} ${Math.abs(diff).toLocaleString()}`}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>{subtitle || "SMS Logs"}:</span>
          <span className="text-slate-900 font-bold">{sms.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-slate-500 font-medium">
          <span>App Entries:</span>
          <span className="text-slate-900 font-bold">{app.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen relative">
      <TransactionModal />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Reconciliation</h2>
          <p className="text-slate-400 font-medium">Daily Audit & Cash Flow</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="outline-none text-sm font-bold text-slate-700 bg-transparent" />
        </div>
      </div>

      <StatementUpload businessId={businessId} />

      {/* 1. AUDIT CARDS ROW */}
      <div className="flex flex-wrap gap-4 mb-8 mt-6">
        <AuditCard title="M-Pesa Sales" icon={Smartphone} sms={stats.smsMpesa} app={stats.appMpesa} diff={mpesaDiff} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <AuditCard title="Bank Sales" icon={Landmark} sms={stats.smsBank} app={stats.appBank} diff={bankDiff} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <AuditCard title="Digital Expenses" icon={Truck} sms={stats.smsExpenses} app={stats.expDigital} diff={expenseDiff} color={{ bg: 'bg-orange-100', text: 'text-orange-600' }} />
        <AuditCard title="Paybill / Till" icon={Receipt} sms={stats.smsPaybill} app={stats.appPaybill} diff={paybillDiff} color={{ bg: 'bg-purple-100', text: 'text-purple-600' }} subtitle="Utility SMS" />
        
        {/* FLOAT CARD (New) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-lg flex-1 min-w-[250px]">
           <div className="flex justify-between mb-4">
              <div className="p-3 rounded-xl bg-blue-100 text-blue-600"><ArrowRightLeft size={24} /></div>
              <div className="text-right">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">FLOAT / B2C</p>
                  <p className="text-2xl font-black text-blue-600">{stats.smsFloat.toLocaleString()}</p>
              </div>
           </div>
           <p className="text-xs text-slate-400 text-right">Internal money movement (Not Sales)</p>
        </div>
      </div>

      {/* 2. WARNING BANNER */}
      {(stats.unmatchedLogs.length > 0 || stats.unmatchedExpenses.length > 0) && (
        <div className="mb-6 bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="bg-rose-500 p-2 rounded-full text-white"><AlertCircle size={20} /></div>
             <div>
                <h4 className="font-bold text-rose-900">Discrepancies Found</h4>
                <p className="text-xs text-rose-800">
                    {stats.unmatchedLogs.length} Missing Sales &bull; {stats.unmatchedExpenses.length} Missing Expenses
                </p>
             </div>
          </div>
          <button onClick={() => setActiveTab('unmatched')} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-rose-700">Review Now</button>
        </div>
      )}

      {/* 3. TABS NAVIGATION */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['all', 'sales', 'paybill', 'expenses', 'float', 'unmatched'].map(tab => (
            <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
                {tab}
            </button>
        ))}
      </div>

      {/* 4. DATA TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden min-h-[400px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black border-b border-slate-100">
              <th className="p-5">Type</th>
              <th className="p-5">Reference</th>
              <th className="p-5">Description</th>
              <th className="p-5">Amount</th>
              <th className="p-5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayData.length === 0 ? (
                <tr><td colSpan="5" className="p-10 text-center text-slate-400 font-bold">No records found for this view.</td></tr>
            ) : (
                displayData.map((item, idx) => {

    // ===============================================
    // 1. PREPARE VARIABLES
    // ===============================================
    const itemCode = (item.transactionCode || "").toUpperCase();
    const amount = Number(item.amount || item.paidAmount || 0);

    // ===============================================
    // 2. FIND MATCHING LOG (Crucial Step)
    // ===============================================
    // We do this EARLY so we can use the log data for the badge
    const matchedLog = logs.find(l => 
        (l.transactionCode || "").toUpperCase() === itemCode && 
        Number(l.amount) === amount
    );

    // ===============================================
    // 3. GENERATE SOURCE BADGE
    // ===============================================
    const getSourceBadge = (itm, linkedLog) => {
        // Combine App Text + SMS Log Text (if available)
        const logText = linkedLog ? (linkedLog.sender || "") : "";
        const appText = (itm.sender || itm.description || itm.paymentMethod || "");
        const rawText = (logText + " " + appText).toUpperCase();
        
        const method = (itm.paymentMethod || itm.type || "").toLowerCase();

        // A. Check Specific Banks
        if (rawText.includes("EQUITY")) return { label: "EQUITY BANK", color: "bg-red-100 text-red-700 border-red-200" };
        if (rawText.includes("KCB")) return { label: "KCB BANK", color: "bg-lime-100 text-lime-700 border-lime-200" };
        if (rawText.includes("CO-OP") || rawText.includes("COOP")) return { label: "CO-OP BANK", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
        if (rawText.includes("NCBA") || rawText.includes("FAMILY")) return { label: "FAMILY/NCBA", color: "bg-blue-100 text-blue-700 border-blue-200" };
        if (rawText.includes("SACCO") || rawText.includes("FOSA")) return { label: "SACCO", color: "bg-indigo-100 text-indigo-700 border-indigo-200" };

        // B. Fallbacks
        if (method.includes('cash')) return { label: "CASH", color: "bg-slate-100 text-slate-500 border-slate-200" };
        if (method.includes('paybill') || method.includes('till')) return { label: "PAYBILL", color: "bg-purple-100 text-purple-700 border-purple-200" };
        if (method.includes('bank')) return { label: "BANK TRF", color: "bg-blue-50 text-blue-600 border-blue-100" };
        
        return { label: "M-PESA", color: "bg-green-50 text-green-600 border-green-100" };
    };

    // Call the function passing BOTH item and the log we found
    const source = getSourceBadge(item, matchedLog);

    // ===============================================
    // 4. DETERMINE STATUS
    // ===============================================
    let statusColor = "bg-slate-100 text-slate-500";
    let statusText = "Recorded";

    if (item.type === 'missing_sale' || item.type === 'missing_expense') {
        statusColor = "bg-rose-100 text-rose-600";
        statusText = "MISSING";
    } else if (item.type === 'float_log') {
        statusColor = "bg-blue-100 text-blue-600";
        statusText = "FLOAT";
    } else if (item.paymentMethod === 'cash') {
            statusColor = "bg-emerald-100 text-emerald-600";
            statusText = "CASH";
    } else {
            // Use the matchedLog variable we found in Step 2
            if(matchedLog) { 
                statusColor = "bg-emerald-100 text-emerald-600"; 
                statusText = "VERIFIED"; 
            }
    }

    const recordedBy = item.attendantName || item.userName || item.createdBy || "System";

return (
     <tr key={`${item.id}-${idx}`} onClick={() => setSelectedTransaction(item)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
            
            {/* TYPE COLUMN */}
            <td className="p-5">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                        item.type.includes('expense') ? 'bg-orange-100 text-orange-600' : 
                        item.type.includes('float') ? 'bg-blue-100 text-blue-600' : 
                        'bg-slate-100 text-slate-600'
                    }`}>
                        {item.type.includes('expense') ? <Briefcase size={16} /> : 
                            item.type.includes('float') ? <ArrowRightLeft size={16} /> : 
                            <Receipt size={16} />}
                    </div>
                    <div>
                        <span className="block text-xs font-bold uppercase text-slate-500">{item.type.replace('_', ' ')}</span>
                        <span className="text-[10px] font-semibold text-slate-400">By: {recordedBy}</span>
                    </div>
                </div>
            </td>

            {/* REFERENCE + BADGE COLUMN */}
            <td className="p-5">
                <div className="font-mono text-xs font-bold text-slate-700 mb-1">
                    {item.transactionCode || "---"}
                </div>
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase border ${source.color}`}>
                    {source.label}
                </span>
            </td>

            {/* DESCRIPTION COLUMN */}
            <td className="p-5 text-sm font-bold text-slate-800">
                {item.description || 
                item.customerName || 
                item.clientName || 
                item.jobName || 
                item.sender || 
                (item.items && item.items.length > 0 ? item.items.map(i => i.name).join(", ") : "General Sale")}
            </td>

            {/* AMOUNT COLUMN */}
            <td className={`p-5 font-black text-sm ${
                source.label === 'CASH' ? 'text-slate-500' : 
                item.type.includes('expense') ? 'text-orange-600' : 'text-slate-900'
            }`}>
                KES {amount.toLocaleString()}
            </td>

            {/* STATUS COLUMN */}
            <td className="p-5 text-right">
                <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase ${statusColor}`}>{statusText}</span>
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
          
          {/* HEADER *//*
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

          {/* BODY *//*
          <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-6">
            
            {/* CONTEXT CARD *//*
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

            {/* EXPENSE DETAILS (Only for Expenses) *//*
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

            {/* ITEMS TABLE (Only for Sales) *//*
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

            {/* RECEIPT PREVIEW (Only for Sales if exists) *//*
            {receiptText && (
                <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Official Receipt Preview</h4>
                <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl font-mono text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed select-text">
                    {receiptText}
                </div>
                </div>
            )}
          </div>

          {/* FOOTER *//*
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
      
      {/* --- ADDED: RENDER THE MODAL HERE --- *//*
      <TransactionModal />

      {/* HEADER SECTION *//*
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
        <AuditCard title="Digital Expenses" icon={Truck} sms={stats.smsExpenses} app={stats.expMpesa + stats.expBank} diff={expenseDiff} color={{ bg: 'bg-orange-100', text: 'text-orange-600' }} subtitle="SMS (Paid Out)" />
      </div>

      {/* 2. CASH FLOW ROW *//*
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
              <th className="p-6">Code / Ref</th>
              <th className="p-6">Description</th>
              <th className="p-6">App Amount</th>
              <th className="p-6">SMS Amount</th>
              <th className="p-6">Status</th>
              <th className="p-6 text-center">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            
            {/* A. UNMATCHED LOGS *//*
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

            {/* B. SALES (INCOME) *//*
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

            {/* C. EXPENSES (MONEY OUT) - ADDED CLICK HANDLER *//*
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
*/














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

