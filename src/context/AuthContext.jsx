import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /*useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch the user's business profile from Firestore
        const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (docSnap.exists()) {
          setUser({ uid: firebaseUser.uid, ...docSnap.data() });
        } else {
          setUser({ uid: firebaseUser.uid }); // Basic info if doc doesn't exist
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);*/

  // src/context/AuthContext.js

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        // We MUST wait for the document to exist before we stop the loading spinner
        const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        
        if (docSnap.exists()) {
          setUser({ uid: firebaseUser.uid, ...docSnap.data() });
        } else {
          console.warn("User logged in but no Firestore profile found yet.");
          setUser({ uid: firebaseUser.uid }); 
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      }
    } else {
      setUser(null);
    }
    // Only set loading to false AFTER we have tried to get the profile
    setLoading(false); 
  });
  return unsubscribe;
}, []);

  // Make sure we return a value here, even if it's loading
  const value = { user, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};