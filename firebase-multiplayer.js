import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, runTransaction, onValue } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJKhNZ4ORjHkDKOXBY9_KrP8ceotj5D0Q",
  authDomain: "cricktype-4d742.firebaseapp.com",
  databaseURL: "https://cricktype-4d742-default-rtdb.firebaseio.com",
  projectId: "cricktype-4d742",
  storageBucket: "cricktype-4d742.firebasestorage.app",
  messagingSenderId: "1071431654879",
  appId: "1:1071431654879:web:cb04dbf980f72aa5f3786a",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export async function ensurePlayer() {
  if (auth.currentUser) return auth.currentUser;
  try {
    return (await signInAnonymously(auth)).user;
  } catch (error) {
    if (error.code === "auth/configuration-not-found" || error.message?.includes("CONFIGURATION_NOT_FOUND")) {
      throw new Error("Firebase Authentication is not configured for cricktype-4d742. In Firebase Console, open Authentication → Get started, then Sign-in method → Anonymous → Enable.");
    }
    if (error.code === "auth/operation-not-allowed") {
      throw new Error("Anonymous sign-in is disabled. In Firebase Console, open Authentication → Sign-in method → Anonymous and enable it.");
    }
    throw error;
  }
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function getRoomPlayerId() {
  let playerId = sessionStorage.getItem("cricktype-room-player-id");
  if (!playerId) {
    playerId = `p_${crypto.randomUUID()}`;
    sessionStorage.setItem("cricktype-room-player-id", playerId);
  }
  return playerId;
}

export async function createRoom(difficulty, sentenceIds) {
  const user = await ensurePlayer();
  const playerId = getRoomPlayerId();
  let code, created = false, createdRoom = null;
  for (let i = 0; i < 8 && !created; i++) {
    code = makeCode();
    const result = await runTransaction(ref(db, `rooms/${code}`), current => {
      if (current !== null) return;
      return { status: "waiting", difficulty, overs: 2, balls: sentenceIds,
        createdAt: Date.now(), players: { [playerId]: { uid: user.uid, name: "Player 1", joinedAt: Date.now() } }, scores: {} };
    });
    created = result.committed;
    if (created) createdRoom = result.snapshot.val();
  }
  if (!created) throw new Error("Could not reserve a room code. Please try again.");
  return { code, uid: playerId, room: createdRoom };
}

export async function joinRoom(roomCode) {
  const user = await ensurePlayer();
  const playerId = getRoomPlayerId();
  const code = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error("Enter the five-character room code.");

  const roomRef = ref(db, `rooms/${code}`);
  const roomSnapshot = await get(roomRef);
  if (!roomSnapshot.exists()) throw new Error(`Room ${code} was not found. Check the code and try again.`);
  if (roomSnapshot.val().status === "complete") throw new Error("This room's match is already complete.");

  const playersRef = ref(db, `rooms/${code}/players`);
  const result = await runTransaction(playersRef, players => {
    players = players || {};
    if (players[playerId]) return players;
    if (Object.keys(players).length >= 2) return;
    players[playerId] = {
      uid: user.uid,
      name: "Player 2",
      joinedAt: Date.now(),
    };
    return players;
  });

  if (!result.committed) {
    const latest = await get(roomRef);
    if (!latest.exists()) throw new Error(`Room ${code} was not found. Check the code and try again.`);
    const latestRoom = latest.val();
    if (latestRoom.status === "complete") throw new Error("This room's match is already complete.");
    if (Object.keys(latestRoom.players || {}).length >= 2) {
      throw new Error("This room already has two players. Ask the host to create a new room.");
    }
    throw new Error(`Firebase declined the player-list update for ${code}. Check the Realtime Database read/write rules for /rooms/${code}/players.`);
  }

  await update(ref(db, `rooms/${code}`), { status: "ready" });
  const joinedRoom = await get(roomRef);
  return { code, uid: playerId, room: joinedRoom.val() };
}

export function watchRoom(code, callback) {
  return onValue(ref(db, `rooms/${code}`), snapshot => callback(snapshot.val()));
}

export async function submitBall(code, uid, index, result) {
  await set(ref(db, `rooms/${code}/scores/${uid}/${index}`), result);
}

export async function finishPlayer(code, uid, summary) {
  await update(ref(db, `rooms/${code}/scores/${uid}`), { finished: true, summary });
  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);
  const scores = snapshot.val()?.scores || {};
  if (Object.values(scores).filter(score => score?.finished).length >= 2) {
    await update(roomRef, { status: "complete" });
  }
}

export async function deleteRoom(code) {
  await remove(ref(db, `rooms/${code}`));
}
