angular.module('app.services', [])

.factory('BLE', function ($q) {

    var connected;
    var connectedBool = false;
    var connected_device_id;

    // reference globals
    var latestScanJSON;
    var latestRefScanJSON;
    var latestScan64;
    var refCoef64;
    var refMatrix64;

    // scan config list globals
    var numScanConfigs = 0;
    var scanConfigIds = [];
    var scanConfigIdIndex = 0;
    var currentScanConfigId = 0;
    var scanConfigNames = [];
    var configDefered;

    //scan config data globals
    var scanConfigDataLength;
    var scanConfigDataArrayPayload;

    // NIRScan data globals
    var scanDataLength;
    var scanDataArrayPayload;
    var scanDefered;

    // service uuids
    var scanConfigsServiceID = '53455205-444C-5020-4E49-52204E616E6F';
    var scanDataInfoServiceID = '53455206-444C-5020-4E49-52204E616E6F';
    var calibrationInfoServiceID = '53455204-444C-5020-4E49-52204E616E6F';

    // scan config characteristic uuids
    var returnScanConfigsCharID = '43484115-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsCharID = '43484114-444C-5020-4E49-52204E616E6F';
    var returnScanConfigsDataCharID = '43484117-444C-5020-4E49-52204E616E6F';
    var requestScanConfigsDataCharID = '43484116-444C-5020-4E49-52204E616E6F';
    var activeScanConfigCharID = '43484118-444C-5020-4E49-52204E616E6F';

    // scan data characteristic uuids
    var startScanCharID = '4348411D-444C-5020-4E49-52204E616E6F';
    var requestScanDataCharID = '43484127-444C-5020-4E49-52204E616E6F';
    var returnScanDataCharID = '43484128-444C-5020-4E49-52204E616E6F';

    // reference calibration char uuids
    var requestReferenceCoeffCharID = '4348410F-444C-5020-4E49-52204E616E6F';
    var returnReferenceCoeffCharID = '43484110-444C-5020-4E49-52204E616E6F';
    var requestReferenceMatrixCharID = '43484111-444C-5020-4E49-52204E616E6F';
    var returnReferenceMatrixCharID = '43484112-444C-5020-4E49-52204E616E6F';

    return {

        devices: [],

        scan: function () {
            var that = this;
            var deferred = $q.defer();

            that.devices.length = 0;

            //  TODO: we need a real disconnect button
            if (connected) {
                var id = connected.id;
                ble.disconnect(connected.id, function () {
                    console.log("Disconnected " + id);
                });
                connected = null;
                connectedBool = false;
            }

            ble.startScan([],  /* scan for all services */
                function (peripheral) {
                    if (peripheral.name == 'NIRScanNano')
                        that.devices.push(peripheral);
                },
                function (error) {
                    deferred.reject(error);
                });

            // stop scan after 5 seconds
            setTimeout(ble.stopScan, 5000,
                function () {
                    deferred.resolve();
                },
                function () {
                    console.log("stopScan failed");
                    deferred.reject("Error stopping scan");
                }
            );

            return deferred.promise;
        },

        connect: function (deviceId) {
            var deferred = $q.defer();

            ble.connect(deviceId,
                function (peripheral) {
                    // success callback
                    connectedBool = true;
                    connected = peripheral;
                    connected_device_id = deviceId;
                    deferred.resolve(peripheral);

                },
                function (reason) {
                    // failure callback
                    connectedBool = false;
                    deferred.reject(reason);
                }
            );

            return deferred.promise;
        },

        isConnected: function () {
            return connectedBool;
        },

        FakeNIRScan: function () {
            var deff = $q.defer();
            
            scan = '{"wavelength":[901.3647034228152,905.2676829029406,909.1663273767334,913.0606368441938,916.9506113053214,922.1305005769744,926.0103600233264,929.8858844633456,933.7570738970323,937.6239283243865,941.4864477454081,945.3446321600973,949.1984815684539,953.0479959704778,958.1739384966593,962.0133378839073,965.8484022648228,969.6791316394058,973.5055260076562,977.3275853695741,981.1453097251594,984.9586990744123,988.7677534173325,993.8397491980422,997.6386885261866,1001.4332928479984,1005.2235621634776,1009.0094964726244,1012.7910957754385,1016.5683600719201,1020.3412893620691,1024.1098836458857,1029.1279326811236,1032.8864119501643,1036.6405562128723,1040.390365469248,1044.1358397192907,1047.8769789630014,1051.6137832003792,1055.3462524314245,1059.0743866561374,1064.0384889459037,1067.7565081558405,1071.4701923594448,1075.1795415567167,1078.884555747656,1082.5852349322627,1086.2815791105368,1089.9735882824784,1093.6612624480872,1098.571417992382,1102.2489771432151,1105.9222012877158,1109.591090425884,1113.2556445577193,1116.9158636832221,1120.5717478023926,1124.2232969152305,1129.085285722497,1132.726719820559,1136.3638189122885,1139.996582997685,1143.6250120767495,1147.2491061494811,1150.8688652158803,1154.484289275947,1158.0953783296811,1162.9034203914762,1166.5043944304343,1170.1010334630598,1173.6933374893529,1177.2813065093135,1180.8649405229417,1184.444239530237,1188.0192035311998,1191.5898325258304,1196.3439278421533,1199.9044418220078,1203.4606207955298,1207.012464762719,1210.5599737235761,1214.1031476781004,1217.641986626292,1221.1764905681512,1224.7066595036777,1229.4068080745292,1232.92686199528,1236.4425809096983,1239.9539648177838,1243.4610137195368,1246.9637276149574,1250.4621065040453,1253.9561503868008,1257.4458592632236,1262.0920610886037,1265.5716549502506,1269.046913805565,1272.5178376545468,1275.9844264971962,1279.446680333513,1282.9045991634973,1286.3581829871491,1289.8074318044683,1294.3996868843765,1297.8388206869197,1301.2736194831302,1304.7040832730086,1308.130212056554,1311.552005833767,1314.9694646046476,1318.3825883691957,1322.9266767120757,1326.3296854618475,1329.728359205287,1333.122697942394,1336.5127016731685,1339.8983703976103,1343.2797041157196,1346.6567028274962,1350.0293665329407,1354.5195081303489,1357.8820568210172,1361.240270505353,1364.5941491833562,1367.943692855027,1371.288901520365,1374.6297751793704,1377.9663138320436,1381.298517478384,1385.7347123303207,1389.0568009618853,1392.3745545871172,1395.6879732060167,1398.9970568185836,1402.301805424818,1405.60221902472,1408.8982976182892,1412.1900412055259,1416.572289311991,1419.8539178844517,1423.13121145058,1426.4041700103758,1429.672793563839,1432.9370821109696,1436.1970356517677,1439.4526541862333,1442.7039377143662,1447.0322390753597,1450.2734075887167,1453.5102410957413,1456.7427395964332,1459.9709030907927,1463.1947315788195,1466.414225060514,1469.6293835358758,1472.840207004905,1477.1145616204267,1480.31527007468,1483.511643522601,1486.7036819641892,1489.891385399445,1493.074753828368,1496.2537872509588,1499.4284856672166,1503.6546735457102,1506.8192569471923,1509.9795053423418,1513.135418731159,1516.2869971136436,1519.4342404897955,1522.577148859615,1525.7157222231017,1528.8499605802563,1533.0222017132778,1536.1463250556562,1539.2661133917022,1542.3815667214155,1545.4926850447964,1548.5994683618446,1551.7019166725602,1554.8000299769433,1557.893808274994,1562.012102662544,1565.0957659458188,1568.175094222761,1571.2500874933705,1574.3207457576475,1577.387069015592,1580.449057267204,1583.5067105124833,1586.5600287514303,1590.6243763935088,1593.6675796176796,1596.706447835518,1599.7409810470238,1602.771179252197,1605.797042451038,1608.818570643546,1611.8357638297218,1614.848622009565,1618.8590229061717,1621.861766071239,1624.8601742299736,1627.8542473823757,1630.8439855284453,1633.8293886681822,1636.8104568015867,1639.7871899286586,1642.759588049398,1646.7160422005331,1649.6783253064966,1652.6362734061277,1655.589886499426,1658.5391645863917,1661.484107667025,1664.4247157413258,1667.360988809294,1671.269276223401,1674.1954342765932,1677.1172573234528,1680.03474536398,1682.9478983981746,1685.8567164260367,1688.7611994475662,1691.6613474627632,1694.5571604716276,1698.411501140263,1701.2971991343516],"absorbance":[2.2636735048911283,2.233404883260922,2.0978446163685023,2.2110798165306216,2.319719332408708,2.431498722047551,2.1698663849914053,2.3040473174405505,2.235644090361166,2.191453577084953,2.4275086717756866,2.24139212963772,2.203553607576861,2.179519928587367,2.2682350995568097,2.2844345837851865,2.2509145167614917,2.2317367983340626,2.250478546846409,2.289325169139602,2.2635633743158605,2.240525385817311,2.2386008818281353,2.3079601011101043,2.2786505345371983,2.316027670250126,2.2360890861723934,2.235065089145709,2.31572894356321,2.2772449841232425,2.3098589005631576,2.2467493769824602,2.335158825177799,2.2870322542878228,2.28118031399865,2.364762565997328,2.2490729396115956,2.252886594076411,2.230693070671702,2.2791625102975437,2.278562273706744,2.337459261290656,2.314033880816613,2.371133343624966,2.257946696153583,2.3404508176173566,2.3297997515687765,2.278959964739051,2.3435383022013756,2.3463689860883834,2.305844494975822,2.26099516377269,2.277218096503824,2.26320226013905,2.2589278414670764,2.218141238186862,2.2616703106832605,2.332091752853857,2.3335042899827005,2.313962707581315,2.3434571277282084,2.2485776418799968,2.234601426469696,2.239643299397413,2.2518620797726228,2.236843243838769,2.273079245347693,2.307839478278612,2.256424361219721,2.2616307071673094,2.2785956942993133,2.2474326315260837,2.2046463139352723,2.283100532243952,2.2822245963090353,2.2651754712011196,2.3099519428961766,2.2787126815867778,2.284146950172305,2.28888086317401,2.2460367418052893,2.2757949375912845,2.23544606211007,2.314432090910293,2.2500036573011877,2.2649311082934904,2.2832976118825625,2.249688216878042,2.2761002574266027,2.2469596494255484,2.3277716112381057,2.3218684805187557,2.272412050914582,2.293773669053673,2.2561019051775957,2.318144642152055,2.278141990725326,2.3017309625061575,2.2771592616864567,2.288035780361863,2.251894700747585,2.2767401475343267,2.28562558736015,2.2973072854751435,2.2699710217489946,2.277735959738231,2.2937672142785033,2.27159996114796,2.3414614321953793,2.3361525050974374,2.2596053452555522,2.3162114696066483,2.305907933300698,2.2528452148789904,2.2637241545085107,2.2479473748961776,2.3178210888060202,2.284451991586222,2.271915069122419,2.301736284127448,2.2858413606658634,2.2776046767706406,2.2990751953233546,2.256374906405912,2.280197466292253,2.2637978598707673,2.3193867074738104,2.300826616049693,2.3488391445519814,2.306813033450154,2.2839283526147525,2.2507148531288337,2.2989340544028165,2.258823382095881,2.33271237634342,2.291292726657413,2.2769218449302135,2.298942450581588,2.258245522608993,2.2898380535488423,2.289924106341194,2.2601915882682753,2.2723213684873285,2.2978478428974953,2.2895499557121917,2.2955107690060035,2.3099513635073747,2.363948049274728,2.371073778395106,2.2906843610729957,2.356629328462961,2.2456962734869172,2.3213622043452906,2.3180762046858057,2.337943134553157,2.309025094209419,2.3563814383902786,2.353506825180996,2.31401604766073,2.3616236667066306,2.3627521488313064,2.318541443959466,2.2840421396321573,2.3512012126500332,2.3085469883945686,2.2779230679050992,2.4041955585112564,2.276972615190887,2.3523278242852705,2.3588008435482593,2.3302008954634146,2.3090440779655057,2.4040692570864453,2.3347403529816524,2.3849990301145785,2.3250889268393298,2.4004814090802467,2.265776136977037,2.3639065318902417,2.3272919809530883,2.420878058635566,2.3279575857517667,2.3610053274616036,2.4461318162384846,2.41929194415162,2.328937258806816,2.3282202253273736,2.3494878815148152,2.3161807324361683,2.3520722441633253,2.3557150681380987,2.3216390234608073,2.2541972772149492,2.3855339104813256,2.4108947129540534,2.4016025254077644,2.3372249329828185,2.356001618448105,2.3880015462686233,2.379332888029664,2.3665708694971177,2.2733138424125943,2.264411987035832,2.48910968180356,2.4241241689638158,2.3288728515690718,2.254106613176516,2.318819475278961,2.356873508735161,2.222733840991365,2.351468882077346,2.4173050275862105,2.2425640956165296,2.5696745410953366,2.4686333750994525,2.4802013415199147,3.5853855204890204,3.183333769915194,3.164027601163744,2.157722276885424,2.5399816774775767,2.2224339649019345,2.6766936096248664,1.907421345053081,3.3941986578390364,null,2.507546675261882,null],"reflectance":[0.005449121544642322,0.005842451511742851,0.007982802481074722,0.0061506382321466005,0.0047893951226263085,0.00370255294909637,0.006762910110313042,0.00496538219455906,0.0058124055613760295,0.006434968464392956,0.003736726639981723,0.00573598319599289,0.006258156109732838,0.00661424185838682,0.005392186446326098,0.005194759144017162,0.005611584193383825,0.005864934978310222,0.005617220254529567,0.005136589159272919,0.005450503535461753,0.0057474422233700015,0.00577296757455031,0.004920847417199758,0.005264407091340243,0.004830280258438089,0.005806452984096015,0.0058201598257992355,0.004833603878812667,0.005281472415660621,0.004899379711559454,0.00566566149177125,0.004622119556518768,0.005163780173601992,0.005233830889205606,0.004317550579841778,0.005635430010208154,0.005586160453075148,0.00587904696157046,0.005258204708190725,0.005265477075367983,0.004597701149425287,0.004852506426022564,0.004254677595652646,0.00552145203570362,0.004566139572621683,0.004679508585689931,0.005260657593145164,0.00453379310645477,0.0045043384347803455,0.004944877133179435,0.005482830704711324,0.005281799407188641,0.005455037492728392,0.005508992213476104,0.006051440420741381,0.0054743138099703475,0.0046548774011918505,0.004639762067792196,0.004853301731736783,0.004534640602056567,0.005641860688156888,0.0058263768790740985,0.0057591275957506755,0.005599353936587471,0.005796378757188808,0.005332375871973738,0.004922214344506108,0.005540840374310944,0.005474813037956822,0.005265071892708425,0.005656754987968768,0.006242430072023509,0.005210740768074453,0.005221261005505151,0.005430308823919913,0.004898330191220037,0.005263653814532414,0.005198200777086346,0.005141846847577493,0.005674965925228176,0.005299135960638011,0.0058150564883742385,0.00484805914081236,0.005623365895949811,0.0054333651359350895,0.00520837670871233,0.005627451790064831,0.0052954118453280696,0.005662919011320963,0.004701412836481548,0.004765752885352562,0.0053405741472614746,0.005084243369734789,0.005544955878845695,0.004806792311547775,0.005270575140478855,0.004991936330268991,0.005282514992503748,0.005151861980190523,0.0055989333705143175,0.005287615323092677,0.005180532619904379,0.005043043502748978,0.00537067630952656,0.0052755050154856,0.005084318935723094,0.0053505698603940124,0.004555526400186595,0.004611556085821146,0.005500404829795473,0.004828236450372923,0.00494415487714073,0.005586692722901541,0.005448486077604603,0.005650054345084407,0.004810374749925247,0.005194550926954638,0.0053466890933180486,0.004991875162022547,0.005177959382033968,0.005277099990034109,0.005022556196319813,0.0055414713674342775,0.00524568893490562,0.005447561477864359,0.004793064712104986,0.005002342042685564,0.004478791604461228,0.004933861641371247,0.005200817895343044,0.00561416467028526,0.005024188736997743,0.0055103174319614655,0.0046482301533769315,0.0051133706384273,0.005285403586523863,0.005024091605717456,0.005517654178502809,0.0051305266334691416,0.005129510151739692,0.005492984983062602,0.005341689396963689,0.005036770434861288,0.005133931198931846,0.005063947925230118,0.004898336726047606,0.00432565571851686,0.004255261181767253,0.005120538536452016,0.004399169255591219,0.0056794166003895545,0.00477131177253105,0.004807549840416538,0.004592581430271087,0.004908795115528537,0.00440168096530963,0.004430912510074326,0.004852705685473982,0.004348869075960731,0.004337583529649015,0.00480240249569596,0.0051994554372354115,0.004454498195598617,0.004914202082230727,0.005273232646139047,0.003942797218365351,0.0052847857439200265,0.004442957671713904,0.004377227877267394,0.00467518826915463,0.004908580548371054,0.003943944028526524,0.004626575428702015,0.004120984394125517,0.004730543856640467,0.0039766611907324535,0.005422803441820143,0.004326069259336591,0.004706607895818792,0.0037942150412828154,0.004699400018399767,0.004355065313230678,0.003579877648432045,0.003808097470240078,0.004688811150706728,0.004696558915537018,0.004472106305100195,0.004828578180661763,0.004445573099502562,0.004408439975158548,0.004768271509498523,0.005569327061334166,0.004115912082784823,0.003882444776160283,0.003966408814868045,0.0046001825584259404,0.0044055322173147836,0.0040925920259477985,0.004175102211228661,0.004299610655485491,0.005329496208588802,0.00543986363379412,0.0032425771517490126,0.0037659611114473114,0.00468950656771407,0.005570489844683393,0.00479932902584493,0.0043966965361161075,0.005987784462613485,0.004451753593330201,0.0038255596000435015,0.00572052521700912,0.0026935525875218572,0.003399121002123422,0.0033097764269331893,0.00025978524419812955,0.0006556411903232712,0.0006854446622989495,0.006954689146469968,0.0028841531805800353,0.005991920396930835,0.002105263157894737,0.012375953101651405,0.0004034607970592191,-0.003190209717065007,0.003107801877630301,-0.011101880522619137],"status":"ok"}';

            deff.resolve(JSON.parse(scan));
            return deff.promise;
        },

        NIRScan: function () {
            latestScanJSON = null;
            latestRefScanJSON = null;

            scanDefered = $q.defer();

            var data = new Uint8Array(1);

            ble.startNotification(connected_device_id, scanDataInfoServiceID, startScanCharID, onStartScanNotify, failureMsg("Notify: recieve notification for scan data"));
            ble.write(connected_device_id, scanDataInfoServiceID, startScanCharID, data.buffer,
                function (res) { console.log("lights"); },
                function (res) {
                    console.log("no lights");
                    scanDefered.reject('not connected to NIRSCAN');
                }
            );

            return scanDefered.promise;
        },

        getCurrentConfigIndex: function (callback) {
            ble.read(connected_device_id, scanConfigsServiceID, activeScanConfigCharID,
                function (res) {
                    var resArray = new Uint16Array(res);
                    var index = resArray[0];
                    callback(index);
                },
                function () { alert("Error: unable to read current scan config."); }
            );
        },

        setScanConfig: function (index, callback) {
            var data = new Uint16Array(1);
            data[0] = index;

            ble.write(connected_device_id, scanConfigsServiceID, activeScanConfigCharID, data.buffer,
                function (res) { callback(); },
                function (res) { alert("Error: unable to set new scan config."); }
            );
        },

        getScanConfigs: function () {
            scanConfigIdIndex = 0;
            scanConfigIds = [];
            scanConfigNames = [];

            configDefered = $q.defer();
            var data = new Uint8Array(1);

            // start notification when characteristic changes (config indicies)
            ble.startNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsCharID, onConfigListData, failureMsg("Notify: recieve notification for scan config list"));

            // request scan configuration list notification.
            ble.write(connected_device_id, scanConfigsServiceID, requestScanConfigsCharID, data.buffer,
                function (res) { console.log("config list request completed"); },
                function (res) { console.log("config list request failed"); }
            );

            return configDefered.promise;

        },

        getLatestScan: function () {
            if (latestScanJSON == null)
                return JSON.parse('{"status":"not ready"}');
            else
                latestScanJSON.status = 'ok';
            return latestScanJSON;
        },

        getLatestReference: function () {
            if (latestRefScanJSON == null)
                return JSON.parse('{"status":"not ready"}');
            else
                latestRefScanJSON.status = 'ok';
            return latestRefScanJSON
        }

    };

    function returnLatestAbsAndRefl() {
        if (latestRefScanJSON == null || latestScanJSON == null)
            scanDefered.reject();

        var absorbance = [];
        var reflectance = [];
        var wavelength = []
        var rawWavelength = latestScanJSON.wavelength;
        var sampleIntensity = latestScanJSON.intensity;
        var referenceIntesity = latestRefScanJSON.intensity;

        var reflect = 0;
        for (w in rawWavelength) {
            // ignore trailing zeroes
            if (rawWavelength[w] != 0) {
                reflect = sampleIntensity[w] / referenceIntesity[w];
                reflectance.push(reflect);
                absorbance.push(-Math.log10(reflect));
                wavelength.push(rawWavelength[w]);
            }
        }

        var result = {};
        result.wavelength = wavelength;
        result.absorbance = absorbance;
        result.reflectance = reflectance;
        result.status = 'ok';

        scanDefered.resolve(result);
    };

    function requestReferenceCoefficents() {
        var data = new Uint8Array(1);

        ble.startNotification(connected_device_id, calibrationInfoServiceID, returnReferenceCoeffCharID, onRefCoeffData, failureMsg("Notify: recieve notification for reference coeff"));
        ble.write(connected_device_id, calibrationInfoServiceID, requestReferenceCoeffCharID, data.buffer,
            function (res) { console.log("requesting reference coefficents"); },
            function (res) { alert("coefficent request failed"); scanDefered.reject('Error requesting coeff'); }
        );
    };

    function requestReferenceMatrix() {
        var data = new Uint8Array(1);

        ble.startNotification(connected_device_id, calibrationInfoServiceID, returnReferenceMatrixCharID, onRefMatrixData, failureMsg("Notify: recieve notification for reference matrix"));
        ble.write(connected_device_id, calibrationInfoServiceID, requestReferenceMatrixCharID, data.buffer,
            function (res) { console.log("requesting reference matrix"); },
            function (res) { alert("coefficent request failed"); }
        );
    };

    function onConfigData(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var raw = new Uint8Array(buffer);
        var packetNum = raw[0];
        var payload = new Uint8Array(buffer.slice(1));

        if (packetNum == 0) {
            scanConfigDataLength = raw[1];
            scanConfigDataArrayPayload = new Uint8Array(0).buffer;
        }

        // append packets
        scanConfigDataArrayPayload = appendBuffer(scanConfigDataArrayPayload, payload.buffer);

        // We've recived all packets (-4 because the first fou bytes of payload is size header)
        if (scanConfigDataArrayPayload.byteLength - 4 == scanConfigDataLength) {

            var trimmedPayload = new Uint8Array(scanConfigDataArrayPayload.slice(4));
            console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

            var success = function (config) {
                scanConfigNames.push({ id: currentScanConfigId, name: config.name, startNM: config.startNM, endNM: config.endNM, repeats: config.repeats });

                if (scanConfigNames.length == scanConfigIds.length) {
                    returnConfigNames();
                    currentScanConfigId = 0;
                } else {
                    scanConfigIdIndex++;
                    requestConfigData(scanConfigIdIndex);
                }
            }

            var failure = function () {
                alert("Error deserializing scan configs");
            }

            var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);

            hello.interpretConfig(trimmed64, success, failure);
        }

    };

    function onStartScanNotify(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var packetNum = new Uint8Array(buffer)[0];
        var payload = new Uint32Array(buffer.slice(1));
        var NIRScanIndex;

        if (packetNum == 255) {
            NIRScanIndex = payload[0];
            console.log("HEYOO: NIRScan Index = " + NIRScanIndex);
            requestNIRScanData(NIRScanIndex);
        }
    };

    function onScanData(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var raw = new Uint8Array(buffer);
        var packetNum = raw[0];
        var payload = new Uint8Array(buffer.slice(1));

        if (packetNum == 0) {
            scanDataLength = new Uint32Array(buffer.slice(1))[0];
            scanDataArrayPayload = new Uint8Array(0).buffer;
        }

        // append packets
        scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

        // We've recived all packets (-4 because the first fou bytes of payload is size header)
        if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

            var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
            console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

            var success = function (scanJSONstr) {
                latestScanJSON = JSON.parse(scanJSONstr);
                requestReferenceCoefficents();
            }

            var failure = function () {
                scanDefered.reject('Error deserializing scan data');
            }

            var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
            latestScan64 = trimmed64;
            hello.interpretScanData(trimmed64, success, failure);
        }
    };

    function onRefMatrixData(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var raw = new Uint8Array(buffer);
        var packetNum = raw[0];
        var payload = new Uint8Array(buffer.slice(1));

        if (packetNum == 0) {
            scanDataLength = new Uint32Array(buffer.slice(1))[0];
            scanDataArrayPayload = new Uint8Array(0).buffer;
        }

        // append packets
        scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

        // We've recived all packets (-4 because the first fou bytes of payload is size header)
        if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

            var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
            console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

            var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
            refMatrix64 = trimmed64;

            // we have everything we need to ge the reference results
            getReferenceScanResults();
        }
    };

    function onRefCoeffData(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var raw = new Uint8Array(buffer);
        var packetNum = raw[0];
        var payload = new Uint8Array(buffer.slice(1));

        if (packetNum == 0) {
            scanDataLength = new Uint32Array(buffer.slice(1))[0];
            scanDataArrayPayload = new Uint8Array(0).buffer;
        }

        // append packets
        scanDataArrayPayload = appendBuffer(scanDataArrayPayload, payload.buffer);

        // We've recived all packets (-4 because the first fou bytes of payload is size header)
        if (scanDataArrayPayload.byteLength - 4 == scanDataLength) {

            var trimmedPayload = new Uint8Array(scanDataArrayPayload.slice(4));
            console.log("TRIMMED: " + Array.apply([], Array.from(trimmedPayload)).join(","));

            var trimmed64 = base64ArrayBuffer(trimmedPayload.buffer);
            refCoef64 = trimmed64;
            requestReferenceMatrix();
        }
    };

    function getReferenceScanResults() {
        var success = function (JSONstr) {
            latestRefScanJSON = JSON.parse(JSONstr);

            //everything should be ready to return to the UI, complete the promise.
            returnLatestAbsAndRefl();
        }

        var failure = function () {
            scanDefered.reject('Error deserializing scan data');
        }

        /* interpretRefScanData requires:
          [in]	pRefCal	Pointer to serialized reference calibration data (refCoef64)
          [in]	calSize	Size of reference calibration data blob (calculated)
          [in]	pMatrix	Pointer to serialized reference calibration matrix (refMatrix64)
          [in]	matrixSize	Size of reference calibration matrix data blob (calculated)
          [in]	pScanResults	Scan results from sample scan data (output of dlpspec_scan_interpret function) (latestScan64)
          [out]	pRefResults	Reference scan data result (returned as JSON)
        */

        hello.interpretRefScanData(refCoef64, refMatrix64, latestScan64, success, failure);
    }

    function requestNIRScanData(index) {
        var data = new Uint32Array(1);
        data[0] = index;

        ble.startNotification(connected_device_id, scanDataInfoServiceID, returnScanDataCharID, onScanData, failureMsg("Notify: recieve notification for scan data"));
        ble.write(connected_device_id, scanDataInfoServiceID, requestScanDataCharID, data.buffer,
            function (res) { console.log("NIRScan Initiated"); },
            function (res) { scanDefered.reject('Scan Failed to initiate'); }
        );
    };

    function requestConfigData(index) {

        currentScanConfigId = scanConfigIds[index];
        var data = new Uint16Array(1);
        data[0] = scanConfigIds[index];

        // start notification when characteristic changes (config data)
        ble.startNotification(connected_device_id, scanConfigsServiceID, returnScanConfigsDataCharID, onConfigData, failureMsg("Notify: recieve notification for scan config data"));

        // request scan configuration data notification.
        ble.write(connected_device_id, scanConfigsServiceID, requestScanConfigsDataCharID, data.buffer,
            function (res) { console.log("config data request completed"); },
            function (res) { console.log("config data request failed"); }
        );


    };

    function appendBuffer(buffer1, buffer2) {
        var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        tmp.set(new Uint8Array(buffer1), 0);
        tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
        return tmp.buffer;
    };

    function returnConfigNames() {
        var alertString = '';
        for (i in scanConfigNames) {
            alertString += scanConfigNames[i].id + ' : ' + scanConfigNames[i].name + '\n';
        }
        configDefered.resolve(scanConfigNames);
    }

    function fakeScanBinary() {
        var scanBin = "116,112,108,0,117,14,0,0,83,40,117,99,35,99,99,99,99,99,99,99,106,106,118,118,117,36,40,102,35,102,35,41,99,35,118,99,99,99,99,118,99,35,99,35,118,118,99,118,118,105,35,41,0,20,0,0,0,3,0,0,0,3,0,0,0,8,0,0,0,8,0,0,0,40,0,0,0,96,3,0,0,1,0,0,0,67,111,108,117,109,110,32,49,0,0,0,0,0,0,0,0,0,0,0,0,15,3,31,2,7,1,18,209,13,240,13,66,14,210,14,1,0,87,0,0,27,6,228,130,130,0,192,249,33,223,184,159,84,148,63,85,189,151,247,93,150,8,191,52,56,209,177,229,53,156,64,153,201,163,115,0,10,237,191,69,148,88,154,9,145,47,191,53,51,54,48,49,55,56,0,237,0,24,25,64,0,46,0,53,51,54,48,49,55,56,0,67,111,108,117,109,110,32,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,132,3,164,6,6,228,0,6,0,71,254,255,255,181,253,255,255,78,253,255,255,153,253,255,255,157,254,255,255,240,0,0,0,109,0,0,0,138,0,0,0,246,0,0,0,183,1,0,0,20,2,0,0,166,1,0,0,243,1,0,0,26,2,0,0,65,2,0,0,192,3,0,0,170,3,0,0,113,4,0,0,84,4,0,0,142,5,0,0,4,5,0,0,237,4,0,0,51,5,0,0,232,5,0,0,195,247,255,255,235,6,0,0,44,5,0,0,107,7,0,0,175,6,0,0,192,5,0,0,60,6,0,0,203,6,0,0,23,5,0,0,223,4,0,0,170,4,0,0,56,4,0,0,250,4,0,0,240,4,0,0,239,4,0,0,21,4,0,0,104,4,0,0,108,4,0,0,228,5,0,0,224,3,0,0,110,4,0,0,136,5,0,0,179,5,0,0,159,4,0,0,217,5,0,0,6,249,255,255,251,4,0,0,243,3,0,0,179,4,0,0,46,5,0,0,110,7,0,0,156,5,0,0,190,5,0,0,226,3,0,0,89,6,0,0,233,4,0,0,71,5,0,0,166,4,0,0,184,5,0,0,229,5,0,0,195,4,0,0,35,6,0,0,104,6,0,0,109,4,0,0,60,6,0,0,212,7,0,0,89,7,0,0,135,5,0,0,142,7,0,0,218,6,0,0,30,249,255,255,216,6,0,0,109,7,0,0,175,7,0,0,35,7,0,0,179,5,0,0,232,7,0,0,120,6,0,0,68,9,0,0,181,8,0,0,237,7,0,0,114,9,0,0,195,7,0,0,127,9,0,0,189,7,0,0,42,8,0,0,215,8,0,0,167,9,0,0,217,8,0,0,210,10,0,0,3,11,0,0,96,11,0,0,45,8,0,0,118,11,0,0,8,10,0,0,161,247,255,255,34,12,0,0,178,12,0,0,130,11,0,0,53,12,0,0,235,10,0,0,254,10,0,0,3,12,0,0,157,11,0,0,101,10,0,0,51,12,0,0,153,11,0,0,205,10,0,0,12,12,0,0,23,10,0,0,125,10,0,0,180,10,0,0,117,10,0,0,197,10,0,0,110,10,0,0,137,9,0,0,71,9,0,0,237,8,0,0,28,9,0,0,60,9,0,0,200,247,255,255,210,8,0,0,157,10,0,0,30,9,0,0,15,9,0,0,110,9,0,0,63,7,0,0,49,9,0,0,195,9,0,0,41,8,0,0,59,10,0,0,111,9,0,0,255,8,0,0,243,10,0,0,167,7,0,0,204,8,0,0,231,7,0,0,101,8,0,0,91,8,0,0,78,9,0,0,235,9,0,0,83,8,0,0,117,7,0,0,20,9,0,0,180,8,0,0,197,247,255,255,165,9,0,0,117,7,0,0,204,8,0,0,216,7,0,0,213,7,0,0,177,8,0,0,122,8,0,0,6,8,0,0,119,7,0,0,139,6,0,0,149,7,0,0,82,8,0,0,141,7,0,0,212,4,0,0,217,5,0,0,36,6,0,0,46,6,0,0,5,5,0,0,37,6,0,0,13,7,0,0,61,5,0,0,194,5,0,0,192,3,0,0,16,4,0,0,118,247,255,255,222,5,0,0,251,7,0,0,237,5,0,0,104,4,0,0,210,3,0,0,143,3,0,0,199,3,0,0,223,4,0,0,213,3,0,0,59,3,0,0,150,2,0,0,67,1,0,0,251,0,0,0,5,3,0,0,6,1,0,0,145,0,0,0,124,2,0,0,134,0,0,0,142,0,0,0,149,1,0,0,86,1,0,0,217,255,255,255,12,1,0,0,189,0,0,0,174,249,255,255,251,255,255,255,2,0,0,0,248,255,255,255,156,254,255,255,189,254,255,255,98,253,255,255,40,255,255,255,107,255,255,255,251,252,255,255,6,253,255,255,172,252,255,255,228,252,255,255,89,251,255,255,77,253,255,255,100,253,255,255,178,250,255,255,252,251,255,255,70,252,255,255,17,252,255,255,45,252,255,255,156,252,255,255,108,249,255,255,93,251,255,255,111,251,255,255,191,248,255,255,73,250,255,255,101,250,255,255,11,250,255,255,21,249,255,255,220,248,255,255,27,249,255,255,248,249,255,255,202,248,255,255,3,248,255,255,174,246,255,255,238,249,255,255,226,247,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
        var binArray = scanBin.split(',');
        var intArray = [];
        for (i in binArray)
            intArray.push(parseInt(binArray[i]));
        var uintArray = Uint8Array.from(intArray);
        return base64ArrayBuffer(uintArray)
    }

    function onConfigListData(buffer) {
        // Decode the ArrayBuffer into a typed Array based on the data you expect
        var packetNum = new Uint8Array(buffer)[0];
        var payload = new Uint16Array(buffer.slice(1));

        if (packetNum == 0) {

            // number of 2 byte scan ids
            numScanConfigs = payload[0] / 2;
        } else {

            // add all the ids to the list
            for (id in payload)
                scanConfigIds.push(payload[id]);
        }

        if (scanConfigIds.length == numScanConfigs) {
            // all the ids have been added, call the callback
            var idString = "";
            for (id in scanConfigIds)
                idString += scanConfigIds[id] + ", ";
            console.log("Here are all the scan config IDs: " + idString);
            requestConfigData(scanConfigIdIndex);
        }

    };

    function failureMsg(msg) {
        console.log(msg);
    };

    function bytesToString(buffer) {
        return String.fromCharCode.apply(null, new Uint8Array(buffer));
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

});


