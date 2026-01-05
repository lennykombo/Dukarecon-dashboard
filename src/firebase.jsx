import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWHfJqn_sC4_R1BBOqzWacUPUuIL48bQI",
  authDomain: "dukaflow-fdb4c.firebaseapp.com",
  projectId: "dukaflow-fdb4c",
  storageBucket: "dukaflow-fdb4c.firebasestorage.app",
  messagingSenderId: "404405666346",
  appId: "1:404405666346:web:a320b95e548f3154b53953"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);