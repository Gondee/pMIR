angular.module('BLE', [])

.factory('BLE', function () {
    var connected;

    var device_id = "B0:B4:48:9D:51:EE";

    function btFailure(stage, error) { console.log("Bluetooth error during " + stage + " stage. Error: " + error); };

    function connect(id) {
        ble.connect(id,
            function () { console.log("Connect Successful"); },
            function (error) { console.log("Connect Failed"); }
        );
    }

    return {
        scan: function () {
            var that = this;

            ble.scan([], 5, function (device) {
                if (device.name == "NIRScanNano") {
                    connect(device.id);
                }
                console.log(JSON.stringify(device));
            }, function (error) {
                console.log("ERROR: " + console.log(error));
                callback();
            });
        },

        disconnect: function () {
            ble.disconnect(device_id,
                function () { console.log("Disconnect Successful"); },
                function () { console.log("Disconnect Failed"); }
            );
        },

        write: function (value) {
            //bluetoothSerial.write(value, function () { console.log("SUCCESS = " + value) }, function () { console.log("FAIL= " + value) });
        }
    };
});