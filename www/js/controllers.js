angular.module('app.controllers', ['app.nodeServices'])

.controller('pMIRQuickScannerCtrl', function ($scope, $ionicHistory, $state, BLE, chemo, database, $ionicPopup) {
    $ionicHistory.clearCache();
    $scope.connected = false;
    $scope.isTrainingData = false;
   
    $scope.scanResults = {};

    $scope.ScanRAW = {
        textRaw: 'Raw Scan',
        value: 'RAW',
    };
    $scope.ScanPCA={
        textPCA: 'PCA Mode',
        value: 'PCA'
    }
    $scope.ScanPLS ={
        textPLS: 'PLS Mode',
        value: 'PLS'
    };
    $scope.testType = {
        type: 'RAW'
    };

    var init = function () {
        setInterval(checkConnect, 500);
    }

    var checkConnect = function () {
        $scope.connected = BLE.isConnected();
    };

    init();

    $scope.toggleTraining = function () {
        $scope.isTrainingData = !$scope.isTrainingData;
    };

    $scope.saveTrainingModel = function () {
        var model = chemo.getModel();
        //chemo.
    }

    $scope.startScanSteps = function (device_id) {

        if (!$scope.isTrainingData) {

            if ($scope.testType.type == "RAW") {
                $state.go("menu.simplescanresult");
            }
            else if ($scope.testType.type == "PCA") {
                if (!chemo.isTrained()) {
                    chemo.train(false);
                }
                $state.go("menu.pcaccanresult");
            }
            else if ($scope.testType.type == "PLS") {
                if (!chemo.isTrained()) {
                    chemo.train(true);
                }
                $state.go("menu.plsscanresult");
            }
            else {
                $ionicPopup.alert({
                    title: 'Error',
                    template: 'You must select a type of scan!'
                });
                return;
            }



        }
        else {
            //Chemo is called post scan
            $state.go("menu.posttrainscan");
        }
    }

    
})

.controller('connectionsCtrl', function ($scope, $ionicHistory, $state, BLE, $ionicPopup) {
    // keep a reference since devices will be added
    $scope.devices = BLE.devices;

    $scope.connected = false;
    $scope.connecting = false;

    var success = function () {
        if ($scope.devices.length < 1) {
            // a better solution would be to update a status message rather than an alert
            $ionicPopup.alert({
                title: 'No NIR devices detected',
                template: 'Please make sure the device is in search mode and BLE is enabled'
            });
        }
    };

    var failure = function (error) {
        alert(error);
    };

    $scope.scan = function () {
        BLE.scan().then(success, failure);
    }

    BLE.scan().then(success, failure);

    $scope.connect = function (deviceId) {
        $scope.connecting = true;
        BLE.connect(deviceId).then(
            function (peripheral) {
                $scope.connected = true;
                $scope.device = peripheral;
                $scope.connecting = false;

                $ionicHistory.nextViewOptions({
                    disableBack: true
                });
                $state.go('menu.pMIRQuickScanner');

            },
            function () { $scope.connecting = false; }
        );
    }
})

.controller('scanConfigCtrl', function ($scope, BLE) {
    $scope.scanConfigs = [];
    $scope.loading = true;
    $scope.currentScanConfig = 0;

    $scope.setConfig = function (id) {
        $scope.currentScanConfig = 0;
        if (id == $scope.currentScanConfig)
            return;
        BLE.setScanConfig(id, init);
    };

    $scope.isActiveConfig = function (index) {
        return $scope.currentScanConfig == index;
    };

    $scope.loadConfigs = function () {
        $scope.loading = true;

        BLE.getCurrentConfigIndex(function (index) {
            $scope.currentScanConfig = index;
        });

        BLE.getScanConfigs().then(
            function (configs) {
                $scope.scanConfigs = configs;
                $scope.loading = false;
            },
            function () {
                alert("config loading failed");
                $scope.loading = false;
            }
        );
    };

    var init = function () {
        $scope.loading = true;
        $scope.loadConfigs();
    }

    init();

})

.controller('simpleScanCtrl', function ($scope, BLE, $state) {
    $scope.loading = true;

    $scope.absorbance = [];
    $scope.reflectance = [];

    var timeout = setTimeout(onTimeout, 15000);

    function onTimeout() {
        $state.go("menu.reset");
    }



    BLE.NIRScan().then(
        function (res) {
            getChartVals(res);
            $scope.loading = false;
            clearTimeout(timeout);
        },
        function (error) { 
            alert('Error: ' + error);
            $scope.loading = false;
            clearTimeout(timeout);
        }
    );

    function getChartVals(scan) {
        var absValues = [];
        var refValues = [];
        for (w in scan.wavelength) {
            absValues.push([scan.wavelength[w], scan.absorbance[w]]);
            refValues.push([scan.wavelength[w], scan.reflectance[w]]);
        }

        $scope.absorbance = [
     	    {
     	        "key": "Series 1",
     	        "values": absValues
     	    }
        ];

        $scope.reflectance = [
     	    {
     	        "key": "Series 1",
     	        "values": refValues
     	    }
        ];
    };
})

