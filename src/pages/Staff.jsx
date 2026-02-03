import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Users, User, ChevronRight, ArrowLeft, Calendar, 
  Banknote, Smartphone, CreditCard, TrendingUp, 
  UserPlus, CheckCircle, ArrowRight, Clock, AlertCircle
} from "lucide-react";

export default function Staff({ businessId }) {
  // --- STATE MANAGEMENT ---
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  
  // Drill-down states
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [mergedTransactions, setMergedTransactions] = useState([]); // Holds Sales + Debts
  const [loadingSales, setLoadingSales] = useState(false);

  // Date Range State
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // ==================================================================================
  // 1. FETCH STAFF LIST (Runs once on load)
  // ==================================================================================
  useEffect(() => {
    if (!businessId) return;

    const fetchStaff = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"), 
          where("businessId", "==", businessId),
          where("role", "==", "attendant")
        );
        const snap = await getDocs(q);
        setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching staff:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, [businessId]);

  // ==================================================================================
  // 2. FETCH PERFORMANCE DATA (Sales + Debts)
  // ==================================================================================
  useEffect(() => {
    if (!selectedStaff || !businessId) return;

    const fetchStaffData = async () => {
      setLoadingSales(true);
      
      // Calculate Time Range (Start 00:00:00 -> End 23:59:59)
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0);

      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      
      const fireStart = Timestamp.fromDate(start);
      const fireEnd = Timestamp.fromDate(end);

      try {
        // QUERY A: PAYMENTS (Money Received)
        const payQ = query(
          collection(db, "payments"),
          where("businessId", "==", businessId),
          where("createdBy", "==", selectedStaff.id),
          where("createdAt", ">=", fireStart),
          where("createdAt", "<=", fireEnd)
        );

        // QUERY B: ACCOUNTS (Debts / Credit Given)
        const debtQ = query(
          collection(db, "accounts"),
          where("businessId", "==", businessId),
          where("createdBy", "==", selectedStaff.id),
          where("createdAt", ">=", fireStart),
          where("createdAt", "<=", fireEnd)
        );

        const [paySnap, debtSnap] = await Promise.all([getDocs(payQ), getDocs(debtQ)]);

        // Process Payments (Real Money)
        const payments = paySnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          type: 'payment',
          displayAmount: Number(doc.data().amount || 0)
        }));

        // Process Debts (Credit Given)
        const debts = debtSnap.docs.map(doc => {
            const data = doc.data();
            const total = Number(data.totalAmount || 0);
            const paid = Number(data.paidAmount || 0);
            const balance = total - paid;
            
            return {
                id: doc.id,
                ...data,
                type: 'credit',
                paymentMethod: 'credit',
                displayAmount: balance, // Amount still owed
                fullTotal: total,
                paidSoFar: paid
            };
        }).filter(item => item.displayAmount > 0); // Only show if they actually owe money

        // Merge and Sort by Date (Newest First)
        const combined = [...payments, ...debts].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        
        setMergedTransactions(combined);

      } catch (error) {
        console.error("Error fetching report:", error);
      } finally {
        setLoadingSales(false);
      }
    };

    fetchStaffData();
  }, [selectedStaff, startDate, endDate, businessId]);

  // ==================================================================================
  // 3. HELPER FUNCTIONS & CALCULATIONS
  // ==================================================================================
  
  const handleAddStaff = async (e) => {
    e.preventDefault();
    alert("Note: On the Spark plan, please ask the attendant to Sign Up on the mobile app using this email. They will be auto-linked via Business ID: " + businessId);
    setNewEmail("");
  };

  // Calculate Totals based on Merged Data
  const stats = mergedTransactions.reduce((acc, item) => {
    const amt = item.displayAmount;

    if (item.type === 'credit') {
        // This is money NOT received yet (Debt)
        acc.credit += amt;
    } else {
        // This is money RECEIVED (Payment)
        acc.totalReceived += amt;
        
        const method = (item.paymentMethod || "").toLowerCase();
        
        if (method.includes('cash')) {
            acc.cash += amt;
        } 
        else if (method.includes('mpesa') || method.includes('paybill') || method.includes('till')) {
            acc.mpesa += amt;
        } 
        else {
            acc.bank += amt; // Cards, Cheques, Bank Transfers
        }
    }
    return acc;
  }, { totalReceived: 0, cash: 0, mpesa: 0, bank: 0, credit: 0 });


  // ==================================================================================
  // VIEW 1: STAFF LIST (If no staff selected)
  // ==================================================================================
  if (!selectedStaff) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Staff Management</h2>
          <div className="bg-blue-100 px-4 py-2 rounded-xl border border-blue-200 shadow-sm flex items-center gap-2">
            <span className="text-blue-800 font-bold font-mono text-sm">Shop ID: {businessId}</span>
            <CheckCircle size={16} className="text-blue-600" />
          </div>
        </div>

        {/* Invite Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><UserPlus size={20} /></div>
            <h3 className="font-bold text-slate-800">Invite New Attendant</h3>
          </div>
          <form onSubmit={handleAddStaff} className="flex flex-col md:flex-row gap-4">
            <input 
              type="email" 
              placeholder="Enter Attendant's Email Address..." 
              className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 transition-colors"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200">
              Send Invite
            </button>
          </form>
        </div>

        {/* Staff Grid */}
        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading staff list...</div>
        ) : staffList.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center shadow-sm border border-dashed border-slate-300">
             <Users size={48} className="mx-auto text-slate-300 mb-4"/>
             <h3 className="text-xl font-bold text-slate-700">No Staff Found</h3>
             <p className="text-slate-400">Add users above or wait for them to join via the App.</p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-black text-slate-700 mb-4 uppercase tracking-widest text-xs">Active Team Members</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffList.map((staff) => (
                <div 
                  key={staff.id} 
                  onClick={() => setSelectedStaff(staff)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4">
                     <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Active
                     </span>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 leading-tight">{staff.name || "Unknown"}</h3>
                      <p className="text-xs text-slate-400 font-medium">Attendant</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 font-medium mb-4">{staff.email}</p>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-600">View Sales Report</span>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================================================================================
  // VIEW 2: INDIVIDUAL STAFF REPORT (If staff selected)
  // ==================================================================================
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      
      {/* 1. Header with Back Button & Date Picker */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-4">
        <div>
          <button 
            onClick={() => { setSelectedStaff(null); setMergedTransactions([]); }}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 mb-4 transition-colors"
          >
            <ArrowLeft size={18} /> Back to Staff List
          </button>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <span className="bg-blue-600 text-white p-2 rounded-lg"><User size={24} /></span>
            {selectedStaff.name}'s Report
          </h2>
        </div>

        {/* Date Range Picker */}
        <div className="flex flex-col sm:flex-row items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">From</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="outline-none text-sm font-bold text-slate-700 bg-transparent cursor-pointer"
            />
          </div>

          <ArrowRight size={14} className="text-slate-300 hidden sm:block" />

          <div className="flex items-center gap-2 px-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">To</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="outline-none text-sm font-bold text-slate-700 bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 2. Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        
        {/* TOTAL COLLECTED */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingUp size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Money Collected</span></div>
          <p className="text-2xl font-black">KES {stats.totalReceived.toLocaleString()}</p>
        </div>

        {/* CASH */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-600"><Banknote size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Cash</span></div>
          <p className="text-xl font-black text-slate-800">{stats.cash.toLocaleString()}</p>
        </div>

        {/* MPESA / PAYBILL */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-500"><Smartphone size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Digital / M-Pesa</span></div>
          <p className="text-xl font-black text-slate-800">{stats.mpesa.toLocaleString()}</p>
        </div>
        
        {/* BANK */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-indigo-500"><CreditCard size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Bank</span></div>
          <p className="text-xl font-black text-slate-800">{stats.bank.toLocaleString()}</p>
        </div>

        {/* CREDIT GIVEN (DEBT) */}
        <div className="bg-orange-50 p-5 rounded-2xl border border-orange-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-orange-600"><Clock size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Credit Given</span></div>
          <p className="text-xl font-black text-orange-600">KES {stats.credit.toLocaleString()}</p>
          <p className="text-[10px] text-orange-400 font-bold mt-1">Unpaid Value</p>
        </div>

      </div>

      {/* 3. Transaction Table */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Detailed Transaction Log</h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
          </span>
        </div>
        
        <table className="w-full text-left">
          <thead className="bg-white text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
            <tr>
              <th className="p-6">Date & Time</th>
              <th className="p-6">Description</th>
              <th className="p-6">Type / Method</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loadingSales ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-medium">Loading transactions...</td></tr>
            ) : mergedTransactions.length === 0 ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 italic">No records found for this period.</td></tr>
            ) : (
              mergedTransactions.map((item) => {
                 // Determine Logic based on Type (Credit vs Payment)
                 const isCredit = item.type === 'credit';
                 
                 return (
                  <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${isCredit ? 'bg-orange-50/30' : ''}`}>
                    
                    {/* Date Column */}
                    <td className="p-6 text-xs font-bold text-slate-500">
                       <div>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "--"}</div>
                       <div className="text-[10px] opacity-60">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ""}</div>
                    </td>
                    
                    {/* Description Column */}
                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-sm">
                          {item.customerName || item.description || (isCredit ? "Credit Sale (Job)" : "Retail Sale")}
                      </p>
                      {/* If it's a debt, show details about total vs paid */}
                      {isCredit ? (
                          <p className="text-[10px] text-orange-600 font-bold mt-1">
                              Total Job Value: {item.fullTotal?.toLocaleString()} (Paid: {item.paidSoFar?.toLocaleString()})
                          </p>
                      ) : (
                          <p className="text-[10px] text-slate-400 font-mono mt-1">{item.transactionCode || "---"}</p>
                      )}
                    </td>
                    
                    {/* Method Column */}
                    <td className="p-6">
                      {isCredit ? (
                          <span className="text-[10px] font-black px-2 py-1 rounded uppercase bg-orange-100 text-orange-600 border border-orange-200 flex w-fit items-center gap-1">
                              <AlertCircle size={10} /> Credit Owed
                          </span>
                      ) : (
                          <span className={`text-[10px] font-black px-2 py-1 rounded uppercase border ${
                              (item.paymentMethod || '').toLowerCase().includes('mpesa') || (item.paymentMethod || '').toLowerCase().includes('paybill') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              (item.paymentMethod || '').toLowerCase().includes('bank') ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                              {item.paymentMethod || 'CASH'}
                          </span>
                      )}
                    </td>
                    
                    {/* Amount Column */}
                    <td className={`p-6 text-right font-black ${isCredit ? 'text-orange-600' : 'text-slate-800'}`}>
                      KES {item.displayAmount.toLocaleString()}
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
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Users, User, ChevronRight, ArrowLeft, Calendar, 
  Banknote, Smartphone, CreditCard, TrendingUp, 
  UserPlus, CheckCircle
} from "lucide-react";

export default function Staff({ businessId }) {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  
  // Drill-down states
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffSales, setStaffSales] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingSales, setLoadingSales] = useState(false);

  // 1. FETCH STAFF LIST
  useEffect(() => {
    if (!businessId) return;

    const fetchStaff = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"), 
          where("businessId", "==", businessId),
          where("role", "==", "attendant")
        );
        const snap = await getDocs(q);
        setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching staff:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, [businessId]);

  // 2. FETCH SPECIFIC PERFORMANCE
  useEffect(() => {
    if (!selectedStaff || !businessId) return;

    const fetchStaffPerformance = async () => {
      setLoadingSales(true);
      
      // DEBUG: Check IDs
      console.log(`🔎 Fetching sales for Staff: ${selectedStaff.name} (ID: ${selectedStaff.id})`);
      console.log(`📅 Date: ${selectedDate}`);

      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);

      try {
        // Query: Business + User + Date
        const q = query(
          collection(db, "payments"),
          where("businessId", "==", businessId),
          where("createdBy", "==", selectedStaff.id), // <--- Ensure this field exists in your 'payments' documents!
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end))
        );

        const snap = await getDocs(q);
        
        console.log(`✅ Found ${snap.size} records for this staff member.`);

        const sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sales.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setStaffSales(sales);

      } catch (error) {
        console.error("🔥 Firestore Error:", error);
        if (error.message.includes("requires an index")) {
          alert("ACTION REQUIRED: Check your browser console (F12) and click the Firebase Link to enable Staff Sorting.");
        }
      } finally {
        setLoadingSales(false);
      }
    };

    fetchStaffPerformance();
  }, [selectedStaff, selectedDate, businessId]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    alert("Note: On the Spark plan, please ask the attendant to Sign Up on the mobile app using this email. They will be auto-linked via Business ID: " + businessId);
    setNewEmail("");
  };

  // --- CALCULATE TOTALS ---
  const totals = staffSales.reduce((acc, sale) => {
    const amount = Number(sale.amount || 0);
    acc.total += amount;
    const method = (sale.paymentMethod || "").toLowerCase();
    if (method === 'cash') acc.cash += amount;
    else if (method === 'mpesa') acc.mpesa += amount;
    else acc.bank += amount;
    return acc;
  }, { total: 0, cash: 0, mpesa: 0, bank: 0 });

  // VIEW 1: LIST
  if (!selectedStaff) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Staff Management</h2>
          <div className="bg-blue-100 px-4 py-2 rounded-xl border border-blue-200 shadow-sm flex items-center gap-2">
            <span className="text-blue-800 font-bold font-mono text-sm">Shop ID: {businessId}</span>
            <CheckCircle size={16} className="text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><UserPlus size={20} /></div>
            <h3 className="font-bold text-slate-800">Invite New Attendant</h3>
          </div>
          <form onSubmit={handleAddStaff} className="flex flex-col md:flex-row gap-4">
            <input 
              type="email" 
              placeholder="Enter Attendant's Email Address..." 
              className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 transition-colors"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200">
              Send Invite
            </button>
          </form>
        </div>

        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading staff list...</div>
        ) : staffList.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center shadow-sm border border-dashed border-slate-300">
             <Users size={48} className="mx-auto text-slate-300 mb-4"/>
             <h3 className="text-xl font-bold text-slate-700">No Staff Found</h3>
             <p className="text-slate-400">Add users above or wait for them to join via the App.</p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-black text-slate-700 mb-4 uppercase tracking-widest text-xs">Active Team Members</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffList.map((staff) => (
                <div 
                  key={staff.id} 
                  onClick={() => setSelectedStaff(staff)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4">
                     <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Active
                     </span>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 leading-tight">{staff.name || "Unknown"}</h3>
                      <p className="text-xs text-slate-400 font-medium">Attendant</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 font-medium mb-4">{staff.email}</p>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-600">View Sales Report</span>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // VIEW 2: DETAILS
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <button 
            onClick={() => { setSelectedStaff(null); setStaffSales([]); }}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 mb-4 transition-colors"
          >
            <ArrowLeft size={18} /> Back to Staff List
          </button>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <span className="bg-blue-600 text-white p-2 rounded-lg"><User size={24} /></span>
            {selectedStaff.name}'s Report
          </h2>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="outline-none text-sm font-bold text-slate-700 bg-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400"><TrendingUp size={16} /><span className="text-xs font-black uppercase tracking-widest">Total Sales</span></div>
          <p className="text-3xl font-black">KES {totals.total.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-600"><Banknote size={16} /><span className="text-xs font-black uppercase tracking-widest">Cash In Hand</span></div>
          <p className="text-2xl font-black text-slate-800">KES {totals.cash.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-500"><Smartphone size={16} /><span className="text-xs font-black uppercase tracking-widest">M-Pesa</span></div>
          <p className="text-2xl font-black text-slate-800">KES {totals.mpesa.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-indigo-500"><CreditCard size={16} /><span className="text-xs font-black uppercase tracking-widest">Bank</span></div>
          <p className="text-2xl font-black text-slate-800">KES {totals.bank.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-700">Detailed Transaction Log</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-white text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
            <tr>
              <th className="p-6">Time</th>
              <th className="p-6">Description</th>
              <th className="p-6">Method</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loadingSales ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-medium">Loading transactions...</td></tr>
            ) : staffSales.length === 0 ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 italic">No sales found for {selectedStaff.name} on this date.</td></tr>
            ) : (
              staffSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-6 text-xs font-bold text-slate-500">
                    {sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "--"}
                  </td>
                  <td className="p-6">
                    <p className="font-bold text-slate-800 text-sm">{sale.description || "Retail Sale"}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{sale.transactionCode || "---"}</p>
                  </td>
                  <td className="p-6">
                    <span className={`text-[10px] font-black px-2 py-1 rounded uppercase border ${
                      (sale.paymentMethod || 'cash') === 'cash' ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                      (sale.paymentMethod || '').toLowerCase() === 'mpesa' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      'bg-indigo-50 text-indigo-600 border-indigo-100'
                    }`}>
                      {sale.paymentMethod || 'CASH'}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-slate-800">
                    KES {Number(sale.amount).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
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
  Users, 
  User, 
  ChevronRight, 
  ArrowLeft, 
  Calendar, 
  Banknote, 
  Smartphone, 
  CreditCard,
  TrendingUp,
  UserPlus,
  CheckCircle
} from "lucide-react";

export default function Staff({ businessId }) {
  // --- STATES ---
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  
  // Drill-down states
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffSales, setStaffSales] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingSales, setLoadingSales] = useState(false);

  // 1. FETCH STAFF LIST
  useEffect(() => {
    if (!businessId) return;

    const fetchStaff = async () => {
      setLoading(true);
      try {
        // Query users with role='attendant' and matching businessId
        const q = query(
          collection(db, "users"), 
          where("businessId", "==", businessId),
          where("role", "==", "attendant")
        );
        const snap = await getDocs(q);
        setStaffList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching staff:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, [businessId]);

  // 2. FETCH SPECIFIC PERFORMANCE (When a card is clicked)
  useEffect(() => {
    if (!selectedStaff || !businessId) return;

    const fetchStaffPerformance = async () => {
      setLoadingSales(true);
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);

      try {
        const q = query(
          collection(db, "payments"),
          where("businessId", "==", businessId),
          where("userId", "==", selectedStaff.id), 
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end))
        );

        const snap = await getDocs(q);
        const sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sales.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setStaffSales(sales);
      } catch (error) {
        console.error("Error details:", error);
      } finally {
        setLoadingSales(false);
      }
    };

    fetchStaffPerformance();
  }, [selectedStaff, selectedDate, businessId]);

  // 3. HANDLE ADD STAFF (From your old code)
  const handleAddStaff = async (e) => {
    e.preventDefault();
    alert("Note: On the Spark plan, please ask the attendant to Sign Up on the mobile app using this email. They will be auto-linked via Business ID: " + businessId);
    setNewEmail("");
  };

  // --- CALCULATE TOTALS FOR DETAIL VIEW ---
  const totals = staffSales.reduce((acc, sale) => {
    const amount = Number(sale.amount || 0);
    acc.total += amount;
    const method = (sale.paymentMethod || "").toLowerCase();
    if (method === 'cash') acc.cash += amount;
    else if (method === 'mpesa') acc.mpesa += amount;
    else acc.bank += amount;
    return acc;
  }, { total: 0, cash: 0, mpesa: 0, bank: 0 });

  // ==========================================
  // VIEW 1: MASTER LIST + ADD STAFF FORM
  // ==========================================
  if (!selectedStaff) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Staff Management</h2>
          <div className="bg-blue-100 px-4 py-2 rounded-xl border border-blue-200 shadow-sm flex items-center gap-2">
            <span className="text-blue-800 font-bold font-mono text-sm">Shop ID: {businessId}</span>
            <CheckCircle size={16} className="text-blue-600" />
          </div>
        </div>

       
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><UserPlus size={20} /></div>
            <h3 className="font-bold text-slate-800">Invite New Attendant</h3>
          </div>
          <form onSubmit={handleAddStaff} className="flex flex-col md:flex-row gap-4">
            <input 
              type="email" 
              placeholder="Enter Attendant's Email Address..." 
              className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 transition-colors"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200">
              Send Invite
            </button>
          </form>
        </div>

       
        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-400 font-bold">Loading staff list...</div>
        ) : staffList.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center shadow-sm border border-dashed border-slate-300">
             <Users size={48} className="mx-auto text-slate-300 mb-4"/>
             <h3 className="text-xl font-bold text-slate-700">No Staff Found</h3>
             <p className="text-slate-400">Add users above or wait for them to join via the App.</p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-black text-slate-700 mb-4 uppercase tracking-widest text-xs">Active Team Members</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffList.map((staff) => (
                <div 
                  key={staff.id} 
                  onClick={() => setSelectedStaff(staff)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4">
                     <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full flex items-center gap-1">
                       <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Active
                     </span>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 leading-tight">{staff.name || "Unknown"}</h3>
                      <p className="text-xs text-slate-400 font-medium">Attendant</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-slate-500 font-medium mb-4">{staff.email}</p>
                  
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-600">View Sales Report</span>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 2: INDIVIDUAL STAFF DETAIL (PERFORMANCE)
  // ==========================================
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      
     
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <button 
            onClick={() => { setSelectedStaff(null); setStaffSales([]); }}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 mb-4 transition-colors"
          >
            <ArrowLeft size={18} /> Back to Staff List
          </button>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <span className="bg-blue-600 text-white p-2 rounded-lg"><User size={24} /></span>
            {selectedStaff.name}'s Report
          </h2>
        </div>

     
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="outline-none text-sm font-bold text-slate-700 bg-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <TrendingUp size={16} />
            <span className="text-xs font-black uppercase tracking-widest">Total Sales</span>
          </div>
          <p className="text-3xl font-black">KES {totals.total.toLocaleString()}</p>
        </div>

   
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-600">
            <Banknote size={16} />
            <span className="text-xs font-black uppercase tracking-widest">Cash In Hand</span>
          </div>
          <p className="text-2xl font-black text-slate-800">KES {totals.cash.toLocaleString()}</p>
        </div>

        
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-500">
            <Smartphone size={16} />
            <span className="text-xs font-black uppercase tracking-widest">M-Pesa</span>
          </div>
          <p className="text-2xl font-black text-slate-800">KES {totals.mpesa.toLocaleString()}</p>
        </div>

       
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-indigo-500">
            <CreditCard size={16} />
            <span className="text-xs font-black uppercase tracking-widest">Bank</span>
          </div>
          <p className="text-2xl font-black text-slate-800">KES {totals.bank.toLocaleString()}</p>
        </div>
      </div>

     
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-700">Detailed Transaction Log</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-white text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-slate-100">
            <tr>
              <th className="p-6">Time</th>
              <th className="p-6">Description</th>
              <th className="p-6">Method</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loadingSales ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-medium">Loading transactions...</td></tr>
            ) : staffSales.length === 0 ? (
              <tr><td colSpan="4" className="p-10 text-center text-slate-400 italic">No sales found for {selectedStaff.name} on this date.</td></tr>
            ) : (
              staffSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-6 text-xs font-bold text-slate-500">
                    {sale.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </td>
                  <td className="p-6">
                    <p className="font-bold text-slate-800 text-sm">{sale.description || "Retail Sale"}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{sale.transactionCode || "---"}</p>
                  </td>
                  <td className="p-6">
                    <span className={`text-[10px] font-black px-2 py-1 rounded uppercase border ${
                      sale.paymentMethod === 'cash' ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                      sale.paymentMethod === 'mpesa' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      'bg-indigo-50 text-indigo-600 border-indigo-100'
                    }`}>
                      {sale.paymentMethod}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-slate-800">
                    KES {Number(sale.amount).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}*/



