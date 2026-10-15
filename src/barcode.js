// Barcodes in the shop: codes on items, scanning into bills / purchases, stock counting and printing labels.
import { initKeyboardScanner, openCamera, closeCamera, beep, newShopCode, labelsPdf } from "./scan.js";

let C = null;   // context from main.js
export function initBarcode(ctx) { C = ctx; initKeyboardScanner(code => handleScan(code, "key")); bindEvents(); }

const CAMI = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>';
export const SCAN_ICON = CAMI;

/* ---------- codes on items ---------- */
export function codesOf(it) {
  const out = [];
  for (const x of (it && it.codes) || []) if (x && x.c) out.push({ c: String(x.c), n: Number(x.n) > 0 ? Number(x.n) : 1 });
  if (it && it.code && !out.some(x => x.c === String(it.code))) out.push({ c: String(it.code), n: 1 });
  return out;
}
const clean = c => String(c || "").trim().replace(/\s+/g, "");
export function findCode(code) {
  code = clean(code); if (!code) return null;
  for (const it of C.S.items) for (const x of codesOf(it)) if (x.c === code) return { it, n: x.n };
  // EAN-13 with a leading 0 is the same product as its 12-digit UPC-A
  if (/^0\d{12}$/.test(code)) return findCode(code.slice(1));
  return null;
}
export const allCodes = () => new Set(C.S.items.flatMap(it => codesOf(it).map(x => x.c)));

/* ---------- what a scan does depends on where you are ---------- */
let countSession = null;            // stock count in progress
let codeTarget = null;              // item form waiting for a code
export function handleScan(raw, src) {
  const code = clean(raw); if (!code) return;
  const { S } = C;
  if (codeTarget) { const t = codeTarget; t(code); return "بارکوڈ لگ گیا"; }
  if (countSession && document.getElementById("cntRows")) return countScan(code);
  const hit = findCode(code);
  if (!hit) {
    if (src === "key" && document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.activeElement.closest("#main")) return;
    beep(false); closeCamera(); sheetUnknown(code); return "یہ بارکوڈ کسی چیز سے جڑا نہیں";
  }
  if (S.tab === "sale" && S.canWrite) {
    if (S.billMode === "purchase") { C.addPurchLine(hit.it, 1); return `✓ ${hit.it.name} — خریداری میں`; }
    C.addSaleLine(hit.it, hit.n); const l = S.cart.find(x => x.item === hit.it.id);
    return `✓ ${hit.it.name} — تعداد ${C.fq(l ? l.qty : hit.n)}`;
  }
  if (src === "key") beep(true);
  closeCamera(); sheetQuick(hit.it, hit.n); return hit.it.name;
}

/* ---------- scan buttons ---------- */
export function scanBtn(label = "اسکین") { return `<button type="button" class="btn scan-btn" data-scan="go" aria-label="کیمرے سے بارکوڈ اسکین کریں">${CAMI}<span>${label}</span></button>`; }
function startCameraForContext() {
  const { S } = C;
  const bill = S.tab === "sale";
  openCamera({ title: bill ? (S.billMode === "purchase" ? "خریداری میں اسکین" : "بل میں اسکین") : "چیز اسکین کریں", continuous: bill, hint: bill ? "ایک ایک کر کے چیزیں اسکین کرتے جائیں، ہر بار بل میں جڑ جائے گی" : "", onCode: c => handleScan(c, "cam") });
}

