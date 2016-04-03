LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)
LOCAL_MODULE := hello-jni
LOCAL_SRC_FILES := C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\hello-jni.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_calib.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_helper.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_scan.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_scan_col.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_scan_had.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\dlpspec_util.c \
                    C:\Users\Miguel\Documents\cordova-plugin-hello\src\android\jni\tpl.c \


include $(BUILD_SHARED_LIBRARY)