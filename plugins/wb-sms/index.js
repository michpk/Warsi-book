import { registerPlugin } from "@capacitor/core";
// send({to, text}) -> {parts}; checkPermissions() / requestPermissions() -> {sms: "granted"|"denied"|"prompt"}
export const WbSms = registerPlugin("WbSms");
