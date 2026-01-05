import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import logo from '../assets/dukalogo.png'

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  // Function to generate a random 5-character Business ID
  const generateBusinessId = () => {
    return "BIZ-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password || !businessName) return alert("Please fill all fields");
    
    setLoading(true);
    try {
      // 1. Create the user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      
      // 2. Generate the unique ID for this shop
      const businessId = generateBusinessId();

      // 3. Create the Owner Profile in Firestore
      await setDoc(doc(db, "users", uid), {
        name: "Business Owner",
        email: email,
        role: "owner",
        businessName: businessName,
        businessId: businessId,
        createdAt: new Date().toISOString()
      });

      alert("Success! Your Shop ID is: " + businessId);
    } catch (error) {
      alert("Signup Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
         <div className="flex flex-col items-center mb-2">
          <img 
            src={logo} 
            alt="DukaRecon Logo" 
            className="h-24 w-auto mb-2 object-contain" 
          />
           <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">Register your Business</h1>
         <p className="text-slate-500 mb-4 text-center">Start tracking your sales Payments today</p>
        </div>
       
        
        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
            <input 
              type="text" 
              placeholder="e.g. Kenyatta Hardware"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 outline-none focus:border-blue-500"
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input 
              type="email" 
              placeholder="owner@email.com"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 outline-none focus:border-blue-500"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 outline-none focus:border-blue-500"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
          >
            {loading ? "Creating Business..." : "Create Business"}
          </button>
        </form>
      </div>
    </div>
  );
}