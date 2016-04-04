angular.module('app.services', [])

.factory('BLE', function($q) {

    var connected;
    var connected_device_id;

    // scan config list globals
    var numScanConfigs = 0;
    var scanConfigIds = [];
    var currentScanConfigId = 0;
    var currentScanConfigIndex = 0;
    var scanConfigNames = [];

    //scan config data globals
    var scanConfigDataLength;
    var scanConfigDataArrayRaw;
    var scanConfigDataArrayPayload;

    // service uuids
    var scanConfigsServiceID =  '53455205-444C-5020-4E49-52204E616E6F';
    var scanDataInfoServiceID = '53455206-444C-5020-4E49-52204E616E6F';

    // scan config characteristic uuids
    var returnScanConfigsCharID =       '43484115-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsCharID =      '43484114-444C-5020-4E49-52204E616E6F';
    var returnScanConfigsDataCharID =   '43484117-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsDataCharID =  '43484116-444C-5020-4E49-52204E616E6F';

    // scan data characteristic uuids
    var startScanCharID = '4348411D-444C-5020-4E49-52204E616E6F';

  return {

    devices: [],

    scan: function() {
        var that = this;
        var deferred = $q.defer();

        that.devices.length = 0;

        // disconnect the connected device (hack, device should disconnect when leaving detail page)
        if (connected) {
            var id = connected.id;
            ble.disconnect(connected.id, function() {
                console.log("Disconnected " + id);
            });
            connected = null;
        }

        ble.startScan([],  /* scan for all services */
            function(peripheral){
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
                connected = peripheral;
                connected_device_id = deviceId;
                deferred.resolve(peripheral);
                alert('connected');
            },
            function (reason) {
                // failure callback

                deferred.reject(reason);
                alert('connect failed');
            }
        );

        return deferred.promise;
    },

    lights: function () {
        var data = new Uint8Array(1);

        ble.startNotification(connected_device_id, scanDataInfoServiceID, startScanCharID, onConfigData, failureMsg("Error: recieve notification for scan data"));
        ble.write(connected_device_id, scanDataInfoServiceID, startScanCharID, data.buffer,
            function(res) { console.log("lights"); },
            function(res) { console.log("no lights"); }
        );

        
    },

    getScanConfigs: function() {
        var data = new Uint8Array(1);

        // start notification when characteristic changes (config indicies)
        ble.startNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsCharID, onConfigListData, failureMsg("Error: recieve notification for scan config list"));

        // request scan configuration list notification.
        ble.write(connected_device_id, scanConfigsServiceID, requestScanConfigsCharID, data.buffer,
            function (res) { console.log("config list request completed"); },
            function (res) { console.log("config list request failed"); }
        );

    }

  };

  function requestConfigData(index) {

      // stop notifications on scan config list ids
      ble.stopNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsCharID,
          function (res) { console.log("config list request notification stopped"); },
          function (res) { console.log("config list request notifications failed to stop"); }
      );

      currentScanConfigId = id;
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
      alert(alertString);
  }

  function onConfigData(buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var raw = new Uint8Array(buffer);
      var packetNum = new Uint8Array(buffer)[0];
      var payload = new Uint8Array(buffer.slice(1));
      
      if (packetNum == 0) {
          scanConfigDataLength = raw[1];
          scanConfigDataArrayRaw = new Uint8Array(0).buffer;
          scanConfigDataArrayPayload = new Uint8Array(0),buffer;
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
                  currentScanConfigId++;
                  requestConfigData(currentScanConfigId);
              }
          }

          var failure = function () {
              alert("Error deserializing scan configs");
          }

          var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
          
          hello.interpretConfig(trimmed64, success, failure);
      }

  };

  function fakeScanBinary() {
      var scanBin = "116,112,108,0,91,0,0,0,83,40,99,118,99,35,99,35,118,118,99,118,118,41,0,8,0,0,0,40,0,0,0,0,46,0,53,51,54,48,49,55,56,0,67,111,108,117,109,110,32,49,0,0,0,0,224,139,2,32,0,0,0,0,0,0,0,0,215,210,2,0,24,134,2,32,100,134,2,32,31,0,0,0,132,3,164,6,6,228,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
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
          requestConfigData();
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

