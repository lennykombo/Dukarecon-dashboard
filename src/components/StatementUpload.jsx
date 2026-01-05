import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Upload, CheckCircle, Loader2 } from 'lucide-react';

export default function StatementUpload({ businessId }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Convert Excel to JSON
        const data = XLSX.utils.sheet_to_json(ws);
        
        // Safaricom Statement Column Mapping (Usually 'Receipt No.' and 'Paid In')
        await processStatement(data);
      } catch (error) {
        alert("Error reading file: " + error.message);
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  /*const processStatement = async (rows) => {
    const batch = writeBatch(db); // Spark plan allows 500 operations per batch
    let matchedCount = 0;

    try {
      for (const row of rows) {
        // Safaricom Headers: 'Receipt No.' is the Code, 'Paid In' is the Amount
        const code = row['Receipt No.'] || row['Transaction ID'];
        const amount = parseFloat(row['Paid In'] || row['Amount'] || 0);

        if (code && amount > 0) {
          // 1. Search for an unmatched sale in the App with this code
          const q = query(
            collection(db, "payments"),
            where("businessId", "==", businessId),
            where("transactionCode", "==", code.toUpperCase()),
            where("isVerified", "==", false)
          );

          const snap = await getDocs(q);

          if (!snap.empty) {
            // 2. We found a match! Mark it as verified in the batch
            snap.forEach((paymentDoc) => {
              const ref = doc(db, "payments", paymentDoc.id);
              batch.update(ref, { 
                isVerified: true, 
                verifiedVia: "statement_upload",
                actualAmount: amount 
              });
              matchedCount++;
            });
          }

          // 3. Also add to mpesa_logs if it doesn't exist
          // (This ensures the owner sees the "Truth" even if the attendant missed it)
          const logRef = doc(collection(db, "mpesa_logs"), code);
          batch.set(logRef, {
            transactionCode: code,
            amount: amount,
            businessId: businessId,
            status: "verified_via_statement",
            timestamp: new Date().toISOString()
          }, { merge: true });
        }
      }

      await batch.commit();
      setResults({ matched: matchedCount, totalProcessed: rows.length });
    } catch (error) {
      console.error(error);
      alert("Error syncing data");
    } finally {
      setLoading(false);
    }
  };*/

  const processStatement = async (rows) => {
  const batch = writeBatch(db);
  let matchedCount = 0;

  try {
    // 1. FETCH ALL UNVERIFIED PAYMENTS ONCE
    // This replaces 100+ individual queries with just 1.
    const unverifiedQ = query(
      collection(db, "payments"),
      where("businessId", "==", businessId),
      where("isVerified", "==", false)
    );
    const unverifiedSnap = await getDocs(unverifiedQ);
    
    // Create a local map for instant lookup [Code -> Document ID]
    const unverifiedMap = {};
    unverifiedSnap.forEach(doc => {
      const data = doc.data();
      if (data.transactionCode) {
        unverifiedMap[data.transactionCode.toUpperCase()] = doc.id;
      }
    });

    // 2. PROCESS ROWS IN MEMORY
    for (const row of rows) {
      const rawCode = row['Receipt No.'] || row['Transaction ID'];
      const amount = parseFloat(row['Paid In'] || row['Amount'] || 0);

      if (rawCode && amount > 0) {
        const code = rawCode.toString().toUpperCase().trim();

        // Check if this code exists in our local map
        if (unverifiedMap[code]) {
          const paymentDocId = unverifiedMap[code];
          const ref = doc(db, "payments", paymentDocId);
          
          batch.update(ref, { 
            isVerified: true, 
            verifiedVia: "statement_upload",
            actualAmount: amount 
          });
          matchedCount++;
        }

        // 3. LOG THE TRUTH (mpesa_logs)
        // We use the Transaction Code as the Doc ID to prevent duplicates
        const logRef = doc(db, "mpesa_logs", code);
        batch.set(logRef, {
          transactionCode: code,
          amount: amount,
          businessId: businessId,
          status: "verified_via_statement",
          timestamp: new Date().toISOString()
        }, { merge: true });
      }
    }

    // 4. COMMIT EVERYTHING AT ONCE
    await batch.commit();
    setResults({ matched: matchedCount, totalProcessed: rows.length });
  } catch (error) {
    console.error("Reconciliation Error:", error);
    alert("Error syncing data: " + error.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Upload className="text-blue-600" size={24} />
        </div>
        <div>
          <h3 className="text-xl font-bold">Import M-Pesa Statement</h3>
          <p className="text-slate-500 text-sm">Upload Excel (.xlsx) from Safaricom Portal</p>
        </div>
      </div>

      {!loading && !results && (
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <p className="mb-2 text-sm text-slate-500 font-semibold">Click to upload or drag and drop</p>
            <p className="text-xs text-slate-400">Excel files from Safaricom Business Portal</p>
          </div>
          <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
        </label>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-48">
          <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
          <p className="text-slate-600 font-medium">Reconciling transactions... please wait</p>
        </div>
      )}

      {results && (
        <div className="bg-green-50 p-6 rounded-xl border border-green-200">
          <div className="flex items-center gap-2 text-green-700 font-bold mb-2">
            <CheckCircle size={20} />
            <h4>Reconciliation Complete</h4>
          </div>
          <p className="text-green-600">
            We processed <strong>{results.totalProcessed}</strong> records and matched <strong>{results.matched}</strong> unverified sales.
          </p>
          <button 
            onClick={() => setResults(null)}
            className="mt-4 text-sm font-semibold text-green-700 underline"
          >
            Upload another statement
          </button>
        </div>
      )}
    </div>
  );
}