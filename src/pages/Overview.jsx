import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { TrendingUp, AlertTriangle, Wallet, Users, Landmark, Clock } from "lucide-react";

export default function Overview({ businessId }) {
  const [stats, setStats] = useState({
    todayCollection: 0,  // <--- NEW: Money collected TODAY
    totalBilled: 0,      // Lifetime billed
    totalCollected: 0,   // Lifetime collected
    totalDebt: 0,        
    leakageCount: 0,     
    staffCount: 0,       
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        // 1. Setup "Today" boundary (12:00 AM today)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Queries
        const payQ = query(collection(db, "payments"), where("businessId", "==", businessId));
        const accQ = query(collection(db, "accounts"), where("businessId", "==", businessId));
        const staffQ = query(collection(db, "users"), where("businessId", "==", businessId), where("role", "==", "attendant"));

        const [paySnap, accSnap, staffSnap] = await Promise.all([
          getDocs(payQ), getDocs(accQ), getDocs(staffQ)
        ]);

        let billed = 0;
        let collected = 0;
        let todayMoney = 0;
        let unverified = 0;
        
        // Process Payments
        paySnap.forEach(doc => {
          const data = doc.data();
          const amount = Number(data.amount || 0);
          collected += amount;

          // Check if this payment happened TODAY
          // We convert the Firestore Timestamp to a JS Date
          if (data.createdAt) {
            const payDate = data.createdAt.toDate();
            if (payDate >= startOfToday) {
              todayMoney += amount;
            }
          }

          if (data.paymentMethod === 'mpesa' && !data.isVerified) unverified++;
        });

        // Process Accounts (The "Kilo" job)
        accSnap.forEach(doc => {
          billed += Number(doc.data().totalAmount || 0);
        });

        setStats({
          todayCollection: todayMoney,
          totalBilled: billed,
          totalCollected: collected,
          totalDebt: billed - collected,
          leakageCount: unverified,
          staffCount: staffSnap.size
        });

      } catch (error) {
        console.error("Overview Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [businessId]);

  const StatCard = ({ title, value, icon, color, subtitle }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
          {subtitle && <p className="text-[10px] mt-1 text-slate-400 font-medium uppercase">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Business Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* NEW CARD: TODAY'S MONEY */}
        <StatCard 
            title="Today's Collection" 
            value={`KES ${stats.todayCollection.toLocaleString()}`} 
            icon={<Clock color="white"/>} 
            color="bg-indigo-600" 
            subtitle="Cash + M-Pesa today"
        />

        <StatCard 
            title="Total Debt (Owed)" 
            value={`KES ${stats.totalDebt.toLocaleString()}`} 
            icon={<AlertTriangle color="white"/>} 
            color="bg-red-500" 
            subtitle="Money outside"
        />

        <StatCard 
            title="Sales (Billed)" 
            value={`KES ${stats.totalBilled.toLocaleString()}`} 
            icon={<TrendingUp color="white"/>} 
            color="bg-blue-600" 
            subtitle="Lifetime work value"
        />

        <StatCard 
            title="Active Staff" 
            value={stats.staffCount} 
            icon={<Users color="white"/>} 
            color="bg-slate-700" 
            subtitle="Attendants on site"
        />
      </div>
      
      {/* (Keep the Leakage Alert and loading states below as before) */}
    </div>
  );
}















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

