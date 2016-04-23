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
                $state.go("menu.pcaccanresult");
                chemo.train(false);

            }
            else if ($scope.testType.type == "PLS") {
                $state.go("menu.plsscanresult");
                chemo.train(true);
            }
            else {
                alert("You must select the type of Scan");he
                return;
            }



        }
        else {
            //Chemo is called post scan
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

.controller('simpleScanCtrl', function ($scope, BLE, $state) {
    $scope.loading = true;

    $scope.absorbance = [];
    $scope.reflectance = [];

    var timeout = setTimeout(onTimeout, 15000);

    function onTimeout() {
        $state.go("menu.reset");
    }



    BLE.FakeNIRScan().then(
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
.controller('postTrainScanCtrl', function ($scope, BLE, database, chemo, $state) {

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
            clabels.push('NA');
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
            alert("Your Concentrations don't add to 100%");
            return;
        }


        //Contact the BLE service to retrieve the data from the scan
        
            $scope.loading = !$scope.loading;

            var timeout = setTimeout(onTimeout, 15000);
            var fakeScan;
            function onTimeout(){
                $state.go("menu.reset");
            }

            

            BLE.FakeNIRScan.then(
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

.controller('ScatterPlotCtrl', function ScatterPlotCtrl($scope, database, chemo) {
    
    //this and piechart controller need to be integrated, messy until we meet up tomorrow
    var test = [[0.1, 0.2]]; //testing 2D array

    //putting the data into a json object
    var data = [];

    for (var num in test) {
        data.push({
            key: {},
            values: []
        });
        data[num].key = "Sample " + num;
        data[num].values.push({
            x: test[num][0],
            y: test[num][1],
            size: 10
        });
    }
    //console.log(data);
    $scope.exampleData = data; //sets data for chart

    //colors, hopefully different colors for each sample
    var colorArray = ['#CC0000', '#FF6666', '#FF3333'];//, '#FF6666', '#FFE6E6'];
    $scope.colorFunction = function () {
        return function (d, i) {
            return colorArray[i];
        };
    }
})

.controller('PieChartCtrl', function PieChartCtrl($scope, database, chemo) {
    $scope.exampleData = [
     	{ key: "One", y: 5 },
        { key: "Two", y: 2 },
        { key: "Three", y: 9 },
        { key: "Four", y: 7 },
        { key: "Five", y: 4 },
        { key: "Six", y: 3 },
        { key: "Seven", y: 9 }
    ];
    $scope.xFunction = function () {
        return function (d) {
            return d.key;
        };
    }
    $scope.yFunction = function () {
        return function (d) {
            return d.y;
        };
    }
})

.controller('resetCtrl', function ($scope, BLE) {

})

.controller('plsScanCtrl', function ($scope, BLE) {

})

.controller('modelLoadCtrl', function ($scope, BLE, chemo, database) {

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
    
    

    $scope.showModels = function () {
        var isPLS = false;
        if($scope.testType.type == "PLS"){
            isPLS = true;
        }

        database.listEntrties(true, $scope.testType.type, function (filenames) {
            //alert(filenames);
            //Need to be finished with the phone. 

            $scope.filenames = filenames;

        });

    }

    $scope.loadModel = function (filename) {

        database.outputModel(filename, isPLS, function () {
            chemo.chemoLoadModel(model, isPLS);
        })

        //chemo.chemoLoadModel(model, isPLS);

    }
    
    

    
    
})
.controller('modelSaveCtrl', function ($scope, BLE, chemo, database) {
    $scope.isTrained = chemo.isTrained();
    $scope.filename = {
        text: ''
    };


    $scope.saveModel = function () {

        var models = chemo.getModel();
        database.inputModel($scope.filename.text, models, function () {
            alert("Model Saved");
        });
    }


})

.controller('pcaScanCtrl', function ($scope, BLE, chemo) {



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
        if (!chemo.isTrained()) {
            chemo.train(false, scan.absorbance, concentrations, labels);
        }
        var results = chemo.infer(scan.absorbance);
        debugger;
        var trainingPoints = results.trainingPoints; //2D array
        var trainingNames = results.trainingSampleNames;
        var inferredPoint = results.recentPoint;    //1D array
        var closestSample = results.closestSample;
        var chartData = [];
        debugger;
        //store training points first
        //set their colors to black
        for (var x = 0; x < trainingPoints.length; x++){
            chartData.push({
                key: {},
                color: {},
                values: []
            });
            chartData[x].key = trainingNames[x];
            chartData[x].color = '#000000';
            chartData[x].values.push({
                x: trainingPoints[x][0],
                y: trainingPoints[x][1],
                size: 10
            });
        }
        //look for the closest sample and turn it red
        for (var i in chartData) {
            if (chartData[i].key == closestSample) {
                chartData[i].color = '#FF0000';
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
            size: 10
        });
        //console.log(data);
        $scope.PCAData = chartData; //sets data for chart
    }
});
 
