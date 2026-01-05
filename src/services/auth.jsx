import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);