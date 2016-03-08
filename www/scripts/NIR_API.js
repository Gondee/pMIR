angular.module('starter.services', [])

.factory('BLE', function () {
    var connected;

    function btFailure(stage, error) { console.log("Bluetooth error during " + stage + " stage. Error: " + error); };

    return {
        devices: [],

        scan: function (callback) {
            var that = this;

            ble.scan([], 5, function (device) {
                console.log(JSON.stringify(device));
            }, function (error) {
                console.log("ERROR: " + console.log(error));
                callback();
            });


        },
        connect: function (deviceId, callback) {
            if (deviceId == 0)
                deviceId = "30:14:06:24:12:98";
            /*bluetoothSerial.connect(deviceId,

                function () {
                   //success
                    console.log("bluetooth connected!");
                    callback(true);
                },
                callback(false)
            );*/
        },
        disconnect: function (callback) {
            /*bluetoothSerial.disconnect(

                function () {
                    //success
                    console.log("bluetooth disconnected!");
                    callback(false);
                }, callback(true)
            );*/
        },
        write: function (value) {
            //bluetoothSerial.write(value, function () { console.log("SUCCESS = " + value) }, function () { console.log("FAIL= " + value) });
        }
    };
});