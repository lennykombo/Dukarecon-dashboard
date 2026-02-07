import React, { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  TrendingUp, AlertTriangle, Users, Calendar, Search, 
  Wallet, ArrowRight, Download, Banknote, FileText, ChevronRight
} from "lucide-react";

export default function DashboardReports({ businessId }) {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("overview"); // 'overview', 'staff', 'sales', 'expenses', 'debt'
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Raw Data Storage (We fetch lists, then calculate stats from them)
  const [data, setData] = useState({
    payments: [],
    expenses: [],
    accounts: [], // Jobs/Debts
    debtors: [], 
    staff: []
  });

  const [loading, setLoading] = useState(true);

  // --- DATA FETCHING ---
  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);

    try {
      const startObj = new Date(dateRange.start); startObj.setHours(0, 0, 0, 0);
      const endObj = new Date(dateRange.end); endObj.setHours(23, 59, 59, 999);
      
      const startTs = Timestamp.fromDate(startObj);
      const endTs = Timestamp.fromDate(endObj);

      // 1. Payments (Period)
      const payQ = query(collection(db, "payments"), where("businessId", "==", businessId), where("createdAt", ">=", startTs), where("createdAt", "<=", endTs));
      
      // 2. Expenses (Period)
      const expQ = query(collection(db, "expenses"), where("businessId", "==", businessId), where("createdAt", ">=", startTs), where("createdAt", "<=", endTs));
      
      // 3. Jobs/Sales (Period - for Work Billed)
      const accQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("createdAt", ">=", startTs), where("createdAt", "<=", endTs));

      // 4. Debt (LIFETIME - No Date Filter)
      const debtQ = query(collection(db, "accounts"), where("businessId", "==", businessId), where("status", "==", "open"));

      // 5. Staff
      const staffQ = query(collection(db, "users"), where("businessId", "==", businessId));

      const [paySnap, expSnap, accSnap, debtSnap, staffSnap] = await Promise.all([
        getDocs(payQ), getDocs(expQ), getDocs(accQ), getDocs(debtQ), getDocs(staffQ)
      ]);

      setData({
        payments: paySnap.docs.map(d => ({id: d.id, ...d.data()})),
        expenses: expSnap.docs.map(d => ({id: d.id, ...d.data()})),
        accounts: accSnap.docs.map(d => ({id: d.id, ...d.data()})),
        debtors: debtSnap.docs.map(d => ({id: d.id, ...d.data()})),
        staff: staffSnap.docs.map(d => ({id: d.id, ...d.data()}))
      });

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  }, [businessId, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- CALCULATIONS FOR OVERVIEW ---
  const overviewStats = {
    collected: data.payments?.reduce((sum, p) => sum + Number(p.amount||0), 0) || 0,
    expenses: data.expenses?.reduce((sum, e) => sum + Number(e.amount||0), 0) || 0,
    billed: data.accounts?.reduce((sum, a) => sum + Number(a.totalAmount||0), 0) || 0,
    totalDebt: data.debtors?.reduce((sum, d) => sum + (Number(d.totalAmount||0) - Number(d.paidAmount||0)), 0) || 0,
  };
  overviewStats.net = overviewStats.collected - overviewStats.expenses;

  // --- PDF EXPORT LOGIC ---
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`${activeTab.toUpperCase()} REPORT`, 14, 20);
    doc.setFontSize(10);
    doc.text(`${dateRange.start} to ${dateRange.end}`, 14, 28);

    let tableHead = [];
    let tableBody = [];

    if (activeTab === 'staff') {
        tableHead = [['Staff Name', 'Sales Handled', 'Expenses Logged']];
        tableBody = getStaffStats().map(s => [s.name, s.sales.toLocaleString(), s.expenses.toLocaleString()]);
    } else if (activeTab === 'sales') {
        tableHead = [['Date', 'Ref', 'Description', 'Amount', 'Method']];
        tableBody = data.payments.map(p => [
            new Date(p.createdAt.seconds * 1000).toLocaleDateString(),
            p.transactionCode,
            p.description || "Sale",
            p.amount,
            p.paymentMethod
        ]);
    } else if (activeTab === 'debt') {
        tableHead = [['Customer', 'Total Bill', 'Paid', 'Balance Due']];
        tableBody = data.debtors.map(d => [
            d.description || "Unknown", 
            d.totalAmount, 
            d.paidAmount, 
            (d.totalAmount - d.paidAmount)
        ]);
    } else {
        // Overview Summary
        tableHead = [['Metric', 'Value']];
        tableBody = [
            ['Total Collection', overviewStats.collected],
            ['Total Expenses', overviewStats.expenses],
            ['Net Profit', overviewStats.net],
            ['Outstanding Debt', overviewStats.totalDebt]
        ];
    }

    autoTable(doc, {
        startY: 35,
        head: tableHead,
        body: tableBody,
    });
    doc.save(`${activeTab}_report.pdf`);
  };

  // --- HELPER FOR STAFF STATS ---
  // --- HELPER FOR STAFF STATS ---
  const getStaffStats = () => {
    // If staff data hasn't loaded yet, return empty array
    if (!data.staff) return [];

    return data.staff.map(user => {
       const userSales = data.payments
         ?.filter(p => p.attendantName === user.name || p.userName === user.name)
         .reduce((sum, p) => sum + Number(p.amount||0), 0) || 0;

       const userExp = data.expenses
         ?.filter(e => e.userName === user.name)
         .reduce((sum, e) => sum + Number(e.amount||0), 0) || 0;

       return { name: user.name, sales: userSales, expenses: userExp };
    });
  };

  // --- COMPONENT: TABS ---
  const TabButton = ({ id, label, icon: Icon }) => (
    <button 
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
            activeTab === id 
            ? "bg-slate-900 text-white shadow-lg scale-105" 
            : "bg-white text-slate-500 hover:bg-slate-50 border border-transparent"
        }`}
    >
        <Icon size={16} />
        {label}
    </button>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Reports & Analytics</h2>
          <p className="text-slate-500 font-medium">Detailed breakdown of business performance</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
           <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="bg-slate-50 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none" />
           <ArrowRight size={16} className="text-slate-300"/>
           <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="bg-slate-50 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none" />
           <button onClick={fetchData} className="bg-indigo-600 text-white p-2.5 rounded-lg"><Search size={18} /></button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-3 mb-8">
        <TabButton id="overview" label="Overview" icon={TrendingUp} />
        <TabButton id="staff" label="Staff Performance" icon={Users} />
        <TabButton id="sales" label="Sales Log" icon={Wallet} />
        <TabButton id="expenses" label="Expenses Log" icon={Banknote} />
        <TabButton id="debt" label="Debtors List" icon={AlertTriangle} />
        
        <button onClick={handleExportPDF} className="ml-auto flex items-center gap-2 text-indigo-600 font-bold text-sm px-4 py-3 border border-indigo-100 bg-indigo-50 rounded-xl hover:bg-indigo-100">
            <Download size={16} /> Export PDF
        </button>
      </div>

      {loading ? <div className="p-10 text-center font-bold text-slate-400">Loading Data...</div> : (
        <div className="animate-in fade-in duration-500">
    
    {/* VIEW: OVERVIEW */}
    {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Collected" value={overviewStats.collected} color="bg-indigo-100 text-indigo-700" />
            <StatCard title="Total Expenses" value={overviewStats.expenses} color="bg-orange-100 text-orange-700" />
            <StatCard title="Net Cash Flow" value={overviewStats.net} color={overviewStats.net >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"} />
            <StatCard title="Outstanding Debt" value={overviewStats.totalDebt} color="bg-red-50 text-red-600" />
        </div>
    )}

    {/* VIEW: STAFF REPORT */}
    {activeTab === 'staff' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                        <th className="p-4">Staff Name</th>
                        <th className="p-4 text-right">Sales Handled</th>
                        <th className="p-4 text-right">Expenses Logged</th>
                        <th className="p-4 text-right">Net Contribution</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {getStaffStats().map((s, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-700">{s.name}</td>
                            <td className="p-4 text-right font-medium text-emerald-600">KES {s.sales.toLocaleString()}</td>
                            <td className="p-4 text-right font-medium text-orange-500">KES {s.expenses.toLocaleString()}</td>
                            <td className="p-4 text-right font-black text-slate-800">KES {(s.sales - s.expenses).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )}

    {/* VIEW: SALES LOG (FIXED: Merged Payments & Jobs) */}
    {activeTab === 'sales' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Type</th> {/* Added Type Column */}
                        <th className="p-4">Description</th>
                        <th className="p-4">Method / Status</th>
                        <th className="p-4 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {(() => {
                        // 1. Format Payments (Direct Sales)
                        const directSales = data.payments.map(p => ({
                            id: p.id,
                            date: p.createdAt,
                            type: 'Sale',
                            desc: p.description || "Retail Sale",
                            status: p.paymentMethod,
                            amount: p.amount,
                            isJob: false
                        }));

                        // 2. Format Accounts (Jobs)
                        const jobSales = data.accounts.map(j => ({
                            id: j.id,
                            date: j.createdAt,
                            type: 'Job',
                            desc: j.description || j.jobName || "Service Job",
                            status: j.status === 'open' ? 'Credit/Unpaid' : 'Paid',
                            amount: j.totalAmount, // Showing total billed amount
                            isJob: true
                        }));

                        // 3. Merge and Sort by Date
                        const combined = [...directSales, ...jobSales].sort((a, b) => 
                            (b.date?.seconds || 0) - (a.date?.seconds || 0)
                        );

                        if(combined.length === 0) return <tr><td colSpan="5" className="p-4 text-center">No records found</td></tr>;

                        return combined.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50">
                                <td className="p-4 text-slate-500">
                                    {item.date ? new Date(item.date.seconds * 1000).toLocaleDateString() : '-'}
                                </td>
                                <td className="p-4">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${item.isJob ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                        {item.type}
                                    </span>
                                </td>
                                <td className="p-4 font-bold text-slate-700">{item.desc}</td>
                                <td className="p-4 uppercase text-xs font-bold text-slate-400">{item.status}</td>
                                <td className="p-4 text-right font-bold text-emerald-600">KES {Number(item.amount).toLocaleString()}</td>
                            </tr>
                        ));
                    })()}
                </tbody>
            </table>
        </div>
    )}

    {/* VIEW: EXPENSES LOG (FIXED: Added Missing Block) */}
    {activeTab === 'expenses' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Description</th>
                        <th className="p-4">Logged By</th>
                        <th className="p-4 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {data.expenses.length === 0 ? (
                        <tr><td colSpan="5" className="p-8 text-center text-slate-400">No expenses recorded for this period.</td></tr>
                    ) : (
                        data.expenses.map((e) => (
                            <tr key={e.id} className="hover:bg-slate-50">
                                <td className="p-4 text-slate-500">
                                    {e.createdAt ? new Date(e.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                                </td>
                                <td className="p-4 font-bold text-xs uppercase text-slate-400">{e.category || "General"}</td>
                                <td className="p-4 font-bold text-slate-700">{e.description || "Expense"}</td>
                                <td className="p-4 text-sm text-slate-600">{e.userName || "Admin"}</td>
                                <td className="p-4 text-right font-bold text-orange-600">KES {Number(e.amount).toLocaleString()}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )}

    {/* VIEW: DEBTORS */}
    {activeTab === 'debt' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                        <th className="p-4">Customer / Job</th>
                        <th className="p-4 text-right">Total Bill</th>
                        <th className="p-4 text-right">Paid So Far</th>
                        <th className="p-4 text-right">Balance Due</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {data.debtors.map((d) => {
                        const debt = d.totalAmount - d.paidAmount;
                        return (
                        <tr key={d.id} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-700">{d.description || d.jobName || "Unknown Job"}</td>
                            <td className="p-4 text-right text-slate-500">KES {d.totalAmount.toLocaleString()}</td>
                            <td className="p-4 text-right text-emerald-600">KES {d.paidAmount.toLocaleString()}</td>
                            <td className="p-4 text-right font-black text-red-500">KES {debt.toLocaleString()}</td>
                        </tr>
                    )})}
                </tbody>
            </table>
        </div>
    )}
</div>
      )}
    </div>
  );
}

// Simple Stat Card Component
const StatCard = ({ title, value, color }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
        <h3 className={`text-3xl font-black ${color.split(' ')[1]}`}>{value ? `KES ${value.toLocaleString()}` : "0"}</h3>
        <div className={`h-1 w-full mt-4 rounded-full opacity-20 ${color.split(' ')[0]}`}></div>
    </div>
);














/*import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { TrendingUp, AlertTriangle, Wallet, Users } from "lucide-react";

export default function Overview({ businessId }) {
  const [stats, setStats] = useState({
    todaySales: 0,
    totalDebt: 0,
    mpesaMatches: 0,
    leakageCount: 0,
  });
  const [loading, setLoading] = useState(true);



  /*useEffect(() => {
  if (!businessId) return;

  const fetchStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch Payments
      const payQ = query(collection(db, "payments"), where("businessId", "==", businessId));
      const paySnap = await getDocs(payQ);
      
      // 2. Fetch M-Pesa Logs
      const logQ = query(collection(db, "mpesa_logs"), where("businessId", "==", businessId));
      const logSnap = await getDocs(logQ);

      // 3. ADD THIS: Fetch Staff (Users in this business with role 'attendant')
      const staffQ = query(
        collection(db, "users"), 
        where("businessId", "==", businessId),
        where("role", "==", "attendant")
      );
      const staffSnap = await getDocs(staffQ);

      let sales = 0;
      let unverified = 0;
      
      paySnap.forEach(doc => {
        const data = doc.data();
        sales += Number(data.amount || 0);
        if (data.paymentMethod === 'mpesa' && data.isVerified === false) unverified++;
      });

      setStats({
        todaySales: sales,
        leakageCount: unverified,
        totalMpesaRecords: logSnap.size,
        staffCount: staffSnap.size // <--- SAVE THE COUNT HERE
      });
    } catch (error) {
      console.error("Overview Query Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  fetchStats();
}, [businessId]);*/ /*

useEffect(() => {
  if (!businessId) return;

  const fetchStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch ALL Payments (Actual Cash/M-Pesa collected)
      const payQ = query(collection(db, "payments"), where("businessId", "==", businessId));
      const paySnap = await getDocs(payQ);
      
      // 2. Fetch ALL Accounts (The Jobs and Credit Sales like your "Kilo" example)
      const accQ = query(collection(db, "accounts"), where("businessId", "==", businessId));
      const accSnap = await getDocs(accQ);

      let totalCollected = 0;
      let totalBilled = 0; // This will include the "Kilo" 500
      let unverifiedMpesa = 0;
      
      // Process Payments
      paySnap.forEach(doc => {
        const data = doc.data();
        totalCollected += Number(data.amount || 0);
        if (data.paymentMethod === 'mpesa' && !data.isVerified) unverifiedMpesa++;
      });

      // Process Accounts (The "Jobs")
      accSnap.forEach(doc => {
        const data = doc.data();
        // Here is where your "Kilo" sale is captured!
        totalBilled += Number(data.totalAmount || 0); 
      });

      setStats({
        todaySales: totalBilled, // Total value of business done
        cashInHand: totalCollected, // Actual money collected
        leakageCount: unverifiedMpesa,
        totalDebt: totalBilled - totalCollected, // 500 - 200 = 300 debt
      });
    } catch (error) {
      console.error("Overview Error:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchStats();
}, [businessId]);

  const StatCard = ({ title, value, icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );

  if (loading && !businessId) return <div className="p-8">Connecting to business...</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Business Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
            title="Total Sales" 
            value={`KES ${stats.todaySales.toLocaleString()}`} 
            icon={<TrendingUp color="white"/>} 
            color="bg-blue-600" 
        />
        <StatCard 
            title="Potential Leakage" 
            value={stats.leakageCount} 
            icon={<AlertTriangle color="white"/>} 
            color="bg-red-500" 
        />
        <StatCard 
            title="M-Pesa Records" 
            value={stats.totalMpesaRecords} 
            icon={<Wallet color="white"/>} 
            color="bg-green-600" 
        />
        <StatCard 
            title="Active Staff" 
            value={stats.staffCount || 0} 
            icon={<Users color="white"/>} 
            color="bg-slate-700" 
        />
      </div>
      
      {loading && <p className="mt-4 text-slate-400">Updating statistics...</p>}
    </div>
  );
}*/

