// Files people can keep or send: bill / ledger PDFs with QR codes, report as Excel or PDF.
// Heavy libraries are loaded only when a file is actually made.
import { saveBinary } from "./native.js";

export async function qrDataUrl(text, size = 220) {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#10241c", light: "#ffffff" } });
}

/* Render a block of HTML (always light, A4 width) into a multi-page PDF. */
export async function htmlToPdf(html, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const host = document.createElement("div");
  host.className = "pdf-page"; host.setAttribute("dir", "rtl"); host.setAttribute("lang", "ur");
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 794 });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const pageH = Math.floor(canvas.width * ph / pw);
    for (let y = 0, i = 0; y < canvas.height; y += pageH, i++) {
      const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = Math.min(pageH, canvas.height - y);
      slice.getContext("2d").drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (i) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pw, slice.height * pw / canvas.width);
    }
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
