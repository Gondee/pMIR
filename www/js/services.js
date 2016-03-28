angular.module('starter.services', [])


.factory('BLE', function($q) {

   var connected;

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
        ble.write(device_id, '53455206-444C-5020-4E49-52204E616E6F', '4348411D-444C-5020-4E49-52204E616E6F', data.buffer,
            function(res) { console.log("lights"); },
            function(res) { console.log("no lights"); }
        );
    },

    getScanConfigs: function(device_id) {
        var data = new Uint8Array(1);

        var scanConfigsServiceID            = '53455205-444C-5020-4E49-52204E616E6F';
        var returnScanConfigsCharID         = '43484115-444C-5020-4E49-52204E616E6F';
        var requestScanConfigsCharID        = '43484114-444C-5020-4E49-52204E616E6F';
        var returnScanConfigsDataCharID     = '43484117-444C-5020-4E49-52204E616E6F';
        var requestScanConfigsDataCharID    = '43484116-444C-5020-4E49-52204E616E6F';

        // start notification when characteristic changes (config indicies)
        ble.startNotification(device_id, scanConfigsServiceID, returnScanConfigsCharID, onData, failureMsg("Error: recieve notification for scan config list"));

        // request scan configuration list notification.
        ble.write(device_id, scanConfigsServiceID, requestScanConfigsCharID, data.buffer,
            function (res) { console.log("config list request completed"); },
            function (res) { console.log("config list request failed"); }
        );

        // start notification when characteristic changes (config data)
        ble.startNotification(device_id, scanConfigsServiceID, returnScanConfigsDataCharID, onData, failureMsg("Error: recieve notification for scan config data"));

        // request scan configuration list notification.
        ble.write(device_id, scanConfigsServiceID, requestScanConfigsDataCharID, data.buffer,
            function (res) { console.log("config data request completed"); },
            function (res) { console.log("config data request failed"); }
        );

    }

  };


  function onData (buffer) {
      // Decode the ArrayBuffer into a typed Array based on the data you expect
      var data = new Uint8Array(buffer);
      console.log("Length: " + data.length + ", Data: ")
      for (d in data)
          console.log(data[d]);
  };

  function failureMsg(msg) {
      console.log(msg);
  };

  function bytesToString(buffer) {
      return String.fromCharCode.apply(null, new Uint8Array(buffer));
  };

});
