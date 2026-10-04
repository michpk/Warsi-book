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
