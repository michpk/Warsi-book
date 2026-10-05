// Tells people when a newer version exists, and what changed after they update.
// The website publishes version.json (build number + changelog) on every release.
import { isNative } from "./native.js";

const BUILD = Number(import.meta.env.VITE_BUILD || 0);
const SITE = "https://michpk.github.io/Warsi-book/";
const APK = "https://github.com/michpk/Warsi-book/releases/download/latest/warsi-book.apk";
const SEEN = "wb_seen_build";

function modal(html) {
  const el = document.createElement("div"); el.id = "upd"; el.setAttribute("dir", "rtl"); el.setAttribute("lang", "ur");
  el.innerHTML = `<div class="upd-box" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-upd-close]")) el.remove(); });
  return el;
}
const list = notes => (notes || []).slice(0, 2).map(n => `<div class="upd-sec"><b>${n.title || ""}</b><ul>${(n.items || []).map(i => `<li>${i}</li>`).join("")}</ul></div>`).join("");

export async function checkForUpdate() {
  if (!BUILD) return;                                  // local/dev build
  let info = null;
  try { const r = await fetch((isNative ? SITE : "./") + "version.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) info = await r.json(); } catch (e) { return; }
  // 1) after updating: show "what's new" once
  let seen = 0; try { seen = Number(localStorage.getItem(SEEN) || 0); } catch (e) {}
  if (seen && seen < BUILD && info && info.build === BUILD) {
    modal(`<div class="upd-icon">✨</div><h3>نیا کیا ہے</h3><p class="upd-sub">وارثی بک ورژن 1.${BUILD}</p>${list(info.notes)}<button class="btn primary" data-upd-close>ٹھیک ہے</button>`);
  }
  try { localStorage.setItem(SEEN, String(BUILD)); } catch (e) {}
  // 2) a newer version is out
  if (!info || !(info.build > BUILD)) return;
  try { if (sessionStorage.getItem("wb_upd_shown") === String(info.build)) return; sessionStorage.setItem("wb_upd_shown", String(info.build)); } catch (e) {}
  if (document.getElementById("upd")) return;
  if (isNative) {
    const el = modal(`<div class="upd-icon">⬇️</div><h3>نیا ورژن دستیاب ہے</h3><p class="upd-sub">آپ کے پاس 1.${BUILD} ہے، نیا 1.${info.build} آ گیا ہے</p>${list(info.notes)}
      <a class="btn primary" href="${APK}" target="_blank" rel="noopener" data-upd-go>ابھی اپڈیٹ کریں</a><button class="btn ghost" data-upd-close>بعد میں</button>
      <p class="note">فائل ڈاؤن لوڈ ہونے کے بعد اسے کھول کر Install دبائیں۔ آپ کا ڈیٹا محفوظ رہے گا۔</p>`);
    el.querySelector("[data-upd-go]").addEventListener("click", e => { e.preventDefault(); window.location.href = APK; });
  } else {
    const el = modal(`<div class="upd-icon">🔄</div><h3>وارثی بک میں نئی تبدیلیاں آئی ہیں</h3>${list(info.notes)}<button class="btn primary" data-upd-reload>تازہ کریں</button><button class="btn ghost" data-upd-close>بعد میں</button>`);
    el.querySelector("[data-upd-reload]").addEventListener("click", async () => {
      try { const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs || []) await r.update(); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
      location.reload();
    });
  }
}
export const appVersion = () => (BUILD ? "1." + BUILD : "dev");