//Service allows calling inputModel, inputDataFile, outputDataFile, and outputModel.
angular.module('app.services')

.service('database', function ($cordovaFile) {

    //Takes a string filename, attaches 
    function getFullName(fileName, isAlgorithm, isPls) {
        var fullName;
        if (isAlgorithm) {
            if (isPls) {
                fullName = "PLS";
            }
            else {
                fullName = "PCA";
            }
        }
        else {
            fullName = "DAT";
        }
        fullName = fullName.concat(fileName);
        fullName = fullName.concat(".pmir");
        return fullName
    };

    function getManagementName(isAlgorithm, isPls) {
        var fileName;
        if (isAlgorithm) {
            if (isPls) {
                fileName = "mngmntPls.pmir";
            }
            else {
                fileName = "mngmntPca.pmir";
            }
        }
        else {
            fileName = "mngmntDat.pmir";
        }
        return fileName;
    };

    function exists(arr, find) {
        var len = arr.length;
        for (var i = 0; i < len; ++i) {
            if (arr[i] == find)
                return true;
        }
        return false;
    };

    function listEntries(isAlgorithm, isPls, callback) {
        var managementFileName = getManagementName(isAlgorithm, isPls);
        var mngmntArr;
        var managementExists = $cordovaFile.checkFile(cordova.file.dataDirectory, managementFileName);
        managementExists.then(
            function (success) {
                //If exists read in Json string and convert to object, add elements and push back to file.
                var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
                mngmntRead.then(
                    function (success) {
                        mngmntArr = angular.fromJson(success);
                        callback(mngmntArr);
                    },
                    function (error) { }
                );
            }, function (error) {
                //If no management file, return no files.
                debugger;
            }
        );
    };

    function addToManagementFile(fileName, managementFileName, callback) {
        var mngmntArr = { entries: [fileName] };

        var managementExists = $cordovaFile.checkFile(cordova.file.dataDirectory, managementFileName);
        managementExists.then(
            function (success) {
                //If exists read in Json string and convert to object, add elements and push back to file.
                var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
                mngmntRead.then(
                    function (success) {
                        mngmntArr = angular.fromJson(success);

                        // only update mngmt if new file created
                        if (!exists(mngmntArr.entries, fileName)) {
                            mngmntArr.entries.push(fileName);
                            var fileDeleted = $cordovaFile.removeFile(cordova.file.dataDirectory, managementFileName).then(
                                function () {
                                    // management file delete success
                                    var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true).then(
                                        function () {
                                            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr)).then(
                                                 function () {
                                                     console.log(JSON.stringify(mngmntArr) + " written to " + managementFileName);
                                                     callback();
                                                 },
                                                 function () { console.log("Management file write failed"); }
                                             );
                                        },
                                        function () {/*create file failed*/debugger; }
                                    );
                                },
                                function () {/*  management file delete failed*/debugger; }
                            );
                        } else {
                            // no need to update mngmtFile Proceed
                            callback();
                        }
                    },
                    function (error) { debugger; /*mngmt read failed*/ }
                );

            }, function (error) {
                //If no management file, create new one and output JSON
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true).then(
                  function () {
                      var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr)).then(
                          function () {
                              console.log(JSON.stringify(mngmntArr) + " written to " + managementFileName);
                              callback();
                          },
                          function () { console.log("Management file creation/write failed"); }
                      );
                  },
                  function () {
                      // create file failed
                      debugger;
                  }
                );
            }
        );
    };

    function writeToFile(fullFileName, output, callback) {
        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            // file exists
            var fileDeleted = $cordovaFile.removeFile(cordova.file.dataDirectory, fullFileName).then(
                function () {
                    // file deleted success
                    var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true).then(
                        function () {
                            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output).then(function () {
                                console.log(JSON.stringify(output) + " written to " + fullFileName);
                                callback();
                            }, function () {
                                debugger;
                            });
                        },
                        function () {
                            debugger;
                        }
                    );
                },
                function () {
                    // file deleted failed
                    debugger;
                }
            );
        },
        function (failure) {
            // file does not exist
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true).then(
                function () {
                    var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output).then(function () {
                        console.log(JSON.stringify(output) + " written to " + fullFileName);
                        callback();
                    }, function () {
                        debugger;
                    });
                },
                function () {
                    debugger;
                }
            );
        });
    };

    /*Module level function
    Input: string fileName- the name of the file to write to.
           pca algorithm OR pls algorithm- the model we want to save.
    Success: New file added pcafileName.pmir OR plsfileName.pmir 
    */
    function inputModel(fileName, algorithm, callback) {
        var output = angular.toJson(algorithm);

        var isPls = algorithm.modelName == "PLS";
        var fullFileName = getFullName(fileName, true, isPls);
        var managementFileName = getManagementName(true, isPls);

        addToManagementFile(fileName, managementFileName, function () {
            writeToFile(fullFileName, output, callback);
        });
        
    };

    function outputModel(fileName, isPls, callback) {
        var fullFileName = getFullName(fileName, true, isPls);
        var model;
        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        outputExists.then(
            function (success) {
                var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
                fileRead.then(
                    function (success) {
                        model = angular.fromJson(success);
                        callback(model);
                    },
                    function (error) { debugger; /*file read failed*/}
                );
            },
            function (error) {
                /*File does not exist*/
                console.log("Error: file: " + file + Name + " does not exist");
                debugger;
                callback(null);
            }
        );
    };

    function inputDataFile(absorbances, concentrationLabels, concentrations, wavelength, fileName, callback) {
        var fullFileName = getFullName(fileName, false);
        var managementFileName = getManagementName(false);
        var output = { absorbances: absorbances, concentrations: concentrations, concentrationLabels: concentrationLabels, wavelength: wavelength };
        output = angular.toJson(output);

        addToManagementFile(fileName, managementFileName, function () {
            writeToFile(fullFileName, output, callback);
        }); 
    };

    function outputDataFile(fileName, callback) {
        var fullFileName = getFullName(fileName, false);
        var data;
        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(
                function (success) {
                    data = angular.fromJson(success);
                    data.success = 0;
                    callback(data);
                },
                function (error) {
                    debugger;
                }
            );
        },
        function (error) {
            // file does not exist
            debugger;
        });
    };

    function inputNVD(wavelengths, absorbances) {
        var outputObj = [];
        var numWavelengths = wavelengths.length;
        var numAbsorbances = absorbances.length;
        if (numWavelengths != numAbsorbances) {
            return false;
        }
        for (var i = 0; i < numWavelengths; ++i) {
            var newObj = {
                "key": {},
                "value": { "x": wavelengths[i], "y": absorbances[i] }
            };
            outputObj[i] = newObj;
        }
        var fullFileName = "nvdDump.pmir";
        var dumpExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        var dumpFileCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, outputObj);
    }

    return { inputModel: inputModel, outputModel: outputModel, inputDataFile: inputDataFile, outputDataFile: outputDataFile, listEntries: listEntries, inputNVD: inputNVD };
});

