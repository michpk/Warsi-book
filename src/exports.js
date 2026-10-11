// Files people can keep or send: bill / ledger PDFs with QR codes, report as Excel or PDF.
// Heavy libraries are loaded only when a file is actually made.
import { saveBinary, isNative } from "./native.js";

export async function qrDataUrl(text, size = 220) {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#10241c", light: "#ffffff" } });
}

/* Render a block of HTML (always light, A4 width) into a multi-page PDF. */
export async function htmlToPdf(html, filename, opts = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const host = document.createElement("div");
  host.className = "pdf-page"; host.setAttribute("dir", "rtl"); host.setAttribute("lang", "ur");
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    rasterizeText(host);
    if (opts.layout) opts.layout(host, host.offsetWidth * 841.89 / 595.28);   // A4 page height in CSS px
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 794 });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const pageH = Math.floor(canvas.width * ph / pw);
    for (let y = 0, i = 0; y < canvas.height; y += pageH, i++) {
      if (i && canvas.height - y < 120) break;               // only bottom padding left: no empty last page
      const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = Math.min(pageH, canvas.height - y);
      slice.getContext("2d").drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (i) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pw, slice.height * pw / canvas.width);
    }
    if (opts.print && !isNative) return printBlob(pdf.output("blob"));
    const b64 = pdf.output("datauristring").split(",")[1];
    return await saveBinary(filename, b64, "application/pdf");
  } finally { host.remove(); }
}

/* Excel workbook from a list of sheets: [{name, rows:[[...],...], widths:[...]}] */
export async function sheetsToXlsx(sheets, filename) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    if (sh.widths) ws["!cols"] = sh.widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return await saveBinary(filename, b64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* Website: open the browser's print window for a PDF. Phones (app): the share sheet is used instead,
   where a PDF viewer or Drive offers "Print". */
function printBlob(blob) {
  const url = URL.createObjectURL(blob);
  const touch = window.matchMedia && matchMedia("(pointer:coarse)").matches;
  if (touch) { const w = window.open(url, "_blank"); if (!w) location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); return "printed"; }
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.src = url;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, "_blank"); } setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000); };
  document.body.appendChild(f);
  return "printed";
}

/* html2canvas draws text word by word (or letter by letter) at positions it measures itself. With Urdu
   and mixed Urdu/English text that goes wrong on some computers: spaces disappear from English names
   ("Mehboob Plaza" -> "MehboobPlaza") and Nastaliq letters drift apart. So before taking the picture,
   every single-line piece of text is drawn by the browser itself in one go onto a small canvas, which
   html2canvas then copies as an image. Text that wraps over several lines is left as it is. */
function rasterizeText(root) {
  const SCALE = 3;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
  const jobs = [];
  for (const n of nodes) {
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.letterSpacing !== "normal" && parseFloat(cs.letterSpacing) !== 0) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter(x => x.width > 0.5);
    if (rects.length !== 1) continue;
    jobs.push({ n, cs, r: rects[0] });
  }
  for (const { n, cs, r } of jobs) {
    let text = n.nodeValue.replace(/\s+/g, " ");
    if (cs.textTransform === "uppercase") text = text.toUpperCase();
    const lead = /^\s/.test(text), trail = /\s$/.test(text);
    const c = document.createElement("canvas");
    const P = Math.ceil(r.height * 0.6), W = r.width + 4;          // room for tall Urdu letters and dots
    c.width = Math.ceil(W * SCALE); c.height = Math.ceil((r.height + 2 * P) * SCALE);
    const g = c.getContext("2d"); g.scale(SCALE, SCALE);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const dir = cs.direction;
    g.direction = dir; g.textAlign = dir === "rtl" ? "right" : "left"; g.textBaseline = "alphabetic"; g.fillStyle = cs.color;
    const m = g.measureText("Hg\u0647");
    const asc = m.fontBoundingBoxAscent || r.height * 0.8, desc = m.fontBoundingBoxDescent || r.height * 0.2;
    const top = (r.height - asc - desc) / 2 + asc;
    // draw the text without its outer spaces, placed where the browser placed it
    const core = text.trim(), extra = Math.max(0, r.width - g.measureText(core).width);
    const startGap = extra < 1 ? 0 : lead ? (trail ? extra / 2 : extra) : 0;      // space before the text (logical start)
    g.fillText(core, dir === "rtl" ? 2 + r.width - startGap : 2 + startGap, P + top);
    c.style.cssText = `width:${W}px;height:${r.height + 2 * P}px;margin:${-P}px -2px;display:inline-block;vertical-align:${-((r.height - asc - desc) / 2 + desc)}px`;
    n.replaceWith(c);
  }
}
