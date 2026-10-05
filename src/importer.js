// Reads a list of customers / suppliers from an Excel, CSV or PDF file.
// Returns rows like {name, phone, kind, balance, address} for the user to review before saving.

const H = {
  name: ["نام", "name", "customer", "گاہک", "سپلائر", "party", "naam"],
  phone: ["فون", "موبائل", "نمبر", "phone", "mobile", "cell", "contact", "number"],
  kind: ["قسم", "type", "kind"],
  balance: ["بقایا", "رقم", "balance", "amount", "due", "باقی", "ادھار"],
  address: ["پتہ", "address", "city", "شہر"]
};
const norm = s => String(s ?? "").trim();
const toNum = v => { const n = parseFloat(String(v ?? "").replace(/[,\s]|Rs\.?/gi, "")); return isFinite(n) ? n : 0; };
const phoneRe = /(\+?92[\s-]?3\d{2}[\s-]?\d{7}|03\d{2}[\s-]?\d{7}|\b3\d{9}\b)/;
export function cleanPhone(p) {
  let n = String(p || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+92")) n = "0" + n.slice(3); else if (n.startsWith("0092")) n = "0" + n.slice(4); else if (/^92\d{10}$/.test(n)) n = "0" + n.slice(2); else if (/^3\d{9}$/.test(n)) n = "0" + n;
  return n;
}
function kindOf(v, def) {
  const s = norm(v).toLowerCase();
  if (!s) return def;
  if (/سپلائر|supplier|vendor|seller/.test(s)) return "supplier";
  if (/گاہک|customer|client|buyer/.test(s)) return "customer";
  return def;
}

/* ---- Excel / CSV ---- */
export async function readSheet(file, defKind) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false });
    if (!rows.length) continue;
    // find the header row among the first 5 rows
    let hi = -1, map = {};
    for (let i = 0; i < Math.min(5, rows.length) && hi < 0; i++) {
      const m = {};
      rows[i].forEach((c, j) => { const t = norm(c).toLowerCase(); for (const [k, keys] of Object.entries(H)) if (m[k] == null && keys.some(x => t.includes(x))) m[k] = j; });
      if (m.name != null) { hi = i; map = m; }
    }
    if (hi < 0) { // no headers: guess name = first text column, phone = column with phone numbers, balance = numeric column
      map = { name: 0 };
      const sample = rows.slice(0, 10);
      const ncol = Math.max(...sample.map(r => r.length));
      for (let j = 0; j < ncol; j++) {
        const vals = sample.map(r => norm(r[j])).filter(Boolean);
        if (vals.length && vals.every(v => phoneRe.test(v))) map.phone = j;
        else if (vals.length && vals.every(v => /^-?[\d,]+(\.\d+)?$/.test(v.replace(/Rs\.?\s*/i, ""))) && map.balance == null) map.balance = j;
      }
    }
    for (const r of rows.slice(hi + 1)) {
      const name = norm(r[map.name]); if (!name) continue;
      out.push({ name, phone: cleanPhone(map.phone != null ? r[map.phone] : ""), kind: kindOf(map.kind != null ? r[map.kind] : "", defKind), balance: map.balance != null ? toNum(r[map.balance]) : 0, address: map.address != null ? norm(r[map.address]) : "" });
    }
  }
  return out;
}

/* ---- PDF: read text lines, find phone numbers and amounts on each line ---- */
export async function readPdf(file, defKind) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = new Map();
    for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const y = Math.round(it.transform[5] / 3); if (!lines.has(y)) lines.set(y, []); lines.get(y).push({ x: it.transform[4], s: it.str }); }
    for (const [, parts] of [...lines.entries()].sort((a, b) => b[0] - a[0])) {
      const text = parts.sort((a, b) => b.x - a.x).map(t => t.s).join(" ").replace(/\s+/g, " ").trim();
      const pm = text.match(phoneRe);
      let rest = pm ? text.replace(pm[0], " ") : text;
      const nums = [...rest.matchAll(/-?\d[\d,]*(\.\d+)?/g)].map(m => m[0]);
      const amt = nums.length ? toNum(nums[nums.length - 1]) : 0;
      rest = rest.replace(/-?\d[\d,]*(\.\d+)?/g, " ").replace(/Rs\.?|روپے|[|:#•\-–]/gi, " ").replace(/\s+/g, " ").trim();
      if (!pm && !amt) continue;                       // skip headings and lines without data
      if (!/[\p{L}]{2,}/u.test(rest)) continue;
      if (Object.values(H).flat().some(h => rest.toLowerCase() === h)) continue;
      if (/^(total|grand total|sub ?total|کل|ٹوٹل|میزان|کل رقم)$/i.test(rest)) continue;
      out.push({ name: rest.slice(0, 60), phone: pm ? cleanPhone(pm[0]) : "", kind: kindOf(rest, defKind), balance: amt, address: "" });
    }
  }
  return out;
}

/* ---- template people can fill ---- */
export async function templateXlsx() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  const ws = XLSX.utils.aoa_to_sheet([["نام", "فون", "قسم", "پرانا بقایا", "پتہ"], ["احمد کنسٹرکشن", "03001234567", "گاہک", 25000, "مین بازار"], ["علی ٹریڈرز", "03017654321", "سپلائر", 60000, "لاہور"]]);
  ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, "کھاتے");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}