/* ---------- item form: list of codes ---------- */
export function itemCodesHtml(it) {
  const rows = codesOf(it);
  return `<div class="code-box"><div class="code-h"><span class="lbl-sm">بارکوڈ</span><span class="note">کمپنی کا بارکوڈ اسکین کریں، یا خالی چھوڑیں، اسٹیکر چھاپتے وقت اپنا کوڈ بن جائے گا۔</span></div>
    <div id="codeRows">${rows.map(codeRow).join("")}</div>
    <div class="code-add"><input id="codeNew" dir="ltr" inputmode="numeric" placeholder="بارکوڈ نمبر" autocomplete="off" aria-label="نیا بارکوڈ"><button type="button" class="btn sm" data-code="scan">${CAMI} اسکین</button><button type="button" class="btn sm" data-code="add">+ شامل</button></div></div>`;
}
const codeRow = x => `<div class="code-row" data-code-row="${C.esc(x.c)}"><span class="num">${C.esc(x.c)}</span><label class="note">ایک اسکین = <input class="num" data-code-n inputmode="decimal" value="${x.n}" aria-label="ایک اسکین میں کتنے یونٹ"> یونٹ</label><button type="button" class="btn ghost sm" data-code="del" aria-label="ہٹائیں">×</button></div>`;
export function collectCodes() {
  return [...document.querySelectorAll("#codeRows [data-code-row]")].map(r => ({ c: r.dataset.codeRow, n: Number(r.querySelector("[data-code-n]").value) || 1 }));
}
function addCodeRow(code, editId) {
  code = clean(code); if (!code) return;
  const box = document.getElementById("codeRows"); if (!box) return;
  if (box.querySelector(`[data-code-row="${CSS.escape(code)}"]`)) { C.toast("یہ بارکوڈ پہلے سے لگا ہے"); return; }
  const other = findCode(code);
  if (other && other.it.id !== editId) { beep(false); C.toast(`یہ بارکوڈ پہلے "${other.it.name}" پر لگا ہے`); return; }
  box.insertAdjacentHTML("beforeend", codeRow({ c: code, n: 1 }));
  const inp = document.getElementById("codeNew"); if (inp) inp.value = "";
}

/* ---------- unknown code ---------- */
function sheetUnknown(code) {
  const { S, esc, openSheet } = C;
  openSheet("نیا بارکوڈ", `<div class="bal-box zero"><div><div class="note">یہ بارکوڈ ابھی کسی چیز سے جڑا نہیں</div><div class="v num" style="font-size:22px">${esc(code)}</div></div></div>
    ${S.canWrite ? `<div class="actions" style="margin-top:12px;justify-content:stretch;flex-direction:column">
      <button class="btn primary" data-unk="new" data-c="${esc(code)}">+ اس بارکوڈ سے نئی چیز بنائیں</button></div>
      <div class="fld" style="margin-top:12px"><label for="unkPick">یا کسی پرانی چیز سے جوڑیں</label><input id="unkPick" list="unkList" placeholder="چیز کا نام لکھیں" autocomplete="off">
      <datalist id="unkList">${S.items.map(it => `<option value="${esc(it.name)}">`).join("")}</datalist></div>
      <div class="actions"><button class="btn" data-close>رہنے دیں</button><button class="btn primary" data-unk="link" data-c="${esc(code)}">جوڑیں</button></div>` : `<p class="note">نئی چیز صرف وہ بنا سکتا ہے جسے لکھنے کی اجازت ہو۔</p>`}`);
}

/* ---------- quick look after scanning outside the bill ---------- */
function sheetQuick(it, n) {
  const { S, esc, fq, openSheet, stockOf, branchName } = C;
  const b = S.branch;
  openSheet(it.name, `<div class="bal-box zero"><div><div class="note">${b === "all" ? "کل اسٹاک" : "اسٹاک · " + esc(branchName(b))}</div><div class="v num">${fq(stockOf(it, b))} ${esc(it.unit || "")}</div></div><div class="note">فروخت <span class="num">Rs ${fq(it.sale)}</span><br>خرید <span class="num">Rs ${fq(it.buyCost ?? it.cost)}</span></div></div>
    ${n > 1 ? `<p class="note">یہ بارکوڈ ${fq(n)} ${esc(it.unit || "")} کا ہے (ڈبہ / پیکٹ)۔</p>` : ""}
    ${S.canWrite ? `<div class="actions" style="margin-top:12px"><button class="btn primary" data-quick="sale" data-id="${esc(it.id)}" data-n="${n}">بل میں ڈالیں</button><button class="btn" data-quick="purchase" data-id="${esc(it.id)}">خریداری میں ڈالیں</button><button class="btn" data-quick="open" data-id="${esc(it.id)}">پوری تفصیل</button></div>` : ""}`);
}