.controller('libraryCtrl', function ($scope, chemo) {
    chemo.plsTest();
})

.controller('chemometricsCtrl', function ($scope) {

    $scope.labels = ["January", "February", "March", "April", "May", "June", "July"];
    $scope.series = ['Series A', 'Series B'];
    $scope.data = [
        [65, 59, 80, 81, 56, 55, 40],
        [28, 48, 40, 19, 86, 27, 90]
    ];

})

.controller('profilesCtrl', function ($scope) {

})
.controller('postTrainScanCtrl', function ($scope, BLE, database, chemo, $state, $ionicPopup) {

    $scope.scanResults = {};
    $scope.loading = false;
    $scope.loadingsetTwo = true;
    $scope.setTwoText = 'Add Additional Materials'

    $scope.name = {
        text: ''
    };
    $scope.elem1 = {
        text: '',
        value: 0.0
    };
    $scope.elem2 = {
        text: '',
        value: 0.0
    };
    $scope.elem3 = {
        text: '',
        value: 0.0
    };
    $scope.elem4 = {
        text: '',
        value: 0.0
    };
    $scope.elem5 = {
        text: '',
        value: 0.0
    };
    $scope.elem6 = {
        text: '',
        value: 0.0
    };
    $scope.elem7 = {
        text: '',
        value: 0.0
    };
    $scope.elem8 = {
        text: '',
        value: 0.0
    };
    $scope.elem9 = {
        text: '',
        value: 0.0
    };
    $scope.elem10 = {
        text: '',
        value: 0.0
    };


    $scope.AddFields = function () {
        $scope.loadingsetTwo = !$scope.loadingsetTwo;
        if ($scope.loadingsetTwo == false) {
            $scope.setTwoText = 'Remove Additional Materials';
        }
        else {
            $scope.setTwoText = 'Add Additional Materials'
        }
    }

   

    $scope.Save = function (fname) {

        $scope.loadingsetTwo = true;

        validation = false;
        retrieve = false;
        save = false;
        remainder = 0;

        
        var fileName = fname;
        //alert(fileName);
        //Validate user input % and data. 
        total = $scope.elem1.value + $scope.elem2.value + $scope.elem3.value + $scope.elem4.value + $scope.elem5.value;
        total = total + $scope.elem6.value + $scope.elem7.value + $scope.elem8.value + $scope.elem9.value + $scope.elem10.value;
        

        if ((total) > 100.0) {
            
            $ionicPopup.alert({
                title: 'Error',
                template: 'Your total concentrations are greater than 100'
            });
            return;
        } else if ((total) == 0.0) {
            
            $ionicPopup.alert({
                title: 'Error',
                template: 'You must enter concentration data before proceding'
            });
            return;
        }
        if ($scope.name.text = '') {
            
            $ionicPopup.alert({
                title: 'Error',
                template: 'You must enter a name for this training data'
            });
            return;
        }

        //getting remainder if it exists
        if ((total) < 100) {
            remainder = 100 - total;
            //validation = true;
        }

        var clabels = [];
        var concentrations = [];

        if ($scope.elem1.text != '' && $scope.elem1.value > 0 && $scope.elem1.value <= 100) {
            clabels.push($scope.elem1.text);
            concentrations.push(($scope.elem1.value / 100));
        }
        if ($scope.elem2.text != '' && $scope.elem2.value > 0 && $scope.elem2.value <= 100) {
            clabels.push($scope.elem2.text);
            concentrations.push(($scope.elem2.value / 100));
        }
        if ($scope.elem3.text != '' && $scope.elem3.value > 0 && $scope.elem3.value <= 100) {
            clabels.push($scope.elem3.text);
            concentrations.push(($scope.elem3.value / 100));
        }
        if ($scope.elem4.text != '' && $scope.elem4.value > 0 && $scope.elem4.value <= 100) {
            clabels.push($scope.elem4.text);
            concentrations.push(($scope.elem4.value / 100));
        }
        if ($scope.elem5.text != '' && $scope.elem5.value > 0 && $scope.elem5.value <= 100) {
            clabels.push($scope.elem5.text);
            concentrations.push(($scope.elem5.value / 100));
        }
        if ($scope.elem6.text != '' && $scope.elem6.value > 0 && $scope.elem6.value <= 100) {
            clabels.push($scope.elem6.text);
            concentrations.push(($scope.elem6.value / 100));
        }
        if ($scope.elem7.text != '' && $scope.elem7.value > 0 && $scope.elem7.value <= 100) {
            clabels.push($scope.elem7.text);
            concentrations.push(($scope.elem7.value / 100));
        }
        if ($scope.elem8.text != '' && $scope.elem8.value > 0 && $scope.elem8.value <= 100) {
            clabels.push($scope.elem8.text);
            concentrations.push(($scope.elem8.value / 100));
        }
        if ($scope.elem9.text != '' && $scope.elem9.value > 0 && $scope.elem9.value <= 100) {
            clabels.push($scope.elem9.text);
            concentrations.push(($scope.elem9.value / 100));
        }
        if ($scope.elem10.text != '' && $scope.elem10.value > 0 && $scope.elem10.value <= 100) {
            clabels.push($scope.elem10.text);
            concentrations.push(($scope.elem10.value / 100));
        }

        if (remainder != 0) {
            clabels.push('');
            concentrations.push((remainder / 100));
        }


        //alert(concentrations + clabels);

        var i;
        var contCheck = 0;
        for (i = 0; i < concentrations.length; i++) {
            contCheck = contCheck + concentrations[i];
        }
        if (contCheck != 1) {
            alert(contCheck);
            $ionicPopup.alert({
                title: 'Error',
                template: 'Your Concentration do not add to 100%'
            });
            return;
        }


        //Contact the BLE service to retrieve the data from the scan
        
            $scope.loading = !$scope.loading;

            var timeout = setTimeout(onTimeout, 15000);
            var fakeScan;
            function onTimeout(){
                $state.go("menu.reset");
            }

            

            BLE.NIRScan().then(
                 // success callback
                 function (res) {
                     $scope.loading = !$scope.loading;
                     $scope.scanResults = res;
                     clearTimeout(timeout);
                     chemo.updateData($scope.scanResults.absorbance, concentrations, clabels, fileName);
                 },
                 // failure callback
                 function () {
                     $scope.loading = !$scope.loading;
                     alert('Error: unable to retrieve reflectance and absorbance from scan.')
                     clearTimeout(timeout);
                 });

        }

    

})

