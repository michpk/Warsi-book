import { registerPlugin } from "@capacitor/core";
// list() -> {devices:[{name,address}]} paired Bluetooth devices; print({address, data: base64 bytes}) -> {}
export const WbPrint = registerPlugin("WbPrint");
