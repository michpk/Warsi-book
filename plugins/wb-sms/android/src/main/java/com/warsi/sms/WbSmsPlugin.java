package com.warsi.sms;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/* Sends an SMS from the phone's own SIM, without opening the messages app (for payment reminders).
   The call only finishes when the phone reports that every part really left (or failed), so the app
   sends the next message after this one is done and shows the true result. */
@CapacitorPlugin(name = "WbSms", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) })
public class WbSmsPlugin extends Plugin {
    private static final long TIMEOUT_MS = 180000; // the phone may first ask "allow many messages?"

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

    private void doSend(final PluginCall call) {
        String to = call.getString("to"), text = call.getString("text");
        if (to == null || to.isEmpty() || text == null || text.isEmpty()) { call.reject("number or text missing", "EMPTY"); return; }
        final Context ctx = getContext();
        final SmsManager sm;
        final ArrayList<String> parts;
        try {
            sm = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
            parts = sm.divideMessage(text);
        } catch (Exception e) { call.reject(e.getMessage() == null ? "send failed" : e.getMessage(), "E0"); return; }

        final String action = "com.warsi.sms.SENT." + System.nanoTime();
        final int n = parts.size();
        final int[] left = { n }, firstErr = { 0 };
        final boolean[] done = { false };
        final Handler main = new Handler(Looper.getMainLooper());
        final BroadcastReceiver[] holder = new BroadcastReceiver[1];

        final Runnable finish = () -> {
            if (done[0]) return;
            done[0] = true;
            try { ctx.unregisterReceiver(holder[0]); } catch (Exception ignored) {}
            if (left[0] > 0 && firstErr[0] == 0) { call.reject("no answer from the phone", "TIMEOUT"); return; }
            if (firstErr[0] != 0) { call.reject("SMS failed (" + firstErr[0] + ")", "E" + firstErr[0]); return; }
            JSObject r = new JSObject();
            r.put("parts", n);
            call.resolve(r);
        };
        holder[0] = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                int rc = getResultCode();
                if (rc != Activity.RESULT_OK && firstErr[0] == 0) firstErr[0] = rc;
                left[0]--;
                if (left[0] <= 0) main.post(finish);
            }
        };
        ContextCompat.registerReceiver(ctx, holder[0], new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
        main.postDelayed(finish, TIMEOUT_MS);

        try {
            int flags = PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int k = 0; k < n; k++) {
                Intent it = new Intent(action).setPackage(ctx.getPackageName());
                sent.add(PendingIntent.getBroadcast(ctx, (int) (System.nanoTime() & 0x7fffffff) + k, it, flags));
            }
            if (n > 1) sm.sendMultipartTextMessage(to, null, parts, sent, null);
            else sm.sendTextMessage(to, null, text, sent.get(0), null);
        } catch (Exception e) {
            if (!done[0]) {
                done[0] = true;
                try { ctx.unregisterReceiver(holder[0]); } catch (Exception ignored) {}
                call.reject(e.getMessage() == null ? "send failed" : e.getMessage(), "E0");
            }
        }
    }
}
