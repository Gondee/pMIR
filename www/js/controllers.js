angular.module('app.controllers', [])
  
.controller('pMIRQuickScannerCtrl', function($scope, $state, BLE) {
    $scope.connected = false;
    $scope.scanConfigs = [];
    $scope.isTrainingData = false;

    var init = function () {
        $scope.connected = BLE.isConnected();
    }

    init();

    $scope.toggleTraining = function () {
        $scope.isTrainingData = !$scope.isTrainingData;
    };

    $scope.setConfig = function (id) {
        alert("config set to #" + id);
    };

    $scope.loadConfigs = function () {
        BLE.getScanConfigs().then(
            function (configs) {
                $scope.scanConfigs = configs;
            },
            function () {
                alert("config loading failed");
            }
        );
    }



    $scope.startScanSteps = function (device_id) {
        //If data is training data 
        //alert($scope.isTrainingData);
        if (!$scope.isTrainingData) {
            BLE.NIRScan(device_id);
        }
        else {
            $state.go("menu.posttrainscan");
        }

        
    }
})
      
.controller('connectionsCtrl', function($scope, BLE) {
    // keep a reference since devices will be added
    $scope.devices = BLE.devices;

    $scope.connected = false;
    $scope.connecting = false;

    var success = function () {
        if ($scope.devices.length < 1) {
            // a better solution would be to update a status message rather than an alert
            alert("Didn't find any Bluetooth Low Energy devices.");
        }
    };

    var failure = function (error) {
        alert(error);
    };

    BLE.scan().then(success, failure);

    $scope.connect = function (deviceId) {
        $scope.connecting = true;
        BLE.connect(deviceId).then(
            function (peripheral) {
                $scope.connected = true;
                $scope.device = peripheral;
                $scope.connecting = false;
            },
            function () { $scope.connecting = false; }
        );
    }
})
   
.controller('libraryCtrl', function($scope) {

})
   
.controller('chemometricsCtrl', function($scope) {

    $scope.labels = ["January", "February", "March", "April", "May", "June", "July"];
    $scope.series = ['Series A', 'Series B'];
    $scope.data = [
        [65, 59, 80, 81, 56, 55, 40],
        [28, 48, 40, 19, 86, 27, 90]
    ];

})
   
.controller('profilesCtrl', function($scope) {

})
.controller('postTrainScanCtrl', function ($scope) {



})
 
.controller('BLECtrl', function ($scope, BLE) {

    // keep a reference since devices will be added
    $scope.devices = BLE.devices;

    var success = function () {
        if ($scope.devices.length < 1) {
            // a better solution would be to update a status message rather than an alert
            alert("Didn't find any Bluetooth Low Energy devices.");
        }
    };

    var failure = function (error) {
        alert(error);
    };

    // pull to refresh
    $scope.onRefresh = function () {
        BLE.scan().then(
            success, failure
        ).finally(
            function () {
                $scope.$broadcast('scroll.refreshComplete');
            }
        )
    };

    $scope.plugin = function () {
        var success = function (message) {
            alert(message);
        }

        var failure = function () {
            alert("Error calling Hello Plugin");
        }

        hello.interpretConfig(fakeScanBinary(), success, failure);
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

    function fakeScanBinary() {
        var scanBin = "116,112,108,0,91,0,0,0,83,40,99,118,99,35,99,35,118,118,99,118,118,41,0,8,0,0,0,40,0,0,0,116,48,0,53,51,54,48,49,55,56,0,99,35,99,35,118,99,41,0,8,0,0,0,40,0,0,0,2,151,4,132,82,175,4,0,0,240,191,84,104,105,114,100,83,99,97,110,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
        var binArray = scanBin.split(',');
        var intArray = [];
        for (i in binArray)
            intArray.push(parseInt(binArray[i]));
        var uintArray = Uint8Array.from(intArray);
        return base64ArrayBuffer(uintArray)
    }

    // initial scan
    //BLE.scan().then(success, failure);

})

.controller('BLEDetailCtrl', function ($scope, $stateParams, BLE) {
    BLE.connect($stateParams.deviceId).then(
        function (peripheral) {
            $scope.device = peripheral;
        }
    );

    $scope.NIRScan = function (device_id) {
        BLE.NIRScan(device_id);
    }

    $scope.getScanConfigs = function (device_id) {
        BLE.getScanConfigs(device_id);
    }
});