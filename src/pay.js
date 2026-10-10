// Shop payment accounts (bank / Raast, JazzCash, Easypaisa…) and the "scan to pay" QR on bills and ledgers.
//
// Bank and wallet apps in Pakistan only accept QR codes issued by a bank or wallet (Raast / merchant QR).
// So the owner adds the QR the bank or wallet app gives them ("My QR" / "Receive money"). We read the code
// inside that picture; when it is a standard EMVCo payment code we put the bill amount into it, so the
// customer's app opens with the amount already filled in. If the code can't be read we show the picture as is.
import { qrDataUrl } from "./exports.js";

let C = null;              // { S, esc, fmt, toast, openSheet, closeSheet, $, render, savePayAccounts }
export function initPay(ctx) { C = ctx; try { const c = JSON.parse(localStorage.getItem("wb_pay") || "null"); if (Array.isArray(c) && !C.S.pay) C.S.pay = c; } catch (e) {} }
export function setPayAccounts(list) { C.S.pay = Array.isArray(list) ? list : []; try { localStorage.setItem("wb_pay", JSON.stringify(C.S.pay)); } catch (e) {} }
const accts = () => (C && C.S.pay) || [];

export const KINDS = {
  raast: { name: "بینک / راست (Raast)", short: "بینک" },
  jazzcash: { name: "JazzCash", short: "JazzCash" },
  easypaisa: { name: "Easypaisa", short: "Easypaisa" },
  other: { name: "دوسرا", short: "دوسرا" }
};

/* ---------- EMVCo QR: read, add amount, recompute checksum ---------- */
function crc16(str) {
  const bytes = new TextEncoder().encode(str); let crc = 0xffff;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function parseTlv(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2), len = parseInt(s.slice(i + 2, i + 4), 10);
    if (!/^\d\d$/.test(id) || !isFinite(len) || i + 4 + len > s.length) return null;
    out.push([id, s.slice(i + 4, i + 4 + len)]); i += 4 + len;
  }
  return out;
}
export function isEmv(s) {
  if (!s || !s.startsWith("000201")) return false;
  const t = parseTlv(s); if (!t) return false;
  const crc = t.find(x => x[0] === "63"); if (!crc || !s.endsWith("6304" + crc[1])) return false;
  return crc16(s.slice(0, -4)) === crc[1].toUpperCase();
}
export function emvWithAmount(s, amount) {
  if (!isEmv(s) || !(amount > 0)) return s;
  const amt = Math.round(amount * 100) / 100;
  const v = Number.isInteger(amt) ? String(amt) : amt.toFixed(2);
  const t = parseTlv(s).filter(x => x[0] !== "63" && x[0] !== "54" && x[0] !== "01");
  t.push(["01", "12"], ["54", v]);
  t.sort((a, b) => Number(a[0]) - Number(b[0]));
  const body = t.map(([id, val]) => id + String(val.length).padStart(2, "0") + val).join("") + "6304";
  return body + crc16(body);
}

