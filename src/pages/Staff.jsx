import React, { useState, useEffect } from "react";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export default function Staff({ businessId }) {
  const [staff, setStaff] = useState([]);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
  // 1. Guard: Don't run if businessId is missing
  if (!businessId) return;

  const fetchStaff = async () => {
    try {
      const q = query(
        collection(db, "users"), 
        where("businessId", "==", businessId), 
        where("role", "==", "attendant")
      );
      
      const snap = await getDocs(q);
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Staff fetch error:", error);
    }
  };

  fetchStaff();
}, [businessId]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    alert("Note: On the Spark plan, please ask the attendant to Sign Up on the mobile app using this email. They will be auto-linked via Business ID: " + businessId);
    // In a full system, you'd save an 'invite' document here
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Staff Management</h2>
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <span className="text-blue-700 font-mono text-sm">Your Shop ID: {businessId}</span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border mb-8">
        <h3 className="font-semibold mb-4">Add New Attendant</h3>
        <form onSubmit={handleAddStaff} className="flex gap-4">
          <input 
            type="email" 
            placeholder="Attendant Email" 
            className="flex-1 border p-2 rounded"
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-6 py-2 rounded font-bold">Invite</button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} className="border-t">
                <td className="p-4">{s.name}</td>
                <td className="p-4">{s.email}</td>
                <td className="p-4"><span className="capitalize">{s.role}</span></td>
                <td className="p-4"><span className="text-green-600">● Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}