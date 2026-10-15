// Barcode scanning: phone / laptop camera, and hand-held scanners (USB or Bluetooth) that type like a keyboard.
// Also: making our own codes (EAN-13 in the in-store range "2…") and drawing barcode labels.

/* ---------- hand-held scanner (keyboard wedge) ----------
   A scanner "types" the code very fast and presses Enter. We watch key timing: a burst of 4+ characters
   with < 45 ms between keys, ending in Enter, is a scan (people don't type that fast). Characters the burst
   typed into a text box are removed again. */
export function initKeyboardScanner(onScan) {
  let buf = "", last = 0, target = null, before = null;
  document.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const now = performance.now(), gap = now - last;
    if (ev.key === "Enter") {
      if (buf.length >= 4 && gap < 80) {
        const code = buf; buf = "";
        if (target && before != null && "value" in target) { target.value = before; target.dispatchEvent(new Event("input", { bubbles: true })); }
        ev.preventDefault(); ev.stopPropagation();
        onScan(code.trim());
      } else buf = "";
      target = before = null; return;
    }
    if (ev.key.length !== 1) return;
    if (gap > 45) { buf = ""; target = document.activeElement; before = target && "value" in target ? target.value : null; }
    buf += ev.key; last = now;
  }, true);
}

/* ---------- sounds ---------- */
let actx = null;
export function beep(ok = true) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = ok ? 1650 : 330; o.type = "square"; g.gain.value = 0.06;
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ok ? 0.08 : 0.25));
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate(ok ? 40 : [60, 40, 60]); } catch (e) {}
}

