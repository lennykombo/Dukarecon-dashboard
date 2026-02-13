import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  collection,
  writeBatch,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  Search,
  Smartphone,
  Landmark
} from "lucide-react";

export default function POSReconciliationPage({ businessId }) {
  const today = new Date().toISOString().split("T")[0];
  
  // -- STATE --
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  
  // Data States
  const [paymentRecords, setPaymentRecords] = useState([]); // Stores fetched MPESA/Bank logs
  const [fetchingRecords, setFetchingRecords] = useState(false);
  
  // Upload & Reconciliation States
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [unmatchedSales, setUnmatchedSales] = useState([]);

  // -- 1. AUTOMATIC FETCHING OF LOGS (The new feature) --
  useEffect(() => {
    fetchSystemRecords();
  }, [dateFrom, dateTo, businessId]);

  /*const fetchSystemRecords = async () => {
    setFetchingRecords(true);
    try {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);

      // Queries
      const mpesaQuery = query(
        collection(db, "mpesa_logs"),
        where("businessId", "==", businessId),
        where("time", ">=", startDate),
        where("time", "<=", endDate)
      );

      const bankQuery = query(
        collection(db, "bank_logs"),
        where("businessId", "==", businessId),
        where("time", ">=", startDate),
        where("time", "<=", endDate)
      );

      const [mpesaSnap, bankSnap] = await Promise.all([
        getDocs(mpesaQuery),
        getDocs(bankQuery)
      ]);

      // Combine and Format
      const mpesaData = mpesaSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'mpesa', rawTime: d.data().time }));
      const bankData = bankSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'bank', rawTime: d.data().time }));

      const combined = [...mpesaData, ...bankData];

      // Sort by Time Descending (Newest first)
      combined.sort((a, b) => {
        const timeA = a.rawTime?.toDate ? a.rawTime.toDate() : new Date(a.rawTime);
        const timeB = b.rawTime?.toDate ? b.rawTime.toDate() : new Date(b.rawTime);
        return timeB - timeA;
      });

      setPaymentRecords(combined);
    } catch (error) {
      console.error("Error fetching records:", error);
    }
    setFetchingRecords(false);
  };*/

  const fetchSystemRecords = async () => {
    setFetchingRecords(true);
    try {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);

      // --- FIX 1: Update Field Names in Query ---
      const mpesaQuery = query(
        collection(db, "mpesa_logs"),
        where("businessId", "==", businessId),
        where("createdAt", ">=", startDate), // Changed "time" to "createdAt"
        where("createdAt", "<=", endDate)
      );

      const bankQuery = query(
        collection(db, "bank_logs"),
        where("businessId", "==", businessId),
        where("createdAt", ">=", startDate), // Changed "time" to "createdAt" (Assuming bank_logs is the same)
        where("createdAt", "<=", endDate)
      );

      const [mpesaSnap, bankSnap] = await Promise.all([
        getDocs(mpesaQuery),
        getDocs(bankQuery)
      ]);

      // --- FIX 2: Map the correct field from the document ---
      const mpesaData = mpesaSnap.docs.map(d => ({ 
          ...d.data(), 
          id: d.id, 
          type: 'mpesa', 
          rawTime: d.data().createdAt // Changed "time" to "createdAt"
      }));
      
      const bankData = bankSnap.docs.map(d => ({ 
          ...d.data(), 
          id: d.id, 
          type: 'bank', 
          // We use 'createdAt', but keep a fallback to 'time' just in case Bank logs are different
          rawTime: d.data().createdAt || d.data().time 
      }));

      const combined = [...mpesaData, ...bankData];

      // Sort by Time Descending (Newest first)
      combined.sort((a, b) => {
        // Handle Firestore Timestamp vs Date Object vs null
        const timeA = a.rawTime?.toDate ? a.rawTime.toDate() : new Date(a.rawTime || 0);
        const timeB = b.rawTime?.toDate ? b.rawTime.toDate() : new Date(b.rawTime || 0);
        return timeB - timeA;
      });

      setPaymentRecords(combined);
    } catch (error) {
      console.error("Error fetching records:", error);
    }
    setFetchingRecords(false);
  };

  // -- HELPERS --
  const normalizeHeaders = (headers) => headers.map(h => String(h).toLowerCase().replace(/\s/g, ""));
  const findColumn = (headers, keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

  // -- 2. UPLOAD & RECONCILE LOGIC --
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setSummary(null);
    setReconciliation(null);
    setUnmatchedSales([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (rows.length < 2) throw new Error("No data found in file.");

      const headers = normalizeHeaders(rows[0]);
      const amountIdx = findColumn(headers, ["amount", "total", "paid", "price"]);
      const dateIdx = findColumn(headers, ["date", "time", "created"]);
      const receiptIdx = findColumn(headers, ["receipt", "invoice", "ref", "code", "transaction"]);

      if (amountIdx === -1) throw new Error("Could not detect an Amount column.");

      const batch = writeBatch(db);
      let count = 0;
      let total = 0;
      const importedSales = [];

      rows.slice(1).forEach(row => {
        const rawAmount = row[amountIdx];
        const amount = Number(rawAmount);
        if (!amount || isNaN(amount)) return;

        let soldAt = new Date();
        if (dateIdx !== -1 && row[dateIdx]) {
          if (typeof row[dateIdx] === 'number') {
             soldAt = new Date(Math.round((row[dateIdx] - 25569) * 86400 * 1000));
          } else {
             const d = new Date(row[dateIdx]);
             if (!isNaN(d.getTime())) soldAt = d;
          }
        }

        const transactionCode = receiptIdx !== -1 ? row[receiptIdx] : null;

        const ref = doc(collection(db, "pos_sales"));
        batch.set(ref, {
          businessId,
          amount,
          transactionCode,
          soldAt,
          uploadedAt: serverTimestamp(),
          source: "excel"
        });

        count++;
        total += amount;
        importedSales.push({ amount, soldAt, transactionCode });
      });

      await batch.commit();
      setSummary({ count, total });

      // -- RECONCILIATION USING FETCHED RECORDS --
      // We can use the 'paymentRecords' state since we just fetched it for the UI
      // However, to be perfectly safe, we'll filter the state locally
      
      let matchedCount = 0;
      let unmatchedCount = 0;
      const unmatchedList = [];

      importedSales.forEach(sale => {
        const match = paymentRecords.find(log => {
            const logTime = log.rawTime?.toDate ? log.rawTime.toDate() : new Date(log.rawTime);
            
            const amountMatch = Math.abs(log.amount - sale.amount) < 1;
            const dateMatch = logTime.toDateString() === sale.soldAt.toDateString();

            if (sale.transactionCode && log.transactionCode) {
                return String(sale.transactionCode).trim() === String(log.transactionCode).trim();
            }
            return amountMatch && dateMatch;
        });

        if (match) matchedCount++;
        else {
          unmatchedCount++;
          unmatchedList.push(sale);
        }
      });

      setReconciliation({ matched: matchedCount, unmatched: unmatchedCount });
      setUnmatchedSales(unmatchedList);

    } catch (err) {
      console.error(err);
      alert(err.message || "Upload failed.");
    }

    setLoading(false);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">POS Reconciliation</h2>
        <p className="text-slate-500 font-medium">Match POS exports with MPESA & Bank records.</p>
      </div>

      {/* DATE SELECTOR */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-2 rounded-lg">
             <Calendar size={18} />
             <span className="font-bold text-sm">Period</span>
        </div>
        
        <div className="flex items-center gap-2">
            <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-indigo-500"
            />
            <span className="text-slate-400">-</span>
            <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-indigo-500"
            />
        </div>
        
        <button onClick={fetchSystemRecords} className="ml-auto text-indigo-600 text-sm font-bold hover:underline flex items-center gap-1">
            <Search size={16} /> Refresh Data
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: SYSTEM RECORDS (VIEW ONLY) */}
        <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden h-[500px] flex flex-col">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Smartphone size={18} className="text-slate-500"/>
                        System Records 
                        <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                            {paymentRecords.length}
                        </span>
                    </h3>
                    {fetchingRecords && <Loader2 className="animate-spin text-indigo-500" size={18} />}
                </div>
                
                <div className="overflow-y-auto flex-1 p-0">
                    {paymentRecords.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                            <Search size={40} className="mb-2 opacity-20" />
                            <p>No MPESA or Bank logs found for this period.</p>
                        </div>
                    ) : (
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 sticky top-0 text-slate-500 font-semibold shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-3">Source</th>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Code</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paymentRecords.map((log) => {
                                    const time = log.rawTime?.toDate ? log.rawTime.toDate() : new Date(log.rawTime);
                                    return (
                                        <tr key={log.id} className="hover:bg-indigo-50/50 transition">
                                            <td className="px-4 py-3">
                                                {log.type === 'mpesa' ? (
                                                    <span className="flex items-center gap-1 text-emerald-600 font-bold"><Smartphone size={12}/> MPESA</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-blue-600 font-bold"><Landmark size={12}/> BANK</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {time.toLocaleDateString()} <span className="text-slate-400">{time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium text-slate-800">
                                                {Number(log.amount).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 font-mono">
                                                {log.transactionCode || "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: UPLOAD & MATCHING */}
        <div className="space-y-6">
            
            {/* UPLOAD BOX */}
            <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center gap-2 mb-4">
                    <UploadCloud className="text-slate-600" size={20}/>
                    <h3 className="font-bold text-slate-800">Upload POS File</h3>
                </div>

                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-indigo-400 transition bg-slate-50/50 group">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-indigo-600" size={32} />
                            <p className="text-sm text-indigo-600 font-medium">Reconciling...</p>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition">
                                <FileSpreadsheet className="text-indigo-600" size={24} />
                            </div>
                            <p className="font-bold text-slate-700 text-sm">Click to upload Excel / CSV</p>
                        </>
                    )}
                    <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleUpload} disabled={loading} />
                </label>
                {fileName && !loading && <p className="mt-3 text-xs text-center text-slate-500">Selected: <strong>{fileName}</strong></p>}
            </div>

            {/* RESULTS BOX */}
            {reconciliation && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <CheckCircle2 className="text-emerald-500" size={20}/> Match Results
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-emerald-50 p-4 rounded-xl text-center border border-emerald-100">
                            <div className="text-2xl font-black text-emerald-600">{reconciliation.matched}</div>
                            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Matched</div>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100">
                            <div className="text-2xl font-black text-red-600">{reconciliation.unmatched}</div>
                            <div className="text-xs font-bold text-red-800 uppercase tracking-wide">Unmatched</div>
                        </div>
                    </div>

                    {unmatchedSales.length > 0 && (
                        <div className="mt-4">
                            <div className="flex items-center gap-2 text-red-600 mb-2">
                                <AlertCircle size={16} />
                                <span className="text-sm font-bold">Unmatched POS Items</span>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="p-2 text-left">Date</th>
                                            <th className="p-2 text-right">Amt</th>
                                            <th className="p-2 text-left">Ref</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {unmatchedSales.map((s, i) => (
                                            <tr key={i}>
                                                <td className="p-2">{s.soldAt.toLocaleDateString()}</td>
                                                <td className="p-2 text-right font-medium">{s.amount}</td>
                                                <td className="p-2 text-slate-400">{s.transactionCode || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}














/*import React, { useState } from "react";
import * as XLSX from "xlsx";
import { collection, writeBatch, doc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { FileSpreadsheet, UploadCloud, CheckCircle2, Loader2 } from "lucide-react";

export default function POSReconciliationPage({ businessId }) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);
  const [discrepancies, setDiscrepancies] = useState([]);

  const normalizeHeaders = (headers) => headers.map(h => h.toLowerCase().replace(/\s/g, ""));
  const findColumn = (headers, keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setSummary(null);
    setDiscrepancies([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) throw new Error("No data found in file.");

      const headers = normalizeHeaders(rows[0]);
      const amountIdx = findColumn(headers, ["amount","total","paid"]);
      const dateIdx = findColumn(headers, ["date","time"]);
      const methodIdx = findColumn(headers, ["method","payment"]);
      const receiptIdx = findColumn(headers, ["receipt","invoice","ref","code"]);

      if (amountIdx === -1) throw new Error("Could not detect an Amount column.");

      const batch = writeBatch(db);
      let count = 0;
      let total = 0;

      const posSales = [];

      rows.slice(1).forEach(row => {
        const rawAmount = row[amountIdx];
        const amount = Number(rawAmount);
        if (!amount) return;

        let soldAt = new Date();
        if (dateIdx !== -1 && row[dateIdx]) {
          const d = new Date(row[dateIdx]);
          if (!isNaN(d)) soldAt = d;
        }

        const transactionCode = row[receiptIdx] || null;

        const ref = doc(collection(db, "pos_sales"));
        batch.set(ref, {
          businessId,
          amount,
          paymentMethod: row[methodIdx] || "unknown",
          transactionCode,
          soldAt,
          uploadedAt: serverTimestamp(),
          source: "excel"
        });

        count++;
        total += amount;
        posSales.push({ transactionCode, amount, soldAt, paymentMethod: row[methodIdx] });
      });

      await batch.commit();
      setSummary({ count, total });

      // ----------------------------
      // RECONCILIATION LOGIC
      // ----------------------------
      const logsQuery = query(
        collection(db, "mpesa_logs"),
        where("businessId", "==", businessId)
      );
      const logsSnapshot = await getDocs(logsQuery);
      const mpesaLogs = logsSnapshot.docs.map(doc => doc.data());

      // Compare POS with MPESA logs
      const unmatched = posSales.filter(sale => {
        return !mpesaLogs.some(log =>
          (log.transactionCode || "").toUpperCase() === (sale.transactionCode || "").toUpperCase() &&
          Number(log.amount) === Number(sale.amount)
        );
      });

      if (unmatched.length) {
        setDiscrepancies(unmatched);
      }

    } catch (err) {
      console.error(err);
      alert(err.message || "Upload failed. Check file format.");
    }

    setLoading(false);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* HEADER *//*
      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
          POS Sales Upload & Reconciliation
        </h2>
        <p className="text-slate-500 font-medium">
          Upload sales exported from your POS to automatically match payments.
        </p>
      </div>

      {/* UPLOAD CARD *//*
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UploadCloud className="text-slate-600" size={20}/>
          <h3 className="font-bold text-slate-800">Upload POS File</h3>
        </div>
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-indigo-400 transition">
          {loading ? <Loader2 className="animate-spin text-indigo-600" size={32}/> : (
            <>
              <p className="font-bold text-slate-700">Click to upload Excel / CSV</p>
              <p className="text-xs text-slate-400 mt-1">Supports most POS exports</p>
            </>
          )}
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleUpload} />
        </label>
        {fileName && <p className="mt-3">Uploaded: <strong>{fileName}</strong></p>}
      </div>

      {/* SUMMARY *//*
      {summary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4 mb-6">
          <CheckCircle2 className="text-emerald-600" size={28}/>
          <div>
            <p className="font-bold text-emerald-800">Import Successful</p>
            <p className="text-sm text-emerald-700">
              {summary.count} sales imported • Total KES {summary.total.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* DISCREPANCIES *//*
      {discrepancies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h3 className="font-bold text-red-700 mb-2">Unmatched POS Sales</h3>
          <ul className="text-sm text-red-600 list-disc pl-5 max-h-64 overflow-y-auto">
            {discrepancies.map((d, i) => (
              <li key={i}>
                {d.transactionCode || "No Ref"} • KES {d.amount.toLocaleString()} • {d.paymentMethod}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}












/*import React, { useState } from "react";
import * as XLSX from "xlsx";
import { collection, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { FileSpreadsheet, UploadCloud, CheckCircle2, Loader2 } from "lucide-react";

export default function POSReconciliationPage({ businessId }) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);

  // Normalize header strings for easier matching
  const normalizeHeaders = (headers) => headers.map(h => h.toLowerCase().replace(/\s/g, ""));

  // Find column index by keywords
  const findColumn = (headers, keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setSummary(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) throw new Error("No data found in file.");

      const headers = normalizeHeaders(rows[0]);

      const amountIdx = findColumn(headers, ["amount","total","paid"]);
      const dateIdx = findColumn(headers, ["date","time"]);
      const methodIdx = findColumn(headers, ["method","payment"]);
      const receiptIdx = findColumn(headers, ["receipt","invoice","ref","code"]);

      if (amountIdx === -1) throw new Error("Could not detect an Amount column.");

      const batch = writeBatch(db);
      let count = 0;
      let total = 0;

      rows.slice(1).forEach(row => {
        const rawAmount = row[amountIdx];
        const amount = Number(rawAmount);
        if (!amount) return;

        let soldAt = new Date();
        if (dateIdx !== -1 && row[dateIdx]) {
          const d = new Date(row[dateIdx]);
          if (!isNaN(d)) soldAt = d;
        }

        const ref = doc(collection(db, "pos_sales"));
        batch.set(ref, {
          businessId,
          amount,
          paymentMethod: row[methodIdx] || "unknown",
          transactionCode: row[receiptIdx] || null,
          soldAt,
          uploadedAt: serverTimestamp(),
          source: "excel"
        });

        count++;
        total += amount;
      });

      await batch.commit();
      setSummary({ count, total });
    } catch (err) {
      console.error(err);
      alert(err.message || "Upload failed. Check file format.");
    }

    setLoading(false);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">

      {/* HEADER *//*
      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
          POS Sales Upload & Reconciliation
        </h2>
        <p className="text-slate-500 font-medium">
          Upload sales exported from your POS to automatically match payments.
        </p>
      </div>

      {/* INSTRUCTION CARD *//*
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <FileSpreadsheet className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 mb-1">
              How to import your sales
            </h3>
            <ul className="text-sm text-slate-500 space-y-1">
              <li>• Export your sales from your POS system</li>
              <li>• Ensure the file is CSV or Excel (.xls/.xlsx)</li>
              <li>• Upload it below</li>
              <li>• We automatically prepare it for reconciliation</li>
            </ul>
          </div>
        </div>
      </div>

      {/* UPLOAD CARD *//*
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UploadCloud className="text-slate-600" size={20}/>
          <h3 className="font-bold text-slate-800">
            Upload POS File
          </h3>
        </div>

        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-indigo-400 transition">
          {loading ? (
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          ) : (
            <>
              <p className="font-bold text-slate-700">Click to upload Excel / CSV</p>
              <p className="text-xs text-slate-400 mt-1">Supports most POS exports</p>
            </>
          )}
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleUpload} />
        </label>

        {fileName && (
          <p className="mt-3">
            Uploaded: <strong>{fileName}</strong>
          </p>
        )}
      </div>

      {/* SUMMARY / RESULT *//*
      {summary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4">
          <CheckCircle2 className="text-emerald-600" size={28}/>
          <div>
            <p className="font-bold text-emerald-800">Import Successful</p>
            <p className="text-sm text-emerald-700">
              {summary.count} sales imported • Total KES {summary.total.toLocaleString()}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}*/