.controller('resetCtrl', function ($scope, BLE) {

})

.controller('menuCtrl', function ($scope, $state, BLE, chemo, database, $ionicPopup, $timeout) {

   

    $scope.showConfirm = function () {
        var confirmPopup = $ionicPopup.confirm({
            title: 'Clear Current Model',
            template: 'Are you sure you want to clear the current model?'
        });

        confirmPopup.then(function (res) {
            if (res) {
                chemo.clearModel();
                
            } else {
                
            }
        });
    };

    $scope.connected = false;

    var init = function () {
        setInterval(checkConnect, 500);
    }

    var checkConnect = function () {
        $scope.connected = BLE.isConnected();
    };

    init();

    $scope.configs = function () {
        if ($scope.connected == true) {
            $state.go('menu.scanconfigselect');
        }
        else {
            $ionicPopup.alert({
                title: 'Error',
                template: 'You must be connected to the device'
            });
        }
    }


})

.controller('plsScanCtrl', function ($scope, BLE, chemo) {
    $scope.loading = true;

    $scope.absorbance = [];
    $scope.reflectance = [];

    var labels = ['label1', 'label2'];
    var concentrations = [1, 2];

    BLE.NIRScan().then(
        // success callback
        function (res) {
            $scope.loading = !$scope.loading;
            var absorbances = res.absorbance;


            getChartVals(res);
            getPLSValues(res);
        },
        // failure callback
        function (error) {
            $scope.loading = !$scope.loading;
            alert('Error: ' + error)
        }
    );

    function getChartVals(scan) {
        var absValues = [];
        var refValues = [];
        for (w in scan.wavelength) {
            absValues.push([scan.wavelength[w], scan.absorbance[w]]);
            refValues.push([scan.wavelength[w], scan.reflectance[w]]);
        }

        $scope.absorbance = [
     	    {
     	        "key": "Series 1",
     	        "values": absValues
     	    }
        ];

        $scope.reflectance = [
     	    {
     	        "key": "Series 1",
     	        "values": refValues
     	    }
        ];
    };
    //bar chart
    function getPLSValues(scan) {
        var results = chemo.infer(scan.absorbance);
        var compounds = results.compounds;
        var concentrations = results.concentrations;
        var chartData = [{
            key: "PLS",
            values: []
        }];

        for (var x = 0; x < compounds.length; x++) {
            if (compounds[x] == '') {
                chartData[0].values.push(['Unknown', concentrations[x]]);
            }
            else {
                chartData[0].values.push([compounds[x], concentrations[x]]);
            }
            
        }
        $scope.PLSData = chartData; //sets data for chart
    }
})

