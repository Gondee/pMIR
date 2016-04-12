angular.module('app.services', [])

.factory('BLE', function($q) {

    var connected;
    var connectedBool = false;
    var connected_device_id;

    // reference globals
    var latestScanJSON;
    var latestRefScanJSON;
    var latestScan64;
    var refCoef64;
    var refMatrix64;

    // scan config list globals
    var numScanConfigs = 0;
    var scanConfigIds = [];
    var scanConfigIdIndex = 0;
    var currentScanConfigId = 0;
    var scanConfigNames = [];
    var configDefered;

    //scan config data globals
    var scanConfigDataLength;
    var scanConfigDataArrayRaw;
    var scanConfigDataArrayPayload;

    // NIRScan data globals
    var scanDataLength;
    var scanDataArrayRaw;
    var scanDataArrayPayload;
    var scanDefered;

    // service uuids
    var scanConfigsServiceID =  '53455205-444C-5020-4E49-52204E616E6F';
    var scanDataInfoServiceID = '53455206-444C-5020-4E49-52204E616E6F';
    var calibrationInfoServiceID = '53455204-444C-5020-4E49-52204E616E6F';

    // scan config characteristic uuids
    var returnScanConfigsCharID =       '43484115-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsCharID =      '43484114-444C-5020-4E49-52204E616E6F';
    var returnScanConfigsDataCharID =   '43484117-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsDataCharID =  '43484116-444C-5020-4E49-52204E616E6F';
    var activeScanConfigCharID =        '43484118-444C-5020-4E49-52204E616E6F';

    // scan data characteristic uuids
    var startScanCharID = '4348411D-444C-5020-4E49-52204E616E6F';
    var requestScanDataCharID = '43484127-444C-5020-4E49-52204E616E6F';
    var returnScanDataCharID = '43484128-444C-5020-4E49-52204E616E6F';

    // reference calibration char uuids
    var requestReferenceCoeffCharID = '4348410F-444C-5020-4E49-52204E616E6F';
    var returnReferenceCoeffCharID = '43484110-444C-5020-4E49-52204E616E6F';
    var requestReferenceMatrixCharID = '43484111-444C-5020-4E49-52204E616E6F';
    var returnReferenceMatrixCharID = '43484112-444C-5020-4E49-52204E616E6F';

  return {

    devices: [],

    scan: function() {
        var that = this;
        var deferred = $q.defer();

        that.devices.length = 0;

        //  TODO: we need a real disconnect button
        if (connected) {
            var id = connected.id;
            ble.disconnect(connected.id, function() {
                console.log("Disconnected " + id);
            });
            connected = null;
            connectedBool = false;
        }

        ble.startScan([],  /* scan for all services */
            function (peripheral) {
                if (peripheral.name == 'NIRScanNano')
                    that.devices.push(peripheral);
            },
            function(error){
                deferred.reject(error);
            });

        // stop scan after 5 seconds
        setTimeout(ble.stopScan, 5000,
            function() {
                deferred.resolve();
            },
            function() {
                console.log("stopScan failed");
                deferred.reject("Error stopping scan");
            }
        );

        return deferred.promise;
    },

    connect: function(deviceId) {
        var deferred = $q.defer();

        ble.connect(deviceId,
            function (peripheral) {
                // success callback
                connectedBool = true;
                connected = peripheral;
                connected_device_id = deviceId;
                deferred.resolve(peripheral);
                
            },
            function (reason) {
                // failure callback
                connectedBool = false;
                deferred.reject(reason);
            }
        );

        return deferred.promise;
    },

    isConnected: function () {
        return connectedBool;
    },

    NIRScan: function () {
        latestScanJSON = null;
        latestRefScanJSON = null;

        scanDefered = $q.defer();

        var data = new Uint8Array(1);

        ble.startNotification(connected_device_id, scanDataInfoServiceID, startScanCharID, onStartScanNotify, failureMsg("Error: recieve notification for scan data"));
        ble.write(connected_device_id, scanDataInfoServiceID, startScanCharID, data.buffer,
            function(res) { console.log("lights"); },
            function(res) { console.log("no lights"); }
        );

        return scanDefered.promise;
    },

    getCurrentConfigIndex: function (callback) {
        ble.read(connected_device_id, scanConfigsServiceID, activeScanConfigCharID,
            function (res) {
                var resArray = new Uint16Array(res);
                var index = resArray[0];
                callback(index);
            },
            function () { alert("Error: unable to read current scan config."); }
        );
    },

    setScanConfig: function (index, callback) {
        var data = new Uint16Array(1);
        data[0] = index;

        ble.write(connected_device_id, scanConfigsServiceID, activeScanConfigCharID, data.buffer,
            function (res) { callback(); },
            function (res) { alert("Error: unable to set new scan config."); }
        );
    },

    getScanConfigs: function () {
        scanConfigIdIndex = 0;
        scanConfigIds = [];
        scanConfigNames = [];

        configDefered = $q.defer();
        var data = new Uint8Array(1);

        // start notification when characteristic changes (config indicies)
        ble.startNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsCharID, onConfigListData, failureMsg("Error: recieve notification for scan config list"));

        // request scan configuration list notification.
        ble.write(connected_device_id, scanConfigsServiceID, requestScanConfigsCharID, data.buffer,
            function (res) { console.log("config list request completed"); },
            function (res) { console.log("config list request failed"); }
        );

        return configDefered.promise;

    },

    getLatestScan: function () {
        if (latestScanJSON == null)
            return JSON.parse('{"status":"not ready"}');
        else
            latestScanJSON.status = 'ok';
        return latestScanJSON;
    },

    getLatestReference: function () {
        if (latestRefScanJSON == null)
            return JSON.parse('{"status":"not ready"}');
        else
            latestRefScanJSON.status = 'ok';
        return latestRefScanJSON
    }

  };

  function returnLatestAbsAndRefl() {
      if (latestRefScanJSON == null || latestScanJSON == null)
          scanDefered.reject();

      var absorbance = [];
      var reflectance = [];
      var wavelength = latestScanJSON.wavelength;
      var sampleIntensity = latestScanJSON.intensity;
      var referenceIntesity = latestRefScanJSON.intensity;

      var reflect = 0;
      for (w in wavelength) {
          // ignore trailing zeroes
          if (wavelength[w] != 0) {
              reflect = sampleIntensity[w] / referenceIntesity[w];
              reflectance.push(reflect);
              absorbance.push(-Math.log10(reflect));
          }
      }

      var result = {};
      result.wavelength = wavelength;
      result.absorbance = absorbance;
      result.reflectance = reflectance;
      result.status = 'ok';

      scanDefered.resolve(result);
  };

  function requestReferenceCoefficents() {
      var data = new Uint8Array(1);

      ble.startNotification(connected_device_id, calibrationInfoServiceID, returnReferenceCoeffCharID, onRefCoeffData, failureMsg("Error: recieve notification for reference coeff"));
      ble.write(connected_device_id, calibrationInfoServiceID, requestReferenceCoeffCharID, data.buffer,
          function (res) { console.log("requesting reference coefficents"); },
          function (res) { alert("coefficent request failed"); }
      );
  };

  function requestReferenceMatrix() {
      var data = new Uint8Array(1);

      ble.startNotification(connected_device_id, calibrationInfoServiceID, returnReferenceMatrixCharID, onRefMatrixData, failureMsg("Error: recieve notification for reference matrix"));
      ble.write(connected_device_id, calibrationInfoServiceID, requestReferenceMatrixCharID, data.buffer,
          function (res) { console.log("requesting reference matrix"); },
          function (res) { alert("coefficent request failed"); }
      );
  };

  function onConfigData(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var raw = new Uint8Array(buffer);
      var packetNum = raw[0];
      var payload = new Uint8Array(buffer.slice(1));

      if (packetNum == 0) {
          scanConfigDataLength = raw[1];
          scanConfigDataArrayRaw = new Uint8Array(0).buffer;
          scanConfigDataArrayPayload = new Uint8Array(0).buffer;
      }

      // append packets
      scanConfigDataArrayRaw = appendBuffer(scanConfigDataArrayRaw, raw.buffer);
      scanConfigDataArrayPayload = appendBuffer(scanConfigDataArrayPayload, payload.buffer);

      // We've recived all packets (-4 because the first fou bytes of payload is size header)
      if (scanConfigDataArrayPayload.byteLength - 4 == scanConfigDataLength) {

          console.log("RAW: " + Array.apply([], Array.from(new Uint8Array(scanConfigDataArrayRaw))).join(","));
          console.log("PAYLOAD: " + Array.apply([], Array.from(new Uint8Array(scanConfigDataArrayPayload))).join(","));

          var trimmedPayload = new Uint8Array(scanConfigDataArrayPayload.slice(4));
          console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

          var success = function (configName) {
              scanConfigNames.push({ id: currentScanConfigId, name: configName });

              if (scanConfigNames.length == scanConfigIds.length) {
                  returnConfigNames();
                  currentScanConfigId = 0;
              } else {
                  scanConfigIdIndex++;
                  requestConfigData(scanConfigIdIndex);
              }
          }

          var failure = function () {
              alert("Error deserializing scan configs");
          }

          var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);

          hello.interpretConfig(trimmed64, success, failure);
      }

  };

  function onStartScanNotify(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var packetNum = new Uint8Array(buffer)[0];
      var payload = new Uint32Array(buffer.slice(1));
      var NIRScanIndex;

      if (packetNum == 255) {
          NIRScanIndex = payload[0];
          console.log("HEYOO: NIRScan Index = " + NIRScanIndex);
          requestNIRScanData(NIRScanIndex);
      }
  };

  function onScanData(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var raw = new Uint8Array(buffer);
      var packetNum = raw[0];
      var payload = new Uint8Array(buffer.slice(1));

      if (packetNum == 0) {
          scanDataLength = new Uint32Array(buffer.slice(1))[0];
          scanDataArrayRaw = new Uint8Array(0).buffer;
          scanDataArrayPayload = new Uint8Array(0).buffer;
      }

      // append packets
      scanDataArrayRaw = appendBuffer(scanDataArrayRaw, raw.buffer);
      scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

      // We've recived all packets (-4 because the first fou bytes of payload is size header)
      if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

          console.log("RAW: " + Array.apply([], Array.from(new Uint8Array(scanDataArrayRaw))).join(","));
          console.log("PAYLOAD: " + Array.apply([], Array.from(new Uint8Array(scanDataArrayPayload))).join(","));

          var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
          console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

          var success = function (scanJSONstr) {
              latestScanJSON = JSON.parse(scanJSONstr);
              requestReferenceCoefficents();
          }

          var failure = function () {
              alert("Error deserializing scan data");
          }

          var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
          latestScan64 = trimmed64;
          hello.interpretScanData(trimmed64, success, failure);
      }
  };

  function onRefMatrixData(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var raw = new Uint8Array(buffer);
      var packetNum = raw[0];
      var payload = new Uint8Array(buffer.slice(1));

      if (packetNum == 0) {
          scanDataLength = new Uint32Array(buffer.slice(1))[0];
          scanDataArrayRaw = new Uint8Array(0).buffer;
          scanDataArrayPayload = new Uint8Array(0).buffer;
      }

      // append packets
      scanDataArrayRaw = appendBuffer(scanDataArrayRaw, raw.buffer);
      scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

      // We've recived all packets (-4 because the first fou bytes of payload is size header)
      if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

          var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
          console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

          var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
          refMatrix64 = trimmed64;

          // we have everything we need to ge the reference results
          getReferenceScanResults();
      }
  };

  function onRefCoeffData(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var raw = new Uint8Array(buffer);
      var packetNum = raw[0];
      var payload = new Uint8Array(buffer.slice(1));

      if (packetNum == 0) {
          scanDataLength = new Uint32Array(buffer.slice(1))[0];
          scanDataArrayRaw = new Uint8Array(0).buffer;
          scanDataArrayPayload = new Uint8Array(0).buffer;
      }

      // append packets
      scanDataArrayRaw = appendBuffer(scanDataArrayRaw, raw.buffer);
      scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

      // We've recived all packets (-4 because the first fou bytes of payload is size header)
      if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

          var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
          console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

          var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
          refCoef64 = trimmed64;
          requestReferenceMatrix();
      }
  };

  function getReferenceScanResults() {
      var success = function (JSONstr) {
          latestRefScanJSON = JSON.parse(JSONstr);

          //everything should be ready to return to the UI, complete the promise.
          returnLatestAbsAndRefl();
      }

      var failure = function () {
          alert("Error deserializing scan data");
      }

      /* interpretRefScanData requires:
        [in]	pRefCal	Pointer to serialized reference calibration data (refCoef64)
        [in]	calSize	Size of reference calibration data blob (calculated)
        [in]	pMatrix	Pointer to serialized reference calibration matrix (refMatrix64)
        [in]	matrixSize	Size of reference calibration matrix data blob (calculated)
        [in]	pScanResults	Scan results from sample scan data (output of dlpspec_scan_interpret function) (latestScan64)
        [out]	pRefResults	Reference scan data result (returned as JSON)
      */

      hello.interpretRefScanData(refCoef64, refMatrix64, latestScan64, success, failure);
  }

  function requestNIRScanData(index) {
      var data = new Uint32Array(1);
      data[0] = index;

      ble.startNotification(connected_device_id, scanDataInfoServiceID, returnScanDataCharID, onScanData, failureMsg("Error: recieve notification for scan data"));
      ble.write(connected_device_id, scanDataInfoServiceID, requestScanDataCharID, data.buffer,
          function (res) { console.log("NIRScan Initiated"); },
          function (res) { alert("NIRScan Scan Failed"); }
      );
  };

  function requestConfigData(index) {

      currentScanConfigId = scanConfigIds[index];
      var data = new Uint16Array(1);
      data[0] = scanConfigIds[index];
        
      // start notification when characteristic changes (config data)
      ble.startNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsDataCharID, onConfigData, failureMsg("Error: recieve notification for scan config data"));

      // request scan configuration data notification.
      ble.write(connected_device_id, scanConfigsServiceID, requestScanConfigsDataCharID, data.buffer,
          function (res) { console.log("config data request completed");  },
          function (res) { console.log("config data request failed"); }
      );

      
  };

  function appendBuffer(buffer1, buffer2) {
      var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
      tmp.set(new Uint8Array(buffer1), 0);
      tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
      return tmp.buffer;
  };

  function returnConfigNames() {
      var alertString = '';
      for (i in scanConfigNames) {
          alertString += scanConfigNames[i].id + ' : ' + scanConfigNames[i].name + '\n';
      }
      configDefered.resolve(scanConfigNames);
  }

  function fakeScanBinary() {
      var scanBin = "116,112,108,0,117,14,0,0,83,40,117,99,35,99,99,99,99,99,99,99,106,106,118,118,117,36,40,102,35,102,35,41,99,35,118,99,99,99,99,118,99,35,99,35,118,118,99,118,118,105,35,41,0,20,0,0,0,3,0,0,0,3,0,0,0,8,0,0,0,8,0,0,0,40,0,0,0,96,3,0,0,1,0,0,0,67,111,108,117,109,110,32,49,0,0,0,0,0,0,0,0,0,0,0,0,15,3,31,2,7,1,18,209,13,240,13,66,14,210,14,1,0,87,0,0,27,6,228,130,130,0,192,249,33,223,184,159,84,148,63,85,189,151,247,93,150,8,191,52,56,209,177,229,53,156,64,153,201,163,115,0,10,237,191,69,148,88,154,9,145,47,191,53,51,54,48,49,55,56,0,237,0,24,25,64,0,46,0,53,51,54,48,49,55,56,0,67,111,108,117,109,110,32,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,132,3,164,6,6,228,0,6,0,71,254,255,255,181,253,255,255,78,253,255,255,153,253,255,255,157,254,255,255,240,0,0,0,109,0,0,0,138,0,0,0,246,0,0,0,183,1,0,0,20,2,0,0,166,1,0,0,243,1,0,0,26,2,0,0,65,2,0,0,192,3,0,0,170,3,0,0,113,4,0,0,84,4,0,0,142,5,0,0,4,5,0,0,237,4,0,0,51,5,0,0,232,5,0,0,195,247,255,255,235,6,0,0,44,5,0,0,107,7,0,0,175,6,0,0,192,5,0,0,60,6,0,0,203,6,0,0,23,5,0,0,223,4,0,0,170,4,0,0,56,4,0,0,250,4,0,0,240,4,0,0,239,4,0,0,21,4,0,0,104,4,0,0,108,4,0,0,228,5,0,0,224,3,0,0,110,4,0,0,136,5,0,0,179,5,0,0,159,4,0,0,217,5,0,0,6,249,255,255,251,4,0,0,243,3,0,0,179,4,0,0,46,5,0,0,110,7,0,0,156,5,0,0,190,5,0,0,226,3,0,0,89,6,0,0,233,4,0,0,71,5,0,0,166,4,0,0,184,5,0,0,229,5,0,0,195,4,0,0,35,6,0,0,104,6,0,0,109,4,0,0,60,6,0,0,212,7,0,0,89,7,0,0,135,5,0,0,142,7,0,0,218,6,0,0,30,249,255,255,216,6,0,0,109,7,0,0,175,7,0,0,35,7,0,0,179,5,0,0,232,7,0,0,120,6,0,0,68,9,0,0,181,8,0,0,237,7,0,0,114,9,0,0,195,7,0,0,127,9,0,0,189,7,0,0,42,8,0,0,215,8,0,0,167,9,0,0,217,8,0,0,210,10,0,0,3,11,0,0,96,11,0,0,45,8,0,0,118,11,0,0,8,10,0,0,161,247,255,255,34,12,0,0,178,12,0,0,130,11,0,0,53,12,0,0,235,10,0,0,254,10,0,0,3,12,0,0,157,11,0,0,101,10,0,0,51,12,0,0,153,11,0,0,205,10,0,0,12,12,0,0,23,10,0,0,125,10,0,0,180,10,0,0,117,10,0,0,197,10,0,0,110,10,0,0,137,9,0,0,71,9,0,0,237,8,0,0,28,9,0,0,60,9,0,0,200,247,255,255,210,8,0,0,157,10,0,0,30,9,0,0,15,9,0,0,110,9,0,0,63,7,0,0,49,9,0,0,195,9,0,0,41,8,0,0,59,10,0,0,111,9,0,0,255,8,0,0,243,10,0,0,167,7,0,0,204,8,0,0,231,7,0,0,101,8,0,0,91,8,0,0,78,9,0,0,235,9,0,0,83,8,0,0,117,7,0,0,20,9,0,0,180,8,0,0,197,247,255,255,165,9,0,0,117,7,0,0,204,8,0,0,216,7,0,0,213,7,0,0,177,8,0,0,122,8,0,0,6,8,0,0,119,7,0,0,139,6,0,0,149,7,0,0,82,8,0,0,141,7,0,0,212,4,0,0,217,5,0,0,36,6,0,0,46,6,0,0,5,5,0,0,37,6,0,0,13,7,0,0,61,5,0,0,194,5,0,0,192,3,0,0,16,4,0,0,118,247,255,255,222,5,0,0,251,7,0,0,237,5,0,0,104,4,0,0,210,3,0,0,143,3,0,0,199,3,0,0,223,4,0,0,213,3,0,0,59,3,0,0,150,2,0,0,67,1,0,0,251,0,0,0,5,3,0,0,6,1,0,0,145,0,0,0,124,2,0,0,134,0,0,0,142,0,0,0,149,1,0,0,86,1,0,0,217,255,255,255,12,1,0,0,189,0,0,0,174,249,255,255,251,255,255,255,2,0,0,0,248,255,255,255,156,254,255,255,189,254,255,255,98,253,255,255,40,255,255,255,107,255,255,255,251,252,255,255,6,253,255,255,172,252,255,255,228,252,255,255,89,251,255,255,77,253,255,255,100,253,255,255,178,250,255,255,252,251,255,255,70,252,255,255,17,252,255,255,45,252,255,255,156,252,255,255,108,249,255,255,93,251,255,255,111,251,255,255,191,248,255,255,73,250,255,255,101,250,255,255,11,250,255,255,21,249,255,255,220,248,255,255,27,249,255,255,248,249,255,255,202,248,255,255,3,248,255,255,174,246,255,255,238,249,255,255,226,247,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
      var binArray = scanBin.split(',');
      var intArray = [];
      for (i in binArray)
          intArray.push(parseInt(binArray[i]));
      var uintArray = Uint8Array.from(intArray);
      return base64ArrayBuffer(uintArray)
  }

  function onConfigListData (buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var packetNum = new Uint8Array(buffer)[0];
      var payload = new Uint16Array(buffer.slice(1));

      if (packetNum == 0) {

          // number of 2 byte scan ids
          numScanConfigs = payload[0] / 2;
      } else {

          // add all the ids to the list
          for (id in payload) 
              scanConfigIds.push(payload[id]);
      }

      if (scanConfigIds.length == numScanConfigs) {
          // all the ids have been added, call the callback
          var idString = "";
          for (id in scanConfigIds)
              idString += scanConfigIds[id] + ", ";
          console.log("Here are all the scan config IDs: " + idString);
          requestConfigData(scanConfigIdIndex);
      }
      
  };

  function failureMsg(msg) {
      console.log(msg);
  };

  function bytesToString(buffer) {
      return String.fromCharCode.apply(null, new Uint8Array(buffer));
  };

  function base64ArrayBuffer(arrayBuffer) {
      var base64 = ''
      var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

      var bytes = new Uint8Array(arrayBuffer)
      var byteLength = bytes.byteLength
      var byteRemainder = byteLength % 3
      var mainLength = byteLength - byteRemainder

      var a, b, c, d
      var chunk

      // Main loop deals with bytes in chunks of 3
      for (var i = 0; i < mainLength; i = i + 3) {
          // Combine the three bytes into a single integer
          chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

          // Use bitmasks to extract 6-bit segments from the triplet
          a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
          b = (chunk & 258048) >> 12 // 258048   = (2^6 - 1) << 12
          c = (chunk & 4032) >> 6 // 4032     = (2^6 - 1) << 6
          d = chunk & 63               // 63       = 2^6 - 1

          // Convert the raw binary segments to the appropriate ASCII encoding
          base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
      }

      // Deal with the remaining bytes and padding
      if (byteRemainder == 1) {
          chunk = bytes[mainLength]

          a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

          // Set the 4 least significant bits to zero
          b = (chunk & 3) << 4 // 3   = 2^2 - 1

          base64 += encodings[a] + encodings[b] + '=='
      } else if (byteRemainder == 2) {
          chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

          a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
          b = (chunk & 1008) >> 4 // 1008  = (2^6 - 1) << 4

          // Set the 2 least significant bits to zero
          c = (chunk & 15) << 2 // 15    = 2^4 - 1

          base64 += encodings[a] + encodings[b] + encodings[c] + '='
      }

      return base64
  }

})


.factory('BlankFactory', [function(){

}])

.service('BlankService', [function(){

}]);

