// Data layer: Firebase Auth + Firestore with offline cache and incremental sync.
//
// Every document carries `u` (server timestamp of its last change). On start each
// collection is loaded from the on-device cache for free, then a live listener asks
// the server only for documents with `u` newer than the newest one cached. That keeps
// Firestore reads close to "only what changed", which matters on the free plan.
// Deletes are soft (`del: true`) so other devices learn about them through the same
// listener.
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocsFromCache, getDoc, onSnapshot, query, where, setDoc,
  updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, Timestamp
} from "firebase/firestore";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).includes("REPLACE");
let app, auth, fs;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
}

export const COLS = ["branches", "items", "customers", "entries", "sales", "purchases", "expenses"];
const M = {};               // col -> Map(id -> data)
let onChange = () => {};
let unsubs = [];
let errHandler = () => {};
export function setErrorHandler(f) { errHandler = f; }

function emit() { onChange(); }
const tsVal = t => (t && typeof t.toMillis === "function") ? t.toMillis() : 0;

function localPut(col, id, data, merge) {
  const m = M[col] || (M[col] = new Map());
  const cur = merge ? (m.get(id) || {}) : {};
  m.set(id, deepMerge({ ...cur }, data));
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !v._methodName) a[k] = deepMerge({ ...(a[k] || {}) }, v);
    else if (v && v._methodName) continue;    // sentinel (serverTimestamp/increment): applied separately
    else a[k] = v;
  }
  return a;
}
// {stock:{b1:5}} -> {"stock.b1":5} so updates merge instead of replacing the map
function flatten(obj, pre = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !v._methodName && !(v instanceof Timestamp)) flatten(v, pre + k + ".", out);
    else out[pre + k] = v;
  }
  return out;
}
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => v === undefined ? null : v));

// Writes are queued by Firestore (they work offline) and confirmed later; we never
// await the server, otherwise the app would freeze without internet.
function fire(p) { p.catch(e => { console.error(e); errHandler(e); }); }

export function list(col) {
  const m = M[col]; if (!m) return [];
  const out = []; for (const [id, d] of m) if (!d.del) out.push({ id, ...d });
  return out;
}
export function newId(col) { return doc(collection(fs, col)).id; }

export const db = {
  set(col, id, data) {
    data = clean(data); localPut(col, id, data, false); emit();
    fire(setDoc(doc(fs, col, id), { ...data, u: serverTimestamp() }));
  },
  add(col, data) { const id = newId(col); this.set(col, id, data); return id; },
  update(col, id, data) {
    data = clean(data); localPut(col, id, data, true); emit();
    fire(updateDoc(doc(fs, col, id), { ...flatten(data), u: serverTimestamp() }));
  },
  remove(col, id) { this.update(col, id, { del: true }); },
  // stock[branch] += delta, atomically on the server
  addStock(itemId, branch, delta, extra = {}) {
    const it = M.items && M.items.get(itemId); if (!it) return;
    const cur = Number((it.stock || {})[branch]) || 0;
    localPut("items", itemId, { stock: { [branch]: Math.round((cur + delta) * 1000) / 1000 }, ...clean(extra) }, true); emit();
    fire(updateDoc(doc(fs, "items", itemId), { ["stock." + branch]: increment(delta), ...flatten(clean(extra)), u: serverTimestamp() }));
  },
  // several writes as one all-or-nothing group: ops = [{op:'set'|'update'|'stock', ...}]
  batch(ops) {
    const b = writeBatch(fs);
    for (const o of ops) {
      if (o.op === "set") { const d = clean(o.data); localPut(o.col, o.id, d, false); b.set(doc(fs, o.col, o.id), { ...d, u: serverTimestamp() }); }
      if (o.op === "update") { const d = clean(o.data); localPut(o.col, o.id, d, true); b.update(doc(fs, o.col, o.id), { ...flatten(d), u: serverTimestamp() }); }
      if (o.op === "stock") {
        const it = M.items && M.items.get(o.id); const cur = Number(((it || {}).stock || {})[o.branch]) || 0;
        const extra = clean(o.extra || {});
        localPut("items", o.id, { stock: { [o.branch]: Math.round((cur + o.delta) * 1000) / 1000 }, ...extra }, true);
        b.update(doc(fs, "items", o.id), { ["stock." + o.branch]: increment(o.delta), ...flatten(extra), u: serverTimestamp() });
      }
    }
    emit(); fire(b.commit());
  },
  // bulk import: raw set without optimistic render per doc, chunks of 400
  async importAll(byCol, progress) {
    let n = 0, total = Object.values(byCol).reduce((a, x) => a + x.length, 0);
    for (const [col, docs] of Object.entries(byCol)) {
      for (let i = 0; i < docs.length; i += 400) {
        const b = writeBatch(fs);
        for (const d of docs.slice(i, i + 400)) { const { id, ...rest } = d; const data = clean(rest); localPut(col, id, data, false); b.set(doc(fs, col, id), { ...data, u: serverTimestamp() }); }
        await b.commit(); n += Math.min(400, docs.length - i); progress && progress(n, total);
      }
    }
    emit();
  }
};