/* ---------- stock count ---------- */
export function sheetCount() {
  const { S, esc, openSheet, branchOptions, defBranch } = C;
  if (!countSession) countSession = { branch: S.branch !== "all" ? S.branch : defBranch(), lines: {} };
  openSheet("اسٹاک گنتی", `<p class="note" style="margin-top:0">ریک پر جا کر ہر چیز اسکین کرتے جائیں (کیمرے یا اسکینر سے)۔ ہر اسکین پر گنتی ایک بڑھے گی، تعداد خود بھی لکھ سکتے ہیں۔ آخر میں "اسٹاک درست کریں" دبائیں تو صرف گنی ہوئی چیزوں کا اسٹاک اصل گنتی کے برابر ہو جائے گا۔</p>
    <div class="two"><div class="fld"><label for="cntBranch">برانچ</label><select id="cntBranch">${branchOptions(countSession.branch)}</select></div>
    <div class="fld"><span class="lbl-sm">اسکین</span>${scanBtn("کیمرہ کھولیں")}</div></div>
    <div class="fld"><label for="cntPick">یا نام سے چیز ڈالیں</label><input id="cntPick" list="cntList" autocomplete="off" placeholder="چیز کا نام"><datalist id="cntList">${S.items.map(it => `<option value="${esc(it.name)}">`).join("")}</datalist></div>
    <div id="cntRows"></div>
    <div class="actions"><button class="btn" data-cnt="cancel">گنتی ختم (بغیر تبدیلی)</button><button class="btn primary" data-cnt="save">اسٹاک درست کریں</button></div>`);
  renderCount();
}
function countScan(code) {
  const hit = findCode(code);
  if (!hit) { beep(false); C.toast("یہ بارکوڈ کسی چیز سے جڑا نہیں: " + code); return "نامعلوم بارکوڈ: " + code; }
  const l = countSession.lines[hit.it.id] || (countSession.lines[hit.it.id] = { q: 0 });
  l.q = Math.round((l.q + hit.n) * 1000) / 1000; renderCount();
  return `✓ ${hit.it.name} — گنتی ${C.fq(l.q)}`;
}
function renderCount() {
  const box = document.getElementById("cntRows"); if (!box || !countSession) return;
  const { S, esc, fq, stockOf } = C, ids = Object.keys(countSession.lines);
  box.innerHTML = ids.length ? `<div class="tbl-wrap card" style="box-shadow:none"><table><thead><tr><th>چیز</th><th class="n">ایپ میں</th><th class="n">گنتی</th><th class="n">فرق</th></tr></thead><tbody>
    ${ids.map(id => { const it = S.items.find(x => x.id === id); if (!it) return ""; const sys = stockOf(it, countSession.branch), q = countSession.lines[id].q, d = Math.round((q - sys) * 1000) / 1000;
      return `<tr><td>${esc(it.name)}</td><td class="n num">${fq(sys)}</td><td class="n"><input class="num cnt-in" data-cntq="${esc(id)}" inputmode="decimal" value="${q}" aria-label="گنتی"></td><td class="n num ${d < 0 ? "c-owe" : d > 0 ? "c-pay" : ""}">${d > 0 ? "+" : ""}${fq(d)}</td></tr>`; }).join("")}</tbody></table></div>`
    : `<div class="empty">ابھی کچھ نہیں گنا۔ اسکین کرنا شروع کریں۔</div>`;
}
async function saveCount() {
  const { S, db, toast, closeSheet, stockOf, w } = C;
  const b = countSession.branch; if (!b) { toast("پہلے برانچ چنیں"); return; }
  const ops = [];
  for (const [id, l] of Object.entries(countSession.lines)) {
    const it = S.items.find(x => x.id === id); if (!it) continue;
    const d = Math.round((l.q - stockOf(it, b)) * 1000) / 1000;
    if (d) ops.push({ op: "stock", id, branch: b, delta: d, extra: { counted: Date.now() } });
  }
  if (!ops.length) { toast("سب کچھ پہلے سے برابر ہے"); countSession = null; closeSheet(); return; }
  const ok = await w(() => db.batch(ops));
  if (ok) { toast(`${ops.length} چیزوں کا اسٹاک درست ہو گیا`); countSession = null; closeSheet(); C.render(); }
}

