/*global cordova, module*/

module.exports = {
    greet: function (name, successCallback, errorCallback) {
        cordova.exec(successCallback, errorCallback, "Hello", "greet", [name]);
    },
    interpretConfig: function (data, successCallback, errorCallback) {
        cordova.exec(successCallback, errorCallback, "Hello", "interpretConfig", [data]);
    },
    interpretScanData: function (data, successCallback, errorCallback) {
        cordova.exec(successCallback, errorCallback, "Hello", "interpretScanData", [data]);
    }
};
