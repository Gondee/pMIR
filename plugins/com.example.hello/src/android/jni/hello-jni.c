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

jint
Java_com_example_plugin_HelloJni_getConfigStart( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* configPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;

    dlpspec_scan_read_configuration	(configPtr, bufSize );
    uScanConfig *config = (uScanConfig *)configPtr;

    jint result = (jint)config->scanCfg.wavelength_start_nm;

    // release array
    (*env)->ReleaseByteArrayElements(env, array, configPtr, 0);

    return result;
}

jint
Java_com_example_plugin_HelloJni_getConfigEnd( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* configPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;

    dlpspec_scan_read_configuration	(configPtr, bufSize );
    uScanConfig *config = (uScanConfig *)configPtr;

    jint result = (jint)config->scanCfg.wavelength_end_nm;

    // release array
    (*env)->ReleaseByteArrayElements(env, array, configPtr, 0);

    return result;
}

jint
Java_com_example_plugin_HelloJni_getConfigRepeats( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* configPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;

    dlpspec_scan_read_configuration	(configPtr, bufSize );
    uScanConfig *config = (uScanConfig *)configPtr;

    jint result = (jint)config->scanCfg.num_repeats;

    // release array
    (*env)->ReleaseByteArrayElements(env, array, configPtr, 0);

    return result;
}

jstring
Java_com_example_plugin_HelloJni_getScanName( JNIEnv* env, jobject thiz, jbyteArray array )
{
    // get jbyte array from array and it's length
    jbyte* scanBlobPtr = (*env)->GetByteArrayElements(env, array, NULL);
    jsize lengthOfArray = (*env)->GetArrayLength(env, array);

    size_t bufSize = lengthOfArray;
    scanResults * scanResultPtr = malloc(sizeof(scanResults));

    dlpspec_scan_interpret(scanBlobPtr, bufSize, scanResultPtr);

    // release array
    (*env)->ReleaseByteArrayElements(env, array, scanBlobPtr, 0);

    char* name = scanResultPtr->scan_name;
    free(scanResultPtr);
    // return java ScanResult object
    return (*env)->NewStringUTF(env, name);
}

jintArray  Java_com_example_plugin_HelloJni_getScanIntensity(JNIEnv* env, jobject thiz, jbyteArray array )
{
 // get jbyte array from array and it's length
     jbyte* scanBlobPtr = (*env)->GetByteArrayElements(env, array, NULL);
     jsize lengthOfArray = (*env)->GetArrayLength(env, array);

     size_t bufSize = lengthOfArray;
     scanResults * scanResultPtr = malloc(sizeof(scanResults));

     dlpspec_scan_interpret(scanBlobPtr, bufSize, scanResultPtr);

     // release array
     (*env)->ReleaseByteArrayElements(env, array, scanBlobPtr, 0);

     int size = ADC_DATA_LEN;
     jintArray result;
     result = (*env)->NewIntArray(env, size);
     if (result == NULL) {
         return NULL; /* out of memory error thrown */
     }

     int i;
     // fill a temp structure to use to populate the java int array
     jint fill[size];
     for (i = 0; i < size; i++) {
         fill[i] = scanResultPtr->intensity[i];
     }
     // move from the temp structure to the java structure
     (*env)->SetIntArrayRegion(env, result, 0, size, fill);
     free(scanResultPtr);
     return result;
}

jdoubleArray  Java_com_example_plugin_HelloJni_getScanWavelength(JNIEnv* env, jobject thiz, jbyteArray array )
{
 // get jbyte array from array and it's length
     jbyte* scanBlobPtr = (*env)->GetByteArrayElements(env, array, NULL);
     jsize lengthOfArray = (*env)->GetArrayLength(env, array);

     size_t bufSize = lengthOfArray;
     scanResults * scanResultPtr = malloc(sizeof(scanResults));

     dlpspec_scan_interpret(scanBlobPtr, bufSize, scanResultPtr);

     // release array
     (*env)->ReleaseByteArrayElements(env, array, scanBlobPtr, 0);

     int size = ADC_DATA_LEN;
     jdoubleArray result;
     result = (*env)->NewDoubleArray(env, size);
     if (result == NULL) {
         return NULL; /* out of memory error thrown */
     }

     int i;
     // fill a temp structure to use to populate the java int array
     jdouble fill[size];
     for (i = 0; i < size; i++) {
         fill[i] = scanResultPtr->wavelength[i];
     }
     // move from the temp structure to the java structure
     (*env)->SetDoubleArrayRegion(env, result, 0, size, fill);
     free(scanResultPtr);
     return result;
}

