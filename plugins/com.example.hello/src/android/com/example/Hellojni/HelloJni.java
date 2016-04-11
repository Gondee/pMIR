/*
 * Copyright (C) 2009 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.example.plugin;

import android.app.Activity;
import android.widget.TextView;
import android.os.Bundle;


public class HelloJni {

    public class ScanResult {
        private String scanName;
        private int length;

        public ScanResult() {
            this.scanName = "fakename";
            this.length = 32;
        }

        public String getScanName() {
            return scanName;
        }

        public int getLength() {
            return length;
        }
    }

    /* A native method that is implemented by the
     * 'hello-jni' native library, which is packaged
     * with this application.
     */
    public static native String  stringFromJNI();

    public static native String  getConfigName(byte[] array);

    public static native String  getScanName(byte[] array);

    public static native int[] getScanIntensity(byte[] array);

    public static native double[] getScanWavelength(byte[] array);
    /* this is used to load the 'hello-jni' library on application
     * startup. The library has already been unpacked into
     * /data/data/com.example.hellojni/lib/libhello-jni.so at
     * installation time by the package manager.
     */
    static {
        System.loadLibrary("hello-jni");
    }
}
