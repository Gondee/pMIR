angular.module('app.controllers', [])

.controller('pMIRQuickScannerCtrl', function ($scope, $state, BLE) {
    $scope.connected = false;
    $scope.isTrainingData = false;

    $scope.scanResults = {};

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
        //If data is training data 
        //alert($scope.isTrainingData);
        if (!$scope.isTrainingData) {
            $state.go("menu.simplescanresult");
        }
        else {
            $state.go("menu.posttrainscan");
        }
    }
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

.controller('libraryCtrl', function ($scope) {

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
.controller('postTrainScanCtrl', function ($scope, BLE, database) {

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
                     //(absorbances, concentrationLabels, concentrations, fileName)
                     database.inputDataFile($scope.scanResults.absorbance, clabels, concentrations, $scope.wavelength, fileName);

                     var file = database.outputDataFile(fileName, function (fileData) {
                         console.log("WGHY");
                     });
                 },
                 // failure callback
                 function () {
                     $scope.loading = !$scope.loading;
                     alert('Error: unable to retrieve reflectance and absorbance from scan.')
                 });
                 


        }
    }


    /*
    $scope.inputs = [{
        inputType:'text',
        value: ' ',
        label: 'Name'
    }, {
        inputType: 'text',
        value: 'some text 1',
        label: 'input 2'
    }];

    $scope.doSomething = function () {
        alert('button clicked');
    };

    */
    /*
     <div class="list card">
                <div class="item item-divider">Chemical/Material</div>
                <div class="item item-body">
                    <form class="list">
                        <label class="item item-input">
                            <span class="input-label">Name</span>
                            <input type="text" placeholder="ex. clorine ">
                        </label>
                        <label class="item item-input">
                            <span class="input-label">Concentraion</span>
                            <input type="number" placeholder="ex. .5">
                        </label>
                    </form>
                </div>
            </div>
*/




})
    /*.directive('demoDirective', function ($compile) {
    return {
        template: ' <div class="list card"><div class="item item-divider">Chemical/Material</div><div class="item item-body"><form class="list">',
        replace: true,
        link: function(scope, element) {
            var el = angular.element('<span/>');
            switch(scope.input.inputType) {
                
                case 'text':
                    el.append(' <label class="item item-input"><span class="input-label">Name</span><input type="text" placeholder="ex. clorine "></label><label class="item item-input"><span class="input-label">Concentraion</span><input type="number" placeholder="ex. .5"></label></form></div></div>');
                    //el.append('<input type="text" ng-model="input.value"/><button ng-if="input.value" ng-click="input.value=\'\'; doSomething()">X</button>');
                    break;
            }
            $compile(el)(scope);
            element.append(el);
        }
    }})*/

