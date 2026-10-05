// Checks firestore.rules against the Firestore emulator (run in GitHub Actions).
import { test, before, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, writeBatch, collection, getDocs, query, where, Timestamp } from "firebase/firestore";

const OWNER = "owner@test.pk";
let env;
const ctx = (uid, email) => env.authenticatedContext(uid, { email }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-warsi",
    firestore: { rules: readFileSync("firestore.rules", "utf8").replaceAll("warsihardwaresgd@gmail.com", OWNER) }
  });
});
after(() => env.cleanup());

test("stranger cannot start the shop", async () => {
  const db = ctx("x1", "random@test.pk");
  const b = writeBatch(db);
  b.set(doc(db, "meta/shop"), { owner: "x1" });
  b.set(doc(db, "users/x1"), { role: "owner" });
  await assertFails(b.commit());
});

test("owner starts the shop with first branch", async () => {
  const db = ctx("own", OWNER);
  const b = writeBatch(db);
  b.set(doc(db, "meta/shop"), { owner: "own", name: "Shop" });
  b.set(doc(db, "users/own"), { role: "owner", name: "Irfan" });
  b.set(doc(db, "branches/main"), { name: "Main" });
  await assertSucceeds(b.commit());
});

test("shop cannot be taken over afterwards", async () => {
  await assertFails(setDoc(doc(ctx("own2", OWNER), "meta/shop"), { owner: "own2" }));
});

test("new person can only request pending access", async () => {
  const db = ctx("st1", "staff@test.pk");
  await assertFails(setDoc(doc(db, "users/st1"), { role: "staff" }));
  await assertSucceeds(setDoc(doc(db, "users/st1"), { role: "pending", name: "Bilal" }));
  await assertFails(getDoc(doc(db, "items/i1")));
  await assertFails(updateDoc(doc(db, "users/st1"), { role: "staff" }));
});

test("owner approves; staff works but cannot delete or manage", async () => {
  await assertSucceeds(updateDoc(doc(ctx("own", OWNER), "users/st1"), { role: "staff" }));
  const db = ctx("st1", "staff@test.pk");
  await assertSucceeds(setDoc(doc(db, "items/i1"), { name: "Pipe", stock: { main: 5 }, u: Timestamp.now() }));
  await assertSucceeds(updateDoc(doc(db, "items/i1"), { "stock.main": 4 }));
  await assertFails(updateDoc(doc(db, "items/i1"), { del: true }));
  await assertSucceeds(getDocs(query(collection(db, "items"), where("u", ">", Timestamp.fromMillis(0)))));
  await assertFails(setDoc(doc(db, "branches/b2"), { name: "Saddar" }));
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(updateDoc(doc(db, "users/st1"), { role: "manager" }));
  await assertSucceeds(updateDoc(doc(db, "users/st1"), { name: "Bilal Ahmed" }));
});

test("manager can delete and manage staff but not promote", async () => {
  await assertSucceeds(setDoc(doc(ctx("mg1", "mgr@test.pk"), "users/mg1"), { role: "pending", name: "Kashif" }));
  await assertSucceeds(updateDoc(doc(ctx("own", OWNER), "users/mg1"), { role: "manager" }));
  const db = ctx("mg1", "mgr@test.pk");
  await assertSucceeds(updateDoc(doc(db, "items/i1"), { del: true }));
  await assertSucceeds(setDoc(doc(db, "branches/b2"), { name: "Saddar" }));
  await assertSucceeds(getDocs(collection(db, "users")));
  await assertSucceeds(updateDoc(doc(db, "users/st1"), { role: "disabled" }));
  await assertFails(updateDoc(doc(db, "users/st1"), { role: "manager" }));
  await assertFails(updateDoc(doc(db, "users/own"), { role: "staff" }));
});

test("attachments: staff/manager add and read photos; others cannot", async () => {
  const mg = ctx("mg1", "mgr@test.pk");
  await assertSucceeds(setDoc(doc(mg, "attachments/a1"), { data: "data:image/jpeg;base64,AAAA", kind: "expense" }));
  await assertSucceeds(getDoc(doc(mg, "attachments/a1")));
  await assertFails(updateDoc(doc(mg, "attachments/a1"), { data: "x" }));
  await assertFails(setDoc(doc(mg, "attachments/a2"), { data: "x".repeat(1000001) }));
  const pend = ctx("pp1", "p@test.pk");
  await assertSucceeds(setDoc(doc(pend, "users/pp1"), { role: "pending" }));
  await assertFails(getDoc(doc(pend, "attachments/a1")));
});

test("disabled staff loses access", async () => {
  await assertFails(getDoc(doc(ctx("st1", "staff@test.pk"), "items/i1")));
});
