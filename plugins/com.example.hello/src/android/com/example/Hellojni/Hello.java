package com.example.plugin;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.LOG;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONObject;
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
            callbackContext.success(message);
            validAction = true;
        } else if (action.equals("interpretScanData")) {

            byte[] buffer = data.getArrayBuffer(0);
            String scanName = HelloJni.getScanName(buffer);
            int[] intensity = HelloJni.getScanIntensity(buffer);
            double[] wavelength = HelloJni.getScanWavelength(buffer);
            JSONArray intensityJSON = new JSONArray(intensity);
            JSONArray wavelengthJSON = new JSONArray(wavelength);

            JSONObject scanJSON = new JSONObject();
            scanJSON.put("name", scanName);
            scanJSON.put("intensity", intensityJSON);
            scanJSON.put("wavelength", wavelengthJSON);

            callbackContext.success(scanJSON.toString());
            validAction = true;
        } else if (action.equals("interpretRefScanData")) {
            byte[] refCoef = data.getArrayBuffer(0);
            byte[] refMatrix = data.getArrayBuffer(1);
            byte[] latestScan = data.getArrayBuffer(2);

            int[] intensity = HelloJni.getRefIntensity(refCoef, refMatrix, latestScan);
            double[] wavelength = HelloJni.getRefWavelength(refCoef, refMatrix, latestScan);
            JSONArray intensityJSON = new JSONArray(intensity);
            JSONArray wavelengthJSON = new JSONArray(wavelength);

            JSONObject refJSON = new JSONObject();
            refJSON.put("name", "latestReference");
            refJSON.put("intensity", intensityJSON);
            refJSON.put("wavelength", wavelengthJSON);

            callbackContext.success(refJSON.toString());
            validAction = true;
        } else {

            validAction = false;

        }

        return validAction;
    }
}
