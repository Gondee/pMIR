angular.module('starter.services', [])


.factory('BLE', function($q) {

    var connected;
    var connect_device_id;

    // scan config list globals
    var numScanConfigs = 0;
    var scanConfigIds = [];

    //scan config data globals
    var scanConfigDataLength;
    var scanConfigDataArrayRaw;
    var scanConfigDataArrayPayload;

    // service uuids
    var scanConfigsServiceID =  '53455205-444C-5020-4E49-52204E616E6F';
    var scanDataInfoServiceID = '53455206-444C-5020-4E49-52204E616E6F'

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
                connect_device_id = deviceId;
                deferred.resolve(peripheral);
            },
            function (reason) {
                // failure callback

                deferred.reject(reason);
            }
        );

        return deferred.promise;
    },

    lights: function(device_id) {
        var data = new Uint8Array(1);
        ble.write(connect_device_id, scanDataInfoServiceID, startScanCharID, data.buffer,
            function(res) { console.log("lights"); },
            function(res) { console.log("no lights"); }
        );
    },

    getScanConfigs: function(device_id) {
        var data = new Uint8Array(1);

        // start notification when characteristic changes (config indicies)
        ble.startNotification(device_id, scanConfigsServiceID, returnScanConfigsCharID, onConfigListData, failureMsg("Error: recieve notification for scan config list"));

        // request scan configuration list notification.
        ble.write(device_id, scanConfigsServiceID, requestScanConfigsCharID, data.buffer,
            function (res) { console.log("config list request completed"); },
            function (res) { console.log("config list request failed"); }
        );

    }

  };

  function requestConfigData() {

      // stop notifications on scan config list ids
      ble.stopNotification(connect_device_id, scanConfigsServiceID, returnScanConfigsCharID,
          function (res) { console.log("config list request notification stopped"); },
          function (res) { console.log("config list request notifications failed to stop"); }
      );



      //for (id in scanConfigIds) {
          var data = new Uint16Array(1);
          data[0] = scanConfigIds[2];

          /*ble.stopNotification(connect_device_id, scanConfigsServiceID, returnScanConfigsDataCharID,
              function (res) { console.log("config data request notification stopped"); },
              function (res) { console.log("config data request notifications failed to stop"); }
          );*/
          
          // start notification when characteristic changes (config data)
          ble.startNotification(connect_device_id, scanConfigsServiceID, returnScanConfigsDataCharID, onConfigData, failureMsg("Error: recieve notification for scan config data"));

          // request scan configuration data notification.
          ble.write(connect_device_id, scanConfigsServiceID, requestScanConfigsDataCharID, data.buffer,
              function (res) { console.log("config data request completed");  },
              function (res) { console.log("config data request failed"); }
          );

          var success = function (message) {
              alert(message);
          }

          var failure = function () {
              alert("Error calling Hello Plugin");
          }

          //hello.interpretConfig();
      //}
  };

  function appendBuffer(buffer1, buffer2) {
      var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
      tmp.set(new Uint8Array(buffer1), 0);
      tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
      return tmp.buffer;
  };

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
      } else if (packetNum > 7) {
          debugger;
      }

  };

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

});
