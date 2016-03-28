angular.module('starter.controllers', [])


.controller('BLECtrl', function($scope, BLE) {

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

      hello.greet("World", success, failure);
  };

  // initial scan
  //BLE.scan().then(success, failure);

})

.controller('BLEDetailCtrl', function($scope, $stateParams, BLE) {
  BLE.connect($stateParams.deviceId).then(
      function(peripheral) {
          $scope.device = peripheral;
      }
  );

  $scope.lights = function (device_id) {
    BLE.lights(device_id);
  }

  $scope.getScanConfigs = function (device_id) {
    BLE.getScanConfigs(device_id);
  }
});
