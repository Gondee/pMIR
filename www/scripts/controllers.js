angular.module('control', [])

.controller('DashCtrl', function ($scope, BLE) {

    $scope.scan = function () {
        BLE.scan();
    };

    $scope.connect = function () {
        BLE.connect();
    };

    $scope.disconnect = function () {
        BLE.disconnect();
    };

    /*$scope.btConnect = function (deviceId) {
        $scope.spinner = true;
        BT.connect(
            deviceId,
            function (val) {
                console.log("con val = " + val);
                $scope.connected = val;
                $scope.spinner = !val;
                if (!$scope.$$phase) { $scope.$apply() }
            }
        );
    };

    $scope.btDisconnect = function (deviceId) {
        $scope.spinner = true;
        BT.disconnect(function (val) { console.log("disc val = " + val); $scope.connected = val; $scope.spinner = val; if (!val) { $scope.$apply() } });
    };

    $scope.btWrite = function (value) {
        BT.write(value);
    };*/
})