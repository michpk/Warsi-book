package com.warsi.sms;

import android.Manifest;
import android.os.Build;
import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/* Sends an SMS from the phone's own SIM, without opening the messages app (for payment reminders). */
@CapacitorPlugin(name = "WbSms", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) })
public class WbSmsPlugin extends Plugin {

    @PluginMethod
    public void send(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermCallback");
            return;
        }
        doSend(call);
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) doSend(call);
        else call.reject("SMS permission denied", "DENIED");
    }

    private void doSend(PluginCall call) {
        String to = call.getString("to"), text = call.getString("text");
        if (to == null || to.isEmpty() || text == null || text.isEmpty()) { call.reject("number or text missing"); return; }
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(text);
            if (parts.size() > 1) sm.sendMultipartTextMessage(to, null, parts, null, null);
            else sm.sendTextMessage(to, null, text, null, null);
            JSObject r = new JSObject();
            r.put("parts", parts.size());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "send failed" : e.getMessage());
        }
    }
}
