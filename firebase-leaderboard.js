import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { app, auth } from "./firebase-multiplayer.js";

const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const entriesRef = collection(db, "leaderboards", "international_2_over", "entries");

export function observeLeaderboardAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function isPermanentAccount(user) {
  return Boolean(user && !user.isAnonymous);
}

export function getLeaderboardUser() {
  return auth.currentUser;
}

export async function signInForLeaderboard() {
  await signInWithPopup(auth, provider);
}

export async function signOutLeaderboard() {
  await signOut(auth);
}

export function watchLeaderboard(callback, onError) {
  return onSnapshot(query(entriesRef, orderBy("score", "desc")), snapshot => {
    callback(snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() })));
  }, onError);
}

export async function saveLeaderboardPersonalBest(user, result) {
  if (!isPermanentAccount(user)) throw new Error("Sign in with Google to enter the leaderboard.");
  const entryRef = doc(entriesRef, user.uid);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(entryRef);
    if (current.exists() && Number(current.data().score) >= result.score) return;
    transaction.set(entryRef, {
      uid: user.uid,
      displayName: user.displayName || "Cricket Player",
      photoURL: user.photoURL || "",
      score: result.score,
      wickets: result.wickets,
      accuracy: result.accuracy,
      wpm: result.wpm,
      fours: result.fours,
      sixes: result.sixes,
      updatedAt: serverTimestamp(),
    });
  });
}
