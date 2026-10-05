// Phone-only features (contacts, saving files). On the website these fall back to browser behaviour.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();

export async function pickPhoneContact() {
  const { Contacts } = await import("@capacitor-community/contacts");
  const perm = await Contacts.requestPermissions();
  if (perm.contacts !== "granted" && perm.contacts !== "limited") throw new Error("denied");
  const r = await Contacts.pickContact({ projection: { name: true, phones: true } });
  const c = r && r.contact;
  if (!c) return null;
  return { name: (c.name && (c.name.display || [c.name.given, c.name.family].filter(Boolean).join(" "))) || "", phone: ((c.phones || [])[0] || {}).number || "" };
}

export async function saveFile(filename, text, mime) {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri, dialogTitle: "فائل بھیجیں یا محفوظ کریں" });
    return;
  }
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Open WhatsApp with a ready message. Pakistani numbers like 0300-1234567 become 923001234567.
export function openWhatsApp(phone, text) {
  let n = String(phone || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0")) n = "92" + n.slice(1);
  else if (n.length === 10 && n.startsWith("3")) n = "92" + n;
  const url = "https://wa.me/" + n + "?text=" + encodeURIComponent(text);
  if (isNative) window.location.href = url;          // Android hands wa.me links to the WhatsApp app
  else window.open(url, "_blank", "noopener");
}

// Open the phone's SMS app with the number and message filled in.
export function openSMS(phone, text) {
  const n = String(phone || "").replace(/[^\d+]/g, "");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = "sms:" + n + (ios ? "&" : "?") + "body=" + encodeURIComponent(text.replace(/\*/g, ""));
  window.location.href = url;
}

// Save or share a photo (data: URL).
export async function saveImage(filename, dataUrl) {
  if (isNative) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const res = await Filesystem.writeFile({ path: filename, data: dataUrl.split(",")[1], directory: Directory.Cache });
    await Share.share({ title: filename, url: res.uri, dialogTitle: "تصویر بھیجیں یا محفوظ کریں" });
    return;
  }
  const a = document.createElement("a"); a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// Shrink a photo so a bill stays readable but the file stays small (well under Firestore's 1 MB limit).
export function compressImage(file, maxSide = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img; const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = 0.7, out = c.toDataURL("image/jpeg", q);
      while (out.length > 650000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}
