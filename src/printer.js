// Receipts on a Bluetooth thermal printer (58 or 80 mm, ESC/POS). Urdu is drawn on a canvas and sent as an
// image, so it prints correctly on any printer — the printer's own fonts have no Urdu.
import { isNative } from "./native.js";

const KEY = "wb_printer";
export function printerConf() {
  try { return { width: 58, auto: false, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; } catch (e) { return { width: 58, auto: false }; }
}
export function setPrinterConf(c) { try { localStorage.setItem(KEY, JSON.stringify({ ...printerConf(), ...c })); } catch (e) {} }

export async function listPrinters() {
  const { WbPrint } = await import("wb-print");
  const r = await WbPrint.list();
  return r.devices || [];
}
export function btErrText(e) {
  const c = String((e && e.code) || ""), m = String((e && e.message) || e || "");
  if (c === "OFF") return "فون کا بلوٹوتھ بند ہے، اسے آن کریں";
  if (c === "DENIED") return "بلوٹوتھ کی اجازت نہیں ملی (فون کی سیٹنگ › ایپس › وارثی بک › اجازتیں)";
  if (c === "NOBT") return "اس فون میں بلوٹوتھ نہیں";
  if (/connect|socket|read failed|timeout/i.test(m)) return "پرنٹر سے رابطہ نہیں ہوا — پرنٹر آن ہے؟ قریب ہے؟ کسی اور فون سے جڑا تو نہیں؟";
  return "پرنٹ نہیں ہو سکا" + (m ? " (" + m + ")" : "");
}

/* ---------- drawing the receipt ---------- */
const FONT = '"Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, sans-serif';
const NUM = '"IBM Plex Mono", "Roboto Mono", monospace';
/* doc: {title, sub[], meta[[k,v]], lines:[{name, qty, unit, price, amount}], totals:[[k,v,bold]], foot[], qr?: dataUrl} */
export async function receiptCanvas(doc, widthMm = 58) {
  try { await (document.fonts && document.fonts.ready); } catch (e) {}
  const W = widthMm >= 80 ? 576 : 384, k = W / 384, pad = Math.round(6 * k);
  const c = document.createElement("canvas"); c.width = W; c.height = 6000;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, c.height); g.fillStyle = "#000"; g.textBaseline = "top";
  let y = Math.round(8 * k);
  const font = (px, w = 400, fam = FONT) => { g.font = `${w} ${Math.round(px * k)}px ${fam}`; };
  const wrap = (t, maxW) => {
    const words = String(t || "").split(/\s+/), out = []; let cur = "";
    for (const w of words) { const n = cur ? cur + " " + w : w; if (g.measureText(n).width > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
    if (cur) out.push(cur); return out.length ? out : [""];
  };
  const text = (t, x, align, px, w, fam, dir = "rtl") => { font(px, w, fam); g.direction = dir; g.textAlign = align; g.fillText(t, x, y); };
  const centre = (t, px, w = 400) => { font(px, w); g.direction = "rtl"; g.textAlign = "center"; for (const l of wrap(t, W - 2 * pad)) { g.fillText(l, W / 2, y); y += Math.round(px * 1.55 * k); } };
  const rule = (dash = true) => { g.save(); g.strokeStyle = "#000"; g.lineWidth = Math.max(1, Math.round(1.4 * k)); if (dash) g.setLineDash([6 * k, 4 * k]); g.beginPath(); g.moveTo(pad, y + 4 * k); g.lineTo(W - pad, y + 4 * k); g.stroke(); g.restore(); y += Math.round(12 * k); };
  const urdu = t => /[\u0600-\u06FF]/.test(String(t));
  const kv = (kk, v, px = 16, w = 400) => { text(kk, W - pad, "right", px, w); if (urdu(v)) text(v, pad, "left", px, 600, FONT, "rtl"); else text(v, pad, "left", px, w === 400 ? 500 : 700, NUM, "ltr"); y += Math.round(px * 1.6 * k); };

  centre(doc.title || "", 26, 700);
  for (const s of doc.sub || []) centre(s, 14);
  y += 2 * k; rule(false);
  for (const [a, b] of doc.meta || []) kv(a, b, 15);
  if ((doc.lines || []).length) {
    rule();
    for (const l of doc.lines) {
      font(16, 600); g.direction = "rtl"; g.textAlign = "right";
      for (const part of wrap(l.name, W - 2 * pad)) { g.fillText(part, W - pad, y); y += Math.round(16 * 1.5 * k); }
      // "10 فٹ × 120": quantity and unit read right to left, then the rate
      const qs = `${l.qty}${l.unit ? " " + l.unit : ""}`;
      text(qs, W - pad, "right", 14, 400, FONT, "rtl");
      const qw = g.measureText(qs).width;
      text(`${l.price} ×`, W - pad - qw - 6 * k, "right", 14, 400, NUM, "ltr");
      text(String(l.amount), pad, "left", 16, 700, NUM, "ltr");
      y += Math.round(16 * 1.7 * k);
    }
  }
  rule();
  for (const [a, b, bold] of doc.totals || []) kv(a, b, bold ? 20 : 16, bold ? 700 : 400);
  if (doc.qr) {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = doc.qr; });
    if (img) { const s = Math.round(150 * k); y += 6 * k; g.imageSmoothingEnabled = false; g.drawImage(img, (W - s) / 2, y, s, s); y += s + 4 * k; }
  }
  if ((doc.foot || []).length) { rule(); for (const f of doc.foot) centre(f, 14); }
  y += Math.round(10 * k);
  const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y);
  const o = out.getContext("2d"); o.fillStyle = "#fff"; o.fillRect(0, 0, W, out.height); o.drawImage(c, 0, 0);
  return out;
}

/* ---------- canvas → ESC/POS bytes ---------- */
export function escposFromCanvas(cv) {
  const W = cv.width, H = cv.height, bw = Math.ceil(W / 8);
  const px = cv.getContext("2d").getImageData(0, 0, W, H).data;
  const out = [0x1b, 0x40];            // initialise
  const BAND = 120;                    // print in bands so small printer buffers keep up
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const h = Math.min(BAND, H - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8);
    for (let y = y0; y < y0 + h; y++) for (let bx = 0; bx < bw; bx++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit; if (x >= W) continue;
        const i = (y * W + x) * 4, lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        if (lum < 150 && px[i + 3] > 100) b |= 0x80 >> bit;
      }
      out.push(b);
    }
  }
  out.push(0x1b, 0x64, 0x04);           // feed 4 lines
  out.push(0x1d, 0x56, 0x42, 0x00);     // cut (ignored by printers without a cutter)
  return new Uint8Array(out);
}
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/* print a receipt: Bluetooth printer in the app, the normal print window on the website */
export async function printReceipt(doc) {
  const conf = printerConf(), cv = await receiptCanvas(doc, conf.width);
  if (isNative) {
    if (!conf.address) throw Object.assign(new Error("no printer"), { code: "NOPRINTER" });
    const { WbPrint } = await import("wb-print");
    await WbPrint.print({ address: conf.address, data: b64(escposFromCanvas(cv)) });
    return "bt";
  }
  const url = cv.toDataURL("image/png"), w = window.open("", "_blank");
  if (!w) throw new Error("popup blocked");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>رسید</title><style>@page{size:${conf.width}mm auto;margin:0}body{margin:0}img{width:${conf.width}mm;display:block}</style></head><body><img src="${url}" onload="setTimeout(()=>{print();},150)"></body></html>`);
  w.document.close();
  return "web";
}