.controller('ScatterPlotCtrl', function ($scope) {
    $scope.exampleData = [
          {
              "key": "Group 0",
              "values": [{ "x": 0.1905653578931545, "y": 0.8115218253543552, "size": 0.3461829945445061 }, { "x": -0.47275546081985614, "y": -0.21250610156481783, "size": 0.7597237343434244 }, { "x": -0.5943608400643436, "y": 0.48326260219425793, "size": 0.02735756477341056 }, { "x": 0.4529497407477123, "y": -0.2613829468206304, "size": 0.946700036060065 }, { "x": -0.7679040328935364, "y": -1.586936005594271, "size": 0.43301939661614597 }, { "x": -1.5731902534071192, "y": -0.09195950915659948, "size": 0.4368209659587592 }, { "x": 0.05553592818277685, "y": 1.742933013062792, "size": 0.8306681548710912 }, { "x": 1.1877814988973527, "y": -1.3711119089602777, "size": 0.8269749800674617 }, { "x": 0.3064363198255656, "y": -1.667839553436299, "size": 0.12198411440476775 }, { "x": -1.8983536631939086, "y": -0.30140817421374505, "size": 0.9157399751711637 }, { "x": 0.8488366723521106, "y": 1.295855799517563, "size": 0.962707610335201 }, { "x": 0.04917381379553963, "y": 0.1181675943613078, "size": 0.6471372074447572 }, { "x": 0.7289245491658888, "y": -1.437523544728938, "size": 0.11755557032302022 }, { "x": 0.5629218945450293, "y": -0.006342726461880527, "size": 0.4649628330953419 }, { "x": 0.8000392538355794, "y": -0.5021601017044044, "size": 0.6989645406138152 }, { "x": -0.023370322333300483, "y": 1.1371358097794941, "size": 0.6258520961273462 }, { "x": 0.7532529820424834, "y": -1.5173273652093129, "size": 0.8538876241073012 }, { "x": 1.9112037262708281, "y": -0.9995548189037156, "size": 0.9963174634613097 }, { "x": 0.9789011739485827, "y": -0.9841778566713231, "size": 0.7415103658568114 }, { "x": -0.7347622707954421, "y": 0.4025962928769507, "size": 0.6174976546317339 }, { "x": -0.5613983233476523, "y": 0.39581568123378746, "size": 0.26463790889829397 }, { "x": -0.05388729078366278, "y": 0.6683711793675684, "size": 0.10974680096842349 }, { "x": 1.6831239036269066, "y": -1.0049660895776276, "size": 0.24276677169837058 }, { "x": 0.5270582634376473, "y": -0.5988214257540422, "size": 0.5567773135844618 }, { "x": -0.5240116462616992, "y": 1.146009958570413, "size": 0.006196586648002267 }, { "x": -0.20812125647497828, "y": 0.6996467377096869, "size": 0.7625449288170785 }, { "x": 0.3697092607468307, "y": -0.561916499254294, "size": 0.8315129862166941 }, { "x": 0.19189187887399817, "y": -0.2128728937328294, "size": 0.2983735257294029 }, { "x": 0.7179505100531616, "y": 0.6074982425906404, "size": 0.9714579060673714 }, { "x": -1.0258042397131446, "y": 0.028916435404879495, "size": 0.9255245921667665 }, { "x": 0.049858130491165054, "y": 0.16023668632367177, "size": 0.24754037684760988 }, { "x": -0.4480373145257009, "y": -0.6809428379549302, "size": 0.3886829293332994 }, { "x": -2.2812991513382728, "y": -0.33079294312596536, "size": 0.9202477361541241 }, { "x": 0.8451574891358427, "y": 0.7672813961466449, "size": 0.5153329856693745 }, { "x": 0.9093939178973485, "y": -0.6761728190553149, "size": 0.782141275703907 }, { "x": 2.1503140852060727, "y": -0.9199074184181212, "size": 0.18787955376319587 }, { "x": -0.8493702928940353, "y": -1.9134660420041427, "size": 0.9342464371584356 }, { "x": 1.8426928208903286, "y": -1.2276238838923101, "size": 0.7361447520088404 }, { "x": -1.6394957638842569, "y": 1.1874215522015235, "size": 0.03339804639108479 }, { "x": -0.16743144480987487, "y": -1.3360786878739637, "size": 0.17817910155281425 }]
          },
          {
              "key": "Group 1",
              "values": [{ "x": 1.4653418686067552, "y": 0.7410516592097678, "size": 0.9255829956382513 }, { "x": -0.02877491536521995, "y": 0.5971477723050743, "size": 0.20799188618548214 }, { "x": 0.39933969151296006, "y": -0.16091907790207202, "size": 0.5916927580256015 }, { "x": 0.2577554231630996, "y": -0.9577460957918283, "size": 0.5138049270026386 }, { "x": -2.3221649907829915, "y": -0.0044684970626760615, "size": 0.34789505670778453 }, { "x": 0.2858384580920749, "y": -0.009337575343956525, "size": 0.393431298667565 }, { "x": 0.9539376373228463, "y": -1.0195667080212654, "size": 0.7679041607771069 }, { "x": -1.2227832080343977, "y": -1.6489586214792973, "size": 0.054216297809034586 }, { "x": 1.9630250651259868, "y": 1.1245000954887443, "size": 0.5867844161111861 }, { "x": 1.884517259998223, "y": 1.6812398769521144, "size": 0.7839774377644062 }, { "x": 0.4978003737846926, "y": 0.32791831877531546, "size": 0.3412400826346129 }, { "x": 1.2980681519712427, "y": -0.9952740390937576, "size": 0.7193699355702847 }, { "x": 0.6754185913703837, "y": 0.22844385340707063, "size": 0.873178395209834 }, { "x": 1.4494645607923515, "y": -1.705672177886205, "size": 0.7455916644539684 }, { "x": -0.7068137433990378, "y": 0.18847005217283486, "size": 0.7337375746574253 }, { "x": 1.5706659981551991, "y": 1.0527253721909164, "size": 0.09295836021192372 }, { "x": -0.06658107171275701, "y": -0.3087956270025449, "size": 0.9809966967441142 }, { "x": -0.14224623921701202, "y": -1.6443632071496772, "size": 0.17916848207823932 }, { "x": 1.9763574284456442, "y": 0.20114669947357364, "size": 0.19338102429173887 }, { "x": 0.23973168663622052, "y": 1.5275114516206054, "size": 0.2810874693095684 }, { "x": 2.2351738911680545, "y": 1.5308557461376204, "size": 0.5739368079230189 }, { "x": 1.1658679986403646, "y": -0.26037371791998476, "size": 0.49670674302615225 }, { "x": -1.312531308445477, "y": -0.8949612980072548, "size": 0.1320240255445242 }, { "x": 1.7924508296971744, "y": -1.3438146151836563, "size": 0.8639403055422008 }, { "x": 0.20377494482335323, "y": -0.8884032400906033, "size": 0.9905917209107429 }, { "x": -0.9757067613141938, "y": 0.18000624912547655, "size": 0.9214453566819429 }, { "x": 1.2194473247237556, "y": 0.13489969143377384, "size": 0.5392275373451412 }, { "x": 0.4551930087863704, "y": -1.4822357071529828, "size": 0.20265386765822768 }, { "x": -1.1639984350312556, "y": 0.569236671724294, "size": 0.3443497116677463 }, { "x": 0.1822464030561308, "y": -1.02897480186347, "size": 0.9934811990242451 }, { "x": -1.0254650172012922, "y": -0.7122991375637777, "size": 0.5043953969143331 }, { "x": -1.2079845135171494, "y": 0.5018439718253559, "size": 0.6343686871696264 }, { "x": 0.6986798143581763, "y": -2.0794828492590036, "size": 0.7913787113502622 }, { "x": 0.0688680999886745, "y": 0.15536282549168284, "size": 0.5813995015341789 }, { "x": 2.120859697917862, "y": 0.16326612337506827, "size": 0.5073793663177639 }, { "x": -0.18318639159436298, "y": -1.0732401746354177, "size": 0.47343171667307615 }, { "x": 0.7916769280479292, "y": 0.5998659267873365, "size": 0.3798679707106203 }, { "x": 0.7416571321746296, "y": 1.7255401124043879, "size": 0.9249286784324795 }, { "x": -1.0942551743070383, "y": 0.06960216378412018, "size": 0.4393193630967289 }, { "x": -0.541289245876714, "y": -1.597885890037399, "size": 0.27515286463312805 }]
          },
          {
              "key": "Group 2",
              "values": [{ "x": 0.0013830897746349158, "y": 0.8497943642692461, "size": 0.9310796288773417 }, { "x": -0.9537010017212795, "y": -1.1938008511904343, "size": 0.05539561901241541 }, { "x": -1.0580424236734207, "y": 2.139854471729741, "size": 0.48268040106631815 }, { "x": 0.043968415027694996, "y": 0.8852129039510529, "size": 0.3477212116122246 }, { "x": 1.7055412152062768, "y": -1.4348212323474745, "size": 0.9668007399886847 }, { "x": 0.9397547265176092, "y": -0.07296315663759684, "size": 0.9410439992789179 }, { "x": 0.19021526090792454, "y": -1.050431710977525, "size": 0.3422081198077649 }, { "x": -0.7558508461125094, "y": -0.17196373499775727, "size": 0.8589865525718778 }, { "x": 1.3230960643052652, "y": -0.30467315468255535, "size": 0.12701098946854472 }, { "x": 0.6936077935982452, "y": 0.1318938865873131, "size": 0.9957166044041514 }, { "x": 1.6703320017771062, "y": 0.5308740534459415, "size": 0.4085492135491222 }, { "x": 0.44207870580275627, "y": -1.4216129350292004, "size": 0.02583820279687643 }, { "x": -0.8134074836915618, "y": -0.7293792064439725, "size": 0.7247739909216762 }, { "x": -0.8537353029899197, "y": -0.3225185548014425, "size": 0.2267512537073344 }, { "x": -0.7570260272145507, "y": 0.6296645635708668, "size": 0.7163554567378014 }, { "x": -1.3005577520013596, "y": 0.5712696513561867, "size": 0.2385872919112444 }, { "x": -0.3334204242818808, "y": 0.9715187115163707, "size": 0.5692109528463334 }, { "x": 1.7014370461449855, "y": -0.22032222972171522, "size": 0.8695793715305626 }, { "x": 0.4257748777439921, "y": -0.8476442245049051, "size": 0.2962364540435374 }, { "x": -0.9196942844561861, "y": 0.1777524451856555, "size": 0.1807089091744274 }, { "x": 0.684877410380629, "y": 0.11358281964587866, "size": 0.48363478132523596 }, { "x": -0.9653690828962243, "y": 1.084257902152799, "size": 0.5909544662572443 }, { "x": 1.0021906064707191, "y": 0.4687644157812031, "size": 0.08420450799167156 }, { "x": 0.19868249399559348, "y": 0.512297425314742, "size": 0.04527872730977833 }, { "x": 0.4495942543923625, "y": 0.4444404960568513, "size": 0.730865828692913 }, { "x": 1.1312832179369383, "y": 1.0741569702223284, "size": 0.14669232070446014 }, { "x": 0.8767055401560964, "y": 0.3611417746890137, "size": 0.4741408482659608 }, { "x": 0.7177360840981052, "y": 0.9733411454315484, "size": 0.6487463978119195 }, { "x": -0.8636697487976036, "y": 0.02473410854710205, "size": 0.9049212939571589 }, { "x": 1.1026897442162036, "y": -0.47535627454340473, "size": 0.609242383390665 }, { "x": 1.9788844233723657, "y": 1.677322328944795, "size": 0.5720846657641232 }, { "x": -0.618541599373511, "y": -0.2525322859960077, "size": 0.13546850928105414 }, { "x": -0.4795570454831304, "y": 0.014939659798482703, "size": 0.5867933554109186 }, { "x": 0.9751856013993968, "y": 0.607619141175016, "size": 0.7617681375704706 }, { "x": -0.9698251505556951, "y": -0.1531499088650478, "size": 0.2151029680389911 }, { "x": -1.1763935310215579, "y": -1.5342728392222162, "size": 0.5620931594166905 }, { "x": -1.4277918519596748, "y": 0.18299499247162962, "size": 0.4493951094336808 }, { "x": 1.0146951773124973, "y": 1.830509244426352, "size": 0.42843708232976496 }, { "x": 0.32784779097601835, "y": -0.6130699568011613, "size": 0.2840911184903234 }, { "x": 0.9711597717529307, "y": -0.666335396785633, "size": 0.6872496297582984 }]
          },
          {
              "key": "Group 3",
              "values": [{ "x": 0.08977024155251706, "y": -1.4315520281419063, "size": 0.6179190273396671 }, { "x": 0.11861503770586883, "y": 0.23955359638861132, "size": 0.25821112329140306 }, { "x": -1.0237018995145157, "y": -0.5612582258175013, "size": 0.1404807132203132 }, { "x": -0.9393455408596457, "y": 0.6737660860684879, "size": 0.9703105506487191 }, { "x": 0.19159941945806783, "y": -0.8725095986814769, "size": 0.43511714902706444 }, { "x": 1.6895418516897702, "y": 0.32170365030040016, "size": 0.8828782043419778 }, { "x": 0.4842324641678769, "y": 0.5980015980942737, "size": 0.8117240949068218 }, { "x": -0.011520241595057892, "y": 0.1074086719509541, "size": 0.35458783572539687 }, { "x": -0.9232625281509388, "y": -1.376116962711894, "size": 0.26924173487350345 }, { "x": -0.3926740679388665, "y": -0.0295550635718949, "size": 0.2515628270339221 }, { "x": 2.4368058157044747, "y": 0.039706999181704505, "size": 0.6724371737800539 }, { "x": -0.778226535348631, "y": -0.5420294179019276, "size": 0.6696591766085476 }, { "x": 0.43575488326559, "y": -1.6289687641589485, "size": 0.7544872206635773 }, { "x": -0.9350993309515105, "y": -0.4299871079238853, "size": 0.33075249940156937 }, { "x": -1.3349639378528069, "y": -0.9902733966955201, "size": 0.48540881695225835 }, { "x": 1.0463873709302118, "y": 0.9913787826876077, "size": 0.46344535192474723 }, { "x": -1.1659169289449973, "y": -0.7919918137042931, "size": 0.9375686913263053 }, { "x": 0.35177493383903957, "y": 0.9961861752145466, "size": 0.7632603135425597 }, { "x": 0.35935427207932147, "y": 0.09681568636522507, "size": 0.7000876346137375 }, { "x": 1.0119497648455082, "y": -2.0703341139280584, "size": 0.6967110466212034 }, { "x": 0.43727987594153844, "y": 1.089437345844744, "size": 0.6921922359615564 }, { "x": 0.563560494620546, "y": 0.43695106324063826, "size": 0.1764467041939497 }, { "x": -0.17456965716954997, "y": -0.6313026683183839, "size": 0.5587414605543017 }, { "x": -0.4982717719483941, "y": 0.48206962378643803, "size": 0.08632022375240922 }, { "x": -1.2962218417978628, "y": -1.8331266354981168, "size": 0.4631970210466534 }, { "x": -2.105652340185991, "y": 0.5056854307641603, "size": 0.6298802183009684 }, { "x": -0.43114178417645305, "y": 1.260106152531968, "size": 0.35635895072482526 }, { "x": 1.0449334013812757, "y": -0.10920561629552844, "size": 0.4468745777849108 }, { "x": -0.0026484543659800164, "y": 1.736775678549224, "size": 0.9011605640407652 }, { "x": -2.188770011874295, "y": 0.9077936161185935, "size": 0.2698594289831817 }, { "x": 0.06620643943859442, "y": -0.7800817998497923, "size": 0.5229832341428846 }, { "x": -1.7312342213245897, "y": 1.1380057012854383, "size": 0.4515907093882561 }, { "x": -0.6344667799977339, "y": 1.0257947236667349, "size": 0.8023789539001882 }, { "x": -0.9968716208705127, "y": 1.1943450997461196, "size": 0.3913137000054121 }, { "x": -0.3621400944751862, "y": 1.1329260567646853, "size": 0.36375453672371805 }, { "x": 0.6069468363539295, "y": 0.741486280114601, "size": 0.7572341416962445 }, { "x": 1.7001208652466078, "y": 0.5257025898762716, "size": 0.1023493716493249 }, { "x": 0.4869822692301798, "y": 1.5157883876643072, "size": 0.45151000935584307 }, { "x": 1.730883042571316, "y": -0.3508433909809182, "size": 0.6637827688828111 }, { "x": 0.3333898462840203, "y": 0.017763190754013235, "size": 0.3088026640471071 }]
          }
    ];
});
 
