var lib_cordova = require('ng-cordova');

//This file includes services which rely on node public modules.
angular.module('app.nodeServices', ['ionic', 'ngCordova'])

.service('chemo', function (database) {

    var lib_pls = require('ml-pls');
    var lib_pca = require('ml-pca');
    var lib_matrix = require('ml-matrix');

    var chemoIsPls;
    var chemoConcentrationLabels = [];
    var chemoTrainingAbsorbances = [];
    var chemoTrainingConcentrations = [];
    var chemoPCACompressed = [];
    var chemoNumLatentVectors = 0;
    var chemoIsTrained = false;
    var chemoSampleNames = [];
    //represents a Pls or PCA module.
    var chemoAlgo;

    var chemoFlags = {
        success: 0,
        failFileID: 1,
        failTrainingRowMismatch: 2,
        failNotEnoughLabels: 3,
        failNoTrainingData: 4,
        failUnknownTrainError: 5,
        failUnknownInferenceError: 6,
        failAbsorbanceMismatch: 7,
        failConcentrationMismatch: 8,
        failFileNotSaved: 9,
        failInferenceRowMismatch: 10,
        failInferenceColumnMismatch: 11
    };

    function consoleOutput(who, identifier, message) {
        var name = "";
        switch (who) {
            case 0:
                name = name.concat("chemoTrain: ");
                break;
            case 1:
                name = name.concat("ChemoInfer: ");
                break;
        }
        name = name.concat(identifier);
        return name.concat(message);
    };

    function chemoAddLabels(labels) {

        var newLabelsLength = labels.length;
        var oldLabelsLength = chemoConcentrationLabels.length;
        //locationArr ([int]) holds the number of the column of a concentration matrix this label is linked to
        var locationArr = [];
        //Look to see if we have seen this label before
        for (var i = 0; i < newLabelsLength; ++i) {
            var notFound = true;
            for (var j = 0; j < oldLabelsLength; ++j) {
                //If we have seen before, make a note of what column the concentration will go in
                //inside of training-Y matrix.
                if (labels[i] == chemoConcentrationLabels[j]) {
                    notFound = false;
                    locationArr[locationArr.length] = j;
                }
            }
            //If never seen before, we add the label to a listing of labels.
            if (notFound) {
                chemoConcentrationLabels[oldLabelsLength] = labels[i];
                locationArr[locationArr.length] = oldLabelsLength;
            }
        }
        return locationArr;
    };

    //Adds a file with the measured absorptions and estimated concentrations.
    function chemoAddFile(absorbances, concentrationLabels, concentrations) {
        databaseAddFile(absorbances, concentrationLabels, concentrations);
    };

    function chemoAddConcentration(newConcentration, currRow, currCol) {
        //add index
        var numRow = chemoTrainingConcentrations.length;
        var numCol = 0;
        if (numRow > 0) {
            numCol = chemoTrainingConcentrations[0].length;
        }

        //If past last row by 1, make a new row (full of not-init)
        if (currRow == numRow) {
            numRow += 1;
            chemoTrainingConcentrations[currRow] = [];
            var currRowArr = chemoTrainingConcentrations[currRow];
            for (var i = 0; i < numCol; ++i) {
                currRowArr[i] = 0;
            }
        }
        //We pass the last column- add new column with 0 states.
        if (currCol == numCol) {
            numCol += 1;
            for (var i = 0; i < numRow; ++i) {
                var currRowArr = chemoTrainingConcentrations[i];
                if (i == currRow) {
                    currRowArr[currCol] = newConcentration;
                }
                else {
                    //When we add a column, we leave indices 0
                    currRowArr[currCol] = 0;
                }
            }
        }
        else {
            //In this situation we are overwriting a 0
            chemoTrainingConcentrations[currRow][currCol] = newConcentration;
        }
    };

    function chemoGetModel() {
        if (chemoIsTrained) {
            var model = chemoAlgo.export();
            model.concentrationLabels = chemoConcentrationLabels;
            if (!chemoIsPls) {
                model.PCACompressed = chemoPCACompressed;
            }
            return { model: model, status: chemoFlags.success };
        }
        return { model: null, status: chemoFlags.failNoTrainingData };
    };

    //Add better error handling.
    function chemoLoadModel(model, isPls) {
        chemoConcentrationLabels = model.concentrationLabels;
        if (isPls) {
            chemoIsPls = true;
            chemoAlgo = new lib_pls(true, model);
            chemoIsTrained = true;
        }
        else {
            chemoIsPls = false;
            chemoAlgo = new lib_pca(null, null, true, model);
            chemoPCACompressed = model.PCACompressed;
            chemoIsTrained = true;
        }
    };

    function flagToString(flag) {
        var result = "NO SUCH FLAG";
        switch (flag) {
            case 0:
                result = "success";
                break;
            case 1:
                result = "failFileID";
                break;
            case 2:
                result = "failTrainingRowMismatch";
                break;
            case 3:
                result = "failNotEnoughLabels";
                break;
            case 4:
                result = "failNoTrainingData";
                break;
            case 5:
                result = "failUnknownTrainError";
                break;
            case 6:
                result = "failUnknownInferenceError";
                break;
            case 7:
                result = "failAbsorbanceMismatch";
                break;
            case 8:
                result = "failConcentrationMismatch";
                break;
            case 9:
                result = "failFileNotSaved";
                break;
            case 10:
                result = "failInferenceRowMismatch";
                break;
            case 11:
                result = "failInferenceColumnMismatch";
                break;
        }
        return result;
    };

    function newTrainPls() {
        var numColAbsorbances = chemoTrainingAbsorbances[0].length;
        var numColConcentrations = chemoTrainingConcentrations[0].length;
        //Take 10% of data (probably of Y).
        var maxVectors = Math.min(numColAbsorbances, numColConcentrations);
        var numLatentVectors = Math.floor(maxVectors * 0.1);
        if (numLatentVectors == 0) {
            numLatentVectors += 1;
        }
        var explainedVariances = 0;
        while (numLatentVectors <= maxVectors && explainedVariances < 0.85) {
            chemoAlgo = new lib_pls();
            var options = {
                latentVectors: numLatentVectors,
                tolerance: 1e-5
            };
            try {
                //It is very clean to reprsent all absorbances as a row, but- each one considered
                //a variable in PLS, thus each one has its own row (columns differentiate sample)
                /*var absorbancesTranspose = new lib_matrix(chemoTrainingAbsorbances);
                absorbancesTranspose = absorbancesTranspose.transpose();
                var concentrationsTranspose = new lib_matrix(chemoTrainingConcentrations);
                concentrationsTranspose = concentrationsTranspose.transpose();
                console.log(concentrationsTranspose);
                console.log(absorbancesTranspose);
                chemoAlgo.train(absorbancesTranspose, concentrationsTranspose, options);*/
                chemoAlgo.train(chemoTrainingAbsorbances, chemoTrainingConcentrations, options);
            }
            catch (err) {
                console.log(err);
                return chemoFlags.failUnknownTrainError;
            }
            explainedVariances = chemoAlgo.getExplainedVariance();
            if (explainedVariances < 0.85) {
                numLatentVectors++;
            }
        }
        chemoIsPls = true;
        return chemoFlags.success;
    };

    function newTrainPca() {
        //Get principle components associated with training set absorbances X.
        try {
            chemoAlgo = new lib_pca(chemoTrainingAbsorbances);
        }
        catch (err) {
            return chemoFlags.failUnknownTrainError;
        }
        chemoNumLatentVectors = 2; //Temporary- 2 components so that we can have the x-y of a graph
        //chemoNumLatentVectors = floor(numColAbsorbances * 0.1);
        var explainedVariances = chemoAlgo.getExplainedVariance();
        consoleOutput(0, "Latent Vectors", chemoNumLatentVectors);
        //How many vectors to get ~85% of variance?
        /*chemoNumLatentVectors = floor(0.85 / explainedVariances);
        if (chemoNumLatentVectors == 0) {
            chemoNumLatentVectors += 1;
        }*/
        try {
            //Check parameter requirements
            chemoPCACompressed = chemoAlgo.project(chemoTrainingAbsorbances, chemoNumLatentVectors);
        }
        catch (err) {
            return chemoFlags.failUnknownTrainError;
        }
        var numPoints = chemoPCACompressed.length;
        var tempstring = "projected";
        for (var i = 0; i < numPoints; ++i) {
            consoleOutput(0, tempstring.concat(i), chemoPCACompressed[i]);
        }
        return chemoFlags.success;
    };

    function newTrain(isQuantify) {
        chemoIsPls = isQuantify;
        if (chemoTrainingAbsorbances.length == 0) {
            //No training data means no success (also sometimes we use 0th row to find num of col)
            return { status: chemoFlags.failNoTrainingData };
        }
        if (chemoTrainingAbsorbances.length != chemoTrainingConcentrations.length) {
            //There should be an array of concentrations for every array of absorbances
            return { status: chemoFlags.failTrainingRowMismatch };
        }
        if (chemoConcentrationLabels.length != chemoTrainingConcentrations[0].length) {
            //We don't have a name for each material (Cry)
            return { status: chemoFlags.failNotEnoughLabels };
        }
        var result = false;
        if (isQuantify) {
            result = newTrainPls();
        }
        else {
            result = newTrainPca();
        }
        if (result == chemoFlags.success) {
            chemoIsTrained = true;
        }
        return result;
    };

    function newInferPls(measuredAbsorbances) {
        alert("Enter II");
        var inferred = [];
        try {
            alert("Before transpose");
            var matForm = [measuredAbsorbances];
            var measuredTranspose = new lib_matrix(matForm);
            measuredTranspose = measuredTranspose.transpose();
            alert("After transpose");
            inferred = chemoAlgo.predict(matForm);
            console.log(inferred);
            var inferredTranspose = new lib_matrix(inferred);
            inferredTranspose.transpose();
            inferred = inferredTranspose;
            console.log(inferred);
            alert("After Inferred");
        }
        catch (err) {
            alert("Really bad");
            return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
        }
        if (inferred.length == 0) {
            alert("No length");
            return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
        }
        if (inferred[0].length != chemoTrainingConcentrations[0].length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failConcentrationMismatch };
        }
        //The implementation provides the best answer first
        var inferredTranspose = new lib_matrix(inferred);
        inferredTranspose = inferredTranspose.transpose();
        var allConcentrations = inferredTranspose[0];

        //Find the chemical names which have been detected.
        var labels = [];
        var nonZeroConcentrations = [];
        for (var i = 0; i < allConcentrations.length; ++i) {
            if (allConcentrations[i] != 0) {
                labels[labels.length] = chemoConcentrationLabels[i];
                nonZeroConcentrations[nonZeroConcentrations.length] = allConcentrations[i];
            }
        }

        return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
    };

    function newInferPca(measuredAbsorbances) {
        var measured = [];
        try {
            //Append observed data to training data (temporary, observed data is NOT training data)
            var matForm = chemoTrainingAbsorbances.slice(0);
            matForm[matForm.length] = measuredAbsorbances;
            measured = chemoAlgo.project(matForm, chemoNumLatentVectors);
            measured = measured[measured.length - 1];
        }
        catch (err) {
            return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
        }
        consoleOutput(1, "Recent Point", measured);
        var distances = [];
        var numPoints = chemoPCACompressed.length;
        //alert(numPoints);
        //alert(chemoTrainingAbsorbances.length);
        consoleOutput(1, "num points", numPoints);
        if (numPoints != chemoTrainingAbsorbances.length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failInferenceRowMismatch };
        }
        if (chemoNumLatentVectors != chemoPCACompressed[0].length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failInferenceColumnMismatch };
        }
        var distance = [];
        for (var i = 0; i < numPoints; ++i) {
            var sum = 0;
            var numComponents = chemoPCACompressed[i].length;
            consoleOutput(1, "num components", numComponents);
            for (var j = 0; j < numComponents; ++j) {
                //(x1-x2)^2
                var component = measured[j] - chemoPCACompressed[i][j];
                component = component * component;
                sum += component;
            }
            //Square root of distances squared is the euclidean distance formula
            sum = Math.sqrt(sum);
            distance[i] = sum;
        }
        //Linear search to find point with minimum distance from new observation
        var minimumDistance = distances[0];
        var minimumIndex = 0;
        for (var i = 1; i < numPoints; ++i) {
            if (distances[i] < minimumDistance) {
                minimumDistance = distances[i];
                minimumIndex = i;
            }
        }
        var closestSample = chemoSampleNames[minimumIndex];
        var closestSampleXY = chemoPCACompressed[minimumIndex];
        var allConcentrations = chemoTrainingConcentrations[minimumIndex];
        var labels = [];
        var nonZeroConcentrations = [];
        for (var i = 0; i < allConcentrations.length; ++i) {
            if (allConcentrations[i] != 0) {
                labels[labels.length] = chemoConcentrationLabels[i];
                nonZeroConcentrations[nonZeroConcentrations.length] = allConcentrations[i];
            }
        }
        consoleOutput(1, "labels", labels);

        //New version returns a matrix with the 2D coordinates for every point (trainingPoints)
        //And the last point (which was just inferred) is recentPoint.
        //return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
        //Someone should refactor this project. My naming conventions are just bad.
        return {
            trainingPoints: chemoPCACompressed, trainingSampleNames: chemoSampleNames, recentPoint: measured,
            closestSample: closestSample, closestSampleXY: closestSampleXY, compounds: labels,
            concentrations: nonZeroConcentrations, status: chemoFlags.success
        };
    };

    function isTrained() {
        return chemoIsTrained;
    }

    function newInfer(measuredAbsorbances) {
        //Replace NaNs with 0s in the absorbances
        for (var i = 0; i < measuredAbsorbances.length; ++i) {
            if (isNaN(measuredAbsorbances[i])) {
                measuredAbsorbances[i] = 0;
            }
        }
        if (!chemoIsTrained) {
            return { compounds: [], concentrations: [], status: chemoFlags.failNoTrainingData };
        }
        if (measuredAbsorbances.length != chemoTrainingAbsorbances[0].length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failAbsorbanceMismatch };
        }
        var result;
        if (chemoIsPls) {
            alert("Enter");
            result = newInferPls(measuredAbsorbances);
        }
        else {
            //alert("Huh");
            result = newInferPca(measuredAbsorbances);
        }
        return result;
    };

    function pcaTest() {

        var trainObj = {
            "absorbance": [[-0.765773, -0.755362, -0.764936, -0.691396667, -0.715760333, -0.714011667, -0.728986333, -0.698326333, -0.703601667, -0.660518667, -0.661541667, -0.631785667,
         -0.625093, -0.617427667, -0.591532, -0.581993667, -0.615171667, -0.560689, -0.559161, -0.559406, -0.562066667, -0.553445, -0.565318333, -0.590291667, -0.559254667,
         -0.582422667, -0.576666, -0.579961, -0.575716, -0.583901667, -0.589918333, -0.586692333, -0.609547, -0.612291, -0.600874333, -0.629129, -0.586395667, -0.595778667,
         -0.574191333, -0.575300667, -0.571125, -0.561857667, -0.551757667, -0.545704667, -0.537233, -0.517938, -0.516602667, -0.554790667, -0.524674667, -0.524977333, -0.535669,
         -0.537716667, -0.519551667, -0.527367667, -0.510381, -0.499354667, -0.487601333, -0.493684667, -0.417895, -0.409746667, -0.375282, -0.357620667, -0.35812, -0.338005333, -0.322363667,
         -0.328224667, -0.320826, -0.295086, -0.289352, -0.285095667, -0.267713333, -0.275107667, -0.272986333, -0.282804333, -0.271613667, -0.288159667, -0.299387, -0.287402, -0.290475667,
         -0.271041667, -0.304787, -0.287322, -0.295600667, -0.287979333, -0.269631667, -0.279276333, -0.269403333, -0.270142667, -0.26694, -0.250036333, -0.265703667, -0.270005333, -0.252489,
         -0.245253333, -0.227426333, -0.220819, -0.228221, -0.242657, -0.246414667, -0.225711333, -0.231787333, -0.221540667, -0.228167, -0.19432, -0.21165, -0.194914333, -0.169008, -0.176579,
         -0.145030667, -0.131696, -0.121805333, -0.096678, -0.101857667, -0.080744, -0.050926, -0.035525333, -0.024997, -0.021256333, -0.004948, 0.020037667, 0.036401667, 0.024504333, 0.044438667,
         0.041815333, 0.062761, 0.095212, 0.115397667, 0.163987, 0.195636667, 0.212448333, 0.237101333, 0.262960667, 0.241895667, 0.283410667, 0.287339667, 0.301937667, 0.315538, 0.327195333,
         0.350736667, 0.343447333, 0.386778, 0.399684333, 0.396065, 0.386707667, 0.39546, 0.374193667, 0.388010667, 0.365974333, 0.32271, 0.314041667, 0.287396, 0.277612667, 0.278821333, 0.279779,
         0.257410333, 0.269245667, 0.297347333, 0.310642333, 0.298887667, 0.290849333, 0.278852667, 0.241339667, 0.245260333, 0.309354333, 0.307551667, 0.342091, 0.323178, 0.335276667, 0.324714,
         0.333052667, 0.298411, 0.276057, 0.255892667, 0.20588, 0.198687333, 0.140418, 0.202144333, 0.185306667, 0.193773, 0.151555333, 0.170836667, 0.166241, 0.150265333, 0.165891667, 0.153203,
         0.171978667, 0.135035333, 0.171056333, 0.226193, 0.172017, 0.250897667, 0.272258333, 0.181365, 0.163707333, 0.163864667, 0.151830333, 0.149407, 0.106329667, 0.078809, 0.070746,
         0.11149, 0.038959333, 0.080831, 0.091370667, 0.075120667, 0.004750333, 0.003488667, 0.067449333, 0.039094667, 0.102002667, 0.057333333, 0.162127333, 0.250274333, 0.077106333, 0.233324,
         0.255321, 0.362438333, -0.049200333, -0.073282333, -0.470448, -0.3148285, -0.904675, -0.717254, -0.887588, 0, 0, 0, 0],
         [-0.346494, -0.333019667, -0.345209333, -0.273450667, -0.296618, -0.319806667, -0.357994667, -0.359194667, -0.390678333, -0.352351333, -0.375375333, -0.365283667, -0.367786,
-0.377347, -0.364150667, -0.360935333, -0.391549333, -0.340471, -0.343162, -0.350235333, -0.354796667, -0.345711667, -0.343914333, -0.375251333, -0.340335, -0.351494667, -0.341482667,
-0.342958667, -0.335297, -0.337005, -0.342445333, -0.336498, -0.359284333, -0.357069667, -0.356951333, -0.380603, -0.342713, -0.353195, -0.338417333, -0.348366667, -0.344996333,
-0.345818, -0.350619333, -0.347262333, -0.351390667, -0.339654667, -0.343484333, -0.39149, -0.365679667, -0.376643333, -0.395523, -0.398150667, -0.374973667, -0.393207, -0.380214667,
-0.371249333, -0.361347, -0.367398333, -0.280003, -0.253713667, -0.202874, -0.174532333, -0.133371333, -0.091682, -0.041829667, -0.016723667, 0.022673667, 0.101357667, 0.16169,
0.236375333, 0.299275333, 0.346076333, 0.379405, 0.374559, 0.401452, 0.380878667, 0.361614, 0.387718, 0.347634, 0.312769, 0.229944, 0.196662333, 0.128665333, 0.078495, 0.035087,
-0.038615333, -0.059406667, -0.100627333, -0.128212667, -0.143382333, -0.194965333, -0.210567, -0.221471333, -0.239109333, -0.244455, -0.256854667, -0.275507333, -0.302987333,
-0.317492, -0.308005667, -0.321367, -0.325708667, -0.344820667, -0.326235333, -0.356285, -0.347055667, -0.340922, -0.358300667, -0.331218333, -0.341792, -0.343691, -0.330163333,
-0.346589667, -0.329959, -0.303252, -0.282688, -0.261812667, -0.22541, -0.177715333, -0.118044667, -0.080124, -0.036427667, 0.026159667, 0.060338, 0.129542, 0.180823, 0.213885333,
0.229874333, 0.271707667, 0.226728667, 0.213763667, 0.225279, 0.221757, 0.270332667, 0.275579333, 0.260166333, 0.229597667, 0.229592667, 0.210922, 0.189193667, 0.173659333, 0.138554,
0.124905667, 0.094087333, 0.076156667, 0.033969, 0.019838667, -0.008025, -0.042881667, -0.063735, -0.084808333, -0.087673333, -0.112889, -0.117730333, -0.143193, -0.140016667,
-0.138284667, -0.134878667, -0.163648667, -0.141055667, -0.160529333, -0.193540333, -0.198201667, -0.176226333, -0.209803, -0.185771, -0.187628333, -0.201229667, -0.204307333,
-0.210493, -0.239733, -0.23053, -0.269905, -0.269036333, -0.283078333, -0.303841333, -0.281968333, -0.272035, -0.258029, -0.282042333, -0.290066667, -0.280494667, -0.283161333,
-0.274223333, -0.280196, -0.236101, -0.266142667, -0.233335667, -0.228822667, -0.256266, -0.216391333, -0.202526333, -0.256290333, -0.237121, -0.244544, -0.253072, -0.185395,
-0.256954, -0.215199, -0.206192333, -0.176378, -0.210793, -0.112357, -0.062179333, -0.075509333, -0.093995, -0.03337, 0.008804333, -0.039890333, 0.117843333, 0.024056, 0.112199333,
0.139959, 0.028608667, 0.203605667, 0.129774667, 0.237091667, 0.183765333, -0.104337667, -0.3766715, -0.444768, -0.6960855, -0.4592855, -0.722666, 0, 0, 0,
0, ]
            ],
            "concentration": [[1, 0], [0, 1]],
            "concentrationLabels": ["Skim Milk", "Olive Oil"]
        };
        updateData(trainObj.absorbance[0], [0.25,0.75], ["A","B"], "Sample 1");
        updateData(trainObj.absorbance[1], [0.66,0.33], ["C", "D"], "Sample 2");
        var detectedAbsorbances = [-0.765773, -0.755362, -0.764936, -0.691396667, -0.715760333, -0.714011667, -0.728986333, -0.698326333, -0.703601667, -0.660518667, -0.661541667, -0.631785667,
                 -0.625093, -0.617427667, -0.591532, -0.581993667, -0.615171667, -0.560689, -0.559161, -0.559406, -0.562066667, -0.553445, -0.565318333, -0.590291667, -0.559254667,
                 -0.582422667, -0.576666, -0.579961, -0.575716, -0.583901667, -0.589918333, -0.586692333, -0.609547, -0.612291, -0.600874333, -0.629129, -0.586395667, -0.595778667,
                 -0.574191333, -0.575300667, -0.571125, -0.561857667, -0.551757667, -0.545704667, -0.537233, -0.517938, -0.516602667, -0.554790667, -0.524674667, -0.524977333, -0.535669,
                 -0.537716667, -0.519551667, -0.527367667, -0.510381, -0.499354667, -0.487601333, -0.493684667, -0.417895, -0.409746667, -0.375282, -0.357620667, -0.35812, -0.338005333, -0.322363667,
                 -0.328224667, -0.320826, -0.295086, -0.289352, -0.285095667, -0.267713333, -0.275107667, -0.272986333, -0.282804333, -0.271613667, -0.288159667, -0.299387, -0.287402, -0.290475667,
                 -0.271041667, -0.304787, -0.287322, -0.295600667, -0.287979333, -0.269631667, -0.279276333, -0.269403333, -0.270142667, -0.26694, -0.250036333, -0.265703667, -0.270005333, -0.252489,
                 -0.245253333, -0.227426333, -0.220819, -0.228221, -0.242657, -0.246414667, -0.225711333, -0.231787333, -0.221540667, -0.228167, -0.19432, -0.21165, -0.194914333, -0.169008, -0.176579,
                 -0.145030667, -0.131696, -0.121805333, -0.096678, -0.101857667, -0.080744, -0.050926, -0.035525333, -0.024997, -0.021256333, -0.004948, 0.020037667, 0.036401667, 0.024504333, 0.044438667,
                 0.041815333, 0.062761, 0.095212, 0.115397667, 0.163987, 0.195636667, 0.212448333, 0.237101333, 0.262960667, 0.241895667, 0.283410667, 0.287339667, 0.301937667, 0.315538, 0.327195333,
                 0.350736667, 0.343447333, 0.386778, 0.399684333, 0.396065, 0.386707667, 0.39546, 0.374193667, 0.388010667, 0.365974333, 0.32271, 0.314041667, 0.287396, 0.277612667, 0.278821333, 0.279779,
                 0.257410333, 0.269245667, 0.297347333, 0.310642333, 0.298887667, 0.290849333, 0.278852667, 0.241339667, 0.245260333, 0.309354333, 0.307551667, 0.342091, 0.323178, 0.335276667, 0.324714,
                 0.333052667, 0.298411, 0.276057, 0.255892667, 0.20588, 0.198687333, 0.140418, 0.202144333, 0.185306667, 0.193773, 0.151555333, 0.170836667, 0.166241, 0.150265333, 0.165891667, 0.153203,
                 0.171978667, 0.135035333, 0.171056333, 0.226193, 0.172017, 0.250897667, 0.272258333, 0.181365, 0.163707333, 0.163864667, 0.151830333, 0.149407, 0.106329667, 0.078809, 0.070746,
                 0.11149, 0.038959333, 0.080831, 0.091370667, 0.075120667, 0.004750333, 0.003488667, 0.067449333, 0.039094667, 0.102002667, 0.057333333, 0.162127333, 0.250274333, 0.077106333, 0.233324,
                 0.255321, 0.362438333, -0.049200333, -0.073282333, -0.470448, -0.3148285, -0.904675, -0.717254, -0.887588, 0, 0, 0, 0];

        alert("PCA test commence");

        //Results of train?
        var retTrain = newTrain(false);
        console.log("Training Status: ");
        console.log(flagToString(retTrain));
        console.log("\n");
        console.log(chemoPCACompressed.length);
        console.log(chemoPCACompressed[0].length);
        if (retTrain == chemoFlags.success) {
            //Infer, no save
            var retInfer = newInfer(detectedAbsorbances);
            //results of infer?
            console.log("Infer Status: ");
            console.log(flagToString(retInfer.status));
            console.log("\n");
            //If we didn't fail, print all results.
            if (retInfer.status == chemoFlags.success) {
                console.log("Labels of closest point:\n");
                console.log(retInfer.compounds);
                console.log("\n");
                console.log("Concentrations on closest point:\n");
                console.log(retInfer.concentrations);
                console.log("\n");
                console.log("Points:\n");
                var numPoints = retInfer.trainingPoints.length; 
                for(var i =0;i<numPoints;++i)
                {
                    console.log(retInfer.trainingPoints[i]);
                    console.log("\n");
                }
                console.log("\n");
                console.log("Scanned Point:\n");
                console.log(retInfer.recentPoint);
                console.log("\n");
                console.log("Closest Sample:\n");
                console.log(retInfer.closestSample);
            }
        }
    };

    function plsTest() {
        var trainObj = {
            "absorbance": [[-0.765773, -0.755362, -0.764936, -0.691396667, -0.715760333, -0.714011667, -0.728986333, -0.698326333, -0.703601667, -0.660518667, -0.661541667, -0.631785667,
         -0.625093, -0.617427667, -0.591532, -0.581993667, -0.615171667, -0.560689, -0.559161, -0.559406, -0.562066667, -0.553445, -0.565318333, -0.590291667, -0.559254667,
         -0.582422667, -0.576666, -0.579961, -0.575716, -0.583901667, -0.589918333, -0.586692333, -0.609547, -0.612291, -0.600874333, -0.629129, -0.586395667, -0.595778667,
         -0.574191333, -0.575300667, -0.571125, -0.561857667, -0.551757667, -0.545704667, -0.537233, -0.517938, -0.516602667, -0.554790667, -0.524674667, -0.524977333, -0.535669,
         -0.537716667, -0.519551667, -0.527367667, -0.510381, -0.499354667, -0.487601333, -0.493684667, -0.417895, -0.409746667, -0.375282, -0.357620667, -0.35812, -0.338005333, -0.322363667,
         -0.328224667, -0.320826, -0.295086, -0.289352, -0.285095667, -0.267713333, -0.275107667, -0.272986333, -0.282804333, -0.271613667, -0.288159667, -0.299387, -0.287402, -0.290475667,
         -0.271041667, -0.304787, -0.287322, -0.295600667, -0.287979333, -0.269631667, -0.279276333, -0.269403333, -0.270142667, -0.26694, -0.250036333, -0.265703667, -0.270005333, -0.252489,
         -0.245253333, -0.227426333, -0.220819, -0.228221, -0.242657, -0.246414667, -0.225711333, -0.231787333, -0.221540667, -0.228167, -0.19432, -0.21165, -0.194914333, -0.169008, -0.176579,
         -0.145030667, -0.131696, -0.121805333, -0.096678, -0.101857667, -0.080744, -0.050926, -0.035525333, -0.024997, -0.021256333, -0.004948, 0.020037667, 0.036401667, 0.024504333, 0.044438667,
         0.041815333, 0.062761, 0.095212, 0.115397667, 0.163987, 0.195636667, 0.212448333, 0.237101333, 0.262960667, 0.241895667, 0.283410667, 0.287339667, 0.301937667, 0.315538, 0.327195333,
         0.350736667, 0.343447333, 0.386778, 0.399684333, 0.396065, 0.386707667, 0.39546, 0.374193667, 0.388010667, 0.365974333, 0.32271, 0.314041667, 0.287396, 0.277612667, 0.278821333, 0.279779,
         0.257410333, 0.269245667, 0.297347333, 0.310642333, 0.298887667, 0.290849333, 0.278852667, 0.241339667, 0.245260333, 0.309354333, 0.307551667, 0.342091, 0.323178, 0.335276667, 0.324714,
         0.333052667, 0.298411, 0.276057, 0.255892667, 0.20588, 0.198687333, 0.140418, 0.202144333, 0.185306667, 0.193773, 0.151555333, 0.170836667, 0.166241, 0.150265333, 0.165891667, 0.153203,
         0.171978667, 0.135035333, 0.171056333, 0.226193, 0.172017, 0.250897667, 0.272258333, 0.181365, 0.163707333, 0.163864667, 0.151830333, 0.149407, 0.106329667, 0.078809, 0.070746,
         0.11149, 0.038959333, 0.080831, 0.091370667, 0.075120667, 0.004750333, 0.003488667, 0.067449333, 0.039094667, 0.102002667, 0.057333333, 0.162127333, 0.250274333, 0.077106333, 0.233324,
         0.255321, 0.362438333, -0.049200333, -0.073282333, -0.470448, -0.3148285, -0.904675, -0.717254, -0.887588, 0, 0, 0, 0],
         [-0.346494, -0.333019667, -0.345209333, -0.273450667, -0.296618, -0.319806667, -0.357994667, -0.359194667, -0.390678333, -0.352351333, -0.375375333, -0.365283667, -0.367786,
-0.377347, -0.364150667, -0.360935333, -0.391549333, -0.340471, -0.343162, -0.350235333, -0.354796667, -0.345711667, -0.343914333, -0.375251333, -0.340335, -0.351494667, -0.341482667,
-0.342958667, -0.335297, -0.337005, -0.342445333, -0.336498, -0.359284333, -0.357069667, -0.356951333, -0.380603, -0.342713, -0.353195, -0.338417333, -0.348366667, -0.344996333,
-0.345818, -0.350619333, -0.347262333, -0.351390667, -0.339654667, -0.343484333, -0.39149, -0.365679667, -0.376643333, -0.395523, -0.398150667, -0.374973667, -0.393207, -0.380214667,
-0.371249333, -0.361347, -0.367398333, -0.280003, -0.253713667, -0.202874, -0.174532333, -0.133371333, -0.091682, -0.041829667, -0.016723667, 0.022673667, 0.101357667, 0.16169,
0.236375333, 0.299275333, 0.346076333, 0.379405, 0.374559, 0.401452, 0.380878667, 0.361614, 0.387718, 0.347634, 0.312769, 0.229944, 0.196662333, 0.128665333, 0.078495, 0.035087,
-0.038615333, -0.059406667, -0.100627333, -0.128212667, -0.143382333, -0.194965333, -0.210567, -0.221471333, -0.239109333, -0.244455, -0.256854667, -0.275507333, -0.302987333,
-0.317492, -0.308005667, -0.321367, -0.325708667, -0.344820667, -0.326235333, -0.356285, -0.347055667, -0.340922, -0.358300667, -0.331218333, -0.341792, -0.343691, -0.330163333,
-0.346589667, -0.329959, -0.303252, -0.282688, -0.261812667, -0.22541, -0.177715333, -0.118044667, -0.080124, -0.036427667, 0.026159667, 0.060338, 0.129542, 0.180823, 0.213885333,
0.229874333, 0.271707667, 0.226728667, 0.213763667, 0.225279, 0.221757, 0.270332667, 0.275579333, 0.260166333, 0.229597667, 0.229592667, 0.210922, 0.189193667, 0.173659333, 0.138554,
0.124905667, 0.094087333, 0.076156667, 0.033969, 0.019838667, -0.008025, -0.042881667, -0.063735, -0.084808333, -0.087673333, -0.112889, -0.117730333, -0.143193, -0.140016667,
-0.138284667, -0.134878667, -0.163648667, -0.141055667, -0.160529333, -0.193540333, -0.198201667, -0.176226333, -0.209803, -0.185771, -0.187628333, -0.201229667, -0.204307333,
-0.210493, -0.239733, -0.23053, -0.269905, -0.269036333, -0.283078333, -0.303841333, -0.281968333, -0.272035, -0.258029, -0.282042333, -0.290066667, -0.280494667, -0.283161333,
-0.274223333, -0.280196, -0.236101, -0.266142667, -0.233335667, -0.228822667, -0.256266, -0.216391333, -0.202526333, -0.256290333, -0.237121, -0.244544, -0.253072, -0.185395,
-0.256954, -0.215199, -0.206192333, -0.176378, -0.210793, -0.112357, -0.062179333, -0.075509333, -0.093995, -0.03337, 0.008804333, -0.039890333, 0.117843333, 0.024056, 0.112199333,
0.139959, 0.028608667, 0.203605667, 0.129774667, 0.237091667, 0.183765333, -0.104337667, -0.3766715, -0.444768, -0.6960855, -0.4592855, -0.722666, 0, 0, 0,
0, ]
            ],
            "concentration": [[1, 0], [0, 1]],
            "concentrationLabels": ["Skim Milk", "Olive Oil"]
        };

        var detectedAbsorbances = [-0.765773, -0.755362, -0.764936, -0.691396667, -0.715760333, -0.714011667, -0.728986333, -0.698326333, -0.703601667, -0.660518667, -0.661541667, -0.631785667,
                 -0.625093, -0.617427667, -0.591532, -0.581993667, -0.615171667, -0.560689, -0.559161, -0.559406, -0.562066667, -0.553445, -0.565318333, -0.590291667, -0.559254667,
                 -0.582422667, -0.576666, -0.579961, -0.575716, -0.583901667, -0.589918333, -0.586692333, -0.609547, -0.612291, -0.600874333, -0.629129, -0.586395667, -0.595778667,
                 -0.574191333, -0.575300667, -0.571125, -0.561857667, -0.551757667, -0.545704667, -0.537233, -0.517938, -0.516602667, -0.554790667, -0.524674667, -0.524977333, -0.535669,
                 -0.537716667, -0.519551667, -0.527367667, -0.510381, -0.499354667, -0.487601333, -0.493684667, -0.417895, -0.409746667, -0.375282, -0.357620667, -0.35812, -0.338005333, -0.322363667,
                 -0.328224667, -0.320826, -0.295086, -0.289352, -0.285095667, -0.267713333, -0.275107667, -0.272986333, -0.282804333, -0.271613667, -0.288159667, -0.299387, -0.287402, -0.290475667,
                 -0.271041667, -0.304787, -0.287322, -0.295600667, -0.287979333, -0.269631667, -0.279276333, -0.269403333, -0.270142667, -0.26694, -0.250036333, -0.265703667, -0.270005333, -0.252489,
                 -0.245253333, -0.227426333, -0.220819, -0.228221, -0.242657, -0.246414667, -0.225711333, -0.231787333, -0.221540667, -0.228167, -0.19432, -0.21165, -0.194914333, -0.169008, -0.176579,
                 -0.145030667, -0.131696, -0.121805333, -0.096678, -0.101857667, -0.080744, -0.050926, -0.035525333, -0.024997, -0.021256333, -0.004948, 0.020037667, 0.036401667, 0.024504333, 0.044438667,
                 0.041815333, 0.062761, 0.095212, 0.115397667, 0.163987, 0.195636667, 0.212448333, 0.237101333, 0.262960667, 0.241895667, 0.283410667, 0.287339667, 0.301937667, 0.315538, 0.327195333,
                 0.350736667, 0.343447333, 0.386778, 0.399684333, 0.396065, 0.386707667, 0.39546, 0.374193667, 0.388010667, 0.365974333, 0.32271, 0.314041667, 0.287396, 0.277612667, 0.278821333, 0.279779,
                 0.257410333, 0.269245667, 0.297347333, 0.310642333, 0.298887667, 0.290849333, 0.278852667, 0.241339667, 0.245260333, 0.309354333, 0.307551667, 0.342091, 0.323178, 0.335276667, 0.324714,
                 0.333052667, 0.298411, 0.276057, 0.255892667, 0.20588, 0.198687333, 0.140418, 0.202144333, 0.185306667, 0.193773, 0.151555333, 0.170836667, 0.166241, 0.150265333, 0.165891667, 0.153203,
                 0.171978667, 0.135035333, 0.171056333, 0.226193, 0.172017, 0.250897667, 0.272258333, 0.181365, 0.163707333, 0.163864667, 0.151830333, 0.149407, 0.106329667, 0.078809, 0.070746,
                 0.11149, 0.038959333, 0.080831, 0.091370667, 0.075120667, 0.004750333, 0.003488667, 0.067449333, 0.039094667, 0.102002667, 0.057333333, 0.162127333, 0.250274333, 0.077106333, 0.233324,
                 0.255321, 0.362438333, -0.049200333, -0.073282333, -0.470448, -0.3148285, -0.904675, -0.717254, -0.887588, 0, 0, 0, 0];

        alert("PLS test commence");

        var trainResult = newTrain(true, trainObj.absorbance, trainObj.concentration, trainObj.concentrationLabels);
        console.log("Training Status: ");
        console.log(flagToString(trainResult));
        if(trainResult==chemoFlags.success)
        {
            var inferResult = newInfer(detectedAbsorbances);
            console.log("Infer Status: ");
            console.log(flagToString(inferResult.status));
            console.log("\n");
            if(inferResult.status==chemoFlags.success)
            {
                console.log("Labels of non-zero chems:");
                console.log(inferResult.compounds);
                console.log("non-zero chems:");
                console.log(inferResult.concentrations);
            }
        }

    };

    function orientLabels(labels, concentrations)
    {
        var numLabelsOld = chemoConcentrationLabels.length;
        var currentEnd = numLabelsOld;
        var numNotFound = 0;
        //For each index i of locationArr, take ith index of labels and put it at locationArr[i]
        var locationArr = [];
        //For each label, look for it in the previous labels.
        for (var i = 0; i < labels.length; ++i)
        {
            var notFound = true;
            //look for existing label
            for(var j = 0; j<numLabelsOld; ++j)
            {
                //If exists, point index i to index j
                if(labels[i]==chemoConcentrationLabels[j])
                {
                    locationArr[i] = j;
                    notFound = false;
                }
            }
            //If not found, point index i to the end of old label array
            //and add new label to old label array
            if(notFound)
            {
                var nextLabel = chemoConcentrationLabels.length;
                chemoConcentrationLabels[nextLabel] = labels[i];
                locationArr[i] = nextLabel;
                numNotFound += 1;
            }
        }
        //Take the concentrations we are adding and use location array
        //to move the concentrations are appropriately. 0s for concentrations that don't exist.
        var newConcentrations = [];
        var totalElem = chemoConcentrationLabels.length;
        for (var i = 0; i < totalElem; ++i)
        {
            newConcentrations[newConcentrations.length] = 0;
        }
        for(var i = 0; i<locationArr.length;++i)
        {
            newConcentrations[locationArr[i]] = concentrations[i];
        }
        //How many new chemicals found?
        var additionalZeroes = [];
        for(var i = 0;i<numNotFound;++i)
        {
            additionalZeroes[i] = 0;
        }
        //Our old samples have none of these new chemicals.
        var numSamples = chemoTrainingConcentrations.length;
        for(var i = 0; i< numSamples;++i)
        {
            chemoTrainingConcentrations[i] = chemoTrainingConcentrations[i].concat(additionalZeroes);
        }
        //Add new sample.
        chemoTrainingConcentrations[numSamples] = newConcentrations;
    }

    function updateData(absorbances, concentrations, labels, sampleName) {
        //Replace NaNs with 0s in the absorbances and add absorbances.
        for (var i = 0; i < absorbances.length; ++i)
        {
            if(isNaN(absorbances[i]))
            {
                absorbances[i] = 0;
            }
        }
        //Add a new row to absorbances
        var nextAbsorbanceIndex = chemoTrainingAbsorbances.length;
        chemoTrainingAbsorbances[nextAbsorbanceIndex] = absorbances;
        if(chemoTrainingConcentrations.length==0)
        {
            chemoTrainingConcentrations[0] = concentrations;
            chemoConcentrationLabels=labels;
            chemoSampleNames[0]=sampleName;
        }
        else
        {
            var nextSampleName = chemoSampleNames.length;
            chemoSampleNames[nextSampleName] = sampleName;
            orientLabels(labels, concentrations);
        }
    };

    function updateTest() {
        var trainObj = {
            "absorbance": [[-0.765773, -0.755362, -0.764936, -0.691396667, -0.715760333, -0.714011667, -0.728986333, -0.698326333, -0.703601667, -0.660518667, -0.661541667, -0.631785667,
         -0.625093, -0.617427667, -0.591532, -0.581993667, -0.615171667, -0.560689, -0.559161, -0.559406, -0.562066667, -0.553445, -0.565318333, -0.590291667, -0.559254667,
         -0.582422667, -0.576666, -0.579961, -0.575716, -0.583901667, -0.589918333, -0.586692333, -0.609547, -0.612291, -0.600874333, -0.629129, -0.586395667, -0.595778667,
         -0.574191333, -0.575300667, -0.571125, -0.561857667, -0.551757667, -0.545704667, -0.537233, -0.517938, -0.516602667, -0.554790667, -0.524674667, -0.524977333, -0.535669,
         -0.537716667, -0.519551667, -0.527367667, -0.510381, -0.499354667, -0.487601333, -0.493684667, -0.417895, -0.409746667, -0.375282, -0.357620667, -0.35812, -0.338005333, -0.322363667,
         -0.328224667, -0.320826, -0.295086, -0.289352, -0.285095667, -0.267713333, -0.275107667, -0.272986333, -0.282804333, -0.271613667, -0.288159667, -0.299387, -0.287402, -0.290475667,
         -0.271041667, -0.304787, -0.287322, -0.295600667, -0.287979333, -0.269631667, -0.279276333, -0.269403333, -0.270142667, -0.26694, -0.250036333, -0.265703667, -0.270005333, -0.252489,
         -0.245253333, -0.227426333, -0.220819, -0.228221, -0.242657, -0.246414667, -0.225711333, -0.231787333, -0.221540667, -0.228167, -0.19432, -0.21165, -0.194914333, -0.169008, -0.176579,
         -0.145030667, -0.131696, -0.121805333, -0.096678, -0.101857667, -0.080744, -0.050926, -0.035525333, -0.024997, -0.021256333, -0.004948, 0.020037667, 0.036401667, 0.024504333, 0.044438667,
         0.041815333, 0.062761, 0.095212, 0.115397667, 0.163987, 0.195636667, 0.212448333, 0.237101333, 0.262960667, 0.241895667, 0.283410667, 0.287339667, 0.301937667, 0.315538, 0.327195333,
         0.350736667, 0.343447333, 0.386778, 0.399684333, 0.396065, 0.386707667, 0.39546, 0.374193667, 0.388010667, 0.365974333, 0.32271, 0.314041667, 0.287396, 0.277612667, 0.278821333, 0.279779,
         0.257410333, 0.269245667, 0.297347333, 0.310642333, 0.298887667, 0.290849333, 0.278852667, 0.241339667, 0.245260333, 0.309354333, 0.307551667, 0.342091, 0.323178, 0.335276667, 0.324714,
         0.333052667, 0.298411, 0.276057, 0.255892667, 0.20588, 0.198687333, 0.140418, 0.202144333, 0.185306667, 0.193773, 0.151555333, 0.170836667, 0.166241, 0.150265333, 0.165891667, 0.153203,
         0.171978667, 0.135035333, 0.171056333, 0.226193, 0.172017, 0.250897667, 0.272258333, 0.181365, 0.163707333, 0.163864667, 0.151830333, 0.149407, 0.106329667, 0.078809, 0.070746,
         0.11149, 0.038959333, 0.080831, 0.091370667, 0.075120667, 0.004750333, 0.003488667, 0.067449333, 0.039094667, 0.102002667, 0.057333333, 0.162127333, 0.250274333, 0.077106333, 0.233324,
         0.255321, 0.362438333, -0.049200333, -0.073282333, -0.470448, -0.3148285, -0.904675, -0.717254, -0.887588, "NAME?", "VALUE?", "NAME?", "VALUE?"],
         [-0.346494, -0.333019667, -0.345209333, -0.273450667, -0.296618, -0.319806667, -0.357994667, -0.359194667, -0.390678333, -0.352351333, -0.375375333, -0.365283667, -0.367786,
-0.377347, -0.364150667, -0.360935333, -0.391549333, -0.340471, -0.343162, -0.350235333, -0.354796667, -0.345711667, -0.343914333, -0.375251333, -0.340335, -0.351494667, -0.341482667,
-0.342958667, -0.335297, -0.337005, -0.342445333, -0.336498, -0.359284333, -0.357069667, -0.356951333, -0.380603, -0.342713, -0.353195, -0.338417333, -0.348366667, -0.344996333,
-0.345818, -0.350619333, -0.347262333, -0.351390667, -0.339654667, -0.343484333, -0.39149, -0.365679667, -0.376643333, -0.395523, -0.398150667, -0.374973667, -0.393207, -0.380214667,
-0.371249333, -0.361347, -0.367398333, -0.280003, -0.253713667, -0.202874, -0.174532333, -0.133371333, -0.091682, -0.041829667, -0.016723667, 0.022673667, 0.101357667, 0.16169,
0.236375333, 0.299275333, 0.346076333, 0.379405, 0.374559, 0.401452, 0.380878667, 0.361614, 0.387718, 0.347634, 0.312769, 0.229944, 0.196662333, 0.128665333, 0.078495, 0.035087,
-0.038615333, -0.059406667, -0.100627333, -0.128212667, -0.143382333, -0.194965333, -0.210567, -0.221471333, -0.239109333, -0.244455, -0.256854667, -0.275507333, -0.302987333,
-0.317492, -0.308005667, -0.321367, -0.325708667, -0.344820667, -0.326235333, -0.356285, -0.347055667, -0.340922, -0.358300667, -0.331218333, -0.341792, -0.343691, -0.330163333,
-0.346589667, -0.329959, -0.303252, -0.282688, -0.261812667, -0.22541, -0.177715333, -0.118044667, -0.080124, -0.036427667, 0.026159667, 0.060338, 0.129542, 0.180823, 0.213885333,
0.229874333, 0.271707667, 0.226728667, 0.213763667, 0.225279, 0.221757, 0.270332667, 0.275579333, 0.260166333, 0.229597667, 0.229592667, 0.210922, 0.189193667, 0.173659333, 0.138554,
0.124905667, 0.094087333, 0.076156667, 0.033969, 0.019838667, -0.008025, -0.042881667, -0.063735, -0.084808333, -0.087673333, -0.112889, -0.117730333, -0.143193, -0.140016667,
-0.138284667, -0.134878667, -0.163648667, -0.141055667, -0.160529333, -0.193540333, -0.198201667, -0.176226333, -0.209803, -0.185771, -0.187628333, -0.201229667, -0.204307333,
-0.210493, -0.239733, -0.23053, -0.269905, -0.269036333, -0.283078333, -0.303841333, -0.281968333, -0.272035, -0.258029, -0.282042333, -0.290066667, -0.280494667, -0.283161333,
-0.274223333, -0.280196, -0.236101, -0.266142667, -0.233335667, -0.228822667, -0.256266, -0.216391333, -0.202526333, -0.256290333, -0.237121, -0.244544, -0.253072, -0.185395,
-0.256954, -0.215199, -0.206192333, -0.176378, -0.210793, -0.112357, -0.062179333, -0.075509333, -0.093995, -0.03337, 0.008804333, -0.039890333, 0.117843333, 0.024056, 0.112199333,
0.139959, 0.028608667, 0.203605667, 0.129774667, 0.237091667, 0.183765333, -0.104337667, -0.3766715, -0.444768, -0.6960855, -0.4592855, -0.722666, "NAME?", "NAME?", "NAME?",
"NAME?" ]
            ],
            "concentration": [[1, 0], [0, 1]],
            "concentrationLabels": ["Skim Milk", "Olive Oil"]
        };
        updateData(trainObj.absorbance[0], [1], ["Skim Milk"], "Sample 1");
        updateData(trainObj.absorbance[1], [1], ["Olive Oil"], "Sample 2");
        updateData(trainObj.absorbance[1], [1], ["Olive Oil"], "Sample 3");
        updateData(trainObj.absorbance[1], [1], ["Skim Milk"], "Sample 4");
        updateData(trainObj.absorbance[1], [1], ["Paradoxium"], "Sample 4");
        updateData(trainObj.absorbance[1], [0.5, 0.5], ["Paradoxium", "Skim Milk"], "Sample 4");
        console.log(chemoTrainingAbsorbances);
        console.log(chemoTrainingConcentrations);
        console.log(chemoConcentrationLabels);
        console.log(chemoSampleNames);
    };

    function getPCA() {
        return chemoPCACompressed;
    };

    return { train: newTrain, infer: newInfer, flags: chemoFlags, getModel: chemoGetModel, loadModel: chemoLoadModel, pcaTest: pcaTest, plsTest: plsTest, updateTest:updateTest, updateData:updateData, getPCA: getPCA };

});