async function syncCol(col) {
  const m = M[col] || (M[col] = new Map());
  let last = 0;
  try {
    const snap = await getDocsFromCache(collection(fs, col));
    snap.forEach(d => { const x = d.data({ serverTimestamps: "estimate" }); m.set(d.id, x); last = Math.max(last, tsVal(x.u)); });
  } catch (e) { /* empty cache */ }
  emit();
  const q = query(collection(fs, col), where("u", ">", Timestamp.fromMillis(last)));
  unsubs.push(onSnapshot(q, snap => {
    let changed = false;
    for (const ch of snap.docChanges()) {
      if (ch.type === "removed") continue;
      m.set(ch.doc.id, ch.doc.data({ serverTimestamps: "estimate" })); changed = true;
    }
    if (changed) emit();
  }, e => { console.error(col, e); errHandler(e); }));
}

export function startSync(cb, { users } = {}) {
  stopSync(); onChange = cb;
  for (const c of COLS) syncCol(c);
  if (users) syncCol("users");
}
export function stopSync() { unsubs.forEach(u => u()); unsubs = []; for (const k of Object.keys(M)) delete M[k]; }

/* ---------- auth & roles ---------- */
export const authApi = {
  onUser(cb) { return onAuthStateChanged(auth, cb); },
  signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
  async signUp(name, e, p) { const c = await createUserWithEmailAndPassword(auth, e, p); try { await updateProfile(c.user, { displayName: name }); } catch (x) {} return c.user; },
  reset: e => sendPasswordResetEmail(auth, e),
  signOut: () => { stopSync(); return signOut(auth); }
};
export async function shopInfo() {
  try { const s = await getDoc(doc(fs, "meta", "shop")); return s.exists() ? s.data() : null; } catch (e) { return null; }
}
export function watchMe(uid, cb) {
  return onSnapshot(doc(fs, "users", uid), s => cb(s.exists() ? s.data() : null), e => { console.error(e); cb(null); });
}
export async function createShop(user, shopName, name) {
  const b = writeBatch(fs);
  b.set(doc(fs, "meta", "shop"), { owner: user.uid, name: shopName, createdAt: Date.now() });
  b.set(doc(fs, "users", user.uid), { name, email: user.email, role: "owner", createdAt: Date.now(), u: serverTimestamp() });
  b.set(doc(fs, "branches", "main"), { name: "مین برانچ", address: "", createdAt: Date.now(), u: serverTimestamp() });
  await b.commit();
}
export async function requestAccess(user, name) {
  await setDoc(doc(fs, "users", user.uid), { name, email: user.email, role: "pending", createdAt: Date.now(), u: serverTimestamp() });
}
/* bill photos: own collection, never synced to every device; fetched when opened */
export function putAttachment(id, data) {
  fire(setDoc(doc(fs, "attachments", id), { ...data, u: serverTimestamp() }));
}
export async function getAttachment(id) {
  const s = await getDoc(doc(fs, "attachments", id));
  return s.exists() ? s.data() : null;
}
export function deleteAttachment(id) { fire(deleteDoc(doc(fs, "attachments", id))); }
export function attachmentId() { return doc(collection(fs, "attachments")).id; }
export function setRole(uid, role, branch) {
  db.update("users", uid, branch === undefined ? { role } : { role, branch });
}
