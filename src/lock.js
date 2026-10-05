// App lock: a 4-digit PIN on every device, with fingerprint / face unlock on phones that have it.
// The PIN never leaves the device: only a salted SHA-256 of it is stored locally.
import { isNative } from "./native.js";

const K = uid => "wb_lock_" + uid;
const RELOCK_AFTER = 60 * 1000;          // lock again after the app was in the background for a minute
const MAX_TRIES = 5;

function load(uid) { try { return JSON.parse(localStorage.getItem(K(uid)) || "null"); } catch (e) { return null; } }
function store(uid, v) { try { localStorage.setItem(K(uid), JSON.stringify(v)); } catch (e) {} }
async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function bioAvailable() {
  if (!isNative) return false;
  try { const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth"); const r = await BiometricAuth.checkBiometry(); return !!(r.isAvailable || r.deviceIsSecure); } catch (e) { return false; }
}
async function bioPrompt() {
  const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
  await BiometricAuth.authenticate({ reason: "وارثی بک کھولنے کے لیے تصدیق کریں", cancelTitle: "PIN استعمال کریں", allowDeviceCredential: true, androidTitle: "وارثی بک", androidSubtitle: "فنگر پرنٹ یا چہرے سے کھولیں", androidConfirmationRequired: false });
}

const FP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 11v3a8 8 0 0 1-1 4M8 11a4 4 0 0 1 8 0v2M5 11a7 7 0 0 1 14 0v3M16 15a12 12 0 0 1-1 5M9 21a14 14 0 0 0 1-4"/></svg>';

export function createLock({ onForgot }) {
  let uid = null, el = null, buf = "", first = null, mode = "unlock", tries = 0, hiddenAt = 0, open = false, resolveOpen = null, bioOn = false;

  function render(msg = "", err = false) {
    if (!el) { el = document.createElement("div"); el.id = "lock"; el.setAttribute("dir", "rtl"); el.setAttribute("lang", "ur"); document.body.appendChild(el); }
    const title = mode === "set" ? (first ? "PIN دوبارہ لکھیں" : "نیا 4 ہندسوں کا PIN بنائیں") : "PIN لکھیں";
    el.innerHTML = `<div class="lock-box" role="dialog" aria-modal="true" aria-label="ایپ لاک">
      <img src="logo.png" alt="">
      <h2>${title}</h2>
      <p class="${err ? "err" : ""}">${msg || (mode === "set" ? "ہر بار ایپ کھولنے پر یہ PIN پوچھا جائے گا۔" : "")}</p>
      <div class="pin-dots" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < buf.length ? "on" : ""}"></i>`).join("")}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}" aria-label="${n}">${n}</button>`).join("")}
        <button class="k-fn" data-k="bio" ${mode === "unlock" && bioOn ? "" : "style=\"visibility:hidden\""} aria-label="فنگر پرنٹ">${FP}</button>
        <button data-k="0" aria-label="0">0</button><button class="k-fn" data-k="del" aria-label="مٹائیں">⌫</button></div>
      ${mode === "unlock" && bioOn ? `<button class="bio-btn" data-k="bio">${FP} فنگر پرنٹ سے کھولیں</button>` : ""}
      ${mode === "unlock" ? `<button class="lock-link" data-k="forgot">PIN بھول گئے؟ پاس ورڈ سے دوبارہ لاگ اِن کریں</button>` : ""}
    </div>`;
    el.hidden = false;
    el.onclick = onKey;
  }
  function shake(msg) { buf = ""; render(msg, true); const d = el.querySelector(".pin-dots"); if (d) d.classList.add("shake"); }

  async function onKey(ev) {
    const b = ev.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k;
    if (k === "forgot") { close(); onForgot(); return; }
    if (k === "bio") { tryBio(); return; }
    if (k === "del") { buf = buf.slice(0, -1); render(); return; }
    if (buf.length >= 4) return;
    buf += k; render();
    if (buf.length < 4) return;
    if (mode === "set") {
      if (!first) { first = buf; buf = ""; render(); return; }
      if (first !== buf) { first = null; shake("دونوں PIN ایک جیسے نہیں تھے، دوبارہ بنائیں"); return; }
      const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
      const can = await bioAvailable();
      store(uid, { salt, hash: await sha(salt + buf), bio: can });
      close(); return;
    }
    const v = load(uid);
    if (v && await sha(v.salt + buf) === v.hash) { tries = 0; close(); return; }
    tries++;
    if (tries >= MAX_TRIES) { close(); onForgot(); return; }
    shake(`غلط PIN · ${MAX_TRIES - tries} کوششیں باقی`);
  }
  async function tryBio() {
    try { await bioPrompt(); tries = 0; close(); } catch (e) { render("فنگر پرنٹ سے نہیں کھلا، PIN لکھیں"); }
  }
  function close() { open = false; buf = ""; first = null; if (el) { el.hidden = true; el.innerHTML = ""; } if (resolveOpen) { resolveOpen(); resolveOpen = null; } }

  async function show(m) {
    mode = m; buf = ""; first = null; open = true;
    const v = load(uid); bioOn = m === "unlock" && !!(v && v.bio) && await bioAvailable();
    render();
    if (bioOn) setTimeout(tryBio, 250);
    return new Promise(r => { resolveOpen = r; });
  }

  document.addEventListener("visibilitychange", () => {
    if (!uid) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (!open && hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER && load(uid)) show("unlock");
  });

  return {
    // Called once after sign-in: create a PIN if this device has none, otherwise ask for it.
    async require(id) { uid = id; return show(load(id) ? "unlock" : "set"); },
    async changePin() { if (uid) { first = null; return show("set"); } },
    hasBio: () => bioAvailable(),
    bioEnabled: () => !!(uid && (load(uid) || {}).bio),
    async setBio(on) { const v = load(uid); if (v) { if (on) { try { await bioPrompt(); } catch (e) { return false; } } v.bio = !!on; store(uid, v); } return true; },
    reset(id) { try { localStorage.removeItem(K(id || uid)); } catch (e) {} },
    stop() { uid = null; close(); }
  };
}
