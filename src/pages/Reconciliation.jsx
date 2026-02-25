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
  const [usersMap, setUsersMap] = useState({});
  
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deliveries, setDeliveries] = useState([]);

  const [stats, setStats] = useState({
    smsMpesa: 0, smsBank: 0, smsPaybill: 0, smsExpenses: 0, smsFloat: 0, 
    appMpesa: 0, appBank: 0, appPaybill: 0, appCash: 0,
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

      //delivery
       const delQ = query(collection(db, "deliveries"), where("businessId", "==", businessId), where("createdAt", ">=", fireStart), where("createdAt", "<=", fireEnd));
    
    const [salesSnap, accountsSnap, logsSnap, expSnap, delSnap] = await Promise.all([
        getDocs(salesQ), getDocs(accountsQ), getDocs(logsQ), getDocs(expQ), getDocs(delQ)
    ]);

    const delData = delSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    setDeliveries(delData);

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
      let smsM = 0, smsB = 0, smsP = 0, smsE = 0, smsF = 0;

      logsData.forEach(d => {
        const amt = Number(d.amount || 0);
        const code = (d.transactionCode || "").toUpperCase(); // 🟢 Get code for duplicate check

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
            // 🟢 THE FIX: Check if this "Expense" log is just the M-Pesa half of a Bank Deposit
            // We look through all logs to see if this same code exists as an 'income' log
            const isBankDepositDuplicate = logsData.some(other => 
                other.transactionCode === code && 
                other.category === 'income'
            );

            // Only count towards smsE if it is a REAL expense (not a bank sale duplicate)
            if (!isBankDepositDuplicate) {
                smsE += amt;
            }
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
let verifiedExp = 0; // Track specifically verified ones

expData.forEach(d => {
  const amt = Number(d.amount || 0);
  const m = (d.paymentMethod || "").toLowerCase();
  
  if (m === 'mpesa' || m === 'paybill' || m === 'till' || m === 'bank') {
      expDigital += amt;
      // If the app marked it verified (like our new delivery fees), count it
      if (d.isVerified) verifiedExp += amt; 
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

     

      // 1. First, calculate the total of all rider payouts fetched for today
const totalRiderPay = delData.reduce((sum, d) => sum + Number(d.amount || 0), 0);

// 2. Now update the stats
setStats({
  smsMpesa: smsM, 
  smsBank: smsB, 
  smsPaybill: smsP, 
  smsExpenses: smsE, // This is what the SMS says left the phone
  smsFloat: smsF,
  appMpesa: appM, 
  appBank: appB, 
  appPaybill: appP,
  appCash: appC,
  
  // 🟢 THE FIX:
  // We add totalRiderPay to expDigital so that the "App Entries" 
  // match the "SMS Logs" in the Digital Expenses card.
  expDigital: expDigital + totalRiderPay, 
  
  expCash: expC,
  unmatchedLogs, 
  unmatchedExpenses
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
 
  const getDisplayData = () => {
    const combined = [];

    // =========================================================
    // 1. PROCESS SALES & JOBS (Money In - App Side)
    // =========================================================
    if (activeTab === 'all' || activeTab === 'sales' || activeTab === 'paybill') {
        
        // --- A. Process Sales (Payments collection) ---
        sales.forEach(s => {
            // Hide separate delivery record (it's merged into the main row later)
            if (s.subType === 'delivery') return;

            const method = (s.paymentMethod || "").toLowerCase();
            const isPaybill = method.includes('paybill') || method.includes('till');

            if (activeTab === 'paybill' && !isPaybill) return;
            if (activeTab === 'sales' && isPaybill) return;

            combined.push({ 
                ...s, 
                // If it has accountId, it's a Job Payment, otherwise Retail
                type: s.accountId ? 'job' : 'sale', 
                date: s.createdAt 
            });
        });

        // --- B. Process Jobs (Accounts collection) ---
        jobs.filter(j => j.paidAmount > 0).forEach(j => {
            const jobCode = (j.transactionCode || "").toUpperCase();

            // 🟢 DE-DUPLICATION (The logic you pointed out)
            // 1. Check if a payment exists with the same Code
            const hasPaymentByCode = sales.some(s => 
                s.transactionCode && s.transactionCode.toUpperCase() === jobCode
            );

            // 2. Check if a payment exists linked to this Job's ID
            const hasPaymentByID = sales.some(s => s.accountId === j.id);

            // Skip if either is true (prevents double Job rows)
            if ((hasPaymentByCode && jobCode !== "CASH" && jobCode !== "") || hasPaymentByID) {
                return;
            }

            const method = (j.paymentMethod || "cash").toLowerCase();
            const isPaybill = method.includes('paybill') || method.includes('till');

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
    // 2. PROCESS OTHER CATEGORIES (Expenses, Logs, etc.)
    // =========================================================
    if (activeTab === 'all' || activeTab === 'expenses') {
        expenses.forEach(e => combined.push({ ...e, type: 'app_expense', date: e.createdAt }));
    }

    if (activeTab === 'all' || activeTab === 'paybill') {
        logs.filter(l => l.type === 'paybill_sale').forEach(l => {
            const logCode = (l.transactionCode || "").toUpperCase();
            const existsInSales = sales.some(s => (s.transactionCode || "").toUpperCase() === logCode);
            const existsInJobs = jobs.some(j => (j.transactionCode || "").toUpperCase() === logCode);
            if (existsInSales || existsInJobs) return;
            combined.push({ ...l, type: 'paybill_log', date: l.createdAt, description: "Paybill Income (SMS)" });
        });
    }

    if (activeTab === 'all' || activeTab === 'float') {
        logs.filter(l => l.category === 'float_in').forEach(l => {
            combined.push({ ...l, type: 'float_log', date: l.createdAt, description: "Float Deposit / B2C" });
        });
    }

    if (activeTab === 'unmatched') {
        stats.unmatchedLogs.forEach(l => combined.push({ ...l, type: 'missing_sale', date: l.createdAt, description: "Unrecorded Sale" }));
        stats.unmatchedExpenses.forEach(l => combined.push({ ...l, type: 'missing_expense', date: l.createdAt, description: "Unrecorded Expense" }));
    }

    // Sort by Date (Newest First)
    return combined.sort((a, b) => b.date.seconds - a.date.seconds);
};

  const displayData = getDisplayData();

  useEffect(() => {
  const fetchUsers = async () => {
    const snapshot = await getDocs(collection(db, "users"));
    const map = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      map[doc.id] = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim();
    });
    setUsersMap(map);
  };
  fetchUsers();
}, []);

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

  // 1. Get the reference code
  const itemCode = (selectedTransaction.transactionCode || "").toUpperCase();

  // 2. FIND ALL PIECES FOR THIS CODE
  // A. Find the main sale record (the one that has the items array)
  const mainSaleRecord = sales.find(s => s.transactionCode === itemCode && s.subType === 'sale') || selectedTransaction;
  
  // B. Find the delivery income record (the +1 KES)
  const deliveryIncomeRecord = sales.find(s => s.transactionCode === itemCode && s.subType === 'delivery');
  
  // C. Find the rider payout (the -1 KES yellow row)
  const riderPayout = deliveries.find(d => d.transactionCode === itemCode);

  // 3. CALCULATE TOTALS
  // Use items from the mainSaleRecord
  const displayItems = mainSaleRecord.items || [];
  const baseAmount = Number(mainSaleRecord.amount || mainSaleRecord.paidAmount || 0);
  const feeAmount = Number(deliveryIncomeRecord?.amount || 0);
  const totalAmount = baseAmount + feeAmount;

  // Metadata
  const recordedBy = mainSaleRecord.attendantName || mainSaleRecord.userName || "System";
  const timeStr = mainSaleRecord.createdAt?.toDate ? mainSaleRecord.createdAt.toDate().toLocaleTimeString() : "";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* HEADER */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-white">Transaction Details</h3>
            <div className="flex items-center gap-2 mt-1">
               <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded uppercase">
                  {mainSaleRecord.type === 'job' ? 'Job Sale' : 'Retail Sale'}
               </span>
               <span className="text-xs text-slate-400 font-mono tracking-widest">{itemCode}</span>
            </div>
          </div>
          <button onClick={() => setSelectedTransaction(null)} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={20} /></button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-6">
          
          {/* CUSTOMER CARD */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer / Reference</p>
            <p className="text-lg font-black text-slate-800">
              {mainSaleRecord.description || mainSaleRecord.customerName || "Walk-in Customer"}
            </p>
          </div>

          {/* ITEMS SOLD TABLE */}
          <div>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Breakdown</h4>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-widest border-b">
                  <tr>
                    <th className="p-3">Item</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* 🟢 RENDER ITEMS (If it's a Retail sale) */}
                  {displayItems.length > 0 ? (
                    displayItems.map((i, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-800">{i.name}</td>
                        <td className="p-3 text-center text-slate-400">x{i.qty}</td>
                        <td className="p-3 text-right text-slate-500">{i.price}</td>
                        <td className="p-3 text-right font-black text-slate-800">{(i.price * i.qty)}</td>
                      </tr>
                    ))
                  ) : (
                    /* 🟢 RENDER AS JOB (If no items array exists) */
                    <tr>
                      <td className="p-3 font-bold text-slate-800" colSpan="3">{mainSaleRecord.description || "Job Service"}</td>
                      <td className="p-3 text-right font-black text-slate-800">{baseAmount}</td>
                    </tr>
                  )}
                  
                  {/* 🟢 RENDER DELIVERY FEE (Added as a row) */}
                  {feeAmount > 0 && (
                    <tr className="bg-amber-50/30">
                      <td className="p-3 font-bold text-amber-700 italic" colSpan="3">Delivery Fee</td>
                      <td className="p-3 text-right font-black text-amber-700">{feeAmount}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RECEIPT PREVIEW BOX */}
          {mainSaleRecord.receiptText && (
            <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl font-mono text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed shadow-inner">
               {mainSaleRecord.receiptText}
               {feeAmount > 0 && !mainSaleRecord.receiptText.includes('Delivery') && (
                 `\n--------------------------------\nDELIVERY FEE: KES ${feeAmount}\nTOTAL PAID:   KES ${totalAmount}`
               )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-6 bg-white border-t border-slate-100">
          <div className="flex justify-between items-center mb-4">
             <p className="text-sm font-bold text-slate-500">Total SMS Amount</p>
             <p className="text-3xl font-black text-slate-900 tracking-tighter">KES {totalAmount.toLocaleString()}</p>
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
             <p>Recorded by: <span className="text-slate-700">{recordedBy}</span></p>
             <p>{timeStr}</p>
          </div>
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
        <p className={`text-2xl font-black ${diff === 0 ? 'text-rose-500' : diff < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
          {diff === 0 ? "BALANCED" : `${diff > 0 ? "MISSING" : "SURPLUS"} ${(Math.abs(diff) || 0).toLocaleString()}`}
        </p>
      </div>
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-slate-500 font-medium">
        <span>{subtitle || "SMS Logs"}:</span>
        <span className="text-slate-900 font-bold">{(sms || 0).toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-slate-500 font-medium">
        <span>App Entries:</span>
        <span className="text-slate-900 font-bold">{(app || 0).toLocaleString()}</span>
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

      {/*<StatementUpload businessId={businessId} />*/}

      <StatementUpload businessId={businessId} onUploadSuccess={fetchData} />

      {/* 1. AUDIT CARDS ROW */}
      <div className="flex flex-wrap gap-4 mb-8 mt-6">
        <AuditCard title="M-Pesa Sales" icon={Smartphone} sms={stats.smsMpesa} app={stats.appMpesa} diff={mpesaDiff} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <AuditCard title="Bank Sales" icon={Landmark} sms={stats.smsBank} app={stats.appBank} diff={bankDiff} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <AuditCard 
          title="Digital Expenses" 
          icon={Truck} 
          sms={stats.smsExpenses} 
          app={stats.expDigital} 
          diff={expenseDiff} 
          color={{ bg: 'bg-orange-100', text: 'text-orange-600' }} 
          subtitle="SMS Sent Logs" 
         />
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
  ) : ( displayData.map((item, idx) => {

    // ===============================================
    // 1. PREPARE VARIABLES
    // ===============================================
    const itemCode = (item.transactionCode || "").trim().toUpperCase();
    const method = (item.paymentMethod || item.type || "").toLowerCase();
    const isCash = itemCode === "CASH" || itemCode === "" || method.includes('cash');

    // 🟢 NEW SAFETY CHECK: Identify if this row is money coming IN or OUT
    // We only want to add delivery fees to Sales/Jobs (Income).
    const isIncomeRow = !item.type.includes('expense') && !item.type.includes('missing_expense');

    // 🟢 2. FIND THE DELIVERY RECORD (Now restricted to Income rows)
    const deliveryIncomeRecord = (isIncomeRow && !isCash && itemCode.length > 3) 
        ? sales.find(s => 
            (s.transactionCode || "").toUpperCase() === `${itemCode}_DEL` && 
            s.subType === 'delivery'
          )
        : null;
    
    const feeAmt = Number(deliveryIncomeRecord?.amount || 0);
    const baseAmt = Number(item.amount || item.paidAmount || 0);

    // 🟢 3. THE COMBINED TOTAL
    // If it's a Sale, total = Price + Fee. 
    // If it's an Expense (Rider Payout), total = just the Expense (don't add fee).
    const totalRowAmount = isIncomeRow ? (baseAmt + feeAmt) : baseAmt; 
    
    const amount = totalRowAmount; 
    const hasSplit = feeAmt > 0 && isIncomeRow;

    // 🟢 4. FIND MATCHING LOG (Strict Category Match)
    const matchedLog = (!isCash && itemCode.length > 4) 
        ? logs.find(l => {
            const logCode = (l.transactionCode || "").toUpperCase();
            const logAmount = Number(l.amount || 0);
            
            if (logCode !== itemCode) return false;

            // Amount must match our calculated totalRowAmount
            if (Math.abs(logAmount - totalRowAmount) > 0.01) return false;

            // Match based on category
            return isIncomeRow 
                ? l.category === 'income' 
                : (l.category === 'expense' || l.category === 'withdrawal');
        })
        : null;
    
   /* displayData.map((item, idx) => {

    // ===============================================
    // 1. PREPARE VARIABLES
    // ===============================================
    const itemCode = (item.transactionCode || "").trim().toUpperCase();
    const method = (item.paymentMethod || item.type || "").toLowerCase();
    
    // Check if it's a cash sale
    const isCash = itemCode === "CASH" || itemCode === "" || method.includes('cash');

    // 🟢 2. FIND THE DELIVERY RECORD (The "_DEL" Suffix logic)
    // We look for a record where the code is "ABCD_DEL" to merge with "ABCD"
    const deliveryIncomeRecord = (!isCash && itemCode.length > 3) 
        ? sales.find(s => 
            (s.transactionCode || "").toUpperCase() === `${itemCode}_DEL` && 
            s.subType === 'delivery'
          )
        : null;
    
    // Calculate the two pieces
    const feeAmt = Number(deliveryIncomeRecord?.amount || 0);
    const baseAmt = Number(item.amount || item.paidAmount || 0);

    // 🟢 3. THE COMBINED TOTAL
    // This merges the Sale + Delivery into one number for the row
    const totalRowAmount = baseAmt + feeAmt; 
    
    // Alias 'amount' so the rest of your existing table code works
    const amount = totalRowAmount; 
    const hasSplit = feeAmt > 0 && !isCash;

        // 4. FIND MATCHING LOG (Strict Category Match)
    const matchedLog = (!isCash && itemCode.length > 4) 
        ? logs.find(l => {
            const logCode = (l.transactionCode || "").toUpperCase();
            const logAmount = Number(l.amount || 0);
            
            // A. Reference Code must match
            const codeMatches = logCode === itemCode;

            // B. Amount must match the COMBINED total (Sale + Delivery)
            const amountMatches = Math.abs(logAmount - amount) < 1;

            // 🟢 C. THE FIX: Category Match
            // If the row is a Sale/Job, it MUST match an 'income' log.
            // If the row is an Expense, it MUST match an 'expense' or 'withdrawal' log.
            const isAppExpense = item.type.includes('expense');
            const categoryMatches = isAppExpense 
                ? (l.category === 'expense' || l.category === 'withdrawal')
                : (l.category === 'income');

            return codeMatches && amountMatches && categoryMatches;
        })
        : null;*/
    
          // ===============================================
      // 3. GENERATE SOURCE BADGE
      // ===============================================
          const getSourceBadge = (itm, linkedLog) => {
  // 1. Check for the new Split Transaction subTypes (Priority)
  if (itm.subType === 'sale') {
    return { label: "ITEM SALE", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }
  if (itm.subType === 'delivery') {
    return { label: "DELIVERY FEE", color: "bg-amber-100 text-amber-700 border-amber-200" };
  }

  // 2. Fallback check for older delivery entries
  if (itm.description?.toLowerCase().includes('delivery')) {
    return { label: "DELIVERY", color: "bg-amber-100 text-amber-700 border-amber-200" };
  }

  // 3. Preparation for Bank and Method detection
  const logText = linkedLog ? (linkedLog.sender || "") : "";
  const appText = (itm.sender || itm.description || itm.paymentMethod || "");
  const rawText = (logText + " " + appText).toUpperCase();
  const method = (itm.paymentMethod || itm.type || "").toLowerCase();

  // 4. Detect Specific Banks
  if (rawText.includes("EQUITY")) return { label: "EQUITY BANK", color: "bg-red-100 text-red-700 border-red-200" };
  if (rawText.includes("KCB")) return { label: "KCB BANK", color: "bg-lime-100 text-lime-700 border-lime-200" };
  if (rawText.includes("CO-OP") || rawText.includes("COOP")) return { label: "CO-OP BANK", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };

  // 5. Detect General Payment Methods
  if (method.includes('cash')) return { label: "CASH", color: "bg-slate-100 text-slate-500 border-slate-200" };
  if (method.includes('paybill') || method.includes('till')) return { label: "PAYBILL", color: "bg-purple-100 text-purple-700 border-purple-200" };
  if (method.includes('bank')) return { label: "BANK TRF", color: "bg-blue-50 text-blue-600 border-blue-100" };

  // 6. Default Fallback
  return { label: "M-PESA", color: "bg-green-50 text-green-600 border-green-100" };
};

      const source = getSourceBadge(item, matchedLog);

      // ===============================================
      // 4. DETERMINE STATUS (Fixed Logic)
      // ===============================================
      let statusColor = "bg-orange-100 text-orange-700"; // Default to Warning
      let statusText = "UNVERIFIED";

      // A. Handle Missing / Discrepancies
      if (item.type === 'missing_sale' || item.type === 'missing_expense') {
        statusColor = "bg-rose-100 text-rose-600";
        statusText = "MISSING";
      } 
      // B. Handle Float
      else if (item.type === 'float_log') {
        statusColor = "bg-blue-100 text-blue-600";
        statusText = "FLOAT";
      } 
      // C. Handle Raw Paybill Logs (that were not matched to sales in getDisplayData)
      else if (item.type === 'paybill_log') {
        statusColor = "bg-slate-100 text-slate-500";
        statusText = "NO APP SALE";
      }
      // D. Handle Cash
      else if (method.includes('cash')) {
        statusColor = "bg-slate-100 text-slate-500";
        statusText = "CASH";
      } 
    
     // E. Handle Digital Verification (Fixed for Delivery Fees)
 else {
  // If the App already verified it (Delivery Fee) OR we found a matching SMS log
  if (item.isVerified === true || matchedLog) {
    statusColor = "bg-emerald-100 text-emerald-600";
    statusText = "VERIFIED";
  } else {
    // It is Digital, but NO proof found yet
    statusColor = "bg-orange-100 text-orange-700";
    statusText = "UNVERIFIED";
  }
 }

      const recordedBy = item.attendantName 
                  || item.userName 
                  || item.createdBy 
                  || (item.ownerId && usersMap[item.ownerId]) 
                  || "System";


    
      return (
  <React.Fragment key={`${item.id}-${idx}`}>
    {/* --- 1. MAIN SALE / INCOME ROW --- */}
    <tr 
      onClick={() => setSelectedTransaction(item)} 
      className="hover:bg-slate-50 cursor-pointer transition-colors group"
    >
      {/* TYPE */}
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
            <span className="block text-xs font-bold uppercase text-slate-500">
              {item.type.replace('_', ' ')}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              By: {recordedBy}
            </span>
          </div>
        </div>
      </td>

      {/* REFERENCE & SOURCE */}
      <td className="p-5">
        <div className="flex flex-col">
          <div className="font-mono text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            {itemCode || "---"}
            {(item.subType === 'sale' || item.subType === 'delivery') && (
              <ArrowRightLeft size={10} className="text-slate-400" />
            )}
          </div>
          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase border w-fit ${source.color}`}>
            {source.label}
          </span>
        </div>
      </td>

    
      {/* DESCRIPTION COLUMN */}
<td className="p-5 text-sm font-bold text-slate-800">
  {item.description || item.customerName || item.jobName || "General Sale"}
  
  {/* 🟢 ADDED: Show a small breakdown badge if there was a delivery fee included */}
  {hasSplit && (
    <div className="flex gap-1 mt-1">
       <span className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded border border-slate-200">
         PRICE: {baseAmt}
       </span>
       <span className="text-[8px] bg-amber-50 text-amber-600 px-1 rounded border border-amber-100">
         FEE: {feeAmt}
       </span>
    </div>
  )}
</td>

{/* AMOUNT COLUMN */}
<td className="p-5 font-black text-sm text-slate-900">
  {/* 🟢 Show the combined total (e.g., KES 6) */}
  KES {totalRowAmount.toLocaleString()}
</td>

      {/* STATUS */}
      <td className="p-5 text-right">
        <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase ${statusColor}`}>
          {statusText}
        </span>
      </td>
    </tr>

    {/* --- 2. ATTACHED DELIVERY ROW (The Rider Payout) --- */}
    {/* 🟢 THE FIX: Find delivery once, check if it exists, and use optional chaining */}
    {(item.subType === 'sale' || item.type === 'job') && deliveries.find(d => d.transactionCode === itemCode) && (
      (() => {
        const del = deliveries.find(d => d.transactionCode === itemCode);
        return (
          <tr className="bg-amber-50/40 border-l-4 border-amber-400">
            <td className="p-3 pl-12">
              <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                <Truck size={14} /> Rider Payout
              </div>
            </td>
            <td className="p-3">
               <div className="font-mono text-[10px] font-bold text-slate-400">REF: {itemCode}</div>
            </td>
            <td className="p-3 text-[11px] text-slate-500 italic">
              Verified rider payment linked to this sale
            </td>
            <td className="p-3 text-sm font-black text-amber-700">
               {/* 🟢 Optional chaining added here to prevent crash */}
              - KES {(del?.amount || 0).toLocaleString()}
            </td>
            <td className="p-3 text-right">
              <span className="px-3 py-1 rounded-md text-[9px] font-black uppercase bg-emerald-100 text-emerald-600">
                Verified
              </span>
            </td>
          </tr>
        );
      })()
    )}
  </React.Fragment>
);
    })
  )}
</tbody>
        </table>
      </div>
    </div>
  );
}