jintArray  Java_com_example_plugin_HelloJni_getRefIntensity(JNIEnv* env, jobject thiz, jbyteArray refCoeff, jbyteArray refMatrix, jbyteArray latestScan )
{
    // get jbyte array from array and it's length
     jbyte* latestScanBlobPtr = (*env)->GetByteArrayElements(env, latestScan, NULL);
     jsize lengthOfLatestScan = (*env)->GetArrayLength(env, latestScan);

     jbyte* refCoeffBlobPtr = (*env)->GetByteArrayElements(env, refCoeff, NULL);
     jsize lengthOfRefCoeff = (*env)->GetArrayLength(env, refCoeff);

     jbyte* refMatrixBlobPtr = (*env)->GetByteArrayElements(env, refMatrix, NULL);
     jsize lengthOfRefMatrix = (*env)->GetArrayLength(env, refMatrix);

     size_t scanBufSize = lengthOfLatestScan;
     size_t refCoeffBufSize = lengthOfLatestScan;
     size_t refMatrixBufSize = lengthOfLatestScan;

     scanResults * scanResultPtr = malloc(sizeof(scanResults));
     scanResults * refScanResultPtr = malloc(sizeof(scanResults));

     dlpspec_scan_interpret(latestScanBlobPtr, scanBufSize, scanResultPtr);

     /*
     dlpspec_scan_interpReference ( const void * pRefCal, size_t calSize, const void * pMatrix, size_t matrixSize, const scanResults * pScanResults, scanResults * pRefResults )
    [in]	pRefCal	Pointer to serialized reference calibration data
    [in]	calSize	Size of reference calibration data blob
    [in]	pMatrix	Pointer to serialized reference calibration matrix
    [in]	matrixSize	Size of reference calibration matrix data blob
    [in]	pScanResults	Scan results from sample scan data (output of dlpspec_scan_interpret function)
    [out]	pRefResults	Reference scan data result
     */

     dlpspec_scan_interpReference (refCoeffBlobPtr, refCoeffBufSize, refMatrixBlobPtr, refMatrixBufSize, scanResultPtr, refScanResultPtr);

     // release array
     (*env)->ReleaseByteArrayElements(env, latestScan, latestScanBlobPtr, 0);
     (*env)->ReleaseByteArrayElements(env, refCoeff, refCoeffBlobPtr, 0);
     (*env)->ReleaseByteArrayElements(env, refMatrix, refMatrixBlobPtr, 0);

     int size = ADC_DATA_LEN;
     jintArray result;
     result = (*env)->NewIntArray(env, size);
     if (result == NULL) {
         return NULL; /* out of memory error thrown */
     }

     int i;
     // fill a temp structure to use to populate the java int array
     jint fill[size];
     for (i = 0; i < size; i++) {
         fill[i] = refScanResultPtr->intensity[i];
     }
     // move from the temp structure to the java structure
     (*env)->SetIntArrayRegion(env, result, 0, size, fill);

     free(scanResultPtr);
     free(refScanResultPtr);
     return result;
}

jdoubleArray  Java_com_example_plugin_HelloJni_getRefWavelength(JNIEnv* env, jobject thiz, jbyteArray refCoeff, jbyteArray refMatrix, jbyteArray latestScan )
{
    // get jbyte array from array and it's length
     jbyte* latestScanBlobPtr = (*env)->GetByteArrayElements(env, latestScan, NULL);
     jsize lengthOfLatestScan = (*env)->GetArrayLength(env, latestScan);

     jbyte* refCoeffBlobPtr = (*env)->GetByteArrayElements(env, refCoeff, NULL);
     jsize lengthOfRefCoeff = (*env)->GetArrayLength(env, refCoeff);

     jbyte* refMatrixBlobPtr = (*env)->GetByteArrayElements(env, refMatrix, NULL);
     jsize lengthOfRefMatrix = (*env)->GetArrayLength(env, refMatrix);

     size_t scanBufSize = lengthOfLatestScan;
     size_t refCoeffBufSize = lengthOfLatestScan;
     size_t refMatrixBufSize = lengthOfLatestScan;

     scanResults * scanResultPtr = malloc(sizeof(scanResults));
     scanResults * refScanResultPtr = malloc(sizeof(scanResults));

     dlpspec_scan_interpret(latestScanBlobPtr, scanBufSize, scanResultPtr);

     /*
     dlpspec_scan_interpReference ( const void * pRefCal, size_t calSize, const void * pMatrix, size_t matrixSize, const scanResults * pScanResults, scanResults * pRefResults )
    [in]	pRefCal	Pointer to serialized reference calibration data
    [in]	calSize	Size of reference calibration data blob
    [in]	pMatrix	Pointer to serialized reference calibration matrix
    [in]	matrixSize	Size of reference calibration matrix data blob
    [in]	pScanResults	Scan results from sample scan data (output of dlpspec_scan_interpret function)
    [out]	pRefResults	Reference scan data result
     */

     dlpspec_scan_interpReference (refCoeffBlobPtr, refCoeffBufSize, refMatrixBlobPtr, refMatrixBufSize, scanResultPtr, refScanResultPtr);

     // release array
     (*env)->ReleaseByteArrayElements(env, latestScan, latestScanBlobPtr, 0);
     (*env)->ReleaseByteArrayElements(env, refCoeff, refCoeffBlobPtr, 0);
     (*env)->ReleaseByteArrayElements(env, refMatrix, refMatrixBlobPtr, 0);

      int size = ADC_DATA_LEN;
      jdoubleArray result;
      result = (*env)->NewDoubleArray(env, size);
      if (result == NULL) {
          return NULL; /* out of memory error thrown */
      }

      int i;
      // fill a temp structure to use to populate the java int array
      jdouble fill[size];
      for (i = 0; i < size; i++) {
          fill[i] = refScanResultPtr->wavelength[i];
      }
      // move from the temp structure to the java structure
      (*env)->SetDoubleArrayRegion(env, result, 0, size, fill);

     free(scanResultPtr);
     free(refScanResultPtr);
     return result;
}

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
