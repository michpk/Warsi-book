package com.warsi.print;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.UUID;

/* Any Bluetooth receipt printer that speaks ESC/POS over the serial profile (almost all 58 / 80 mm ones).
   The printer is paired in the phone's Bluetooth settings; the app lists paired devices and sends bytes. */
@CapacitorPlugin(name = "WbPrint", permissions = { @Permission(alias = "bt", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class WbPrintPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private boolean needPerm() { return Build.VERSION.SDK_INT >= 31 && getPermissionState("bt") != PermissionState.GRANTED; }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm != null ? bm.getAdapter() : null;
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (needPerm()) { requestPermissionForAlias("bt", call, "listCb"); return; }
        doList(call);
    }

    @PermissionCallback
    private void listCb(PluginCall call) { if (needPerm()) call.reject("Bluetooth permission denied", "DENIED"); else doList(call); }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("no Bluetooth", "NOBT"); return; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off", "OFF"); return; }
        JSArray arr = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            JSObject o = new JSObject();
            o.put("name", d.getName() == null ? d.getAddress() : d.getName());
            o.put("address", d.getAddress());
            o.put("type", d.getBluetoothClass() != null ? d.getBluetoothClass().getMajorDeviceClass() : 0);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("devices", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (needPerm()) { requestPermissionForAlias("bt", call, "printCb"); return; }
        doPrint(call);
    }

    @PermissionCallback
    private void printCb(PluginCall call) { if (needPerm()) call.reject("Bluetooth permission denied", "DENIED"); else doPrint(call); }

    @SuppressLint("MissingPermission")
    private void doPrint(final PluginCall call) {
        final String address = call.getString("address"), data = call.getString("data");
        if (address == null || data == null) { call.reject("printer or data missing", "EMPTY"); return; }
        final BluetoothAdapter a = adapter();
        if (a == null) { call.reject("no Bluetooth", "NOBT"); return; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off", "OFF"); return; }
        new Thread(() -> {
            BluetoothSocket s = null;
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                BluetoothDevice dev = a.getRemoteDevice(address);
                try { a.cancelDiscovery(); } catch (Exception ignored) {}
                try {
                    s = dev.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (Exception first) {
                    // some cheap printers only answer on channel 1
                    try { if (s != null) s.close(); } catch (Exception ignored) {}
                    s = (BluetoothSocket) dev.getClass().getMethod("createRfcommSocket", int.class).invoke(dev, 1);
                    s.connect();
                }
                OutputStream out = s.getOutputStream();
                int chunk = 512;
                for (int i = 0; i < bytes.length; i += chunk) {
                    out.write(bytes, i, Math.min(chunk, bytes.length - i));
                    out.flush();
                    Thread.sleep(25);  // small printers have tiny buffers
                }
                Thread.sleep(Math.min(4000, 400 + bytes.length / 40));
                s.close();
                call.resolve(new JSObject());
            } catch (Exception e) {
                try { if (s != null) s.close(); } catch (Exception ignored) {}
                call.reject(e.getMessage() == null ? "print failed" : e.getMessage(), "FAIL");
            }
        }).start();
    }
}