/* ---------- reading the QR from a screenshot / photo ---------- */
function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("bad image")); }; im.src = u; });
}
async function decodeQr(file) {
  const jsQR = (await import("jsqr")).default;
  const im = await loadImg(file);
  for (const max of [1200, 800, 1800]) {
    const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
    const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    if (r && r.data) return r.data;
  }
  return null;
}
async function smallImage(file) {
  const im = await loadImg(file); const k = Math.min(1, 700 / Math.max(im.width, im.height));
  const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

/* ---------- the QR picture for one account ---------- */
export async function payQrImage(a, amount, size = 220) {
  if (a.qr) {
    const withAmt = a.amt !== false && isEmv(a.qr) && amount > 0;
    return { src: await qrDataUrl(withAmt ? emvWithAmount(a.qr, amount) : a.qr, size), withAmt };
  }
  if (a.img) return { src: a.img, withAmt: false };
  return null;
}
const ltr = v => "⁦" + v + "⁩";
function detailRows(a, copy) {
  const { esc } = C, rows = [];
  if (a.holder) rows.push(["اکاؤنٹ ٹائٹل", a.holder]);
  if (a.number) rows.push([a.kind === "raast" ? "راست ID / اکاؤنٹ نمبر" : "موبائل اکاؤنٹ نمبر", a.number]);
  if (a.iban) rows.push(["IBAN", a.iban]);
  return rows.map(([k, v]) => `<div class="pay-d"><span>${k}</span><b dir="ltr">${esc(v)}</b>${copy ? `<button type="button" class="btn ghost sm" data-paycopy="${esc(v)}" aria-label="${k} کاپی کریں">کاپی</button>` : ""}</div>`).join("");
}
const acctName = a => a.title || KINDS[a.kind]?.name || "اکاؤنٹ";

/* ---------- block on the bill / ledger sheet ---------- */
let curAmount = 0, curSel = 0;
export function payBoxHtml() { return accts().length ? `<div class="pay-box" id="payBox" aria-live="polite"></div>` : ""; }
export async function fillPayBox(amount, sel) {
  const el = document.getElementById("payBox"); if (!el) return;
  const list = accts(); if (!list.length) { el.remove(); return; }
  curAmount = amount; curSel = Math.min(sel ?? curSel, list.length - 1);
  const a = list[curSel], { esc, fmt } = C;
  const q = await payQrImage(a, amount, 240);
  if (!document.getElementById("payBox")) return;
  el.innerHTML = `<div class="pay-h"><b>اسکین کر کے ادائیگی کریں</b><span class="pill">${fmt(amount)}</span></div>
    ${list.length > 1 ? `<div class="chips" role="tablist" aria-label="اکاؤنٹ چنیں">${list.map((x, i) => `<button type="button" class="chip" role="tab" data-paysel="${i}" aria-pressed="${i === curSel}">${esc(acctName(x))}</button>`).join("")}</div>` : ""}
    <div class="pay-body">${q ? `<img src="${q.src}" alt="${esc(acctName(a))} کا ادائیگی QR کوڈ" width="170" height="170">` : ""}
      <div class="pay-info"><div class="pay-t">${esc(acctName(a))} <span class="note">· ${esc(KINDS[a.kind]?.short || "")}</span></div>${detailRows(a, true)}
        <p class="note" style="margin:0">${q ? (q.withAmt ? `گاہک کسی بھی بینک یا JazzCash / Easypaisa ایپ سے اسکین کرے، رقم ${fmt(amount)} خود آ جائے گی۔` : `گاہک کسی بھی بینک یا موبائل اکاؤنٹ ایپ سے اسکین کر کے ${fmt(amount)} لکھے۔`) : "اس اکاؤنٹ کا QR نہیں لگا۔ گاہک اوپر والے نمبر پر رقم بھیج سکتا ہے۔"}</p></div></div>`;
}

/* ---------- PDF and WhatsApp ---------- */
export async function payPdfHtml(amount, compact) {
  const list = accts().slice(0, 3); if (!list.length) return "";
  const { esc, fmt } = C;
  const parts = await Promise.all(list.map(async a => { const q = await payQrImage(a, amount, 260); return `<div class="pd-pay1">${q ? `<img src="${q.src}" alt="">` : ""}<div><b>${esc(acctName(a))}</b>${detailRows(a, false)}</div></div>`; }));
  if (compact) return `<div class="pd-pay sm"><div class="pd-pay-h">اسکین کر کے ادائیگی · <b>${fmt(amount)}</b></div><div class="pd-pay-row">${parts.join("")}</div></div>`;
  return `<div class="pd-pay"><div class="pd-pay-h">ادائیگی کے لیے کسی بھی بینک یا موبائل اکاؤنٹ ایپ سے اسکین کریں · <b>${fmt(amount)}</b></div><div class="pd-pay-row">${parts.join("")}</div></div>`;
}
export function payText() {
  const list = accts(); if (!list.length) return "";
  return "\n\n*ادائیگی کے لیے:*\n" + list.map(a => [acctName(a), a.holder && "ٹائٹل: " + a.holder, a.number && (a.kind === "raast" ? "راست / اکاؤنٹ: " : "نمبر: ") + ltr(a.number), a.iban && "IBAN: " + ltr(a.iban)].filter(Boolean).join("\n")).join("\n\n");
}

/* ---------- settings card (branches tab) ---------- */
export function payCardHtml() {
  const { S, esc } = C, list = accts();
  return `<section class="card" id="payCard"><div class="card-h"><h3>ادائیگی کے اکاؤنٹ (QR)</h3>${S.isOwner ? `<button class="btn sm primary" data-payedit="new">+ اکاؤنٹ</button>` : ""}</div>
    ${list.length ? `<div class="list">${list.map((a, i) => `<div class="row" ${S.isOwner ? `data-payedit="${i}" role="button" tabindex="0"` : `style="cursor:default"`}><div class="av">${a.qr || a.img ? "▦" : "#"}</div><div class="main"><div class="t">${esc(acctName(a))}</div><div class="s"><span dir="ltr">${esc(a.number || a.iban || "")}</span>${a.holder ? " · " + esc(a.holder) : ""}${a.qr || a.img ? " · QR لگا ہے" : " · QR نہیں"}</div></div></div>`).join("")}</div>`
      : `<div class="empty">${S.isOwner ? "دکان کا بینک، راست، JazzCash یا Easypaisa اکاؤنٹ شامل کریں۔ پھر ہر بل اور کھاتے پر ادائیگی کا QR آئے گا جسے گاہک کسی بھی ایپ سے اسکین کر کے رقم بھیج سکے گا۔" : "مالک نے ابھی کوئی ادائیگی اکاؤنٹ نہیں لگایا۔"}</div>`}
  </section>`;
}
let draft = null;
function sheetPayAcct(idx) {
  const { esc, openSheet } = C, list = accts();
  const isNew = idx === "new"; const a = isNew ? { kind: "raast", amt: true } : { ...list[idx] };
  draft = { idx, qr: a.qr || "", img: a.img || "" };
  openSheet(isNew ? "نیا ادائیگی اکاؤنٹ" : "ادائیگی اکاؤنٹ", `<form class="f" data-form="payacct">
    <div class="fld"><label>قسم</label><div class="chips">${Object.entries(KINDS).map(([k, v]) => `<label class="chip"><input type="radio" name="kind" value="${k}" ${a.kind === k ? "checked" : ""} style="accent-color:var(--brand)"> ${v.name}</label>`).join("")}</div></div>
    <div class="fld"><label for="pTitle">نام (جو گاہک کو نظر آئے)</label><input id="pTitle" name="title" value="${esc(a.title || "")}" placeholder="مثلاً میزان بینک، JazzCash"></div>
    <div class="fld"><label for="pHolder">اکاؤنٹ ٹائٹل</label><input id="pHolder" name="holder" value="${esc(a.holder || "")}" placeholder="جس نام پر اکاؤنٹ ہے"></div>
    <div class="fld"><label for="pNum">موبائل نمبر / راست ID / اکاؤنٹ نمبر</label><input id="pNum" name="number" dir="ltr" inputmode="numeric" value="${esc(a.number || "")}" placeholder="03001234567"></div>
    <div class="fld"><label for="pIban">IBAN (اختیاری)</label><input id="pIban" name="iban" dir="ltr" value="${esc(a.iban || "")}" placeholder="PK36MEZN0000000000000000" style="text-transform:uppercase"></div>
    <div class="fld"><label>اکاؤنٹ کا QR کوڈ</label>
      <p class="note" style="margin:0">اپنی بینک، JazzCash یا Easypaisa ایپ میں "My QR / Raast QR / رقم وصول کریں" کھولیں، اس کا اسکرین شاٹ لیں اور یہاں لگائیں۔</p>
      <div id="pQrPrev" class="pay-prev"></div>
      <div class="chips"><label class="btn sm" for="pQrFile" style="cursor:pointer">تصویر / اسکرین شاٹ چنیں</label><button type="button" class="btn ghost sm" data-payqrclear ${draft.qr || draft.img ? "" : "hidden"}>QR ہٹائیں</button></div>
      <input type="file" id="pQrFile" accept="image/*" hidden></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="amt" ${a.amt !== false ? "checked" : ""}> بل کی رقم QR میں خود شامل کریں</label>
    <p class="note" style="margin:0">اگر کسی ایپ میں رقم والا QR نہ چلے تو یہ نشان ہٹا دیں، پھر گاہک رقم خود لکھے گا۔</p>
    <div class="actions">${!isNew ? `<button type="button" class="btn danger" data-paydel>حذف کریں</button>` : ""}<button type="button" class="btn" data-close>منسوخ</button><button class="btn primary">محفوظ کریں</button></div></form>`);
  showPrev();
}
async function showPrev(msg) {
  const el = document.getElementById("pQrPrev"); if (!el) return;
  const clr = document.querySelector("[data-payqrclear]"); if (clr) clr.hidden = !(draft.qr || draft.img);
  if (draft.qr) {
    const u = await qrDataUrl(draft.qr, 160);
    el.innerHTML = `<img src="${u}" alt="QR" width="120" height="120"><div class="note">${msg || ""}${isEmv(draft.qr) ? "QR پڑھ لیا گیا ✓ بینک / راست ادائیگی کا کوڈ ہے، بل کی رقم اس میں ڈالی جا سکتی ہے۔" : "QR پڑھ لیا گیا ✓ (رقم گاہک خود لکھے گا)"}</div>`;
  } else if (draft.img) {
    el.innerHTML = `<img src="${draft.img}" alt="QR" width="120"><div class="note">${msg || "QR کی تصویر لگی ہے۔"}</div>`;
  } else el.innerHTML = msg ? `<div class="note">${msg}</div>` : "";
}
function savePay(form) {
  const { toast, closeSheet, render, savePayAccounts } = C;
  const fd = new FormData(form), list = accts().slice();
  const a = { kind: fd.get("kind") || "raast", title: String(fd.get("title") || "").trim(), holder: String(fd.get("holder") || "").trim(), number: String(fd.get("number") || "").replace(/[^\d+]/g, ""), iban: String(fd.get("iban") || "").replace(/\s/g, "").toUpperCase(), amt: !!fd.get("amt") };
  if (draft.qr) a.qr = draft.qr; else if (draft.img) a.img = draft.img;
  if (!a.number && !a.iban && !a.qr && !a.img) { toast("نمبر، IBAN یا QR میں سے کچھ تو لکھیں"); return; }
  if (draft.idx === "new") list.push(a); else list[draft.idx] = a;
  commit(list); closeSheet(); render(); toast("اکاؤنٹ محفوظ");
}
function commit(list) {
  setPayAccounts(list);
  C.savePayAccounts(list).catch(() => C.toast("سرور پر محفوظ نہیں ہوا — صرف مالک اکاؤنٹ بدل سکتا ہے"));
}

/* ---------- events ---------- */
export function bindPayEvents() {
  document.addEventListener("click", async ev => {
    const t = ev.target.closest("[data-paysel],[data-payedit],[data-paycopy],[data-payqrclear],[data-paydel]"); if (!t) return;
    if (t.dataset.paysel !== undefined) { fillPayBox(curAmount, Number(t.dataset.paysel)); return; }
    if (t.dataset.payedit !== undefined) { if (C.S.isOwner) sheetPayAcct(t.dataset.payedit === "new" ? "new" : Number(t.dataset.payedit)); return; }
    if (t.dataset.paycopy !== undefined) { try { await navigator.clipboard.writeText(t.dataset.paycopy); C.toast("کاپی ہو گیا"); } catch (e) { C.toast(t.dataset.paycopy); } return; }
    if (t.dataset.payqrclear !== undefined) { draft.qr = ""; draft.img = ""; showPrev(); return; }
    if (t.dataset.paydel !== undefined) {
      if (!t.dataset.sure) { t.dataset.sure = "1"; t.textContent = "پکا حذف کریں؟"; return; }
      const list = accts().slice(); list.splice(draft.idx, 1); commit(list); C.closeSheet(); C.render(); C.toast("اکاؤنٹ حذف");
    }
  });
  document.addEventListener("keydown", ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches(".row[data-payedit]")) { ev.preventDefault(); ev.target.click(); } });
  document.addEventListener("change", async ev => {
    const t = ev.target; if (t.id !== "pQrFile" || !t.files || !t.files[0]) return;
    const f = t.files[0]; t.value = ""; showPrev("پڑھ رہا ہے…");
    try {
      const txt = await decodeQr(f);
      if (txt) { draft.qr = txt; draft.img = ""; showPrev(); }
      else { draft.qr = ""; draft.img = await smallImage(f); showPrev("QR پڑھا نہیں جا سکا، اس لیے تصویر ویسے ہی لگا دی ہے۔ بہتر ہے صاف اسکرین شاٹ لگائیں۔"); }
    } catch (e) { console.error(e); showPrev("یہ تصویر نہیں کھل سکی۔"); }
  });
  document.addEventListener("submit", ev => { const f = ev.target; if (f.dataset && f.dataset.form === "payacct") { ev.preventDefault(); ev.stopImmediatePropagation(); savePay(f); } }, true);
}
