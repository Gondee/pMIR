package com.example.plugin;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.LOG;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import android.app.Activity;
import android.os.Bundle;

public class Hello extends CordovaPlugin {

    @Override
    public boolean execute(String action, CordovaArgs data, CallbackContext callbackContext) throws JSONException {

        boolean validAction;

        if (action.equals("greet")) {

            String jniString = HelloJni.stringFromJNI();
            String name = data.getString(0);
            String message = "Hello, " + name + ". JNI says: " + jniString;
            callbackContext.success(message);

            validAction = true;

        } else if (action.equals("interpretConfig")) {

            byte[] buffer = data.getArrayBuffer(0);
            String message = HelloJni.getConfigName(buffer);
            //String message = "The passed array length: " + buffer.length;
            callbackContext.success(message);
            validAction = true;
        } else {

            validAction = false;

        }

        return validAction;
    }
}
