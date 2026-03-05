import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export { serverTimestamp, Timestamp, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot };

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const signInWithOneTap = async (credential: string) => {
  try {
    const googleCredential = GoogleAuthProvider.credential(credential);
    const result = await signInWithCredential(auth, googleCredential);
    return result.user;
  } catch (error) {
    console.error("Error signing in with One Tap", error);
    throw error;
  }
};

export const logout = () => signOut(auth);