/* ---------- labels ---------- */
let lblSel = null;
export function sheetLabels(ids) {
  const { S, esc, fq, openSheet } = C;
  lblSel = lblSel || {};
  if (ids) { lblSel = {}; for (const id of ids) lblSel[id] = 1; }
  const items = [...S.items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  openSheet("بارکوڈ اسٹیکر", `<p class="note" style="margin-top:0">جن چیزوں کے اسٹیکر چاہییں، انہیں چنیں اور تعداد لکھیں۔ جن پر بارکوڈ نہیں، ان کا اپنا کوڈ خود بن کر چیز میں محفوظ ہو جائے گا۔</p>
    <div class="two"><div class="fld"><label for="lblLayout">کاغذ</label><select id="lblLayout"><option value="a4">A4 اسٹیکر شیٹ (24 فی صفحہ)</option><option value="r5030">لیبل پرنٹر 50×30 mm</option><option value="r3825">لیبل پرنٹر 38×25 mm</option><option value="r4030">لیبل پرنٹر 40×30 mm</option></select></div>
    <div class="fld"><label for="lblQ">تلاش</label><input id="lblQ" type="search" placeholder="چیز کا نام" autocomplete="off"></div></div>
    <label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lblPrice" checked> اسٹیکر پر فروخت ریٹ بھی لکھیں</label>
    <div class="lbl-list" id="lblList">${items.map(it => { const has = codesOf(it).length; return `<label class="lbl-row" data-name="${esc((it.name || "").toLowerCase())}"><input type="checkbox" data-lbl="${esc(it.id)}" ${lblSel[it.id] ? "checked" : ""}><span class="main"><b>${esc(it.name)}</b><small class="note">${has ? `<span class="num">${esc(codesOf(it)[0].c)}</span>` : "ابھی بارکوڈ نہیں"} · Rs ${fq(it.sale)}</small></span><input class="num lbl-n" data-lbln="${esc(it.id)}" inputmode="numeric" value="${lblSel[it.id] || 1}" aria-label="کتنے اسٹیکر"></label>`; }).join("")}</div>
    <div class="actions"><span class="note" id="lblCount"></span><button class="btn" data-close>منسوخ</button><button class="btn primary" data-lblgo>اسٹیکر PDF بنائیں</button></div>`);
  countLbl();
}
function countLbl() { const n = Object.values(lblSel || {}).reduce((a, b) => a + (Number(b) || 0), 0), el = document.getElementById("lblCount"); if (el) el.textContent = n ? `${Object.keys(lblSel).length} چیزیں · ${n} اسٹیکر` : ""; }
async function makeLabels(btn) {
  const { S, db, toast, saveBinary, shopTitle } = C;
  const ids = Object.keys(lblSel || {}); if (!ids.length) { toast("پہلے چیزیں چنیں"); return; }
  btn.disabled = true; const lbl = btn.textContent; btn.textContent = "بن رہی ہے…";
  try {
    const taken = allCodes(), withPrice = document.getElementById("lblPrice").checked, lay = document.getElementById("lblLayout").value;
    const labels = [];
    for (const id of ids) {
      const it = S.items.find(x => x.id === id); if (!it) continue;
      let code = (codesOf(it)[0] || {}).c;
      if (!code) { code = newShopCode(taken); taken.add(code); db.update("items", id, { codes: [...codesOf(it), { c: code, n: 1 }] }); }
      labels.push({ name: it.name, price: withPrice ? Number(it.sale) || 0 : null, unit: it.unit, code, shop: shopTitle(), copies: Number(lblSel[id]) || 1 });
    }
    const size = { r5030: { w: 50, h: 30 }, r3825: { w: 38, h: 25 }, r4030: { w: 40, h: 30 } }[lay];
    const b64 = await labelsPdf(labels, size ? "roll" : "a4", size);
    const r = await saveBinary("barcode-labels.pdf", b64, "application/pdf");
    toast(r === "cancelled" ? "منسوخ" : "اسٹیکر کی PDF تیار");
  } catch (e) { console.error(e); toast("اسٹیکر نہیں بن سکے: " + (e && e.message || e)); }
  finally { btn.disabled = false; btn.textContent = lbl; }
}

/* ---------- events ---------- */
function bindEvents() {
  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-scan],[data-code],[data-unk],[data-quick],[data-cnt],[data-lblgo]"); if (!t) return;
    const ds = t.dataset, { S } = C;
    if (ds.scan) { countSession && document.getElementById("cntRows") ? openCamera({ title: "اسٹاک گنتی", continuous: true, hint: "ہر چیز اسکین کریں، گنتی خود بڑھتی جائے گی", onCode: c => countScan(c) }) : startCameraForContext(); return; }
    if (ds.code === "scan") {
      const form = t.closest("form"), editId = form && form.dataset.id;
      openCamera({ title: "چیز کا بارکوڈ", onCode: c => { addCodeRow(c, editId); } });
      return;
    }
    if (ds.code === "add") { const form = t.closest("form"); addCodeRow((document.getElementById("codeNew") || {}).value, form && form.dataset.id); return; }
    if (ds.code === "del") { t.closest("[data-code-row]").remove(); return; }
    if (ds.unk === "new") { C.closeSheet(); C.sheetItemForm({ codes: [{ c: ds.c, n: 1 }] }); return; }
    if (ds.unk === "link") {
      const name = (document.getElementById("unkPick") || {}).value || "", it = S.items.find(x => x.name === name.trim());
      if (!it) { C.toast("فہرست میں سے چیز چنیں"); return; }
      C.db.update("items", it.id, { codes: [...codesOf(it), { c: ds.c, n: 1 }] }); C.toast(`بارکوڈ "${it.name}" سے جڑ گیا`); C.closeSheet(); return;
    }
    if (ds.quick) {
      const it = S.items.find(x => x.id === ds.id); if (!it) return;
      if (ds.quick === "open") { C.sheetItem(it.id); return; }
      C.closeSheet(); S.tab = "sale"; S.billMode = ds.quick === "purchase" ? "purchase" : "sale";
      if (ds.quick === "purchase") C.addPurchLine(it, 1); else C.addSaleLine(it, Number(ds.n) || 1);
      C.render(); window.scrollTo(0, 0); return;
    }
    if (ds.cnt === "save") { saveCount(); return; }
    if (ds.cnt === "cancel") { countSession = null; C.closeSheet(); return; }
    if (ds.lblgo !== undefined) { makeLabels(t); return; }
  });
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.id === "cntBranch" && countSession) { countSession.branch = t.value; renderCount(); }
    if (t.id === "cntPick" && countSession) { const it = C.S.items.find(x => x.name === t.value.trim()); if (it) { countSession.lines[it.id] = countSession.lines[it.id] || { q: 0 }; t.value = ""; renderCount(); const i = document.querySelector(`[data-cntq="${CSS.escape(it.id)}"]`); if (i) { i.focus(); i.select(); } } }
    if (t.dataset && t.dataset.cntq && countSession) { countSession.lines[t.dataset.cntq].q = Number(t.value) || 0; renderCount(); }
    if (t.dataset && t.dataset.lbl !== undefined && lblSel) { if (t.checked) lblSel[t.dataset.lbl] = Number((document.querySelector(`[data-lbln="${CSS.escape(t.dataset.lbl)}"]`) || {}).value) || 1; else delete lblSel[t.dataset.lbl]; countLbl(); }
    if (t.dataset && t.dataset.lbln !== undefined && lblSel) { if (lblSel[t.dataset.lbln] !== undefined || Number(t.value) > 0) { lblSel[t.dataset.lbln] = Math.max(1, Number(t.value) || 1); const cb = document.querySelector(`[data-lbl="${CSS.escape(t.dataset.lbln)}"]`); if (cb) cb.checked = true; } countLbl(); }
  });
  document.addEventListener("input", ev => {
    const t = ev.target;
    if (t.id === "lblQ") { const q = t.value.trim().toLowerCase(); document.querySelectorAll("#lblList .lbl-row").forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); }); }
  });
  document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.id === "codeNew") { ev.preventDefault(); const form = ev.target.closest("form"); addCodeRow(ev.target.value, form && form.dataset.id); } });
  // item form open: a hand-held scan goes into the code list
  new MutationObserver(() => { codeTarget = document.getElementById("codeRows") ? (c => { const f = document.querySelector('form[data-form="item"]'); addCodeRow(c, f && f.dataset.id); }) : null; })
    .observe(document.getElementById("sheet"), { childList: true });
}