/* ---------- camera ---------- */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code"];
let cam = null;
/* opts: {title, hint, continuous, onCode(code) -> string|void (text shown under the camera)} */
export async function openCamera(opts) {
  closeCamera();
  const el = document.createElement("div"); el.id = "scanCam"; el.setAttribute("dir", "rtl"); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", opts.title || "بارکوڈ اسکین");
  el.innerHTML = `<div class="sc-top"><b>${opts.title || "بارکوڈ اسکین کریں"}</b><button type="button" class="sc-x" aria-label="بند کریں">×</button></div>
    <div class="sc-view"><video playsinline muted></video><div class="sc-frame"><i></i></div></div>
    <div class="sc-msg" aria-live="polite">${opts.hint || "بارکوڈ کو فریم کے اندر رکھیں"}</div>
    <div class="sc-bottom">${opts.continuous ? `<span class="sc-count">0 اسکین</span>` : ""}<button type="button" class="btn sc-done">${opts.continuous ? "مکمل" : "بند کریں"}</button></div>`;
  document.body.appendChild(el);
  const video = el.querySelector("video"), msg = el.querySelector(".sc-msg"), cnt = el.querySelector(".sc-count");
  const state = { el, stream: null, stop: false, controls: null, lastCode: "", lastAt: 0, n: 0 };
  cam = state;
  const close = () => closeCamera();
  el.querySelector(".sc-x").onclick = close; el.querySelector(".sc-done").onclick = close;
  const hit = code => {
    if (state.stop || !code) return;
    const now = Date.now();
    // the same code counts again only after it has been out of view for a moment (so holding it still adds one)
    if (code === state.lastCode && now - state.lastAt < 1200) { state.lastAt = now; return; }
    state.lastCode = code; state.lastAt = now; state.n++;
    beep(true);
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    let r; try { r = opts.onCode(code); } catch (e) { console.error(e); }
    if (cnt) cnt.textContent = state.n + " اسکین";
    if (typeof r === "string") msg.textContent = r;
    if (!opts.continuous) setTimeout(close, 250);
  };
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    msg.innerHTML = `کیمرہ نہیں کھل سکا۔ ${location.protocol !== "https:" && !/localhost/.test(location.host) ? "" : "فون کی سیٹنگ میں وارثی بک / براؤزر کو کیمرے کی اجازت دیں۔"}<br>بارکوڈ کا نمبر ہاتھ سے بھی لکھ سکتے ہیں:`;
    manualBox(el, hit);
    return;
  }
  if (state.stop) { state.stream.getTracks().forEach(t => t.stop()); return; }
  video.srcObject = state.stream; await video.play().catch(() => {});
  manualBox(el, hit, true);
  // 1) the browser's own detector (Android Chrome / app, Mac) – fast
  let det = null;
  if ("BarcodeDetector" in window) {
    try { const sup = await window.BarcodeDetector.getSupportedFormats(); const f = FORMATS.filter(x => sup.includes(x)); if (f.length) det = new window.BarcodeDetector({ formats: f }); } catch (e) { det = null; }
  }
  if (det) {
    const loop = async () => {
      if (state.stop) return;
      try { if (video.readyState >= 2) { const r = await det.detect(video); if (r && r[0]) hit(r[0].rawValue); } } catch (e) {}
      setTimeout(loop, 120);
    };
    loop(); return;
  }
  // 2) otherwise ZXing in JavaScript (Windows / iPhone browsers)
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
    state.controls = await reader.decodeFromVideoElement(video, (res) => { if (res) hit(res.getText()); });
  } catch (e) { console.error(e); msg.textContent = "اس براؤزر میں کیمرے سے اسکین نہیں ہو سکا۔ نمبر ہاتھ سے لکھیں۔"; }
}
function manualBox(el, hit, small) {
  const b = document.createElement("form"); b.className = "sc-manual" + (small ? " small" : "");
  b.innerHTML = `<input inputmode="numeric" autocomplete="off" placeholder="یا بارکوڈ نمبر لکھیں" dir="ltr" aria-label="بارکوڈ نمبر"><button class="btn sm">ٹھیک</button>`;
  b.onsubmit = ev => { ev.preventDefault(); const v = b.querySelector("input").value.trim(); if (v) { b.querySelector("input").value = ""; cam && (cam.lastCode = ""); hit(v); } };
  el.querySelector(".sc-bottom").before(b);
}
export function closeCamera() {
  if (!cam) return;
  const s = cam; cam = null; s.stop = true;
  try { s.controls && s.controls.stop(); } catch (e) {}
  try { s.stream && s.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  s.el.remove();
}
export const cameraOpen = () => !!cam;

/* ---------- our own codes ---------- */
export function ean13Check(d12) {
  let s = 0; for (let i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
}
// EAN-13 starting with "2" is reserved for in-store codes, so it never clashes with a company barcode.
export function newShopCode(taken) {
  for (;;) {
    let d = "29"; for (let i = 0; i < 10; i++) d += Math.floor(Math.random() * 10);
    const c = d + ean13Check(d);
    if (!taken.has(c)) return c;
  }
}

/* ---------- labels ---------- */
// Draw one label (name, price, barcode) on a canvas. w,h in mm; dpmm = dots per mm.
export async function labelCanvas({ name, price, unit, code, shop }, w, h, dpmm = 12) {
  const JsBarcode = (await import("jsbarcode")).default;
  const c = document.createElement("canvas"); c.width = Math.round(w * dpmm); c.height = Math.round(h * dpmm);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
  const pad = 1.5 * dpmm, W = c.width - 2 * pad;
  const fit = (txt, px, weight, maxW) => { let s = px; do { g.font = `${weight} ${s}px "Noto Sans Arabic", Tahoma, sans-serif`; s -= 1; } while (g.measureText(txt).width > maxW && s > 8); };
  g.direction = "rtl"; g.textAlign = "center"; g.textBaseline = "top";
  // shop name (small) and item name
  if (shop) { fit(shop, Math.round(h * dpmm * 0.09), 400, W); g.fillStyle = "#444"; g.fillText(shop, c.width / 2, pad * 0.6); g.fillStyle = "#000"; }
  const nameTop = shop ? pad * 0.6 + h * dpmm * 0.12 : pad;
  fit(name, Math.round(h * dpmm * 0.15), 700, W); g.fillText(name, c.width / 2, nameTop);
  // barcode
  const bc = document.createElement("canvas");
  const ean = /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === code[12];
  JsBarcode(bc, code, { format: ean ? "EAN13" : "CODE128", displayValue: true, fontSize: 18, height: 70, margin: 0, width: 2, background: "#ffffff" });
  const bTop = nameTop + h * dpmm * 0.21, bH = c.height - bTop - (price != null ? h * dpmm * 0.2 : pad);
  const k = Math.min(W / bc.width, bH / bc.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(bc, (c.width - bc.width * k) / 2, bTop, bc.width * k, bc.height * k);
  if (price != null) {
    const t = "Rs " + Math.round(price).toLocaleString("en-PK") + (unit ? " / " + unit : "");
    g.direction = "rtl"; fit(t, Math.round(h * dpmm * 0.15), 700, W); g.textBaseline = "bottom"; g.fillText(t, c.width / 2, c.height - pad * 0.5);
  }
  return c;
}
/* labels: [{...label, copies}], layout: "a4" (3×8 on A4) or "roll" (one label per page, w×h mm) */
export async function labelsPdf(labels, layout, size = { w: 50, h: 30 }) {
  const { jsPDF } = await import("jspdf");
  await (document.fonts && document.fonts.ready);
  const flat = []; for (const l of labels) for (let i = 0; i < Math.max(1, l.copies | 0); i++) flat.push(l);
  if (layout === "roll") {
    const pdf = new jsPDF({ unit: "mm", format: [size.w, size.h], orientation: size.w > size.h ? "landscape" : "portrait" });
    for (let i = 0; i < flat.length; i++) {
      if (i) pdf.addPage([size.w, size.h], size.w > size.h ? "landscape" : "portrait");
      const c = await labelCanvas(flat[i], size.w, size.h);
      pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, size.w, size.h);
    }
    return pdf.output("datauristring").split(",")[1];
  }
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const cols = 3, rows = 8, mx = 7, my = 10, gw = (210 - 2 * mx) / cols, gh = (297 - 2 * my) / rows;
  for (let i = 0; i < flat.length; i++) {
    const p = i % (cols * rows); if (i && !p) pdf.addPage();
    const col = p % cols, row = Math.floor(p / cols);
    const c = await labelCanvas(flat[i], gw - 2, gh - 2, 10);
    pdf.addImage(c.toDataURL("image/png"), "PNG", mx + (cols - 1 - col) * gw + 1, my + row * gh + 1, gw - 2, gh - 2);
    pdf.setDrawColor(220); pdf.setLineDashPattern([0.6, 0.8], 0); pdf.rect(mx + (cols - 1 - col) * gw, my + row * gh, gw, gh);
  }
  return pdf.output("datauristring").split(",")[1];
}