.controller('modelLoadCtrl', function ($scope, $state, $ionicHistory, BLE, chemo, database, $ionicPopup) {

    $scope.ScanPCA = {
        textPCA: 'PCA Models',
        value: 'PCA'
    }
    $scope.ScanPLS = {
        textPLS: 'PLS Models',
        value: 'PLS'
    };
    $scope.testType = {
        type: 'RAW'
    };

    var isPLS = false;
    
    $scope.showModels = function () {
        if($scope.testType.type == "PLS"){
            isPLS = true;
        } else {
            isPLS = false;
        }

        database.listEntries(true, isPLS, function (filenames) {
            //alert(filenames);
            //Need to be finished with the phone. 

            $scope.filenames = filenames;

        });

    }

    $scope.loadModel = function (filename) {

        database.outputModel(filename, isPLS, function (model) {
            chemo.loadModel(model.model, isPLS);
            
            $ionicPopup.alert({
                title: 'Success',
                template: 'Model is now loaded!'
            });

            $ionicHistory.nextViewOptions({
                disableBack: true
            });
            $state.go('menu.pMIRQuickScanner');
        });
    }
    
})
.controller('modelSaveCtrl', function ($scope, $state, $ionicHistory, BLE, chemo, database, $ionicPopup) {
    $scope.isTrained = chemo.isTrained();
    $scope.filename = {
        text: ''
    };


    $scope.saveModel = function () {

        var models = chemo.getModel();
        database.inputModel($scope.filename.text, models, function () {
            
            $ionicPopup.alert({
                title: 'Success',
                template: 'Model saved!'
            });

            $ionicHistory.nextViewOptions({
                disableBack: true
            });
            $state.go('menu.pMIRQuickScanner');
        });
    }


})

.controller('pcaScanCtrl', function ($scope, BLE, chemo, $ionicPopup) {
    $scope.loading = true;
    $scope.closestSample;

    $scope.absorbance = [];
    $scope.reflectance = [];

    BLE.NIRScan().then(
        // success callback
        function (res) {
            $scope.loading = !$scope.loading;
            var absorbances = res.absorbance;
            

            getChartVals(res);
            getPCAValues(res);
        },
        // failure callback
        function (error) {
            $scope.loading = !$scope.loading;
            alert('Error: ' + error)
        }
    );


    function getChartVals(scan) {
        var absValues = [];
        var refValues = [];
        for (w in scan.wavelength) {
            absValues.push([scan.wavelength[w], scan.absorbance[w]]);
            refValues.push([scan.wavelength[w], scan.reflectance[w]]);
        }

        $scope.absorbance = [
     	    {
     	        "key": "Series 1",
     	        "values": absValues
     	    }
        ];

        $scope.reflectance = [
     	    {
     	        "key": "Series 1",
     	        "values": refValues
     	    }
        ];
    };

    function getPCAValues(scan) {
        var results = chemo.infer(scan.absorbance);
        var trainingPoints = results.trainingPoints; //2D array
        var trainingNames = results.trainingSampleNames;
        var inferredPoint = results.recentPoint;    //1D array
        var closestSample = results.closestSample;
        $scope.closestSample = closestSample;
        var chartData = [];
        //store training points first
        //set their colors to black
        chartData.push({
            key: "origin",
            values: [],
            color: '#000000'
        });
        chartData[x].values.push({
            x: 0,
            y: 0,
            size: 1
        });
        var found = false;
        for (var x = 0; x < trainingPoints.length; x++) {
            for (var j = ; j < chartData.length; j++){
                if (chartData[j].key == trainingNames[x]){
                    found = true;
                    chartData[j].values.push({
                        x: trainingPoints[x][0],
                        y: trainingPoints[x][1],
                        size: 2
                    });
                }
            }
            if (!found) {
                chartData.push({
                    key: {},
                    values: []
                });
                if (trainingNames[x] == '') {
                    chartData[x+1].key = 'Unknown';
                }
                else {
                    chartData[x+1].key = trainingNames[x];
                }
                chartData[x+1].values.push({
                    x: trainingPoints[x][0],
                    y: trainingPoints[x][1],
                    size: 2
                });
            }
            found = false;
        }
        //look for the closest sample and turn it red
        for (var i in chartData) {
            if (chartData[i].key == closestSample) {
                chartData[i].color = '#FF0000';
                chartData[i].values[0].size = 10;
            }
        }

        //add infered point, colored forest green
        chartData.push({
            key: {},
            color: {},
            values: []
        });
        var length = chartData.length;
        chartData[length - 1].key = "Sample";
        chartData[length - 1].color = '228B22';
        chartData[length - 1].values.push({
            x: inferredPoint[0],
            y: inferredPoint[1],
            size: 5
        });
        //console.log(data);
        $scope.PCAData = chartData; //sets data for chart
    }
});
 
