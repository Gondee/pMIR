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
 *
 */
#include <string.h>
#include <jni.h>
#include <dlpspec.h>
#include <stdio.h>
#include <stdlib.h>

/* This is a trivial JNI example where we use a native method
 * to return a new VM String. See the corresponding Java source
 * file located at:
 *
 *   apps/samples/hello-jni/project/src/com/example/hellojni/HelloJni.java
 */
jstring
Java_com_example_plugin_HelloJni_getConfigName( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* configPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;

    dlpspec_scan_read_configuration	(configPtr, bufSize );
    uScanConfig *config = (uScanConfig *)configPtr;

    char* config_name = config->scanCfg.config_name;

    // release array
    (*env)->ReleaseByteArrayElements(env, array, configPtr, 0);

    return (*env)->NewStringUTF(env, config_name);
}

jstring
Java_com_example_plugin_HelloJni_getScanData( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* scanBlobPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;
    scanResults * scanResultPtr = malloc(sizeof(scanResults));

    dlpspec_scan_interpret(scanBlobPtr, bufSize, scanResultPtr);

    // release array
    (*env)->ReleaseByteArrayElements(env, array, scanBlobPtr, 0);

    int year = scanResultPtr->year;

    char buffer[10];
    snprintf(buffer, 10, "%d", year);

    // return java ScanResult object
    return (*env)->NewStringUTF(env, buffer);
}
/*
jobject
Java_com_example_plugin_HelloJni_getScanData( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // JNI get java ScanResult class and constructor
    jmethodID constructor;
    jclass scanResultClass = (*env)->FindClass(env, "com/example/plugin/HelloJni$ScanResult");
    if (scanResultClass == NULL) {
       printf("Find Class Failed.\n");
    }else{
       printf("Found class.\n");
    }

    constructor = (*env)->GetMethodID(env, scanResultClass, "<init>", "(Lcom/example/plugin/HelloJni;)V");
    if (constructor == NULL) {
        printf("Find method Failed.\n");
    }else {
        printf("Found method.\n");
    }

    // get jbyte array from array and it's length
    jbyte* scanBlobPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;
    scanResults * scanResultPtr = malloc(sizeof(scanResults));

    dlpspec_scan_interpret(scanBlobPtr, bufSize, scanResultPtr);

    jstring scanName = (*env)->NewStringUTF(env, scanResultPtr->scan_name);
    jint length = (jint)scanResultPtr->length;

    // release array
    (*env)->ReleaseByteArrayElements(env, array, scanBlobPtr, 0);

    // return java ScanResult object
    return (*env)->NewObject(env, scanResultClass, constructor);
}
*/

jstring
Java_com_example_plugin_HelloJni_stringFromJNI( JNIEnv* env,
                                                  jobject thiz )
{
#if defined(__arm__)
  #if defined(__ARM_ARCH_7A__)
    #if defined(__ARM_NEON__)
      #if defined(__ARM_PCS_VFP)
        #define ABI "armeabi-v7a/NEON (hard-float)"
      #else
        #define ABI "armeabi-v7a/NEON"
      #endif
    #else
      #if defined(__ARM_PCS_VFP)
        #define ABI "armeabi-v7a (hard-float)"
      #else
        #define ABI "armeabi-v7a"
      #endif
    #endif
  #else
   #define ABI "armeabi"
  #endif
#elif defined(__i386__)
   #define ABI "x86"
#elif defined(__x86_64__)
   #define ABI "x86_64"
#elif defined(__mips64)  /* mips64el-* toolchain defines __mips__ too */
   #define ABI "mips64"
#elif defined(__mips__)
   #define ABI "mips"
#elif defined(__aarch64__)
   #define ABI "arm64-v8a"
#else
   #define ABI "unknown"
#endif

    return (*env)->NewStringUTF(env, "Hello from JNI !  Compiled with ABI " ABI ".");
}
