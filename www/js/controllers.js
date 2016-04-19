angular.module('app.controllers', ['app.nodeServices'])

.controller('pMIRQuickScannerCtrl', function ($scope, $state, BLE, chemo, database) {
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
        type: ''
    };

    var init = function () {
        setInterval(checkConnect, 2000);
    }

    var checkConnect = function () {
        $scope.connected = BLE.isConnected();
    };

    init();

    $scope.toggleTraining = function () {
        $scope.isTrainingData = !$scope.isTrainingData;
    };

    $scope.startScanSteps = function (device_id) {

        if (!$scope.isTrainingData) {

            if ($scope.testType.type == "RAW") {
                $state.go("menu.simplescanresult");
            }
            else if ($scope.testType.type == "PCA") {
                $state.go("menu.pcaccanresult");

            }
            else if ($scope.testType.type == "PLS") {
                $state.go("menu.plsscanresult");
            }
            else {
                alert("You must select the type of Scan");
                return;
            }



        }
        else {
            $state.go("menu.posttrainscan");
        }
    }

    $scope.databaseTest = function () {
        var File = '{"absorbances":[1, 2, 2, 3, 4,  4, 5, 6, 6],"wavelength":[1, 2, 3, 4, 5, 6],"concentrations":[0.05,0.95],"concentrationLabels":["Thx","NA"]}';
        var obj = JSON.parse(File);
        obj.modelName = 'PLS';
        var fileName = 'model2';
        database.inputDataFile(obj.absorbances, obj.concentrationLabels, obj.concentrations, obj.wavelength, fileName, function () {
            console.log('wrote file');

            database.outputDataFile(fileName, function (data) {
                //alert("success: " + (obj.absorbances[1] == data.absorbances[1]));
                database.listEntries(false, false, function (entries) {
                    debugger;
                    
                });
            });
        });

        /*fileName = fileName + $scope.numba;
        database.inputModel(fileName, obj, function (data) {
            database.outputModel(fileName, true, function (data) {

                database.listEntries(true, true, function (entries) {
                    debugger;

                });
            });
        });*/
    };
})

.controller('connectionsCtrl', function ($scope, BLE) {
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

.controller('simpleScanCtrl', function ($scope, BLE) {
    $scope.scanResults = {};
    $scope.loading = true;

    $scope.absorbance = [];
    $scope.reflectance = [];

    BLE.NIRScan().then(
        function (res) {
            $scope.scanResults = res;
            getChartVals(res);
            $scope.loading = false;
        },
        function () { alert('Error: unable to retrieve reflectance and absorbance from scan.') }
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
    chemo.pcaTest();
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
.controller('postTrainScanCtrl', function ($scope, BLE, database, chemo) {

    $scope.scanResults = {};
    $scope.loading = false;




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


    $scope.Save = function (fname) {

        validation = false;
        retrieve = false;
        save = false;
        remainder = 0;

        var fileName = fname;
        //alert(fileName);
        //Validate user input % and data. 
        total = $scope.elem1.value + $scope.elem2.value + $scope.elem3.value + $scope.elem4.value + $scope.elem5.value;

        if ((total) > 100.0) {
            alert("Your total concentrations are greater than 100");
            return;
        } else if ((total) == 0.0) {
            alert("You must enter concentration data before proceding");
            return;
        }
        if ($scope.name.text = '') {
            alert("You must enter a name for this training data");
            return;
        }

        //fileName = $scope.name.text;



        //getting remainder if it exists
        if ((total) < 100.0) {
            remainder = 100 - total;
            validation = true;
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

        if (remainder != 0) {
            clabels.push('NA');
            concentrations.push((remainder / 100));
        }

        //alert(concentrations + clabels);


        //Contact the BLE service to retrieve the data from the scan
        if (validation) {
            $scope.loading = !$scope.loading;

            BLE.NIRScan().then(
                 // success callback
                 function (res) {
                     $scope.loading = !$scope.loading;
                     $scope.scanResults = res;

                     var fileIds = [];
                     //(absorbances, concentrationLabels, concentrations, fileName)
                     database.inputDataFile($scope.scanResults.absorbance, clabels, concentrations, $scope.wavelength, fileName, function () {
                         fileIds.push(fileName);

                         if (fileIds.length == 2) {
                             debugger;
                             chemo.train(fileIds, function (flag) {
                                 debugger;
                             });
                         }
                     });
                     var secondName = fileName+'2';
                     database.inputDataFile($scope.scanResults.absorbance, clabels, concentrations, $scope.wavelength, fileName, function () {
                         fileIds.push(secondName);

                         if (fileIds.length == 2) {
                             debugger;
                             chemo.train(false, fileIds, function (flag) {
                                 debugger;
                             });
                         }
                     });

                 },
                 // failure callback
                 function () {
                     $scope.loading = !$scope.loading;
                     alert('Error: unable to retrieve reflectance and absorbance from scan.')
                 });
 
        }
    }





})

.controller('ScatterPlotCtrl', function ScatterPlotCtrl($scope, database, chemo) {
    var output;
    $scope.exampleData;
    var absorb = [1, -3, 2, 6, 8, 3, -2];
    var conc = [1, 1, 1, 0, -1];
    var lables = ["a", "b", "c", "d", "e"];
    var wave = [2, 4, 6, 8, 10, 12, 14];

    database.inputDataFile(absorb, conc, lables, wave, "test", function () {
        //console.log("outtermost");
        output = database.outputDataFile("test", function () {
            // console.log("innner 1");
            database.inputDataFile(absorb, conc, lables, wave, "test2", function () {
                // console.log("innner 2");
                output = database.outputDataFile("test2", function () {
                    console.log("innner 3");
                    var result = chemo.train(false, ['test', 'test2'], function () {
                        console.log("innner 4");
                        output = chemo.getPCA();
                        console.log(output);
                        //= output;
                    });
                    console.log(result);
                    //console.log(result);
                });
            });
        });
    });

    var colorArray = ['#CC0000', '#FF6666', '#FF3333', '#FF6666', '#FFE6E6'];
    $scope.colorFunction = function () {
        return function (d, i) {
            return colorArray[i];
        };
    }
})

.controller('plsScanCtrl', function ($scope, BLE) {

})
.controller('pcaScanCtrl', function ($scope, BLE) {


});
 
