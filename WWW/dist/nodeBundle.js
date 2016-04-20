(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
        return {
            trainingPoints: chemoPCACompressed, trainingSampleNames: chemoSampleNames, recentPoint: measured,
            closestSample: closestSample, compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success
        };
    };

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
},{"ml-matrix":9,"ml-pca":23,"ml-pls":37,"ng-cordova":41}],2:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');

// https://github.com/lutzroeder/Mapack/blob/master/Source/CholeskyDecomposition.cs
function CholeskyDecomposition(value) {
    if (!(this instanceof CholeskyDecomposition)) {
        return new CholeskyDecomposition(value);
    }
    value = Matrix.checkMatrix(value);
    if (!value.isSymmetric())
        throw new Error('Matrix is not symmetric');

    var a = value,
        dimension = a.rows,
        l = new Matrix(dimension, dimension),
        positiveDefinite = true,
        i, j, k;

    for (j = 0; j < dimension; j++) {
        var Lrowj = l[j];
        var d = 0;
        for (k = 0; k < j; k++) {
            var Lrowk = l[k];
            var s = 0;
            for (i = 0; i < k; i++) {
                s += Lrowk[i] * Lrowj[i];
            }
            Lrowj[k] = s = (a[j][k] - s) / l[k][k];
            d = d + s * s;
        }

        d = a[j][j] - d;

        positiveDefinite &= (d > 0);
        l[j][j] = Math.sqrt(Math.max(d, 0));
        for (k = j + 1; k < dimension; k++) {
            l[j][k] = 0;
        }
    }

    if (!positiveDefinite) {
        throw new Error('Matrix is not positive definite');
    }

    this.L = l;
}

CholeskyDecomposition.prototype = {
    get lowerTriangularMatrix() {
        return this.L;
    },
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var l = this.L,
            dimension = l.rows;

        if (value.rows !== dimension) {
            throw new Error('Matrix dimensions do not match');
        }

        var count = value.columns,
            B = value.clone(),
            i, j, k;

        for (k = 0; k < dimension; k++) {
            for (j = 0; j < count; j++) {
                for (i = 0; i < k; i++) {
                    B[k][j] -= B[i][j] * l[k][i];
                }
                B[k][j] /= l[k][k];
            }
        }

        for (k = dimension - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                for (i = k + 1; i < dimension; i++) {
                    B[k][j] -= B[i][j] * l[i][k];
                }
                B[k][j] /= l[k][k];
            }
        }

        return B;
    }
};

module.exports = CholeskyDecomposition;

},{"../matrix":10}],3:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var util = require('./util');
var hypotenuse = util.hypotenuse;
var getFilled2DArray = util.getFilled2DArray;

// https://github.com/lutzroeder/Mapack/blob/master/Source/EigenvalueDecomposition.cs
function EigenvalueDecomposition(matrix) {
    if (!(this instanceof EigenvalueDecomposition)) {
        return new EigenvalueDecomposition(matrix);
    }
    matrix = Matrix.checkMatrix(matrix);
    if (!matrix.isSquare()) {
        throw new Error('Matrix is not a square matrix');
    }

    var n = matrix.columns,
        V = getFilled2DArray(n, n, 0),
        d = new Array(n),
        e = new Array(n),
        value = matrix,
        i, j;

    if (matrix.isSymmetric()) {
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                V[i][j] = value[i][j];
            }
        }
        tred2(n, e, d, V);
        tql2(n, e, d, V);
    }
    else {
        var H = getFilled2DArray(n, n, 0),
            ort = new Array(n);
        for (j = 0; j < n; j++) {
            for (i = 0; i < n; i++) {
                H[i][j] = value[i][j];
            }
        }
        orthes(n, H, ort, V);
        hqr2(n, e, d, V, H);
    }

    this.n = n;
    this.e = e;
    this.d = d;
    this.V = V;
}

EigenvalueDecomposition.prototype = {
    get realEigenvalues() {
        return this.d;
    },
    get imaginaryEigenvalues() {
        return this.e;
    },
    get eigenvectorMatrix() {
        if (!Matrix.isMatrix(this.V)) {
            this.V = new Matrix(this.V);
        }
        return this.V;
    },
    get diagonalMatrix() {
        var n = this.n,
            e = this.e,
            d = this.d,
            X = new Matrix(n, n),
            i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                X[i][j] = 0;
            }
            X[i][i] = d[i];
            if (e[i] > 0) {
                X[i][i + 1] = e[i];
            }
            else if (e[i] < 0) {
                X[i][i - 1] = e[i];
            }
        }
        return X;
    }
};

function tred2(n, e, d, V) {

    var f, g, h, i, j, k,
        hh, scale;

    for (j = 0; j < n; j++) {
        d[j] = V[n - 1][j];
    }

    for (i = n - 1; i > 0; i--) {
        scale = 0;
        h = 0;
        for (k = 0; k < i; k++) {
            scale = scale + Math.abs(d[k]);
        }

        if (scale === 0) {
            e[i] = d[i - 1];
            for (j = 0; j < i; j++) {
                d[j] = V[i - 1][j];
                V[i][j] = 0;
                V[j][i] = 0;
            }
        } else {
            for (k = 0; k < i; k++) {
                d[k] /= scale;
                h += d[k] * d[k];
            }

            f = d[i - 1];
            g = Math.sqrt(h);
            if (f > 0) {
                g = -g;
            }

            e[i] = scale * g;
            h = h - f * g;
            d[i - 1] = f - g;
            for (j = 0; j < i; j++) {
                e[j] = 0;
            }

            for (j = 0; j < i; j++) {
                f = d[j];
                V[j][i] = f;
                g = e[j] + V[j][j] * f;
                for (k = j + 1; k <= i - 1; k++) {
                    g += V[k][j] * d[k];
                    e[k] += V[k][j] * f;
                }
                e[j] = g;
            }

            f = 0;
            for (j = 0; j < i; j++) {
                e[j] /= h;
                f += e[j] * d[j];
            }

            hh = f / (h + h);
            for (j = 0; j < i; j++) {
                e[j] -= hh * d[j];
            }

            for (j = 0; j < i; j++) {
                f = d[j];
                g = e[j];
                for (k = j; k <= i - 1; k++) {
                    V[k][j] -= (f * e[k] + g * d[k]);
                }
                d[j] = V[i - 1][j];
                V[i][j] = 0;
            }
        }
        d[i] = h;
    }

    for (i = 0; i < n - 1; i++) {
        V[n - 1][i] = V[i][i];
        V[i][i] = 1;
        h = d[i + 1];
        if (h !== 0) {
            for (k = 0; k <= i; k++) {
                d[k] = V[k][i + 1] / h;
            }

            for (j = 0; j <= i; j++) {
                g = 0;
                for (k = 0; k <= i; k++) {
                    g += V[k][i + 1] * V[k][j];
                }
                for (k = 0; k <= i; k++) {
                    V[k][j] -= g * d[k];
                }
            }
        }

        for (k = 0; k <= i; k++) {
            V[k][i + 1] = 0;
        }
    }

    for (j = 0; j < n; j++) {
        d[j] = V[n - 1][j];
        V[n - 1][j] = 0;
    }

    V[n - 1][n - 1] = 1;
    e[0] = 0;
}

function tql2(n, e, d, V) {

    var g, h, i, j, k, l, m, p, r,
        dl1, c, c2, c3, el1, s, s2,
        iter;

    for (i = 1; i < n; i++) {
        e[i - 1] = e[i];
    }

    e[n - 1] = 0;

    var f = 0,
        tst1 = 0,
        eps = Math.pow(2, -52);

    for (l = 0; l < n; l++) {
        tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
        m = l;
        while (m < n) {
            if (Math.abs(e[m]) <= eps * tst1) {
                break;
            }
            m++;
        }

        if (m > l) {
            iter = 0;
            do {
                iter = iter + 1;

                g = d[l];
                p = (d[l + 1] - g) / (2 * e[l]);
                r = hypotenuse(p, 1);
                if (p < 0) {
                    r = -r;
                }

                d[l] = e[l] / (p + r);
                d[l + 1] = e[l] * (p + r);
                dl1 = d[l + 1];
                h = g - d[l];
                for (i = l + 2; i < n; i++) {
                    d[i] -= h;
                }

                f = f + h;

                p = d[m];
                c = 1;
                c2 = c;
                c3 = c;
                el1 = e[l + 1];
                s = 0;
                s2 = 0;
                for (i = m - 1; i >= l; i--) {
                    c3 = c2;
                    c2 = c;
                    s2 = s;
                    g = c * e[i];
                    h = c * p;
                    r = hypotenuse(p, e[i]);
                    e[i + 1] = s * r;
                    s = e[i] / r;
                    c = p / r;
                    p = c * d[i] - s * g;
                    d[i + 1] = h + s * (c * g + s * d[i]);

                    for (k = 0; k < n; k++) {
                        h = V[k][i + 1];
                        V[k][i + 1] = s * V[k][i] + c * h;
                        V[k][i] = c * V[k][i] - s * h;
                    }
                }

                p = -s * s2 * c3 * el1 * e[l] / dl1;
                e[l] = s * p;
                d[l] = c * p;

            }
            while (Math.abs(e[l]) > eps * tst1);
        }
        d[l] = d[l] + f;
        e[l] = 0;
    }

    for (i = 0; i < n - 1; i++) {
        k = i;
        p = d[i];
        for (j = i + 1; j < n; j++) {
            if (d[j] < p) {
                k = j;
                p = d[j];
            }
        }

        if (k !== i) {
            d[k] = d[i];
            d[i] = p;
            for (j = 0; j < n; j++) {
                p = V[j][i];
                V[j][i] = V[j][k];
                V[j][k] = p;
            }
        }
    }
}

function orthes(n, H, ort, V) {

    var low = 0,
        high = n - 1,
        f, g, h, i, j, m,
        scale;

    for (m = low + 1; m <= high - 1; m++) {
        scale = 0;
        for (i = m; i <= high; i++) {
            scale = scale + Math.abs(H[i][m - 1]);
        }

        if (scale !== 0) {
            h = 0;
            for (i = high; i >= m; i--) {
                ort[i] = H[i][m - 1] / scale;
                h += ort[i] * ort[i];
            }

            g = Math.sqrt(h);
            if (ort[m] > 0) {
                g = -g;
            }

            h = h - ort[m] * g;
            ort[m] = ort[m] - g;

            for (j = m; j < n; j++) {
                f = 0;
                for (i = high; i >= m; i--) {
                    f += ort[i] * H[i][j];
                }

                f = f / h;
                for (i = m; i <= high; i++) {
                    H[i][j] -= f * ort[i];
                }
            }

            for (i = 0; i <= high; i++) {
                f = 0;
                for (j = high; j >= m; j--) {
                    f += ort[j] * H[i][j];
                }

                f = f / h;
                for (j = m; j <= high; j++) {
                    H[i][j] -= f * ort[j];
                }
            }

            ort[m] = scale * ort[m];
            H[m][m - 1] = scale * g;
        }
    }

    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
            V[i][j] = (i === j ? 1 : 0);
        }
    }

    for (m = high - 1; m >= low + 1; m--) {
        if (H[m][m - 1] !== 0) {
            for (i = m + 1; i <= high; i++) {
                ort[i] = H[i][m - 1];
            }

            for (j = m; j <= high; j++) {
                g = 0;
                for (i = m; i <= high; i++) {
                    g += ort[i] * V[i][j];
                }

                g = (g / ort[m]) / H[m][m - 1];
                for (i = m; i <= high; i++) {
                    V[i][j] += g * ort[i];
                }
            }
        }
    }
}

function hqr2(nn, e, d, V, H) {
    var n = nn - 1,
        low = 0,
        high = nn - 1,
        eps = Math.pow(2, -52),
        exshift = 0,
        norm = 0,
        p = 0,
        q = 0,
        r = 0,
        s = 0,
        z = 0,
        iter = 0,
        i, j, k, l, m, t, w, x, y,
        ra, sa, vr, vi,
        notlast, cdivres;

    for (i = 0; i < nn; i++) {
        if (i < low || i > high) {
            d[i] = H[i][i];
            e[i] = 0;
        }

        for (j = Math.max(i - 1, 0); j < nn; j++) {
            norm = norm + Math.abs(H[i][j]);
        }
    }

    while (n >= low) {
        l = n;
        while (l > low) {
            s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
            if (s === 0) {
                s = norm;
            }
            if (Math.abs(H[l][l - 1]) < eps * s) {
                break;
            }
            l--;
        }

        if (l === n) {
            H[n][n] = H[n][n] + exshift;
            d[n] = H[n][n];
            e[n] = 0;
            n--;
            iter = 0;
        } else if (l === n - 1) {
            w = H[n][n - 1] * H[n - 1][n];
            p = (H[n - 1][n - 1] - H[n][n]) / 2;
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            H[n][n] = H[n][n] + exshift;
            H[n - 1][n - 1] = H[n - 1][n - 1] + exshift;
            x = H[n][n];

            if (q >= 0) {
                z = (p >= 0) ? (p + z) : (p - z);
                d[n - 1] = x + z;
                d[n] = d[n - 1];
                if (z !== 0) {
                    d[n] = x - w / z;
                }
                e[n - 1] = 0;
                e[n] = 0;
                x = H[n][n - 1];
                s = Math.abs(x) + Math.abs(z);
                p = x / s;
                q = z / s;
                r = Math.sqrt(p * p + q * q);
                p = p / r;
                q = q / r;

                for (j = n - 1; j < nn; j++) {
                    z = H[n - 1][j];
                    H[n - 1][j] = q * z + p * H[n][j];
                    H[n][j] = q * H[n][j] - p * z;
                }

                for (i = 0; i <= n; i++) {
                    z = H[i][n - 1];
                    H[i][n - 1] = q * z + p * H[i][n];
                    H[i][n] = q * H[i][n] - p * z;
                }

                for (i = low; i <= high; i++) {
                    z = V[i][n - 1];
                    V[i][n - 1] = q * z + p * V[i][n];
                    V[i][n] = q * V[i][n] - p * z;
                }
            } else {
                d[n - 1] = x + p;
                d[n] = x + p;
                e[n - 1] = z;
                e[n] = -z;
            }

            n = n - 2;
            iter = 0;
        } else {
            x = H[n][n];
            y = 0;
            w = 0;
            if (l < n) {
                y = H[n - 1][n - 1];
                w = H[n][n - 1] * H[n - 1][n];
            }

            if (iter === 10) {
                exshift += x;
                for (i = low; i <= n; i++) {
                    H[i][i] -= x;
                }
                s = Math.abs(H[n][n - 1]) + Math.abs(H[n - 1][n - 2]);
                x = y = 0.75 * s;
                w = -0.4375 * s * s;
            }

            if (iter === 30) {
                s = (y - x) / 2;
                s = s * s + w;
                if (s > 0) {
                    s = Math.sqrt(s);
                    if (y < x) {
                        s = -s;
                    }
                    s = x - w / ((y - x) / 2 + s);
                    for (i = low; i <= n; i++) {
                        H[i][i] -= s;
                    }
                    exshift += s;
                    x = y = w = 0.964;
                }
            }

            iter = iter + 1;

            m = n - 2;
            while (m >= l) {
                z = H[m][m];
                r = x - z;
                s = y - z;
                p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
                q = H[m + 1][m + 1] - z - r - s;
                r = H[m + 2][m + 1];
                s = Math.abs(p) + Math.abs(q) + Math.abs(r);
                p = p / s;
                q = q / s;
                r = r / s;
                if (m === l) {
                    break;
                }
                if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) {
                    break;
                }
                m--;
            }

            for (i = m + 2; i <= n; i++) {
                H[i][i - 2] = 0;
                if (i > m + 2) {
                    H[i][i - 3] = 0;
                }
            }

            for (k = m; k <= n - 1; k++) {
                notlast = (k !== n - 1);
                if (k !== m) {
                    p = H[k][k - 1];
                    q = H[k + 1][k - 1];
                    r = (notlast ? H[k + 2][k - 1] : 0);
                    x = Math.abs(p) + Math.abs(q) + Math.abs(r);
                    if (x !== 0) {
                        p = p / x;
                        q = q / x;
                        r = r / x;
                    }
                }

                if (x === 0) {
                    break;
                }

                s = Math.sqrt(p * p + q * q + r * r);
                if (p < 0) {
                    s = -s;
                }

                if (s !== 0) {
                    if (k !== m) {
                        H[k][k - 1] = -s * x;
                    } else if (l !== m) {
                        H[k][k - 1] = -H[k][k - 1];
                    }

                    p = p + s;
                    x = p / s;
                    y = q / s;
                    z = r / s;
                    q = q / p;
                    r = r / p;

                    for (j = k; j < nn; j++) {
                        p = H[k][j] + q * H[k + 1][j];
                        if (notlast) {
                            p = p + r * H[k + 2][j];
                            H[k + 2][j] = H[k + 2][j] - p * z;
                        }

                        H[k][j] = H[k][j] - p * x;
                        H[k + 1][j] = H[k + 1][j] - p * y;
                    }

                    for (i = 0; i <= Math.min(n, k + 3); i++) {
                        p = x * H[i][k] + y * H[i][k + 1];
                        if (notlast) {
                            p = p + z * H[i][k + 2];
                            H[i][k + 2] = H[i][k + 2] - p * r;
                        }

                        H[i][k] = H[i][k] - p;
                        H[i][k + 1] = H[i][k + 1] - p * q;
                    }

                    for (i = low; i <= high; i++) {
                        p = x * V[i][k] + y * V[i][k + 1];
                        if (notlast) {
                            p = p + z * V[i][k + 2];
                            V[i][k + 2] = V[i][k + 2] - p * r;
                        }

                        V[i][k] = V[i][k] - p;
                        V[i][k + 1] = V[i][k + 1] - p * q;
                    }
                }
            }
        }
    }

    if (norm === 0) {
        return;
    }

    for (n = nn - 1; n >= 0; n--) {
        p = d[n];
        q = e[n];

        if (q === 0) {
            l = n;
            H[n][n] = 1;
            for (i = n - 1; i >= 0; i--) {
                w = H[i][i] - p;
                r = 0;
                for (j = l; j <= n; j++) {
                    r = r + H[i][j] * H[j][n];
                }

                if (e[i] < 0) {
                    z = w;
                    s = r;
                } else {
                    l = i;
                    if (e[i] === 0) {
                        H[i][n] = (w !== 0) ? (-r / w) : (-r / (eps * norm));
                    } else {
                        x = H[i][i + 1];
                        y = H[i + 1][i];
                        q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
                        t = (x * s - z * r) / q;
                        H[i][n] = t;
                        H[i + 1][n] = (Math.abs(x) > Math.abs(z)) ? ((-r - w * t) / x) : ((-s - y * t) / z);
                    }

                    t = Math.abs(H[i][n]);
                    if ((eps * t) * t > 1) {
                        for (j = i; j <= n; j++) {
                            H[j][n] = H[j][n] / t;
                        }
                    }
                }
            }
        } else if (q < 0) {
            l = n - 1;

            if (Math.abs(H[n][n - 1]) > Math.abs(H[n - 1][n])) {
                H[n - 1][n - 1] = q / H[n][n - 1];
                H[n - 1][n] = -(H[n][n] - p) / H[n][n - 1];
            } else {
                cdivres = cdiv(0, -H[n - 1][n], H[n - 1][n - 1] - p, q);
                H[n - 1][n - 1] = cdivres[0];
                H[n - 1][n] = cdivres[1];
            }

            H[n][n - 1] = 0;
            H[n][n] = 1;
            for (i = n - 2; i >= 0; i--) {
                ra = 0;
                sa = 0;
                for (j = l; j <= n; j++) {
                    ra = ra + H[i][j] * H[j][n - 1];
                    sa = sa + H[i][j] * H[j][n];
                }

                w = H[i][i] - p;

                if (e[i] < 0) {
                    z = w;
                    r = ra;
                    s = sa;
                } else {
                    l = i;
                    if (e[i] === 0) {
                        cdivres = cdiv(-ra, -sa, w, q);
                        H[i][n - 1] = cdivres[0];
                        H[i][n] = cdivres[1];
                    } else {
                        x = H[i][i + 1];
                        y = H[i + 1][i];
                        vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
                        vi = (d[i] - p) * 2 * q;
                        if (vr === 0 && vi === 0) {
                            vr = eps * norm * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
                        }
                        cdivres = cdiv(x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi);
                        H[i][n - 1] = cdivres[0];
                        H[i][n] = cdivres[1];
                        if (Math.abs(x) > (Math.abs(z) + Math.abs(q))) {
                            H[i + 1][n - 1] = (-ra - w * H[i][n - 1] + q * H[i][n]) / x;
                            H[i + 1][n] = (-sa - w * H[i][n] - q * H[i][n - 1]) / x;
                        } else {
                            cdivres = cdiv(-r - y * H[i][n - 1], -s - y * H[i][n], z, q);
                            H[i + 1][n - 1] = cdivres[0];
                            H[i + 1][n] = cdivres[1];
                        }
                    }

                    t = Math.max(Math.abs(H[i][n - 1]), Math.abs(H[i][n]));
                    if ((eps * t) * t > 1) {
                        for (j = i; j <= n; j++) {
                            H[j][n - 1] = H[j][n - 1] / t;
                            H[j][n] = H[j][n] / t;
                        }
                    }
                }
            }
        }
    }

    for (i = 0; i < nn; i++) {
        if (i < low || i > high) {
            for (j = i; j < nn; j++) {
                V[i][j] = H[i][j];
            }
        }
    }

    for (j = nn - 1; j >= low; j--) {
        for (i = low; i <= high; i++) {
            z = 0;
            for (k = low; k <= Math.min(j, high); k++) {
                z = z + V[i][k] * H[k][j];
            }
            V[i][j] = z;
        }
    }
}

function cdiv(xr, xi, yr, yi) {
    var r, d;
    if (Math.abs(yr) > Math.abs(yi)) {
        r = yi / yr;
        d = yr + r * yi;
        return [(xr + r * xi) / d, (xi - r * xr) / d];
    }
    else {
        r = yr / yi;
        d = yi + r * yr;
        return [(r * xr + xi) / d, (r * xi - xr) / d];
    }
}

module.exports = EigenvalueDecomposition;

},{"../matrix":10,"./util":7}],4:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');

// https://github.com/lutzroeder/Mapack/blob/master/Source/LuDecomposition.cs
function LuDecomposition(matrix) {
    if (!(this instanceof LuDecomposition)) {
        return new LuDecomposition(matrix);
    }
    matrix = Matrix.checkMatrix(matrix);

    var lu = matrix.clone(),
        rows = lu.rows,
        columns = lu.columns,
        pivotVector = new Array(rows),
        pivotSign = 1,
        i, j, k, p, s, t, v,
        LUrowi, LUcolj, kmax;

    for (i = 0; i < rows; i++) {
        pivotVector[i] = i;
    }

    LUcolj = new Array(rows);

    for (j = 0; j < columns; j++) {

        for (i = 0; i < rows; i++) {
            LUcolj[i] = lu[i][j];
        }

        for (i = 0; i < rows; i++) {
            LUrowi = lu[i];
            kmax = Math.min(i, j);
            s = 0;
            for (k = 0; k < kmax; k++) {
                s += LUrowi[k] * LUcolj[k];
            }
            LUrowi[j] = LUcolj[i] -= s;
        }

        p = j;
        for (i = j + 1; i < rows; i++) {
            if (Math.abs(LUcolj[i]) > Math.abs(LUcolj[p])) {
                p = i;
            }
        }

        if (p !== j) {
            for (k = 0; k < columns; k++) {
                t = lu[p][k];
                lu[p][k] = lu[j][k];
                lu[j][k] = t;
            }

            v = pivotVector[p];
            pivotVector[p] = pivotVector[j];
            pivotVector[j] = v;

            pivotSign = -pivotSign;
        }

        if (j < rows && lu[j][j] !== 0) {
            for (i = j + 1; i < rows; i++) {
                lu[i][j] /= lu[j][j];
            }
        }
    }

    this.LU = lu;
    this.pivotVector = pivotVector;
    this.pivotSign = pivotSign;
}

LuDecomposition.prototype = {
    isSingular: function () {
        var data = this.LU,
            col = data.columns;
        for (var j = 0; j < col; j++) {
            if (data[j][j] === 0) {
                return true;
            }
        }
        return false;
    },
    get determinant() {
        var data = this.LU;
        if (!data.isSquare())
            throw new Error('Matrix must be square');
        var determinant = this.pivotSign, col = data.columns;
        for (var j = 0; j < col; j++)
            determinant *= data[j][j];
        return determinant;
    },
    get lowerTriangularMatrix() {
        var data = this.LU,
            rows = data.rows,
            columns = data.columns,
            X = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                if (i > j) {
                    X[i][j] = data[i][j];
                } else if (i === j) {
                    X[i][j] = 1;
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get upperTriangularMatrix() {
        var data = this.LU,
            rows = data.rows,
            columns = data.columns,
            X = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                if (i <= j) {
                    X[i][j] = data[i][j];
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get pivotPermutationVector() {
        return this.pivotVector.slice();
    },
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var lu = this.LU,
            rows = lu.rows;

        if (rows !== value.rows)
            throw new Error('Invalid matrix dimensions');
        if (this.isSingular())
            throw new Error('LU matrix is singular');

        var count = value.columns,
            X = value.subMatrixRow(this.pivotVector, 0, count - 1),
            columns = lu.columns,
            i, j, k;

        for (k = 0; k < columns; k++) {
            for (i = k + 1; i < columns; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * lu[i][k];
                }
            }
        }
        for (k = columns - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                X[k][j] /= lu[k][k];
            }
            for (i = 0; i < k; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * lu[i][k];
                }
            }
        }
        return X;
    }
};

module.exports = LuDecomposition;

},{"../matrix":10}],5:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var hypotenuse = require('./util').hypotenuse;

//https://github.com/lutzroeder/Mapack/blob/master/Source/QrDecomposition.cs
function QrDecomposition(value) {
    if (!(this instanceof QrDecomposition)) {
        return new QrDecomposition(value);
    }
    value = Matrix.checkMatrix(value);

    var qr = value.clone(),
        m = value.rows,
        n = value.columns,
        rdiag = new Array(n),
        i, j, k, s;

    for (k = 0; k < n; k++) {
        var nrm = 0;
        for (i = k; i < m; i++) {
            nrm = hypotenuse(nrm, qr[i][k]);
        }
        if (nrm !== 0) {
            if (qr[k][k] < 0) {
                nrm = -nrm;
            }
            for (i = k; i < m; i++) {
                qr[i][k] /= nrm;
            }
            qr[k][k] += 1;
            for (j = k + 1; j < n; j++) {
                s = 0;
                for (i = k; i < m; i++) {
                    s += qr[i][k] * qr[i][j];
                }
                s = -s / qr[k][k];
                for (i = k; i < m; i++) {
                    qr[i][j] += s * qr[i][k];
                }
            }
        }
        rdiag[k] = -nrm;
    }

    this.QR = qr;
    this.Rdiag = rdiag;
}

QrDecomposition.prototype = {
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var qr = this.QR,
            m = qr.rows;

        if (value.rows !== m)
            throw new Error('Matrix row dimensions must agree');
        if (!this.isFullRank())
            throw new Error('Matrix is rank deficient');

        var count = value.columns,
            X = value.clone(),
            n = qr.columns,
            i, j, k, s;

        for (k = 0; k < n; k++) {
            for (j = 0; j < count; j++) {
                s = 0;
                for (i = k; i < m; i++) {
                    s += qr[i][k] * X[i][j];
                }
                s = -s / qr[k][k];
                for (i = k; i < m; i++) {
                    X[i][j] += s * qr[i][k];
                }
            }
        }
        for (k = n - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                X[k][j] /= this.Rdiag[k];
            }
            for (i = 0; i < k; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * qr[i][k];
                }
            }
        }

        return X.subMatrix(0, n - 1, 0, count - 1);
    },
    isFullRank: function () {
        var columns = this.QR.columns;
        for (var i = 0; i < columns; i++) {
            if (this.Rdiag[i] === 0) {
                return false;
            }
        }
        return true;
    },
    get upperTriangularMatrix() {
        var qr = this.QR,
            n = qr.columns,
            X = new Matrix(n, n),
            i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                if (i < j) {
                    X[i][j] = qr[i][j];
                } else if (i === j) {
                    X[i][j] = this.Rdiag[i];
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get orthogonalMatrix() {
        var qr = this.QR,
            rows = qr.rows,
            columns = qr.columns,
            X = new Matrix(rows, columns),
            i, j, k, s;

        for (k = columns - 1; k >= 0; k--) {
            for (i = 0; i < rows; i++) {
                X[i][k] = 0;
            }
            X[k][k] = 1;
            for (j = k; j < columns; j++) {
                if (qr[k][k] !== 0) {
                    s = 0;
                    for (i = k; i < rows; i++) {
                        s += qr[i][k] * X[i][j];
                    }

                    s = -s / qr[k][k];

                    for (i = k; i < rows; i++) {
                        X[i][j] += s * qr[i][k];
                    }
                }
            }
        }
        return X;
    }
};

module.exports = QrDecomposition;

},{"../matrix":10,"./util":7}],6:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var util = require('./util');
var hypotenuse = util.hypotenuse;
var getFilled2DArray = util.getFilled2DArray;

// https://github.com/lutzroeder/Mapack/blob/master/Source/SingularValueDecomposition.cs
function SingularValueDecomposition(value, options) {
    if (!(this instanceof SingularValueDecomposition)) {
        return new SingularValueDecomposition(value, options);
    }
    value = Matrix.checkMatrix(value);

    options = options || {};

    var m = value.rows,
        n = value.columns,
        nu = Math.min(m, n);

    var wantu = true, wantv = true;
    if (options.computeLeftSingularVectors === false)
        wantu = false;
    if (options.computeRightSingularVectors === false)
        wantv = false;
    var autoTranspose = options.autoTranspose === true;

    var swapped = false;
    var a;
    if (m < n) {
        if (!autoTranspose) {
            a = value.clone();
            console.warn('Computing SVD on a matrix with more columns than rows. Consider enabling autoTranspose');
        } else {
            a = value.transpose();
            m = a.rows;
            n = a.columns;
            swapped = true;
            var aux = wantu;
            wantu = wantv;
            wantv = aux;
        }
    } else {
        a = value.clone();
    }

    var s = new Array(Math.min(m + 1, n)),
        U = getFilled2DArray(m, nu, 0),
        V = getFilled2DArray(n, n, 0),
        e = new Array(n),
        work = new Array(m);

    var nct = Math.min(m - 1, n);
    var nrt = Math.max(0, Math.min(n - 2, m));

    var i, j, k, p, t, ks, f, cs, sn, max, kase,
        scale, sp, spm1, epm1, sk, ek, b, c, shift, g;

    for (k = 0, max = Math.max(nct, nrt); k < max; k++) {
        if (k < nct) {
            s[k] = 0;
            for (i = k; i < m; i++) {
                s[k] = hypotenuse(s[k], a[i][k]);
            }
            if (s[k] !== 0) {
                if (a[k][k] < 0) {
                    s[k] = -s[k];
                }
                for (i = k; i < m; i++) {
                    a[i][k] /= s[k];
                }
                a[k][k] += 1;
            }
            s[k] = -s[k];
        }

        for (j = k + 1; j < n; j++) {
            if ((k < nct) && (s[k] !== 0)) {
                t = 0;
                for (i = k; i < m; i++) {
                    t += a[i][k] * a[i][j];
                }
                t = -t / a[k][k];
                for (i = k; i < m; i++) {
                    a[i][j] += t * a[i][k];
                }
            }
            e[j] = a[k][j];
        }

        if (wantu && (k < nct)) {
            for (i = k; i < m; i++) {
                U[i][k] = a[i][k];
            }
        }

        if (k < nrt) {
            e[k] = 0;
            for (i = k + 1; i < n; i++) {
                e[k] = hypotenuse(e[k], e[i]);
            }
            if (e[k] !== 0) {
                if (e[k + 1] < 0)
                    e[k] = -e[k];
                for (i = k + 1; i < n; i++) {
                    e[i] /= e[k];
                }
                e[k + 1] += 1;
            }
            e[k] = -e[k];
            if ((k + 1 < m) && (e[k] !== 0)) {
                for (i = k + 1; i < m; i++) {
                    work[i] = 0;
                }
                for (j = k + 1; j < n; j++) {
                    for (i = k + 1; i < m; i++) {
                        work[i] += e[j] * a[i][j];
                    }
                }
                for (j = k + 1; j < n; j++) {
                    t = -e[j] / e[k + 1];
                    for (i = k + 1; i < m; i++) {
                        a[i][j] += t * work[i];
                    }
                }
            }
            if (wantv) {
                for (i = k + 1; i < n; i++) {
                    V[i][k] = e[i];
                }
            }
        }
    }

    p = Math.min(n, m + 1);
    if (nct < n) {
        s[nct] = a[nct][nct];
    }
    if (m < p) {
        s[p - 1] = 0;
    }
    if (nrt + 1 < p) {
        e[nrt] = a[nrt][p - 1];
    }
    e[p - 1] = 0;

    if (wantu) {
        for (j = nct; j < nu; j++) {
            for (i = 0; i < m; i++) {
                U[i][j] = 0;
            }
            U[j][j] = 1;
        }
        for (k = nct - 1; k >= 0; k--) {
            if (s[k] !== 0) {
                for (j = k + 1; j < nu; j++) {
                    t = 0;
                    for (i = k; i < m; i++) {
                        t += U[i][k] * U[i][j];
                    }
                    t = -t / U[k][k];
                    for (i = k; i < m; i++) {
                        U[i][j] += t * U[i][k];
                    }
                }
                for (i = k; i < m; i++) {
                    U[i][k] = -U[i][k];
                }
                U[k][k] = 1 + U[k][k];
                for (i = 0; i < k - 1; i++) {
                    U[i][k] = 0;
                }
            } else {
                for (i = 0; i < m; i++) {
                    U[i][k] = 0;
                }
                U[k][k] = 1;
            }
        }
    }

    if (wantv) {
        for (k = n - 1; k >= 0; k--) {
            if ((k < nrt) && (e[k] !== 0)) {
                for (j = k + 1; j < n; j++) {
                    t = 0;
                    for (i = k + 1; i < n; i++) {
                        t += V[i][k] * V[i][j];
                    }
                    t = -t / V[k + 1][k];
                    for (i = k + 1; i < n; i++) {
                        V[i][j] += t * V[i][k];
                    }
                }
            }
            for (i = 0; i < n; i++) {
                V[i][k] = 0;
            }
            V[k][k] = 1;
        }
    }

    var pp = p - 1,
        iter = 0,
        eps = Math.pow(2, -52);
    while (p > 0) {
        for (k = p - 2; k >= -1; k--) {
            if (k === -1) {
                break;
            }
            if (Math.abs(e[k]) <= eps * (Math.abs(s[k]) + Math.abs(s[k + 1]))) {
                e[k] = 0;
                break;
            }
        }
        if (k === p - 2) {
            kase = 4;
        } else {
            for (ks = p - 1; ks >= k; ks--) {
                if (ks === k) {
                    break;
                }
                t = (ks !== p ? Math.abs(e[ks]) : 0) + (ks !== k + 1 ? Math.abs(e[ks - 1]) : 0);
                if (Math.abs(s[ks]) <= eps * t) {
                    s[ks] = 0;
                    break;
                }
            }
            if (ks === k) {
                kase = 3;
            } else if (ks === p - 1) {
                kase = 1;
            } else {
                kase = 2;
                k = ks;
            }
        }

        k++;

        switch (kase) {
            case 1: {
                f = e[p - 2];
                e[p - 2] = 0;
                for (j = p - 2; j >= k; j--) {
                    t = hypotenuse(s[j], f);
                    cs = s[j] / t;
                    sn = f / t;
                    s[j] = t;
                    if (j !== k) {
                        f = -sn * e[j - 1];
                        e[j - 1] = cs * e[j - 1];
                    }
                    if (wantv) {
                        for (i = 0; i < n; i++) {
                            t = cs * V[i][j] + sn * V[i][p - 1];
                            V[i][p - 1] = -sn * V[i][j] + cs * V[i][p - 1];
                            V[i][j] = t;
                        }
                    }
                }
                break;
            }
            case 2 : {
                f = e[k - 1];
                e[k - 1] = 0;
                for (j = k; j < p; j++) {
                    t = hypotenuse(s[j], f);
                    cs = s[j] / t;
                    sn = f / t;
                    s[j] = t;
                    f = -sn * e[j];
                    e[j] = cs * e[j];
                    if (wantu) {
                        for (i = 0; i < m; i++) {
                            t = cs * U[i][j] + sn * U[i][k - 1];
                            U[i][k - 1] = -sn * U[i][j] + cs * U[i][k - 1];
                            U[i][j] = t;
                        }
                    }
                }
                break;
            }
            case 3 : {
                scale = Math.max(Math.max(Math.max(Math.max(Math.abs(s[p - 1]), Math.abs(s[p - 2])), Math.abs(e[p - 2])), Math.abs(s[k])), Math.abs(e[k]));
                sp = s[p - 1] / scale;
                spm1 = s[p - 2] / scale;
                epm1 = e[p - 2] / scale;
                sk = s[k] / scale;
                ek = e[k] / scale;
                b = ((spm1 + sp) * (spm1 - sp) + epm1 * epm1) / 2;
                c = (sp * epm1) * (sp * epm1);
                shift = 0;
                if ((b !== 0) || (c !== 0)) {
                    shift = Math.sqrt(b * b + c);
                    if (b < 0) {
                        shift = -shift;
                    }
                    shift = c / (b + shift);
                }
                f = (sk + sp) * (sk - sp) + shift;
                g = sk * ek;
                for (j = k; j < p - 1; j++) {
                    t = hypotenuse(f, g);
                    cs = f / t;
                    sn = g / t;
                    if (j !== k) {
                        e[j - 1] = t;
                    }
                    f = cs * s[j] + sn * e[j];
                    e[j] = cs * e[j] - sn * s[j];
                    g = sn * s[j + 1];
                    s[j + 1] = cs * s[j + 1];
                    if (wantv) {
                        for (i = 0; i < n; i++) {
                            t = cs * V[i][j] + sn * V[i][j + 1];
                            V[i][j + 1] = -sn * V[i][j] + cs * V[i][j + 1];
                            V[i][j] = t;
                        }
                    }
                    t = hypotenuse(f, g);
                    cs = f / t;
                    sn = g / t;
                    s[j] = t;
                    f = cs * e[j] + sn * s[j + 1];
                    s[j + 1] = -sn * e[j] + cs * s[j + 1];
                    g = sn * e[j + 1];
                    e[j + 1] = cs * e[j + 1];
                    if (wantu && (j < m - 1)) {
                        for (i = 0; i < m; i++) {
                            t = cs * U[i][j] + sn * U[i][j + 1];
                            U[i][j + 1] = -sn * U[i][j] + cs * U[i][j + 1];
                            U[i][j] = t;
                        }
                    }
                }
                e[p - 2] = f;
                iter = iter + 1;
                break;
            }
            case 4: {
                if (s[k] <= 0) {
                    s[k] = (s[k] < 0 ? -s[k] : 0);
                    if (wantv) {
                        for (i = 0; i <= pp; i++) {
                            V[i][k] = -V[i][k];
                        }
                    }
                }
                while (k < pp) {
                    if (s[k] >= s[k + 1]) {
                        break;
                    }
                    t = s[k];
                    s[k] = s[k + 1];
                    s[k + 1] = t;
                    if (wantv && (k < n - 1)) {
                        for (i = 0; i < n; i++) {
                            t = V[i][k + 1];
                            V[i][k + 1] = V[i][k];
                            V[i][k] = t;
                        }
                    }
                    if (wantu && (k < m - 1)) {
                        for (i = 0; i < m; i++) {
                            t = U[i][k + 1];
                            U[i][k + 1] = U[i][k];
                            U[i][k] = t;
                        }
                    }
                    k++;
                }
                iter = 0;
                p--;
                break;
            }
        }
    }

    if (swapped) {
        var tmp = V;
        V = U;
        U = tmp;
    }

    this.m = m;
    this.n = n;
    this.s = s;
    this.U = U;
    this.V = V;
}

SingularValueDecomposition.prototype = {
    get condition() {
        return this.s[0] / this.s[Math.min(this.m, this.n) - 1];
    },
    get norm2() {
        return this.s[0];
    },
    get rank() {
        var eps = Math.pow(2, -52),
            tol = Math.max(this.m, this.n) * this.s[0] * eps,
            r = 0,
            s = this.s;
        for (var i = 0, ii = s.length; i < ii; i++) {
            if (s[i] > tol) {
                r++;
            }
        }
        return r;
    },
    get diagonal() {
        return this.s;
    },
    // https://github.com/accord-net/framework/blob/development/Sources/Accord.Math/Decompositions/SingularValueDecomposition.cs
    get threshold() {
        return (Math.pow(2, -52) / 2) * Math.max(this.m, this.n) * this.s[0];
    },
    get leftSingularVectors() {
        if (!Matrix.isMatrix(this.U)) {
            this.U = new Matrix(this.U);
        }
        return this.U;
    },
    get rightSingularVectors() {
        if (!Matrix.isMatrix(this.V)) {
            this.V = new Matrix(this.V);
        }
        return this.V;
    },
    get diagonalMatrix() {
        return Matrix.diag(this.s);
    },
    solve: function (value) {

        var Y = value,
            e = this.threshold,
            scols = this.s.length,
            Ls = Matrix.zeros(scols, scols),
            i;

        for (i = 0; i < scols; i++) {
            if (Math.abs(this.s[i]) <= e) {
                Ls[i][i] = 0;
            } else {
                Ls[i][i] = 1 / this.s[i];
            }
        }

        var U = this.U;
        var V = this.rightSingularVectors;

        var VL = V.mmul(Ls),
            vrows = V.rows,
            urows = U.length,
            VLU = Matrix.zeros(vrows, urows),
            j, k, sum;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < urows; j++) {
                sum = 0;
                for (k = 0; k < scols; k++) {
                    sum += VL[i][k] * U[j][k];
                }
                VLU[i][j] = sum;
            }
        }

        return VLU.mmul(Y);
    },
    solveForDiagonal: function (value) {
        return this.solve(Matrix.diag(value));
    },
    inverse: function () {
        var V = this.V;
        var e = this.threshold,
            vrows = V.length,
            vcols = V[0].length,
            X = new Matrix(vrows, this.s.length),
            i, j;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < vcols; j++) {
                if (Math.abs(this.s[j]) > e) {
                    X[i][j] = V[i][j] / this.s[j];
                } else {
                    X[i][j] = 0;
                }
            }
        }

        var U = this.U;

        var urows = U.length,
            ucols = U[0].length,
            Y = new Matrix(vrows, urows),
            k, sum;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < urows; j++) {
                sum = 0;
                for (k = 0; k < ucols; k++) {
                    sum += X[i][k] * U[j][k];
                }
                Y[i][j] = sum;
            }
        }

        return Y;
    }
};

module.exports = SingularValueDecomposition;

},{"../matrix":10,"./util":7}],7:[function(require,module,exports){
'use strict';

exports.hypotenuse = function hypotenuse(a, b) {
    if (Math.abs(a) > Math.abs(b)) {
        var r = b / a;
        return Math.abs(a) * Math.sqrt(1 + r * r);
    }
    if (b !== 0) {
        var r = a / b;
        return Math.abs(b) * Math.sqrt(1 + r * r);
    }
    return 0;
};

// For use in the decomposition algorithms. With big matrices, access time is
// too long on elements from array subclass
// todo check when it is fixed in v8
// http://jsperf.com/access-and-write-array-subclass
exports.getEmpty2DArray = function (rows, columns) {
    var array = new Array(rows);
    for (var i = 0; i < rows; i++) {
        array[i] = new Array(columns);
    }
    return array;
};

exports.getFilled2DArray = function (rows, columns, value) {
    var array = new Array(rows);
    for (var i = 0; i < rows; i++) {
        array[i] = new Array(columns);
        for (var j = 0; j < columns; j++) {
            array[i][j] = value;
        }
    }
    return array;
};

},{}],8:[function(require,module,exports){
'use strict';

var Matrix = require('./matrix');

var SingularValueDecomposition = require('./dc/svd');
var EigenvalueDecomposition = require('./dc/evd');
var LuDecomposition = require('./dc/lu');
var QrDecomposition = require('./dc/qr');
var CholeskyDecomposition = require('./dc/cholesky');

function inverse(matrix) {
    matrix = Matrix.checkMatrix(matrix);
    return solve(matrix, Matrix.eye(matrix.rows));
}

Matrix.inverse = Matrix.inv = inverse;
Matrix.prototype.inverse = Matrix.prototype.inv = function () {
    return inverse(this);
};

function solve(leftHandSide, rightHandSide) {
    leftHandSide = Matrix.checkMatrix(leftHandSide);
    rightHandSide = Matrix.checkMatrix(rightHandSide);
    return leftHandSide.isSquare() ? new LuDecomposition(leftHandSide).solve(rightHandSide) : new QrDecomposition(leftHandSide).solve(rightHandSide);
}

Matrix.solve = solve;
Matrix.prototype.solve = function (other) {
    return solve(this, other);
};

module.exports = {
    SingularValueDecomposition: SingularValueDecomposition,
    SVD: SingularValueDecomposition,
    EigenvalueDecomposition: EigenvalueDecomposition,
    EVD: EigenvalueDecomposition,
    LuDecomposition: LuDecomposition,
    LU: LuDecomposition,
    QrDecomposition: QrDecomposition,
    QR: QrDecomposition,
    CholeskyDecomposition: CholeskyDecomposition,
    CHO: CholeskyDecomposition,
    inverse: inverse,
    solve: solve
};

},{"./dc/cholesky":2,"./dc/evd":3,"./dc/lu":4,"./dc/qr":5,"./dc/svd":6,"./matrix":10}],9:[function(require,module,exports){
'use strict';

module.exports = require('./matrix');
module.exports.Decompositions = module.exports.DC = require('./decompositions');

},{"./decompositions":8,"./matrix":10}],10:[function(require,module,exports){
'use strict';

/**
 * Real matrix
 */
class Matrix extends Array {
    /**
     * @constructor
     * @param {number|Array|Matrix} nRows - Number of rows of the new matrix,
     * 2D array containing the data or Matrix instance to clone
     * @param {number} [nColumns] - Number of columns of the new matrix
     */
    constructor(nRows, nColumns) {
        if (Matrix.isMatrix(nRows)) {
            return nRows.clone();
        } else if (Number.isInteger(nRows) && nRows > 0) { // Create an empty matrix
            super(nRows);
            if (Number.isInteger(nColumns) && nColumns > 0) {
                for (var i = 0; i < nRows; i++) {
                    this[i] = new Array(nColumns);
                }
            } else {
                throw new TypeError('nColumns must be a positive integer');
            }
        } else if (Array.isArray(nRows)) { // Copy the values from the 2D array
            var matrix = nRows;
            nRows = matrix.length;
            nColumns = matrix[0].length;
            if (typeof nColumns !== 'number' || nColumns === 0) {
                throw new TypeError('Data must be a 2D array with at least one element');
            }
            super(nRows);
            for (var i = 0; i < nRows; i++) {
                if (matrix[i].length !== nColumns) {
                    throw new RangeError('Inconsistent array dimensions');
                }
                this[i] = [].concat(matrix[i]);
            }
        } else {
            throw new TypeError('First argument must be a positive number or an array');
        }
        this.rows = nRows;
        this.columns = nColumns;
    }

    /**
     * Constructs a Matrix with the chosen dimensions from a 1D array
     * @param {number} newRows - Number of rows
     * @param {number} newColumns - Number of columns
     * @param {Array} newData - A 1D array containing data for the matrix
     * @returns {Matrix} - The new matrix
     */
    static from1DArray(newRows, newColumns, newData) {
        var length = newRows * newColumns;
        if (length !== newData.length) {
            throw new RangeError('Data length does not match given dimensions');
        }
        var newMatrix = new Matrix(newRows, newColumns);
        for (var row = 0; row < newRows; row++) {
            for (var column = 0; column < newColumns; column++) {
                newMatrix[row][column] = newData[row * newColumns + column];
            }
        }
        return newMatrix;
    }

    /**
     * Creates a row vector, a matrix with only one row.
     * @param {Array} newData - A 1D array containing data for the vector
     * @returns {Matrix} - The new matrix
     */
    static rowVector(newData) {
        var vector = new Matrix(1, newData.length);
        for (var i = 0; i < newData.length; i++) {
            vector[0][i] = newData[i];
        }
        return vector;
    }

    /**
     * Creates a column vector, a matrix with only one column.
     * @param {Array} newData - A 1D array containing data for the vector
     * @returns {Matrix} - The new matrix
     */
    static columnVector(newData) {
        var vector = new Matrix(newData.length, 1);
        for (var i = 0; i < newData.length; i++) {
            vector[i][0] = newData[i];
        }
        return vector;
    }

    /**
     * Creates an empty matrix with the given dimensions. Values will be undefined. Same as using new Matrix(rows, columns).
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static empty(rows, columns) {
        return new Matrix(rows, columns);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be set to zero.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static zeros(rows, columns) {
        return Matrix.empty(rows, columns).fill(0);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be set to one.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static ones(rows, columns) {
        return Matrix.empty(rows, columns).fill(1);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be randomly set.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @param {function} [rng] - Random number generator (default: Math.random)
     * @returns {Matrix} The new matrix
     */
    static rand(rows, columns, rng) {
        if (rng === undefined) rng = Math.random;
        var matrix = Matrix.empty(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                matrix[i][j] = rng();
            }
        }
        return matrix;
    }

    /**
     * Creates an identity matrix with the given dimension. Values of the diagonal will be 1 and others will be 0.
     * @param {number} rows - Number of rows
     * @param {number} [columns] - Number of columns (Default: rows)
     * @returns {Matrix} - The new identity matrix
     */
    static eye(rows, columns) {
        if (columns === undefined) columns = rows;
        var min = Math.min(rows, columns);
        var matrix = Matrix.zeros(rows, columns);
        for (var i = 0; i < min; i++) {
            matrix[i][i] = 1;
        }
        return matrix;
    }

    /**
     * Creates a diagonal matrix based on the given array.
     * @param {Array} data - Array containing the data for the diagonal
     * @param {number} [rows] - Number of rows (Default: data.length)
     * @param {number} [columns] - Number of columns (Default: rows)
     * @returns {Matrix} - The new diagonal matrix
     */
    static diag(data, rows, columns) {
        var l = data.length;
        if (rows === undefined) rows = l;
        if (columns === undefined) columns = rows;
        var min = Math.min(l, rows, columns);
        var matrix = Matrix.zeros(rows, columns);
        for (var i = 0; i < min; i++) {
            matrix[i][i] = data[i];
        }
        return matrix;
    }

    /**
     * Returns a matrix whose elements are the minimum between matrix1 and matrix2
     * @param matrix1
     * @param matrix2
     * @returns {Matrix}
     */
    static min(matrix1, matrix2) {
        var rows = matrix1.length;
        var columns = matrix1[0].length;
        var result = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for(var j = 0; j < columns; j++) {
                result[i][j] = Math.min(matrix1[i][j], matrix2[i][j]);
            }
        }
        return result;
    }

    /**
     * Returns a matrix whose elements are the maximum between matrix1 and matrix2
     * @param matrix1
     * @param matrix2
     * @returns {Matrix}
     */
    static max(matrix1, matrix2) {
        var rows = matrix1.length;
        var columns = matrix1[0].length;
        var result = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for(var j = 0; j < columns; j++) {
                result[i][j] = Math.max(matrix1[i][j], matrix2[i][j]);
            }
        }
        return result;
    }

    /**
     * Check that the provided value is a Matrix and tries to instantiate one if not
     * @param value - The value to check
     * @returns {Matrix}
     */
    static checkMatrix(value) {
        return Matrix.isMatrix(value) ? value : new Matrix(value);
    }

    /**
     * Returns true if the argument is a Matrix, false otherwise
     * @param value - The value to check
     * @return {boolean}
     */
    static isMatrix(value) {
        return (value != null) && (value.klass === 'Matrix');
    }

    /**
     * @property {number} - The number of elements in the matrix.
     */
    get size() {
        return this.rows * this.columns;
    }

    /**
     * Applies a callback for each element of the matrix. The function is called in the matrix (this) context.
     * @param {function} callback - Function that will be called with two parameters : i (row) and j (column)
     * @returns {Matrix} this
     */
    apply(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }
        var ii = this.rows;
        var jj = this.columns;
        for (var i = 0; i < ii; i++) {
            for (var j = 0; j < jj; j++) {
                callback.call(this, i, j);
            }
        }
        return this;
    }

    /**
     * Creates an exact and independent copy of the matrix
     * @returns {Matrix}
     */
    clone() {
        var newMatrix = new Matrix(this.rows, this.columns);
        for (var row = 0; row < this.rows; row++) {
            for (var column = 0; column < this.columns; column++) {
                newMatrix[row][column] = this[row][column];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a new 1D array filled row by row with the matrix values
     * @returns {Array}
     */
    to1DArray() {
        var array = new Array(this.size);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                array[i * this.columns + j] = this[i][j];
            }
        }
        return array;
    }

    /**
     * Returns a 2D array containing a copy of the data
     * @returns {Array}
     */
    to2DArray() {
        var copy = new Array(this.rows);
        for (var i = 0; i < this.rows; i++) {
            copy[i] = [].concat(this[i]);
        }
        return copy;
    }

    /**
     * @returns {boolean} true if the matrix has one row
     */
    isRowVector() {
        return this.rows === 1;
    }

    /**
     * @returns {boolean} true if the matrix has one column
     */
    isColumnVector() {
        return this.columns === 1;
    }

    /**
     * @returns {boolean} true if the matrix has one row or one column
     */
    isVector() {
        return (this.rows === 1) || (this.columns === 1);
    }

    /**
     * @returns {boolean} true if the matrix has the same number of rows and columns
     */
    isSquare() {
        return this.rows === this.columns;
    }

    /**
     * @returns {boolean} true if the matrix is square and has the same values on both sides of the diagonal
     */
    isSymmetric() {
        if (this.isSquare()) {
            for (var i = 0; i < this.rows; i++) {
                for (var j = 0; j <= i; j++) {
                    if (this[i][j] !== this[j][i]) {
                        return false;
                    }
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Sets a given element of the matrix. mat.set(3,4,1) is equivalent to mat[3][4]=1
     * @param {number} rowIndex - Index of the row
     * @param {number} columnIndex - Index of the column
     * @param {number} value - The new value for the element
     * @returns {Matrix} this
     */
    set(rowIndex, columnIndex, value) {
        this[rowIndex][columnIndex] = value;
        return this;
    }

    /**
     * Returns the given element of the matrix. mat.get(3,4) is equivalent to matrix[3][4]
     * @param {number} rowIndex - Index of the row
     * @param {number} columnIndex - Index of the column
     * @returns {number}
     */
    get(rowIndex, columnIndex) {
        return this[rowIndex][columnIndex];
    }

    /**
     * Fills the matrix with a given value. All elements will be set to this value.
     * @param {number} value - New value
     * @returns {Matrix} this
     */
    fill(value) {
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] = value;
            }
        }
        return this;
    }

    /**
     * Negates the matrix. All elements will be multiplied by (-1)
     * @returns {Matrix} this
     */
    neg() {
        return this.mulS(-1);
    }

    /**
     * Returns a new array from the given row index
     * @param {number} index - Row index
     * @returns {Array}
     */
    getRow(index) {
        checkRowIndex(this, index);
        return [].concat(this[index]);
    }

    /**
     * Returns a new row vector from the given row index
     * @param {number} index - Row index
     * @returns {Matrix}
     */
    getRowVector(index) {
        return Matrix.rowVector(this.getRow(index));
    }

    /**
     * Sets a row at the given index
     * @param {number} index - Row index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    setRow(index, array) {
        checkRowIndex(this, index);
        array = checkRowVector(this, array, true);
        this[index] = array;
        return this;
    }

    /**
     * Removes a row from the given index
     * @param {number} index - Row index
     * @returns {Matrix} this
     */
    removeRow(index) {
        checkRowIndex(this, index);
        if (this.rows === 1)
            throw new RangeError('A matrix cannot have less than one row');
        this.splice(index, 1);
        this.rows -= 1;
        return this;
    }

    /**
     * Adds a row at the given index
     * @param {number} [index = this.rows] - Row index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    addRow(index, array) {
        if (array === undefined) {
            array = index;
            index = this.rows;
        }
        checkRowIndex(this, index, true);
        array = checkRowVector(this, array, true);
        this.splice(index, 0, array);
        this.rows += 1;
        return this;
    }

    /**
     * Swaps two rows
     * @param {number} row1 - First row index
     * @param {number} row2 - Second row index
     * @returns {Matrix} this
     */
    swapRows(row1, row2) {
        checkRowIndex(this, row1);
        checkRowIndex(this, row2);
        var temp = this[row1];
        this[row1] = this[row2];
        this[row2] = temp;
        return this;
    }

    /**
     * Returns a new array from the given column index
     * @param {number} index - Column index
     * @returns {Array}
     */
    getColumn(index) {
        checkColumnIndex(this, index);
        var column = new Array(this.rows);
        for (var i = 0; i < this.rows; i++) {
            column[i] = this[i][index];
        }
        return column;
    }

    /**
     * Returns a new column vector from the given column index
     * @param {number} index - Column index
     * @returns {Matrix}
     */
    getColumnVector(index) {
        return Matrix.columnVector(this.getColumn(index));
    }

    /**
     * Sets a column at the given index
     * @param {number} index - Column index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    setColumn(index, array) {
        checkColumnIndex(this, index);
        array = checkColumnVector(this, array);
        for (var i = 0; i < this.rows; i++) {
            this[i][index] = array[i];
        }
        return this;
    }

    /**
     * Removes a column from the given index
     * @param {number} index - Column index
     * @returns {Matrix} this
     */
    removeColumn(index) {
        checkColumnIndex(this, index);
        if (this.columns === 1)
            throw new RangeError('A matrix cannot have less than one column');
        for (var i = 0; i < this.rows; i++) {
            this[i].splice(index, 1);
        }
        this.columns -= 1;
        return this;
    }

    /**
     * Adds a column at the given index
     * @param {number} [index = this.columns] - Column index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    addColumn(index, array) {
        if (typeof array === 'undefined') {
            array = index;
            index = this.columns;
        }
        checkColumnIndex(this, index, true);
        array = checkColumnVector(this, array);
        for (var i = 0; i < this.rows; i++) {
            this[i].splice(index, 0, array[i]);
        }
        this.columns += 1;
        return this;
    }

    /**
     * Swaps two columns
     * @param {number} column1 - First column index
     * @param {number} column2 - Second column index
     * @returns {Matrix} this
     */
    swapColumns(column1, column2) {
        checkColumnIndex(this, column1);
        checkColumnIndex(this, column2);
        var temp, row;
        for (var i = 0; i < this.rows; i++) {
            row = this[i];
            temp = row[column1];
            row[column1] = row[column2];
            row[column2] = temp;
        }
        return this;
    }

    /**
     * Adds the values of a vector to each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    addRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] += vector[j];
            }
        }
        return this;
    }

    /**
     * Subtracts the values of a vector from each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    subRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] -= vector[j];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a vector with each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    mulRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] *= vector[j];
            }
        }
        return this;
    }

    /**
     * Divides the values of each row by those of a vector
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    divRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] /= vector[j];
            }
        }
        return this;
    }

    /**
     * Adds the values of a vector to each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    addColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] += vector[i];
            }
        }
        return this;
    }

    /**
     * Subtracts the values of a vector from each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    subColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] -= vector[i];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a vector with each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    mulColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] *= vector[i];
            }
        }
        return this;
    }

    /**
     * Divides the values of each column by those of a vector
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    divColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] /= vector[i];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a row with a scalar
     * @param {number} index - Row index
     * @param {number} value
     * @returns {Matrix} this
     */
    mulRow(index, value) {
        checkRowIndex(this, index);
        for (var i = 0; i < this.columns; i++) {
            this[index][i] *= value;
        }
        return this;
    }

    /**
     * Multiplies the values of a column with a scalar
     * @param {number} index - Column index
     * @param {number} value
     * @returns {Matrix} this
     */
    mulColumn(index, value) {
        checkColumnIndex(this, index);
        for (var i = 0; i < this.rows; i++) {
            this[i][index] *= value;
        }
    }

    /**
     * Returns the maximum value of the matrix
     * @returns {number}
     */
    max() {
        var v = this[0][0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] > v) {
                    v = this[i][j];
                }
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value
     * @returns {Array}
     */
    maxIndex() {
        var v = this[0][0];
        var idx = [0, 0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] > v) {
                    v = this[i][j];
                    idx[0] = i;
                    idx[1] = j;
                }
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of the matrix
     * @returns {number}
     */
    min() {
        var v = this[0][0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] < v) {
                    v = this[i][j];
                }
            }
        }
        return v;
    }

    /**
     * Returns the index of the minimum value
     * @returns {Array}
     */
    minIndex() {
        var v = this[0][0];
        var idx = [0, 0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] < v) {
                    v = this[i][j];
                    idx[0] = i;
                    idx[1] = j;
                }
            }
        }
        return idx;
    }

    /**
     * Returns the maximum value of one row
     * @param {number} row - Row index
     * @returns {number}
     */
    maxRow(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] > v) {
                v = this[row][i];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one row
     * @param {number} row - Row index
     * @returns {Array}
     */
    maxRowIndex(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        var idx = [row, 0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] > v) {
                v = this[row][i];
                idx[1] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of one row
     * @param {number} row - Row index
     * @returns {number}
     */
    minRow(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] < v) {
                v = this[row][i];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one row
     * @param {number} row - Row index
     * @returns {Array}
     */
    minRowIndex(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        var idx = [row, 0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] < v) {
                v = this[row][i];
                idx[1] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the maximum value of one column
     * @param {number} column - Column index
     * @returns {number}
     */
    maxColumn(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] > v) {
                v = this[i][column];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one column
     * @param {number} column - Column index
     * @returns {Array}
     */
    maxColumnIndex(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        var idx = [0, column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] > v) {
                v = this[i][column];
                idx[0] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of one column
     * @param {number} column - Column index
     * @returns {number}
     */
    minColumn(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] < v) {
                v = this[i][column];
            }
        }
        return v;
    }

    /**
     * Returns the index of the minimum value of one column
     * @param {number} column - Column index
     * @returns {Array}
     */
    minColumnIndex(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        var idx = [0, column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] < v) {
                v = this[i][column];
                idx[0] = i;
            }
        }
        return idx;
    }

    /**
     * Returns an array containing the diagonal values of the matrix
     * @returns {Array}
     */
    diag() {
        var min = Math.min(this.rows, this.columns);
        var diag = new Array(min);
        for (var i = 0; i < min; i++) {
            diag[i] = this[i][i];
        }
        return diag;
    }

    /**
     * Returns the sum of all elements of the matrix
     * @returns {number}
     */
    sum() {
        var v = 0;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                v += this[i][j];
            }
        }
        return v;
    }

    /**
     * Returns the mean of all elements of the matrix
     * @returns {number}
     */
    mean() {
        return this.sum() / this.size;
    }

    /**
     * Returns the product of all elements of the matrix
     * @returns {number}
     */
    prod() {
        var prod = 1;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                prod *= this[i][j];
            }
        }
        return prod;
    }

    /**
     * Computes the cumulative sum of the matrix elements (in place, row by row)
     * @returns {Matrix} this
     */
    cumulativeSum() {
        var sum = 0;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                sum += this[i][j];
                this[i][j] = sum;
            }
        }
        return this;
    }

    /**
     * Computes the dot (scalar) product between the matrix and another
     * @param {Matrix} vector2 vector
     * @returns {number}
     */
    dot(vector2) {
        if (Matrix.isMatrix(vector2)) vector2 = vector2.to1DArray();
        var vector1 = this.to1DArray();
        if (vector1.length !== vector2.length) {
            throw new RangeError('vectors do not have the same size');
        }
        var dot = 0;
        for (var i = 0; i < vector1.length; i++) {
            dot += vector1[i] * vector2[i];
        }
        return dot;
    }

    /**
     * Returns the matrix product between this and other
     * @returns {Matrix}
     */
    mmul(other) {
        other = Matrix.checkMatrix(other);
        if (this.columns !== other.rows)
            console.warn('Number of columns of left matrix are not equal to number of rows of right matrix.');

        var m = this.rows;
        var n = this.columns;
        var p = other.columns;

        var result = new Matrix(m, p);

        var Bcolj = new Array(n);
        for (var j = 0; j < p; j++) {
            for (var k = 0; k < n; k++)
                Bcolj[k] = other[k][j];

            for (var i = 0; i < m; i++) {
                var Arowi = this[i];

                var s = 0;
                for (k = 0; k < n; k++)
                    s += Arowi[k] * Bcolj[k];

                result[i][j] = s;
            }
        }
        return result;
    }

    /**
     * Transposes the matrix and returns a new one containing the result
     * @returns {Matrix}
     */
    transpose() {
        var result = new Matrix(this.columns, this.rows);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                result[j][i] = this[i][j];
            }
        }
        return result;
    }

    /**
     * Sorts the rows (in place)
     * @param {function} compareFunction - usual Array.prototype.sort comparison function
     * @returns {Matrix} this
     */
    sortRows(compareFunction) {
        if (compareFunction === undefined) compareFunction = compareNumbers;
        for (var i = 0; i < this.rows; i++) {
            this[i].sort(compareFunction);
        }
        return this;
    }

    /**
     * Sorts the columns (in place)
     * @param {function} compareFunction - usual Array.prototype.sort comparison function
     * @returns {Matrix} this
     */
    sortColumns(compareFunction) {
        if (compareFunction === undefined) compareFunction = compareNumbers;
        for (var i = 0; i < this.columns; i++) {
            this.setColumn(i, this.getColumn(i).sort(compareFunction));
        }
        return this;
    }

    /**
     * Returns a subset of the matrix
     * @param {number} startRow - First row index
     * @param {number} endRow - Last row index
     * @param {number} startColumn - First column index
     * @param {number} endColumn - Last column index
     * @returns {Matrix}
     */
    subMatrix(startRow, endRow, startColumn, endColumn) {
        if ((startRow > endRow) || (startColumn > endColumn) || (startRow < 0) || (startRow >= this.rows) || (endRow < 0) || (endRow >= this.rows) || (startColumn < 0) || (startColumn >= this.columns) || (endColumn < 0) || (endColumn >= this.columns)) {
            throw new RangeError('Argument out of range');
        }
        var newMatrix = new Matrix(endRow - startRow + 1, endColumn - startColumn + 1);
        for (var i = startRow; i <= endRow; i++) {
            for (var j = startColumn; j <= endColumn; j++) {
                newMatrix[i - startRow][j - startColumn] = this[i][j];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a subset of the matrix based on an array of row indices
     * @param {Array} indices - Array containing the row indices
     * @param {number} [startColumn = 0] - First column index
     * @param {number} [endColumn = this.columns-1] - Last column index
     * @returns {Matrix}
     */
    subMatrixRow(indices, startColumn, endColumn) {
        if (startColumn === undefined) startColumn = 0;
        if (endColumn === undefined) endColumn = this.columns - 1;
        if ((startColumn > endColumn) || (startColumn < 0) || (startColumn >= this.columns) || (endColumn < 0) || (endColumn >= this.columns)) {
            throw new RangeError('Argument out of range');
        }

        var newMatrix = new Matrix(indices.length, endColumn - startColumn + 1);
        for (var i = 0; i < indices.length; i++) {
            for (var j = startColumn; j <= endColumn; j++) {
                if (indices[i] < 0 || indices[i] >= this.rows) {
                    throw new RangeError('Row index out of range: ' + indices[i]);
                }
                newMatrix[i][j - startColumn] = this[indices[i]][j];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a subset of the matrix based on an array of column indices
     * @param {Array} indices - Array containing the column indices
     * @param {number} [startRow = 0] - First row index
     * @param {number} [endRow = this.rows-1] - Last row index
     * @returns {Matrix}
     */
    subMatrixColumn(indices, startRow, endRow) {
        if (startRow === undefined) startRow = 0;
        if (endRow === undefined) endRow = this.rows - 1;
        if ((startRow > endRow) || (startRow < 0) || (startRow >= this.rows) || (endRow < 0) || (endRow >= this.rows)) {
            throw new RangeError('Argument out of range');
        }

        var newMatrix = new Matrix(endRow - startRow + 1, indices.length);
        for (var i = 0; i < indices.length; i++) {
            for (var j = startRow; j <= endRow; j++) {
                if (indices[i] < 0 || indices[i] >= this.columns) {
                    throw new RangeError('Column index out of range: ' + indices[i]);
                }
                newMatrix[j - startRow][i] = this[j][indices[i]];
            }
        }
        return newMatrix;
    }

    /**
     * Returns the trace of the matrix (sum of the diagonal elements)
     * @returns {number}
     */
    trace() {
        var min = Math.min(this.rows, this.columns);
        var trace = 0;
        for (var i = 0; i < min; i++) {
            trace += this[i][i];
        }
        return trace;
    }
}

Matrix.prototype.klass = 'Matrix';

module.exports = Matrix;

/**
 * @private
 * Check that a row index is not out of bounds
 * @param {Matrix} matrix
 * @param {number} index
 * @param {boolean} [outer]
 */
function checkRowIndex(matrix, index, outer) {
    var max = outer ? matrix.rows : matrix.rows - 1;
    if (index < 0 || index > max)
        throw new RangeError('Row index out of range');
}

/**
 * @private
 * Check that the provided vector is an array with the right length
 * @param {Matrix} matrix
 * @param {Array|Matrix} vector
 * @param {boolean} copy
 * @returns {Array}
 * @throws {RangeError}
 */
function checkRowVector(matrix, vector, copy) {
    if (Matrix.isMatrix(vector)) {
        vector = vector.to1DArray();
    } else if (copy) {
        vector = [].concat(vector);
    }
    if (vector.length !== matrix.columns)
        throw new RangeError('vector size must be the same as the number of columns');
    return vector;
}

/**
 * @private
 * Check that the provided vector is an array with the right length
 * @param {Matrix} matrix
 * @param {Array|Matrix} vector
 * @param {boolean} copy
 * @returns {Array}
 * @throws {RangeError}
 */
function checkColumnVector(matrix, vector, copy) {
    if (Matrix.isMatrix(vector)) {
        vector = vector.to1DArray();
    } else if (copy) {
        vector = [].concat(vector);
    }
    if (vector.length !== matrix.rows)
        throw new RangeError('vector size must be the same as the number of rows');
    return vector;
}

/**
 * @private
 * Check that a column index is not out of bounds
 * @param {Matrix} matrix
 * @param {number} index
 * @param {boolean} [outer]
 */
function checkColumnIndex(matrix, index, outer) {
    var max = outer ? matrix.columns : matrix.columns - 1;
    if (index < 0 || index > max)
        throw new RangeError('Column index out of range');
}

/**
 * @private
 * Check that two matrices have the same dimensions
 * @param {Matrix} matrix
 * @param {Matrix} otherMatrix
 */
function checkDimensions(matrix, otherMatrix) {
    if (matrix.rows !== otherMatrix.length ||
        matrix.columns !== otherMatrix[0].length) {
        throw new RangeError('Matrices dimensions must be equal');
    }
}

function compareNumbers(a, b) {
    return a - b;
}

/*
Synonyms
 */

Matrix.random = Matrix.rand;
Matrix.diagonal = Matrix.diag;
Matrix.prototype.diagonal = Matrix.prototype.diag;
Matrix.identity = Matrix.eye;
Matrix.prototype.negate = Matrix.prototype.neg;

/*
Add dynamically instance and static methods for mathematical operations
 */

var inplaceOperator = `
(function %name%(value) {
    if (typeof value === 'number') return this.%name%S(value);
    return this.%name%M(value);
})
`;

var inplaceOperatorScalar = `
(function %name%S(value) {
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = this[i][j] %op% value;
        }
    }
    return this;
})
`;

var inplaceOperatorMatrix = `
(function %name%M(matrix) {
    checkDimensions(this, matrix);
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = this[i][j] %op% matrix[i][j];
        }
    }
    return this;
})
`;

var staticOperator = `
(function %name%(matrix, value) {
    var newMatrix = new Matrix(matrix);
    return newMatrix.%name%(value);
})
`;

var inplaceMethod = `
(function %name%() {
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = %method%(this[i][j]);
        }
    }
    return this;
})
`;

var staticMethod = `
(function %name%(matrix) {
    var newMatrix = new Matrix(matrix);
    return newMatrix.%name%();
})
`;

var operators = [
    // Arithmetic operators
    ['+', 'add'],
    ['-', 'sub', 'subtract'],
    ['*', 'mul', 'multiply'],
    ['/', 'div', 'divide'],
    ['%', 'mod', 'modulus'],
    // Bitwise operators
    ['&', 'and'],
    ['|', 'or'],
    ['^', 'xor'],
    ['<<', 'leftShift'],
    ['>>', 'signPropagatingRightShift'],
    ['>>>', 'rightShift', 'zeroFillRightShift']
];

for (var operator of operators) {
    for (var i = 1; i < operator.length; i++) {
        Matrix.prototype[operator[i]] = eval(fillTemplateFunction(inplaceOperator, {name: operator[i], op: operator[0]}));
        Matrix.prototype[operator[i] + 'S'] = eval(fillTemplateFunction(inplaceOperatorScalar, {name: operator[i] + 'S', op: operator[0]}));
        Matrix.prototype[operator[i] + 'M'] = eval(fillTemplateFunction(inplaceOperatorMatrix, {name: operator[i] + 'M', op: operator[0]}));

        Matrix[operator[i]] = eval(fillTemplateFunction(staticOperator, {name: operator[i]}));
    }
}

var methods = [
    ['~', 'not']
];

[
    'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'cbrt', 'ceil',
    'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'log', 'log1p',
    'log10', 'log2', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc'
].forEach(function (mathMethod) {
    methods.push(['Math.' + mathMethod, mathMethod]);
});

for (var method of methods) {
    for (var i = 1; i < method.length; i++) {
        Matrix.prototype[method[i]] = eval(fillTemplateFunction(inplaceMethod, {name: method[i], method: method[0]}));
        Matrix[method[i]] = eval(fillTemplateFunction(staticMethod, {name: method[i]}));
    }
}

function fillTemplateFunction(template, values) {
    for (var i in values) {
        template = template.replace(new RegExp('%' + i + '%', 'g'), values[i]);
    }
    return template;
}

},{}],11:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"../matrix":19,"dup":2}],12:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"../matrix":19,"./util":16,"dup":3}],13:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"../matrix":19,"dup":4}],14:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"../matrix":19,"./util":16,"dup":5}],15:[function(require,module,exports){
arguments[4][6][0].apply(exports,arguments)
},{"../matrix":19,"./util":16,"dup":6}],16:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],17:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"./dc/cholesky":11,"./dc/evd":12,"./dc/lu":13,"./dc/qr":14,"./dc/svd":15,"./matrix":19,"dup":8}],18:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"./decompositions":17,"./matrix":19,"dup":9}],19:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],20:[function(require,module,exports){
'use strict';

function compareNumbers(a, b) {
    return a - b;
}

/**
 * Computes the sum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.sum = function sum(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum;
};

/**
 * Computes the maximum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.max = function max(values) {
    var max = -Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] > max) max = values[i];
    }
    return max;
};

/**
 * Computes the minimum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.min = function min(values) {
    var min = Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] < min) min = values[i];
    }
    return min;
};

/**
 * Computes the min and max of the given values
 * @param {Array} values
 * @returns {{min: number, max: number}}
 */
exports.minMax = function minMax(values) {
    var min = Infinity;
    var max = -Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
    }
    return {
        min: min,
        max: max
    };
};

/**
 * Computes the arithmetic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.arithmeticMean = function arithmeticMean(values) {
    var sum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        sum += values[i];
    }
    return sum / l;
};

/**
 * {@link arithmeticMean}
 */
exports.mean = exports.arithmeticMean;

/**
 * Computes the geometric mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.geometricMean = function geometricMean(values) {
    var mul = 1;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        mul *= values[i];
    }
    return Math.pow(mul, 1 / l);
};

/**
 * Computes the mean of the log of the given values
 * If the return value is exponentiated, it gives the same result as the
 * geometric mean.
 * @param {Array} values
 * @returns {number}
 */
exports.logMean = function logMean(values) {
    var lnsum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        lnsum += Math.log(values[i]);
    }
    return lnsum / l;
};

/**
 * Computes the weighted grand mean for a list of means and sample sizes
 * @param {Array} means - Mean values for each set of samples
 * @param {Array} samples - Number of original values for each set of samples
 * @returns {number}
 */
exports.grandMean = function grandMean(means, samples) {
    var sum = 0;
    var n = 0;
    var l = means.length;
    for (var i = 0; i < l; i++) {
        sum += samples[i] * means[i];
        n += samples[i];
    }
    return sum / n;
};

/**
 * Computes the truncated mean of the given values using a given percentage
 * @param {Array} values
 * @param {number} percent - The percentage of values to keep (range: [0,1])
 * @param {boolean} [alreadySorted=false]
 * @returns {number}
 */
exports.truncatedMean = function truncatedMean(values, percent, alreadySorted) {
    if (alreadySorted === undefined) alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice().sort(compareNumbers);
    }
    var l = values.length;
    var k = Math.floor(l * percent);
    var sum = 0;
    for (var i = k; i < (l - k); i++) {
        sum += values[i];
    }
    return sum / (l - 2 * k);
};

/**
 * Computes the harmonic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.harmonicMean = function harmonicMean(values) {
    var sum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] === 0) {
            throw new RangeError('value at index ' + i + 'is zero');
        }
        sum += 1 / values[i];
    }
    return l / sum;
};

/**
 * Computes the contraharmonic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.contraHarmonicMean = function contraHarmonicMean(values) {
    var r1 = 0;
    var r2 = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        r1 += values[i] * values[i];
        r2 += values[i];
    }
    if (r2 < 0) {
        throw new RangeError('sum of values is negative');
    }
    return r1 / r2;
};

/**
 * Computes the median of the given values
 * @param {Array} values
 * @param {boolean} [alreadySorted=false]
 * @returns {number}
 */
exports.median = function median(values, alreadySorted) {
    if (alreadySorted === undefined) alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice().sort(compareNumbers);
    }
    var l = values.length;
    var half = Math.floor(l / 2);
    if (l % 2 === 0) {
        return (values[half - 1] + values[half]) * 0.5;
    } else {
        return values[half];
    }
};

/**
 * Computes the variance of the given values
 * @param {Array} values
 * @param {boolean} [unbiased=true] - if true, divide by (n-1); if false, divide by n.
 * @returns {number}
 */
exports.variance = function variance(values, unbiased) {
    if (unbiased === undefined) unbiased = true;
    var theMean = exports.mean(values);
    var theVariance = 0;
    var l = values.length;

    for (var i = 0; i < l; i++) {
        var x = values[i] - theMean;
        theVariance += x * x;
    }

    if (unbiased) {
        return theVariance / (l - 1);
    } else {
        return theVariance / l;
    }
};

/**
 * Computes the standard deviation of the given values
 * @param {Array} values
 * @param {boolean} [unbiased=true] - if true, divide by (n-1); if false, divide by n.
 * @returns {number}
 */
exports.standardDeviation = function standardDeviation(values, unbiased) {
    return Math.sqrt(exports.variance(values, unbiased));
};

exports.standardError = function standardError(values) {
    return exports.standardDeviation(values) / Math.sqrt(values.length);
};

exports.quartiles = function quartiles(values, alreadySorted) {
    if (typeof(alreadySorted) === 'undefined') alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice();
        values.sort(compareNumbers);
    }

    var quart = values.length / 4;
    var q1 = values[Math.ceil(quart) - 1];
    var q2 = exports.median(values, true);
    var q3 = values[Math.ceil(quart * 3) - 1];

    return {q1: q1, q2: q2, q3: q3};
};

exports.pooledStandardDeviation = function pooledStandardDeviation(samples, unbiased) {
    return Math.sqrt(exports.pooledVariance(samples, unbiased));
};

exports.pooledVariance = function pooledVariance(samples, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var sum = 0;
    var length = 0, l = samples.length;
    for (var i = 0; i < l; i++) {
        var values = samples[i];
        var vari = exports.variance(values);

        sum += (values.length - 1) * vari;

        if (unbiased)
            length += values.length - 1;
        else
            length += values.length;
    }
    return sum / length;
};

exports.mode = function mode(values) {
    var l = values.length,
        itemCount = new Array(l),
        i;
    for (i = 0; i < l; i++) {
        itemCount[i] = 0;
    }
    var itemArray = new Array(l);
    var count = 0;

    for (i = 0; i < l; i++) {
        var index = itemArray.indexOf(values[i]);
        if (index >= 0)
            itemCount[index]++;
        else {
            itemArray[count] = values[i];
            itemCount[count] = 1;
            count++;
        }
    }

    var maxValue = 0, maxIndex = 0;
    for (i = 0; i < count; i++) {
        if (itemCount[i] > maxValue) {
            maxValue = itemCount[i];
            maxIndex = i;
        }
    }

    return itemArray[maxIndex];
};

exports.covariance = function covariance(vector1, vector2, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var mean1 = exports.mean(vector1);
    var mean2 = exports.mean(vector2);

    if (vector1.length !== vector2.length)
        throw "Vectors do not have the same dimensions";

    var cov = 0, l = vector1.length;
    for (var i = 0; i < l; i++) {
        var x = vector1[i] - mean1;
        var y = vector2[i] - mean2;
        cov += x * y;
    }

    if (unbiased)
        return cov / (l - 1);
    else
        return cov / l;
};

exports.skewness = function skewness(values, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var theMean = exports.mean(values);

    var s2 = 0, s3 = 0, l = values.length;
    for (var i = 0; i < l; i++) {
        var dev = values[i] - theMean;
        s2 += dev * dev;
        s3 += dev * dev * dev;
    }
    var m2 = s2 / l;
    var m3 = s3 / l;

    var g = m3 / (Math.pow(m2, 3 / 2.0));
    if (unbiased) {
        var a = Math.sqrt(l * (l - 1));
        var b = l - 2;
        return (a / b) * g;
    }
    else {
        return g;
    }
};

exports.kurtosis = function kurtosis(values, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var theMean = exports.mean(values);
    var n = values.length, s2 = 0, s4 = 0;

    for (var i = 0; i < n; i++) {
        var dev = values[i] - theMean;
        s2 += dev * dev;
        s4 += dev * dev * dev * dev;
    }
    var m2 = s2 / n;
    var m4 = s4 / n;

    if (unbiased) {
        var v = s2 / (n - 1);
        var a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
        var b = s4 / (v * v);
        var c = ((n - 1) * (n - 1)) / ((n - 2) * (n - 3));

        return a * b - 3 * c;
    }
    else {
        return m4 / (m2 * m2) - 3;
    }
};

exports.entropy = function entropy(values, eps) {
    if (typeof(eps) === 'undefined') eps = 0;
    var sum = 0, l = values.length;
    for (var i = 0; i < l; i++)
        sum += values[i] * Math.log(values[i] + eps);
    return -sum;
};

exports.weightedMean = function weightedMean(values, weights) {
    var sum = 0, l = values.length;
    for (var i = 0; i < l; i++)
        sum += values[i] * weights[i];
    return sum;
};

exports.weightedStandardDeviation = function weightedStandardDeviation(values, weights) {
    return Math.sqrt(exports.weightedVariance(values, weights));
};

exports.weightedVariance = function weightedVariance(values, weights) {
    var theMean = exports.weightedMean(values, weights);
    var vari = 0, l = values.length;
    var a = 0, b = 0;

    for (var i = 0; i < l; i++) {
        var z = values[i] - theMean;
        var w = weights[i];

        vari += w * (z * z);
        b += w;
        a += w * w;
    }

    return vari * (b / (b * b - a));
};

exports.center = function center(values, inPlace) {
    if (typeof(inPlace) === 'undefined') inPlace = false;

    var result = values;
    if (!inPlace)
        result = values.slice();

    var theMean = exports.mean(result), l = result.length;
    for (var i = 0; i < l; i++)
        result[i] -= theMean;
};

exports.standardize = function standardize(values, standardDev, inPlace) {
    if (typeof(standardDev) === 'undefined') standardDev = exports.standardDeviation(values);
    if (typeof(inPlace) === 'undefined') inPlace = false;
    var l = values.length;
    var result = inPlace ? values : new Array(l);
    for (var i = 0; i < l; i++)
        result[i] = values[i] / standardDev;
    return result;
};

exports.cumulativeSum = function cumulativeSum(array) {
    var l = array.length;
    var result = new Array(l);
    result[0] = array[0];
    for (var i = 1; i < l; i++)
        result[i] = result[i - 1] + array[i];
    return result;
};

},{}],21:[function(require,module,exports){
'use strict';

exports.array = require('./array');
exports.matrix = require('./matrix');

},{"./array":20,"./matrix":22}],22:[function(require,module,exports){
'use strict';
var arrayStat = require('./array');

// https://github.com/accord-net/framework/blob/development/Sources/Accord.Statistics/Tools.cs

function entropy(matrix, eps) {
    if (typeof(eps) === 'undefined') {
        eps = 0;
    }
    var sum = 0,
        l1 = matrix.length,
        l2 = matrix[0].length;
    for (var i = 0; i < l1; i++) {
        for (var j = 0; j < l2; j++) {
            sum += matrix[i][j] * Math.log(matrix[i][j] + eps);
        }
    }
    return -sum;
}

function mean(matrix, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    var rows = matrix.length,
        cols = matrix[0].length,
        theMean, N, i, j;

    if (dimension === -1) {
        theMean = [0];
        N = rows * cols;
        for (i = 0; i < rows; i++) {
            for (j = 0; j < cols; j++) {
                theMean[0] += matrix[i][j];
            }
        }
        theMean[0] /= N;
    } else if (dimension === 0) {
        theMean = new Array(cols);
        N = rows;
        for (j = 0; j < cols; j++) {
            theMean[j] = 0;
            for (i = 0; i < rows; i++) {
                theMean[j] += matrix[i][j];
            }
            theMean[j] /= N;
        }
    } else if (dimension === 1) {
        theMean = new Array(rows);
        N = cols;
        for (j = 0; j < rows; j++) {
            theMean[j] = 0;
            for (i = 0; i < cols; i++) {
                theMean[j] += matrix[j][i];
            }
            theMean[j] /= N;
        }
    } else {
        throw new Error('Invalid dimension');
    }
    return theMean;
}

function standardDeviation(matrix, means, unbiased) {
    var vari = variance(matrix, means, unbiased), l = vari.length;
    for (var i = 0; i < l; i++) {
        vari[i] = Math.sqrt(vari[i]);
    }
    return vari;
}

function variance(matrix, means, unbiased) {
    if (typeof(unbiased) === 'undefined') {
        unbiased = true;
    }
    means = means || mean(matrix);
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length;
    var vari = new Array(cols);

    for (var j = 0; j < cols; j++) {
        var sum1 = 0, sum2 = 0, x = 0;
        for (var i = 0; i < rows; i++) {
            x = matrix[i][j] - means[j];
            sum1 += x;
            sum2 += x * x;
        }
        if (unbiased) {
            vari[j] = (sum2 - ((sum1 * sum1) / rows)) / (rows - 1);
        } else {
            vari[j] = (sum2 - ((sum1 * sum1) / rows)) / rows;
        }
    }
    return vari;
}

function median(matrix) {
    var rows = matrix.length, cols = matrix[0].length;
    var medians = new Array(cols);

    for (var i = 0; i < cols; i++) {
        var data = new Array(rows);
        for (var j = 0; j < rows; j++) {
            data[j] = matrix[j][i];
        }
        data.sort();
        var N = data.length;
        if (N % 2 === 0) {
            medians[i] = (data[N / 2] + data[(N / 2) - 1]) * 0.5;
        } else {
            medians[i] = data[Math.floor(N / 2)];
        }
    }
    return medians;
}

function mode(matrix) {
    var rows = matrix.length,
        cols = matrix[0].length,
        modes = new Array(cols),
        i, j;
    for (i = 0; i < cols; i++) {
        var itemCount = new Array(rows);
        for (var k = 0; k < rows; k++) {
            itemCount[k] = 0;
        }
        var itemArray = new Array(rows);
        var count = 0;

        for (j = 0; j < rows; j++) {
            var index = itemArray.indexOf(matrix[j][i]);
            if (index >= 0) {
                itemCount[index]++;
            } else {
                itemArray[count] = matrix[j][i];
                itemCount[count] = 1;
                count++;
            }
        }

        var maxValue = 0, maxIndex = 0;
        for (j = 0; j < count; j++) {
            if (itemCount[j] > maxValue) {
                maxValue = itemCount[j];
                maxIndex = j;
            }
        }

        modes[i] = itemArray[maxIndex];
    }
    return modes;
}

function skewness(matrix, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var means = mean(matrix);
    var n = matrix.length, l = means.length;
    var skew = new Array(l);

    for (var j = 0; j < l; j++) {
        var s2 = 0, s3 = 0;
        for (var i = 0; i < n; i++) {
            var dev = matrix[i][j] - means[j];
            s2 += dev * dev;
            s3 += dev * dev * dev;
        }

        var m2 = s2 / n;
        var m3 = s3 / n;
        var g = m3 / Math.pow(m2, 3 / 2);

        if (unbiased) {
            var a = Math.sqrt(n * (n - 1));
            var b = n - 2;
            skew[j] = (a / b) * g;
        } else {
            skew[j] = g;
        }
    }
    return skew;
}

function kurtosis(matrix, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var means = mean(matrix);
    var n = matrix.length, m = matrix[0].length;
    var kurt = new Array(m);

    for (var j = 0; j < m; j++) {
        var s2 = 0, s4 = 0;
        for (var i = 0; i < n; i++) {
            var dev = matrix[i][j] - means[j];
            s2 += dev * dev;
            s4 += dev * dev * dev * dev;
        }
        var m2 = s2 / n;
        var m4 = s4 / n;

        if (unbiased) {
            var v = s2 / (n - 1);
            var a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
            var b = s4 / (v * v);
            var c = ((n - 1) * (n - 1)) / ((n - 2) * (n - 3));
            kurt[j] = a * b - 3 * c;
        } else {
            kurt[j] = m4 / (m2 * m2) - 3;
        }
    }
    return kurt;
}

function standardError(matrix) {
    var samples = matrix.length;
    var standardDeviations = standardDeviation(matrix), l = standardDeviations.length;
    var standardErrors = new Array(l);
    var sqrtN = Math.sqrt(samples);

    for (var i = 0; i < l; i++) {
        standardErrors[i] = standardDeviations[i] / sqrtN;
    }
    return standardErrors;
}

function covariance(matrix, dimension) {
    return scatter(matrix, undefined, dimension);
}

function scatter(matrix, divisor, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    if (typeof(divisor) === 'undefined') {
        if (dimension === 0) {
            divisor = matrix.length - 1;
        } else if (dimension === 1) {
            divisor = matrix[0].length - 1;
        }
    }
    var means = mean(matrix, dimension),
        rows = matrix.length;
    if (rows === 0) {
        return [[]];
    }
    var cols = matrix[0].length,
        cov, i, j, s, k;

    if (dimension === 0) {
        cov = new Array(cols);
        for (i = 0; i < cols; i++) {
            cov[i] = new Array(cols);
        }
        for (i = 0; i < cols; i++) {
            for (j = i; j < cols; j++) {
                s = 0;
                for (k = 0; k < rows; k++) {
                    s += (matrix[k][j] - means[j]) * (matrix[k][i] - means[i]);
                }
                s /= divisor;
                cov[i][j] = s;
                cov[j][i] = s;
            }
        }
    } else if (dimension === 1) {
        cov = new Array(rows);
        for (i = 0; i < rows; i++) {
            cov[i] = new Array(rows);
        }
        for (i = 0; i < rows; i++) {
            for (j = i; j < rows; j++) {
                s = 0;
                for (k = 0; k < cols; k++) {
                    s += (matrix[j][k] - means[j]) * (matrix[i][k] - means[i]);
                }
                s /= divisor;
                cov[i][j] = s;
                cov[j][i] = s;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    return cov;
}

function correlation(matrix) {
    var means = mean(matrix),
        standardDeviations = standardDeviation(matrix, true, means),
        scores = zScores(matrix, means, standardDeviations),
        rows = matrix.length,
        cols = matrix[0].length,
        i, j;

    var cor = new Array(cols);
    for (i = 0; i < cols; i++) {
        cor[i] = new Array(cols);
    }
    for (i = 0; i < cols; i++) {
        for (j = i; j < cols; j++) {
            var c = 0;
            for (var k = 0, l = scores.length; k < l; k++) {
                c += scores[k][j] * scores[k][i];
            }
            c /= rows - 1;
            cor[i][j] = c;
            cor[j][i] = c;
        }
    }
    return cor;
}

function zScores(matrix, means, standardDeviations) {
    means = means || mean(matrix);
    if (typeof(standardDeviations) === 'undefined') standardDeviations = standardDeviation(matrix, true, means);
    return standardize(center(matrix, means, false), standardDeviations, true);
}

function center(matrix, means, inPlace) {
    means = means || mean(matrix);
    var result = matrix,
        l = matrix.length,
        i, j, jj;

    if (!inPlace) {
        result = new Array(l);
        for (i = 0; i < l; i++) {
            result[i] = new Array(matrix[i].length);
        }
    }

    for (i = 0; i < l; i++) {
        var row = result[i];
        for (j = 0, jj = row.length; j < jj; j++) {
            row[j] = matrix[i][j] - means[j];
        }
    }
    return result;
}

function standardize(matrix, standardDeviations, inPlace) {
    if (typeof(standardDeviations) === 'undefined') standardDeviations = standardDeviation(matrix);
    var result = matrix,
        l = matrix.length,
        i, j, jj;

    if (!inPlace) {
        result = new Array(l);
        for (i = 0; i < l; i++) {
            result[i] = new Array(matrix[i].length);
        }
    }

    for (i = 0; i < l; i++) {
        var resultRow = result[i];
        var sourceRow = matrix[i];
        for (j = 0, jj = resultRow.length; j < jj; j++) {
            if (standardDeviations[j] !== 0 && !isNaN(standardDeviations[j])) {
                resultRow[j] = sourceRow[j] / standardDeviations[j];
            }
        }
    }
    return result;
}

function weightedVariance(matrix, weights) {
    var means = mean(matrix);
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length;
    var vari = new Array(cols);

    for (var j = 0; j < cols; j++) {
        var sum = 0;
        var a = 0, b = 0;

        for (var i = 0; i < rows; i++) {
            var z = matrix[i][j] - means[j];
            var w = weights[i];

            sum += w * (z * z);
            b += w;
            a += w * w;
        }

        vari[j] = sum * (b / (b * b - a));
    }

    return vari;
}

function weightedMean(matrix, weights, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length,
        means, i, ii, j, w, row;

    if (dimension === 0) {
        means = new Array(cols);
        for (i = 0; i < cols; i++) {
            means[i] = 0;
        }
        for (i = 0; i < rows; i++) {
            row = matrix[i];
            w = weights[i];
            for (j = 0; j < cols; j++) {
                means[j] += row[j] * w;
            }
        }
    } else if (dimension === 1) {
        means = new Array(rows);
        for (i = 0; i < rows; i++) {
            means[i] = 0;
        }
        for (j = 0; j < rows; j++) {
            row = matrix[j];
            w = weights[j];
            for (i = 0; i < cols; i++) {
                means[j] += row[i] * w;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    var weightSum = arrayStat.sum(weights);
    if (weightSum !== 0) {
        for (i = 0, ii = means.length; i < ii; i++) {
            means[i] /= weightSum;
        }
    }
    return means;
}

function weightedCovariance(matrix, weights, means, dimension) {
    dimension = dimension || 0;
    means = means || weightedMean(matrix, weights, dimension);
    var s1 = 0, s2 = 0;
    for (var i = 0, ii = weights.length; i < ii; i++) {
        s1 += weights[i];
        s2 += weights[i] * weights[i];
    }
    var factor = s1 / (s1 * s1 - s2);
    return weightedScatter(matrix, weights, means, factor, dimension);
}

function weightedScatter(matrix, weights, means, factor, dimension) {
    dimension = dimension || 0;
    means = means || weightedMean(matrix, weights, dimension);
    if (typeof(factor) === 'undefined') {
        factor = 1;
    }
    var rows = matrix.length;
    if (rows === 0) {
        return [[]];
    }
    var cols = matrix[0].length,
        cov, i, j, k, s;

    if (dimension === 0) {
        cov = new Array(cols);
        for (i = 0; i < cols; i++) {
            cov[i] = new Array(cols);
        }
        for (i = 0; i < cols; i++) {
            for (j = i; j < cols; j++) {
                s = 0;
                for (k = 0; k < rows; k++) {
                    s += weights[k] * (matrix[k][j] - means[j]) * (matrix[k][i] - means[i]);
                }
                cov[i][j] = s * factor;
                cov[j][i] = s * factor;
            }
        }
    } else if (dimension === 1) {
        cov = new Array(rows);
        for (i = 0; i < rows; i++) {
            cov[i] = new Array(rows);
        }
        for (i = 0; i < rows; i++) {
            for (j = i; j < rows; j++) {
                s = 0;
                for (k = 0; k < cols; k++) {
                    s += weights[k] * (matrix[j][k] - means[j]) * (matrix[i][k] - means[i]);
                }
                cov[i][j] = s * factor;
                cov[j][i] = s * factor;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    return cov;
}

module.exports = {
    entropy: entropy,
    mean: mean,
    standardDeviation: standardDeviation,
    variance: variance,
    median: median,
    mode: mode,
    skewness: skewness,
    kurtosis: kurtosis,
    standardError: standardError,
    covariance: covariance,
    scatter: scatter,
    correlation: correlation,
    zScores: zScores,
    center: center,
    standardize: standardize,
    weightedVariance: weightedVariance,
    weightedMean: weightedMean,
    weightedCovariance: weightedCovariance,
    weightedScatter: weightedScatter
};

},{"./array":20}],23:[function(require,module,exports){
module.exports = require('./pca');

},{"./pca":24}],24:[function(require,module,exports){
'use strict';
var Matrix = require('ml-matrix');
var Stat = require('ml-stat');
var SVD = Matrix.DC.SVD;

module.exports = PCA;

/**
* Creates new PCA (Principal Component Analysis) from the dataset
* @param {Matrix} dataset
* @param {Object} options - options for the PCA algorithm
* @param {boolean} reload - for load purposes
* @param {Object} model - for load purposes
* @constructor
* */
function PCA(dataset, options, reload, model) {

    if (reload) {
        this.U = model.U;
        this.S = model.S;
        this.means = model.means;
        this.std = model.std;
        this.standardize = model.standardize
    } else {
        if(options === undefined) {
            options = {
                standardize: false
            };
        }

        this.standardize = options.standardize;

        if (!Matrix.isMatrix(dataset)) {
            dataset = new Matrix(dataset);
        } else {
            dataset = dataset.clone();
        }

        var normalization = adjust(dataset, this.standardize);
        var normalizedDataset = normalization.result;

        var covarianceMatrix = normalizedDataset.transpose().mmul(normalizedDataset).divS(dataset.rows);

        var target = new SVD(covarianceMatrix, {
            computeLeftSingularVectors: true,
            computeRightSingularVectors: true,
            autoTranspose: false
        });

        this.U = target.leftSingularVectors;
        this.S = target.diagonal;
        this.means = normalization.means;
        this.std = normalization.std;
    }
}

/**
* Load a PCA model from JSON
* @oaram {Object} model
* @return {PCA}
* */
PCA.load = function (model) {
    if(model.modelName !== 'PCA')
        throw new RangeError("The current model is invalid!");

    return new PCA(null, null, true, model);
};

/**
* Exports the current model to an Object
* @return {Object} model
* */
PCA.prototype.export = function () {
    return {
        modelName: "PCA",
        U: this.U,
        S: this.S,
        means: this.means,
        std: this.std,
        standardize: this.standardize
    };
};

/**
* Function that project the dataset into new space of k dimensions,
* this method doesn't modify your dataset.
* @param {Matrix} dataset.
* @param {Number} k - dimensions to project.
* @return {Matrix} dataset projected in k dimensions.
* @throws {RangeError} if k is larger than the number of eigenvector
*                      of the model.
* */
PCA.prototype.project = function (dataset, k) {
    var dimensions = k - 1;
    if(k > this.U.columns)
        throw new RangeError("the number of dimensions must not be larger than " + this.U.columns);

    if (!Matrix.isMatrix(dataset)) {
        dataset = new Matrix(dataset);
    } else {
        dataset = dataset.clone();
    }

    var X = adjust(dataset, this.standardize).result;
    return X.mmul(this.U.subMatrix(0, this.U.rows - 1, 0, dimensions));
};

/**
* This method returns the percentage variance of each eigenvector.
* @return {Number} percentage variance of each eigenvector.
* */
PCA.prototype.getExplainedVariance = function () {
    var sum = this.S.reduce(function (previous, value) {
        return previous + value;
    });
    return this.S.map(function (value) {
        return value / sum;
    });
};

/**
 * Function that returns the Eigenvectors of the covariance matrix.
 * @returns {Matrix}
 */
PCA.prototype.getEigenvectors = function () {
    return this.U;
};

/**
 * Function that returns the Eigenvalues (on the diagonal).
 * @returns {*}
 */
PCA.prototype.getEigenvalues = function () {
    return this.S;
};

/**
* This method returns a dataset normalized in the following form:
* X = (X - mean) / std
* @param dataset.
* @param {Boolean} standarize - do standardization
* @return A dataset normalized.
* */
function adjust(dataset, standarize) {
    var means = Stat.matrix.mean(dataset);
    var std = standarize ? Stat.matrix.standardDeviation(dataset, means, true) : undefined;

    var result = dataset.subRowVector(means);
    return {
        result: standarize ? result.divRowVector(std) : result,
        means: means,
        std: std
    }
}

},{"ml-matrix":18,"ml-stat":21}],25:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"../matrix":33,"dup":2}],26:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"../matrix":33,"./util":30,"dup":3}],27:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"../matrix":33,"dup":4}],28:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"../matrix":33,"./util":30,"dup":5}],29:[function(require,module,exports){
arguments[4][6][0].apply(exports,arguments)
},{"../matrix":33,"./util":30,"dup":6}],30:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],31:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"./dc/cholesky":25,"./dc/evd":26,"./dc/lu":27,"./dc/qr":28,"./dc/svd":29,"./matrix":33,"dup":8}],32:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"./decompositions":31,"./matrix":33,"dup":9}],33:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],34:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"dup":20}],35:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"./array":34,"./matrix":36,"dup":21}],36:[function(require,module,exports){
arguments[4][22][0].apply(exports,arguments)
},{"./array":34,"dup":22}],37:[function(require,module,exports){
module.exports = exports = require('./pls');
exports.Utils = require('./utils');
exports.OPLS = require('./opls');

},{"./opls":38,"./pls":39,"./utils":40}],38:[function(require,module,exports){
'use strict';

var Matrix = require('ml-matrix');
var Utils = require('./utils');

module.exports = OPLS;

function OPLS(dataset, predictions, numberOSC) {
    var X = new Matrix(dataset);
    var y = new Matrix(predictions);

    X = Utils.featureNormalize(X).result;
    y = Utils.featureNormalize(y).result;

    var rows = X.rows;
    var columns = X.columns;

    var sumOfSquaresX = X.clone().mul(X).sum();
    var w = X.transpose().mmul(y);
    w.div(Utils.norm(w));

    var orthoW = new Array(numberOSC);
    var orthoT = new Array(numberOSC);
    var orthoP = new Array(numberOSC);
    for (var i = 0; i < numberOSC; i++) {
        var t = X.mmul(w);

        var numerator = X.transpose().mmul(t);
        var denominator = t.transpose().mmul(t)[0][0];
        var p =  numerator.div(denominator);

        numerator = w.transpose().mmul(p)[0][0];
        denominator = w.transpose().mmul(w)[0][0];
        var wOsc = p.sub(w.clone().mul(numerator / denominator));
        wOsc.div(Utils.norm(wOsc));

        var tOsc = X.mmul(wOsc);

        numerator = X.transpose().mmul(tOsc);
        denominator = tOsc.transpose().mmul(tOsc)[0][0];
        var pOsc = numerator.div(denominator);

        X.sub(tOsc.mmul(pOsc.transpose()));
        orthoW[i] = wOsc.getColumn(0);
        orthoT[i] = tOsc.getColumn(0);
        orthoP[i] = pOsc.getColumn(0);
    }

    this.Xosc = X;

    var sumOfSquaresXosx = this.Xosc.clone().mul(this.Xosc).sum();
    this.R2X = 1 - sumOfSquaresXosx/sumOfSquaresX;

    this.W = orthoW;
    this.T = orthoT;
    this.P = orthoP;
    this.numberOSC = numberOSC;
}

OPLS.prototype.correctDataset = function (dataset) {
    var X = new Matrix(dataset);

    var sumOfSquaresX = X.clone().mul(X).sum();
    for (var i = 0; i < this.numberOSC; i++) {
        var currentW = this.W.getColumnVector(i);
        var currentP = this.P.getColumnVector(i);

        var t = X.mmul(currentW);
        X.sub(t.mmul(currentP));
    }
    var sumOfSquaresXosx = X.clone().mul(X).sum();

    var R2X = 1 - sumOfSquaresXosx / sumOfSquaresX;

    return {
        datasetOsc: X,
        R2Dataset: R2X
    };
};
},{"./utils":40,"ml-matrix":32}],39:[function(require,module,exports){
'use strict';

module.exports = PLS;
var Matrix = require('ml-matrix');
var Utils = require('./utils');

/**
 * Retrieves the sum at the column of the given matrix.
 * @param matrix
 * @param column
 * @returns {number}
 */
function getColSum(matrix, column) {
    var sum = 0;
    for (var i = 0; i < matrix.rows; i++) {
        sum += matrix[i][column];
    }
    return sum;
}

/**
 * Function that returns the index where the sum of each
 * column vector is maximum.
 * @param {Matrix} data
 * @returns {number} index of the maximum
 */
function maxSumColIndex(data) {
    var maxIndex = 0;
    var maxSum = -Infinity;
    for(var i = 0; i < data.columns; ++i) {
        var currentSum = getColSum(data, i);
        if(currentSum > maxSum) {
            maxSum = currentSum;
            maxIndex = i;
        }
    }
    return maxIndex;
}

/**
 * Constructor of the PLS model.
 * @param reload - used for load purposes.
 * @param model - used for load purposes.
 * @constructor
 */
function PLS(reload, model) {
    if(reload) {
        this.E = Matrix.checkMatrix(model.E);
        this.F = Matrix.checkMatrix(model.F);
        this.ssqYcal = model.ssqYcal;
        this.R2X = model.R2X;
        this.ymean = Matrix.checkMatrix(model.ymean);
        this.ystd = Matrix.checkMatrix(model.ystd);
        this.PBQ = Matrix.checkMatrix(model.PBQ);
        this.T = Matrix.checkMatrix(model.T);
        this.P = Matrix.checkMatrix(model.P);
        this.U = Matrix.checkMatrix(model.U);
        this.Q = Matrix.checkMatrix(model.Q);
        this.W = Matrix.checkMatrix(model.W);
        this.B = Matrix.checkMatrix(model.B);
    }
}

/**
 * Function that fit the model with the given data and predictions, in this function is calculated the
 * following outputs:
 *
 * T - Score matrix of X
 * P - Loading matrix of X
 * U - Score matrix of Y
 * Q - Loading matrix of Y
 * B - Matrix of regression coefficient
 * W - Weight matrix of X
 *
 * @param {Matrix} trainingSet - Dataset to be apply the model
 * @param {Matrix} predictions - Predictions over each case of the dataset
 * @param {Number} options - recieves the latentVectors and the tolerance of each step of the PLS
 */
PLS.prototype.train = function (trainingSet, predictions, options) {

    if(options === undefined) options = {};

    var latentVectors = options.latentVectors;
    if(latentVectors === undefined || isNaN(latentVectors)) {
        throw new RangeError("Latent vector must be a number.");
    }

    var tolerance = options.tolerance;
    if(tolerance === undefined || isNaN(tolerance)) {
        throw new RangeError("Tolerance must be a number");
    }

    if(trainingSet.length !== predictions.length)
        throw new RangeError("The number of predictions and elements in the dataset must be the same");

    //var tolerance = 1e-9;
    var X = Utils.featureNormalize(new Matrix(trainingSet)).result;
    var resultY = Utils.featureNormalize(new Matrix(predictions));
    this.ymean = resultY.means.neg();
    this.ystd = resultY.std;
    var Y = resultY.result;

    var rx = X.rows;
    var cx = X.columns;
    var ry = Y.rows;
    var cy = Y.columns;

    if(rx != ry) {
        throw new RangeError("dataset cases is not the same as the predictions");
    }

    var ssqXcal = X.clone().mul(X).sum(); // for the r²
    var sumOfSquaresY = Y.clone().mul(Y).sum();

    var n = latentVectors; //Math.max(cx, cy); // components of the pls
    var T = Matrix.zeros(rx, n);
    var P = Matrix.zeros(cx, n);
    var U = Matrix.zeros(ry, n);
    var Q = Matrix.zeros(cy, n);
    var B = Matrix.zeros(n, n);
    var W = P.clone();
    var k = 0;
    var R2X = new Array(n);

    while(Utils.norm(Y) > tolerance && k < n) {
        var transposeX = X.transpose();
        var transposeY = Y.transpose();

        var tIndex = maxSumColIndex(X.clone().mulM(X));
        var uIndex = maxSumColIndex(Y.clone().mulM(Y));

        var t1 = X.getColumnVector(tIndex);
        var u = Y.getColumnVector(uIndex);
        var t = Matrix.zeros(rx, 1);

        while(Utils.norm(t1.clone().sub(t)) > tolerance) {
            var w = transposeX.mmul(u);
            w.div(Utils.norm(w));
            t = t1;
            t1 = X.mmul(w);
            var q = transposeY.mmul(t1);
            q.div(Utils.norm(q));
            u = Y.mmul(q);
        }

        t = t1;
        var num = transposeX.mmul(t);
        var den = (t.transpose().mmul(t))[0][0];
        var p = num.div(den);
        var pnorm = Utils.norm(p);
        p.div(pnorm);
        t.mul(pnorm);
        w.mul(pnorm);

        num = u.transpose().mmul(t);
        den = (t.transpose().mmul(t))[0][0];
        var b = (num.div(den))[0][0];
        X.sub(t.mmul(p.transpose()));
        Y.sub(t.clone().mul(b).mmul(q.transpose()));

        T.setColumn(k, t);
        P.setColumn(k, p);
        U.setColumn(k, u);
        Q.setColumn(k, q);
        W.setColumn(k, w);

        B[k][k] = b;
        k++;
    }

    k--;
    T = T.subMatrix(0, T.rows - 1, 0, k);
    P = P.subMatrix(0, P.rows - 1, 0, k);
    U = U.subMatrix(0, U.rows - 1, 0, k);
    Q = Q.subMatrix(0, Q.rows - 1, 0, k);
    W = W.subMatrix(0, W.rows - 1, 0, k);
    B = B.subMatrix(0, k, 0, k);

    this.R2X = t.transpose().mmul(t).mmul(p.transpose().mmul(p)).divS(ssqXcal)[0][0];

    // TODO: review of R2Y
    //this.R2Y = t.transpose().mmul(t).mul(q[k][0]*q[k][0]).divS(ssqYcal)[0][0];

    this.ssqYcal = sumOfSquaresY;
    this.E = X;
    this.F = Y;
    this.T = T;
    this.P = P;
    this.U = U;
    this.Q = Q;
    this.W = W;
    this.B = B;
    this.PBQ = P.mmul(B).mmul(Q.transpose());
};

/**
 * Function that predict the behavior of the given dataset.
 * @param dataset - data to be predicted.
 * @returns {Matrix} - predictions of each element of the dataset.
 */
PLS.prototype.predict = function (dataset) {
    var X = new Matrix(dataset);
    var normalization = Utils.featureNormalize(X);
    X = normalization.result;
    var Y = X.mmul(this.PBQ);
    Y.mulRowVector(this.ystd);
    Y.addRowVector(this.ymean);
    return Y;
};

/**
 * Function that returns the explained variance on training of the PLS model.
 * @returns {number}
 */
PLS.prototype.getExplainedVariance = function () {
    return this.R2X;
};

/**
 * Load a PLS model from an Object
 * @param model
 * @returns {PLS} - PLS object from the given model
 */
PLS.load = function (model) {
    if(model.modelName !== 'PLS')
        throw new RangeError("The current model is invalid!");

    return new PLS(true, model);
};

/**
 * Function that exports a PLS model to an Object.
 * @returns {{modelName: string, ymean: *, ystd: *, PBQ: *}} model.
 */
PLS.prototype.export = function () {
    return {
        modelName: "PLS",
        E: this.E,
        F: this.F,
        R2X: this.R2X,
        ssqYcal: this.ssqYcal,
        ymean: this.ymean,
        ystd: this.ystd,
        PBQ: this.PBQ,
        T: this.T,
        P: this.P,
        U: this.U,
        Q: this.Q,
        W: this.W,
        B: this.B
    };
};

},{"./utils":40,"ml-matrix":32}],40:[function(require,module,exports){
'use strict';

var Matrix = require('ml-matrix');
var Stat = require('ml-stat');

/**
 * Function that given vector, returns his norm
 * @param {Vector} X
 * @returns {number} Norm of the vector
 */
function norm(X) {
    return Math.sqrt(X.clone().apply(pow2array).sum());
}

/**
 * Function that pow 2 each element of a Matrix or a Vector,
 * used in the apply method of the Matrix object
 * @param i - index i.
 * @param j - index j.
 * @return The Matrix object modified at the index i, j.
 * */
function pow2array(i, j) {
    this[i][j] = this[i][j] * this[i][j];
    return this;
}

/**
 * Function that normalize the dataset and return the means and
 * standard deviation of each feature.
 * @param dataset
 * @returns {{result: Matrix, means: (*|number), std: Matrix}} dataset normalized, means
 *                                                             and standard deviations
 */
function featureNormalize(dataset) {
    var means = Stat.matrix.mean(dataset);
    var std = Matrix.rowVector(Stat.matrix.standardDeviation(dataset, means, true));
    means = Matrix.rowVector(means);

    var result = dataset.addRowVector(means.neg());
    return {result: result.divRowVector(std), means: means, std: std};
}

module.exports = {
    norm: norm,
    pow2array: pow2array,
    featureNormalize: featureNormalize
};


},{"ml-matrix":32,"ml-stat":35}],41:[function(require,module,exports){
/*!
 * ngCordova
 * v0.1.23-alpha
 * Copyright 2015 Drifty Co. http://drifty.com/
 * See LICENSE in this repository for license information
 */
(function(){

angular.module('ngCordova', [
  'ngCordova.plugins'
]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/cordova-plugin-actionsheet.git
// link     :     https://github.com/EddyVerbruggen/cordova-plugin-actionsheet

angular.module('ngCordova.plugins.actionSheet', [])

  .factory('$cordovaActionSheet', ['$q', '$window', function ($q, $window) {

    return {
      show: function (options) {
        var q = $q.defer();

        $window.plugins.actionsheet.show(options, function (result) {
          q.resolve(result);
        });

        return q.promise;
      },

      hide: function () {
        return $window.plugins.actionsheet.hide();
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-admob.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-admob

angular.module('ngCordova.plugins.adMob', [])

  .factory('$cordovaAdMob', ['$q', '$window', function ($q, $window) {

    return {
      createBannerView: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.createBannerView(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createInterstitialView: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.createInterstitialView(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      requestAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.requestAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.showAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      requestInterstitialAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.requestInterstitialAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/ohh2ahh/AppAvailability.git
// link     :     https://github.com/ohh2ahh/AppAvailability

/* globals appAvailability: true */
angular.module('ngCordova.plugins.appAvailability', [])

  .factory('$cordovaAppAvailability', ['$q', function ($q) {

    return {
      check: function (urlScheme) {
        var q = $q.defer();

        appAvailability.check(urlScheme, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/pushandplay/cordova-plugin-apprate.git
// link     :     https://github.com/pushandplay/cordova-plugin-apprate

/* globals AppRate: true */
angular.module('ngCordova.plugins.appRate', [])

  .provider('$cordovaAppRate', [function () {

    /**
      * Set defaults settings to AppRate
      *
      * @param {Object} defaults - AppRate default settings
      * @param {string} defaults.language
      * @param {string} defaults.appName
      * @param {boolean} defaults.promptForNewVersion
      * @param {boolean} defaults.openStoreInApp
      * @param {number} defaults.usesUntilPrompt
      * @param {boolean} defaults.useCustomRateDialog
      * @param {string} defaults.iosURL
      * @param {string} defaults.androidURL
      * @param {string} defaults.blackberryURL
      * @param {string} defaults.windowsURL
      */
    this.setPreferences = function (defaults) {
      if (!defaults || !angular.isObject(defaults)) {
        return;
      }

      AppRate.preferences.useLanguage = defaults.language || null;
      AppRate.preferences.displayAppName = defaults.appName || '';
      AppRate.preferences.promptAgainForEachNewVersion = defaults.promptForNewVersion || true;
      AppRate.preferences.openStoreInApp = defaults.openStoreInApp || false;
      AppRate.preferences.usesUntilPrompt = defaults.usesUntilPrompt || 3;
      AppRate.preferences.useCustomRateDialog = defaults.useCustomRateDialog || false;
      AppRate.preferences.storeAppURL.ios = defaults.iosURL || null;
      AppRate.preferences.storeAppURL.android = defaults.androidURL || null;
      AppRate.preferences.storeAppURL.blackberry = defaults.blackberryURL || null;
      AppRate.preferences.storeAppURL.windows8 = defaults.windowsURL || null;
    };

    /**
      * Set custom locale
      *
      * @param {Object} customObj
      * @param {string} customObj.title
      * @param {string} customObj.cancelButtonLabel
      * @param {string} customObj.laterButtonLabel
      * @param {string} customObj.rateButtonLabel
      */
    this.setCustomLocale = function (customObj) {
      var strings = {
        title: 'Rate %@',
        message: 'If you enjoy using %@, would you mind taking a moment to rate it? It won’t take more than a minute. Thanks for your support!',
        cancelButtonLabel: 'No, Thanks',
        laterButtonLabel: 'Remind Me Later',
        rateButtonLabel: 'Rate It Now'
      };

      strings = angular.extend(strings, customObj);

      AppRate.preferences.customLocale = strings;
    };

    this.$get = ['$q', function ($q) {
      return {
        promptForRating: function (immediate) {
          var q = $q.defer();
          var prompt = AppRate.promptForRating(immediate);
          q.resolve(prompt);

          return q.promise;
        },

        navigateToAppStore: function () {
          var q = $q.defer();
          var navigate = AppRate.navigateToAppStore();
          q.resolve(navigate);

          return q.promise;
        },

        onButtonClicked: function (cb) {
          AppRate.onButtonClicked = function (buttonIndex) {
            cb.call(this, buttonIndex);
          };
        },

        onRateDialogShow: function (cb) {
          AppRate.onRateDialogShow = cb();
        }
      };
    }];
  }]);

// install   :     cordova plugin add https://github.com/whiteoctober/cordova-plugin-app-version.git
// link      :     https://github.com/whiteoctober/cordova-plugin-app-version

angular.module('ngCordova.plugins.appVersion', [])

  .factory('$cordovaAppVersion', ['$q', function ($q) {

    return {
      getAppName: function () {
        var q = $q.defer();
        cordova.getAppVersion.getAppName(function (name) {
          q.resolve(name);
        });

        return q.promise;
      },

      getPackageName: function () {
        var q = $q.defer();
        cordova.getAppVersion.getPackageName(function (package) {
          q.resolve(package);
        });

        return q.promise;
      },

      getVersionNumber: function () {
        var q = $q.defer();
        cordova.getAppVersion.getVersionNumber(function (version) {
          q.resolve(version);
        });

        return q.promise;
      },

      getVersionCode: function () {
        var q = $q.defer();
        cordova.getAppVersion.getVersionCode(function (code) {
          q.resolve(code);
        });

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/christocracy/cordova-plugin-background-geolocation.git
// link      :     https://github.com/christocracy/cordova-plugin-background-geolocation

angular.module('ngCordova.plugins.backgroundGeolocation', [])

  .factory('$cordovaBackgroundGeolocation', ['$q', '$window', function ($q, $window) {

    return {

      init: function () {
        $window.navigator.geolocation.getCurrentPosition(function (location) {
          return location;
        });
      },

      configure: function (options) {

        this.init();
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.configure(
          function (result) {
            q.notify(result);
            $window.plugins.backgroundGeoLocation.finish();
          },
          function (err) {
            q.reject(err);
          }, options);

        this.start();

        return q.promise;
      },

      start: function () {
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.start(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });

        return q.promise;
      },

      stop: function () {
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.stop(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });

        return q.promise;
      }
    };
  }

  ]);

// install  :     cordova plugin add https://github.com/katzer/cordova-plugin-badge.git
// link     :     https://github.com/katzer/cordova-plugin-badge

angular.module('ngCordova.plugins.badge', [])

  .factory('$cordovaBadge', ['$q', function ($q) {

    return {
      hasPermission: function () {
        var q = $q.defer();
        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(true);
          } else {
            q.reject('You do not have permission');
          }
        });

        return q.promise;
      },

      promptForPermission: function () {
        return cordova.plugins.notification.badge.promptForPermission();
      },

      set: function (badge, callback, scope) {
        var q = $q.defer();

        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(
              cordova.plugins.notification.badge.set(badge, callback, scope)
            );
          } else {
            q.reject('You do not have permission to set Badge');
          }
        });
        return q.promise;
      },

      get: function () {
        var q = $q.defer();
        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            cordova.plugins.notification.badge.get(function (badge) {
              q.resolve(badge);
            });
          } else {
            q.reject('You do not have permission to get Badge');
          }
        });

        return q.promise;
      },

      clear: function (callback, scope) {
        var q = $q.defer();

        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(cordova.plugins.notification.badge.clear(callback, scope));
          } else {
            q.reject('You do not have permission to clear Badge');
          }
        });
        return q.promise;
      },

      increase: function (count, callback, scope) {
        var q = $q.defer();

        this.hasPermission().then(function (){
          q.resolve(
            cordova.plugins.notification.badge.increase(count, callback, scope)
          );
        }, function (){
          q.reject('You do not have permission to increase Badge');
        }) ;

        return q.promise;
      },

      decrease: function (count, callback, scope) {
        var q = $q.defer();

        this.hasPermission().then(function (){
          q.resolve(
            cordova.plugins.notification.badge.decrease(count, callback, scope)
          );
        }, function (){
          q.reject('You do not have permission to decrease Badge');
        }) ;

        return q.promise;
      },

      configure: function (config) {
        return cordova.plugins.notification.badge.configure(config);
      }
    };
  }]);

// install  :    cordova plugin add https://github.com/phonegap/phonegap-plugin-barcodescanner.git
// link     :    https://github.com/phonegap/phonegap-plugin-barcodescanner

angular.module('ngCordova.plugins.barcodeScanner', [])

  .factory('$cordovaBarcodeScanner', ['$q', function ($q) {

    return {
      scan: function (config) {
        var q = $q.defer();

        cordova.plugins.barcodeScanner.scan(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        }, config);

        return q.promise;
      },

      encode: function (type, data) {
        var q = $q.defer();
        type = type || 'TEXT_TYPE';

        cordova.plugins.barcodeScanner.encode(type, data, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

//  install   :   cordova plugin add cordova-plugin-battery-status
//  link      :   https://github.com/apache/cordova-plugin-battery-status

angular.module('ngCordova.plugins.batteryStatus', [])

  .factory('$cordovaBatteryStatus', ['$rootScope', '$window', '$timeout', function ($rootScope, $window, $timeout) {

    /**
      * @param {string} status
      */
    var batteryStatus = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:status', status);
      });
    };

    /**
      * @param {string} status
      */
    var batteryCritical = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:critical', status);
      });
    };

    /**
      * @param {string} status
      */
    var batteryLow = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:low', status);
      });
    };

    document.addEventListener('deviceready', function () {
      if (navigator.battery) {
        $window.addEventListener('batterystatus', batteryStatus, false);
        $window.addEventListener('batterycritical', batteryCritical, false);
        $window.addEventListener('batterylow', batteryLow, false);

      }
    }, false);
    return true;
  }])
  .run(['$injector', function ($injector) {
    $injector.get('$cordovaBatteryStatus'); //ensure the factory and subsequent event listeners get initialised
  }]);

// install   :  cordova plugin add https://github.com/petermetz/cordova-plugin-ibeacon.git
// link      :  https://github.com/petermetz/cordova-plugin-ibeacon

angular.module('ngCordova.plugins.beacon', [])

  .factory('$cordovaBeacon', ['$window', '$rootScope', '$timeout', '$q', function ($window, $rootScope, $timeout, $q) {
    var callbackDidDetermineStateForRegion = null;
    var callbackDidStartMonitoringForRegion = null;
    var callbackDidExitRegion = null;
    var callbackDidEnterRegion = null;
    var callbackDidRangeBeaconsInRegion = null;
    var callbackPeripheralManagerDidStartAdvertising = null;
    var callbackPeripheralManagerDidUpdateState = null;
    var callbackDidChangeAuthorizationStatus = null;

    document.addEventListener('deviceready', function () {
      if ($window.cordova &&
          $window.cordova.plugins &&
          $window.cordova.plugins.locationManager) {
        var delegate = new $window.cordova.plugins.locationManager.Delegate();

        delegate.didDetermineStateForRegion = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didDetermineStateForRegion', pluginResult);
          });

          if (callbackDidDetermineStateForRegion) {
            callbackDidDetermineStateForRegion(pluginResult);
          }
        };

        delegate.didStartMonitoringForRegion = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didStartMonitoringForRegion', pluginResult);
          });

          if (callbackDidStartMonitoringForRegion) {
            callbackDidStartMonitoringForRegion(pluginResult);
          }
        };

        delegate.didExitRegion = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didExitRegion', pluginResult);
          });

          if (callbackDidExitRegion) {
            callbackDidExitRegion(pluginResult);
          }
        };

        delegate.didEnterRegion = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didEnterRegion', pluginResult);
          });

          if (callbackDidEnterRegion) {
            callbackDidEnterRegion(pluginResult);
          }
        };

        delegate.didRangeBeaconsInRegion = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didRangeBeaconsInRegion', pluginResult);
          });

          if (callbackDidRangeBeaconsInRegion) {
            callbackDidRangeBeaconsInRegion(pluginResult);
          }
        };

        delegate.peripheralManagerDidStartAdvertising = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:peripheralManagerDidStartAdvertising', pluginResult);
          });

          if (callbackPeripheralManagerDidStartAdvertising) {
            callbackPeripheralManagerDidStartAdvertising(pluginResult);
          }
        };

        delegate.peripheralManagerDidUpdateState = function (pluginResult) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:peripheralManagerDidUpdateState', pluginResult);
          });

          if (callbackPeripheralManagerDidUpdateState) {
            callbackPeripheralManagerDidUpdateState(pluginResult);
          }
        };

        delegate.didChangeAuthorizationStatus = function (status) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaBeacon:didChangeAuthorizationStatus', status);
          });

          if (callbackDidChangeAuthorizationStatus) {
            callbackDidChangeAuthorizationStatus(status);
          }
        };

        $window.cordova.plugins.locationManager.setDelegate(delegate);
      }
    }, false);

    return {
      setCallbackDidDetermineStateForRegion: function (callback) {
        callbackDidDetermineStateForRegion = callback;
      },
      setCallbackDidStartMonitoringForRegion: function (callback) {
        callbackDidStartMonitoringForRegion = callback;
      },
      setCallbackDidExitRegion: function (callback) {
        callbackDidExitRegion = callback;
      },
      setCallbackDidEnterRegion: function (callback) {
        callbackDidEnterRegion = callback;
      },
      setCallbackDidRangeBeaconsInRegion: function (callback) {
        callbackDidRangeBeaconsInRegion = callback;
      },
      setCallbackPeripheralManagerDidStartAdvertising: function (callback) {
        callbackPeripheralManagerDidStartAdvertising = callback;
      },
      setCallbackPeripheralManagerDidUpdateState: function (callback) {
        callbackPeripheralManagerDidUpdateState = callback;
      },
      setCallbackDidChangeAuthorizationStatus: function (callback) {
        callbackDidChangeAuthorizationStatus = callback;
      },
      createBeaconRegion: function (identifier, uuid, major, minor, notifyEntryStateOnDisplay) {
        major = major || undefined;
        minor = minor || undefined;

        return new $window.cordova.plugins.locationManager.BeaconRegion(
          identifier,
          uuid,
          major,
          minor,
          notifyEntryStateOnDisplay
        );
      },
      isBluetoothEnabled: function () {
        return $q.when($window.cordova.plugins.locationManager.isBluetoothEnabled());
      },
      enableBluetooth: function () {
        return $q.when($window.cordova.plugins.locationManager.enableBluetooth());
      },
      disableBluetooth: function () {
        return $q.when($window.cordova.plugins.locationManager.disableBluetooth());
      },
      startMonitoringForRegion: function (region) {
        return $q.when($window.cordova.plugins.locationManager.startMonitoringForRegion(region));
      },
      stopMonitoringForRegion: function (region) {
        return $q.when($window.cordova.plugins.locationManager.stopMonitoringForRegion(region));
      },
      requestStateForRegion: function (region) {
        return $q.when($window.cordova.plugins.locationManager.requestStateForRegion(region));
      },
      startRangingBeaconsInRegion: function (region) {
        return $q.when($window.cordova.plugins.locationManager.startRangingBeaconsInRegion(region));
      },
      stopRangingBeaconsInRegion: function (region) {
        return $q.when($window.cordova.plugins.locationManager.stopRangingBeaconsInRegion(region));
      },
      getAuthorizationStatus: function () {
        return $q.when($window.cordova.plugins.locationManager.getAuthorizationStatus());
      },
      requestWhenInUseAuthorization: function () {
        return $q.when($window.cordova.plugins.locationManager.requestWhenInUseAuthorization());
      },
      requestAlwaysAuthorization: function () {
        return $q.when($window.cordova.plugins.locationManager.requestAlwaysAuthorization());
      },
      getMonitoredRegions: function () {
        return $q.when($window.cordova.plugins.locationManager.getMonitoredRegions());
      },
      getRangedRegions: function () {
        return $q.when($window.cordova.plugins.locationManager.getRangedRegions());
      },
      isRangingAvailable: function () {
        return $q.when($window.cordova.plugins.locationManager.isRangingAvailable());
      },
      isMonitoringAvailableForClass: function (region) {
        return $q.when($window.cordova.plugins.locationManager.isMonitoringAvailableForClass(region));
      },
      startAdvertising: function (region, measuredPower) {
        return $q.when($window.cordova.plugins.locationManager.startAdvertising(region, measuredPower));
      },
      stopAdvertising: function () {
        return $q.when($window.cordova.plugins.locationManager.stopAdvertising());
      },
      isAdvertisingAvailable: function () {
        return $q.when($window.cordova.plugins.locationManager.isAdvertisingAvailable());
      },
      isAdvertising: function () {
        return $q.when($window.cordova.plugins.locationManager.isAdvertising());
      },
      disableDebugLogs: function () {
        return $q.when($window.cordova.plugins.locationManager.disableDebugLogs());
      },
      enableDebugNotifications: function () {
        return $q.when($window.cordova.plugins.locationManager.enableDebugNotifications());
      },
      disableDebugNotifications: function () {
        return $q.when($window.cordova.plugins.locationManager.disableDebugNotifications());
      },
      enableDebugLogs: function () {
        return $q.when($window.cordova.plugins.locationManager.enableDebugLogs());
      },
      appendToDeviceLog: function (message) {
        return $q.when($window.cordova.plugins.locationManager.appendToDeviceLog(message));
      }
    };
  }]);

//  install   :   cordova plugin add https://github.com/don/cordova-plugin-ble-central.git
//  link      :   https://github.com/don/cordova-plugin-ble-central

/* globals ble: true */
angular.module('ngCordova.plugins.ble', [])

  .factory('$cordovaBLE', ['$q', '$timeout', '$log', function ($q, $timeout, $log) {

    return {
      scan: function (services, seconds) {
        var q = $q.defer();

        ble.startScan(services, function (result) {
          q.notify(result);
        }, function (error) {
          q.reject(error);
        });

        $timeout(function () {
            ble.stopScan(function () {
              q.resolve();
            }, function (error) {
              q.reject(error);
            });
        }, seconds*1000);

        return q.promise;
      },

      startScan: function (services, callback, errorCallback) {
        return ble.startScan(services, callback, errorCallback);
      },

      stopScan: function () {
        var q = $q.defer();
        ble.stopScan(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      connect: function (deviceID) {
        var q = $q.defer();
        ble.connect(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      disconnect: function (deviceID) {
        var q = $q.defer();
        ble.disconnect(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      read: function (deviceID, serviceUUID, characteristicUUID) {
        var q = $q.defer();
        ble.read(deviceID, serviceUUID, characteristicUUID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      write: function (deviceID, serviceUUID, characteristicUUID, data) {
        var q = $q.defer();
        ble.write(deviceID, serviceUUID, characteristicUUID, data, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      writeWithoutResponse: function (deviceID, serviceUUID, characteristicUUID, data) {
        var q = $q.defer();
        ble.writeWithoutResponse(deviceID, serviceUUID, characteristicUUID, data, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      writeCommand: function (deviceID, serviceUUID, characteristicUUID, data) {
        $log.warning('writeCommand is deprecated, use writeWithoutResponse');
        return this.writeWithoutResponse(deviceID, serviceUUID, characteristicUUID, data);
      },

      startNotification: function (deviceID, serviceUUID, characteristicUUID, callback, errorCallback) {
        return ble.startNotification(deviceID, serviceUUID, characteristicUUID, callback, errorCallback);
      },

      stopNotification: function (deviceID, serviceUUID, characteristicUUID) {
        var q = $q.defer();
        ble.stopNotification(deviceID, serviceUUID, characteristicUUID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isConnected: function (deviceID) {
        var q = $q.defer();
        ble.isConnected(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      enable: function () {
        var q = $q.defer();
        ble.enable(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isEnabled: function () {
        var q = $q.defer();
        ble.isEnabled(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/don/BluetoothSerial.git
// link      :     https://github.com/don/BluetoothSerial

angular.module('ngCordova.plugins.bluetoothSerial', [])

  .factory('$cordovaBluetoothSerial', ['$q', '$window', function ($q, $window) {

    return {
      connect: function (address) {
        var q = $q.defer();
        var disconnectionPromise = $q.defer();
        var isConnected = false;
        $window.bluetoothSerial.connect(address, function () {
          isConnected = true;
          q.resolve(disconnectionPromise);
        }, function (error) {
          if(isConnected === false) {
            disconnectionPromise.reject(error);
          }
          q.reject(error);
        });
        return q.promise;
      },

      // not supported on iOS
      connectInsecure: function (address) {
        var q = $q.defer();
        $window.bluetoothSerial.connectInsecure(address, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      disconnect: function () {
        var q = $q.defer();
        $window.bluetoothSerial.disconnect(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      list: function () {
        var q = $q.defer();
        $window.bluetoothSerial.list(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      discoverUnpaired: function () {
        var q = $q.defer();
        $window.bluetoothSerial.discoverUnpaired(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      setDeviceDiscoveredListener: function () {
        var q = $q.defer();
        $window.bluetoothSerial.setDeviceDiscoveredListener(function (data) {
          q.notify(data);
        });
        return q.promise;
      },

      clearDeviceDiscoveredListener: function () {
        $window.bluetoothSerial.clearDeviceDiscoveredListener();
      },

      showBluetoothSettings: function () {
        var q = $q.defer();
        $window.bluetoothSerial.showBluetoothSettings(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isEnabled: function () {
        var q = $q.defer();
        $window.bluetoothSerial.isEnabled(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      enable: function () {
        var q = $q.defer();
        $window.bluetoothSerial.enable(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      isConnected: function () {
        var q = $q.defer();
        $window.bluetoothSerial.isConnected(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      available: function () {
        var q = $q.defer();
        $window.bluetoothSerial.available(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      read: function () {
        var q = $q.defer();
        $window.bluetoothSerial.read(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      readUntil: function (delimiter) {
        var q = $q.defer();
        $window.bluetoothSerial.readUntil(delimiter, function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      write: function (data) {
        var q = $q.defer();
        $window.bluetoothSerial.write(data, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      subscribe: function (delimiter) {
        var q = $q.defer();
        $window.bluetoothSerial.subscribe(delimiter, function (data) {
          q.notify(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      subscribeRawData: function () {
        var q = $q.defer();
        $window.bluetoothSerial.subscribeRawData(function (data) {
          q.notify(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      unsubscribe: function () {
        var q = $q.defer();
        $window.bluetoothSerial.unsubscribe(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      unsubscribeRawData: function () {
        var q = $q.defer();
        $window.bluetoothSerial.unsubscribeRawData(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      clear: function () {
        var q = $q.defer();
        $window.bluetoothSerial.clear(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      readRSSI: function () {
        var q = $q.defer();
        $window.bluetoothSerial.readRSSI(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install  :    cordova plugin add https://github.com/fiscal-cliff/phonegap-plugin-brightness.git
// link     :    https://github.com/fiscal-cliff/phonegap-plugin-brightness

angular.module('ngCordova.plugins.brightness', [])

  .factory('$cordovaBrightness', ['$q', '$window', function ($q, $window) {

    return {
      get: function () {
        var q = $q.defer();

        if (!$window.cordova) {
          q.reject('Not supported without cordova.js');
        } else {
          $window.cordova.plugins.brightness.getBrightness(function (result) {
            q.resolve(result);
          }, function (err) {
            q.reject(err);
          });
        }

        return q.promise;
      },

      set: function (data) {
        var q = $q.defer();

        if (!$window.cordova) {
          q.reject('Not supported without cordova.js');
        } else {
          $window.cordova.plugins.brightness.setBrightness(data, function (result) {
            q.resolve(result);
          }, function (err) {
            q.reject(err);
          });
        }

        return q.promise;
      },

      setKeepScreenOn: function (bool) {
        var q = $q.defer();

        if (!$window.cordova) {
          q.reject('Not supported without cordova.js');
        } else {
          $window.cordova.plugins.brightness.setKeepScreenOn(bool, function (result) {
            q.resolve(result);
          }, function (err) {
            q.reject(err);
          });
        }

        return q.promise;
      }
    };
  }]);


// install  :     cordova plugin add https://github.com/EddyVerbruggen/Calendar-PhoneGap-Plugin.git
// link     :     https://github.com/EddyVerbruggen/Calendar-PhoneGap-Plugin

angular.module('ngCordova.plugins.calendar', [])

  .factory('$cordovaCalendar', ['$q', '$window', function ($q, $window) {
    
    return {
      createCalendar: function (options) {
        var d = $q.defer(),
          createCalOptions = $window.plugins.calendar.getCreateCalendarOptions();

        if (typeof options === 'string') {
          createCalOptions.calendarName = options;
        } else {
          createCalOptions = angular.extend(createCalOptions, options);
        }

        $window.plugins.calendar.createCalendar(createCalOptions, function (message) {
          d.resolve(message);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      deleteCalendar: function (calendarName) {
        var d = $q.defer();

        $window.plugins.calendar.deleteCalendar(calendarName, function (message) {
          d.resolve(message);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      createEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventWithOptions: function (options) {
        var d = $q.defer(),
          defaultOptionKeys = [],
          calOptions = window.plugins.calendar.getCalendarOptions(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptionKeys = Object.keys(defaultOptions);

        for (var key in options) {
          if (defaultOptionKeys.indexOf(key) === -1) {
            calOptions[key] = options[key];
          } else {
            defaultOptions[key] = options[key];
          }
        }

        $window.plugins.calendar.createEventWithOptions(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          calOptions,
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventInteractively: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEventInteractively(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventInNamedCalendar: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null,
            calendarName: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEventInNamedCalendar(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          defaultOptions.calendarName,
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      findEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.findEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (foundEvent) {
            d.resolve(foundEvent);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      listEventsInRange: function (startDate, endDate) {
        var d = $q.defer();

        $window.plugins.calendar.listEventsInRange(startDate, endDate, function (events) {
          d.resolve(events);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      listCalendars: function () {
        var d = $q.defer();

        $window.plugins.calendar.listCalendars(function (calendars) {
          d.resolve(calendars);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      findAllEventsInNamedCalendar: function (calendarName) {
        var d = $q.defer();

        $window.plugins.calendar.findAllEventsInNamedCalendar(calendarName, function (events) {
          d.resolve(events);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      modifyEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null,
            newTitle: null,
            newLocation: null,
            newNotes: null,
            newStartDate: null,
            newEndDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.modifyEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          defaultOptions.newTitle,
          defaultOptions.newLocation,
          defaultOptions.newNotes,
          new Date(defaultOptions.newStartDate),
          new Date(defaultOptions.newEndDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      deleteEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            newTitle: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.deleteEvent(
          defaultOptions.newTitle,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      }
    };
  }]);

// install   :   cordova plugin add cordova-plugin-camera
// link      :   https://github.com/apache/cordova-plugin-camera

angular.module('ngCordova.plugins.camera', [])

  .factory('$cordovaCamera', ['$q', function ($q) {

    return {
      getPicture: function (options) {
        var q = $q.defer();

        if (!navigator.camera) {
          q.resolve(null);
          return q.promise;
        }

        navigator.camera.getPicture(function (imageData) {
          q.resolve(imageData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },

      cleanup: function () {
        var q = $q.defer();

        navigator.camera.cleanup(function () {
          q.resolve();
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install   :    cordova plugin add cordova-plugin-media-capture
// link      :    https://github.com/apache/cordova-plugin-media-capture

angular.module('ngCordova.plugins.capture', [])

  .factory('$cordovaCapture', ['$q', function ($q) {

    return {
      captureAudio: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureAudio(function (audioData) {
          q.resolve(audioData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },
      captureImage: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureImage(function (imageData) {
          q.resolve(imageData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },
      captureVideo: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureVideo(function (videoData) {
          q.resolve(videoData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      }
    };
  }]);

// install : cordova plugin add https://github.com/vkeepe/card.io.git
// link    : https://github.com/vkeepe/card.io.git

/* globals CardIO: true */
angular.module('ngCordova.plugins.cardIO', [])

  .provider(
  '$cordovaNgCardIO', [function () {

    /**
     * Default array of response data from cardIO scan card
     */
    var defaultRespFields = [
      'card_type',
      'redacted_card_number',
      'card_number',
      'expiry_month',
      'expiry_year',
      'short_expiry_year',
      'cvv',
      'zip'
    ];

    /**
     * Default config for cardIO scan function
     */
    var defaultScanConfig = {
      'expiry': true,
      'cvv': true,
      'zip': false,
      'suppressManual': false,
      'suppressConfirm': false,
      'hideLogo': true
    };

    /**
     * Configuring defaultRespFields using $cordovaNgCardIOProvider
     *
     */
    this.setCardIOResponseFields = function (fields) {
      if (!fields || !angular.isArray(fields)) {
        return;
      }
      defaultRespFields = fields;
    };

    /**
     *
     * Configuring defaultScanConfig using $cordovaNgCardIOProvider
     */
    this.setScanerConfig = function (config) {
      if (!config || !angular.isObject(config)) {
        return;
      }

      defaultScanConfig.expiry = config.expiry || true;
      defaultScanConfig.cvv = config.cvv || true;
      defaultScanConfig.zip = config.zip || false;
      defaultScanConfig.suppressManual = config.suppressManual || false;
      defaultScanConfig.suppressConfirm = config.suppressConfirm || false;
      defaultScanConfig.hideLogo = config.hideLogo || true;
    };

    /**
     * Function scanCard for $cordovaNgCardIO service to make scan of card
     *
     */
    this.$get = ['$q', function ($q) {
      return {
        scanCard: function () {

          var deferred = $q.defer();
          CardIO.scan(
            defaultScanConfig,
            function (response) {

              if (response === null) {
                deferred.reject(null);
              } else {

                var respData = {};
                for (
                  var i = 0, len = defaultRespFields.length; i < len; i++) {
                  var field = defaultRespFields[i];

                  if (field === 'short_expiry_year') {
                    respData[field] = String(response.expiry_year).substr( // jshint ignore:line
                      2, 2
                    ) || '';
                  } else {
                    respData[field] = response[field] || '';
                  }
                }
                deferred.resolve(respData);
              }
            },
            function () {
              deferred.reject(null);
            }
          );
          return deferred.promise;
        }
      };
    }];
  }]
);

// install   :     cordova plugin add https://github.com/VersoSolutions/CordovaClipboard.git
// link      :     https://github.com/VersoSolutions/CordovaClipboard

angular.module('ngCordova.plugins.clipboard', [])

  .factory('$cordovaClipboard', ['$q', '$window', function ($q, $window) {

    return {
      copy: function (text) {
        var q = $q.defer();

        $window.cordova.plugins.clipboard.copy(text,
          function () {
            q.resolve();
          }, function () {
            q.reject();
          });

        return q.promise;
      },

      paste: function () {
        var q = $q.defer();

        $window.cordova.plugins.clipboard.paste(function (text) {
          q.resolve(text);
        }, function () {
          q.reject();
        });

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-contacts
// link      :     https://github.com/apache/cordova-plugin-contacts

angular.module('ngCordova.plugins.contacts', [])

  .factory('$cordovaContacts', ['$q', function ($q) {

    return {
      save: function (contact) {
        var q = $q.defer();
        var deviceContact = navigator.contacts.create(contact);

        deviceContact.save(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      remove: function (contact) {
        var q = $q.defer();
        var deviceContact = navigator.contacts.create(contact);

        deviceContact.remove(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      clone: function (contact) {
        var deviceContact = navigator.contacts.create(contact);
        return deviceContact.clone(contact);
      },

      find: function (options) {
        var q = $q.defer();
        var fields = options.fields || ['id', 'displayName'];
        delete options.fields;
        if (Object.keys(options).length === 0) {
          navigator.contacts.find(fields, function (results) {
            q.resolve(results);
          },function (err) {
            q.reject(err);
          });
        }
        else {
          navigator.contacts.find(fields, function (results) {
            q.resolve(results);
          }, function (err) {
            q.reject(err);
          }, options);
        }
        return q.promise;
      },

      pickContact: function () {
        var q = $q.defer();

        navigator.contacts.pickContact(function (contact) {
          q.resolve(contact);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }

      // TODO: method to set / get ContactAddress
      // TODO: method to set / get ContactError
      // TODO: method to set / get ContactField
      // TODO: method to set / get ContactName
      // TODO: method to set / get ContactOrganization
    };
  }]);

// install   :      cordova plugin add https://github.com/VitaliiBlagodir/cordova-plugin-datepicker.git
// link      :      https://github.com/VitaliiBlagodir/cordova-plugin-datepicker

angular.module('ngCordova.plugins.datePicker', [])

  .factory('$cordovaDatePicker', ['$window', '$q', function ($window, $q) {
    
    return {
      show: function (options) {
        var q = $q.defer();
        options = options || {date: new Date(), mode: 'date'};
        $window.datePicker.show(options, function (date) {
          q.resolve(date);
        }, function(error){
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);
// install   :     cordova plugin add cordova-plugin-device
// link      :     https://github.com/apache/cordova-plugin-device

/* globals device: true */
angular.module('ngCordova.plugins.device', [])

  .factory('$cordovaDevice', [function () {

    return {
      /**
       * Returns the whole device object.
       * @see https://github.com/apache/cordova-plugin-device
       * @returns {Object} The device object.
       */
      getDevice: function () {
        return device;
      },

      /**
       * Returns the Cordova version.
       * @see https://github.com/apache/cordova-plugin-device#devicecordova
       * @returns {String} The Cordova version.
       */
      getCordova: function () {
        return device.cordova;
      },

      /**
       * Returns the name of the device's model or product.
       * @see https://github.com/apache/cordova-plugin-device#devicemodel
       * @returns {String} The name of the device's model or product.
       */
      getModel: function () {
        return device.model;
      },

      /**
       * @deprecated device.name is deprecated as of version 2.3.0. Use device.model instead.
       * @returns {String}
       */
      getName: function () {
        return device.name;
      },

      /**
       * Returns the device's operating system name.
       * @see https://github.com/apache/cordova-plugin-device#deviceplatform
       * @returns {String} The device's operating system name.
       */
      getPlatform: function () {
        return device.platform;
      },

      /**
       * Returns the device's Universally Unique Identifier.
       * @see https://github.com/apache/cordova-plugin-device#deviceuuid
       * @returns {String} The device's Universally Unique Identifier
       */
      getUUID: function () {
        return device.uuid;
      },

      /**
       * Returns the operating system version.
       * @see https://github.com/apache/cordova-plugin-device#deviceversion
       * @returns {String}
       */
      getVersion: function () {
        return device.version;
      },

      /**
       * Returns the device manufacturer.
       * @returns {String}
       */
      getManufacturer: function () {
        return device.manufacturer;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-device-motion
// link      :     https://github.com/apache/cordova-plugin-device-motion

angular.module('ngCordova.plugins.deviceMotion', [])

  .factory('$cordovaDeviceMotion', ['$q', function ($q) {

    return {
      getCurrentAcceleration: function () {
        var q = $q.defer();

        if (angular.isUndefined(navigator.accelerometer) ||
        !angular.isFunction(navigator.accelerometer.getCurrentAcceleration)) {
          q.reject('Device do not support watchAcceleration');
        }

        navigator.accelerometer.getCurrentAcceleration(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      watchAcceleration: function (options) {
        var q = $q.defer();

        if (angular.isUndefined(navigator.accelerometer) ||
        !angular.isFunction(navigator.accelerometer.watchAcceleration)) {
          q.reject('Device do not support watchAcceleration');
        }

        var watchID = navigator.accelerometer.watchAcceleration(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, options);

        q.promise.cancel = function () {
          navigator.accelerometer.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.accelerometer.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.accelerometer.clearWatch(watchID);
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-device-orientation
// link      :     https://github.com/apache/cordova-plugin-device-orientation

angular.module('ngCordova.plugins.deviceOrientation', [])

  .factory('$cordovaDeviceOrientation', ['$q', function ($q) {

    var defaultOptions = {
      frequency: 3000 // every 3s
    };
    
    return {
      getCurrentHeading: function () {
        var q = $q.defer();

        if(!navigator.compass) {
            q.reject('No compass on Device');
            return q.promise;
        }

        navigator.compass.getCurrentHeading(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      watchHeading: function (options) {
        var q = $q.defer();

        if(!navigator.compass) {
            q.reject('No compass on Device');
            return q.promise;
        }

        var _options = angular.extend(defaultOptions, options);
        var watchID = navigator.compass.watchHeading(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, _options);

        q.promise.cancel = function () {
          navigator.compass.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.compass.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.compass.clearWatch(watchID);
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-dialogs
// link      :     https://github.com/apache/cordova-plugin-dialogs

angular.module('ngCordova.plugins.dialogs', [])

  .factory('$cordovaDialogs', ['$q', '$window', function ($q, $window) {

    return {
      alert: function (message, title, buttonName) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          $window.alert(message);
          q.resolve();
        } else {
          navigator.notification.alert(message, function () {
            q.resolve();
          }, title, buttonName);
        }

        return q.promise;
      },

      confirm: function (message, title, buttonLabels) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          if ($window.confirm(message)) {
            q.resolve(1);
          } else {
            q.resolve(2);
          }
        } else {
          navigator.notification.confirm(message, function (buttonIndex) {
            q.resolve(buttonIndex);
          }, title, buttonLabels);
        }

        return q.promise;
      },

      prompt: function (message, title, buttonLabels, defaultText) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          var res = $window.prompt(message, defaultText);
          if (res !== null) {
            q.resolve({input1: res, buttonIndex: 1});
          } else {
            q.resolve({input1: res, buttonIndex: 2});
          }
        } else {
          navigator.notification.prompt(message, function (result) {
            q.resolve(result);
          }, title, buttonLabels, defaultText);
        }
        return q.promise;
      },

      beep: function (times) {
        return navigator.notification.beep(times);
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/katzer/cordova-plugin-email-composer.git
// link     :     https://github.com/katzer/cordova-plugin-email-composer

angular.module('ngCordova.plugins.emailComposer', [])

  .factory('$cordovaEmailComposer', ['$q', function ($q) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        cordova.plugins.email.isAvailable(function (isAvailable) {
          if (isAvailable) {
            q.resolve();
          } else {
            q.reject();
          }
        });

        return q.promise;
      },

      open: function (properties) {
        var q = $q.defer();

        cordova.plugins.email.open(properties, function () {
          q.reject(); // user closed email composer
        });

        return q.promise;
      },

      addAlias: function (app, schema) {
        cordova.plugins.email.addAlias(app, schema);
      }
    };
  }]);

// install   :   cordova -d plugin add https://github.com/Wizcorp/phonegap-facebook-plugin.git --variable APP_ID="123456789" --variable APP_NAME="myApplication"
// link      :   https://github.com/Wizcorp/phonegap-facebook-plugin

/* globals facebookConnectPlugin: true */
angular.module('ngCordova.plugins.facebook', [])

  .provider('$cordovaFacebook', [function () {

    /**
      * Init browser settings for Facebook plugin
      *
      * @param {number} id
      * @param {string} version
      */
    this.browserInit = function (id, version) {
      this.appID = id;
      this.appVersion = version || 'v2.0';
      facebookConnectPlugin.browserInit(this.appID, this.appVersion);
    };

    this.$get = ['$q', function ($q) {
      return {
        login: function (permissions) {
          var q = $q.defer();
          facebookConnectPlugin.login(permissions, function (res) {
            q.resolve(res);
          }, function (res) {
            q.reject(res);
          });

          return q.promise;
        },

        showDialog: function (options) {
          var q = $q.defer();
          facebookConnectPlugin.showDialog(options, function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        api: function (path, permissions) {
          var q = $q.defer();
          facebookConnectPlugin.api(path, permissions, function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        getAccessToken: function () {
          var q = $q.defer();
          facebookConnectPlugin.getAccessToken(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        getLoginStatus: function () {
          var q = $q.defer();
          facebookConnectPlugin.getLoginStatus(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        logout: function () {
          var q = $q.defer();
          facebookConnectPlugin.logout(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-facebookads.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-facebookads

angular.module('ngCordova.plugins.facebookAds', [])

  .factory('$cordovaFacebookAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.FacebookAds.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.FacebookAds.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.FacebookAds.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.FacebookAds.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.FacebookAds.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.FacebookAds.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.FacebookAds.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.FacebookAds.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-file
// link      :     https://github.com/apache/cordova-plugin-file

angular.module('ngCordova.plugins.file', [])

  .constant('$cordovaFileError', {
    1: 'NOT_FOUND_ERR',
    2: 'SECURITY_ERR',
    3: 'ABORT_ERR',
    4: 'NOT_READABLE_ERR',
    5: 'ENCODING_ERR',
    6: 'NO_MODIFICATION_ALLOWED_ERR',
    7: 'INVALID_STATE_ERR',
    8: 'SYNTAX_ERR',
    9: 'INVALID_MODIFICATION_ERR',
    10: 'QUOTA_EXCEEDED_ERR',
    11: 'TYPE_MISMATCH_ERR',
    12: 'PATH_EXISTS_ERR'
  })

  .provider('$cordovaFile', [function () {

    this.$get = ['$q', '$window', '$cordovaFileError', function ($q, $window, $cordovaFileError) {

      return {

        getFreeDiskSpace: function () {
          var q = $q.defer();
          cordova.exec(function (result) {
            q.resolve(result);
          }, function (error) {
            q.reject(error);
          }, 'File', 'getFreeDiskSpace', []);
          return q.promise;
        },

        checkDir: function (path, dir) {
          var q = $q.defer();

          if ((/^\//.test(dir))) {
            q.reject('directory cannot start with \/');
          }

          try {
            var directory = path + dir;
            $window.resolveLocalFileSystemURL(directory, function (fileSystem) {
              if (fileSystem.isDirectory === true) {
                q.resolve(fileSystem);
              } else {
                q.reject({code: 13, message: 'input is not a directory'});
              }
            }, function (error) {
              error.message = $cordovaFileError[error.code];
              q.reject(error);
            });
          } catch (err) {
            err.message = $cordovaFileError[err.code];
            q.reject(err);
          }

          return q.promise;
        },

        checkFile: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject('directory cannot start with \/');
          }

          try {
            var directory = path + file;
            $window.resolveLocalFileSystemURL(directory, function (fileSystem) {
              if (fileSystem.isFile === true) {
                q.resolve(fileSystem);
              } else {
                q.reject({code: 13, message: 'input is not a file'});
              }
            }, function (error) {
              error.message = $cordovaFileError[error.code];
              q.reject(error);
            });
          } catch (err) {
            err.message = $cordovaFileError[err.code];
            q.reject(err);
          }

          return q.promise;
        },

        createDir: function (path, dirName, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject('directory cannot start with \/');
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, options, function (result) {
                q.resolve(result);
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        createFile: function (path, fileName, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject('file-name cannot start with \/');
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, options, function (result) {
                q.resolve(result);
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeDir: function (path, dirName) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                dirEntry.remove(function () {
                  q.resolve({success: true, fileRemoved: dirEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeFile: function (path, fileName) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                fileEntry.remove(function () {
                  q.resolve({success: true, fileRemoved: fileEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeRecursively: function (path, dirName) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                dirEntry.removeRecursively(function () {
                  q.resolve({success: true, fileRemoved: dirEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        writeFile: function (path, fileName, text, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject('file-name cannot start with \/');
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, options, function (fileEntry) {
                fileEntry.createWriter(function (writer) {
                  if (options.append === true) {
                    writer.seek(writer.length);
                  }

                  if (options.truncate) {
                    writer.truncate(options.truncate);
                  }

                  writer.onwriteend = function (evt) {
                    if (this.error) {
                      q.reject(this.error);
                    } else {
                      q.resolve(evt);
                    }
                  };

                  writer.write(text);

                  q.promise.abort = function () {
                    writer.abort();
                  };
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        writeExistingFile: function (path, fileName, text) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                fileEntry.createWriter(function (writer) {
                  writer.seek(writer.length);

                  writer.onwriteend = function (evt) {
                    if (this.error) {
                      q.reject(this.error);
                    } else {
                      q.resolve(evt);
                    }
                  };

                  writer.write(text);

                  q.promise.abort = function () {
                    writer.abort();
                  };
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsText: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();

                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };

                  reader.readAsText(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsDataURL: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsDataURL(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsBinaryString: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsBinaryString(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsArrayBuffer: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsArrayBuffer(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        moveFile: function (path, fileName, newPath, newFileName) {
          var q = $q.defer();

          newFileName = newFileName || fileName;

          if ((/^\//.test(fileName)) || (/^\//.test(newFileName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                $window.resolveLocalFileSystemURL(newPath, function (newFileEntry) {
                  fileEntry.moveTo(newFileEntry, newFileName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    q.reject(error);
                  });
                }, function (err) {
                  q.reject(err);
                });
              }, function (err) {
                q.reject(err);
              });
            }, function (er) {
              q.reject(er);
            });
          } catch (e) {
            q.reject(e);
          }
          return q.promise;
        },

        moveDir: function (path, dirName, newPath, newDirName) {
          var q = $q.defer();

          newDirName = newDirName || dirName;

          if (/^\//.test(dirName) || (/^\//.test(newDirName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                $window.resolveLocalFileSystemURL(newPath, function (newDirEntry) {
                  dirEntry.moveTo(newDirEntry, newDirName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    q.reject(error);
                  });
                }, function (erro) {
                  q.reject(erro);
                });
              }, function (err) {
                q.reject(err);
              });
            }, function (er) {
              q.reject(er);
            });
          } catch (e) {
            q.reject(e);
          }
          return q.promise;
        },

        copyDir: function (path, dirName, newPath, newDirName) {
          var q = $q.defer();

          newDirName = newDirName || dirName;

          if (/^\//.test(dirName) || (/^\//.test(newDirName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false, exclusive: false}, function (dirEntry) {

                $window.resolveLocalFileSystemURL(newPath, function (newDirEntry) {
                  dirEntry.copyTo(newDirEntry, newDirName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    error.message = $cordovaFileError[error.code];
                    q.reject(error);
                  });
                }, function (erro) {
                  erro.message = $cordovaFileError[erro.code];
                  q.reject(erro);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        copyFile: function (path, fileName, newPath, newFileName) {
          var q = $q.defer();

          newFileName = newFileName || fileName;

          if ((/^\//.test(fileName))) {
            q.reject('file-name cannot start with \/');
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false, exclusive: false}, function (fileEntry) {

                $window.resolveLocalFileSystemURL(newPath, function (newFileEntry) {
                  fileEntry.copyTo(newFileEntry, newFileName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    error.message = $cordovaFileError[error.code];
                    q.reject(error);
                  });
                }, function (erro) {
                  erro.message = $cordovaFileError[erro.code];
                  q.reject(erro);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        }

        /*
         listFiles: function (path, dir) {

         },

         listDir: function (path, dirName) {
         var q = $q.defer();

         try {
         $window.resolveLocalFileSystemURL(path, function (fileSystem) {
         fileSystem.getDirectory(dirName, options, function (parent) {
         var reader = parent.createReader();
         reader.readEntries(function (entries) {
         q.resolve(entries);
         }, function () {
         q.reject('DIR_READ_ERROR : ' + path + dirName);
         });
         }, function (error) {
         error.message = $cordovaFileError[error.code];
         q.reject(error);
         });
         }, function (err) {
         err.message = $cordovaFileError[err.code];
         q.reject(err);
         });
         } catch (e) {
         e.message = $cordovaFileError[e.code];
         q.reject(e);
         }

         return q.promise;
         },

         readFileMetadata: function (filePath) {
         //return getFile(filePath, {create: false});
         }
         */
      };

    }];
  }]);

// install   :      cordova plugin add https://github.com/pwlin/cordova-plugin-file-opener2.git
// link      :      https://github.com/pwlin/cordova-plugin-file-opener2

angular.module('ngCordova.plugins.fileOpener2', [])

  .factory('$cordovaFileOpener2', ['$q', function ($q) {

    return {
      open: function (file, type) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.open(file, type, {
          error: function (e) {
            q.reject(e);
          }, success: function () {
            q.resolve();
          }
        });
        return q.promise;
      },

      uninstall: function (pack) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.uninstall(pack, {
          error: function (e) {
            q.reject(e);
          }, success: function () {
            q.resolve();
          }
        });
        return q.promise;
      },

      appIsInstalled: function (pack) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.appIsInstalled(pack, {
          success: function (res) {
            q.resolve(res);
          }
        });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-file-transfer
// link      :     https://github.com/apache/cordova-plugin-file-transfer

/* globals FileTransfer: true */
angular.module('ngCordova.plugins.fileTransfer', [])

  .factory('$cordovaFileTransfer', ['$q', '$timeout', function ($q, $timeout) {
    return {
      download: function (source, filePath, options, trustAllHosts) {
        var q = $q.defer();
        var ft = new FileTransfer();
        var uri = (options && options.encodeURI === false) ? source : encodeURI(source);

        if (options && options.timeout !== undefined && options.timeout !== null) {
          $timeout(function () {
            ft.abort();
          }, options.timeout);
          options.timeout = null;
        }

        ft.onprogress = function (progress) {
          q.notify(progress);
        };

        q.promise.abort = function () {
          ft.abort();
        };

        ft.download(uri, filePath, q.resolve, q.reject, trustAllHosts, options);
        return q.promise;
      },

      upload: function (server, filePath, options, trustAllHosts) {
        var q = $q.defer();
        var ft = new FileTransfer();
        var uri = (options && options.encodeURI === false) ? server : encodeURI(server);

        if (options && options.timeout !== undefined && options.timeout !== null) {
          $timeout(function () {
            ft.abort();
          }, options.timeout);
          options.timeout = null;
        }

        ft.onprogress = function (progress) {
          q.notify(progress);
        };

        q.promise.abort = function () {
          ft.abort();
        };

        ft.upload(filePath, uri, q.resolve, q.reject, options, trustAllHosts);
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/EddyVerbruggen/Flashlight-PhoneGap-Plugin.git
// link      :     https://github.com/EddyVerbruggen/Flashlight-PhoneGap-Plugin

angular.module('ngCordova.plugins.flashlight', [])

  .factory('$cordovaFlashlight', ['$q', '$window', function ($q, $window) {

    return {
      available: function () {
        var q = $q.defer();
        $window.plugins.flashlight.available(function (isAvailable) {
          q.resolve(isAvailable);
        });
        return q.promise;
      },

      switchOn: function () {
        var q = $q.defer();
        $window.plugins.flashlight.switchOn(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      switchOff: function () {
        var q = $q.defer();
        $window.plugins.flashlight.switchOff(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      toggle: function () {
        var q = $q.defer();
        $window.plugins.flashlight.toggle(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-flurry.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-flurry

angular.module('ngCordova.plugins.flurryAds', [])
  .factory('$cordovaFlurryAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.FlurryAds.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.FlurryAds.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.FlurryAds.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.FlurryAds.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.FlurryAds.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.FlurryAds.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.FlurryAds.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.FlurryAds.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/phonegap-build/GAPlugin.git
// link      :     https://github.com/phonegap-build/GAPlugin

angular.module('ngCordova.plugins.ga', [])

  .factory('$cordovaGA', ['$q', '$window', function ($q, $window) {

    return {
      init: function (id, mingap) {
        var q = $q.defer();
        mingap = (mingap >= 0) ? mingap : 10;
        $window.plugins.gaPlugin.init(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          id, mingap);
        return q.promise;
      },

      trackEvent: function (success, fail, category, eventAction, eventLabel, eventValue) {
        var q = $q.defer();
        $window.plugins.gaPlugin.trackEvent(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          category, eventAction, eventLabel, eventValue);
        return q.promise;
      },

      trackPage: function (success, fail, pageURL) {
        var q = $q.defer();
        $window.plugins.gaPlugin.trackPage(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          pageURL);
        return q.promise;
      },

      setVariable: function (success, fail, index, value) {
        var q = $q.defer();
        $window.plugins.gaPlugin.setVariable(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          index, value);
        return q.promise;
      },

      exit: function () {
        var q = $q.defer();
        $window.plugins.gaPlugin.exit(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-geolocation
// link      :     https://github.com/apache/cordova-plugin-geolocation

angular.module('ngCordova.plugins.geolocation', [])

  .factory('$cordovaGeolocation', ['$q', function ($q) {

    return {
      getCurrentPosition: function (options) {
        var q = $q.defer();

        navigator.geolocation.getCurrentPosition(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },

      watchPosition: function (options) {
        var q = $q.defer();

        var watchID = navigator.geolocation.watchPosition(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, options);

        q.promise.cancel = function () {
          navigator.geolocation.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.geolocation.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.geolocation.clearWatch(watchID);
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-globalization
// link      :      https://github.com/apache/cordova-plugin-globalization

angular.module('ngCordova.plugins.globalization', [])

  .factory('$cordovaGlobalization', ['$q', function ($q) {

    return {
      getPreferredLanguage: function () {
        var q = $q.defer();

        navigator.globalization.getPreferredLanguage(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      getLocaleName: function () {
        var q = $q.defer();

        navigator.globalization.getLocaleName(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      getFirstDayOfWeek: function () {
        var q = $q.defer();

        navigator.globalization.getFirstDayOfWeek(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      // "date" parameter must be a JavaScript Date Object.
      dateToString: function (date, options) {
        var q = $q.defer();

        navigator.globalization.dateToString(
          date,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      stringToDate: function (dateString, options) {
        var q = $q.defer();

        navigator.globalization.stringToDate(
          dateString,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getDatePattern: function (options) {
        var q = $q.defer();

        navigator.globalization.getDatePattern(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getDateNames: function (options) {
        var q = $q.defer();

        navigator.globalization.getDateNames(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      // "date" parameter must be a JavaScript Date Object.
      isDayLightSavingsTime: function (date) {
        var q = $q.defer();

        navigator.globalization.isDayLightSavingsTime(
          date,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      numberToString: function (number, options) {
        var q = $q.defer();

        navigator.globalization.numberToString(
          number,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      stringToNumber: function (numberString, options) {
        var q = $q.defer();

        navigator.globalization.stringToNumber(
          numberString,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getNumberPattern: function (options) {
        var q = $q.defer();

        navigator.globalization.getNumberPattern(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getCurrencyPattern: function (currencyCode) {
        var q = $q.defer();

        navigator.globalization.getCurrencyPattern(
          currencyCode,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      }

    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-admob-pro.git
// link     :     https://github.com/floatinghotpot/cordova-admob-pro

angular.module('ngCordova.plugins.googleAds', [])

  .factory('$cordovaGoogleAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.AdMob.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.AdMob.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.AdMob.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.AdMob.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.AdMob.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.AdMob.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.AdMob.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.AdMob.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/danwilson/google-analytics-plugin.git
// link      :     https://github.com/danwilson/google-analytics-plugin

angular.module('ngCordova.plugins.googleAnalytics', [])

  .factory('$cordovaGoogleAnalytics', ['$q', '$window', function ($q, $window) {

    return {
      startTrackerWithId: function (id) {
        var d = $q.defer();

        $window.analytics.startTrackerWithId(id, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      setUserId: function (id) {
        var d = $q.defer();

        $window.analytics.setUserId(id, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      debugMode: function () {
        var d = $q.defer();

        $window.analytics.debugMode(function (response) {
          d.resolve(response);
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      trackView: function (screenName) {
        var d = $q.defer();

        $window.analytics.trackView(screenName, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addCustomDimension: function (key, value) {
        var d = $q.defer();

        $window.analytics.addCustomDimension(key, value, function () {
          d.resolve();
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackEvent: function (category, action, label, value) {
        var d = $q.defer();

        $window.analytics.trackEvent(category, action, label, value, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackException: function (description, fatal) {
        var d = $q.defer();

        $window.analytics.trackException(description, fatal, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackTiming: function (category, milliseconds, variable, label) {
        var d = $q.defer();

        $window.analytics.trackTiming(category, milliseconds, variable, label, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addTransaction: function (transactionId, affiliation, revenue, tax, shipping, currencyCode) {
        var d = $q.defer();

        $window.analytics.addTransaction(transactionId, affiliation, revenue, tax, shipping, currencyCode, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addTransactionItem: function (transactionId, name, sku, category, price, quantity, currencyCode) {
        var d = $q.defer();

        $window.analytics.addTransactionItem(transactionId, name, sku, category, price, quantity, currencyCode, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      }
    };
  }]);

// install   :
// link      :

// Google Maps needs ALOT of work!
// Not for production use

angular.module('ngCordova.plugins.googleMap', [])

  .factory('$cordovaGoogleMap', ['$q', '$window', function ($q, $window) {

    var map = null;

    return {
      getMap: function (options) {
        var q = $q.defer();

        if (!$window.plugin.google.maps) {
          q.reject(null);
        } else {
          var div = document.getElementById('map_canvas');
          map = $window.plugin.google.maps.Map.getMap(options);
          map.setDiv(div);
          q.resolve(map);
        }
        return q.promise;
      },

      isMapLoaded: function () { // check if an instance of the map exists
        return !!map;
      },
      addMarker: function (markerOptions) { // add a marker to the map with given markerOptions
        var q = $q.defer();
        map.addMarker(markerOptions, function (marker) {
          q.resolve(marker);
        });

        return q.promise;
      },
      getMapTypeIds: function () {
        return $window.plugin.google.maps.mapTypeId;
      },
      setVisible: function (isVisible) {
        var q = $q.defer();
        map.setVisible(isVisible);
        return q.promise;
      },
      // I don't know how to deallocate te map and the google map plugin.
      cleanup: function () {
        map = null;
        // delete map;
      }
    };
  }]);

// install   :   cordova plugin add https://github.com/ptgamr/cordova-google-play-game.git --variable APP_ID=123456789
// link      :   https://github.com/ptgamr/cordova-google-play-game

/* globals googleplaygame: true */
angular.module('ngCordova.plugins.googlePlayGame', [])

  .factory('$cordovaGooglePlayGame', ['$q', function ($q) {

    return {
      auth: function () {
        var q = $q.defer();

        googleplaygame.auth(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      signout: function () {
        var q = $q.defer();

        googleplaygame.signout(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      isSignedIn: function () {
        var q = $q.defer();

        googleplaygame.isSignedIn(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showPlayer: function () {
        var q = $q.defer();

        googleplaygame.showPlayer(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      submitScore: function (data) {
        var q = $q.defer();

        googleplaygame.submitScore(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showAllLeaderboards: function () {
        var q = $q.defer();

        googleplaygame.showAllLeaderboards(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showLeaderboard: function (data) {
        var q = $q.defer();

        googleplaygame.showLeaderboard(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      unlockAchievement: function (data) {
        var q = $q.defer();

        googleplaygame.unlockAchievement(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      incrementAchievement: function (data) {
        var q = $q.defer();

        googleplaygame.incrementAchievement(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showAchievements: function () {
        var q = $q.defer();

        googleplaygame.showAchievements(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      }
    };

  }]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/cordova-plugin-googleplus.git
// link     :     https://github.com/EddyVerbruggen/cordova-plugin-googleplus

angular.module('ngCordova.plugins.googlePlus', [])

  .factory('$cordovaGooglePlus', ['$q', '$window', function ($q, $window) {

    return {
      login: function (iosKey) {
        var q = $q.defer();

        if (iosKey === undefined) {
          iosKey = {};
        }
        $window.plugins.googleplus.login({'iOSApiKey': iosKey}, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      },

      silentLogin: function (iosKey) {
        var q = $q.defer();

        if (iosKey === undefined) {
          iosKey = {};
        }
        $window.plugins.googleplus.trySilentLogin({'iOSApiKey': iosKey}, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      },

      logout: function () {
        var q = $q.defer();
        $window.plugins.googleplus.logout(function (response) {
          q.resolve(response);
        });
      },

      disconnect: function () {
        var q = $q.defer();
        $window.plugins.googleplus.disconnect(function (response) {
          q.resolve(response);
        });
      },

      isAvailable: function () {
        var q = $q.defer();
        $window.plugins.googleplus.isAvailable(function (available) {
          if (available) {
            q.resolve(available);
          } else {
            q.reject(available);
          }
        });
        
        return q.promise;
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/Telerik-Verified-Plugins/HealthKit.git
// link      :      https://github.com/Telerik-Verified-Plugins/HealthKit

angular.module('ngCordova.plugins.healthKit', [])

  .factory('$cordovaHealthKit', ['$q', '$window', function ($q, $window) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        $window.plugins.healthkit.available(function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      /**
       * Check whether or not the user granted your app access to a specific HealthKit type.
       * Reference for possible types:
       * https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HealthKit_Constants/
       */
      checkAuthStatus: function (type) {
        var q = $q.defer();

        type = type || 'HKQuantityTypeIdentifierHeight';

        $window.plugins.healthkit.checkAuthStatus({
          'type': type
        }, function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      /**
       * Request authorization to access HealthKit data. See the full HealthKit constants
       * reference for possible read and write types:
       * https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HealthKit_Constants/
       */
      requestAuthorization: function (readTypes, writeTypes) {
        var q = $q.defer();

        readTypes = readTypes || [
          'HKCharacteristicTypeIdentifierDateOfBirth', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierHeight'
        ];
        writeTypes = writeTypes || [
          'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierHeight', 'HKQuantityTypeIdentifierDistanceCycling'
        ];

        $window.plugins.healthkit.requestAuthorization({
          'readTypes': readTypes,
          'writeTypes': writeTypes
        }, function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      readDateOfBirth: function () {
        var q = $q.defer();
        $window.plugins.healthkit.readDateOfBirth(
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      readGender: function () {
        var q = $q.defer();
        $window.plugins.healthkit.readGender(
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      saveWeight: function (value, units, date) {
        var q = $q.defer();
        $window.plugins.healthkit.saveWeight({
            'unit': units || 'lb',
            'amount': value,
            'date': date || new Date()
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      readWeight: function (units) {
        var q = $q.defer();
        $window.plugins.healthkit.readWeight({
            'unit': units || 'lb'
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },
      saveHeight: function (value, units, date) {
        var q = $q.defer();
        $window.plugins.healthkit.saveHeight({
            'unit': units || 'in',
            'amount': value,
            'date': date || new Date()
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },
      readHeight: function (units) {
        var q = $q.defer();
        $window.plugins.healthkit.readHeight({
            'unit': units || 'in'
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      findWorkouts: function () {
        var q = $q.defer();
        $window.plugins.healthkit.findWorkouts({},
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      /**
       * Save a workout.
       *
       * Workout param should be of the format:
       {
         'activityType': 'HKWorkoutActivityTypeCycling', // HKWorkoutActivityType constant (https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HKWorkout_Class/#//apple_ref/c/tdef/HKWorkoutActivityType)
         'quantityType': 'HKQuantityTypeIdentifierDistanceCycling',
         'startDate': new Date(), // mandatory
         'endDate': null, // optional, use either this or duration
         'duration': 3600, // in seconds, optional, use either this or endDate
         'energy': 300, //
         'energyUnit': 'kcal', // J|cal|kcal
         'distance': 11, // optional
         'distanceUnit': 'km' // probably useful with the former param
         // 'extraData': "", // Not sure how necessary this is
       },
       */
      saveWorkout: function (workout) {
        var q = $q.defer();
        $window.plugins.healthkit.saveWorkout(workout,
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      /**
       * Sample any kind of health data through a given date range.
       * sampleQuery of the format:
       {
									'startDate': yesterday, // mandatory
									'endDate': tomorrow, // mandatory
									'sampleType': 'HKQuantityTypeIdentifierHeight',
									'unit' : 'cm'
							},
       */
      querySampleType: function (sampleQuery) {
        var q = $q.defer();
        $window.plugins.healthkit.querySampleType(sampleQuery,
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-httpd.git
// link     :     https://github.com/floatinghotpot/cordova-httpd

angular.module('ngCordova.plugins.httpd', [])

  .factory('$cordovaHttpd', ['$q', function ($q) {

    return {
      startServer: function (options) {
        var d = $q.defer();

        cordova.plugins.CorHttpd.startServer(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      stopServer: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.stopServer(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      getURL: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.getURL(function (url) {
          d.resolve(url);
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      getLocalPath: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.getLocalPath(function (path) {
          d.resolve(path);
        }, function () {
          d.reject();
        });

        return d.promise;
      }

    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-iad.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-iad

angular.module('ngCordova.plugins.iAd', [])
  .factory('$cordovaiAd', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.iAd.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.iAd.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.iAd.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.iAd.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.iAd.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.iAd.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.iAd.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.iAd.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/wymsee/cordova-imagePicker.git
// link     :     https://github.com/wymsee/cordova-imagePicker

angular.module('ngCordova.plugins.imagePicker', [])

  .factory('$cordovaImagePicker', ['$q', '$window', function ($q, $window) {

    return {
      getPictures: function (options) {
        var q = $q.defer();

        $window.imagePicker.getPictures(function (results) {
          q.resolve(results);
        }, function (error) {
          q.reject(error);
        }, options);

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-inappbrowser
// link      :     https://github.com/apache/cordova-plugin-inappbrowser

angular.module('ngCordova.plugins.inAppBrowser', [])

  .provider('$cordovaInAppBrowser', [function () {

    var ref;
    var defaultOptions = this.defaultOptions = {};

    this.setDefaultOptions = function (config) {
      defaultOptions = angular.extend(defaultOptions, config);
    };

    this.$get = ['$rootScope', '$q', '$window', '$timeout', function ($rootScope, $q, $window, $timeout) {
      return {
        open: function (url, target, requestOptions) {
          var q = $q.defer();

          if (requestOptions && !angular.isObject(requestOptions)) {
            q.reject('options must be an object');
            return q.promise;
          }

          var options = angular.extend({}, defaultOptions, requestOptions);

          var opt = [];
          angular.forEach(options, function (value, key) {
            opt.push(key + '=' + value);
          });
          var optionsString = opt.join();

          ref = $window.open(url, target, optionsString);

          ref.addEventListener('loadstart', function (event) {
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loadstart', event);
            });
          }, false);

          ref.addEventListener('loadstop', function (event) {
            q.resolve(event);
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loadstop', event);
            });
          }, false);

          ref.addEventListener('loaderror', function (event) {
            q.reject(event);
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loaderror', event);
            });
          }, false);

          ref.addEventListener('exit', function (event) {
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:exit', event);
            });
          }, false);

          return q.promise;
        },

        close: function () {
          ref.close();
          ref = null;
        },

        show: function () {
          ref.show();
        },

        executeScript: function (details) {
          var q = $q.defer();

          ref.executeScript(details, function (result) {
            q.resolve(result);
          });

          return q.promise;
        },

        insertCSS: function (details) {
          var q = $q.defer();

          ref.insertCSS(details, function (result) {
            q.resolve(result);
          });

          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/Insomnia-PhoneGap-Plugin.git
// link     :     https://github.com/EddyVerbruggen/Insomnia-PhoneGap-Plugin
angular.module('ngCordova.plugins.insomnia', [])

  .factory('$cordovaInsomnia', ['$window', function ($window) {

    return {
      keepAwake: function () {
        return $window.plugins.insomnia.keepAwake();
      },
      allowSleepAgain: function () {
        return $window.plugins.insomnia.allowSleepAgain();
      }
    };

  }]);

// install   :   cordova plugins add https://github.com/vstirbu/InstagramPlugin.git
// link      :   https://github.com/vstirbu/InstagramPlugin

/* globals Instagram: true */
angular.module('ngCordova.plugins.instagram', [])

.factory('$cordovaInstagram', ['$q', function ($q) {

  return {
    share: function (options) {
      var q = $q.defer();

      if (!window.Instagram) {
        console.error('Tried to call Instagram.share but the Instagram plugin isn\'t installed!');
        q.resolve(null);
        return q.promise;
      }

      Instagram.share(options.image, options.caption, function (err) {
        if(err) {
          q.reject(err);
        } else {
          q.resolve(true);
        }
      });
      return q.promise;
    },
    isInstalled: function () {
      var q = $q.defer();

      if (!window.Instagram) {
        console.error('Tried to call Instagram.isInstalled but the Instagram plugin isn\'t installed!');
        q.resolve(null);
        return q.promise;
      }

      Instagram.isInstalled(function (err, installed) {
        if (err) {
          q.reject(err);
        } else {
          q.resolve(installed);
        }
      });
      return q.promise;
    }
  };
}]);

// install   :      cordova plugin add https://github.com/driftyco/ionic-plugins-keyboard.git
// link      :      https://github.com/driftyco/ionic-plugins-keyboard

angular.module('ngCordova.plugins.keyboard', [])

  .factory('$cordovaKeyboard', ['$rootScope', function ($rootScope) {

    var keyboardShowEvent = function () {
      $rootScope.$evalAsync(function () {
        $rootScope.$broadcast('$cordovaKeyboard:show');
      });
    };

    var keyboardHideEvent = function () {
      $rootScope.$evalAsync(function () {
        $rootScope.$broadcast('$cordovaKeyboard:hide');
      });
    };

    document.addEventListener('deviceready', function () {
      if (cordova.plugins.Keyboard) {
        window.addEventListener('native.keyboardshow', keyboardShowEvent, false);
        window.addEventListener('native.keyboardhide', keyboardHideEvent, false);
      }
    });

    return {
      hideAccessoryBar: function (bool) {
        return cordova.plugins.Keyboard.hideKeyboardAccessoryBar(bool);
      },

      close: function () {
        return cordova.plugins.Keyboard.close();
      },

      show: function () {
        return cordova.plugins.Keyboard.show();
      },

      disableScroll: function (bool) {
        return cordova.plugins.Keyboard.disableScroll(bool);
      },

      isVisible: function () {
        return cordova.plugins.Keyboard.isVisible;
      },

      clearShowWatch: function () {
        document.removeEventListener('native.keyboardshow', keyboardShowEvent);
        $rootScope.$$listeners['$cordovaKeyboard:show'] = [];
      },

      clearHideWatch: function () {
        document.removeEventListener('native.keyboardhide', keyboardHideEvent);
        $rootScope.$$listeners['$cordovaKeyboard:hide'] = [];
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/shazron/KeychainPlugin.git
// link      :      https://github.com/shazron/KeychainPlugin

/* globals Keychain: true */
angular.module('ngCordova.plugins.keychain', [])

  .factory('$cordovaKeychain', ['$q', function ($q) {

    return {
      getForKey: function (key, serviceName) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.getForKey(defer.resolve, defer.reject, key, serviceName);

        return defer.promise;
      },

      setForKey: function (key, serviceName, value) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.setForKey(defer.resolve, defer.reject, key, serviceName, value);

        return defer.promise;
      },

      removeForKey: function (key, serviceName) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.removeForKey(defer.resolve, defer.reject, key, serviceName);

        return defer.promise;
      }
    };
  }]);

// install   :      cordova plugin add uk.co.workingedge.phonegap.plugin.launchnavigator
// link      :      https://github.com/dpa99c/phonegap-launch-navigator

/* globals launchnavigator: true */
angular.module('ngCordova.plugins.launchNavigator', [])

  .factory('$cordovaLaunchNavigator', ['$q', function ($q) {

    return {
      navigate: function (destination, start, options) {
        var q = $q.defer();
        launchnavigator.navigate(
          destination,
          start,
          function (){
            q.resolve();
          },
          function (error){
            q.reject(error);
          },
		  options);
        return q.promise;
      }
    };

  }]);

// install   :  cordova plugin add https://github.com/katzer/cordova-plugin-local-notifications.git
// link      :  https://github.com/katzer/cordova-plugin-local-notifications

angular.module('ngCordova.plugins.localNotification', [])

  .factory('$cordovaLocalNotification', ['$q', '$window', '$rootScope', '$timeout', function ($q, $window, $rootScope, $timeout) {
    document.addEventListener('deviceready', function () {
      if ($window.cordova &&
        $window.cordova.plugins &&
        $window.cordova.plugins.notification &&
        $window.cordova.plugins.notification.local) {
        // ----- "Scheduling" events

        // A local notification was scheduled
        $window.cordova.plugins.notification.local.on('schedule', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:schedule', notification, state);
          });
        });

        // A local notification was triggered
        $window.cordova.plugins.notification.local.on('trigger', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:trigger', notification, state);
          });
        });

        // ----- "Update" events

        // A local notification was updated
        $window.cordova.plugins.notification.local.on('update', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:update', notification, state);
          });
        });

        // ----- "Clear" events

        // A local notification was cleared from the notification center
        $window.cordova.plugins.notification.local.on('clear', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:clear', notification, state);
          });
        });

        // All local notifications were cleared from the notification center
        $window.cordova.plugins.notification.local.on('clearall', function (state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:clearall', state);
          });
        });

        // ----- "Cancel" events

        // A local notification was cancelled
        $window.cordova.plugins.notification.local.on('cancel', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:cancel', notification, state);
          });
        });

        // All local notifications were cancelled
        $window.cordova.plugins.notification.local.on('cancelall', function (state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:cancelall', state);
          });
        });

        // ----- Other events

        // A local notification was clicked
        $window.cordova.plugins.notification.local.on('click', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:click', notification, state);
          });
        });
      }
    }, false);
    return {
      schedule: function (options, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.schedule(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      add: function (options, scope) {
        console.warn('Deprecated: use "schedule" instead.');

        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.schedule(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      update: function (options, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.update(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      clear: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.clear(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      clearAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.clearAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      cancel: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.cancel(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      cancelAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.cancelAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isPresent: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isPresent(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isScheduled: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isScheduled(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isTriggered: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isTriggered(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      hasPermission: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.hasPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      registerPermission: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.registerPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      promptForPermission: function (scope) {
        console.warn('Deprecated: use "registerPermission" instead.');

        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.registerPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      getAllIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getScheduledIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getScheduledIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getTriggeredIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getTriggeredIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      get: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.get(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getScheduled: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getScheduled(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAllScheduled: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllScheduled(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getTriggered: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getTriggered(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAllTriggered: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllTriggered(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getDefaults: function () {
        return $window.cordova.plugins.notification.local.getDefaults();
      },

      setDefaults: function (Object) {
        $window.cordova.plugins.notification.local.setDefaults(Object);
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-mmedia.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-mmedia

angular.module('ngCordova.plugins.mMediaAds', [])

  .factory('$cordovaMMediaAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.mMedia.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.mMedia.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.mMedia.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.mMedia.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.mMedia.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.mMedia.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.mMedia.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.mMedia.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-media
// link      :      https://github.com/apache/cordova-plugin-media

/* globals Media: true */
angular.module('ngCordova.plugins.media', [])

.service('NewMedia', ['$q', '$interval', function ($q, $interval) {
  var q, q2, q3, mediaStatus = null, mediaPosition = -1, mediaTimer, mediaDuration = -1;

  function setTimer(media) {
      if (angular.isDefined(mediaTimer)) {
        return;
      }

      mediaTimer = $interval(function () {
          if (mediaDuration < 0) {
              mediaDuration = media.getDuration();
              if (q && mediaDuration > 0) {
                q.notify({duration: mediaDuration});
              }
          }

          media.getCurrentPosition(
            // success callback
            function (position) {
                if (position > -1) {
                    mediaPosition = position;
                }
            },
            // error callback
            function (e) {
                console.log('Error getting pos=' + e);
            });

          if (q) {
            q.notify({position: mediaPosition});
          }

      }, 1000);
  }

  function clearTimer() {
      if (angular.isDefined(mediaTimer)) {
          $interval.cancel(mediaTimer);
          mediaTimer = undefined;
      }
  }

  function resetValues() {
      mediaPosition = -1;
      mediaDuration = -1;
  }

  function NewMedia(src) {
      this.media = new Media(src,
        function (success) {
            clearTimer();
            resetValues();
            q.resolve(success);
        }, function (error) {
            clearTimer();
            resetValues();
            q.reject(error);
        }, function (status) {
            mediaStatus = status;
            q.notify({status: mediaStatus});
        });
  }

  // iOS quirks :
  // -  myMedia.play({ numberOfLoops: 2 }) -> looping
  // -  myMedia.play({ playAudioWhenScreenIsLocked : false })
  NewMedia.prototype.play = function (options) {
      q = $q.defer();

      if (typeof options !== 'object') {
          options = {};
      }

      this.media.play(options);

      setTimer(this.media);

      return q.promise;
  };

  NewMedia.prototype.pause = function () {
      clearTimer();
      this.media.pause();
  };

  NewMedia.prototype.stop  = function () {
      this.media.stop();
  };

  NewMedia.prototype.release  = function () {
      this.media.release();
      this.media = undefined;
  };

  NewMedia.prototype.seekTo  = function (timing) {
      this.media.seekTo(timing);
  };

  NewMedia.prototype.setVolume = function (volume) {
      this.media.setVolume(volume);
  };

  NewMedia.prototype.startRecord = function () {
      this.media.startRecord();
  };

  NewMedia.prototype.stopRecord  = function () {
      this.media.stopRecord();
  };

  NewMedia.prototype.currentTime = function () {
      q2 = $q.defer();
      this.media.getCurrentPosition(function (position){
      q2.resolve(position);
      });
      return q2.promise;
  };

  NewMedia.prototype.getDuration = function () {
    q3 = $q.defer();
    this.media.getDuration(function (duration){
    q3.resolve(duration);
    });
    return q3.promise;
  };

  return NewMedia;

}])
.factory('$cordovaMedia', ['NewMedia', function (NewMedia) {
  return {
      newMedia: function (src) {
          return new NewMedia(src);
      }
  };
}]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-mobfox-pro.git
// link     :     https://github.com/floatinghotpot/cordova-mobfox-pro

angular.module('ngCordova.plugins.mobfoxAds', [])

  .factory('$cordovaMobFoxAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.MobFox.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.MobFox.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.MobFox.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.MobFox.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.MobFox.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.MobFox.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.MobFox.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.MobFox.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

angular.module('ngCordova.plugins', [
  'ngCordova.plugins.actionSheet',
  'ngCordova.plugins.adMob',
  'ngCordova.plugins.appAvailability',
  'ngCordova.plugins.appRate',
  'ngCordova.plugins.appVersion',
  'ngCordova.plugins.backgroundGeolocation',
  'ngCordova.plugins.badge',
  'ngCordova.plugins.barcodeScanner',
  'ngCordova.plugins.batteryStatus',
  'ngCordova.plugins.beacon',
  'ngCordova.plugins.ble',
  'ngCordova.plugins.bluetoothSerial',
  'ngCordova.plugins.brightness',
  'ngCordova.plugins.calendar',
  'ngCordova.plugins.camera',
  'ngCordova.plugins.capture',
  'ngCordova.plugins.clipboard',
  'ngCordova.plugins.contacts',
  'ngCordova.plugins.datePicker',
  'ngCordova.plugins.device',
  'ngCordova.plugins.deviceMotion',
  'ngCordova.plugins.deviceOrientation',
  'ngCordova.plugins.dialogs',
  'ngCordova.plugins.emailComposer',
  'ngCordova.plugins.facebook',
  'ngCordova.plugins.facebookAds',
  'ngCordova.plugins.file',
  'ngCordova.plugins.fileTransfer',
  'ngCordova.plugins.fileOpener2',
  'ngCordova.plugins.flashlight',
  'ngCordova.plugins.flurryAds',
  'ngCordova.plugins.ga',
  'ngCordova.plugins.geolocation',
  'ngCordova.plugins.globalization',
  'ngCordova.plugins.googleAds',
  'ngCordova.plugins.googleAnalytics',
  'ngCordova.plugins.googleMap',
  'ngCordova.plugins.googlePlayGame',
  'ngCordova.plugins.googlePlus',
  'ngCordova.plugins.healthKit',
  'ngCordova.plugins.httpd',
  'ngCordova.plugins.iAd',
  'ngCordova.plugins.imagePicker',
  'ngCordova.plugins.inAppBrowser',
  'ngCordova.plugins.instagram',
  'ngCordova.plugins.keyboard',
  'ngCordova.plugins.keychain',
  'ngCordova.plugins.launchNavigator',
  'ngCordova.plugins.localNotification',
  'ngCordova.plugins.media',
  'ngCordova.plugins.mMediaAds',
  'ngCordova.plugins.mobfoxAds',
  'ngCordova.plugins.mopubAds',
  'ngCordova.plugins.nativeAudio',
  'ngCordova.plugins.network',
  'ngCordova.plugins.pinDialog',
  'ngCordova.plugins.preferences',
  'ngCordova.plugins.printer',
  'ngCordova.plugins.progressIndicator',
  'ngCordova.plugins.push',
  'ngCordova.plugins.push_v5',
  'ngCordova.plugins.sms',
  'ngCordova.plugins.socialSharing',
  'ngCordova.plugins.spinnerDialog',
  'ngCordova.plugins.splashscreen',
  'ngCordova.plugins.sqlite',
  'ngCordova.plugins.statusbar',
  'ngCordova.plugins.toast',
  'ngCordova.plugins.touchid',
  'ngCordova.plugins.vibration',
  'ngCordova.plugins.videoCapturePlus',
  'ngCordova.plugins.zip',
  'ngCordova.plugins.insomnia'
]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-mopub.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-mopub

angular.module('ngCordova.plugins.mopubAds', [])
  .factory('$cordovaMoPubAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.MoPub.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.MoPub.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.MoPub.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.MoPub.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.MoPub.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.MoPub.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.MoPub.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.MoPub.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   : cordova plugin add https://github.com/sidneys/cordova-plugin-nativeaudio.git
// link      : https://github.com/sidneys/cordova-plugin-nativeaudio

angular.module('ngCordova.plugins.nativeAudio', [])

  .factory('$cordovaNativeAudio', ['$q', '$window', function ($q, $window) {

    return {
      preloadSimple: function (id, assetPath) {
        var q = $q.defer();
        $window.plugins.NativeAudio.preloadSimple(id, assetPath, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      preloadComplex: function (id, assetPath, volume, voices) {
        var q = $q.defer();
        $window.plugins.NativeAudio.preloadComplex(id, assetPath, volume, voices, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      play: function (id, completeCallback) {
        var q = $q.defer();
        $window.plugins.NativeAudio.play(id, completeCallback, function (err) {
          q.reject(err);
        }, function (result) {
          q.resolve(result);
        });

        return q.promise;
      },

      stop: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.stop(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      loop: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.loop(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      unload: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.unload(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      setVolumeForComplexAsset: function (id, volume) {
        var q = $q.defer();
        $window.plugins.NativeAudio.setVolumeForComplexAsset(id, volume, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-network-information
// link      :      https://github.com/apache/cordova-plugin-network-information

/* globals Connection: true */
angular.module('ngCordova.plugins.network', [])

  .factory('$cordovaNetwork', ['$rootScope', '$timeout', function ($rootScope, $timeout) {

    /**
      * Fires offline a event
      */
    var offlineEvent = function () {
      var networkState = navigator.connection.type;
      $timeout(function () {
        $rootScope.$broadcast('$cordovaNetwork:offline', networkState);
      });
    };

    /**
      * Fires online a event
      */
    var onlineEvent = function () {
      var networkState = navigator.connection.type;
      $timeout(function () {
        $rootScope.$broadcast('$cordovaNetwork:online', networkState);
      });
    };

    document.addEventListener('deviceready', function () {
      if (navigator.connection) {
        document.addEventListener('offline', offlineEvent, false);
        document.addEventListener('online', onlineEvent, false);
      }
    });

    return {
      getNetwork: function () {
        return navigator.connection.type;
      },

      isOnline: function () {
        var networkState = navigator.connection.type;
        return networkState !== Connection.UNKNOWN && networkState !== Connection.NONE;
      },

      isOffline: function () {
        var networkState = navigator.connection.type;
        return networkState === Connection.UNKNOWN || networkState === Connection.NONE;
      },

      clearOfflineWatch: function () {
        document.removeEventListener('offline', offlineEvent);
        $rootScope.$$listeners['$cordovaNetwork:offline'] = [];
      },

      clearOnlineWatch: function () {
        document.removeEventListener('online', onlineEvent);
        $rootScope.$$listeners['$cordovaNetwork:online'] = [];
      }
    };
  }])
  .run(['$injector', function ($injector) {
    $injector.get('$cordovaNetwork'); //ensure the factory always gets initialised
  }]);

// install   :      cordova plugin add https://github.com/Paldom/PinDialog.git
// link      :      https://github.com/Paldom/PinDialog

angular.module('ngCordova.plugins.pinDialog', [])

  .factory('$cordovaPinDialog', ['$q', '$window', function ($q, $window) {

    return {
      prompt: function (message, title, buttons) {
        var q = $q.defer();

        $window.plugins.pinDialog.prompt(message, function (res) {
          q.resolve(res);
        }, title, buttons);

        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-app-preferences
// link      :      https://github.com/apla/me.apla.cordova.app-preferences

angular.module('ngCordova.plugins.preferences', [])

  .factory('$cordovaPreferences', ['$window', '$q', function ($window, $q) {

     return {
         
         pluginNotEnabledMessage: 'Plugin not enabled',
    	
    	/**
    	 * Decorate the promise object.
    	 * @param promise The promise object.
    	 */
    	decoratePromise: function(promise){
    		promise.success = function(fn) {
	            promise.then(fn);
	            return promise;
	        };

	        promise.error = function(fn) {
	            promise.then(null, fn);
	            return promise;
	        };
    	},
    	
    	/**
    	 * Store the value of the given dictionary and key.
    	 * @param key The key of the preference.
    	 * @param value The value to set.
         * @param dict The dictionary. It's optional.
         * @returns Returns a promise.
    	 */
	    store: function(key, value, dict) {
	    	var deferred = $q.defer();
	    	var promise = deferred.promise;
            
            function ok(value){
                deferred.resolve(value);
            }
            
            function errorCallback(error){
                deferred.reject(new Error(error));
            }
            
            if($window.plugins){
                var storeResult;
                if(arguments.length === 3){
                    storeResult = $window.plugins.appPreferences.store(dict, key, value);
                } else {
                    storeResult = $window.plugins.appPreferences.store(key, value);
                }
                
                storeResult.then(ok, errorCallback);
            } else {
                deferred.reject(new Error(this.pluginNotEnabledMessage));
            }
            
	    	this.decoratePromise(promise);
	    	return promise;
	    },
	    
	    /**
	     * Fetch the value by the given dictionary and key.
	     * @param key The key of the preference to retrieve.
         * @param dict The dictionary. It's optional.
         * @returns Returns a promise.
	     */
	    fetch: function(key, dict) {
	    	var deferred = $q.defer();
	    	var promise = deferred.promise;
            
            function ok(value){
                deferred.resolve(value);
            }
            
            function errorCallback(error){
                deferred.reject(new Error(error));
            }
            
            if($window.plugins){
                var fetchResult;
                if(arguments.length === 2){
                    fetchResult = $window.plugins.appPreferences.fetch(dict, key);
                } else {
                    fetchResult = $window.plugins.appPreferences.fetch(key);
                }
                fetchResult.then(ok, errorCallback);
            } else {
                deferred.reject(new Error(this.pluginNotEnabledMessage));
            }
            
	    	this.decoratePromise(promise);
	    	return promise;
	    },
        
        /**
	     * Remove the value by the given key.
	     * @param key The key of the preference to retrieve.
         * @param dict The dictionary. It's optional.
         * @returns Returns a promise.
	     */
	    remove: function(key, dict) {
	    	var deferred = $q.defer();
	    	var promise = deferred.promise;
            
            function ok(value){
                deferred.resolve(value);
            }
            
            function errorCallback(error){
                deferred.reject(new Error(error));
            }
            
            if($window.plugins){
                var removeResult;
                if(arguments.length === 2){
                    removeResult = $window.plugins.appPreferences.remove(dict, key);
                } else {
                    removeResult = $window.plugins.appPreferences.remove(key);
                }
                removeResult.then(ok, errorCallback);
            } else {
                deferred.reject(new Error(this.pluginNotEnabledMessage));
            }
	    	
	    	this.decoratePromise(promise);
	    	return promise;
	    },
        
        /**
	     * Show the application preferences.
         * @returns Returns a promise.
	     */
	    show: function() {
	    	var deferred = $q.defer();
	    	var promise = deferred.promise;
            
            function ok(value){
                deferred.resolve(value);
            }
            
            function errorCallback(error){
                deferred.reject(new Error(error));
            }
            
            if($window.plugins){
                $window.plugins.appPreferences.show()
                    .then(ok, errorCallback);
            } else {
                deferred.reject(new Error(this.pluginNotEnabledMessage));
            }
	    	
	    	this.decoratePromise(promise);
	    	return promise;
	    }
    };

  }]);

// install   : cordova plugin add https://github.com/katzer/cordova-plugin-printer.git
// link      : https://github.com/katzer/cordova-plugin-printer

angular.module('ngCordova.plugins.printer', [])

  .factory('$cordovaPrinter', ['$q', '$window', function ($q, $window) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        $window.plugin.printer.isAvailable(function (isAvailable) {
          q.resolve(isAvailable);
        });

        return q.promise;
      },

      print: function (doc, options) {
        var q = $q.defer();
        $window.plugin.printer.print(doc, options, function () {
          q.resolve();
        });
        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/pbernasconi/cordova-progressIndicator.git
// link      :      http://pbernasconi.github.io/cordova-progressIndicator/

/* globals ProgressIndicator: true */
angular.module('ngCordova.plugins.progressIndicator', [])

  .factory('$cordovaProgress', [function () {

    return {
      show: function (_message) {
        var message = _message || 'Please wait...';
        return ProgressIndicator.show(message);
      },

      showSimple: function (_dim) {
        var dim = _dim || false;
        return ProgressIndicator.showSimple(dim);
      },

      showSimpleWithLabel: function (_dim, _label) {
        var dim = _dim || false;
        var label = _label || 'Loading...';
        return ProgressIndicator.showSimpleWithLabel(dim, label);
      },

      showSimpleWithLabelDetail: function (_dim, _label, _detail) {
        var dim = _dim || false;
        var label = _label || 'Loading...';
        var detail = _detail || 'Please wait';
        return ProgressIndicator.showSimpleWithLabelDetail(dim, label, detail);
      },

      showDeterminate: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showDeterminate(dim, timeout);
      },

      showDeterminateWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || 'Loading...';

        return ProgressIndicator.showDeterminateWithLabel(dim, timeout, label);
      },

      showAnnular: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showAnnular(dim, timeout);
      },

      showAnnularWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || 'Loading...';
        return ProgressIndicator.showAnnularWithLabel(dim, timeout, label);
      },

      showBar: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showBar(dim, timeout);
      },

      showBarWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || 'Loading...';
        return ProgressIndicator.showBarWithLabel(dim, timeout, label);
      },

      showSuccess: function (_dim, _label) {
        var dim = _dim || false;
        var label = _label || 'Success';
        return ProgressIndicator.showSuccess(dim, label);
      },

      showText: function (_dim, _text, _position) {
        var dim = _dim || false;
        var text = _text || 'Warning';
        var position = _position || 'center';
        return ProgressIndicator.showText(dim, text, position);
      },

      hide: function () {
        return ProgressIndicator.hide();
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/phonegap-build/PushPlugin.git
// link      :      https://github.com/phonegap-build/PushPlugin

angular.module('ngCordova.plugins.push', [])

  .factory('$cordovaPush', ['$q', '$window', '$rootScope', '$timeout', function ($q, $window, $rootScope, $timeout) {

    return {
      onNotification: function (notification) {
        $timeout(function () {
          $rootScope.$broadcast('$cordovaPush:notificationReceived', notification);
        });
      },

      register: function (config) {
        var q = $q.defer();
        var injector;
        if (config !== undefined && config.ecb === undefined) {
          if (document.querySelector('[ng-app]') === null) {
            injector = 'document.body';
          }
          else {
            injector = 'document.querySelector(\'[ng-app]\')';
          }
          config.ecb = 'angular.element(' + injector + ').injector().get(\'$cordovaPush\').onNotification';
        }

        $window.plugins.pushNotification.register(function (token) {
          q.resolve(token);
        }, function (error) {
          q.reject(error);
        }, config);

        return q.promise;
      },

      unregister: function (options) {
        var q = $q.defer();
        $window.plugins.pushNotification.unregister(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        }, options);

        return q.promise;
      },

      // iOS only
      setBadgeNumber: function (number) {
        var q = $q.defer();
        $window.plugins.pushNotification.setApplicationIconBadgeNumber(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        }, number);
        return q.promise;
      }
    };
  }]);


// install   :      cordova plugin add phonegap-plugin-push
// link      :      https://github.com/phonegap/phonegap-plugin-push

angular.module('ngCordova.plugins.push_v5', [])
  .factory('$cordovaPushV5',['$q', '$rootScope', '$timeout', function ($q, $rootScope, $timeout) {
   /*global PushNotification*/

    var push;
    return {
      initialize : function (options) {
        var q = $q.defer();
        push = PushNotification.init(options);
        q.resolve(push);
        return q.promise;
      },
      onNotification : function () {
        $timeout(function () {
          push.on('notification', function (notification) {
            $rootScope.$emit('$cordovaPushV5:notificationReceived', notification);
          });
        });
      },
      onError : function () {
        $timeout(function () {
          push.on('error', function (error) { $rootScope.$emit('$cordovaPushV5:errorOccurred', error);});
        });
      },
      register : function () {
        var q = $q.defer();
        if (push === undefined) {
          q.reject(new Error('init must be called before any other operation'));
        } else {
          push.on('registration', function (data) {
            q.resolve(data.registrationId);
          });
        }
        return q.promise;
      },
      unregister : function () {
        var q = $q.defer();
        if (push === undefined) {
          q.reject(new Error('init must be called before any other operation'));
        } else {
          push.unregister(function (success) {
            q.resolve(success);
          },function (error) {
            q.reject(error);
          });
        }
        return q.promise;
      },
      setBadgeNumber : function (number) {
        var q = $q.defer();
        if (push === undefined) {
          q.reject(new Error('init must be called before any other operation'));
        } else {
          push.setApplicationIconBadgeNumber(function (success) {
            q.resolve(success);
          }, function (error) {
            q.reject(error);
          }, number);
        }
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/gitawego/cordova-screenshot.git
// link      :     https://github.com/gitawego/cordova-screenshot

angular.module('ngCordova.plugins.screenshot', [])
.factory('$cordovaScreenshot', ['$q', function ($q) {
  return {
    captureToFile: function (opts) {

      var options = opts || {};

      var extension = options.extension || 'jpg';
      var quality = options.quality || '100';

      var defer = $q.defer();

      if (!navigator.screenshot) {
        defer.resolve(null);
        return defer.promise;
      }

      navigator.screenshot.save(function (error, res) {
        if (error) {
          defer.reject(error);
        } else {
          defer.resolve(res.filePath);
        }
      }, extension, quality, options.filename);

      return defer.promise;
    },
    captureToUri: function (opts) {

      var options = opts || {};

      var extension = options.extension || 'jpg';
      var quality = options.quality || '100';

      var defer = $q.defer();

      if (!navigator.screenshot) {
        defer.resolve(null);
        return defer.promise;
      }

      navigator.screenshot.URI(function (error, res) {
        if (error) {
          defer.reject(error);
        } else {
          defer.resolve(res.URI);
        }
      }, extension, quality, options.filename);

      return defer.promise;
    }
  };
}]);
// install   :      cordova plugin add https://github.com/cordova-sms/cordova-sms-plugin.git
// link      :      https://github.com/cordova-sms/cordova-sms-plugin

/* globals sms: true */
angular.module('ngCordova.plugins.sms', [])

  .factory('$cordovaSms', ['$q', function ($q) {

    return {
      send: function (number, message, options) {
        var q = $q.defer();
        sms.send(number, message, options, function (res) {
          q.resolve(res);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/EddyVerbruggen/SocialSharing-PhoneGap-Plugin.git
// link      :      https://github.com/EddyVerbruggen/SocialSharing-PhoneGap-Plugin

// NOTE: shareViaEmail -> if user cancels sharing email, success is still called
// TODO: add support for iPad

angular.module('ngCordova.plugins.socialSharing', [])

  .factory('$cordovaSocialSharing', ['$q', '$window', function ($q, $window) {

    return {
      share: function (message, subject, file, link) {
        var q = $q.defer();
        subject = subject || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.share(message, subject, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaTwitter: function (message, file, link) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaTwitter(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaWhatsApp: function (message, file, link) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaWhatsApp(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaFacebook: function (message, file, link) {
        var q = $q.defer();
        message = message || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaFacebook(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaFacebookWithPasteMessageHint: function (message, file, link, pasteMessageHint) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaFacebookWithPasteMessageHint(message, file, link, pasteMessageHint, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaSMS: function (message, commaSeparatedPhoneNumbers) {
        var q = $q.defer();
        $window.plugins.socialsharing.shareViaSMS(message, commaSeparatedPhoneNumbers, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaEmail: function (message, subject, toArr, ccArr, bccArr, fileArr) {
        var q = $q.defer();
        toArr = toArr || null;
        ccArr = ccArr || null;
        bccArr = bccArr || null;
        fileArr = fileArr || null;
        $window.plugins.socialsharing.shareViaEmail(message, subject, toArr, ccArr, bccArr, fileArr, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareVia: function (via, message, subject, file, link) {
        var q = $q.defer();
        message = message || null;
        subject = subject || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareVia(via, message, subject, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      canShareViaEmail: function () {
        var q = $q.defer();
        $window.plugins.socialsharing.canShareViaEmail(function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      canShareVia: function (via, message, subject, file, link) {
        var q = $q.defer();
        $window.plugins.socialsharing.canShareVia(via, message, subject, file, link, function (success) {
          q.resolve(success);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      available: function () {
        var q = $q.defer();
        window.plugins.socialsharing.available(function (isAvailable) {
          if (isAvailable) {
            q.resolve();
          }
          else {
            q.reject();
          }
        });
        
        return q.promise;
      }
    };
  }]);

// install   :       cordova plugin add https://github.com/Paldom/SpinnerDialog.git
// link      :       https://github.com/Paldom/SpinnerDialog

angular.module('ngCordova.plugins.spinnerDialog', [])

  .factory('$cordovaSpinnerDialog', ['$window', function ($window) {

    return {
      show: function (title, message, fixed) {
        fixed = fixed || false;
        return $window.plugins.spinnerDialog.show(title, message, fixed);
      },
      hide: function () {
        return $window.plugins.spinnerDialog.hide();
      }
    };

  }]);

// install   :      cordova plugin add cordova-plugin-splashscreen
// link      :      https://github.com/apache/cordova-plugin-splashscreen

angular.module('ngCordova.plugins.splashscreen', [])

  .factory('$cordovaSplashscreen', [function () {

    return {
      hide: function () {
        return navigator.splashscreen.hide();
      },

      show: function () {
        return navigator.splashscreen.show();
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/litehelpers/Cordova-sqlite-storage.git
// link      :      https://github.com/litehelpers/Cordova-sqlite-storage

angular.module('ngCordova.plugins.sqlite', [])

  .factory('$cordovaSQLite', ['$q', '$window', function ($q, $window) {

    return {
      openDB: function (options, background) {

        if (angular.isObject(options) && !angular.isString(options)) {
          if (typeof background !== 'undefined') {
            options.bgType = background;
          }
          return $window.sqlitePlugin.openDatabase(options);
        }

        return $window.sqlitePlugin.openDatabase({
          name: options,
          bgType: background
        });
      },

      execute: function (db, query, binding) {
        var q = $q.defer();
        db.transaction(function (tx) {
          tx.executeSql(query, binding, function (tx, result) {
              q.resolve(result);
            },
            function (transaction, error) {
              q.reject(error);
            });
        });
        return q.promise;
      },

      insertCollection: function (db, query, bindings) {
        var q = $q.defer();
        var coll = bindings.slice(0); // clone collection

        db.transaction(function (tx) {
          (function insertOne() {
            var record = coll.splice(0, 1)[0]; // get the first record of coll and reduce coll by one
            try {
              tx.executeSql(query, record, function (tx, result) {
                if (coll.length === 0) {
                  q.resolve(result);
                } else {
                  insertOne();
                }
              }, function (transaction, error) {
                q.reject(error);
                return;
              });
            } catch (exception) {
              q.reject(exception);
            }
          })();
        });
        return q.promise;
      },

      nestedExecute: function (db, query1, query2, binding1, binding2) {
        var q = $q.defer();

        db.transaction(function (tx) {
            tx.executeSql(query1, binding1, function (tx, result) {
              q.resolve(result);
              tx.executeSql(query2, binding2, function (tx, res) {
                q.resolve(res);
              });
            });
          },
          function (transaction, error) {
            q.reject(error);
          });

        return q.promise;
      },

      deleteDB: function (dbName) {
        var q = $q.defer();

        $window.sqlitePlugin.deleteDatabase(dbName, function (success) {
          q.resolve(success);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-statusbar
// link      :      https://github.com/apache/cordova-plugin-statusbar

/* globals StatusBar: true */
angular.module('ngCordova.plugins.statusbar', [])

.factory('$cordovaStatusbar', [function () {

  return {

    /**
      * @param {boolean} bool
      */
    overlaysWebView: function (bool) {
      return StatusBar.overlaysWebView(!!bool);
    },

    STYLES: {
      DEFAULT: 0,
      LIGHT_CONTENT: 1,
      BLACK_TRANSLUCENT: 2,
      BLACK_OPAQUE: 3
    },

    /**
      * @param {number} style
      */
    style: function (style) {
      switch (style) {
        // Default
        case 0:
        return StatusBar.styleDefault();

        // LightContent
        case 1:
        return StatusBar.styleLightContent();

        // BlackTranslucent
        case 2:
        return StatusBar.styleBlackTranslucent();

        // BlackOpaque
        case 3:
        return StatusBar.styleBlackOpaque();

        default:
        return StatusBar.styleDefault();
      }
    },

    // supported names:
    // black, darkGray, lightGray, white, gray, red, green,
    // blue, cyan, yellow, magenta, orange, purple, brown
    styleColor: function (color) {
      return StatusBar.backgroundColorByName(color);
    },

    styleHex: function (colorHex) {
      return StatusBar.backgroundColorByHexString(colorHex);
    },

    hide: function () {
      return StatusBar.hide();
    },

    show: function () {
      return StatusBar.show();
    },

    isVisible: function () {
      return StatusBar.isVisible;
    }
  };
}]);

// install   :      cordova plugin add https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin.git
// link      :      https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin

angular.module('ngCordova.plugins.toast', [])

  .factory('$cordovaToast', ['$q', '$window', function ($q, $window) {

    return {
      showShortTop: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortTop(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showShortCenter: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortCenter(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showShortBottom: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortBottom(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongTop: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongTop(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongCenter: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongCenter(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongBottom: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongBottom(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      show: function (message, duration, position) {
        var q = $q.defer();
        $window.plugins.toast.show(message, duration, position, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      hide: function () {
        var q = $q.defer();
        try {
          $window.plugins.toast.hide();
          q.resolve();
        } catch (error) {
          q.reject(error && error.message);
        }
        return q.promise;
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/leecrossley/cordova-plugin-touchid.git
// link      :      https://github.com/leecrossley/cordova-plugin-touchid

/* globals touchid: true */
angular.module('ngCordova.plugins.touchid', [])

  .factory('$cordovaTouchID', ['$q', function ($q) {

    return {
      checkSupport: function () {
        var defer = $q.defer();
        if (!window.cordova) {
          defer.reject('Not supported without cordova.js');
        } else {
          touchid.checkSupport(function (value) {
            defer.resolve(value);
          }, function (err) {
            defer.reject(err);
          });
        }

        return defer.promise;
      },

      authenticate: function (authReasonText) {
        var defer = $q.defer();
        if (!window.cordova) {
          defer.reject('Not supported without cordova.js');
        } else {
          touchid.authenticate(function (value) {
            defer.resolve(value);
          }, function (err) {
            defer.reject(err);
          }, authReasonText);
        }

        return defer.promise;
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/aerogear/aerogear-cordova-push.git
// link      :      https://github.com/aerogear/aerogear-cordova-push

angular.module('ngCordova.plugins.upsPush', [])

  .factory('$cordovaUpsPush', ['$q', '$window', '$rootScope', '$timeout', function ($q, $window, $rootScope, $timeout) {
    return {
      register: function (config) {
        var q = $q.defer();

        $window.push.register(function (notification) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaUpsPush:notificationReceived', notification);
          });
        }, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        }, config);

        return q.promise;
      },

      unregister: function (options) {
        var q = $q.defer();
        $window.push.unregister(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        }, options);

        return q.promise;
      },

      // iOS only
      setBadgeNumber: function (number) {
        var q = $q.defer();
        $window.push.setApplicationIconBadgeNumber(function () {
          q.resolve();
        }, number);
        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-vibration
// link      :      https://github.com/apache/cordova-plugin-vibration

angular.module('ngCordova.plugins.vibration', [])

  .factory('$cordovaVibration', [function () {

    return {
      vibrate: function (times) {
        return navigator.notification.vibrate(times);
      },
      vibrateWithPattern: function (pattern, repeat) {
        return navigator.notification.vibrateWithPattern(pattern, repeat);
      },
      cancelVibration: function () {
        return navigator.notification.cancelVibration();
      }
    };
  }]);

// install   :    cordova plugin add https://github.com/EddyVerbruggen/VideoCapturePlus-PhoneGap-Plugin.git
// link      :    https://github.com/EddyVerbruggen/VideoCapturePlus-PhoneGap-Plugin

angular.module('ngCordova.plugins.videoCapturePlus', [])

  .provider('$cordovaVideoCapturePlus', [function () {

    var defaultOptions = {};


    /**
     * the nr of videos to record, default 1 (on iOS always 1)
     *
     * @param limit
     */
    this.setLimit = function setLimit(limit) {
      defaultOptions.limit = limit;
    };


    /**
     * max duration in seconds, default 0, which is 'forever'
     *
     * @param seconds
     */
    this.setMaxDuration = function setMaxDuration(seconds) {
      defaultOptions.duration = seconds;
    };


    /**
     * set to true to override the default low quality setting
     *
     * @param {Boolean} highquality
     */
    this.setHighQuality = function setHighQuality(highquality) {
      defaultOptions.highquality = highquality;
    };

    /**
     * you'll want to sniff the user-Agent/device and pass the best overlay based on that..
     * set to true to override the default backfacing camera setting. iOS: works fine, Android: YMMV (#18)
     *
     * @param {Boolean} frontcamera
     */
    this.useFrontCamera = function useFrontCamera(frontcamera) {
      defaultOptions.frontcamera = frontcamera;
    };


    /**
     * put the png in your www folder
     *
     * @param {String} imageUrl
     */
    this.setPortraitOverlay = function setPortraitOverlay(imageUrl) {
      defaultOptions.portraitOverlay = imageUrl;
    };


    /**
     *
     * @param {String} imageUrl
     */
    this.setLandscapeOverlay = function setLandscapeOverlay(imageUrl) {
      defaultOptions.landscapeOverlay = imageUrl;
    };


    /**
     * iOS only
     *
     * @param text
     */
    this.setOverlayText = function setOverlayText(text) {
      defaultOptions.overlayText = text;
    };


    this.$get = ['$q', '$window', function ($q, $window) {
      return {
        captureVideo: function (options) {
          var q = $q.defer();

          if (!$window.plugins.videocaptureplus) {
            q.resolve(null);
            return q.promise;
          }

          $window.plugins.videocaptureplus.captureVideo(q.resolve, q.reject,
            angular.extend({}, defaultOptions, options));

          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/MobileChromeApps/zip.git
// link     :     https://github.com/MobileChromeApps/zip

angular.module('ngCordova.plugins.zip', [])

  .factory('$cordovaZip', ['$q', '$window', function ($q, $window) {

    return {
      unzip: function (source, destination) {
        var q = $q.defer();

        $window.zip.unzip(source, destination, function (isError) {
          if (isError === 0) {
            q.resolve();
          } else {
            q.reject();
          }
        }, function (progressEvent) {
          q.notify(progressEvent);
        });

        return q.promise;
      }
    };
  }]);

})();
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJXV1cvanMvbm9kZVNlcnZpY2VzLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvY2hvbGVza3kuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9ldmQuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9sdS5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RjL3FyLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvc3ZkLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RlY29tcG9zaXRpb25zLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9tYXRyaXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL25vZGVfbW9kdWxlcy9tbC1zdGF0L2FycmF5LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9ub2RlX21vZHVsZXMvbWwtc3RhdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wY2Evbm9kZV9tb2R1bGVzL21sLXN0YXQvbWF0cml4LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL3NyYy9wY2EuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL29wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy91dGlscy5qcyIsIm5vZGVfbW9kdWxlcy9uZy1jb3Jkb3ZhL2Rpc3QvbmctY29yZG92YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL3VCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ253QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pnQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM5MENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeGdCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBsaWJfY29yZG92YSA9IHJlcXVpcmUoJ25nLWNvcmRvdmEnKTtcclxuXHJcbi8vVGhpcyBmaWxlIGluY2x1ZGVzIHNlcnZpY2VzIHdoaWNoIHJlbHkgb24gbm9kZSBwdWJsaWMgbW9kdWxlcy5cclxuYW5ndWxhci5tb2R1bGUoJ2FwcC5ub2RlU2VydmljZXMnLCBbJ2lvbmljJywgJ25nQ29yZG92YSddKVxyXG5cclxuLnNlcnZpY2UoJ2NoZW1vJywgZnVuY3Rpb24gKGRhdGFiYXNlKSB7XHJcblxyXG4gICAgdmFyIGxpYl9wbHMgPSByZXF1aXJlKCdtbC1wbHMnKTtcclxuICAgIHZhciBsaWJfcGNhID0gcmVxdWlyZSgnbWwtcGNhJyk7XHJcbiAgICB2YXIgbGliX21hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xyXG5cclxuICAgIHZhciBjaGVtb0lzUGxzO1xyXG4gICAgdmFyIGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vUENBQ29tcHJlc3NlZCA9IFtdO1xyXG4gICAgdmFyIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IDA7XHJcbiAgICB2YXIgY2hlbW9Jc1RyYWluZWQgPSBmYWxzZTtcclxuICAgIHZhciBjaGVtb1NhbXBsZU5hbWVzID0gW107XHJcbiAgICAvL3JlcHJlc2VudHMgYSBQbHMgb3IgUENBIG1vZHVsZS5cclxuICAgIHZhciBjaGVtb0FsZ287XHJcblxyXG4gICAgdmFyIGNoZW1vRmxhZ3MgPSB7XHJcbiAgICAgICAgc3VjY2VzczogMCxcclxuICAgICAgICBmYWlsRmlsZUlEOiAxLFxyXG4gICAgICAgIGZhaWxUcmFpbmluZ1Jvd01pc21hdGNoOiAyLFxyXG4gICAgICAgIGZhaWxOb3RFbm91Z2hMYWJlbHM6IDMsXHJcbiAgICAgICAgZmFpbE5vVHJhaW5pbmdEYXRhOiA0LFxyXG4gICAgICAgIGZhaWxVbmtub3duVHJhaW5FcnJvcjogNSxcclxuICAgICAgICBmYWlsVW5rbm93bkluZmVyZW5jZUVycm9yOiA2LFxyXG4gICAgICAgIGZhaWxBYnNvcmJhbmNlTWlzbWF0Y2g6IDcsXHJcbiAgICAgICAgZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaDogOCxcclxuICAgICAgICBmYWlsRmlsZU5vdFNhdmVkOiA5LFxyXG4gICAgICAgIGZhaWxJbmZlcmVuY2VSb3dNaXNtYXRjaDogMTAsXHJcbiAgICAgICAgZmFpbEluZmVyZW5jZUNvbHVtbk1pc21hdGNoOiAxMVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjb25zb2xlT3V0cHV0KHdobywgaWRlbnRpZmllciwgbWVzc2FnZSkge1xyXG4gICAgICAgIHZhciBuYW1lID0gXCJcIjtcclxuICAgICAgICBzd2l0Y2ggKHdobykge1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICBuYW1lID0gbmFtZS5jb25jYXQoXCJjaGVtb1RyYWluOiBcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgbmFtZSA9IG5hbWUuY29uY2F0KFwiQ2hlbW9JbmZlcjogXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG5hbWUgPSBuYW1lLmNvbmNhdChpZGVudGlmaWVyKTtcclxuICAgICAgICByZXR1cm4gbmFtZS5jb25jYXQobWVzc2FnZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNoZW1vQWRkTGFiZWxzKGxhYmVscykge1xyXG5cclxuICAgICAgICB2YXIgbmV3TGFiZWxzTGVuZ3RoID0gbGFiZWxzLmxlbmd0aDtcclxuICAgICAgICB2YXIgb2xkTGFiZWxzTGVuZ3RoID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aDtcclxuICAgICAgICAvL2xvY2F0aW9uQXJyIChbaW50XSkgaG9sZHMgdGhlIG51bWJlciBvZiB0aGUgY29sdW1uIG9mIGEgY29uY2VudHJhdGlvbiBtYXRyaXggdGhpcyBsYWJlbCBpcyBsaW5rZWQgdG9cclxuICAgICAgICB2YXIgbG9jYXRpb25BcnIgPSBbXTtcclxuICAgICAgICAvL0xvb2sgdG8gc2VlIGlmIHdlIGhhdmUgc2VlbiB0aGlzIGxhYmVsIGJlZm9yZVxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3TGFiZWxzTGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG5vdEZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBvbGRMYWJlbHNMZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgLy9JZiB3ZSBoYXZlIHNlZW4gYmVmb3JlLCBtYWtlIGEgbm90ZSBvZiB3aGF0IGNvbHVtbiB0aGUgY29uY2VudHJhdGlvbiB3aWxsIGdvIGluXHJcbiAgICAgICAgICAgICAgICAvL2luc2lkZSBvZiB0cmFpbmluZy1ZIG1hdHJpeC5cclxuICAgICAgICAgICAgICAgIGlmIChsYWJlbHNbaV0gPT0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2pdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm90Rm91bmQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gajtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0lmIG5ldmVyIHNlZW4gYmVmb3JlLCB3ZSBhZGQgdGhlIGxhYmVsIHRvIGEgbGlzdGluZyBvZiBsYWJlbHMuXHJcbiAgICAgICAgICAgIGlmIChub3RGb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW29sZExhYmVsc0xlbmd0aF0gPSBsYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gb2xkTGFiZWxzTGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsb2NhdGlvbkFycjtcclxuICAgIH07XHJcblxyXG4gICAgLy9BZGRzIGEgZmlsZSB3aXRoIHRoZSBtZWFzdXJlZCBhYnNvcnB0aW9ucyBhbmQgZXN0aW1hdGVkIGNvbmNlbnRyYXRpb25zLlxyXG4gICAgZnVuY3Rpb24gY2hlbW9BZGRGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFiZWxzLCBjb25jZW50cmF0aW9ucykge1xyXG4gICAgICAgIGRhdGFiYXNlQWRkRmlsZShhYnNvcmJhbmNlcywgY29uY2VudHJhdGlvbkxhYmVscywgY29uY2VudHJhdGlvbnMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0FkZENvbmNlbnRyYXRpb24obmV3Q29uY2VudHJhdGlvbiwgY3VyclJvdywgY3VyckNvbCkge1xyXG4gICAgICAgIC8vYWRkIGluZGV4XHJcbiAgICAgICAgdmFyIG51bVJvdyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGg7XHJcbiAgICAgICAgdmFyIG51bUNvbCA9IDA7XHJcbiAgICAgICAgaWYgKG51bVJvdyA+IDApIHtcclxuICAgICAgICAgICAgbnVtQ29sID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zWzBdLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vSWYgcGFzdCBsYXN0IHJvdyBieSAxLCBtYWtlIGEgbmV3IHJvdyAoZnVsbCBvZiBub3QtaW5pdClcclxuICAgICAgICBpZiAoY3VyclJvdyA9PSBudW1Sb3cpIHtcclxuICAgICAgICAgICAgbnVtUm93ICs9IDE7XHJcbiAgICAgICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XSA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgY3VyclJvd0FyciA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db2w7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgY3VyclJvd0FycltpXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy9XZSBwYXNzIHRoZSBsYXN0IGNvbHVtbi0gYWRkIG5ldyBjb2x1bW4gd2l0aCAwIHN0YXRlcy5cclxuICAgICAgICBpZiAoY3VyckNvbCA9PSBudW1Db2wpIHtcclxuICAgICAgICAgICAgbnVtQ29sICs9IDE7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUm93OyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjdXJyUm93QXJyID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKGkgPT0gY3VyclJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJSb3dBcnJbY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9XaGVuIHdlIGFkZCBhIGNvbHVtbiwgd2UgbGVhdmUgaW5kaWNlcyAwXHJcbiAgICAgICAgICAgICAgICAgICAgY3VyclJvd0FycltjdXJyQ29sXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIC8vSW4gdGhpcyBzaXR1YXRpb24gd2UgYXJlIG92ZXJ3cml0aW5nIGEgMFxyXG4gICAgICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbY3VyclJvd11bY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlbW9HZXRNb2RlbCgpIHtcclxuICAgICAgICBpZiAoY2hlbW9Jc1RyYWluZWQpIHtcclxuICAgICAgICAgICAgdmFyIG1vZGVsID0gY2hlbW9BbGdvLmV4cG9ydCgpO1xyXG4gICAgICAgICAgICBtb2RlbC5jb25jZW50cmF0aW9uTGFiZWxzID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzO1xyXG4gICAgICAgICAgICBpZiAoIWNoZW1vSXNQbHMpIHtcclxuICAgICAgICAgICAgICAgIG1vZGVsLlBDQUNvbXByZXNzZWQgPSBjaGVtb1BDQUNvbXByZXNzZWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHsgbW9kZWw6IG1vZGVsLCBzdGF0dXM6IGNoZW1vRmxhZ3Muc3VjY2VzcyB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4geyBtb2RlbDogbnVsbCwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YSB9O1xyXG4gICAgfTtcclxuXHJcbiAgICAvL0FkZCBiZXR0ZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0xvYWRNb2RlbChtb2RlbCwgaXNQbHMpIHtcclxuICAgICAgICBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMgPSBtb2RlbC5jb25jZW50cmF0aW9uTGFiZWxzO1xyXG4gICAgICAgIGlmIChpc1Bscykge1xyXG4gICAgICAgICAgICBjaGVtb0lzUGxzID0gdHJ1ZTtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wbHModHJ1ZSwgbW9kZWwpO1xyXG4gICAgICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBjaGVtb0lzUGxzID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNoZW1vQWxnbyA9IG5ldyBsaWJfcGNhKG51bGwsIG51bGwsIHRydWUsIG1vZGVsKTtcclxuICAgICAgICAgICAgY2hlbW9QQ0FDb21wcmVzc2VkID0gbW9kZWwuUENBQ29tcHJlc3NlZDtcclxuICAgICAgICAgICAgY2hlbW9Jc1RyYWluZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZmxhZ1RvU3RyaW5nKGZsYWcpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gXCJOTyBTVUNIIEZMQUdcIjtcclxuICAgICAgICBzd2l0Y2ggKGZsYWcpIHtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJzdWNjZXNzXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsRmlsZUlEXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsVHJhaW5pbmdSb3dNaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbE5vdEVub3VnaExhYmVsc1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgNDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbE5vVHJhaW5pbmdEYXRhXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA1OlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsVW5rbm93blRyYWluRXJyb3JcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDY6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxVbmtub3duSW5mZXJlbmNlRXJyb3JcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDc6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxBYnNvcmJhbmNlTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDg6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxDb25jZW50cmF0aW9uTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDk6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxGaWxlTm90U2F2ZWRcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDEwOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDExOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsSW5mZXJlbmNlQ29sdW1uTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpblBscygpIHtcclxuICAgICAgICB2YXIgbnVtQ29sQWJzb3JiYW5jZXMgPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXNbMF0ubGVuZ3RoO1xyXG4gICAgICAgIHZhciBudW1Db2xDb25jZW50cmF0aW9ucyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGg7XHJcbiAgICAgICAgLy9UYWtlIDEwJSBvZiBkYXRhIChwcm9iYWJseSBvZiBZKS5cclxuICAgICAgICB2YXIgbWF4VmVjdG9ycyA9IE1hdGgubWluKG51bUNvbEFic29yYmFuY2VzLCBudW1Db2xDb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgdmFyIG51bUxhdGVudFZlY3RvcnMgPSBNYXRoLmZsb29yKG1heFZlY3RvcnMgKiAwLjEpO1xyXG4gICAgICAgIGlmIChudW1MYXRlbnRWZWN0b3JzID09IDApIHtcclxuICAgICAgICAgICAgbnVtTGF0ZW50VmVjdG9ycyArPSAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gMDtcclxuICAgICAgICB3aGlsZSAobnVtTGF0ZW50VmVjdG9ycyA8PSBtYXhWZWN0b3JzICYmIGV4cGxhaW5lZFZhcmlhbmNlcyA8IDAuODUpIHtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wbHMoKTtcclxuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgICAgICBsYXRlbnRWZWN0b3JzOiBudW1MYXRlbnRWZWN0b3JzLFxyXG4gICAgICAgICAgICAgICAgdG9sZXJhbmNlOiAxZS01XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAvL0l0IGlzIHZlcnkgY2xlYW4gdG8gcmVwcnNlbnQgYWxsIGFic29yYmFuY2VzIGFzIGEgcm93LCBidXQtIGVhY2ggb25lIGNvbnNpZGVyZWRcclxuICAgICAgICAgICAgICAgIC8vYSB2YXJpYWJsZSBpbiBQTFMsIHRodXMgZWFjaCBvbmUgaGFzIGl0cyBvd24gcm93IChjb2x1bW5zIGRpZmZlcmVudGlhdGUgc2FtcGxlKVxyXG4gICAgICAgICAgICAgICAgLyp2YXIgYWJzb3JiYW5jZXNUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMpO1xyXG4gICAgICAgICAgICAgICAgYWJzb3JiYW5jZXNUcmFuc3Bvc2UgPSBhYnNvcmJhbmNlc1RyYW5zcG9zZS50cmFuc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgIHZhciBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgICAgICAgICBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSA9IGNvbmNlbnRyYXRpb25zVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coY29uY2VudHJhdGlvbnNUcmFuc3Bvc2UpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYWJzb3JiYW5jZXNUcmFuc3Bvc2UpO1xyXG4gICAgICAgICAgICAgICAgY2hlbW9BbGdvLnRyYWluKGFic29yYmFuY2VzVHJhbnNwb3NlLCBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSwgb3B0aW9ucyk7Ki9cclxuICAgICAgICAgICAgICAgIGNoZW1vQWxnby50cmFpbihjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMsIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucywgb3B0aW9ucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZXJyKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duVHJhaW5FcnJvcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBleHBsYWluZWRWYXJpYW5jZXMgPSBjaGVtb0FsZ28uZ2V0RXhwbGFpbmVkVmFyaWFuY2UoKTtcclxuICAgICAgICAgICAgaWYgKGV4cGxhaW5lZFZhcmlhbmNlcyA8IDAuODUpIHtcclxuICAgICAgICAgICAgICAgIG51bUxhdGVudFZlY3RvcnMrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjaGVtb0lzUGxzID0gdHJ1ZTtcclxuICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5zdWNjZXNzO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpblBjYSgpIHtcclxuICAgICAgICAvL0dldCBwcmluY2lwbGUgY29tcG9uZW50cyBhc3NvY2lhdGVkIHdpdGggdHJhaW5pbmcgc2V0IGFic29yYmFuY2VzIFguXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wY2EoY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsVW5rbm93blRyYWluRXJyb3I7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IDI7IC8vVGVtcG9yYXJ5LSAyIGNvbXBvbmVudHMgc28gdGhhdCB3ZSBjYW4gaGF2ZSB0aGUgeC15IG9mIGEgZ3JhcGhcclxuICAgICAgICAvL2NoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IGZsb29yKG51bUNvbEFic29yYmFuY2VzICogMC4xKTtcclxuICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gY2hlbW9BbGdvLmdldEV4cGxhaW5lZFZhcmlhbmNlKCk7XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgwLCBcIkxhdGVudCBWZWN0b3JzXCIsIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyk7XHJcbiAgICAgICAgLy9Ib3cgbWFueSB2ZWN0b3JzIHRvIGdldCB+ODUlIG9mIHZhcmlhbmNlP1xyXG4gICAgICAgIC8qY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IoMC44NSAvIGV4cGxhaW5lZFZhcmlhbmNlcyk7XHJcbiAgICAgICAgaWYgKGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9PSAwKSB7XHJcbiAgICAgICAgICAgIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyArPSAxO1xyXG4gICAgICAgIH0qL1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vQ2hlY2sgcGFyYW1ldGVyIHJlcXVpcmVtZW50c1xyXG4gICAgICAgICAgICBjaGVtb1BDQUNvbXByZXNzZWQgPSBjaGVtb0FsZ28ucHJvamVjdChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMsIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbFVua25vd25UcmFpbkVycm9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgbnVtUG9pbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkLmxlbmd0aDtcclxuICAgICAgICB2YXIgdGVtcHN0cmluZyA9IFwicHJvamVjdGVkXCI7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Qb2ludHM7ICsraSkge1xyXG4gICAgICAgICAgICBjb25zb2xlT3V0cHV0KDAsIHRlbXBzdHJpbmcuY29uY2F0KGkpLCBjaGVtb1BDQUNvbXByZXNzZWRbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5zdWNjZXNzO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpbihpc1F1YW50aWZ5KSB7XHJcbiAgICAgICAgY2hlbW9Jc1BscyA9IGlzUXVhbnRpZnk7XHJcbiAgICAgICAgaWYgKGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICAvL05vIHRyYWluaW5nIGRhdGEgbWVhbnMgbm8gc3VjY2VzcyAoYWxzbyBzb21ldGltZXMgd2UgdXNlIDB0aCByb3cgdG8gZmluZCBudW0gb2YgY29sKVxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbE5vVHJhaW5pbmdEYXRhIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgLy9UaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgY29uY2VudHJhdGlvbnMgZm9yIGV2ZXJ5IGFycmF5IG9mIGFic29yYmFuY2VzXHJcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogY2hlbW9GbGFncy5mYWlsVHJhaW5pbmdSb3dNaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aCAhPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0ubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIC8vV2UgZG9uJ3QgaGF2ZSBhIG5hbWUgZm9yIGVhY2ggbWF0ZXJpYWwgKENyeSlcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb3RFbm91Z2hMYWJlbHMgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgICAgIGlmIChpc1F1YW50aWZ5KSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ld1RyYWluUGxzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQgPSBuZXdUcmFpblBjYSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocmVzdWx0ID09IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG5ld0luZmVyUGxzKG1lYXN1cmVkQWJzb3JiYW5jZXMpIHtcclxuICAgICAgICBhbGVydChcIkVudGVyIElJXCIpO1xyXG4gICAgICAgIHZhciBpbmZlcnJlZCA9IFtdO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiQmVmb3JlIHRyYW5zcG9zZVwiKTtcclxuICAgICAgICAgICAgdmFyIG1hdEZvcm0gPSBbbWVhc3VyZWRBYnNvcmJhbmNlc107XHJcbiAgICAgICAgICAgIHZhciBtZWFzdXJlZFRyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KG1hdEZvcm0pO1xyXG4gICAgICAgICAgICBtZWFzdXJlZFRyYW5zcG9zZSA9IG1lYXN1cmVkVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICBhbGVydChcIkFmdGVyIHRyYW5zcG9zZVwiKTtcclxuICAgICAgICAgICAgaW5mZXJyZWQgPSBjaGVtb0FsZ28ucHJlZGljdChtYXRGb3JtKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coaW5mZXJyZWQpO1xyXG4gICAgICAgICAgICB2YXIgaW5mZXJyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChpbmZlcnJlZCk7XHJcbiAgICAgICAgICAgIGluZmVycmVkVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICBpbmZlcnJlZCA9IGluZmVycmVkVHJhbnNwb3NlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmZlcnJlZCk7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiQWZ0ZXIgSW5mZXJyZWRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgYWxlcnQoXCJSZWFsbHkgYmFkXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsVW5rbm93bkluZmVyZW5jZUVycm9yIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbmZlcnJlZC5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICBhbGVydChcIk5vIGxlbmd0aFwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbFVua25vd25JbmZlcmVuY2VFcnJvciB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaW5mZXJyZWRbMF0ubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL1RoZSBpbXBsZW1lbnRhdGlvbiBwcm92aWRlcyB0aGUgYmVzdCBhbnN3ZXIgZmlyc3RcclxuICAgICAgICB2YXIgaW5mZXJyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChpbmZlcnJlZCk7XHJcbiAgICAgICAgaW5mZXJyZWRUcmFuc3Bvc2UgPSBpbmZlcnJlZFRyYW5zcG9zZS50cmFuc3Bvc2UoKTtcclxuICAgICAgICB2YXIgYWxsQ29uY2VudHJhdGlvbnMgPSBpbmZlcnJlZFRyYW5zcG9zZVswXTtcclxuXHJcbiAgICAgICAgLy9GaW5kIHRoZSBjaGVtaWNhbCBuYW1lcyB3aGljaCBoYXZlIGJlZW4gZGV0ZWN0ZWQuXHJcbiAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgIHZhciBub25aZXJvQ29uY2VudHJhdGlvbnMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFsbENvbmNlbnRyYXRpb25zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICBsYWJlbHNbbGFiZWxzLmxlbmd0aF0gPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBub25aZXJvQ29uY2VudHJhdGlvbnNbbm9uWmVyb0NvbmNlbnRyYXRpb25zLmxlbmd0aF0gPSBhbGxDb25jZW50cmF0aW9uc1tpXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzIH07XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG5ld0luZmVyUGNhKG1lYXN1cmVkQWJzb3JiYW5jZXMpIHtcclxuICAgICAgICB2YXIgbWVhc3VyZWQgPSBbXTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAvL0FwcGVuZCBvYnNlcnZlZCBkYXRhIHRvIHRyYWluaW5nIGRhdGEgKHRlbXBvcmFyeSwgb2JzZXJ2ZWQgZGF0YSBpcyBOT1QgdHJhaW5pbmcgZGF0YSlcclxuICAgICAgICAgICAgdmFyIG1hdEZvcm0gPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMuc2xpY2UoMCk7XHJcbiAgICAgICAgICAgIG1hdEZvcm1bbWF0Rm9ybS5sZW5ndGhdID0gbWVhc3VyZWRBYnNvcmJhbmNlcztcclxuICAgICAgICAgICAgbWVhc3VyZWQgPSBjaGVtb0FsZ28ucHJvamVjdChtYXRGb3JtLCBjaGVtb051bUxhdGVudFZlY3RvcnMpO1xyXG4gICAgICAgICAgICBtZWFzdXJlZCA9IG1lYXN1cmVkW21lYXN1cmVkLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duSW5mZXJlbmNlRXJyb3IgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIlJlY2VudCBQb2ludFwiLCBtZWFzdXJlZCk7XHJcbiAgICAgICAgdmFyIGRpc3RhbmNlcyA9IFtdO1xyXG4gICAgICAgIHZhciBudW1Qb2ludHMgPSBjaGVtb1BDQUNvbXByZXNzZWQubGVuZ3RoO1xyXG4gICAgICAgIC8vYWxlcnQobnVtUG9pbnRzKTtcclxuICAgICAgICAvL2FsZXJ0KGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGVPdXRwdXQoMSwgXCJudW0gcG9pbnRzXCIsIG51bVBvaW50cyk7XHJcbiAgICAgICAgaWYgKG51bVBvaW50cyAhPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxJbmZlcmVuY2VSb3dNaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9OdW1MYXRlbnRWZWN0b3JzICE9IGNoZW1vUENBQ29tcHJlc3NlZFswXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbEluZmVyZW5jZUNvbHVtbk1pc21hdGNoIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBkaXN0YW5jZSA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIHN1bSA9IDA7XHJcbiAgICAgICAgICAgIHZhciBudW1Db21wb25lbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkW2ldLmxlbmd0aDtcclxuICAgICAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIm51bSBjb21wb25lbnRzXCIsIG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bUNvbXBvbmVudHM7ICsraikge1xyXG4gICAgICAgICAgICAgICAgLy8oeDEteDIpXjJcclxuICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnQgPSBtZWFzdXJlZFtqXSAtIGNoZW1vUENBQ29tcHJlc3NlZFtpXVtqXTtcclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudCA9IGNvbXBvbmVudCAqIGNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIHN1bSArPSBjb21wb25lbnQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9TcXVhcmUgcm9vdCBvZiBkaXN0YW5jZXMgc3F1YXJlZCBpcyB0aGUgZXVjbGlkZWFuIGRpc3RhbmNlIGZvcm11bGFcclxuICAgICAgICAgICAgc3VtID0gTWF0aC5zcXJ0KHN1bSk7XHJcbiAgICAgICAgICAgIGRpc3RhbmNlW2ldID0gc3VtO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL0xpbmVhciBzZWFyY2ggdG8gZmluZCBwb2ludCB3aXRoIG1pbmltdW0gZGlzdGFuY2UgZnJvbSBuZXcgb2JzZXJ2YXRpb25cclxuICAgICAgICB2YXIgbWluaW11bURpc3RhbmNlID0gZGlzdGFuY2VzWzBdO1xyXG4gICAgICAgIHZhciBtaW5pbXVtSW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGRpc3RhbmNlc1tpXSA8IG1pbmltdW1EaXN0YW5jZSkge1xyXG4gICAgICAgICAgICAgICAgbWluaW11bURpc3RhbmNlID0gZGlzdGFuY2VzW2ldO1xyXG4gICAgICAgICAgICAgICAgbWluaW11bUluZGV4ID0gaTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgY2xvc2VzdFNhbXBsZSA9IGNoZW1vU2FtcGxlTmFtZXNbbWluaW11bUluZGV4XTtcclxuICAgICAgICB2YXIgYWxsQ29uY2VudHJhdGlvbnMgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbbWluaW11bUluZGV4XTtcclxuICAgICAgICB2YXIgbGFiZWxzID0gW107XHJcbiAgICAgICAgdmFyIG5vblplcm9Db25jZW50cmF0aW9ucyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWxsQ29uY2VudHJhdGlvbnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGFsbENvbmNlbnRyYXRpb25zW2ldICE9IDApIHtcclxuICAgICAgICAgICAgICAgIGxhYmVsc1tsYWJlbHMubGVuZ3RoXSA9IGNoZW1vQ29uY2VudHJhdGlvbkxhYmVsc1tpXTtcclxuICAgICAgICAgICAgICAgIG5vblplcm9Db25jZW50cmF0aW9uc1tub25aZXJvQ29uY2VudHJhdGlvbnMubGVuZ3RoXSA9IGFsbENvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnNvbGVPdXRwdXQoMSwgXCJsYWJlbHNcIiwgbGFiZWxzKTtcclxuXHJcbiAgICAgICAgLy9OZXcgdmVyc2lvbiByZXR1cm5zIGEgbWF0cml4IHdpdGggdGhlIDJEIGNvb3JkaW5hdGVzIGZvciBldmVyeSBwb2ludCAodHJhaW5pbmdQb2ludHMpXHJcbiAgICAgICAgLy9BbmQgdGhlIGxhc3QgcG9pbnQgKHdoaWNoIHdhcyBqdXN0IGluZmVycmVkKSBpcyByZWNlbnRQb2ludC5cclxuICAgICAgICAvL3JldHVybiB7IGNvbXBvdW5kczogbGFiZWxzLCBjb25jZW50cmF0aW9uczogbm9uWmVyb0NvbmNlbnRyYXRpb25zLCBzdGF0dXM6IGNoZW1vRmxhZ3Muc3VjY2VzcyB9O1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHRyYWluaW5nUG9pbnRzOiBjaGVtb1BDQUNvbXByZXNzZWQsIHRyYWluaW5nU2FtcGxlTmFtZXM6IGNoZW1vU2FtcGxlTmFtZXMsIHJlY2VudFBvaW50OiBtZWFzdXJlZCxcclxuICAgICAgICAgICAgY2xvc2VzdFNhbXBsZTogY2xvc2VzdFNhbXBsZSwgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzXHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gbmV3SW5mZXIobWVhc3VyZWRBYnNvcmJhbmNlcykge1xyXG4gICAgICAgIC8vUmVwbGFjZSBOYU5zIHdpdGggMHMgaW4gdGhlIGFic29yYmFuY2VzXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtZWFzdXJlZEFic29yYmFuY2VzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChpc05hTihtZWFzdXJlZEFic29yYmFuY2VzW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgbWVhc3VyZWRBYnNvcmJhbmNlc1tpXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCFjaGVtb0lzVHJhaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsTm9UcmFpbmluZ0RhdGEgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG1lYXN1cmVkQWJzb3JiYW5jZXMubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlc1swXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbEFic29yYmFuY2VNaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICAgIGlmIChjaGVtb0lzUGxzKSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiRW50ZXJcIik7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ld0luZmVyUGxzKG1lYXN1cmVkQWJzb3JiYW5jZXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgLy9hbGVydChcIkh1aFwiKTtcclxuICAgICAgICAgICAgcmVzdWx0ID0gbmV3SW5mZXJQY2EobWVhc3VyZWRBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIHBjYVRlc3QoKSB7XHJcblxyXG4gICAgICAgIHZhciB0cmFpbk9iaiA9IHtcclxuICAgICAgICAgICAgXCJhYnNvcmJhbmNlXCI6IFtbLTAuNzY1NzczLCAtMC43NTUzNjIsIC0wLjc2NDkzNiwgLTAuNjkxMzk2NjY3LCAtMC43MTU3NjAzMzMsIC0wLjcxNDAxMTY2NywgLTAuNzI4OTg2MzMzLCAtMC42OTgzMjYzMzMsIC0wLjcwMzYwMTY2NywgLTAuNjYwNTE4NjY3LCAtMC42NjE1NDE2NjcsIC0wLjYzMTc4NTY2NyxcclxuICAgICAgICAgLTAuNjI1MDkzLCAtMC42MTc0Mjc2NjcsIC0wLjU5MTUzMiwgLTAuNTgxOTkzNjY3LCAtMC42MTUxNzE2NjcsIC0wLjU2MDY4OSwgLTAuNTU5MTYxLCAtMC41NTk0MDYsIC0wLjU2MjA2NjY2NywgLTAuNTUzNDQ1LCAtMC41NjUzMTgzMzMsIC0wLjU5MDI5MTY2NywgLTAuNTU5MjU0NjY3LFxyXG4gICAgICAgICAtMC41ODI0MjI2NjcsIC0wLjU3NjY2NiwgLTAuNTc5OTYxLCAtMC41NzU3MTYsIC0wLjU4MzkwMTY2NywgLTAuNTg5OTE4MzMzLCAtMC41ODY2OTIzMzMsIC0wLjYwOTU0NywgLTAuNjEyMjkxLCAtMC42MDA4NzQzMzMsIC0wLjYyOTEyOSwgLTAuNTg2Mzk1NjY3LCAtMC41OTU3Nzg2NjcsXHJcbiAgICAgICAgIC0wLjU3NDE5MTMzMywgLTAuNTc1MzAwNjY3LCAtMC41NzExMjUsIC0wLjU2MTg1NzY2NywgLTAuNTUxNzU3NjY3LCAtMC41NDU3MDQ2NjcsIC0wLjUzNzIzMywgLTAuNTE3OTM4LCAtMC41MTY2MDI2NjcsIC0wLjU1NDc5MDY2NywgLTAuNTI0Njc0NjY3LCAtMC41MjQ5NzczMzMsIC0wLjUzNTY2OSxcclxuICAgICAgICAgLTAuNTM3NzE2NjY3LCAtMC41MTk1NTE2NjcsIC0wLjUyNzM2NzY2NywgLTAuNTEwMzgxLCAtMC40OTkzNTQ2NjcsIC0wLjQ4NzYwMTMzMywgLTAuNDkzNjg0NjY3LCAtMC40MTc4OTUsIC0wLjQwOTc0NjY2NywgLTAuMzc1MjgyLCAtMC4zNTc2MjA2NjcsIC0wLjM1ODEyLCAtMC4zMzgwMDUzMzMsIC0wLjMyMjM2MzY2NyxcclxuICAgICAgICAgLTAuMzI4MjI0NjY3LCAtMC4zMjA4MjYsIC0wLjI5NTA4NiwgLTAuMjg5MzUyLCAtMC4yODUwOTU2NjcsIC0wLjI2NzcxMzMzMywgLTAuMjc1MTA3NjY3LCAtMC4yNzI5ODYzMzMsIC0wLjI4MjgwNDMzMywgLTAuMjcxNjEzNjY3LCAtMC4yODgxNTk2NjcsIC0wLjI5OTM4NywgLTAuMjg3NDAyLCAtMC4yOTA0NzU2NjcsXHJcbiAgICAgICAgIC0wLjI3MTA0MTY2NywgLTAuMzA0Nzg3LCAtMC4yODczMjIsIC0wLjI5NTYwMDY2NywgLTAuMjg3OTc5MzMzLCAtMC4yNjk2MzE2NjcsIC0wLjI3OTI3NjMzMywgLTAuMjY5NDAzMzMzLCAtMC4yNzAxNDI2NjcsIC0wLjI2Njk0LCAtMC4yNTAwMzYzMzMsIC0wLjI2NTcwMzY2NywgLTAuMjcwMDA1MzMzLCAtMC4yNTI0ODksXHJcbiAgICAgICAgIC0wLjI0NTI1MzMzMywgLTAuMjI3NDI2MzMzLCAtMC4yMjA4MTksIC0wLjIyODIyMSwgLTAuMjQyNjU3LCAtMC4yNDY0MTQ2NjcsIC0wLjIyNTcxMTMzMywgLTAuMjMxNzg3MzMzLCAtMC4yMjE1NDA2NjcsIC0wLjIyODE2NywgLTAuMTk0MzIsIC0wLjIxMTY1LCAtMC4xOTQ5MTQzMzMsIC0wLjE2OTAwOCwgLTAuMTc2NTc5LFxyXG4gICAgICAgICAtMC4xNDUwMzA2NjcsIC0wLjEzMTY5NiwgLTAuMTIxODA1MzMzLCAtMC4wOTY2NzgsIC0wLjEwMTg1NzY2NywgLTAuMDgwNzQ0LCAtMC4wNTA5MjYsIC0wLjAzNTUyNTMzMywgLTAuMDI0OTk3LCAtMC4wMjEyNTYzMzMsIC0wLjAwNDk0OCwgMC4wMjAwMzc2NjcsIDAuMDM2NDAxNjY3LCAwLjAyNDUwNDMzMywgMC4wNDQ0Mzg2NjcsXHJcbiAgICAgICAgIDAuMDQxODE1MzMzLCAwLjA2Mjc2MSwgMC4wOTUyMTIsIDAuMTE1Mzk3NjY3LCAwLjE2Mzk4NywgMC4xOTU2MzY2NjcsIDAuMjEyNDQ4MzMzLCAwLjIzNzEwMTMzMywgMC4yNjI5NjA2NjcsIDAuMjQxODk1NjY3LCAwLjI4MzQxMDY2NywgMC4yODczMzk2NjcsIDAuMzAxOTM3NjY3LCAwLjMxNTUzOCwgMC4zMjcxOTUzMzMsXHJcbiAgICAgICAgIDAuMzUwNzM2NjY3LCAwLjM0MzQ0NzMzMywgMC4zODY3NzgsIDAuMzk5Njg0MzMzLCAwLjM5NjA2NSwgMC4zODY3MDc2NjcsIDAuMzk1NDYsIDAuMzc0MTkzNjY3LCAwLjM4ODAxMDY2NywgMC4zNjU5NzQzMzMsIDAuMzIyNzEsIDAuMzE0MDQxNjY3LCAwLjI4NzM5NiwgMC4yNzc2MTI2NjcsIDAuMjc4ODIxMzMzLCAwLjI3OTc3OSxcclxuICAgICAgICAgMC4yNTc0MTAzMzMsIDAuMjY5MjQ1NjY3LCAwLjI5NzM0NzMzMywgMC4zMTA2NDIzMzMsIDAuMjk4ODg3NjY3LCAwLjI5MDg0OTMzMywgMC4yNzg4NTI2NjcsIDAuMjQxMzM5NjY3LCAwLjI0NTI2MDMzMywgMC4zMDkzNTQzMzMsIDAuMzA3NTUxNjY3LCAwLjM0MjA5MSwgMC4zMjMxNzgsIDAuMzM1Mjc2NjY3LCAwLjMyNDcxNCxcclxuICAgICAgICAgMC4zMzMwNTI2NjcsIDAuMjk4NDExLCAwLjI3NjA1NywgMC4yNTU4OTI2NjcsIDAuMjA1ODgsIDAuMTk4Njg3MzMzLCAwLjE0MDQxOCwgMC4yMDIxNDQzMzMsIDAuMTg1MzA2NjY3LCAwLjE5Mzc3MywgMC4xNTE1NTUzMzMsIDAuMTcwODM2NjY3LCAwLjE2NjI0MSwgMC4xNTAyNjUzMzMsIDAuMTY1ODkxNjY3LCAwLjE1MzIwMyxcclxuICAgICAgICAgMC4xNzE5Nzg2NjcsIDAuMTM1MDM1MzMzLCAwLjE3MTA1NjMzMywgMC4yMjYxOTMsIDAuMTcyMDE3LCAwLjI1MDg5NzY2NywgMC4yNzIyNTgzMzMsIDAuMTgxMzY1LCAwLjE2MzcwNzMzMywgMC4xNjM4NjQ2NjcsIDAuMTUxODMwMzMzLCAwLjE0OTQwNywgMC4xMDYzMjk2NjcsIDAuMDc4ODA5LCAwLjA3MDc0NixcclxuICAgICAgICAgMC4xMTE0OSwgMC4wMzg5NTkzMzMsIDAuMDgwODMxLCAwLjA5MTM3MDY2NywgMC4wNzUxMjA2NjcsIDAuMDA0NzUwMzMzLCAwLjAwMzQ4ODY2NywgMC4wNjc0NDkzMzMsIDAuMDM5MDk0NjY3LCAwLjEwMjAwMjY2NywgMC4wNTczMzMzMzMsIDAuMTYyMTI3MzMzLCAwLjI1MDI3NDMzMywgMC4wNzcxMDYzMzMsIDAuMjMzMzI0LFxyXG4gICAgICAgICAwLjI1NTMyMSwgMC4zNjI0MzgzMzMsIC0wLjA0OTIwMDMzMywgLTAuMDczMjgyMzMzLCAtMC40NzA0NDgsIC0wLjMxNDgyODUsIC0wLjkwNDY3NSwgLTAuNzE3MjU0LCAtMC44ODc1ODgsIDAsIDAsIDAsIDBdLFxyXG4gICAgICAgICBbLTAuMzQ2NDk0LCAtMC4zMzMwMTk2NjcsIC0wLjM0NTIwOTMzMywgLTAuMjczNDUwNjY3LCAtMC4yOTY2MTgsIC0wLjMxOTgwNjY2NywgLTAuMzU3OTk0NjY3LCAtMC4zNTkxOTQ2NjcsIC0wLjM5MDY3ODMzMywgLTAuMzUyMzUxMzMzLCAtMC4zNzUzNzUzMzMsIC0wLjM2NTI4MzY2NywgLTAuMzY3Nzg2LFxyXG4tMC4zNzczNDcsIC0wLjM2NDE1MDY2NywgLTAuMzYwOTM1MzMzLCAtMC4zOTE1NDkzMzMsIC0wLjM0MDQ3MSwgLTAuMzQzMTYyLCAtMC4zNTAyMzUzMzMsIC0wLjM1NDc5NjY2NywgLTAuMzQ1NzExNjY3LCAtMC4zNDM5MTQzMzMsIC0wLjM3NTI1MTMzMywgLTAuMzQwMzM1LCAtMC4zNTE0OTQ2NjcsIC0wLjM0MTQ4MjY2NyxcclxuLTAuMzQyOTU4NjY3LCAtMC4zMzUyOTcsIC0wLjMzNzAwNSwgLTAuMzQyNDQ1MzMzLCAtMC4zMzY0OTgsIC0wLjM1OTI4NDMzMywgLTAuMzU3MDY5NjY3LCAtMC4zNTY5NTEzMzMsIC0wLjM4MDYwMywgLTAuMzQyNzEzLCAtMC4zNTMxOTUsIC0wLjMzODQxNzMzMywgLTAuMzQ4MzY2NjY3LCAtMC4zNDQ5OTYzMzMsXHJcbi0wLjM0NTgxOCwgLTAuMzUwNjE5MzMzLCAtMC4zNDcyNjIzMzMsIC0wLjM1MTM5MDY2NywgLTAuMzM5NjU0NjY3LCAtMC4zNDM0ODQzMzMsIC0wLjM5MTQ5LCAtMC4zNjU2Nzk2NjcsIC0wLjM3NjY0MzMzMywgLTAuMzk1NTIzLCAtMC4zOTgxNTA2NjcsIC0wLjM3NDk3MzY2NywgLTAuMzkzMjA3LCAtMC4zODAyMTQ2NjcsXHJcbi0wLjM3MTI0OTMzMywgLTAuMzYxMzQ3LCAtMC4zNjczOTgzMzMsIC0wLjI4MDAwMywgLTAuMjUzNzEzNjY3LCAtMC4yMDI4NzQsIC0wLjE3NDUzMjMzMywgLTAuMTMzMzcxMzMzLCAtMC4wOTE2ODIsIC0wLjA0MTgyOTY2NywgLTAuMDE2NzIzNjY3LCAwLjAyMjY3MzY2NywgMC4xMDEzNTc2NjcsIDAuMTYxNjksXHJcbjAuMjM2Mzc1MzMzLCAwLjI5OTI3NTMzMywgMC4zNDYwNzYzMzMsIDAuMzc5NDA1LCAwLjM3NDU1OSwgMC40MDE0NTIsIDAuMzgwODc4NjY3LCAwLjM2MTYxNCwgMC4zODc3MTgsIDAuMzQ3NjM0LCAwLjMxMjc2OSwgMC4yMjk5NDQsIDAuMTk2NjYyMzMzLCAwLjEyODY2NTMzMywgMC4wNzg0OTUsIDAuMDM1MDg3LFxyXG4tMC4wMzg2MTUzMzMsIC0wLjA1OTQwNjY2NywgLTAuMTAwNjI3MzMzLCAtMC4xMjgyMTI2NjcsIC0wLjE0MzM4MjMzMywgLTAuMTk0OTY1MzMzLCAtMC4yMTA1NjcsIC0wLjIyMTQ3MTMzMywgLTAuMjM5MTA5MzMzLCAtMC4yNDQ0NTUsIC0wLjI1Njg1NDY2NywgLTAuMjc1NTA3MzMzLCAtMC4zMDI5ODczMzMsXHJcbi0wLjMxNzQ5MiwgLTAuMzA4MDA1NjY3LCAtMC4zMjEzNjcsIC0wLjMyNTcwODY2NywgLTAuMzQ0ODIwNjY3LCAtMC4zMjYyMzUzMzMsIC0wLjM1NjI4NSwgLTAuMzQ3MDU1NjY3LCAtMC4zNDA5MjIsIC0wLjM1ODMwMDY2NywgLTAuMzMxMjE4MzMzLCAtMC4zNDE3OTIsIC0wLjM0MzY5MSwgLTAuMzMwMTYzMzMzLFxyXG4tMC4zNDY1ODk2NjcsIC0wLjMyOTk1OSwgLTAuMzAzMjUyLCAtMC4yODI2ODgsIC0wLjI2MTgxMjY2NywgLTAuMjI1NDEsIC0wLjE3NzcxNTMzMywgLTAuMTE4MDQ0NjY3LCAtMC4wODAxMjQsIC0wLjAzNjQyNzY2NywgMC4wMjYxNTk2NjcsIDAuMDYwMzM4LCAwLjEyOTU0MiwgMC4xODA4MjMsIDAuMjEzODg1MzMzLFxyXG4wLjIyOTg3NDMzMywgMC4yNzE3MDc2NjcsIDAuMjI2NzI4NjY3LCAwLjIxMzc2MzY2NywgMC4yMjUyNzksIDAuMjIxNzU3LCAwLjI3MDMzMjY2NywgMC4yNzU1NzkzMzMsIDAuMjYwMTY2MzMzLCAwLjIyOTU5NzY2NywgMC4yMjk1OTI2NjcsIDAuMjEwOTIyLCAwLjE4OTE5MzY2NywgMC4xNzM2NTkzMzMsIDAuMTM4NTU0LFxyXG4wLjEyNDkwNTY2NywgMC4wOTQwODczMzMsIDAuMDc2MTU2NjY3LCAwLjAzMzk2OSwgMC4wMTk4Mzg2NjcsIC0wLjAwODAyNSwgLTAuMDQyODgxNjY3LCAtMC4wNjM3MzUsIC0wLjA4NDgwODMzMywgLTAuMDg3NjczMzMzLCAtMC4xMTI4ODksIC0wLjExNzczMDMzMywgLTAuMTQzMTkzLCAtMC4xNDAwMTY2NjcsXHJcbi0wLjEzODI4NDY2NywgLTAuMTM0ODc4NjY3LCAtMC4xNjM2NDg2NjcsIC0wLjE0MTA1NTY2NywgLTAuMTYwNTI5MzMzLCAtMC4xOTM1NDAzMzMsIC0wLjE5ODIwMTY2NywgLTAuMTc2MjI2MzMzLCAtMC4yMDk4MDMsIC0wLjE4NTc3MSwgLTAuMTg3NjI4MzMzLCAtMC4yMDEyMjk2NjcsIC0wLjIwNDMwNzMzMyxcclxuLTAuMjEwNDkzLCAtMC4yMzk3MzMsIC0wLjIzMDUzLCAtMC4yNjk5MDUsIC0wLjI2OTAzNjMzMywgLTAuMjgzMDc4MzMzLCAtMC4zMDM4NDEzMzMsIC0wLjI4MTk2ODMzMywgLTAuMjcyMDM1LCAtMC4yNTgwMjksIC0wLjI4MjA0MjMzMywgLTAuMjkwMDY2NjY3LCAtMC4yODA0OTQ2NjcsIC0wLjI4MzE2MTMzMyxcclxuLTAuMjc0MjIzMzMzLCAtMC4yODAxOTYsIC0wLjIzNjEwMSwgLTAuMjY2MTQyNjY3LCAtMC4yMzMzMzU2NjcsIC0wLjIyODgyMjY2NywgLTAuMjU2MjY2LCAtMC4yMTYzOTEzMzMsIC0wLjIwMjUyNjMzMywgLTAuMjU2MjkwMzMzLCAtMC4yMzcxMjEsIC0wLjI0NDU0NCwgLTAuMjUzMDcyLCAtMC4xODUzOTUsXHJcbi0wLjI1Njk1NCwgLTAuMjE1MTk5LCAtMC4yMDYxOTIzMzMsIC0wLjE3NjM3OCwgLTAuMjEwNzkzLCAtMC4xMTIzNTcsIC0wLjA2MjE3OTMzMywgLTAuMDc1NTA5MzMzLCAtMC4wOTM5OTUsIC0wLjAzMzM3LCAwLjAwODgwNDMzMywgLTAuMDM5ODkwMzMzLCAwLjExNzg0MzMzMywgMC4wMjQwNTYsIDAuMTEyMTk5MzMzLFxyXG4wLjEzOTk1OSwgMC4wMjg2MDg2NjcsIDAuMjAzNjA1NjY3LCAwLjEyOTc3NDY2NywgMC4yMzcwOTE2NjcsIDAuMTgzNzY1MzMzLCAtMC4xMDQzMzc2NjcsIC0wLjM3NjY3MTUsIC0wLjQ0NDc2OCwgLTAuNjk2MDg1NSwgLTAuNDU5Mjg1NSwgLTAuNzIyNjY2LCAwLCAwLCAwLFxyXG4wLCBdXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFwiY29uY2VudHJhdGlvblwiOiBbWzEsIDBdLCBbMCwgMV1dLFxyXG4gICAgICAgICAgICBcImNvbmNlbnRyYXRpb25MYWJlbHNcIjogW1wiU2tpbSBNaWxrXCIsIFwiT2xpdmUgT2lsXCJdXHJcbiAgICAgICAgfTtcclxuICAgICAgICB1cGRhdGVEYXRhKHRyYWluT2JqLmFic29yYmFuY2VbMF0sIFswLjI1LDAuNzVdLCBbXCJBXCIsXCJCXCJdLCBcIlNhbXBsZSAxXCIpO1xyXG4gICAgICAgIHVwZGF0ZURhdGEodHJhaW5PYmouYWJzb3JiYW5jZVsxXSwgWzAuNjYsMC4zM10sIFtcIkNcIiwgXCJEXCJdLCBcIlNhbXBsZSAyXCIpO1xyXG4gICAgICAgIHZhciBkZXRlY3RlZEFic29yYmFuY2VzID0gWy0wLjc2NTc3MywgLTAuNzU1MzYyLCAtMC43NjQ5MzYsIC0wLjY5MTM5NjY2NywgLTAuNzE1NzYwMzMzLCAtMC43MTQwMTE2NjcsIC0wLjcyODk4NjMzMywgLTAuNjk4MzI2MzMzLCAtMC43MDM2MDE2NjcsIC0wLjY2MDUxODY2NywgLTAuNjYxNTQxNjY3LCAtMC42MzE3ODU2NjcsXHJcbiAgICAgICAgICAgICAgICAgLTAuNjI1MDkzLCAtMC42MTc0Mjc2NjcsIC0wLjU5MTUzMiwgLTAuNTgxOTkzNjY3LCAtMC42MTUxNzE2NjcsIC0wLjU2MDY4OSwgLTAuNTU5MTYxLCAtMC41NTk0MDYsIC0wLjU2MjA2NjY2NywgLTAuNTUzNDQ1LCAtMC41NjUzMTgzMzMsIC0wLjU5MDI5MTY2NywgLTAuNTU5MjU0NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjU4MjQyMjY2NywgLTAuNTc2NjY2LCAtMC41Nzk5NjEsIC0wLjU3NTcxNiwgLTAuNTgzOTAxNjY3LCAtMC41ODk5MTgzMzMsIC0wLjU4NjY5MjMzMywgLTAuNjA5NTQ3LCAtMC42MTIyOTEsIC0wLjYwMDg3NDMzMywgLTAuNjI5MTI5LCAtMC41ODYzOTU2NjcsIC0wLjU5NTc3ODY2NyxcclxuICAgICAgICAgICAgICAgICAtMC41NzQxOTEzMzMsIC0wLjU3NTMwMDY2NywgLTAuNTcxMTI1LCAtMC41NjE4NTc2NjcsIC0wLjU1MTc1NzY2NywgLTAuNTQ1NzA0NjY3LCAtMC41MzcyMzMsIC0wLjUxNzkzOCwgLTAuNTE2NjAyNjY3LCAtMC41NTQ3OTA2NjcsIC0wLjUyNDY3NDY2NywgLTAuNTI0OTc3MzMzLCAtMC41MzU2NjksXHJcbiAgICAgICAgICAgICAgICAgLTAuNTM3NzE2NjY3LCAtMC41MTk1NTE2NjcsIC0wLjUyNzM2NzY2NywgLTAuNTEwMzgxLCAtMC40OTkzNTQ2NjcsIC0wLjQ4NzYwMTMzMywgLTAuNDkzNjg0NjY3LCAtMC40MTc4OTUsIC0wLjQwOTc0NjY2NywgLTAuMzc1MjgyLCAtMC4zNTc2MjA2NjcsIC0wLjM1ODEyLCAtMC4zMzgwMDUzMzMsIC0wLjMyMjM2MzY2NyxcclxuICAgICAgICAgICAgICAgICAtMC4zMjgyMjQ2NjcsIC0wLjMyMDgyNiwgLTAuMjk1MDg2LCAtMC4yODkzNTIsIC0wLjI4NTA5NTY2NywgLTAuMjY3NzEzMzMzLCAtMC4yNzUxMDc2NjcsIC0wLjI3Mjk4NjMzMywgLTAuMjgyODA0MzMzLCAtMC4yNzE2MTM2NjcsIC0wLjI4ODE1OTY2NywgLTAuMjk5Mzg3LCAtMC4yODc0MDIsIC0wLjI5MDQ3NTY2NyxcclxuICAgICAgICAgICAgICAgICAtMC4yNzEwNDE2NjcsIC0wLjMwNDc4NywgLTAuMjg3MzIyLCAtMC4yOTU2MDA2NjcsIC0wLjI4Nzk3OTMzMywgLTAuMjY5NjMxNjY3LCAtMC4yNzkyNzYzMzMsIC0wLjI2OTQwMzMzMywgLTAuMjcwMTQyNjY3LCAtMC4yNjY5NCwgLTAuMjUwMDM2MzMzLCAtMC4yNjU3MDM2NjcsIC0wLjI3MDAwNTMzMywgLTAuMjUyNDg5LFxyXG4gICAgICAgICAgICAgICAgIC0wLjI0NTI1MzMzMywgLTAuMjI3NDI2MzMzLCAtMC4yMjA4MTksIC0wLjIyODIyMSwgLTAuMjQyNjU3LCAtMC4yNDY0MTQ2NjcsIC0wLjIyNTcxMTMzMywgLTAuMjMxNzg3MzMzLCAtMC4yMjE1NDA2NjcsIC0wLjIyODE2NywgLTAuMTk0MzIsIC0wLjIxMTY1LCAtMC4xOTQ5MTQzMzMsIC0wLjE2OTAwOCwgLTAuMTc2NTc5LFxyXG4gICAgICAgICAgICAgICAgIC0wLjE0NTAzMDY2NywgLTAuMTMxNjk2LCAtMC4xMjE4MDUzMzMsIC0wLjA5NjY3OCwgLTAuMTAxODU3NjY3LCAtMC4wODA3NDQsIC0wLjA1MDkyNiwgLTAuMDM1NTI1MzMzLCAtMC4wMjQ5OTcsIC0wLjAyMTI1NjMzMywgLTAuMDA0OTQ4LCAwLjAyMDAzNzY2NywgMC4wMzY0MDE2NjcsIDAuMDI0NTA0MzMzLCAwLjA0NDQzODY2NyxcclxuICAgICAgICAgICAgICAgICAwLjA0MTgxNTMzMywgMC4wNjI3NjEsIDAuMDk1MjEyLCAwLjExNTM5NzY2NywgMC4xNjM5ODcsIDAuMTk1NjM2NjY3LCAwLjIxMjQ0ODMzMywgMC4yMzcxMDEzMzMsIDAuMjYyOTYwNjY3LCAwLjI0MTg5NTY2NywgMC4yODM0MTA2NjcsIDAuMjg3MzM5NjY3LCAwLjMwMTkzNzY2NywgMC4zMTU1MzgsIDAuMzI3MTk1MzMzLFxyXG4gICAgICAgICAgICAgICAgIDAuMzUwNzM2NjY3LCAwLjM0MzQ0NzMzMywgMC4zODY3NzgsIDAuMzk5Njg0MzMzLCAwLjM5NjA2NSwgMC4zODY3MDc2NjcsIDAuMzk1NDYsIDAuMzc0MTkzNjY3LCAwLjM4ODAxMDY2NywgMC4zNjU5NzQzMzMsIDAuMzIyNzEsIDAuMzE0MDQxNjY3LCAwLjI4NzM5NiwgMC4yNzc2MTI2NjcsIDAuMjc4ODIxMzMzLCAwLjI3OTc3OSxcclxuICAgICAgICAgICAgICAgICAwLjI1NzQxMDMzMywgMC4yNjkyNDU2NjcsIDAuMjk3MzQ3MzMzLCAwLjMxMDY0MjMzMywgMC4yOTg4ODc2NjcsIDAuMjkwODQ5MzMzLCAwLjI3ODg1MjY2NywgMC4yNDEzMzk2NjcsIDAuMjQ1MjYwMzMzLCAwLjMwOTM1NDMzMywgMC4zMDc1NTE2NjcsIDAuMzQyMDkxLCAwLjMyMzE3OCwgMC4zMzUyNzY2NjcsIDAuMzI0NzE0LFxyXG4gICAgICAgICAgICAgICAgIDAuMzMzMDUyNjY3LCAwLjI5ODQxMSwgMC4yNzYwNTcsIDAuMjU1ODkyNjY3LCAwLjIwNTg4LCAwLjE5ODY4NzMzMywgMC4xNDA0MTgsIDAuMjAyMTQ0MzMzLCAwLjE4NTMwNjY2NywgMC4xOTM3NzMsIDAuMTUxNTU1MzMzLCAwLjE3MDgzNjY2NywgMC4xNjYyNDEsIDAuMTUwMjY1MzMzLCAwLjE2NTg5MTY2NywgMC4xNTMyMDMsXHJcbiAgICAgICAgICAgICAgICAgMC4xNzE5Nzg2NjcsIDAuMTM1MDM1MzMzLCAwLjE3MTA1NjMzMywgMC4yMjYxOTMsIDAuMTcyMDE3LCAwLjI1MDg5NzY2NywgMC4yNzIyNTgzMzMsIDAuMTgxMzY1LCAwLjE2MzcwNzMzMywgMC4xNjM4NjQ2NjcsIDAuMTUxODMwMzMzLCAwLjE0OTQwNywgMC4xMDYzMjk2NjcsIDAuMDc4ODA5LCAwLjA3MDc0NixcclxuICAgICAgICAgICAgICAgICAwLjExMTQ5LCAwLjAzODk1OTMzMywgMC4wODA4MzEsIDAuMDkxMzcwNjY3LCAwLjA3NTEyMDY2NywgMC4wMDQ3NTAzMzMsIDAuMDAzNDg4NjY3LCAwLjA2NzQ0OTMzMywgMC4wMzkwOTQ2NjcsIDAuMTAyMDAyNjY3LCAwLjA1NzMzMzMzMywgMC4xNjIxMjczMzMsIDAuMjUwMjc0MzMzLCAwLjA3NzEwNjMzMywgMC4yMzMzMjQsXHJcbiAgICAgICAgICAgICAgICAgMC4yNTUzMjEsIDAuMzYyNDM4MzMzLCAtMC4wNDkyMDAzMzMsIC0wLjA3MzI4MjMzMywgLTAuNDcwNDQ4LCAtMC4zMTQ4Mjg1LCAtMC45MDQ2NzUsIC0wLjcxNzI1NCwgLTAuODg3NTg4LCAwLCAwLCAwLCAwXTtcclxuXHJcbiAgICAgICAgYWxlcnQoXCJQQ0EgdGVzdCBjb21tZW5jZVwiKTtcclxuXHJcbiAgICAgICAgLy9SZXN1bHRzIG9mIHRyYWluP1xyXG4gICAgICAgIHZhciByZXRUcmFpbiA9IG5ld1RyYWluKGZhbHNlKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIlRyYWluaW5nIFN0YXR1czogXCIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGZsYWdUb1N0cmluZyhyZXRUcmFpbikpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGNoZW1vUENBQ29tcHJlc3NlZC5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGNoZW1vUENBQ29tcHJlc3NlZFswXS5sZW5ndGgpO1xyXG4gICAgICAgIGlmIChyZXRUcmFpbiA9PSBjaGVtb0ZsYWdzLnN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgLy9JbmZlciwgbm8gc2F2ZVxyXG4gICAgICAgICAgICB2YXIgcmV0SW5mZXIgPSBuZXdJbmZlcihkZXRlY3RlZEFic29yYmFuY2VzKTtcclxuICAgICAgICAgICAgLy9yZXN1bHRzIG9mIGluZmVyP1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkluZmVyIFN0YXR1czogXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhmbGFnVG9TdHJpbmcocmV0SW5mZXIuc3RhdHVzKSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAvL0lmIHdlIGRpZG4ndCBmYWlsLCBwcmludCBhbGwgcmVzdWx0cy5cclxuICAgICAgICAgICAgaWYgKHJldEluZmVyLnN0YXR1cyA9PSBjaGVtb0ZsYWdzLnN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTGFiZWxzIG9mIGNsb3Nlc3QgcG9pbnQ6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmV0SW5mZXIuY29tcG91bmRzKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJDb25jZW50cmF0aW9ucyBvbiBjbG9zZXN0IHBvaW50OlxcblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLmNvbmNlbnRyYXRpb25zKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJQb2ludHM6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bVBvaW50cyA9IHJldEluZmVyLnRyYWluaW5nUG9pbnRzLmxlbmd0aDsgXHJcbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPTA7aTxudW1Qb2ludHM7KytpKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLnRyYWluaW5nUG9pbnRzW2ldKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlxcblwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTY2FubmVkIFBvaW50OlxcblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLnJlY2VudFBvaW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJDbG9zZXN0IFNhbXBsZTpcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXRJbmZlci5jbG9zZXN0U2FtcGxlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gcGxzVGVzdCgpIHtcclxuICAgICAgICB2YXIgdHJhaW5PYmogPSB7XHJcbiAgICAgICAgICAgIFwiYWJzb3JiYW5jZVwiOiBbWy0wLjc2NTc3MywgLTAuNzU1MzYyLCAtMC43NjQ5MzYsIC0wLjY5MTM5NjY2NywgLTAuNzE1NzYwMzMzLCAtMC43MTQwMTE2NjcsIC0wLjcyODk4NjMzMywgLTAuNjk4MzI2MzMzLCAtMC43MDM2MDE2NjcsIC0wLjY2MDUxODY2NywgLTAuNjYxNTQxNjY3LCAtMC42MzE3ODU2NjcsXHJcbiAgICAgICAgIC0wLjYyNTA5MywgLTAuNjE3NDI3NjY3LCAtMC41OTE1MzIsIC0wLjU4MTk5MzY2NywgLTAuNjE1MTcxNjY3LCAtMC41NjA2ODksIC0wLjU1OTE2MSwgLTAuNTU5NDA2LCAtMC41NjIwNjY2NjcsIC0wLjU1MzQ0NSwgLTAuNTY1MzE4MzMzLCAtMC41OTAyOTE2NjcsIC0wLjU1OTI1NDY2NyxcclxuICAgICAgICAgLTAuNTgyNDIyNjY3LCAtMC41NzY2NjYsIC0wLjU3OTk2MSwgLTAuNTc1NzE2LCAtMC41ODM5MDE2NjcsIC0wLjU4OTkxODMzMywgLTAuNTg2NjkyMzMzLCAtMC42MDk1NDcsIC0wLjYxMjI5MSwgLTAuNjAwODc0MzMzLCAtMC42MjkxMjksIC0wLjU4NjM5NTY2NywgLTAuNTk1Nzc4NjY3LFxyXG4gICAgICAgICAtMC41NzQxOTEzMzMsIC0wLjU3NTMwMDY2NywgLTAuNTcxMTI1LCAtMC41NjE4NTc2NjcsIC0wLjU1MTc1NzY2NywgLTAuNTQ1NzA0NjY3LCAtMC41MzcyMzMsIC0wLjUxNzkzOCwgLTAuNTE2NjAyNjY3LCAtMC41NTQ3OTA2NjcsIC0wLjUyNDY3NDY2NywgLTAuNTI0OTc3MzMzLCAtMC41MzU2NjksXHJcbiAgICAgICAgIC0wLjUzNzcxNjY2NywgLTAuNTE5NTUxNjY3LCAtMC41MjczNjc2NjcsIC0wLjUxMDM4MSwgLTAuNDk5MzU0NjY3LCAtMC40ODc2MDEzMzMsIC0wLjQ5MzY4NDY2NywgLTAuNDE3ODk1LCAtMC40MDk3NDY2NjcsIC0wLjM3NTI4MiwgLTAuMzU3NjIwNjY3LCAtMC4zNTgxMiwgLTAuMzM4MDA1MzMzLCAtMC4zMjIzNjM2NjcsXHJcbiAgICAgICAgIC0wLjMyODIyNDY2NywgLTAuMzIwODI2LCAtMC4yOTUwODYsIC0wLjI4OTM1MiwgLTAuMjg1MDk1NjY3LCAtMC4yNjc3MTMzMzMsIC0wLjI3NTEwNzY2NywgLTAuMjcyOTg2MzMzLCAtMC4yODI4MDQzMzMsIC0wLjI3MTYxMzY2NywgLTAuMjg4MTU5NjY3LCAtMC4yOTkzODcsIC0wLjI4NzQwMiwgLTAuMjkwNDc1NjY3LFxyXG4gICAgICAgICAtMC4yNzEwNDE2NjcsIC0wLjMwNDc4NywgLTAuMjg3MzIyLCAtMC4yOTU2MDA2NjcsIC0wLjI4Nzk3OTMzMywgLTAuMjY5NjMxNjY3LCAtMC4yNzkyNzYzMzMsIC0wLjI2OTQwMzMzMywgLTAuMjcwMTQyNjY3LCAtMC4yNjY5NCwgLTAuMjUwMDM2MzMzLCAtMC4yNjU3MDM2NjcsIC0wLjI3MDAwNTMzMywgLTAuMjUyNDg5LFxyXG4gICAgICAgICAtMC4yNDUyNTMzMzMsIC0wLjIyNzQyNjMzMywgLTAuMjIwODE5LCAtMC4yMjgyMjEsIC0wLjI0MjY1NywgLTAuMjQ2NDE0NjY3LCAtMC4yMjU3MTEzMzMsIC0wLjIzMTc4NzMzMywgLTAuMjIxNTQwNjY3LCAtMC4yMjgxNjcsIC0wLjE5NDMyLCAtMC4yMTE2NSwgLTAuMTk0OTE0MzMzLCAtMC4xNjkwMDgsIC0wLjE3NjU3OSxcclxuICAgICAgICAgLTAuMTQ1MDMwNjY3LCAtMC4xMzE2OTYsIC0wLjEyMTgwNTMzMywgLTAuMDk2Njc4LCAtMC4xMDE4NTc2NjcsIC0wLjA4MDc0NCwgLTAuMDUwOTI2LCAtMC4wMzU1MjUzMzMsIC0wLjAyNDk5NywgLTAuMDIxMjU2MzMzLCAtMC4wMDQ5NDgsIDAuMDIwMDM3NjY3LCAwLjAzNjQwMTY2NywgMC4wMjQ1MDQzMzMsIDAuMDQ0NDM4NjY3LFxyXG4gICAgICAgICAwLjA0MTgxNTMzMywgMC4wNjI3NjEsIDAuMDk1MjEyLCAwLjExNTM5NzY2NywgMC4xNjM5ODcsIDAuMTk1NjM2NjY3LCAwLjIxMjQ0ODMzMywgMC4yMzcxMDEzMzMsIDAuMjYyOTYwNjY3LCAwLjI0MTg5NTY2NywgMC4yODM0MTA2NjcsIDAuMjg3MzM5NjY3LCAwLjMwMTkzNzY2NywgMC4zMTU1MzgsIDAuMzI3MTk1MzMzLFxyXG4gICAgICAgICAwLjM1MDczNjY2NywgMC4zNDM0NDczMzMsIDAuMzg2Nzc4LCAwLjM5OTY4NDMzMywgMC4zOTYwNjUsIDAuMzg2NzA3NjY3LCAwLjM5NTQ2LCAwLjM3NDE5MzY2NywgMC4zODgwMTA2NjcsIDAuMzY1OTc0MzMzLCAwLjMyMjcxLCAwLjMxNDA0MTY2NywgMC4yODczOTYsIDAuMjc3NjEyNjY3LCAwLjI3ODgyMTMzMywgMC4yNzk3NzksXHJcbiAgICAgICAgIDAuMjU3NDEwMzMzLCAwLjI2OTI0NTY2NywgMC4yOTczNDczMzMsIDAuMzEwNjQyMzMzLCAwLjI5ODg4NzY2NywgMC4yOTA4NDkzMzMsIDAuMjc4ODUyNjY3LCAwLjI0MTMzOTY2NywgMC4yNDUyNjAzMzMsIDAuMzA5MzU0MzMzLCAwLjMwNzU1MTY2NywgMC4zNDIwOTEsIDAuMzIzMTc4LCAwLjMzNTI3NjY2NywgMC4zMjQ3MTQsXHJcbiAgICAgICAgIDAuMzMzMDUyNjY3LCAwLjI5ODQxMSwgMC4yNzYwNTcsIDAuMjU1ODkyNjY3LCAwLjIwNTg4LCAwLjE5ODY4NzMzMywgMC4xNDA0MTgsIDAuMjAyMTQ0MzMzLCAwLjE4NTMwNjY2NywgMC4xOTM3NzMsIDAuMTUxNTU1MzMzLCAwLjE3MDgzNjY2NywgMC4xNjYyNDEsIDAuMTUwMjY1MzMzLCAwLjE2NTg5MTY2NywgMC4xNTMyMDMsXHJcbiAgICAgICAgIDAuMTcxOTc4NjY3LCAwLjEzNTAzNTMzMywgMC4xNzEwNTYzMzMsIDAuMjI2MTkzLCAwLjE3MjAxNywgMC4yNTA4OTc2NjcsIDAuMjcyMjU4MzMzLCAwLjE4MTM2NSwgMC4xNjM3MDczMzMsIDAuMTYzODY0NjY3LCAwLjE1MTgzMDMzMywgMC4xNDk0MDcsIDAuMTA2MzI5NjY3LCAwLjA3ODgwOSwgMC4wNzA3NDYsXHJcbiAgICAgICAgIDAuMTExNDksIDAuMDM4OTU5MzMzLCAwLjA4MDgzMSwgMC4wOTEzNzA2NjcsIDAuMDc1MTIwNjY3LCAwLjAwNDc1MDMzMywgMC4wMDM0ODg2NjcsIDAuMDY3NDQ5MzMzLCAwLjAzOTA5NDY2NywgMC4xMDIwMDI2NjcsIDAuMDU3MzMzMzMzLCAwLjE2MjEyNzMzMywgMC4yNTAyNzQzMzMsIDAuMDc3MTA2MzMzLCAwLjIzMzMyNCxcclxuICAgICAgICAgMC4yNTUzMjEsIDAuMzYyNDM4MzMzLCAtMC4wNDkyMDAzMzMsIC0wLjA3MzI4MjMzMywgLTAuNDcwNDQ4LCAtMC4zMTQ4Mjg1LCAtMC45MDQ2NzUsIC0wLjcxNzI1NCwgLTAuODg3NTg4LCAwLCAwLCAwLCAwXSxcclxuICAgICAgICAgWy0wLjM0NjQ5NCwgLTAuMzMzMDE5NjY3LCAtMC4zNDUyMDkzMzMsIC0wLjI3MzQ1MDY2NywgLTAuMjk2NjE4LCAtMC4zMTk4MDY2NjcsIC0wLjM1Nzk5NDY2NywgLTAuMzU5MTk0NjY3LCAtMC4zOTA2NzgzMzMsIC0wLjM1MjM1MTMzMywgLTAuMzc1Mzc1MzMzLCAtMC4zNjUyODM2NjcsIC0wLjM2Nzc4NixcclxuLTAuMzc3MzQ3LCAtMC4zNjQxNTA2NjcsIC0wLjM2MDkzNTMzMywgLTAuMzkxNTQ5MzMzLCAtMC4zNDA0NzEsIC0wLjM0MzE2MiwgLTAuMzUwMjM1MzMzLCAtMC4zNTQ3OTY2NjcsIC0wLjM0NTcxMTY2NywgLTAuMzQzOTE0MzMzLCAtMC4zNzUyNTEzMzMsIC0wLjM0MDMzNSwgLTAuMzUxNDk0NjY3LCAtMC4zNDE0ODI2NjcsXHJcbi0wLjM0Mjk1ODY2NywgLTAuMzM1Mjk3LCAtMC4zMzcwMDUsIC0wLjM0MjQ0NTMzMywgLTAuMzM2NDk4LCAtMC4zNTkyODQzMzMsIC0wLjM1NzA2OTY2NywgLTAuMzU2OTUxMzMzLCAtMC4zODA2MDMsIC0wLjM0MjcxMywgLTAuMzUzMTk1LCAtMC4zMzg0MTczMzMsIC0wLjM0ODM2NjY2NywgLTAuMzQ0OTk2MzMzLFxyXG4tMC4zNDU4MTgsIC0wLjM1MDYxOTMzMywgLTAuMzQ3MjYyMzMzLCAtMC4zNTEzOTA2NjcsIC0wLjMzOTY1NDY2NywgLTAuMzQzNDg0MzMzLCAtMC4zOTE0OSwgLTAuMzY1Njc5NjY3LCAtMC4zNzY2NDMzMzMsIC0wLjM5NTUyMywgLTAuMzk4MTUwNjY3LCAtMC4zNzQ5NzM2NjcsIC0wLjM5MzIwNywgLTAuMzgwMjE0NjY3LFxyXG4tMC4zNzEyNDkzMzMsIC0wLjM2MTM0NywgLTAuMzY3Mzk4MzMzLCAtMC4yODAwMDMsIC0wLjI1MzcxMzY2NywgLTAuMjAyODc0LCAtMC4xNzQ1MzIzMzMsIC0wLjEzMzM3MTMzMywgLTAuMDkxNjgyLCAtMC4wNDE4Mjk2NjcsIC0wLjAxNjcyMzY2NywgMC4wMjI2NzM2NjcsIDAuMTAxMzU3NjY3LCAwLjE2MTY5LFxyXG4wLjIzNjM3NTMzMywgMC4yOTkyNzUzMzMsIDAuMzQ2MDc2MzMzLCAwLjM3OTQwNSwgMC4zNzQ1NTksIDAuNDAxNDUyLCAwLjM4MDg3ODY2NywgMC4zNjE2MTQsIDAuMzg3NzE4LCAwLjM0NzYzNCwgMC4zMTI3NjksIDAuMjI5OTQ0LCAwLjE5NjY2MjMzMywgMC4xMjg2NjUzMzMsIDAuMDc4NDk1LCAwLjAzNTA4NyxcclxuLTAuMDM4NjE1MzMzLCAtMC4wNTk0MDY2NjcsIC0wLjEwMDYyNzMzMywgLTAuMTI4MjEyNjY3LCAtMC4xNDMzODIzMzMsIC0wLjE5NDk2NTMzMywgLTAuMjEwNTY3LCAtMC4yMjE0NzEzMzMsIC0wLjIzOTEwOTMzMywgLTAuMjQ0NDU1LCAtMC4yNTY4NTQ2NjcsIC0wLjI3NTUwNzMzMywgLTAuMzAyOTg3MzMzLFxyXG4tMC4zMTc0OTIsIC0wLjMwODAwNTY2NywgLTAuMzIxMzY3LCAtMC4zMjU3MDg2NjcsIC0wLjM0NDgyMDY2NywgLTAuMzI2MjM1MzMzLCAtMC4zNTYyODUsIC0wLjM0NzA1NTY2NywgLTAuMzQwOTIyLCAtMC4zNTgzMDA2NjcsIC0wLjMzMTIxODMzMywgLTAuMzQxNzkyLCAtMC4zNDM2OTEsIC0wLjMzMDE2MzMzMyxcclxuLTAuMzQ2NTg5NjY3LCAtMC4zMjk5NTksIC0wLjMwMzI1MiwgLTAuMjgyNjg4LCAtMC4yNjE4MTI2NjcsIC0wLjIyNTQxLCAtMC4xNzc3MTUzMzMsIC0wLjExODA0NDY2NywgLTAuMDgwMTI0LCAtMC4wMzY0Mjc2NjcsIDAuMDI2MTU5NjY3LCAwLjA2MDMzOCwgMC4xMjk1NDIsIDAuMTgwODIzLCAwLjIxMzg4NTMzMyxcclxuMC4yMjk4NzQzMzMsIDAuMjcxNzA3NjY3LCAwLjIyNjcyODY2NywgMC4yMTM3NjM2NjcsIDAuMjI1Mjc5LCAwLjIyMTc1NywgMC4yNzAzMzI2NjcsIDAuMjc1NTc5MzMzLCAwLjI2MDE2NjMzMywgMC4yMjk1OTc2NjcsIDAuMjI5NTkyNjY3LCAwLjIxMDkyMiwgMC4xODkxOTM2NjcsIDAuMTczNjU5MzMzLCAwLjEzODU1NCxcclxuMC4xMjQ5MDU2NjcsIDAuMDk0MDg3MzMzLCAwLjA3NjE1NjY2NywgMC4wMzM5NjksIDAuMDE5ODM4NjY3LCAtMC4wMDgwMjUsIC0wLjA0Mjg4MTY2NywgLTAuMDYzNzM1LCAtMC4wODQ4MDgzMzMsIC0wLjA4NzY3MzMzMywgLTAuMTEyODg5LCAtMC4xMTc3MzAzMzMsIC0wLjE0MzE5MywgLTAuMTQwMDE2NjY3LFxyXG4tMC4xMzgyODQ2NjcsIC0wLjEzNDg3ODY2NywgLTAuMTYzNjQ4NjY3LCAtMC4xNDEwNTU2NjcsIC0wLjE2MDUyOTMzMywgLTAuMTkzNTQwMzMzLCAtMC4xOTgyMDE2NjcsIC0wLjE3NjIyNjMzMywgLTAuMjA5ODAzLCAtMC4xODU3NzEsIC0wLjE4NzYyODMzMywgLTAuMjAxMjI5NjY3LCAtMC4yMDQzMDczMzMsXHJcbi0wLjIxMDQ5MywgLTAuMjM5NzMzLCAtMC4yMzA1MywgLTAuMjY5OTA1LCAtMC4yNjkwMzYzMzMsIC0wLjI4MzA3ODMzMywgLTAuMzAzODQxMzMzLCAtMC4yODE5NjgzMzMsIC0wLjI3MjAzNSwgLTAuMjU4MDI5LCAtMC4yODIwNDIzMzMsIC0wLjI5MDA2NjY2NywgLTAuMjgwNDk0NjY3LCAtMC4yODMxNjEzMzMsXHJcbi0wLjI3NDIyMzMzMywgLTAuMjgwMTk2LCAtMC4yMzYxMDEsIC0wLjI2NjE0MjY2NywgLTAuMjMzMzM1NjY3LCAtMC4yMjg4MjI2NjcsIC0wLjI1NjI2NiwgLTAuMjE2MzkxMzMzLCAtMC4yMDI1MjYzMzMsIC0wLjI1NjI5MDMzMywgLTAuMjM3MTIxLCAtMC4yNDQ1NDQsIC0wLjI1MzA3MiwgLTAuMTg1Mzk1LFxyXG4tMC4yNTY5NTQsIC0wLjIxNTE5OSwgLTAuMjA2MTkyMzMzLCAtMC4xNzYzNzgsIC0wLjIxMDc5MywgLTAuMTEyMzU3LCAtMC4wNjIxNzkzMzMsIC0wLjA3NTUwOTMzMywgLTAuMDkzOTk1LCAtMC4wMzMzNywgMC4wMDg4MDQzMzMsIC0wLjAzOTg5MDMzMywgMC4xMTc4NDMzMzMsIDAuMDI0MDU2LCAwLjExMjE5OTMzMyxcclxuMC4xMzk5NTksIDAuMDI4NjA4NjY3LCAwLjIwMzYwNTY2NywgMC4xMjk3NzQ2NjcsIDAuMjM3MDkxNjY3LCAwLjE4Mzc2NTMzMywgLTAuMTA0MzM3NjY3LCAtMC4zNzY2NzE1LCAtMC40NDQ3NjgsIC0wLjY5NjA4NTUsIC0wLjQ1OTI4NTUsIC0wLjcyMjY2NiwgMCwgMCwgMCxcclxuMCwgXVxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImNvbmNlbnRyYXRpb25cIjogW1sxLCAwXSwgWzAsIDFdXSxcclxuICAgICAgICAgICAgXCJjb25jZW50cmF0aW9uTGFiZWxzXCI6IFtcIlNraW0gTWlsa1wiLCBcIk9saXZlIE9pbFwiXVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHZhciBkZXRlY3RlZEFic29yYmFuY2VzID0gWy0wLjc2NTc3MywgLTAuNzU1MzYyLCAtMC43NjQ5MzYsIC0wLjY5MTM5NjY2NywgLTAuNzE1NzYwMzMzLCAtMC43MTQwMTE2NjcsIC0wLjcyODk4NjMzMywgLTAuNjk4MzI2MzMzLCAtMC43MDM2MDE2NjcsIC0wLjY2MDUxODY2NywgLTAuNjYxNTQxNjY3LCAtMC42MzE3ODU2NjcsXHJcbiAgICAgICAgICAgICAgICAgLTAuNjI1MDkzLCAtMC42MTc0Mjc2NjcsIC0wLjU5MTUzMiwgLTAuNTgxOTkzNjY3LCAtMC42MTUxNzE2NjcsIC0wLjU2MDY4OSwgLTAuNTU5MTYxLCAtMC41NTk0MDYsIC0wLjU2MjA2NjY2NywgLTAuNTUzNDQ1LCAtMC41NjUzMTgzMzMsIC0wLjU5MDI5MTY2NywgLTAuNTU5MjU0NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjU4MjQyMjY2NywgLTAuNTc2NjY2LCAtMC41Nzk5NjEsIC0wLjU3NTcxNiwgLTAuNTgzOTAxNjY3LCAtMC41ODk5MTgzMzMsIC0wLjU4NjY5MjMzMywgLTAuNjA5NTQ3LCAtMC42MTIyOTEsIC0wLjYwMDg3NDMzMywgLTAuNjI5MTI5LCAtMC41ODYzOTU2NjcsIC0wLjU5NTc3ODY2NyxcclxuICAgICAgICAgICAgICAgICAtMC41NzQxOTEzMzMsIC0wLjU3NTMwMDY2NywgLTAuNTcxMTI1LCAtMC41NjE4NTc2NjcsIC0wLjU1MTc1NzY2NywgLTAuNTQ1NzA0NjY3LCAtMC41MzcyMzMsIC0wLjUxNzkzOCwgLTAuNTE2NjAyNjY3LCAtMC41NTQ3OTA2NjcsIC0wLjUyNDY3NDY2NywgLTAuNTI0OTc3MzMzLCAtMC41MzU2NjksXHJcbiAgICAgICAgICAgICAgICAgLTAuNTM3NzE2NjY3LCAtMC41MTk1NTE2NjcsIC0wLjUyNzM2NzY2NywgLTAuNTEwMzgxLCAtMC40OTkzNTQ2NjcsIC0wLjQ4NzYwMTMzMywgLTAuNDkzNjg0NjY3LCAtMC40MTc4OTUsIC0wLjQwOTc0NjY2NywgLTAuMzc1MjgyLCAtMC4zNTc2MjA2NjcsIC0wLjM1ODEyLCAtMC4zMzgwMDUzMzMsIC0wLjMyMjM2MzY2NyxcclxuICAgICAgICAgICAgICAgICAtMC4zMjgyMjQ2NjcsIC0wLjMyMDgyNiwgLTAuMjk1MDg2LCAtMC4yODkzNTIsIC0wLjI4NTA5NTY2NywgLTAuMjY3NzEzMzMzLCAtMC4yNzUxMDc2NjcsIC0wLjI3Mjk4NjMzMywgLTAuMjgyODA0MzMzLCAtMC4yNzE2MTM2NjcsIC0wLjI4ODE1OTY2NywgLTAuMjk5Mzg3LCAtMC4yODc0MDIsIC0wLjI5MDQ3NTY2NyxcclxuICAgICAgICAgICAgICAgICAtMC4yNzEwNDE2NjcsIC0wLjMwNDc4NywgLTAuMjg3MzIyLCAtMC4yOTU2MDA2NjcsIC0wLjI4Nzk3OTMzMywgLTAuMjY5NjMxNjY3LCAtMC4yNzkyNzYzMzMsIC0wLjI2OTQwMzMzMywgLTAuMjcwMTQyNjY3LCAtMC4yNjY5NCwgLTAuMjUwMDM2MzMzLCAtMC4yNjU3MDM2NjcsIC0wLjI3MDAwNTMzMywgLTAuMjUyNDg5LFxyXG4gICAgICAgICAgICAgICAgIC0wLjI0NTI1MzMzMywgLTAuMjI3NDI2MzMzLCAtMC4yMjA4MTksIC0wLjIyODIyMSwgLTAuMjQyNjU3LCAtMC4yNDY0MTQ2NjcsIC0wLjIyNTcxMTMzMywgLTAuMjMxNzg3MzMzLCAtMC4yMjE1NDA2NjcsIC0wLjIyODE2NywgLTAuMTk0MzIsIC0wLjIxMTY1LCAtMC4xOTQ5MTQzMzMsIC0wLjE2OTAwOCwgLTAuMTc2NTc5LFxyXG4gICAgICAgICAgICAgICAgIC0wLjE0NTAzMDY2NywgLTAuMTMxNjk2LCAtMC4xMjE4MDUzMzMsIC0wLjA5NjY3OCwgLTAuMTAxODU3NjY3LCAtMC4wODA3NDQsIC0wLjA1MDkyNiwgLTAuMDM1NTI1MzMzLCAtMC4wMjQ5OTcsIC0wLjAyMTI1NjMzMywgLTAuMDA0OTQ4LCAwLjAyMDAzNzY2NywgMC4wMzY0MDE2NjcsIDAuMDI0NTA0MzMzLCAwLjA0NDQzODY2NyxcclxuICAgICAgICAgICAgICAgICAwLjA0MTgxNTMzMywgMC4wNjI3NjEsIDAuMDk1MjEyLCAwLjExNTM5NzY2NywgMC4xNjM5ODcsIDAuMTk1NjM2NjY3LCAwLjIxMjQ0ODMzMywgMC4yMzcxMDEzMzMsIDAuMjYyOTYwNjY3LCAwLjI0MTg5NTY2NywgMC4yODM0MTA2NjcsIDAuMjg3MzM5NjY3LCAwLjMwMTkzNzY2NywgMC4zMTU1MzgsIDAuMzI3MTk1MzMzLFxyXG4gICAgICAgICAgICAgICAgIDAuMzUwNzM2NjY3LCAwLjM0MzQ0NzMzMywgMC4zODY3NzgsIDAuMzk5Njg0MzMzLCAwLjM5NjA2NSwgMC4zODY3MDc2NjcsIDAuMzk1NDYsIDAuMzc0MTkzNjY3LCAwLjM4ODAxMDY2NywgMC4zNjU5NzQzMzMsIDAuMzIyNzEsIDAuMzE0MDQxNjY3LCAwLjI4NzM5NiwgMC4yNzc2MTI2NjcsIDAuMjc4ODIxMzMzLCAwLjI3OTc3OSxcclxuICAgICAgICAgICAgICAgICAwLjI1NzQxMDMzMywgMC4yNjkyNDU2NjcsIDAuMjk3MzQ3MzMzLCAwLjMxMDY0MjMzMywgMC4yOTg4ODc2NjcsIDAuMjkwODQ5MzMzLCAwLjI3ODg1MjY2NywgMC4yNDEzMzk2NjcsIDAuMjQ1MjYwMzMzLCAwLjMwOTM1NDMzMywgMC4zMDc1NTE2NjcsIDAuMzQyMDkxLCAwLjMyMzE3OCwgMC4zMzUyNzY2NjcsIDAuMzI0NzE0LFxyXG4gICAgICAgICAgICAgICAgIDAuMzMzMDUyNjY3LCAwLjI5ODQxMSwgMC4yNzYwNTcsIDAuMjU1ODkyNjY3LCAwLjIwNTg4LCAwLjE5ODY4NzMzMywgMC4xNDA0MTgsIDAuMjAyMTQ0MzMzLCAwLjE4NTMwNjY2NywgMC4xOTM3NzMsIDAuMTUxNTU1MzMzLCAwLjE3MDgzNjY2NywgMC4xNjYyNDEsIDAuMTUwMjY1MzMzLCAwLjE2NTg5MTY2NywgMC4xNTMyMDMsXHJcbiAgICAgICAgICAgICAgICAgMC4xNzE5Nzg2NjcsIDAuMTM1MDM1MzMzLCAwLjE3MTA1NjMzMywgMC4yMjYxOTMsIDAuMTcyMDE3LCAwLjI1MDg5NzY2NywgMC4yNzIyNTgzMzMsIDAuMTgxMzY1LCAwLjE2MzcwNzMzMywgMC4xNjM4NjQ2NjcsIDAuMTUxODMwMzMzLCAwLjE0OTQwNywgMC4xMDYzMjk2NjcsIDAuMDc4ODA5LCAwLjA3MDc0NixcclxuICAgICAgICAgICAgICAgICAwLjExMTQ5LCAwLjAzODk1OTMzMywgMC4wODA4MzEsIDAuMDkxMzcwNjY3LCAwLjA3NTEyMDY2NywgMC4wMDQ3NTAzMzMsIDAuMDAzNDg4NjY3LCAwLjA2NzQ0OTMzMywgMC4wMzkwOTQ2NjcsIDAuMTAyMDAyNjY3LCAwLjA1NzMzMzMzMywgMC4xNjIxMjczMzMsIDAuMjUwMjc0MzMzLCAwLjA3NzEwNjMzMywgMC4yMzMzMjQsXHJcbiAgICAgICAgICAgICAgICAgMC4yNTUzMjEsIDAuMzYyNDM4MzMzLCAtMC4wNDkyMDAzMzMsIC0wLjA3MzI4MjMzMywgLTAuNDcwNDQ4LCAtMC4zMTQ4Mjg1LCAtMC45MDQ2NzUsIC0wLjcxNzI1NCwgLTAuODg3NTg4LCAwLCAwLCAwLCAwXTtcclxuXHJcbiAgICAgICAgYWxlcnQoXCJQTFMgdGVzdCBjb21tZW5jZVwiKTtcclxuXHJcbiAgICAgICAgdmFyIHRyYWluUmVzdWx0ID0gbmV3VHJhaW4odHJ1ZSwgdHJhaW5PYmouYWJzb3JiYW5jZSwgdHJhaW5PYmouY29uY2VudHJhdGlvbiwgdHJhaW5PYmouY29uY2VudHJhdGlvbkxhYmVscyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJUcmFpbmluZyBTdGF0dXM6IFwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhmbGFnVG9TdHJpbmcodHJhaW5SZXN1bHQpKTtcclxuICAgICAgICBpZih0cmFpblJlc3VsdD09Y2hlbW9GbGFncy5zdWNjZXNzKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdmFyIGluZmVyUmVzdWx0ID0gbmV3SW5mZXIoZGV0ZWN0ZWRBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiSW5mZXIgU3RhdHVzOiBcIik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGZsYWdUb1N0cmluZyhpbmZlclJlc3VsdC5zdGF0dXMpKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgIGlmKGluZmVyUmVzdWx0LnN0YXR1cz09Y2hlbW9GbGFncy5zdWNjZXNzKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkxhYmVscyBvZiBub24temVybyBjaGVtczpcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpbmZlclJlc3VsdC5jb21wb3VuZHMpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJub24temVybyBjaGVtczpcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpbmZlclJlc3VsdC5jb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBvcmllbnRMYWJlbHMobGFiZWxzLCBjb25jZW50cmF0aW9ucylcclxuICAgIHtcclxuICAgICAgICB2YXIgbnVtTGFiZWxzT2xkID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aDtcclxuICAgICAgICB2YXIgY3VycmVudEVuZCA9IG51bUxhYmVsc09sZDtcclxuICAgICAgICB2YXIgbnVtTm90Rm91bmQgPSAwO1xyXG4gICAgICAgIC8vRm9yIGVhY2ggaW5kZXggaSBvZiBsb2NhdGlvbkFyciwgdGFrZSBpdGggaW5kZXggb2YgbGFiZWxzIGFuZCBwdXQgaXQgYXQgbG9jYXRpb25BcnJbaV1cclxuICAgICAgICB2YXIgbG9jYXRpb25BcnIgPSBbXTtcclxuICAgICAgICAvL0ZvciBlYWNoIGxhYmVsLCBsb29rIGZvciBpdCBpbiB0aGUgcHJldmlvdXMgbGFiZWxzLlxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGFiZWxzLmxlbmd0aDsgKytpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdmFyIG5vdEZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgLy9sb29rIGZvciBleGlzdGluZyBsYWJlbFxyXG4gICAgICAgICAgICBmb3IodmFyIGogPSAwOyBqPG51bUxhYmVsc09sZDsgKytqKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvL0lmIGV4aXN0cywgcG9pbnQgaW5kZXggaSB0byBpbmRleCBqXHJcbiAgICAgICAgICAgICAgICBpZihsYWJlbHNbaV09PWNoZW1vQ29uY2VudHJhdGlvbkxhYmVsc1tqXSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltpXSA9IGo7XHJcbiAgICAgICAgICAgICAgICAgICAgbm90Rm91bmQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0lmIG5vdCBmb3VuZCwgcG9pbnQgaW5kZXggaSB0byB0aGUgZW5kIG9mIG9sZCBsYWJlbCBhcnJheVxyXG4gICAgICAgICAgICAvL2FuZCBhZGQgbmV3IGxhYmVsIHRvIG9sZCBsYWJlbCBhcnJheVxyXG4gICAgICAgICAgICBpZihub3RGb3VuZClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdmFyIG5leHRMYWJlbCA9IGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbbmV4dExhYmVsXSA9IGxhYmVsc1tpXTtcclxuICAgICAgICAgICAgICAgIGxvY2F0aW9uQXJyW2ldID0gbmV4dExhYmVsO1xyXG4gICAgICAgICAgICAgICAgbnVtTm90Rm91bmQgKz0gMTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL1Rha2UgdGhlIGNvbmNlbnRyYXRpb25zIHdlIGFyZSBhZGRpbmcgYW5kIHVzZSBsb2NhdGlvbiBhcnJheVxyXG4gICAgICAgIC8vdG8gbW92ZSB0aGUgY29uY2VudHJhdGlvbnMgYXJlIGFwcHJvcHJpYXRlbHkuIDBzIGZvciBjb25jZW50cmF0aW9ucyB0aGF0IGRvbid0IGV4aXN0LlxyXG4gICAgICAgIHZhciBuZXdDb25jZW50cmF0aW9ucyA9IFtdO1xyXG4gICAgICAgIHZhciB0b3RhbEVsZW0gPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMubGVuZ3RoO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG90YWxFbGVtOyArK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBuZXdDb25jZW50cmF0aW9uc1tuZXdDb25jZW50cmF0aW9ucy5sZW5ndGhdID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaTxsb2NhdGlvbkFyci5sZW5ndGg7KytpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbmV3Q29uY2VudHJhdGlvbnNbbG9jYXRpb25BcnJbaV1dID0gY29uY2VudHJhdGlvbnNbaV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vSG93IG1hbnkgbmV3IGNoZW1pY2FscyBmb3VuZD9cclxuICAgICAgICB2YXIgYWRkaXRpb25hbFplcm9lcyA9IFtdO1xyXG4gICAgICAgIGZvcih2YXIgaSA9IDA7aTxudW1Ob3RGb3VuZDsrK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBhZGRpdGlvbmFsWmVyb2VzW2ldID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9PdXIgb2xkIHNhbXBsZXMgaGF2ZSBub25lIG9mIHRoZXNlIG5ldyBjaGVtaWNhbHMuXHJcbiAgICAgICAgdmFyIG51bVNhbXBsZXMgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnMubGVuZ3RoO1xyXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGk8IG51bVNhbXBsZXM7KytpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2ldID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2ldLmNvbmNhdChhZGRpdGlvbmFsWmVyb2VzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9BZGQgbmV3IHNhbXBsZS5cclxuICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbbnVtU2FtcGxlc10gPSBuZXdDb25jZW50cmF0aW9ucztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVEYXRhKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9ucywgbGFiZWxzLCBzYW1wbGVOYW1lKSB7XHJcbiAgICAgICAgLy9SZXBsYWNlIE5hTnMgd2l0aCAwcyBpbiB0aGUgYWJzb3JiYW5jZXMgYW5kIGFkZCBhYnNvcmJhbmNlcy5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFic29yYmFuY2VzLmxlbmd0aDsgKytpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYoaXNOYU4oYWJzb3JiYW5jZXNbaV0pKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBhYnNvcmJhbmNlc1tpXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy9BZGQgYSBuZXcgcm93IHRvIGFic29yYmFuY2VzXHJcbiAgICAgICAgdmFyIG5leHRBYnNvcmJhbmNlSW5kZXggPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoO1xyXG4gICAgICAgIGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlc1tuZXh0QWJzb3JiYW5jZUluZGV4XSA9IGFic29yYmFuY2VzO1xyXG4gICAgICAgIGlmKGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGg9PTApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0gPSBjb25jZW50cmF0aW9ucztcclxuICAgICAgICAgICAgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzPWxhYmVscztcclxuICAgICAgICAgICAgY2hlbW9TYW1wbGVOYW1lc1swXT1zYW1wbGVOYW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB2YXIgbmV4dFNhbXBsZU5hbWUgPSBjaGVtb1NhbXBsZU5hbWVzLmxlbmd0aDtcclxuICAgICAgICAgICAgY2hlbW9TYW1wbGVOYW1lc1tuZXh0U2FtcGxlTmFtZV0gPSBzYW1wbGVOYW1lO1xyXG4gICAgICAgICAgICBvcmllbnRMYWJlbHMobGFiZWxzLCBjb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVUZXN0KCkge1xyXG4gICAgICAgIHZhciB0cmFpbk9iaiA9IHtcclxuICAgICAgICAgICAgXCJhYnNvcmJhbmNlXCI6IFtbLTAuNzY1NzczLCAtMC43NTUzNjIsIC0wLjc2NDkzNiwgLTAuNjkxMzk2NjY3LCAtMC43MTU3NjAzMzMsIC0wLjcxNDAxMTY2NywgLTAuNzI4OTg2MzMzLCAtMC42OTgzMjYzMzMsIC0wLjcwMzYwMTY2NywgLTAuNjYwNTE4NjY3LCAtMC42NjE1NDE2NjcsIC0wLjYzMTc4NTY2NyxcclxuICAgICAgICAgLTAuNjI1MDkzLCAtMC42MTc0Mjc2NjcsIC0wLjU5MTUzMiwgLTAuNTgxOTkzNjY3LCAtMC42MTUxNzE2NjcsIC0wLjU2MDY4OSwgLTAuNTU5MTYxLCAtMC41NTk0MDYsIC0wLjU2MjA2NjY2NywgLTAuNTUzNDQ1LCAtMC41NjUzMTgzMzMsIC0wLjU5MDI5MTY2NywgLTAuNTU5MjU0NjY3LFxyXG4gICAgICAgICAtMC41ODI0MjI2NjcsIC0wLjU3NjY2NiwgLTAuNTc5OTYxLCAtMC41NzU3MTYsIC0wLjU4MzkwMTY2NywgLTAuNTg5OTE4MzMzLCAtMC41ODY2OTIzMzMsIC0wLjYwOTU0NywgLTAuNjEyMjkxLCAtMC42MDA4NzQzMzMsIC0wLjYyOTEyOSwgLTAuNTg2Mzk1NjY3LCAtMC41OTU3Nzg2NjcsXHJcbiAgICAgICAgIC0wLjU3NDE5MTMzMywgLTAuNTc1MzAwNjY3LCAtMC41NzExMjUsIC0wLjU2MTg1NzY2NywgLTAuNTUxNzU3NjY3LCAtMC41NDU3MDQ2NjcsIC0wLjUzNzIzMywgLTAuNTE3OTM4LCAtMC41MTY2MDI2NjcsIC0wLjU1NDc5MDY2NywgLTAuNTI0Njc0NjY3LCAtMC41MjQ5NzczMzMsIC0wLjUzNTY2OSxcclxuICAgICAgICAgLTAuNTM3NzE2NjY3LCAtMC41MTk1NTE2NjcsIC0wLjUyNzM2NzY2NywgLTAuNTEwMzgxLCAtMC40OTkzNTQ2NjcsIC0wLjQ4NzYwMTMzMywgLTAuNDkzNjg0NjY3LCAtMC40MTc4OTUsIC0wLjQwOTc0NjY2NywgLTAuMzc1MjgyLCAtMC4zNTc2MjA2NjcsIC0wLjM1ODEyLCAtMC4zMzgwMDUzMzMsIC0wLjMyMjM2MzY2NyxcclxuICAgICAgICAgLTAuMzI4MjI0NjY3LCAtMC4zMjA4MjYsIC0wLjI5NTA4NiwgLTAuMjg5MzUyLCAtMC4yODUwOTU2NjcsIC0wLjI2NzcxMzMzMywgLTAuMjc1MTA3NjY3LCAtMC4yNzI5ODYzMzMsIC0wLjI4MjgwNDMzMywgLTAuMjcxNjEzNjY3LCAtMC4yODgxNTk2NjcsIC0wLjI5OTM4NywgLTAuMjg3NDAyLCAtMC4yOTA0NzU2NjcsXHJcbiAgICAgICAgIC0wLjI3MTA0MTY2NywgLTAuMzA0Nzg3LCAtMC4yODczMjIsIC0wLjI5NTYwMDY2NywgLTAuMjg3OTc5MzMzLCAtMC4yNjk2MzE2NjcsIC0wLjI3OTI3NjMzMywgLTAuMjY5NDAzMzMzLCAtMC4yNzAxNDI2NjcsIC0wLjI2Njk0LCAtMC4yNTAwMzYzMzMsIC0wLjI2NTcwMzY2NywgLTAuMjcwMDA1MzMzLCAtMC4yNTI0ODksXHJcbiAgICAgICAgIC0wLjI0NTI1MzMzMywgLTAuMjI3NDI2MzMzLCAtMC4yMjA4MTksIC0wLjIyODIyMSwgLTAuMjQyNjU3LCAtMC4yNDY0MTQ2NjcsIC0wLjIyNTcxMTMzMywgLTAuMjMxNzg3MzMzLCAtMC4yMjE1NDA2NjcsIC0wLjIyODE2NywgLTAuMTk0MzIsIC0wLjIxMTY1LCAtMC4xOTQ5MTQzMzMsIC0wLjE2OTAwOCwgLTAuMTc2NTc5LFxyXG4gICAgICAgICAtMC4xNDUwMzA2NjcsIC0wLjEzMTY5NiwgLTAuMTIxODA1MzMzLCAtMC4wOTY2NzgsIC0wLjEwMTg1NzY2NywgLTAuMDgwNzQ0LCAtMC4wNTA5MjYsIC0wLjAzNTUyNTMzMywgLTAuMDI0OTk3LCAtMC4wMjEyNTYzMzMsIC0wLjAwNDk0OCwgMC4wMjAwMzc2NjcsIDAuMDM2NDAxNjY3LCAwLjAyNDUwNDMzMywgMC4wNDQ0Mzg2NjcsXHJcbiAgICAgICAgIDAuMDQxODE1MzMzLCAwLjA2Mjc2MSwgMC4wOTUyMTIsIDAuMTE1Mzk3NjY3LCAwLjE2Mzk4NywgMC4xOTU2MzY2NjcsIDAuMjEyNDQ4MzMzLCAwLjIzNzEwMTMzMywgMC4yNjI5NjA2NjcsIDAuMjQxODk1NjY3LCAwLjI4MzQxMDY2NywgMC4yODczMzk2NjcsIDAuMzAxOTM3NjY3LCAwLjMxNTUzOCwgMC4zMjcxOTUzMzMsXHJcbiAgICAgICAgIDAuMzUwNzM2NjY3LCAwLjM0MzQ0NzMzMywgMC4zODY3NzgsIDAuMzk5Njg0MzMzLCAwLjM5NjA2NSwgMC4zODY3MDc2NjcsIDAuMzk1NDYsIDAuMzc0MTkzNjY3LCAwLjM4ODAxMDY2NywgMC4zNjU5NzQzMzMsIDAuMzIyNzEsIDAuMzE0MDQxNjY3LCAwLjI4NzM5NiwgMC4yNzc2MTI2NjcsIDAuMjc4ODIxMzMzLCAwLjI3OTc3OSxcclxuICAgICAgICAgMC4yNTc0MTAzMzMsIDAuMjY5MjQ1NjY3LCAwLjI5NzM0NzMzMywgMC4zMTA2NDIzMzMsIDAuMjk4ODg3NjY3LCAwLjI5MDg0OTMzMywgMC4yNzg4NTI2NjcsIDAuMjQxMzM5NjY3LCAwLjI0NTI2MDMzMywgMC4zMDkzNTQzMzMsIDAuMzA3NTUxNjY3LCAwLjM0MjA5MSwgMC4zMjMxNzgsIDAuMzM1Mjc2NjY3LCAwLjMyNDcxNCxcclxuICAgICAgICAgMC4zMzMwNTI2NjcsIDAuMjk4NDExLCAwLjI3NjA1NywgMC4yNTU4OTI2NjcsIDAuMjA1ODgsIDAuMTk4Njg3MzMzLCAwLjE0MDQxOCwgMC4yMDIxNDQzMzMsIDAuMTg1MzA2NjY3LCAwLjE5Mzc3MywgMC4xNTE1NTUzMzMsIDAuMTcwODM2NjY3LCAwLjE2NjI0MSwgMC4xNTAyNjUzMzMsIDAuMTY1ODkxNjY3LCAwLjE1MzIwMyxcclxuICAgICAgICAgMC4xNzE5Nzg2NjcsIDAuMTM1MDM1MzMzLCAwLjE3MTA1NjMzMywgMC4yMjYxOTMsIDAuMTcyMDE3LCAwLjI1MDg5NzY2NywgMC4yNzIyNTgzMzMsIDAuMTgxMzY1LCAwLjE2MzcwNzMzMywgMC4xNjM4NjQ2NjcsIDAuMTUxODMwMzMzLCAwLjE0OTQwNywgMC4xMDYzMjk2NjcsIDAuMDc4ODA5LCAwLjA3MDc0NixcclxuICAgICAgICAgMC4xMTE0OSwgMC4wMzg5NTkzMzMsIDAuMDgwODMxLCAwLjA5MTM3MDY2NywgMC4wNzUxMjA2NjcsIDAuMDA0NzUwMzMzLCAwLjAwMzQ4ODY2NywgMC4wNjc0NDkzMzMsIDAuMDM5MDk0NjY3LCAwLjEwMjAwMjY2NywgMC4wNTczMzMzMzMsIDAuMTYyMTI3MzMzLCAwLjI1MDI3NDMzMywgMC4wNzcxMDYzMzMsIDAuMjMzMzI0LFxyXG4gICAgICAgICAwLjI1NTMyMSwgMC4zNjI0MzgzMzMsIC0wLjA0OTIwMDMzMywgLTAuMDczMjgyMzMzLCAtMC40NzA0NDgsIC0wLjMxNDgyODUsIC0wLjkwNDY3NSwgLTAuNzE3MjU0LCAtMC44ODc1ODgsIFwiTkFNRT9cIiwgXCJWQUxVRT9cIiwgXCJOQU1FP1wiLCBcIlZBTFVFP1wiXSxcclxuICAgICAgICAgWy0wLjM0NjQ5NCwgLTAuMzMzMDE5NjY3LCAtMC4zNDUyMDkzMzMsIC0wLjI3MzQ1MDY2NywgLTAuMjk2NjE4LCAtMC4zMTk4MDY2NjcsIC0wLjM1Nzk5NDY2NywgLTAuMzU5MTk0NjY3LCAtMC4zOTA2NzgzMzMsIC0wLjM1MjM1MTMzMywgLTAuMzc1Mzc1MzMzLCAtMC4zNjUyODM2NjcsIC0wLjM2Nzc4NixcclxuLTAuMzc3MzQ3LCAtMC4zNjQxNTA2NjcsIC0wLjM2MDkzNTMzMywgLTAuMzkxNTQ5MzMzLCAtMC4zNDA0NzEsIC0wLjM0MzE2MiwgLTAuMzUwMjM1MzMzLCAtMC4zNTQ3OTY2NjcsIC0wLjM0NTcxMTY2NywgLTAuMzQzOTE0MzMzLCAtMC4zNzUyNTEzMzMsIC0wLjM0MDMzNSwgLTAuMzUxNDk0NjY3LCAtMC4zNDE0ODI2NjcsXHJcbi0wLjM0Mjk1ODY2NywgLTAuMzM1Mjk3LCAtMC4zMzcwMDUsIC0wLjM0MjQ0NTMzMywgLTAuMzM2NDk4LCAtMC4zNTkyODQzMzMsIC0wLjM1NzA2OTY2NywgLTAuMzU2OTUxMzMzLCAtMC4zODA2MDMsIC0wLjM0MjcxMywgLTAuMzUzMTk1LCAtMC4zMzg0MTczMzMsIC0wLjM0ODM2NjY2NywgLTAuMzQ0OTk2MzMzLFxyXG4tMC4zNDU4MTgsIC0wLjM1MDYxOTMzMywgLTAuMzQ3MjYyMzMzLCAtMC4zNTEzOTA2NjcsIC0wLjMzOTY1NDY2NywgLTAuMzQzNDg0MzMzLCAtMC4zOTE0OSwgLTAuMzY1Njc5NjY3LCAtMC4zNzY2NDMzMzMsIC0wLjM5NTUyMywgLTAuMzk4MTUwNjY3LCAtMC4zNzQ5NzM2NjcsIC0wLjM5MzIwNywgLTAuMzgwMjE0NjY3LFxyXG4tMC4zNzEyNDkzMzMsIC0wLjM2MTM0NywgLTAuMzY3Mzk4MzMzLCAtMC4yODAwMDMsIC0wLjI1MzcxMzY2NywgLTAuMjAyODc0LCAtMC4xNzQ1MzIzMzMsIC0wLjEzMzM3MTMzMywgLTAuMDkxNjgyLCAtMC4wNDE4Mjk2NjcsIC0wLjAxNjcyMzY2NywgMC4wMjI2NzM2NjcsIDAuMTAxMzU3NjY3LCAwLjE2MTY5LFxyXG4wLjIzNjM3NTMzMywgMC4yOTkyNzUzMzMsIDAuMzQ2MDc2MzMzLCAwLjM3OTQwNSwgMC4zNzQ1NTksIDAuNDAxNDUyLCAwLjM4MDg3ODY2NywgMC4zNjE2MTQsIDAuMzg3NzE4LCAwLjM0NzYzNCwgMC4zMTI3NjksIDAuMjI5OTQ0LCAwLjE5NjY2MjMzMywgMC4xMjg2NjUzMzMsIDAuMDc4NDk1LCAwLjAzNTA4NyxcclxuLTAuMDM4NjE1MzMzLCAtMC4wNTk0MDY2NjcsIC0wLjEwMDYyNzMzMywgLTAuMTI4MjEyNjY3LCAtMC4xNDMzODIzMzMsIC0wLjE5NDk2NTMzMywgLTAuMjEwNTY3LCAtMC4yMjE0NzEzMzMsIC0wLjIzOTEwOTMzMywgLTAuMjQ0NDU1LCAtMC4yNTY4NTQ2NjcsIC0wLjI3NTUwNzMzMywgLTAuMzAyOTg3MzMzLFxyXG4tMC4zMTc0OTIsIC0wLjMwODAwNTY2NywgLTAuMzIxMzY3LCAtMC4zMjU3MDg2NjcsIC0wLjM0NDgyMDY2NywgLTAuMzI2MjM1MzMzLCAtMC4zNTYyODUsIC0wLjM0NzA1NTY2NywgLTAuMzQwOTIyLCAtMC4zNTgzMDA2NjcsIC0wLjMzMTIxODMzMywgLTAuMzQxNzkyLCAtMC4zNDM2OTEsIC0wLjMzMDE2MzMzMyxcclxuLTAuMzQ2NTg5NjY3LCAtMC4zMjk5NTksIC0wLjMwMzI1MiwgLTAuMjgyNjg4LCAtMC4yNjE4MTI2NjcsIC0wLjIyNTQxLCAtMC4xNzc3MTUzMzMsIC0wLjExODA0NDY2NywgLTAuMDgwMTI0LCAtMC4wMzY0Mjc2NjcsIDAuMDI2MTU5NjY3LCAwLjA2MDMzOCwgMC4xMjk1NDIsIDAuMTgwODIzLCAwLjIxMzg4NTMzMyxcclxuMC4yMjk4NzQzMzMsIDAuMjcxNzA3NjY3LCAwLjIyNjcyODY2NywgMC4yMTM3NjM2NjcsIDAuMjI1Mjc5LCAwLjIyMTc1NywgMC4yNzAzMzI2NjcsIDAuMjc1NTc5MzMzLCAwLjI2MDE2NjMzMywgMC4yMjk1OTc2NjcsIDAuMjI5NTkyNjY3LCAwLjIxMDkyMiwgMC4xODkxOTM2NjcsIDAuMTczNjU5MzMzLCAwLjEzODU1NCxcclxuMC4xMjQ5MDU2NjcsIDAuMDk0MDg3MzMzLCAwLjA3NjE1NjY2NywgMC4wMzM5NjksIDAuMDE5ODM4NjY3LCAtMC4wMDgwMjUsIC0wLjA0Mjg4MTY2NywgLTAuMDYzNzM1LCAtMC4wODQ4MDgzMzMsIC0wLjA4NzY3MzMzMywgLTAuMTEyODg5LCAtMC4xMTc3MzAzMzMsIC0wLjE0MzE5MywgLTAuMTQwMDE2NjY3LFxyXG4tMC4xMzgyODQ2NjcsIC0wLjEzNDg3ODY2NywgLTAuMTYzNjQ4NjY3LCAtMC4xNDEwNTU2NjcsIC0wLjE2MDUyOTMzMywgLTAuMTkzNTQwMzMzLCAtMC4xOTgyMDE2NjcsIC0wLjE3NjIyNjMzMywgLTAuMjA5ODAzLCAtMC4xODU3NzEsIC0wLjE4NzYyODMzMywgLTAuMjAxMjI5NjY3LCAtMC4yMDQzMDczMzMsXHJcbi0wLjIxMDQ5MywgLTAuMjM5NzMzLCAtMC4yMzA1MywgLTAuMjY5OTA1LCAtMC4yNjkwMzYzMzMsIC0wLjI4MzA3ODMzMywgLTAuMzAzODQxMzMzLCAtMC4yODE5NjgzMzMsIC0wLjI3MjAzNSwgLTAuMjU4MDI5LCAtMC4yODIwNDIzMzMsIC0wLjI5MDA2NjY2NywgLTAuMjgwNDk0NjY3LCAtMC4yODMxNjEzMzMsXHJcbi0wLjI3NDIyMzMzMywgLTAuMjgwMTk2LCAtMC4yMzYxMDEsIC0wLjI2NjE0MjY2NywgLTAuMjMzMzM1NjY3LCAtMC4yMjg4MjI2NjcsIC0wLjI1NjI2NiwgLTAuMjE2MzkxMzMzLCAtMC4yMDI1MjYzMzMsIC0wLjI1NjI5MDMzMywgLTAuMjM3MTIxLCAtMC4yNDQ1NDQsIC0wLjI1MzA3MiwgLTAuMTg1Mzk1LFxyXG4tMC4yNTY5NTQsIC0wLjIxNTE5OSwgLTAuMjA2MTkyMzMzLCAtMC4xNzYzNzgsIC0wLjIxMDc5MywgLTAuMTEyMzU3LCAtMC4wNjIxNzkzMzMsIC0wLjA3NTUwOTMzMywgLTAuMDkzOTk1LCAtMC4wMzMzNywgMC4wMDg4MDQzMzMsIC0wLjAzOTg5MDMzMywgMC4xMTc4NDMzMzMsIDAuMDI0MDU2LCAwLjExMjE5OTMzMyxcclxuMC4xMzk5NTksIDAuMDI4NjA4NjY3LCAwLjIwMzYwNTY2NywgMC4xMjk3NzQ2NjcsIDAuMjM3MDkxNjY3LCAwLjE4Mzc2NTMzMywgLTAuMTA0MzM3NjY3LCAtMC4zNzY2NzE1LCAtMC40NDQ3NjgsIC0wLjY5NjA4NTUsIC0wLjQ1OTI4NTUsIC0wLjcyMjY2NiwgXCJOQU1FP1wiLCBcIk5BTUU/XCIsIFwiTkFNRT9cIixcclxuXCJOQU1FP1wiIF1cclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgXCJjb25jZW50cmF0aW9uXCI6IFtbMSwgMF0sIFswLCAxXV0sXHJcbiAgICAgICAgICAgIFwiY29uY2VudHJhdGlvbkxhYmVsc1wiOiBbXCJTa2ltIE1pbGtcIiwgXCJPbGl2ZSBPaWxcIl1cclxuICAgICAgICB9O1xyXG4gICAgICAgIHVwZGF0ZURhdGEodHJhaW5PYmouYWJzb3JiYW5jZVswXSwgWzFdLCBbXCJTa2ltIE1pbGtcIl0sIFwiU2FtcGxlIDFcIik7XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzFdLCBbMV0sIFtcIk9saXZlIE9pbFwiXSwgXCJTYW1wbGUgMlwiKTtcclxuICAgICAgICB1cGRhdGVEYXRhKHRyYWluT2JqLmFic29yYmFuY2VbMV0sIFsxXSwgW1wiT2xpdmUgT2lsXCJdLCBcIlNhbXBsZSAzXCIpO1xyXG4gICAgICAgIHVwZGF0ZURhdGEodHJhaW5PYmouYWJzb3JiYW5jZVsxXSwgWzFdLCBbXCJTa2ltIE1pbGtcIl0sIFwiU2FtcGxlIDRcIik7XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzFdLCBbMV0sIFtcIlBhcmFkb3hpdW1cIl0sIFwiU2FtcGxlIDRcIik7XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzFdLCBbMC41LCAwLjVdLCBbXCJQYXJhZG94aXVtXCIsIFwiU2tpbSBNaWxrXCJdLCBcIlNhbXBsZSA0XCIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGNoZW1vU2FtcGxlTmFtZXMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBnZXRQQ0EoKSB7XHJcbiAgICAgICAgcmV0dXJuIGNoZW1vUENBQ29tcHJlc3NlZDtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHsgdHJhaW46IG5ld1RyYWluLCBpbmZlcjogbmV3SW5mZXIsIGZsYWdzOiBjaGVtb0ZsYWdzLCBnZXRNb2RlbDogY2hlbW9HZXRNb2RlbCwgbG9hZE1vZGVsOiBjaGVtb0xvYWRNb2RlbCwgcGNhVGVzdDogcGNhVGVzdCwgcGxzVGVzdDogcGxzVGVzdCwgdXBkYXRlVGVzdDp1cGRhdGVUZXN0LCB1cGRhdGVEYXRhOnVwZGF0ZURhdGEsIGdldFBDQTogZ2V0UENBIH07XHJcblxyXG59KTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9DaG9sZXNreURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIENob2xlc2t5RGVjb21wb3NpdGlvbih2YWx1ZSkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBDaG9sZXNreURlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ2hvbGVza3lEZWNvbXBvc2l0aW9uKHZhbHVlKTtcbiAgICB9XG4gICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuICAgIGlmICghdmFsdWUuaXNTeW1tZXRyaWMoKSlcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgbm90IHN5bW1ldHJpYycpO1xuXG4gICAgdmFyIGEgPSB2YWx1ZSxcbiAgICAgICAgZGltZW5zaW9uID0gYS5yb3dzLFxuICAgICAgICBsID0gbmV3IE1hdHJpeChkaW1lbnNpb24sIGRpbWVuc2lvbiksXG4gICAgICAgIHBvc2l0aXZlRGVmaW5pdGUgPSB0cnVlLFxuICAgICAgICBpLCBqLCBrO1xuXG4gICAgZm9yIChqID0gMDsgaiA8IGRpbWVuc2lvbjsgaisrKSB7XG4gICAgICAgIHZhciBMcm93aiA9IGxbal07XG4gICAgICAgIHZhciBkID0gMDtcbiAgICAgICAgZm9yIChrID0gMDsgayA8IGo7IGsrKykge1xuICAgICAgICAgICAgdmFyIExyb3drID0gbFtrXTtcbiAgICAgICAgICAgIHZhciBzID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzICs9IExyb3drW2ldICogTHJvd2pbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBMcm93altrXSA9IHMgPSAoYVtqXVtrXSAtIHMpIC8gbFtrXVtrXTtcbiAgICAgICAgICAgIGQgPSBkICsgcyAqIHM7XG4gICAgICAgIH1cblxuICAgICAgICBkID0gYVtqXVtqXSAtIGQ7XG5cbiAgICAgICAgcG9zaXRpdmVEZWZpbml0ZSAmPSAoZCA+IDApO1xuICAgICAgICBsW2pdW2pdID0gTWF0aC5zcXJ0KE1hdGgubWF4KGQsIDApKTtcbiAgICAgICAgZm9yIChrID0gaiArIDE7IGsgPCBkaW1lbnNpb247IGsrKykge1xuICAgICAgICAgICAgbFtqXVtrXSA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBvc2l0aXZlRGVmaW5pdGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgbm90IHBvc2l0aXZlIGRlZmluaXRlJyk7XG4gICAgfVxuXG4gICAgdGhpcy5MID0gbDtcbn1cblxuQ2hvbGVza3lEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBnZXQgbG93ZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MO1xuICAgIH0sXG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICAgICAgdmFyIGwgPSB0aGlzLkwsXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBsLnJvd3M7XG5cbiAgICAgICAgaWYgKHZhbHVlLnJvd3MgIT09IGRpbWVuc2lvbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggZGltZW5zaW9ucyBkbyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjb3VudCA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgICAgICBCID0gdmFsdWUuY2xvbmUoKSxcbiAgICAgICAgICAgIGksIGosIGs7XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8IGRpbWVuc2lvbjsgaysrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgQltrXVtqXSAtPSBCW2ldW2pdICogbFtrXVtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgQltrXVtqXSAvPSBsW2tdW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChrID0gZGltZW5zaW9uIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBkaW1lbnNpb247IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBCW2tdW2pdIC09IEJbaV1bal0gKiBsW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBCW2tdW2pdIC89IGxba11ba107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gQjtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENob2xlc2t5RGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbnZhciBoeXBvdGVudXNlID0gdXRpbC5oeXBvdGVudXNlO1xudmFyIGdldEZpbGxlZDJEQXJyYXkgPSB1dGlsLmdldEZpbGxlZDJEQXJyYXk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvRWlnZW52YWx1ZURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uKG1hdHJpeCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbihtYXRyaXgpO1xuICAgIH1cbiAgICBtYXRyaXggPSBNYXRyaXguY2hlY2tNYXRyaXgobWF0cml4KTtcbiAgICBpZiAoIW1hdHJpeC5pc1NxdWFyZSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGlzIG5vdCBhIHNxdWFyZSBtYXRyaXgnKTtcbiAgICB9XG5cbiAgICB2YXIgbiA9IG1hdHJpeC5jb2x1bW5zLFxuICAgICAgICBWID0gZ2V0RmlsbGVkMkRBcnJheShuLCBuLCAwKSxcbiAgICAgICAgZCA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgZSA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgdmFsdWUgPSBtYXRyaXgsXG4gICAgICAgIGksIGo7XG5cbiAgICBpZiAobWF0cml4LmlzU3ltbWV0cmljKCkpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIFZbaV1bal0gPSB2YWx1ZVtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0cmVkMihuLCBlLCBkLCBWKTtcbiAgICAgICAgdHFsMihuLCBlLCBkLCBWKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBIID0gZ2V0RmlsbGVkMkRBcnJheShuLCBuLCAwKSxcbiAgICAgICAgICAgIG9ydCA9IG5ldyBBcnJheShuKTtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIEhbaV1bal0gPSB2YWx1ZVtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBvcnRoZXMobiwgSCwgb3J0LCBWKTtcbiAgICAgICAgaHFyMihuLCBlLCBkLCBWLCBIKTtcbiAgICB9XG5cbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuZSA9IGU7XG4gICAgdGhpcy5kID0gZDtcbiAgICB0aGlzLlYgPSBWO1xufVxuXG5FaWdlbnZhbHVlRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgZ2V0IHJlYWxFaWdlbnZhbHVlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZDtcbiAgICB9LFxuICAgIGdldCBpbWFnaW5hcnlFaWdlbnZhbHVlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZTtcbiAgICB9LFxuICAgIGdldCBlaWdlbnZlY3Rvck1hdHJpeCgpIHtcbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgodGhpcy5WKSkge1xuICAgICAgICAgICAgdGhpcy5WID0gbmV3IE1hdHJpeCh0aGlzLlYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLlY7XG4gICAgfSxcbiAgICBnZXQgZGlhZ29uYWxNYXRyaXgoKSB7XG4gICAgICAgIHZhciBuID0gdGhpcy5uLFxuICAgICAgICAgICAgZSA9IHRoaXMuZSxcbiAgICAgICAgICAgIGQgPSB0aGlzLmQsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChuLCBuKSxcbiAgICAgICAgICAgIGksIGo7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFhbaV1baV0gPSBkW2ldO1xuICAgICAgICAgICAgaWYgKGVbaV0gPiAwKSB7XG4gICAgICAgICAgICAgICAgWFtpXVtpICsgMV0gPSBlW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZVtpXSA8IDApIHtcbiAgICAgICAgICAgICAgICBYW2ldW2kgLSAxXSA9IGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gdHJlZDIobiwgZSwgZCwgVikge1xuXG4gICAgdmFyIGYsIGcsIGgsIGksIGosIGssXG4gICAgICAgIGhoLCBzY2FsZTtcblxuICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgZFtqXSA9IFZbbiAtIDFdW2pdO1xuICAgIH1cblxuICAgIGZvciAoaSA9IG4gLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgIHNjYWxlID0gMDtcbiAgICAgICAgaCA9IDA7XG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBpOyBrKyspIHtcbiAgICAgICAgICAgIHNjYWxlID0gc2NhbGUgKyBNYXRoLmFicyhkW2tdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzY2FsZSA9PT0gMCkge1xuICAgICAgICAgICAgZVtpXSA9IGRbaSAtIDFdO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGRbal0gPSBWW2kgLSAxXVtqXTtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICBWW2pdW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICBkW2tdIC89IHNjYWxlO1xuICAgICAgICAgICAgICAgIGggKz0gZFtrXSAqIGRba107XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGYgPSBkW2kgLSAxXTtcbiAgICAgICAgICAgIGcgPSBNYXRoLnNxcnQoaCk7XG4gICAgICAgICAgICBpZiAoZiA+IDApIHtcbiAgICAgICAgICAgICAgICBnID0gLWc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVbaV0gPSBzY2FsZSAqIGc7XG4gICAgICAgICAgICBoID0gaCAtIGYgKiBnO1xuICAgICAgICAgICAgZFtpIC0gMV0gPSBmIC0gZztcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBlW2pdID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGYgPSBkW2pdO1xuICAgICAgICAgICAgICAgIFZbal1baV0gPSBmO1xuICAgICAgICAgICAgICAgIGcgPSBlW2pdICsgVltqXVtqXSAqIGY7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gaiArIDE7IGsgPD0gaSAtIDE7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBnICs9IFZba11bal0gKiBkW2tdO1xuICAgICAgICAgICAgICAgICAgICBlW2tdICs9IFZba11bal0gKiBmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW2pdID0gZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZiA9IDA7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZVtqXSAvPSBoO1xuICAgICAgICAgICAgICAgIGYgKz0gZVtqXSAqIGRbal07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGhoID0gZiAvIChoICsgaCk7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZVtqXSAtPSBoaCAqIGRbal07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmID0gZFtqXTtcbiAgICAgICAgICAgICAgICBnID0gZVtqXTtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSBqOyBrIDw9IGkgLSAxOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVltrXVtqXSAtPSAoZiAqIGVba10gKyBnICogZFtrXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRbal0gPSBWW2kgLSAxXVtqXTtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkW2ldID0gaDtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgICBWW24gLSAxXVtpXSA9IFZbaV1baV07XG4gICAgICAgIFZbaV1baV0gPSAxO1xuICAgICAgICBoID0gZFtpICsgMV07XG4gICAgICAgIGlmIChoICE9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDw9IGk7IGsrKykge1xuICAgICAgICAgICAgICAgIGRba10gPSBWW2tdW2kgKyAxXSAvIGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPD0gaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZyArPSBWW2tdW2kgKyAxXSAqIFZba11bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPD0gaTsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZba11bal0gLT0gZyAqIGRba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgIFZba11baSArIDFdID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgZFtqXSA9IFZbbiAtIDFdW2pdO1xuICAgICAgICBWW24gLSAxXVtqXSA9IDA7XG4gICAgfVxuXG4gICAgVltuIC0gMV1bbiAtIDFdID0gMTtcbiAgICBlWzBdID0gMDtcbn1cblxuZnVuY3Rpb24gdHFsMihuLCBlLCBkLCBWKSB7XG5cbiAgICB2YXIgZywgaCwgaSwgaiwgaywgbCwgbSwgcCwgcixcbiAgICAgICAgZGwxLCBjLCBjMiwgYzMsIGVsMSwgcywgczIsXG4gICAgICAgIGl0ZXI7XG5cbiAgICBmb3IgKGkgPSAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGVbaSAtIDFdID0gZVtpXTtcbiAgICB9XG5cbiAgICBlW24gLSAxXSA9IDA7XG5cbiAgICB2YXIgZiA9IDAsXG4gICAgICAgIHRzdDEgPSAwLFxuICAgICAgICBlcHMgPSBNYXRoLnBvdygyLCAtNTIpO1xuXG4gICAgZm9yIChsID0gMDsgbCA8IG47IGwrKykge1xuICAgICAgICB0c3QxID0gTWF0aC5tYXgodHN0MSwgTWF0aC5hYnMoZFtsXSkgKyBNYXRoLmFicyhlW2xdKSk7XG4gICAgICAgIG0gPSBsO1xuICAgICAgICB3aGlsZSAobSA8IG4pIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhlW21dKSA8PSBlcHMgKiB0c3QxKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtKys7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSA+IGwpIHtcbiAgICAgICAgICAgIGl0ZXIgPSAwO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIGl0ZXIgPSBpdGVyICsgMTtcblxuICAgICAgICAgICAgICAgIGcgPSBkW2xdO1xuICAgICAgICAgICAgICAgIHAgPSAoZFtsICsgMV0gLSBnKSAvICgyICogZVtsXSk7XG4gICAgICAgICAgICAgICAgciA9IGh5cG90ZW51c2UocCwgMSk7XG4gICAgICAgICAgICAgICAgaWYgKHAgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHIgPSAtcjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBkW2xdID0gZVtsXSAvIChwICsgcik7XG4gICAgICAgICAgICAgICAgZFtsICsgMV0gPSBlW2xdICogKHAgKyByKTtcbiAgICAgICAgICAgICAgICBkbDEgPSBkW2wgKyAxXTtcbiAgICAgICAgICAgICAgICBoID0gZyAtIGRbbF07XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbCArIDI7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZFtpXSAtPSBoO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGYgPSBmICsgaDtcblxuICAgICAgICAgICAgICAgIHAgPSBkW21dO1xuICAgICAgICAgICAgICAgIGMgPSAxO1xuICAgICAgICAgICAgICAgIGMyID0gYztcbiAgICAgICAgICAgICAgICBjMyA9IGM7XG4gICAgICAgICAgICAgICAgZWwxID0gZVtsICsgMV07XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgczIgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG0gLSAxOyBpID49IGw7IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBjMyA9IGMyO1xuICAgICAgICAgICAgICAgICAgICBjMiA9IGM7XG4gICAgICAgICAgICAgICAgICAgIHMyID0gcztcbiAgICAgICAgICAgICAgICAgICAgZyA9IGMgKiBlW2ldO1xuICAgICAgICAgICAgICAgICAgICBoID0gYyAqIHA7XG4gICAgICAgICAgICAgICAgICAgIHIgPSBoeXBvdGVudXNlKHAsIGVbaV0pO1xuICAgICAgICAgICAgICAgICAgICBlW2kgKyAxXSA9IHMgKiByO1xuICAgICAgICAgICAgICAgICAgICBzID0gZVtpXSAvIHI7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBwIC8gcjtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGMgKiBkW2ldIC0gcyAqIGc7XG4gICAgICAgICAgICAgICAgICAgIGRbaSArIDFdID0gaCArIHMgKiAoYyAqIGcgKyBzICogZFtpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaCA9IFZba11baSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltrXVtpICsgMV0gPSBzICogVltrXVtpXSArIGMgKiBoO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltrXVtpXSA9IGMgKiBWW2tdW2ldIC0gcyAqIGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBwID0gLXMgKiBzMiAqIGMzICogZWwxICogZVtsXSAvIGRsMTtcbiAgICAgICAgICAgICAgICBlW2xdID0gcyAqIHA7XG4gICAgICAgICAgICAgICAgZFtsXSA9IGMgKiBwO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsZSAoTWF0aC5hYnMoZVtsXSkgPiBlcHMgKiB0c3QxKTtcbiAgICAgICAgfVxuICAgICAgICBkW2xdID0gZFtsXSArIGY7XG4gICAgICAgIGVbbF0gPSAwO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBuIC0gMTsgaSsrKSB7XG4gICAgICAgIGsgPSBpO1xuICAgICAgICBwID0gZFtpXTtcbiAgICAgICAgZm9yIChqID0gaSArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChkW2pdIDwgcCkge1xuICAgICAgICAgICAgICAgIGsgPSBqO1xuICAgICAgICAgICAgICAgIHAgPSBkW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGsgIT09IGkpIHtcbiAgICAgICAgICAgIGRba10gPSBkW2ldO1xuICAgICAgICAgICAgZFtpXSA9IHA7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgcCA9IFZbal1baV07XG4gICAgICAgICAgICAgICAgVltqXVtpXSA9IFZbal1ba107XG4gICAgICAgICAgICAgICAgVltqXVtrXSA9IHA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG9ydGhlcyhuLCBILCBvcnQsIFYpIHtcblxuICAgIHZhciBsb3cgPSAwLFxuICAgICAgICBoaWdoID0gbiAtIDEsXG4gICAgICAgIGYsIGcsIGgsIGksIGosIG0sXG4gICAgICAgIHNjYWxlO1xuXG4gICAgZm9yIChtID0gbG93ICsgMTsgbSA8PSBoaWdoIC0gMTsgbSsrKSB7XG4gICAgICAgIHNjYWxlID0gMDtcbiAgICAgICAgZm9yIChpID0gbTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgIHNjYWxlID0gc2NhbGUgKyBNYXRoLmFicyhIW2ldW20gLSAxXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2NhbGUgIT09IDApIHtcbiAgICAgICAgICAgIGggPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gaGlnaDsgaSA+PSBtOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBvcnRbaV0gPSBIW2ldW20gLSAxXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIGggKz0gb3J0W2ldICogb3J0W2ldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnID0gTWF0aC5zcXJ0KGgpO1xuICAgICAgICAgICAgaWYgKG9ydFttXSA+IDApIHtcbiAgICAgICAgICAgICAgICBnID0gLWc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGggPSBoIC0gb3J0W21dICogZztcbiAgICAgICAgICAgIG9ydFttXSA9IG9ydFttXSAtIGc7XG5cbiAgICAgICAgICAgIGZvciAoaiA9IG07IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBoaWdoOyBpID49IG07IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBmICs9IG9ydFtpXSAqIEhbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZiA9IGYgLyBoO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bal0gLT0gZiAqIG9ydFtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZiA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gaGlnaDsgaiA+PSBtOyBqLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgZiArPSBvcnRbal0gKiBIW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGYgPSBmIC8gaDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBtOyBqIDw9IGhpZ2g7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2pdIC09IGYgKiBvcnRbal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvcnRbbV0gPSBzY2FsZSAqIG9ydFttXTtcbiAgICAgICAgICAgIEhbbV1bbSAtIDFdID0gc2NhbGUgKiBnO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBWW2ldW2pdID0gKGkgPT09IGogPyAxIDogMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKG0gPSBoaWdoIC0gMTsgbSA+PSBsb3cgKyAxOyBtLS0pIHtcbiAgICAgICAgaWYgKEhbbV1bbSAtIDFdICE9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBtICsgMTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBvcnRbaV0gPSBIW2ldW20gLSAxXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gbTsgaiA8PSBoaWdoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBnID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBtOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBnICs9IG9ydFtpXSAqIFZbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZyA9IChnIC8gb3J0W21dKSAvIEhbbV1bbSAtIDFdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZbaV1bal0gKz0gZyAqIG9ydFtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhxcjIobm4sIGUsIGQsIFYsIEgpIHtcbiAgICB2YXIgbiA9IG5uIC0gMSxcbiAgICAgICAgbG93ID0gMCxcbiAgICAgICAgaGlnaCA9IG5uIC0gMSxcbiAgICAgICAgZXBzID0gTWF0aC5wb3coMiwgLTUyKSxcbiAgICAgICAgZXhzaGlmdCA9IDAsXG4gICAgICAgIG5vcm0gPSAwLFxuICAgICAgICBwID0gMCxcbiAgICAgICAgcSA9IDAsXG4gICAgICAgIHIgPSAwLFxuICAgICAgICBzID0gMCxcbiAgICAgICAgeiA9IDAsXG4gICAgICAgIGl0ZXIgPSAwLFxuICAgICAgICBpLCBqLCBrLCBsLCBtLCB0LCB3LCB4LCB5LFxuICAgICAgICByYSwgc2EsIHZyLCB2aSxcbiAgICAgICAgbm90bGFzdCwgY2RpdnJlcztcblxuICAgIGZvciAoaSA9IDA7IGkgPCBubjsgaSsrKSB7XG4gICAgICAgIGlmIChpIDwgbG93IHx8IGkgPiBoaWdoKSB7XG4gICAgICAgICAgICBkW2ldID0gSFtpXVtpXTtcbiAgICAgICAgICAgIGVbaV0gPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChqID0gTWF0aC5tYXgoaSAtIDEsIDApOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgbm9ybSA9IG5vcm0gKyBNYXRoLmFicyhIW2ldW2pdKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHdoaWxlIChuID49IGxvdykge1xuICAgICAgICBsID0gbjtcbiAgICAgICAgd2hpbGUgKGwgPiBsb3cpIHtcbiAgICAgICAgICAgIHMgPSBNYXRoLmFicyhIW2wgLSAxXVtsIC0gMV0pICsgTWF0aC5hYnMoSFtsXVtsXSk7XG4gICAgICAgICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHMgPSBub3JtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKEhbbF1bbCAtIDFdKSA8IGVwcyAqIHMpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGwtLTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsID09PSBuKSB7XG4gICAgICAgICAgICBIW25dW25dID0gSFtuXVtuXSArIGV4c2hpZnQ7XG4gICAgICAgICAgICBkW25dID0gSFtuXVtuXTtcbiAgICAgICAgICAgIGVbbl0gPSAwO1xuICAgICAgICAgICAgbi0tO1xuICAgICAgICAgICAgaXRlciA9IDA7XG4gICAgICAgIH0gZWxzZSBpZiAobCA9PT0gbiAtIDEpIHtcbiAgICAgICAgICAgIHcgPSBIW25dW24gLSAxXSAqIEhbbiAtIDFdW25dO1xuICAgICAgICAgICAgcCA9IChIW24gLSAxXVtuIC0gMV0gLSBIW25dW25dKSAvIDI7XG4gICAgICAgICAgICBxID0gcCAqIHAgKyB3O1xuICAgICAgICAgICAgeiA9IE1hdGguc3FydChNYXRoLmFicyhxKSk7XG4gICAgICAgICAgICBIW25dW25dID0gSFtuXVtuXSArIGV4c2hpZnQ7XG4gICAgICAgICAgICBIW24gLSAxXVtuIC0gMV0gPSBIW24gLSAxXVtuIC0gMV0gKyBleHNoaWZ0O1xuICAgICAgICAgICAgeCA9IEhbbl1bbl07XG5cbiAgICAgICAgICAgIGlmIChxID49IDApIHtcbiAgICAgICAgICAgICAgICB6ID0gKHAgPj0gMCkgPyAocCArIHopIDogKHAgLSB6KTtcbiAgICAgICAgICAgICAgICBkW24gLSAxXSA9IHggKyB6O1xuICAgICAgICAgICAgICAgIGRbbl0gPSBkW24gLSAxXTtcbiAgICAgICAgICAgICAgICBpZiAoeiAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBkW25dID0geCAtIHcgLyB6O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW24gLSAxXSA9IDA7XG4gICAgICAgICAgICAgICAgZVtuXSA9IDA7XG4gICAgICAgICAgICAgICAgeCA9IEhbbl1bbiAtIDFdO1xuICAgICAgICAgICAgICAgIHMgPSBNYXRoLmFicyh4KSArIE1hdGguYWJzKHopO1xuICAgICAgICAgICAgICAgIHAgPSB4IC8gcztcbiAgICAgICAgICAgICAgICBxID0geiAvIHM7XG4gICAgICAgICAgICAgICAgciA9IE1hdGguc3FydChwICogcCArIHEgKiBxKTtcbiAgICAgICAgICAgICAgICBwID0gcCAvIHI7XG4gICAgICAgICAgICAgICAgcSA9IHEgLyByO1xuXG4gICAgICAgICAgICAgICAgZm9yIChqID0gbiAtIDE7IGogPCBubjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSBIW24gLSAxXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgSFtuIC0gMV1bal0gPSBxICogeiArIHAgKiBIW25dW2pdO1xuICAgICAgICAgICAgICAgICAgICBIW25dW2pdID0gcSAqIEhbbl1bal0gLSBwICogejtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB6ID0gSFtpXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bbiAtIDFdID0gcSAqIHogKyBwICogSFtpXVtuXTtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IHEgKiBIW2ldW25dIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB6ID0gVltpXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIFZbaV1bbiAtIDFdID0gcSAqIHogKyBwICogVltpXVtuXTtcbiAgICAgICAgICAgICAgICAgICAgVltpXVtuXSA9IHEgKiBWW2ldW25dIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkW24gLSAxXSA9IHggKyBwO1xuICAgICAgICAgICAgICAgIGRbbl0gPSB4ICsgcDtcbiAgICAgICAgICAgICAgICBlW24gLSAxXSA9IHo7XG4gICAgICAgICAgICAgICAgZVtuXSA9IC16O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuID0gbiAtIDI7XG4gICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHggPSBIW25dW25dO1xuICAgICAgICAgICAgeSA9IDA7XG4gICAgICAgICAgICB3ID0gMDtcbiAgICAgICAgICAgIGlmIChsIDwgbikge1xuICAgICAgICAgICAgICAgIHkgPSBIW24gLSAxXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgdyA9IEhbbl1bbiAtIDFdICogSFtuIC0gMV1bbl07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpdGVyID09PSAxMCkge1xuICAgICAgICAgICAgICAgIGV4c2hpZnQgKz0geDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1baV0gLT0geDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyA9IE1hdGguYWJzKEhbbl1bbiAtIDFdKSArIE1hdGguYWJzKEhbbiAtIDFdW24gLSAyXSk7XG4gICAgICAgICAgICAgICAgeCA9IHkgPSAwLjc1ICogcztcbiAgICAgICAgICAgICAgICB3ID0gLTAuNDM3NSAqIHMgKiBzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlciA9PT0gMzApIHtcbiAgICAgICAgICAgICAgICBzID0gKHkgLSB4KSAvIDI7XG4gICAgICAgICAgICAgICAgcyA9IHMgKiBzICsgdztcbiAgICAgICAgICAgICAgICBpZiAocyA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcyA9IE1hdGguc3FydChzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHkgPCB4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzID0gLXM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcyA9IHggLSB3IC8gKCh5IC0geCkgLyAyICsgcyk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1baV0gLT0gcztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBleHNoaWZ0ICs9IHM7XG4gICAgICAgICAgICAgICAgICAgIHggPSB5ID0gdyA9IDAuOTY0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaXRlciA9IGl0ZXIgKyAxO1xuXG4gICAgICAgICAgICBtID0gbiAtIDI7XG4gICAgICAgICAgICB3aGlsZSAobSA+PSBsKSB7XG4gICAgICAgICAgICAgICAgeiA9IEhbbV1bbV07XG4gICAgICAgICAgICAgICAgciA9IHggLSB6O1xuICAgICAgICAgICAgICAgIHMgPSB5IC0gejtcbiAgICAgICAgICAgICAgICBwID0gKHIgKiBzIC0gdykgLyBIW20gKyAxXVttXSArIEhbbV1bbSArIDFdO1xuICAgICAgICAgICAgICAgIHEgPSBIW20gKyAxXVttICsgMV0gLSB6IC0gciAtIHM7XG4gICAgICAgICAgICAgICAgciA9IEhbbSArIDJdW20gKyAxXTtcbiAgICAgICAgICAgICAgICBzID0gTWF0aC5hYnMocCkgKyBNYXRoLmFicyhxKSArIE1hdGguYWJzKHIpO1xuICAgICAgICAgICAgICAgIHAgPSBwIC8gcztcbiAgICAgICAgICAgICAgICBxID0gcSAvIHM7XG4gICAgICAgICAgICAgICAgciA9IHIgLyBzO1xuICAgICAgICAgICAgICAgIGlmIChtID09PSBsKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoSFttXVttIC0gMV0pICogKE1hdGguYWJzKHEpICsgTWF0aC5hYnMocikpIDwgZXBzICogKE1hdGguYWJzKHApICogKE1hdGguYWJzKEhbbSAtIDFdW20gLSAxXSkgKyBNYXRoLmFicyh6KSArIE1hdGguYWJzKEhbbSArIDFdW20gKyAxXSkpKSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbS0tO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGkgPSBtICsgMjsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBIW2ldW2kgLSAyXSA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBtICsgMikge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2kgLSAzXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGsgPSBtOyBrIDw9IG4gLSAxOyBrKyspIHtcbiAgICAgICAgICAgICAgICBub3RsYXN0ID0gKGsgIT09IG4gLSAxKTtcbiAgICAgICAgICAgICAgICBpZiAoayAhPT0gbSkge1xuICAgICAgICAgICAgICAgICAgICBwID0gSFtrXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHEgPSBIW2sgKyAxXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHIgPSAobm90bGFzdCA/IEhbayArIDJdW2sgLSAxXSA6IDApO1xuICAgICAgICAgICAgICAgICAgICB4ID0gTWF0aC5hYnMocCkgKyBNYXRoLmFicyhxKSArIE1hdGguYWJzKHIpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoeCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgcSA9IHEgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgciA9IHIgLyB4O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcyA9IE1hdGguc3FydChwICogcCArIHEgKiBxICsgciAqIHIpO1xuICAgICAgICAgICAgICAgIGlmIChwIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzID0gLXM7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHMgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGsgIT09IG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhba11bayAtIDFdID0gLXMgKiB4O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGwgIT09IG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhba11bayAtIDFdID0gLUhba11bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyBzO1xuICAgICAgICAgICAgICAgICAgICB4ID0gcCAvIHM7XG4gICAgICAgICAgICAgICAgICAgIHkgPSBxIC8gcztcbiAgICAgICAgICAgICAgICAgICAgeiA9IHIgLyBzO1xuICAgICAgICAgICAgICAgICAgICBxID0gcSAvIHA7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByIC8gcDtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSBrOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IEhba11bal0gKyBxICogSFtrICsgMV1bal07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm90bGFzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwICsgciAqIEhbayArIDJdW2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbayArIDJdW2pdID0gSFtrICsgMl1bal0gLSBwICogejtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgSFtrXVtqXSA9IEhba11bal0gLSBwICogeDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbayArIDFdW2pdID0gSFtrICsgMV1bal0gLSBwICogeTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gTWF0aC5taW4obiwgayArIDMpOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAgPSB4ICogSFtpXVtrXSArIHkgKiBIW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub3RsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyB6ICogSFtpXVtrICsgMl07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtrICsgMl0gPSBIW2ldW2sgKyAyXSAtIHAgKiByO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2tdID0gSFtpXVtrXSAtIHA7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2sgKyAxXSA9IEhbaV1bayArIDFdIC0gcCAqIHE7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwID0geCAqIFZbaV1ba10gKyB5ICogVltpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm90bGFzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwICsgeiAqIFZbaV1bayArIDJdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bayArIDJdID0gVltpXVtrICsgMl0gLSBwICogcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrXSA9IFZbaV1ba10gLSBwO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrICsgMV0gPSBWW2ldW2sgKyAxXSAtIHAgKiBxO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG5vcm0gPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAobiA9IG5uIC0gMTsgbiA+PSAwOyBuLS0pIHtcbiAgICAgICAgcCA9IGRbbl07XG4gICAgICAgIHEgPSBlW25dO1xuXG4gICAgICAgIGlmIChxID09PSAwKSB7XG4gICAgICAgICAgICBsID0gbjtcbiAgICAgICAgICAgIEhbbl1bbl0gPSAxO1xuICAgICAgICAgICAgZm9yIChpID0gbiAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgdyA9IEhbaV1baV0gLSBwO1xuICAgICAgICAgICAgICAgIHIgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGw7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByICsgSFtpXVtqXSAqIEhbal1bbl07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGVbaV0gPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSB3O1xuICAgICAgICAgICAgICAgICAgICBzID0gcjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSAodyAhPT0gMCkgPyAoLXIgLyB3KSA6ICgtciAvIChlcHMgKiBub3JtKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gSFtpXVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB5ID0gSFtpICsgMV1baV07XG4gICAgICAgICAgICAgICAgICAgICAgICBxID0gKGRbaV0gLSBwKSAqIChkW2ldIC0gcCkgKyBlW2ldICogZVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgPSAoeCAqIHMgLSB6ICogcikgLyBxO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9IChNYXRoLmFicyh4KSA+IE1hdGguYWJzKHopKSA/ICgoLXIgLSB3ICogdCkgLyB4KSA6ICgoLXMgLSB5ICogdCkgLyB6KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHQgPSBNYXRoLmFicyhIW2ldW25dKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKChlcHMgKiB0KSAqIHQgPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSBpOyBqIDw9IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbal1bbl0gPSBIW2pdW25dIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChxIDwgMCkge1xuICAgICAgICAgICAgbCA9IG4gLSAxO1xuXG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoSFtuXVtuIC0gMV0pID4gTWF0aC5hYnMoSFtuIC0gMV1bbl0pKSB7XG4gICAgICAgICAgICAgICAgSFtuIC0gMV1bbiAtIDFdID0gcSAvIEhbbl1bbiAtIDFdO1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW25dID0gLShIW25dW25dIC0gcCkgLyBIW25dW24gLSAxXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoMCwgLUhbbiAtIDFdW25dLCBIW24gLSAxXVtuIC0gMV0gLSBwLCBxKTtcbiAgICAgICAgICAgICAgICBIW24gLSAxXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW25dID0gY2RpdnJlc1sxXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgSFtuXVtuIC0gMV0gPSAwO1xuICAgICAgICAgICAgSFtuXVtuXSA9IDE7XG4gICAgICAgICAgICBmb3IgKGkgPSBuIC0gMjsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICByYSA9IDA7XG4gICAgICAgICAgICAgICAgc2EgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGw7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhID0gcmEgKyBIW2ldW2pdICogSFtqXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHNhID0gc2EgKyBIW2ldW2pdICogSFtqXVtuXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB3ID0gSFtpXVtpXSAtIHA7XG5cbiAgICAgICAgICAgICAgICBpZiAoZVtpXSA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IHc7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByYTtcbiAgICAgICAgICAgICAgICAgICAgcyA9IHNhO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGwgPSBpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoLXJhLCAtc2EsIHcsIHEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gSFtpXVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB5ID0gSFtpICsgMV1baV07XG4gICAgICAgICAgICAgICAgICAgICAgICB2ciA9IChkW2ldIC0gcCkgKiAoZFtpXSAtIHApICsgZVtpXSAqIGVbaV0gLSBxICogcTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpID0gKGRbaV0gLSBwKSAqIDIgKiBxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZyID09PSAwICYmIHZpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdnIgPSBlcHMgKiBub3JtICogKE1hdGguYWJzKHcpICsgTWF0aC5hYnMocSkgKyBNYXRoLmFicyh4KSArIE1hdGguYWJzKHkpICsgTWF0aC5hYnMoeikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoeCAqIHIgLSB6ICogcmEgKyBxICogc2EsIHggKiBzIC0geiAqIHNhIC0gcSAqIHJhLCB2ciwgdmkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoeCkgPiAoTWF0aC5hYnMoeikgKyBNYXRoLmFicyhxKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuIC0gMV0gPSAoLXJhIC0gdyAqIEhbaV1bbiAtIDFdICsgcSAqIEhbaV1bbl0pIC8geDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9ICgtc2EgLSB3ICogSFtpXVtuXSAtIHEgKiBIW2ldW24gLSAxXSkgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZGl2cmVzID0gY2RpdigtciAtIHkgKiBIW2ldW24gLSAxXSwgLXMgLSB5ICogSFtpXVtuXSwgeiwgcSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbiAtIDFdID0gY2RpdnJlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0ID0gTWF0aC5tYXgoTWF0aC5hYnMoSFtpXVtuIC0gMV0pLCBNYXRoLmFicyhIW2ldW25dKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoZXBzICogdCkgKiB0ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8PSBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2pdW24gLSAxXSA9IEhbal1bbiAtIDFdIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2pdW25dID0gSFtqXVtuXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbm47IGkrKykge1xuICAgICAgICBpZiAoaSA8IGxvdyB8fCBpID4gaGlnaCkge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IG5uOyBqKyspIHtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gSFtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaiA9IG5uIC0gMTsgaiA+PSBsb3c7IGotLSkge1xuICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICB6ID0gMDtcbiAgICAgICAgICAgIGZvciAoayA9IGxvdzsgayA8PSBNYXRoLm1pbihqLCBoaWdoKTsgaysrKSB7XG4gICAgICAgICAgICAgICAgeiA9IHogKyBWW2ldW2tdICogSFtrXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFZbaV1bal0gPSB6O1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjZGl2KHhyLCB4aSwgeXIsIHlpKSB7XG4gICAgdmFyIHIsIGQ7XG4gICAgaWYgKE1hdGguYWJzKHlyKSA+IE1hdGguYWJzKHlpKSkge1xuICAgICAgICByID0geWkgLyB5cjtcbiAgICAgICAgZCA9IHlyICsgciAqIHlpO1xuICAgICAgICByZXR1cm4gWyh4ciArIHIgKiB4aSkgLyBkLCAoeGkgLSByICogeHIpIC8gZF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByID0geXIgLyB5aTtcbiAgICAgICAgZCA9IHlpICsgciAqIHlyO1xuICAgICAgICByZXR1cm4gWyhyICogeHIgKyB4aSkgLyBkLCAociAqIHhpIC0geHIpIC8gZF07XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvTHVEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBMdURlY29tcG9zaXRpb24obWF0cml4KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEx1RGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMdURlY29tcG9zaXRpb24obWF0cml4KTtcbiAgICB9XG4gICAgbWF0cml4ID0gTWF0cml4LmNoZWNrTWF0cml4KG1hdHJpeCk7XG5cbiAgICB2YXIgbHUgPSBtYXRyaXguY2xvbmUoKSxcbiAgICAgICAgcm93cyA9IGx1LnJvd3MsXG4gICAgICAgIGNvbHVtbnMgPSBsdS5jb2x1bW5zLFxuICAgICAgICBwaXZvdFZlY3RvciA9IG5ldyBBcnJheShyb3dzKSxcbiAgICAgICAgcGl2b3RTaWduID0gMSxcbiAgICAgICAgaSwgaiwgaywgcCwgcywgdCwgdixcbiAgICAgICAgTFVyb3dpLCBMVWNvbGosIGttYXg7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgIHBpdm90VmVjdG9yW2ldID0gaTtcbiAgICB9XG5cbiAgICBMVWNvbGogPSBuZXcgQXJyYXkocm93cyk7XG5cbiAgICBmb3IgKGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgTFVjb2xqW2ldID0gbHVbaV1bal07XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBMVXJvd2kgPSBsdVtpXTtcbiAgICAgICAgICAgIGttYXggPSBNYXRoLm1pbihpLCBqKTtcbiAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGttYXg7IGsrKykge1xuICAgICAgICAgICAgICAgIHMgKz0gTFVyb3dpW2tdICogTFVjb2xqW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgTFVyb3dpW2pdID0gTFVjb2xqW2ldIC09IHM7XG4gICAgICAgIH1cblxuICAgICAgICBwID0gajtcbiAgICAgICAgZm9yIChpID0gaiArIDE7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhMVWNvbGpbaV0pID4gTWF0aC5hYnMoTFVjb2xqW3BdKSkge1xuICAgICAgICAgICAgICAgIHAgPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHAgIT09IGopIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2x1bW5zOyBrKyspIHtcbiAgICAgICAgICAgICAgICB0ID0gbHVbcF1ba107XG4gICAgICAgICAgICAgICAgbHVbcF1ba10gPSBsdVtqXVtrXTtcbiAgICAgICAgICAgICAgICBsdVtqXVtrXSA9IHQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHYgPSBwaXZvdFZlY3RvcltwXTtcbiAgICAgICAgICAgIHBpdm90VmVjdG9yW3BdID0gcGl2b3RWZWN0b3Jbal07XG4gICAgICAgICAgICBwaXZvdFZlY3RvcltqXSA9IHY7XG5cbiAgICAgICAgICAgIHBpdm90U2lnbiA9IC1waXZvdFNpZ247XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaiA8IHJvd3MgJiYgbHVbal1bal0gIT09IDApIHtcbiAgICAgICAgICAgIGZvciAoaSA9IGogKyAxOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbHVbaV1bal0gLz0gbHVbal1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLkxVID0gbHU7XG4gICAgdGhpcy5waXZvdFZlY3RvciA9IHBpdm90VmVjdG9yO1xuICAgIHRoaXMucGl2b3RTaWduID0gcGl2b3RTaWduO1xufVxuXG5MdURlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIGlzU2luZ3VsYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVLFxuICAgICAgICAgICAgY29sID0gZGF0YS5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbDsgaisrKSB7XG4gICAgICAgICAgICBpZiAoZGF0YVtqXVtqXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuICAgIGdldCBkZXRlcm1pbmFudCgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVO1xuICAgICAgICBpZiAoIWRhdGEuaXNTcXVhcmUoKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IG11c3QgYmUgc3F1YXJlJyk7XG4gICAgICAgIHZhciBkZXRlcm1pbmFudCA9IHRoaXMucGl2b3RTaWduLCBjb2wgPSBkYXRhLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sOyBqKyspXG4gICAgICAgICAgICBkZXRlcm1pbmFudCAqPSBkYXRhW2pdW2pdO1xuICAgICAgICByZXR1cm4gZGV0ZXJtaW5hbnQ7XG4gICAgfSxcbiAgICBnZXQgbG93ZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuTFUsXG4gICAgICAgICAgICByb3dzID0gZGF0YS5yb3dzLFxuICAgICAgICAgICAgY29sdW1ucyA9IGRhdGEuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IGRhdGFbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9LFxuICAgIGdldCB1cHBlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5MVSxcbiAgICAgICAgICAgIHJvd3MgPSBkYXRhLnJvd3MsXG4gICAgICAgICAgICBjb2x1bW5zID0gZGF0YS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDw9IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IGRhdGFbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH0sXG4gICAgZ2V0IHBpdm90UGVybXV0YXRpb25WZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBpdm90VmVjdG9yLnNsaWNlKCk7XG4gICAgfSxcbiAgICBzb2x2ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgICAgICB2YXIgbHUgPSB0aGlzLkxVLFxuICAgICAgICAgICAgcm93cyA9IGx1LnJvd3M7XG5cbiAgICAgICAgaWYgKHJvd3MgIT09IHZhbHVlLnJvd3MpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbWF0cml4IGRpbWVuc2lvbnMnKTtcbiAgICAgICAgaWYgKHRoaXMuaXNTaW5ndWxhcigpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMVSBtYXRyaXggaXMgc2luZ3VsYXInKTtcblxuICAgICAgICB2YXIgY291bnQgPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IHZhbHVlLnN1Yk1hdHJpeFJvdyh0aGlzLnBpdm90VmVjdG9yLCAwLCBjb3VudCAtIDEpLFxuICAgICAgICAgICAgY29sdW1ucyA9IGx1LmNvbHVtbnMsXG4gICAgICAgICAgICBpLCBqLCBrO1xuXG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2x1bW5zOyBrKyspIHtcbiAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSAtPSBYW2tdW2pdICogbHVbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoayA9IGNvbHVtbnMgLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBYW2tdW2pdIC89IGx1W2tdW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gLT0gWFtrXVtqXSAqIGx1W2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEx1RGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIGh5cG90ZW51c2UgPSByZXF1aXJlKCcuL3V0aWwnKS5oeXBvdGVudXNlO1xuXG4vL2h0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvUXJEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBRckRlY29tcG9zaXRpb24odmFsdWUpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUXJEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IFFyRGVjb21wb3NpdGlvbih2YWx1ZSk7XG4gICAgfVxuICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgIHZhciBxciA9IHZhbHVlLmNsb25lKCksXG4gICAgICAgIG0gPSB2YWx1ZS5yb3dzLFxuICAgICAgICBuID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgcmRpYWcgPSBuZXcgQXJyYXkobiksXG4gICAgICAgIGksIGosIGssIHM7XG5cbiAgICBmb3IgKGsgPSAwOyBrIDwgbjsgaysrKSB7XG4gICAgICAgIHZhciBucm0gPSAwO1xuICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICBucm0gPSBoeXBvdGVudXNlKG5ybSwgcXJbaV1ba10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChucm0gIT09IDApIHtcbiAgICAgICAgICAgIGlmIChxcltrXVtrXSA8IDApIHtcbiAgICAgICAgICAgICAgICBucm0gPSAtbnJtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIHFyW2ldW2tdIC89IG5ybTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHFyW2tdW2tdICs9IDE7XG4gICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSBxcltpXVtrXSAqIHFyW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHFyW2ldW2pdICs9IHMgKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmRpYWdba10gPSAtbnJtO1xuICAgIH1cblxuICAgIHRoaXMuUVIgPSBxcjtcbiAgICB0aGlzLlJkaWFnID0gcmRpYWc7XG59XG5cblFyRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICAgICAgdmFyIHFyID0gdGhpcy5RUixcbiAgICAgICAgICAgIG0gPSBxci5yb3dzO1xuXG4gICAgICAgIGlmICh2YWx1ZS5yb3dzICE9PSBtKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggcm93IGRpbWVuc2lvbnMgbXVzdCBhZ3JlZScpO1xuICAgICAgICBpZiAoIXRoaXMuaXNGdWxsUmFuaygpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgcmFuayBkZWZpY2llbnQnKTtcblxuICAgICAgICB2YXIgY291bnQgPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IHZhbHVlLmNsb25lKCksXG4gICAgICAgICAgICBuID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIGksIGosIGssIHM7XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gcXJbaV1ba10gKiBYW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gKz0gcyAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGsgPSBuIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgWFtrXVtqXSAvPSB0aGlzLlJkaWFnW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gLT0gWFtrXVtqXSAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBYLnN1Yk1hdHJpeCgwLCBuIC0gMSwgMCwgY291bnQgLSAxKTtcbiAgICB9LFxuICAgIGlzRnVsbFJhbms6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSB0aGlzLlFSLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5SZGlhZ1tpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuICAgIGdldCB1cHBlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHZhciBxciA9IHRoaXMuUVIsXG4gICAgICAgICAgICBuID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KG4sIG4pLFxuICAgICAgICAgICAgaSwgajtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gcXJbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSB0aGlzLlJkaWFnW2ldO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9LFxuICAgIGdldCBvcnRob2dvbmFsTWF0cml4KCkge1xuICAgICAgICB2YXIgcXIgPSB0aGlzLlFSLFxuICAgICAgICAgICAgcm93cyA9IHFyLnJvd3MsXG4gICAgICAgICAgICBjb2x1bW5zID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpLFxuICAgICAgICAgICAgaSwgaiwgaywgcztcblxuICAgICAgICBmb3IgKGsgPSBjb2x1bW5zIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBYW2ldW2tdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFhba11ba10gPSAxO1xuICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChxcltrXVtrXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcyArPSBxcltpXVtrXSAqIFhbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBYW2ldW2pdICs9IHMgKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFFyRGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbnZhciBoeXBvdGVudXNlID0gdXRpbC5oeXBvdGVudXNlO1xudmFyIGdldEZpbGxlZDJEQXJyYXkgPSB1dGlsLmdldEZpbGxlZDJEQXJyYXk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKHZhbHVlLCBvcHRpb25zKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKHZhbHVlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIgbSA9IHZhbHVlLnJvd3MsXG4gICAgICAgIG4gPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICBudSA9IE1hdGgubWluKG0sIG4pO1xuXG4gICAgdmFyIHdhbnR1ID0gdHJ1ZSwgd2FudHYgPSB0cnVlO1xuICAgIGlmIChvcHRpb25zLmNvbXB1dGVMZWZ0U2luZ3VsYXJWZWN0b3JzID09PSBmYWxzZSlcbiAgICAgICAgd2FudHUgPSBmYWxzZTtcbiAgICBpZiAob3B0aW9ucy5jb21wdXRlUmlnaHRTaW5ndWxhclZlY3RvcnMgPT09IGZhbHNlKVxuICAgICAgICB3YW50diA9IGZhbHNlO1xuICAgIHZhciBhdXRvVHJhbnNwb3NlID0gb3B0aW9ucy5hdXRvVHJhbnNwb3NlID09PSB0cnVlO1xuXG4gICAgdmFyIHN3YXBwZWQgPSBmYWxzZTtcbiAgICB2YXIgYTtcbiAgICBpZiAobSA8IG4pIHtcbiAgICAgICAgaWYgKCFhdXRvVHJhbnNwb3NlKSB7XG4gICAgICAgICAgICBhID0gdmFsdWUuY2xvbmUoKTtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignQ29tcHV0aW5nIFNWRCBvbiBhIG1hdHJpeCB3aXRoIG1vcmUgY29sdW1ucyB0aGFuIHJvd3MuIENvbnNpZGVyIGVuYWJsaW5nIGF1dG9UcmFuc3Bvc2UnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGEgPSB2YWx1ZS50cmFuc3Bvc2UoKTtcbiAgICAgICAgICAgIG0gPSBhLnJvd3M7XG4gICAgICAgICAgICBuID0gYS5jb2x1bW5zO1xuICAgICAgICAgICAgc3dhcHBlZCA9IHRydWU7XG4gICAgICAgICAgICB2YXIgYXV4ID0gd2FudHU7XG4gICAgICAgICAgICB3YW50dSA9IHdhbnR2O1xuICAgICAgICAgICAgd2FudHYgPSBhdXg7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBhID0gdmFsdWUuY2xvbmUoKTtcbiAgICB9XG5cbiAgICB2YXIgcyA9IG5ldyBBcnJheShNYXRoLm1pbihtICsgMSwgbikpLFxuICAgICAgICBVID0gZ2V0RmlsbGVkMkRBcnJheShtLCBudSwgMCksXG4gICAgICAgIFYgPSBnZXRGaWxsZWQyREFycmF5KG4sIG4sIDApLFxuICAgICAgICBlID0gbmV3IEFycmF5KG4pLFxuICAgICAgICB3b3JrID0gbmV3IEFycmF5KG0pO1xuXG4gICAgdmFyIG5jdCA9IE1hdGgubWluKG0gLSAxLCBuKTtcbiAgICB2YXIgbnJ0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4obiAtIDIsIG0pKTtcblxuICAgIHZhciBpLCBqLCBrLCBwLCB0LCBrcywgZiwgY3MsIHNuLCBtYXgsIGthc2UsXG4gICAgICAgIHNjYWxlLCBzcCwgc3BtMSwgZXBtMSwgc2ssIGVrLCBiLCBjLCBzaGlmdCwgZztcblxuICAgIGZvciAoayA9IDAsIG1heCA9IE1hdGgubWF4KG5jdCwgbnJ0KTsgayA8IG1heDsgaysrKSB7XG4gICAgICAgIGlmIChrIDwgbmN0KSB7XG4gICAgICAgICAgICBzW2tdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzW2tdID0gaHlwb3RlbnVzZShzW2tdLCBhW2ldW2tdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzW2tdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGFba11ba10gPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNba10gPSAtc1trXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhW2ldW2tdIC89IHNba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFba11ba10gKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNba10gPSAtc1trXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBpZiAoKGsgPCBuY3QpICYmIChzW2tdICE9PSAwKSkge1xuICAgICAgICAgICAgICAgIHQgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCArPSBhW2ldW2tdICogYVtpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdCA9IC10IC8gYVtrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFbaV1bal0gKz0gdCAqIGFbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZVtqXSA9IGFba11bal07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2FudHUgJiYgKGsgPCBuY3QpKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgVVtpXVtrXSA9IGFbaV1ba107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoayA8IG5ydCkge1xuICAgICAgICAgICAgZVtrXSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIGVba10gPSBoeXBvdGVudXNlKGVba10sIGVbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVba10gIT09IDApIHtcbiAgICAgICAgICAgICAgICBpZiAoZVtrICsgMV0gPCAwKVxuICAgICAgICAgICAgICAgICAgICBlW2tdID0gLWVba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZVtpXSAvPSBlW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW2sgKyAxXSArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZVtrXSA9IC1lW2tdO1xuICAgICAgICAgICAgaWYgKChrICsgMSA8IG0pICYmIChlW2tdICE9PSAwKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHdvcmtbaV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgd29ya1tpXSArPSBlW2pdICogYVtpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gLWVbal0gLyBlW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFbaV1bal0gKz0gdCAqIHdvcmtbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gZVtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwID0gTWF0aC5taW4obiwgbSArIDEpO1xuICAgIGlmIChuY3QgPCBuKSB7XG4gICAgICAgIHNbbmN0XSA9IGFbbmN0XVtuY3RdO1xuICAgIH1cbiAgICBpZiAobSA8IHApIHtcbiAgICAgICAgc1twIC0gMV0gPSAwO1xuICAgIH1cbiAgICBpZiAobnJ0ICsgMSA8IHApIHtcbiAgICAgICAgZVtucnRdID0gYVtucnRdW3AgLSAxXTtcbiAgICB9XG4gICAgZVtwIC0gMV0gPSAwO1xuXG4gICAgaWYgKHdhbnR1KSB7XG4gICAgICAgIGZvciAoaiA9IG5jdDsgaiA8IG51OyBqKyspIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBVW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFVbal1bal0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoayA9IG5jdCAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBpZiAoc1trXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbnU7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdCArPSBVW2ldW2tdICogVVtpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0ID0gLXQgLyBVW2tdW2tdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2pdICs9IHQgKiBVW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IC1VW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBVW2tdW2tdID0gMSArIFVba11ba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGsgLSAxOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFVbaV1ba10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBVW2tdW2tdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh3YW50dikge1xuICAgICAgICBmb3IgKGsgPSBuIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGlmICgoayA8IG5ydCkgJiYgKGVba10gIT09IDApKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ICs9IFZbaV1ba10gKiBWW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQgPSAtdCAvIFZbayArIDFdW2tdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqXSArPSB0ICogVltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBWW2ldW2tdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFZba11ba10gPSAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHBwID0gcCAtIDEsXG4gICAgICAgIGl0ZXIgPSAwLFxuICAgICAgICBlcHMgPSBNYXRoLnBvdygyLCAtNTIpO1xuICAgIHdoaWxlIChwID4gMCkge1xuICAgICAgICBmb3IgKGsgPSBwIC0gMjsgayA+PSAtMTsgay0tKSB7XG4gICAgICAgICAgICBpZiAoayA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhlW2tdKSA8PSBlcHMgKiAoTWF0aC5hYnMoc1trXSkgKyBNYXRoLmFicyhzW2sgKyAxXSkpKSB7XG4gICAgICAgICAgICAgICAgZVtrXSA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGsgPT09IHAgLSAyKSB7XG4gICAgICAgICAgICBrYXNlID0gNDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoa3MgPSBwIC0gMTsga3MgPj0gazsga3MtLSkge1xuICAgICAgICAgICAgICAgIGlmIChrcyA9PT0gaykge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdCA9IChrcyAhPT0gcCA/IE1hdGguYWJzKGVba3NdKSA6IDApICsgKGtzICE9PSBrICsgMSA/IE1hdGguYWJzKGVba3MgLSAxXSkgOiAwKTtcbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoc1trc10pIDw9IGVwcyAqIHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc1trc10gPSAwO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoa3MgPT09IGspIHtcbiAgICAgICAgICAgICAgICBrYXNlID0gMztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa3MgPT09IHAgLSAxKSB7XG4gICAgICAgICAgICAgICAga2FzZSA9IDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGthc2UgPSAyO1xuICAgICAgICAgICAgICAgIGsgPSBrcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGsrKztcblxuICAgICAgICBzd2l0Y2ggKGthc2UpIHtcbiAgICAgICAgICAgIGNhc2UgMToge1xuICAgICAgICAgICAgICAgIGYgPSBlW3AgLSAyXTtcbiAgICAgICAgICAgICAgICBlW3AgLSAyXSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gcCAtIDI7IGogPj0gazsgai0tKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKHNbal0sIGYpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IHNbal0gLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGogIT09IGspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGYgPSAtc24gKiBlW2ogLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVbaiAtIDFdID0gY3MgKiBlW2ogLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBWW2ldW2pdICsgc24gKiBWW2ldW3AgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW3AgLSAxXSA9IC1zbiAqIFZbaV1bal0gKyBjcyAqIFZbaV1bcCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAyIDoge1xuICAgICAgICAgICAgICAgIGYgPSBlW2sgLSAxXTtcbiAgICAgICAgICAgICAgICBlW2sgLSAxXSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IHA7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gaHlwb3RlbnVzZShzW2pdLCBmKTtcbiAgICAgICAgICAgICAgICAgICAgY3MgPSBzW2pdIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc24gPSBmIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc1tqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIGYgPSAtc24gKiBlW2pdO1xuICAgICAgICAgICAgICAgICAgICBlW2pdID0gY3MgKiBlW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBVW2ldW2pdICsgc24gKiBVW2ldW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2sgLSAxXSA9IC1zbiAqIFVbaV1bal0gKyBjcyAqIFVbaV1bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAzIDoge1xuICAgICAgICAgICAgICAgIHNjYWxlID0gTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5hYnMoc1twIC0gMV0pLCBNYXRoLmFicyhzW3AgLSAyXSkpLCBNYXRoLmFicyhlW3AgLSAyXSkpLCBNYXRoLmFicyhzW2tdKSksIE1hdGguYWJzKGVba10pKTtcbiAgICAgICAgICAgICAgICBzcCA9IHNbcCAtIDFdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgc3BtMSA9IHNbcCAtIDJdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgZXBtMSA9IGVbcCAtIDJdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgc2sgPSBzW2tdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgZWsgPSBlW2tdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgYiA9ICgoc3BtMSArIHNwKSAqIChzcG0xIC0gc3ApICsgZXBtMSAqIGVwbTEpIC8gMjtcbiAgICAgICAgICAgICAgICBjID0gKHNwICogZXBtMSkgKiAoc3AgKiBlcG0xKTtcbiAgICAgICAgICAgICAgICBzaGlmdCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKChiICE9PSAwKSB8fCAoYyAhPT0gMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hpZnQgPSBNYXRoLnNxcnQoYiAqIGIgKyBjKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGIgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaGlmdCA9IC1zaGlmdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzaGlmdCA9IGMgLyAoYiArIHNoaWZ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZiA9IChzayArIHNwKSAqIChzayAtIHNwKSArIHNoaWZ0O1xuICAgICAgICAgICAgICAgIGcgPSBzayAqIGVrO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGs7IGogPCBwIC0gMTsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKGYsIGcpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGcgLyB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoaiAhPT0gaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZVtqIC0gMV0gPSB0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGYgPSBjcyAqIHNbal0gKyBzbiAqIGVbal07XG4gICAgICAgICAgICAgICAgICAgIGVbal0gPSBjcyAqIGVbal0gLSBzbiAqIHNbal07XG4gICAgICAgICAgICAgICAgICAgIGcgPSBzbiAqIHNbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBzW2ogKyAxXSA9IGNzICogc1tqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBjcyAqIFZbaV1bal0gKyBzbiAqIFZbaV1baiArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1baiArIDFdID0gLXNuICogVltpXVtqXSArIGNzICogVltpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IGh5cG90ZW51c2UoZiwgZyk7XG4gICAgICAgICAgICAgICAgICAgIGNzID0gZiAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNuID0gZyAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNbal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBmID0gY3MgKiBlW2pdICsgc24gKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgc1tqICsgMV0gPSAtc24gKiBlW2pdICsgY3MgKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgZyA9IHNuICogZVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGVbaiArIDFdID0gY3MgKiBlW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR1ICYmIChqIDwgbSAtIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IGNzICogVVtpXVtqXSArIHNuICogVVtpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtqICsgMV0gPSAtc24gKiBVW2ldW2pdICsgY3MgKiBVW2ldW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW3AgLSAyXSA9IGY7XG4gICAgICAgICAgICAgICAgaXRlciA9IGl0ZXIgKyAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSA0OiB7XG4gICAgICAgICAgICAgICAgaWYgKHNba10gPD0gMCkge1xuICAgICAgICAgICAgICAgICAgICBzW2tdID0gKHNba10gPCAwID8gLXNba10gOiAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IHBwOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gLVZbaV1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKGsgPCBwcCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc1trXSA+PSBzW2sgKyAxXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IHNba107XG4gICAgICAgICAgICAgICAgICAgIHNba10gPSBzW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgc1trICsgMV0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYgJiYgKGsgPCBuIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gVltpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrICsgMV0gPSBWW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1ba10gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dSAmJiAoayA8IG0gLSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBVW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2sgKyAxXSA9IFVbaV1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaysrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgICAgICAgICBwLS07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3dhcHBlZCkge1xuICAgICAgICB2YXIgdG1wID0gVjtcbiAgICAgICAgViA9IFU7XG4gICAgICAgIFUgPSB0bXA7XG4gICAgfVxuXG4gICAgdGhpcy5tID0gbTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMucyA9IHM7XG4gICAgdGhpcy5VID0gVTtcbiAgICB0aGlzLlYgPSBWO1xufVxuXG5TaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgZ2V0IGNvbmRpdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc1swXSAvIHRoaXMuc1tNYXRoLm1pbih0aGlzLm0sIHRoaXMubikgLSAxXTtcbiAgICB9LFxuICAgIGdldCBub3JtMigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc1swXTtcbiAgICB9LFxuICAgIGdldCByYW5rKCkge1xuICAgICAgICB2YXIgZXBzID0gTWF0aC5wb3coMiwgLTUyKSxcbiAgICAgICAgICAgIHRvbCA9IE1hdGgubWF4KHRoaXMubSwgdGhpcy5uKSAqIHRoaXMuc1swXSAqIGVwcyxcbiAgICAgICAgICAgIHIgPSAwLFxuICAgICAgICAgICAgcyA9IHRoaXMucztcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc1tpXSA+IHRvbCkge1xuICAgICAgICAgICAgICAgIHIrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcjtcbiAgICB9LFxuICAgIGdldCBkaWFnb25hbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucztcbiAgICB9LFxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hY2NvcmQtbmV0L2ZyYW1ld29yay9ibG9iL2RldmVsb3BtZW50L1NvdXJjZXMvQWNjb3JkLk1hdGgvRGVjb21wb3NpdGlvbnMvU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24uY3NcbiAgICBnZXQgdGhyZXNob2xkKCkge1xuICAgICAgICByZXR1cm4gKE1hdGgucG93KDIsIC01MikgLyAyKSAqIE1hdGgubWF4KHRoaXMubSwgdGhpcy5uKSAqIHRoaXMuc1swXTtcbiAgICB9LFxuICAgIGdldCBsZWZ0U2luZ3VsYXJWZWN0b3JzKCkge1xuICAgICAgICBpZiAoIU1hdHJpeC5pc01hdHJpeCh0aGlzLlUpKSB7XG4gICAgICAgICAgICB0aGlzLlUgPSBuZXcgTWF0cml4KHRoaXMuVSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuVTtcbiAgICB9LFxuICAgIGdldCByaWdodFNpbmd1bGFyVmVjdG9ycygpIHtcbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgodGhpcy5WKSkge1xuICAgICAgICAgICAgdGhpcy5WID0gbmV3IE1hdHJpeCh0aGlzLlYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLlY7XG4gICAgfSxcbiAgICBnZXQgZGlhZ29uYWxNYXRyaXgoKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguZGlhZyh0aGlzLnMpO1xuICAgIH0sXG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuXG4gICAgICAgIHZhciBZID0gdmFsdWUsXG4gICAgICAgICAgICBlID0gdGhpcy50aHJlc2hvbGQsXG4gICAgICAgICAgICBzY29scyA9IHRoaXMucy5sZW5ndGgsXG4gICAgICAgICAgICBMcyA9IE1hdHJpeC56ZXJvcyhzY29scywgc2NvbHMpLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgc2NvbHM7IGkrKykge1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXMuc1tpXSkgPD0gZSkge1xuICAgICAgICAgICAgICAgIExzW2ldW2ldID0gMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgTHNbaV1baV0gPSAxIC8gdGhpcy5zW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIFUgPSB0aGlzLlU7XG4gICAgICAgIHZhciBWID0gdGhpcy5yaWdodFNpbmd1bGFyVmVjdG9ycztcblxuICAgICAgICB2YXIgVkwgPSBWLm1tdWwoTHMpLFxuICAgICAgICAgICAgdnJvd3MgPSBWLnJvd3MsXG4gICAgICAgICAgICB1cm93cyA9IFUubGVuZ3RoLFxuICAgICAgICAgICAgVkxVID0gTWF0cml4Lnplcm9zKHZyb3dzLCB1cm93cyksXG4gICAgICAgICAgICBqLCBrLCBzdW07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1cm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgc3VtID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgc2NvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gVkxbaV1ba10gKiBVW2pdW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBWTFVbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gVkxVLm1tdWwoWSk7XG4gICAgfSxcbiAgICBzb2x2ZUZvckRpYWdvbmFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc29sdmUoTWF0cml4LmRpYWcodmFsdWUpKTtcbiAgICB9LFxuICAgIGludmVyc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIFYgPSB0aGlzLlY7XG4gICAgICAgIHZhciBlID0gdGhpcy50aHJlc2hvbGQsXG4gICAgICAgICAgICB2cm93cyA9IFYubGVuZ3RoLFxuICAgICAgICAgICAgdmNvbHMgPSBWWzBdLmxlbmd0aCxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHZyb3dzLCB0aGlzLnMubGVuZ3RoKSxcbiAgICAgICAgICAgIGksIGo7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB2Y29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXMuc1tqXSkgPiBlKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSBWW2ldW2pdIC8gdGhpcy5zW2pdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBVID0gdGhpcy5VO1xuXG4gICAgICAgIHZhciB1cm93cyA9IFUubGVuZ3RoLFxuICAgICAgICAgICAgdWNvbHMgPSBVWzBdLmxlbmd0aCxcbiAgICAgICAgICAgIFkgPSBuZXcgTWF0cml4KHZyb3dzLCB1cm93cyksXG4gICAgICAgICAgICBrLCBzdW07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1cm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgc3VtID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgdWNvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gWFtpXVtrXSAqIFVbal1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFlbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gWTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmh5cG90ZW51c2UgPSBmdW5jdGlvbiBoeXBvdGVudXNlKGEsIGIpIHtcbiAgICBpZiAoTWF0aC5hYnMoYSkgPiBNYXRoLmFicyhiKSkge1xuICAgICAgICB2YXIgciA9IGIgLyBhO1xuICAgICAgICByZXR1cm4gTWF0aC5hYnMoYSkgKiBNYXRoLnNxcnQoMSArIHIgKiByKTtcbiAgICB9XG4gICAgaWYgKGIgIT09IDApIHtcbiAgICAgICAgdmFyIHIgPSBhIC8gYjtcbiAgICAgICAgcmV0dXJuIE1hdGguYWJzKGIpICogTWF0aC5zcXJ0KDEgKyByICogcik7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxuLy8gRm9yIHVzZSBpbiB0aGUgZGVjb21wb3NpdGlvbiBhbGdvcml0aG1zLiBXaXRoIGJpZyBtYXRyaWNlcywgYWNjZXNzIHRpbWUgaXNcbi8vIHRvbyBsb25nIG9uIGVsZW1lbnRzIGZyb20gYXJyYXkgc3ViY2xhc3Ncbi8vIHRvZG8gY2hlY2sgd2hlbiBpdCBpcyBmaXhlZCBpbiB2OFxuLy8gaHR0cDovL2pzcGVyZi5jb20vYWNjZXNzLWFuZC13cml0ZS1hcnJheS1zdWJjbGFzc1xuZXhwb3J0cy5nZXRFbXB0eTJEQXJyYXkgPSBmdW5jdGlvbiAocm93cywgY29sdW1ucykge1xuICAgIHZhciBhcnJheSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IG5ldyBBcnJheShjb2x1bW5zKTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xufTtcblxuZXhwb3J0cy5nZXRGaWxsZWQyREFycmF5ID0gZnVuY3Rpb24gKHJvd3MsIGNvbHVtbnMsIHZhbHVlKSB7XG4gICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gbmV3IEFycmF5KGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgYXJyYXlbaV1bal0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi9tYXRyaXgnKTtcblxudmFyIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9zdmQnKTtcbnZhciBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvZXZkJyk7XG52YXIgTHVEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9sdScpO1xudmFyIFFyRGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvcXInKTtcbnZhciBDaG9sZXNreURlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL2Nob2xlc2t5Jyk7XG5cbmZ1bmN0aW9uIGludmVyc2UobWF0cml4KSB7XG4gICAgbWF0cml4ID0gTWF0cml4LmNoZWNrTWF0cml4KG1hdHJpeCk7XG4gICAgcmV0dXJuIHNvbHZlKG1hdHJpeCwgTWF0cml4LmV5ZShtYXRyaXgucm93cykpO1xufVxuXG5NYXRyaXguaW52ZXJzZSA9IE1hdHJpeC5pbnYgPSBpbnZlcnNlO1xuTWF0cml4LnByb3RvdHlwZS5pbnZlcnNlID0gTWF0cml4LnByb3RvdHlwZS5pbnYgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG59O1xuXG5mdW5jdGlvbiBzb2x2ZShsZWZ0SGFuZFNpZGUsIHJpZ2h0SGFuZFNpZGUpIHtcbiAgICBsZWZ0SGFuZFNpZGUgPSBNYXRyaXguY2hlY2tNYXRyaXgobGVmdEhhbmRTaWRlKTtcbiAgICByaWdodEhhbmRTaWRlID0gTWF0cml4LmNoZWNrTWF0cml4KHJpZ2h0SGFuZFNpZGUpO1xuICAgIHJldHVybiBsZWZ0SGFuZFNpZGUuaXNTcXVhcmUoKSA/IG5ldyBMdURlY29tcG9zaXRpb24obGVmdEhhbmRTaWRlKS5zb2x2ZShyaWdodEhhbmRTaWRlKSA6IG5ldyBRckRlY29tcG9zaXRpb24obGVmdEhhbmRTaWRlKS5zb2x2ZShyaWdodEhhbmRTaWRlKTtcbn1cblxuTWF0cml4LnNvbHZlID0gc29sdmU7XG5NYXRyaXgucHJvdG90eXBlLnNvbHZlID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgcmV0dXJuIHNvbHZlKHRoaXMsIG90aGVyKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uOiBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBTVkQ6IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uOiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBFVkQ6IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIEx1RGVjb21wb3NpdGlvbjogTHVEZWNvbXBvc2l0aW9uLFxuICAgIExVOiBMdURlY29tcG9zaXRpb24sXG4gICAgUXJEZWNvbXBvc2l0aW9uOiBRckRlY29tcG9zaXRpb24sXG4gICAgUVI6IFFyRGVjb21wb3NpdGlvbixcbiAgICBDaG9sZXNreURlY29tcG9zaXRpb246IENob2xlc2t5RGVjb21wb3NpdGlvbixcbiAgICBDSE86IENob2xlc2t5RGVjb21wb3NpdGlvbixcbiAgICBpbnZlcnNlOiBpbnZlcnNlLFxuICAgIHNvbHZlOiBzb2x2ZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL21hdHJpeCcpO1xubW9kdWxlLmV4cG9ydHMuRGVjb21wb3NpdGlvbnMgPSBtb2R1bGUuZXhwb3J0cy5EQyA9IHJlcXVpcmUoJy4vZGVjb21wb3NpdGlvbnMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBSZWFsIG1hdHJpeFxuICovXG5jbGFzcyBNYXRyaXggZXh0ZW5kcyBBcnJheSB7XG4gICAgLyoqXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHtudW1iZXJ8QXJyYXl8TWF0cml4fSBuUm93cyAtIE51bWJlciBvZiByb3dzIG9mIHRoZSBuZXcgbWF0cml4LFxuICAgICAqIDJEIGFycmF5IGNvbnRhaW5pbmcgdGhlIGRhdGEgb3IgTWF0cml4IGluc3RhbmNlIHRvIGNsb25lXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtuQ29sdW1uc10gLSBOdW1iZXIgb2YgY29sdW1ucyBvZiB0aGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG5Sb3dzLCBuQ29sdW1ucykge1xuICAgICAgICBpZiAoTWF0cml4LmlzTWF0cml4KG5Sb3dzKSkge1xuICAgICAgICAgICAgcmV0dXJuIG5Sb3dzLmNsb25lKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoTnVtYmVyLmlzSW50ZWdlcihuUm93cykgJiYgblJvd3MgPiAwKSB7IC8vIENyZWF0ZSBhbiBlbXB0eSBtYXRyaXhcbiAgICAgICAgICAgIHN1cGVyKG5Sb3dzKTtcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNJbnRlZ2VyKG5Db2x1bW5zKSAmJiBuQ29sdW1ucyA+IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5Sb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1tpXSA9IG5ldyBBcnJheShuQ29sdW1ucyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCduQ29sdW1ucyBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoblJvd3MpKSB7IC8vIENvcHkgdGhlIHZhbHVlcyBmcm9tIHRoZSAyRCBhcnJheVxuICAgICAgICAgICAgdmFyIG1hdHJpeCA9IG5Sb3dzO1xuICAgICAgICAgICAgblJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgICAgICAgICAgbkNvbHVtbnMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBuQ29sdW1ucyAhPT0gJ251bWJlcicgfHwgbkNvbHVtbnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdEYXRhIG11c3QgYmUgYSAyRCBhcnJheSB3aXRoIGF0IGxlYXN0IG9uZSBlbGVtZW50Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdXBlcihuUm93cyk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5Sb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAobWF0cml4W2ldLmxlbmd0aCAhPT0gbkNvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0luY29uc2lzdGVudCBhcnJheSBkaW1lbnNpb25zJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXNbaV0gPSBbXS5jb25jYXQobWF0cml4W2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXIgb3IgYW4gYXJyYXknKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJvd3MgPSBuUm93cztcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gbkNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIE1hdHJpeCB3aXRoIHRoZSBjaG9zZW4gZGltZW5zaW9ucyBmcm9tIGEgMUQgYXJyYXlcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbmV3Um93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG5ld0NvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IG5ld0RhdGEgLSBBIDFEIGFycmF5IGNvbnRhaW5pbmcgZGF0YSBmb3IgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZnJvbTFEQXJyYXkobmV3Um93cywgbmV3Q29sdW1ucywgbmV3RGF0YSkge1xuICAgICAgICB2YXIgbGVuZ3RoID0gbmV3Um93cyAqIG5ld0NvbHVtbnM7XG4gICAgICAgIGlmIChsZW5ndGggIT09IG5ld0RhdGEubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignRGF0YSBsZW5ndGggZG9lcyBub3QgbWF0Y2ggZ2l2ZW4gZGltZW5zaW9ucycpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KG5ld1Jvd3MsIG5ld0NvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCBuZXdSb3dzOyByb3crKykge1xuICAgICAgICAgICAgZm9yICh2YXIgY29sdW1uID0gMDsgY29sdW1uIDwgbmV3Q29sdW1uczsgY29sdW1uKyspIHtcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbcm93XVtjb2x1bW5dID0gbmV3RGF0YVtyb3cgKiBuZXdDb2x1bW5zICsgY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSByb3cgdmVjdG9yLCBhIG1hdHJpeCB3aXRoIG9ubHkgb25lIHJvdy5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBuZXdEYXRhIC0gQSAxRCBhcnJheSBjb250YWluaW5nIGRhdGEgZm9yIHRoZSB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIHJvd1ZlY3RvcihuZXdEYXRhKSB7XG4gICAgICAgIHZhciB2ZWN0b3IgPSBuZXcgTWF0cml4KDEsIG5ld0RhdGEubGVuZ3RoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2ZWN0b3JbMF1baV0gPSBuZXdEYXRhW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2ZWN0b3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIGNvbHVtbiB2ZWN0b3IsIGEgbWF0cml4IHdpdGggb25seSBvbmUgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IG5ld0RhdGEgLSBBIDFEIGFycmF5IGNvbnRhaW5pbmcgZGF0YSBmb3IgdGhlIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgY29sdW1uVmVjdG9yKG5ld0RhdGEpIHtcbiAgICAgICAgdmFyIHZlY3RvciA9IG5ldyBNYXRyaXgobmV3RGF0YS5sZW5ndGgsIDEpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5ld0RhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZlY3RvcltpXVswXSA9IG5ld0RhdGFbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZlY3RvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGVtcHR5IG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSB1bmRlZmluZWQuIFNhbWUgYXMgdXNpbmcgbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZW1wdHkocm93cywgY29sdW1ucykge1xuICAgICAgICByZXR1cm4gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHNldCB0byB6ZXJvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyB6ZXJvcyhyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguZW1wdHkocm93cywgY29sdW1ucykuZmlsbCgwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHNldCB0byBvbmUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIG9uZXMocm93cywgY29sdW1ucykge1xuICAgICAgICByZXR1cm4gTWF0cml4LmVtcHR5KHJvd3MsIGNvbHVtbnMpLmZpbGwoMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSByYW5kb21seSBzZXQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBbcm5nXSAtIFJhbmRvbSBudW1iZXIgZ2VuZXJhdG9yIChkZWZhdWx0OiBNYXRoLnJhbmRvbSlcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyByYW5kKHJvd3MsIGNvbHVtbnMsIHJuZykge1xuICAgICAgICBpZiAocm5nID09PSB1bmRlZmluZWQpIHJuZyA9IE1hdGgucmFuZG9tO1xuICAgICAgICB2YXIgbWF0cml4ID0gTWF0cml4LmVtcHR5KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBtYXRyaXhbaV1bal0gPSBybmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYW4gaWRlbnRpdHkgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbi4gVmFsdWVzIG9mIHRoZSBkaWFnb25hbCB3aWxsIGJlIDEgYW5kIG90aGVycyB3aWxsIGJlIDAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbY29sdW1uc10gLSBOdW1iZXIgb2YgY29sdW1ucyAoRGVmYXVsdDogcm93cylcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgaWRlbnRpdHkgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGV5ZShyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIGlmIChjb2x1bW5zID09PSB1bmRlZmluZWQpIGNvbHVtbnMgPSByb3dzO1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4ocm93cywgY29sdW1ucyk7XG4gICAgICAgIHZhciBtYXRyaXggPSBNYXRyaXguemVyb3Mocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIG1hdHJpeFtpXVtpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgZGlhZ29uYWwgbWF0cml4IGJhc2VkIG9uIHRoZSBnaXZlbiBhcnJheS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkYXRhIC0gQXJyYXkgY29udGFpbmluZyB0aGUgZGF0YSBmb3IgdGhlIGRpYWdvbmFsXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtyb3dzXSAtIE51bWJlciBvZiByb3dzIChEZWZhdWx0OiBkYXRhLmxlbmd0aClcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2NvbHVtbnNdIC0gTnVtYmVyIG9mIGNvbHVtbnMgKERlZmF1bHQ6IHJvd3MpXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IGRpYWdvbmFsIG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBkaWFnKGRhdGEsIHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgdmFyIGwgPSBkYXRhLmxlbmd0aDtcbiAgICAgICAgaWYgKHJvd3MgPT09IHVuZGVmaW5lZCkgcm93cyA9IGw7XG4gICAgICAgIGlmIChjb2x1bW5zID09PSB1bmRlZmluZWQpIGNvbHVtbnMgPSByb3dzO1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4obCwgcm93cywgY29sdW1ucyk7XG4gICAgICAgIHZhciBtYXRyaXggPSBNYXRyaXguemVyb3Mocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIG1hdHJpeFtpXVtpXSA9IGRhdGFbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbWF0cml4IHdob3NlIGVsZW1lbnRzIGFyZSB0aGUgbWluaW11bSBiZXR3ZWVuIG1hdHJpeDEgYW5kIG1hdHJpeDJcbiAgICAgKiBAcGFyYW0gbWF0cml4MVxuICAgICAqIEBwYXJhbSBtYXRyaXgyXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdGF0aWMgbWluKG1hdHJpeDEsIG1hdHJpeDIpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBtYXRyaXgxLmxlbmd0aDtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSBtYXRyaXgxWzBdLmxlbmd0aDtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gTWF0aC5taW4obWF0cml4MVtpXVtqXSwgbWF0cml4MltpXVtqXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbWF0cml4IHdob3NlIGVsZW1lbnRzIGFyZSB0aGUgbWF4aW11bSBiZXR3ZWVuIG1hdHJpeDEgYW5kIG1hdHJpeDJcbiAgICAgKiBAcGFyYW0gbWF0cml4MVxuICAgICAqIEBwYXJhbSBtYXRyaXgyXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdGF0aWMgbWF4KG1hdHJpeDEsIG1hdHJpeDIpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBtYXRyaXgxLmxlbmd0aDtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSBtYXRyaXgxWzBdLmxlbmd0aDtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gTWF0aC5tYXgobWF0cml4MVtpXVtqXSwgbWF0cml4MltpXVtqXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayB0aGF0IHRoZSBwcm92aWRlZCB2YWx1ZSBpcyBhIE1hdHJpeCBhbmQgdHJpZXMgdG8gaW5zdGFudGlhdGUgb25lIGlmIG5vdFxuICAgICAqIEBwYXJhbSB2YWx1ZSAtIFRoZSB2YWx1ZSB0byBjaGVja1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3RhdGljIGNoZWNrTWF0cml4KHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguaXNNYXRyaXgodmFsdWUpID8gdmFsdWUgOiBuZXcgTWF0cml4KHZhbHVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGFyZ3VtZW50IGlzIGEgTWF0cml4LCBmYWxzZSBvdGhlcndpc2VcbiAgICAgKiBAcGFyYW0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHN0YXRpYyBpc01hdHJpeCh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gKHZhbHVlICE9IG51bGwpICYmICh2YWx1ZS5rbGFzcyA9PT0gJ01hdHJpeCcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSAtIFRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gdGhlIG1hdHJpeC5cbiAgICAgKi9cbiAgICBnZXQgc2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucm93cyAqIHRoaXMuY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBsaWVzIGEgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudCBvZiB0aGUgbWF0cml4LiBUaGUgZnVuY3Rpb24gaXMgY2FsbGVkIGluIHRoZSBtYXRyaXggKHRoaXMpIGNvbnRleHQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBGdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIHdpdGggdHdvIHBhcmFtZXRlcnMgOiBpIChyb3cpIGFuZCBqIChjb2x1bW4pXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFwcGx5KGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBpaSA9IHRoaXMucm93cztcbiAgICAgICAgdmFyIGpqID0gdGhpcy5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgaSwgaik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBleGFjdCBhbmQgaW5kZXBlbmRlbnQgY29weSBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBjbG9uZSgpIHtcbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgodGhpcy5yb3dzLCB0aGlzLmNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCB0aGlzLnJvd3M7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gPSAwOyBjb2x1bW4gPCB0aGlzLmNvbHVtbnM7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W3Jvd11bY29sdW1uXSA9IHRoaXNbcm93XVtjb2x1bW5dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyAxRCBhcnJheSBmaWxsZWQgcm93IGJ5IHJvdyB3aXRoIHRoZSBtYXRyaXggdmFsdWVzXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIHRvMURBcnJheSgpIHtcbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KHRoaXMuc2l6ZSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBhcnJheVtpICogdGhpcy5jb2x1bW5zICsgal0gPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcnJheTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgMkQgYXJyYXkgY29udGFpbmluZyBhIGNvcHkgb2YgdGhlIGRhdGFcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgdG8yREFycmF5KCkge1xuICAgICAgICB2YXIgY29weSA9IG5ldyBBcnJheSh0aGlzLnJvd3MpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb3B5W2ldID0gW10uY29uY2F0KHRoaXNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb3B5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaGFzIG9uZSByb3dcbiAgICAgKi9cbiAgICBpc1Jvd1ZlY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucm93cyA9PT0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyBvbmUgY29sdW1uXG4gICAgICovXG4gICAgaXNDb2x1bW5WZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbHVtbnMgPT09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBoYXMgb25lIHJvdyBvciBvbmUgY29sdW1uXG4gICAgICovXG4gICAgaXNWZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5yb3dzID09PSAxKSB8fCAodGhpcy5jb2x1bW5zID09PSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyB0aGUgc2FtZSBudW1iZXIgb2Ygcm93cyBhbmQgY29sdW1uc1xuICAgICAqL1xuICAgIGlzU3F1YXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yb3dzID09PSB0aGlzLmNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBpcyBzcXVhcmUgYW5kIGhhcyB0aGUgc2FtZSB2YWx1ZXMgb24gYm90aCBzaWRlcyBvZiB0aGUgZGlhZ29uYWxcbiAgICAgKi9cbiAgICBpc1N5bW1ldHJpYygpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNTcXVhcmUoKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDw9IGk7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSAhPT0gdGhpc1tqXVtpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBnaXZlbiBlbGVtZW50IG9mIHRoZSBtYXRyaXguIG1hdC5zZXQoMyw0LDEpIGlzIGVxdWl2YWxlbnQgdG8gbWF0WzNdWzRdPTFcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93SW5kZXggLSBJbmRleCBvZiB0aGUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbkluZGV4IC0gSW5kZXggb2YgdGhlIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSAtIFRoZSBuZXcgdmFsdWUgZm9yIHRoZSBlbGVtZW50XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldChyb3dJbmRleCwgY29sdW1uSW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIHRoaXNbcm93SW5kZXhdW2NvbHVtbkluZGV4XSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBnaXZlbiBlbGVtZW50IG9mIHRoZSBtYXRyaXguIG1hdC5nZXQoMyw0KSBpcyBlcXVpdmFsZW50IHRvIG1hdHJpeFszXVs0XVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dJbmRleCAtIEluZGV4IG9mIHRoZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uSW5kZXggLSBJbmRleCBvZiB0aGUgY29sdW1uXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQocm93SW5kZXgsIGNvbHVtbkluZGV4KSB7XG4gICAgICAgIHJldHVybiB0aGlzW3Jvd0luZGV4XVtjb2x1bW5JbmRleF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlsbHMgdGhlIG1hdHJpeCB3aXRoIGEgZ2l2ZW4gdmFsdWUuIEFsbCBlbGVtZW50cyB3aWxsIGJlIHNldCB0byB0aGlzIHZhbHVlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSAtIE5ldyB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBmaWxsKHZhbHVlKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTmVnYXRlcyB0aGUgbWF0cml4LiBBbGwgZWxlbWVudHMgd2lsbCBiZSBtdWx0aXBsaWVkIGJ5ICgtMSlcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbmVnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5tdWxTKC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IGFycmF5IGZyb20gdGhlIGdpdmVuIHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBnZXRSb3coaW5kZXgpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIHJldHVybiBbXS5jb25jYXQodGhpc1tpbmRleF0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgcm93IHZlY3RvciBmcm9tIHRoZSBnaXZlbiByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIGdldFJvd1ZlY3RvcihpbmRleCkge1xuICAgICAgICByZXR1cm4gTWF0cml4LnJvd1ZlY3Rvcih0aGlzLmdldFJvdyhpbmRleCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSByb3cgYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldFJvdyhpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tSb3dWZWN0b3IodGhpcywgYXJyYXksIHRydWUpO1xuICAgICAgICB0aGlzW2luZGV4XSA9IGFycmF5O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgcm93IGZyb20gdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHJlbW92ZVJvdyhpbmRleCkge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgaWYgKHRoaXMucm93cyA9PT0gMSlcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBIG1hdHJpeCBjYW5ub3QgaGF2ZSBsZXNzIHRoYW4gb25lIHJvdycpO1xuICAgICAgICB0aGlzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIHRoaXMucm93cyAtPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcm93IGF0IHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbaW5kZXggPSB0aGlzLnJvd3NdIC0gUm93IGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFkZFJvdyhpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgaWYgKGFycmF5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGFycmF5ID0gaW5kZXg7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMucm93cztcbiAgICAgICAgfVxuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4LCB0cnVlKTtcbiAgICAgICAgYXJyYXkgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCBhcnJheSwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuc3BsaWNlKGluZGV4LCAwLCBhcnJheSk7XG4gICAgICAgIHRoaXMucm93cyArPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTd2FwcyB0d28gcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cxIC0gRmlyc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdzIgLSBTZWNvbmQgcm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN3YXBSb3dzKHJvdzEsIHJvdzIpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cxKTtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cyKTtcbiAgICAgICAgdmFyIHRlbXAgPSB0aGlzW3JvdzFdO1xuICAgICAgICB0aGlzW3JvdzFdID0gdGhpc1tyb3cyXTtcbiAgICAgICAgdGhpc1tyb3cyXSA9IHRlbXA7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgYXJyYXkgZnJvbSB0aGUgZ2l2ZW4gY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIGdldENvbHVtbihpbmRleCkge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IG5ldyBBcnJheSh0aGlzLnJvd3MpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb2x1bW5baV0gPSB0aGlzW2ldW2luZGV4XTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgY29sdW1uIHZlY3RvciBmcm9tIHRoZSBnaXZlbiBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIGdldENvbHVtblZlY3RvcihpbmRleCkge1xuICAgICAgICByZXR1cm4gTWF0cml4LmNvbHVtblZlY3Rvcih0aGlzLmdldENvbHVtbihpbmRleCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBjb2x1bW4gYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldENvbHVtbihpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgYXJyYXkpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2luZGV4XSA9IGFycmF5W2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSBjb2x1bW4gZnJvbSB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgcmVtb3ZlQ29sdW1uKGluZGV4KSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBpZiAodGhpcy5jb2x1bW5zID09PSAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0EgbWF0cml4IGNhbm5vdCBoYXZlIGxlc3MgdGhhbiBvbmUgY29sdW1uJyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV0uc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbHVtbnMgLT0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGNvbHVtbiBhdCB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2luZGV4ID0gdGhpcy5jb2x1bW5zXSAtIENvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSBhcnJheSAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRDb2x1bW4oaW5kZXgsIGFycmF5KSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJyYXkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBhcnJheSA9IGluZGV4O1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLmNvbHVtbnM7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCwgdHJ1ZSk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgYXJyYXkpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldLnNwbGljZShpbmRleCwgMCwgYXJyYXlbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29sdW1ucyArPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTd2FwcyB0d28gY29sdW1uc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4xIC0gRmlyc3QgY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbjIgLSBTZWNvbmQgY29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN3YXBDb2x1bW5zKGNvbHVtbjEsIGNvbHVtbjIpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4xKTtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4yKTtcbiAgICAgICAgdmFyIHRlbXAsIHJvdztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgcm93ID0gdGhpc1tpXTtcbiAgICAgICAgICAgIHRlbXAgPSByb3dbY29sdW1uMV07XG4gICAgICAgICAgICByb3dbY29sdW1uMV0gPSByb3dbY29sdW1uMl07XG4gICAgICAgICAgICByb3dbY29sdW1uMl0gPSB0ZW1wO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciB0byBlYWNoIHJvd1xuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYWRkUm93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSArPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3IgZnJvbSBlYWNoIHJvd1xuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc3ViUm93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAtPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHdpdGggZWFjaCByb3dcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG11bFJvd1ZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tSb3dWZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gKj0gdmVjdG9yW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERpdmlkZXMgdGhlIHZhbHVlcyBvZiBlYWNoIHJvdyBieSB0aG9zZSBvZiBhIHZlY3RvclxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgZGl2Um93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAvPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHRvIGVhY2ggY29sdW1uXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdICs9IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciBmcm9tIGVhY2ggY29sdW1uXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzdWJDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC09IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3Igd2l0aCBlYWNoIGNvbHVtblxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbXVsQ29sdW1uVmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAqPSB2ZWN0b3JbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGl2aWRlcyB0aGUgdmFsdWVzIG9mIGVhY2ggY29sdW1uIGJ5IHRob3NlIG9mIGEgdmVjdG9yXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBkaXZDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC89IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSByb3cgd2l0aCBhIHNjYWxhclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxSb3coaW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2luZGV4XVtpXSAqPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSBjb2x1bW4gd2l0aCBhIHNjYWxhclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxDb2x1bW4oaW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2luZGV4XSAqPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1heGltdW0gdmFsdWUgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWF4KCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA+IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1heEluZGV4KCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIHZhciBpZHggPSBbMCwgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA+IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGlkeFsxXSA9IGo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtaW4oKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdIDwgdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1pbmltdW0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWluSW5kZXgoKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCAwXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdIDwgdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzFdID0gajtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtYXhSb3cocm93KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93KTtcbiAgICAgICAgdmFyIHYgPSB0aGlzW3Jvd11bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPiB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtYXhSb3dJbmRleChyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFtyb3csIDBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tyb3ddW2ldID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW3Jvd11baV07XG4gICAgICAgICAgICAgICAgaWR4WzFdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1pbmltdW0gdmFsdWUgb2Ygb25lIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1pblJvdyhyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbcm93XVtpXSA8IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tyb3ddW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1pblJvd0luZGV4KHJvdykge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdyk7XG4gICAgICAgIHZhciB2ID0gdGhpc1tyb3ddWzBdO1xuICAgICAgICB2YXIgaWR4ID0gW3JvdywgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgICAgICBpZHhbMV0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWF4Q29sdW1uKGNvbHVtbikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbik7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVtjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWF4Q29sdW1uSW5kZXgoY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIHZhciBpZHggPSBbMCwgY29sdW1uXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV1bY29sdW1uXSA+IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtjb2x1bW5dO1xuICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtaW5pbXVtIHZhbHVlIG9mIG9uZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtaW5Db2x1bW4oY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW2ldW2NvbHVtbl0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWluaW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtaW5Db2x1bW5JbmRleChjb2x1bW4pIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4pO1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bY29sdW1uXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCBjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dIDwgdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgZGlhZ29uYWwgdmFsdWVzIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgZGlhZygpIHtcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKHRoaXMucm93cywgdGhpcy5jb2x1bW5zKTtcbiAgICAgICAgdmFyIGRpYWcgPSBuZXcgQXJyYXkobWluKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgZGlhZ1tpXSA9IHRoaXNbaV1baV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRpYWc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3VtIG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBzdW0oKSB7XG4gICAgICAgIHZhciB2ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHYgKz0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtZWFuIG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtZWFuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdW0oKSAvIHRoaXMuc2l6ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwcm9kdWN0IG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBwcm9kKCkge1xuICAgICAgICB2YXIgcHJvZCA9IDE7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBwcm9kICo9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByb2Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcHV0ZXMgdGhlIGN1bXVsYXRpdmUgc3VtIG9mIHRoZSBtYXRyaXggZWxlbWVudHMgKGluIHBsYWNlLCByb3cgYnkgcm93KVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBjdW11bGF0aXZlU3VtKCkge1xuICAgICAgICB2YXIgc3VtID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHN1bSArPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcHV0ZXMgdGhlIGRvdCAoc2NhbGFyKSBwcm9kdWN0IGJldHdlZW4gdGhlIG1hdHJpeCBhbmQgYW5vdGhlclxuICAgICAqIEBwYXJhbSB7TWF0cml4fSB2ZWN0b3IyIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgZG90KHZlY3RvcjIpIHtcbiAgICAgICAgaWYgKE1hdHJpeC5pc01hdHJpeCh2ZWN0b3IyKSkgdmVjdG9yMiA9IHZlY3RvcjIudG8xREFycmF5KCk7XG4gICAgICAgIHZhciB2ZWN0b3IxID0gdGhpcy50bzFEQXJyYXkoKTtcbiAgICAgICAgaWYgKHZlY3RvcjEubGVuZ3RoICE9PSB2ZWN0b3IyLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZlY3RvcnMgZG8gbm90IGhhdmUgdGhlIHNhbWUgc2l6ZScpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBkb3QgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZlY3RvcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRvdCArPSB2ZWN0b3IxW2ldICogdmVjdG9yMltpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZG90O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1hdHJpeCBwcm9kdWN0IGJldHdlZW4gdGhpcyBhbmQgb3RoZXJcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIG1tdWwob3RoZXIpIHtcbiAgICAgICAgb3RoZXIgPSBNYXRyaXguY2hlY2tNYXRyaXgob3RoZXIpO1xuICAgICAgICBpZiAodGhpcy5jb2x1bW5zICE9PSBvdGhlci5yb3dzKVxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdOdW1iZXIgb2YgY29sdW1ucyBvZiBsZWZ0IG1hdHJpeCBhcmUgbm90IGVxdWFsIHRvIG51bWJlciBvZiByb3dzIG9mIHJpZ2h0IG1hdHJpeC4nKTtcblxuICAgICAgICB2YXIgbSA9IHRoaXMucm93cztcbiAgICAgICAgdmFyIG4gPSB0aGlzLmNvbHVtbnM7XG4gICAgICAgIHZhciBwID0gb3RoZXIuY29sdW1ucztcblxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeChtLCBwKTtcblxuICAgICAgICB2YXIgQmNvbGogPSBuZXcgQXJyYXkobik7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcDsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IG47IGsrKylcbiAgICAgICAgICAgICAgICBCY29saltrXSA9IG90aGVyW2tdW2pdO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBBcm93aSA9IHRoaXNbaV07XG5cbiAgICAgICAgICAgICAgICB2YXIgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKylcbiAgICAgICAgICAgICAgICAgICAgcyArPSBBcm93aVtrXSAqIEJjb2xqW2tdO1xuXG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zcG9zZXMgdGhlIG1hdHJpeCBhbmQgcmV0dXJucyBhIG5ldyBvbmUgY29udGFpbmluZyB0aGUgcmVzdWx0XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICB0cmFuc3Bvc2UoKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KHRoaXMuY29sdW1ucywgdGhpcy5yb3dzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHJlc3VsdFtqXVtpXSA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTb3J0cyB0aGUgcm93cyAoaW4gcGxhY2UpXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY29tcGFyZUZ1bmN0aW9uIC0gdXN1YWwgQXJyYXkucHJvdG90eXBlLnNvcnQgY29tcGFyaXNvbiBmdW5jdGlvblxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzb3J0Um93cyhjb21wYXJlRnVuY3Rpb24pIHtcbiAgICAgICAgaWYgKGNvbXBhcmVGdW5jdGlvbiA9PT0gdW5kZWZpbmVkKSBjb21wYXJlRnVuY3Rpb24gPSBjb21wYXJlTnVtYmVycztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXS5zb3J0KGNvbXBhcmVGdW5jdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU29ydHMgdGhlIGNvbHVtbnMgKGluIHBsYWNlKVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNvbXBhcmVGdW5jdGlvbiAtIHVzdWFsIEFycmF5LnByb3RvdHlwZS5zb3J0IGNvbXBhcmlzb24gZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc29ydENvbHVtbnMoY29tcGFyZUZ1bmN0aW9uKSB7XG4gICAgICAgIGlmIChjb21wYXJlRnVuY3Rpb24gPT09IHVuZGVmaW5lZCkgY29tcGFyZUZ1bmN0aW9uID0gY29tcGFyZU51bWJlcnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Q29sdW1uKGksIHRoaXMuZ2V0Q29sdW1uKGkpLnNvcnQoY29tcGFyZUZ1bmN0aW9uKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHN1YnNldCBvZiB0aGUgbWF0cml4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0Um93IC0gRmlyc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGVuZFJvdyAtIExhc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0Q29sdW1uIC0gRmlyc3QgY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGVuZENvbHVtbiAtIExhc3QgY29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdWJNYXRyaXgoc3RhcnRSb3csIGVuZFJvdywgc3RhcnRDb2x1bW4sIGVuZENvbHVtbikge1xuICAgICAgICBpZiAoKHN0YXJ0Um93ID4gZW5kUm93KSB8fCAoc3RhcnRDb2x1bW4gPiBlbmRDb2x1bW4pIHx8IChzdGFydFJvdyA8IDApIHx8IChzdGFydFJvdyA+PSB0aGlzLnJvd3MpIHx8IChlbmRSb3cgPCAwKSB8fCAoZW5kUm93ID49IHRoaXMucm93cykgfHwgKHN0YXJ0Q29sdW1uIDwgMCkgfHwgKHN0YXJ0Q29sdW1uID49IHRoaXMuY29sdW1ucykgfHwgKGVuZENvbHVtbiA8IDApIHx8IChlbmRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KGVuZFJvdyAtIHN0YXJ0Um93ICsgMSwgZW5kQ29sdW1uIC0gc3RhcnRDb2x1bW4gKyAxKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0Um93OyBpIDw9IGVuZFJvdzsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnRDb2x1bW47IGogPD0gZW5kQ29sdW1uOyBqKyspIHtcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbaSAtIHN0YXJ0Um93XVtqIC0gc3RhcnRDb2x1bW5dID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdWJzZXQgb2YgdGhlIG1hdHJpeCBiYXNlZCBvbiBhbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IGluZGljZXMgLSBBcnJheSBjb250YWluaW5nIHRoZSByb3cgaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnRDb2x1bW4gPSAwXSAtIEZpcnN0IGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbZW5kQ29sdW1uID0gdGhpcy5jb2x1bW5zLTFdIC0gTGFzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN1Yk1hdHJpeFJvdyhpbmRpY2VzLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uKSB7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PT0gdW5kZWZpbmVkKSBzdGFydENvbHVtbiA9IDA7XG4gICAgICAgIGlmIChlbmRDb2x1bW4gPT09IHVuZGVmaW5lZCkgZW5kQ29sdW1uID0gdGhpcy5jb2x1bW5zIC0gMTtcbiAgICAgICAgaWYgKChzdGFydENvbHVtbiA+IGVuZENvbHVtbikgfHwgKHN0YXJ0Q29sdW1uIDwgMCkgfHwgKHN0YXJ0Q29sdW1uID49IHRoaXMuY29sdW1ucykgfHwgKGVuZENvbHVtbiA8IDApIHx8IChlbmRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgoaW5kaWNlcy5sZW5ndGgsIGVuZENvbHVtbiAtIHN0YXJ0Q29sdW1uICsgMSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0Q29sdW1uOyBqIDw9IGVuZENvbHVtbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGljZXNbaV0gPCAwIHx8IGluZGljZXNbaV0gPj0gdGhpcy5yb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdSb3cgaW5kZXggb3V0IG9mIHJhbmdlOiAnICsgaW5kaWNlc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtpXVtqIC0gc3RhcnRDb2x1bW5dID0gdGhpc1tpbmRpY2VzW2ldXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdWJzZXQgb2YgdGhlIG1hdHJpeCBiYXNlZCBvbiBhbiBhcnJheSBvZiBjb2x1bW4gaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IGluZGljZXMgLSBBcnJheSBjb250YWluaW5nIHRoZSBjb2x1bW4gaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnRSb3cgPSAwXSAtIEZpcnN0IHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbZW5kUm93ID0gdGhpcy5yb3dzLTFdIC0gTGFzdCByb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN1Yk1hdHJpeENvbHVtbihpbmRpY2VzLCBzdGFydFJvdywgZW5kUm93KSB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PT0gdW5kZWZpbmVkKSBzdGFydFJvdyA9IDA7XG4gICAgICAgIGlmIChlbmRSb3cgPT09IHVuZGVmaW5lZCkgZW5kUm93ID0gdGhpcy5yb3dzIC0gMTtcbiAgICAgICAgaWYgKChzdGFydFJvdyA+IGVuZFJvdykgfHwgKHN0YXJ0Um93IDwgMCkgfHwgKHN0YXJ0Um93ID49IHRoaXMucm93cykgfHwgKGVuZFJvdyA8IDApIHx8IChlbmRSb3cgPj0gdGhpcy5yb3dzKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgoZW5kUm93IC0gc3RhcnRSb3cgKyAxLCBpbmRpY2VzLmxlbmd0aCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0Um93OyBqIDw9IGVuZFJvdzsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGljZXNbaV0gPCAwIHx8IGluZGljZXNbaV0gPj0gdGhpcy5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdDb2x1bW4gaW5kZXggb3V0IG9mIHJhbmdlOiAnICsgaW5kaWNlc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtqIC0gc3RhcnRSb3ddW2ldID0gdGhpc1tqXVtpbmRpY2VzW2ldXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHRyYWNlIG9mIHRoZSBtYXRyaXggKHN1bSBvZiB0aGUgZGlhZ29uYWwgZWxlbWVudHMpXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICB0cmFjZSgpIHtcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKHRoaXMucm93cywgdGhpcy5jb2x1bW5zKTtcbiAgICAgICAgdmFyIHRyYWNlID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgdHJhY2UgKz0gdGhpc1tpXVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJhY2U7XG4gICAgfVxufVxuXG5NYXRyaXgucHJvdG90eXBlLmtsYXNzID0gJ01hdHJpeCc7XG5cbm1vZHVsZS5leHBvcnRzID0gTWF0cml4O1xuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IGEgcm93IGluZGV4IGlzIG5vdCBvdXQgb2YgYm91bmRzXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gaW5kZXhcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW291dGVyXVxuICovXG5mdW5jdGlvbiBjaGVja1Jvd0luZGV4KG1hdHJpeCwgaW5kZXgsIG91dGVyKSB7XG4gICAgdmFyIG1heCA9IG91dGVyID8gbWF0cml4LnJvd3MgOiBtYXRyaXgucm93cyAtIDE7XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG1heClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1JvdyBpbmRleCBvdXQgb2YgcmFuZ2UnKTtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCB0aGUgcHJvdmlkZWQgdmVjdG9yIGlzIGFuIGFycmF5IHdpdGggdGhlIHJpZ2h0IGxlbmd0aFxuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvclxuICogQHBhcmFtIHtib29sZWFufSBjb3B5XG4gKiBAcmV0dXJucyB7QXJyYXl9XG4gKiBAdGhyb3dzIHtSYW5nZUVycm9yfVxuICovXG5mdW5jdGlvbiBjaGVja1Jvd1ZlY3RvcihtYXRyaXgsIHZlY3RvciwgY29weSkge1xuICAgIGlmIChNYXRyaXguaXNNYXRyaXgodmVjdG9yKSkge1xuICAgICAgICB2ZWN0b3IgPSB2ZWN0b3IudG8xREFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChjb3B5KSB7XG4gICAgICAgIHZlY3RvciA9IFtdLmNvbmNhdCh2ZWN0b3IpO1xuICAgIH1cbiAgICBpZiAodmVjdG9yLmxlbmd0aCAhPT0gbWF0cml4LmNvbHVtbnMpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd2ZWN0b3Igc2l6ZSBtdXN0IGJlIHRoZSBzYW1lIGFzIHRoZSBudW1iZXIgb2YgY29sdW1ucycpO1xuICAgIHJldHVybiB2ZWN0b3I7XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgdGhlIHByb3ZpZGVkIHZlY3RvciBpcyBhbiBhcnJheSB3aXRoIHRoZSByaWdodCBsZW5ndGhcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY29weVxuICogQHJldHVybnMge0FycmF5fVxuICogQHRocm93cyB7UmFuZ2VFcnJvcn1cbiAqL1xuZnVuY3Rpb24gY2hlY2tDb2x1bW5WZWN0b3IobWF0cml4LCB2ZWN0b3IsIGNvcHkpIHtcbiAgICBpZiAoTWF0cml4LmlzTWF0cml4KHZlY3RvcikpIHtcbiAgICAgICAgdmVjdG9yID0gdmVjdG9yLnRvMURBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoY29weSkge1xuICAgICAgICB2ZWN0b3IgPSBbXS5jb25jYXQodmVjdG9yKTtcbiAgICB9XG4gICAgaWYgKHZlY3Rvci5sZW5ndGggIT09IG1hdHJpeC5yb3dzKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmVjdG9yIHNpemUgbXVzdCBiZSB0aGUgc2FtZSBhcyB0aGUgbnVtYmVyIG9mIHJvd3MnKTtcbiAgICByZXR1cm4gdmVjdG9yO1xufVxuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IGEgY29sdW1uIGluZGV4IGlzIG5vdCBvdXQgb2YgYm91bmRzXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gaW5kZXhcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW291dGVyXVxuICovXG5mdW5jdGlvbiBjaGVja0NvbHVtbkluZGV4KG1hdHJpeCwgaW5kZXgsIG91dGVyKSB7XG4gICAgdmFyIG1heCA9IG91dGVyID8gbWF0cml4LmNvbHVtbnMgOiBtYXRyaXguY29sdW1ucyAtIDE7XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG1heClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0NvbHVtbiBpbmRleCBvdXQgb2YgcmFuZ2UnKTtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCB0d28gbWF0cmljZXMgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge01hdHJpeH0gb3RoZXJNYXRyaXhcbiAqL1xuZnVuY3Rpb24gY2hlY2tEaW1lbnNpb25zKG1hdHJpeCwgb3RoZXJNYXRyaXgpIHtcbiAgICBpZiAobWF0cml4LnJvd3MgIT09IG90aGVyTWF0cml4Lmxlbmd0aCB8fFxuICAgICAgICBtYXRyaXguY29sdW1ucyAhPT0gb3RoZXJNYXRyaXhbMF0ubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdNYXRyaWNlcyBkaW1lbnNpb25zIG11c3QgYmUgZXF1YWwnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVOdW1iZXJzKGEsIGIpIHtcbiAgICByZXR1cm4gYSAtIGI7XG59XG5cbi8qXG5TeW5vbnltc1xuICovXG5cbk1hdHJpeC5yYW5kb20gPSBNYXRyaXgucmFuZDtcbk1hdHJpeC5kaWFnb25hbCA9IE1hdHJpeC5kaWFnO1xuTWF0cml4LnByb3RvdHlwZS5kaWFnb25hbCA9IE1hdHJpeC5wcm90b3R5cGUuZGlhZztcbk1hdHJpeC5pZGVudGl0eSA9IE1hdHJpeC5leWU7XG5NYXRyaXgucHJvdG90eXBlLm5lZ2F0ZSA9IE1hdHJpeC5wcm90b3R5cGUubmVnO1xuXG4vKlxuQWRkIGR5bmFtaWNhbGx5IGluc3RhbmNlIGFuZCBzdGF0aWMgbWV0aG9kcyBmb3IgbWF0aGVtYXRpY2FsIG9wZXJhdGlvbnNcbiAqL1xuXG52YXIgaW5wbGFjZU9wZXJhdG9yID0gYFxuKGZ1bmN0aW9uICVuYW1lJSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gdGhpcy4lbmFtZSVTKHZhbHVlKTtcbiAgICByZXR1cm4gdGhpcy4lbmFtZSVNKHZhbHVlKTtcbn0pXG5gO1xuXG52YXIgaW5wbGFjZU9wZXJhdG9yU2NhbGFyID0gYFxuKGZ1bmN0aW9uICVuYW1lJVModmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1bal0gPSB0aGlzW2ldW2pdICVvcCUgdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59KVxuYDtcblxudmFyIGlucGxhY2VPcGVyYXRvck1hdHJpeCA9IGBcbihmdW5jdGlvbiAlbmFtZSVNKG1hdHJpeCkge1xuICAgIGNoZWNrRGltZW5zaW9ucyh0aGlzLCBtYXRyaXgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgdGhpc1tpXVtqXSA9IHRoaXNbaV1bal0gJW9wJSBtYXRyaXhbaV1bal07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59KVxuYDtcblxudmFyIHN0YXRpY09wZXJhdG9yID0gYFxuKGZ1bmN0aW9uICVuYW1lJShtYXRyaXgsIHZhbHVlKSB7XG4gICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgobWF0cml4KTtcbiAgICByZXR1cm4gbmV3TWF0cml4LiVuYW1lJSh2YWx1ZSk7XG59KVxuYDtcblxudmFyIGlucGxhY2VNZXRob2QgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgdGhpc1tpXVtqXSA9ICVtZXRob2QlKHRoaXNbaV1bal0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufSlcbmA7XG5cbnZhciBzdGF0aWNNZXRob2QgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKG1hdHJpeCkge1xuICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KG1hdHJpeCk7XG4gICAgcmV0dXJuIG5ld01hdHJpeC4lbmFtZSUoKTtcbn0pXG5gO1xuXG52YXIgb3BlcmF0b3JzID0gW1xuICAgIC8vIEFyaXRobWV0aWMgb3BlcmF0b3JzXG4gICAgWycrJywgJ2FkZCddLFxuICAgIFsnLScsICdzdWInLCAnc3VidHJhY3QnXSxcbiAgICBbJyonLCAnbXVsJywgJ211bHRpcGx5J10sXG4gICAgWycvJywgJ2RpdicsICdkaXZpZGUnXSxcbiAgICBbJyUnLCAnbW9kJywgJ21vZHVsdXMnXSxcbiAgICAvLyBCaXR3aXNlIG9wZXJhdG9yc1xuICAgIFsnJicsICdhbmQnXSxcbiAgICBbJ3wnLCAnb3InXSxcbiAgICBbJ14nLCAneG9yJ10sXG4gICAgWyc8PCcsICdsZWZ0U2hpZnQnXSxcbiAgICBbJz4+JywgJ3NpZ25Qcm9wYWdhdGluZ1JpZ2h0U2hpZnQnXSxcbiAgICBbJz4+PicsICdyaWdodFNoaWZ0JywgJ3plcm9GaWxsUmlnaHRTaGlmdCddXG5dO1xuXG5mb3IgKHZhciBvcGVyYXRvciBvZiBvcGVyYXRvcnMpIHtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IG9wZXJhdG9yLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbb3BlcmF0b3JbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihpbnBsYWNlT3BlcmF0b3IsIHtuYW1lOiBvcGVyYXRvcltpXSwgb3A6IG9wZXJhdG9yWzBdfSkpO1xuICAgICAgICBNYXRyaXgucHJvdG90eXBlW29wZXJhdG9yW2ldICsgJ1MnXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU9wZXJhdG9yU2NhbGFyLCB7bmFtZTogb3BlcmF0b3JbaV0gKyAnUycsIG9wOiBvcGVyYXRvclswXX0pKTtcbiAgICAgICAgTWF0cml4LnByb3RvdHlwZVtvcGVyYXRvcltpXSArICdNJ10gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKGlucGxhY2VPcGVyYXRvck1hdHJpeCwge25hbWU6IG9wZXJhdG9yW2ldICsgJ00nLCBvcDogb3BlcmF0b3JbMF19KSk7XG5cbiAgICAgICAgTWF0cml4W29wZXJhdG9yW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oc3RhdGljT3BlcmF0b3IsIHtuYW1lOiBvcGVyYXRvcltpXX0pKTtcbiAgICB9XG59XG5cbnZhciBtZXRob2RzID0gW1xuICAgIFsnficsICdub3QnXVxuXTtcblxuW1xuICAgICdhYnMnLCAnYWNvcycsICdhY29zaCcsICdhc2luJywgJ2FzaW5oJywgJ2F0YW4nLCAnYXRhbmgnLCAnY2JydCcsICdjZWlsJyxcbiAgICAnY2x6MzInLCAnY29zJywgJ2Nvc2gnLCAnZXhwJywgJ2V4cG0xJywgJ2Zsb29yJywgJ2Zyb3VuZCcsICdsb2cnLCAnbG9nMXAnLFxuICAgICdsb2cxMCcsICdsb2cyJywgJ3JvdW5kJywgJ3NpZ24nLCAnc2luJywgJ3NpbmgnLCAnc3FydCcsICd0YW4nLCAndGFuaCcsICd0cnVuYydcbl0uZm9yRWFjaChmdW5jdGlvbiAobWF0aE1ldGhvZCkge1xuICAgIG1ldGhvZHMucHVzaChbJ01hdGguJyArIG1hdGhNZXRob2QsIG1hdGhNZXRob2RdKTtcbn0pO1xuXG5mb3IgKHZhciBtZXRob2Qgb2YgbWV0aG9kcykge1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbWV0aG9kLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbbWV0aG9kW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU1ldGhvZCwge25hbWU6IG1ldGhvZFtpXSwgbWV0aG9kOiBtZXRob2RbMF19KSk7XG4gICAgICAgIE1hdHJpeFttZXRob2RbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihzdGF0aWNNZXRob2QsIHtuYW1lOiBtZXRob2RbaV19KSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmaWxsVGVtcGxhdGVGdW5jdGlvbih0ZW1wbGF0ZSwgdmFsdWVzKSB7XG4gICAgZm9yICh2YXIgaSBpbiB2YWx1ZXMpIHtcbiAgICAgICAgdGVtcGxhdGUgPSB0ZW1wbGF0ZS5yZXBsYWNlKG5ldyBSZWdFeHAoJyUnICsgaSArICclJywgJ2cnKSwgdmFsdWVzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHRlbXBsYXRlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBjb21wYXJlTnVtYmVycyhhLCBiKSB7XG4gICAgcmV0dXJuIGEgLSBiO1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBzdW0gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnN1bSA9IGZ1bmN0aW9uIHN1bSh2YWx1ZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubWF4ID0gZnVuY3Rpb24gbWF4KHZhbHVlcykge1xuICAgIHZhciBtYXggPSAtSW5maW5pdHk7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPiBtYXgpIG1heCA9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIG1heDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLm1pbiA9IGZ1bmN0aW9uIG1pbih2YWx1ZXMpIHtcbiAgICB2YXIgbWluID0gSW5maW5pdHk7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPCBtaW4pIG1pbiA9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIG1pbjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbiBhbmQgbWF4IG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge3ttaW46IG51bWJlciwgbWF4OiBudW1iZXJ9fVxuICovXG5leHBvcnRzLm1pbk1heCA9IGZ1bmN0aW9uIG1pbk1heCh2YWx1ZXMpIHtcbiAgICB2YXIgbWluID0gSW5maW5pdHk7XG4gICAgdmFyIG1heCA9IC1JbmZpbml0eTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA8IG1pbikgbWluID0gdmFsdWVzW2ldO1xuICAgICAgICBpZiAodmFsdWVzW2ldID4gbWF4KSBtYXggPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG1pbjogbWluLFxuICAgICAgICBtYXg6IG1heFxuICAgIH07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhcml0aG1ldGljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmFyaXRobWV0aWNNZWFuID0gZnVuY3Rpb24gYXJpdGhtZXRpY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyBsO1xufTtcblxuLyoqXG4gKiB7QGxpbmsgYXJpdGhtZXRpY01lYW59XG4gKi9cbmV4cG9ydHMubWVhbiA9IGV4cG9ydHMuYXJpdGhtZXRpY01lYW47XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGdlb21ldHJpYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5nZW9tZXRyaWNNZWFuID0gZnVuY3Rpb24gZ2VvbWV0cmljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgbXVsID0gMTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbXVsICo9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIE1hdGgucG93KG11bCwgMSAvIGwpO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWVhbiBvZiB0aGUgbG9nIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIElmIHRoZSByZXR1cm4gdmFsdWUgaXMgZXhwb25lbnRpYXRlZCwgaXQgZ2l2ZXMgdGhlIHNhbWUgcmVzdWx0IGFzIHRoZVxuICogZ2VvbWV0cmljIG1lYW4uXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubG9nTWVhbiA9IGZ1bmN0aW9uIGxvZ01lYW4odmFsdWVzKSB7XG4gICAgdmFyIGxuc3VtID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbG5zdW0gKz0gTWF0aC5sb2codmFsdWVzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGxuc3VtIC8gbDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHdlaWdodGVkIGdyYW5kIG1lYW4gZm9yIGEgbGlzdCBvZiBtZWFucyBhbmQgc2FtcGxlIHNpemVzXG4gKiBAcGFyYW0ge0FycmF5fSBtZWFucyAtIE1lYW4gdmFsdWVzIGZvciBlYWNoIHNldCBvZiBzYW1wbGVzXG4gKiBAcGFyYW0ge0FycmF5fSBzYW1wbGVzIC0gTnVtYmVyIG9mIG9yaWdpbmFsIHZhbHVlcyBmb3IgZWFjaCBzZXQgb2Ygc2FtcGxlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5ncmFuZE1lYW4gPSBmdW5jdGlvbiBncmFuZE1lYW4obWVhbnMsIHNhbXBsZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbiA9IDA7XG4gICAgdmFyIGwgPSBtZWFucy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgc3VtICs9IHNhbXBsZXNbaV0gKiBtZWFuc1tpXTtcbiAgICAgICAgbiArPSBzYW1wbGVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gbjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHRydW5jYXRlZCBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXMgdXNpbmcgYSBnaXZlbiBwZXJjZW50YWdlXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7bnVtYmVyfSBwZXJjZW50IC0gVGhlIHBlcmNlbnRhZ2Ugb2YgdmFsdWVzIHRvIGtlZXAgKHJhbmdlOiBbMCwxXSlcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FscmVhZHlTb3J0ZWQ9ZmFsc2VdXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnRydW5jYXRlZE1lYW4gPSBmdW5jdGlvbiB0cnVuY2F0ZWRNZWFuKHZhbHVlcywgcGVyY2VudCwgYWxyZWFkeVNvcnRlZCkge1xuICAgIGlmIChhbHJlYWR5U29ydGVkID09PSB1bmRlZmluZWQpIGFscmVhZHlTb3J0ZWQgPSBmYWxzZTtcbiAgICBpZiAoIWFscmVhZHlTb3J0ZWQpIHtcbiAgICAgICAgdmFsdWVzID0gdmFsdWVzLnNsaWNlKCkuc29ydChjb21wYXJlTnVtYmVycyk7XG4gICAgfVxuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgayA9IE1hdGguZmxvb3IobCAqIHBlcmNlbnQpO1xuICAgIHZhciBzdW0gPSAwO1xuICAgIGZvciAodmFyIGkgPSBrOyBpIDwgKGwgLSBrKTsgaSsrKSB7XG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyAobCAtIDIgKiBrKTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGhhcm1vbmljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmhhcm1vbmljTWVhbiA9IGZ1bmN0aW9uIGhhcm1vbmljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZhbHVlIGF0IGluZGV4ICcgKyBpICsgJ2lzIHplcm8nKTtcbiAgICAgICAgfVxuICAgICAgICBzdW0gKz0gMSAvIHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIGwgLyBzdW07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBjb250cmFoYXJtb25pYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5jb250cmFIYXJtb25pY01lYW4gPSBmdW5jdGlvbiBjb250cmFIYXJtb25pY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIHIxID0gMDtcbiAgICB2YXIgcjIgPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICByMSArPSB2YWx1ZXNbaV0gKiB2YWx1ZXNbaV07XG4gICAgICAgIHIyICs9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgaWYgKHIyIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc3VtIG9mIHZhbHVlcyBpcyBuZWdhdGl2ZScpO1xuICAgIH1cbiAgICByZXR1cm4gcjEgLyByMjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1lZGlhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FscmVhZHlTb3J0ZWQ9ZmFsc2VdXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLm1lZGlhbiA9IGZ1bmN0aW9uIG1lZGlhbih2YWx1ZXMsIGFscmVhZHlTb3J0ZWQpIHtcbiAgICBpZiAoYWxyZWFkeVNvcnRlZCA9PT0gdW5kZWZpbmVkKSBhbHJlYWR5U29ydGVkID0gZmFsc2U7XG4gICAgaWYgKCFhbHJlYWR5U29ydGVkKSB7XG4gICAgICAgIHZhbHVlcyA9IHZhbHVlcy5zbGljZSgpLnNvcnQoY29tcGFyZU51bWJlcnMpO1xuICAgIH1cbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgdmFyIGhhbGYgPSBNYXRoLmZsb29yKGwgLyAyKTtcbiAgICBpZiAobCAlIDIgPT09IDApIHtcbiAgICAgICAgcmV0dXJuICh2YWx1ZXNbaGFsZiAtIDFdICsgdmFsdWVzW2hhbGZdKSAqIDAuNTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdmFsdWVzW2hhbGZdO1xuICAgIH1cbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHZhcmlhbmNlIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHBhcmFtIHtib29sZWFufSBbdW5iaWFzZWQ9dHJ1ZV0gLSBpZiB0cnVlLCBkaXZpZGUgYnkgKG4tMSk7IGlmIGZhbHNlLCBkaXZpZGUgYnkgbi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMudmFyaWFuY2UgPSBmdW5jdGlvbiB2YXJpYW5jZSh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHVuYmlhc2VkID09PSB1bmRlZmluZWQpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMubWVhbih2YWx1ZXMpO1xuICAgIHZhciB0aGVWYXJpYW5jZSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHggPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICB0aGVWYXJpYW5jZSArPSB4ICogeDtcbiAgICB9XG5cbiAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgcmV0dXJuIHRoZVZhcmlhbmNlIC8gKGwgLSAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhlVmFyaWFuY2UgLyBsO1xuICAgIH1cbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHN0YW5kYXJkIGRldmlhdGlvbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3VuYmlhc2VkPXRydWVdIC0gaWYgdHJ1ZSwgZGl2aWRlIGJ5IChuLTEpOyBpZiBmYWxzZSwgZGl2aWRlIGJ5IG4uXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnN0YW5kYXJkRGV2aWF0aW9uID0gZnVuY3Rpb24gc3RhbmRhcmREZXZpYXRpb24odmFsdWVzLCB1bmJpYXNlZCkge1xuICAgIHJldHVybiBNYXRoLnNxcnQoZXhwb3J0cy52YXJpYW5jZSh2YWx1ZXMsIHVuYmlhc2VkKSk7XG59O1xuXG5leHBvcnRzLnN0YW5kYXJkRXJyb3IgPSBmdW5jdGlvbiBzdGFuZGFyZEVycm9yKHZhbHVlcykge1xuICAgIHJldHVybiBleHBvcnRzLnN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcykgLyBNYXRoLnNxcnQodmFsdWVzLmxlbmd0aCk7XG59O1xuXG5leHBvcnRzLnF1YXJ0aWxlcyA9IGZ1bmN0aW9uIHF1YXJ0aWxlcyh2YWx1ZXMsIGFscmVhZHlTb3J0ZWQpIHtcbiAgICBpZiAodHlwZW9mKGFscmVhZHlTb3J0ZWQpID09PSAndW5kZWZpbmVkJykgYWxyZWFkeVNvcnRlZCA9IGZhbHNlO1xuICAgIGlmICghYWxyZWFkeVNvcnRlZCkge1xuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKTtcbiAgICAgICAgdmFsdWVzLnNvcnQoY29tcGFyZU51bWJlcnMpO1xuICAgIH1cblxuICAgIHZhciBxdWFydCA9IHZhbHVlcy5sZW5ndGggLyA0O1xuICAgIHZhciBxMSA9IHZhbHVlc1tNYXRoLmNlaWwocXVhcnQpIC0gMV07XG4gICAgdmFyIHEyID0gZXhwb3J0cy5tZWRpYW4odmFsdWVzLCB0cnVlKTtcbiAgICB2YXIgcTMgPSB2YWx1ZXNbTWF0aC5jZWlsKHF1YXJ0ICogMykgLSAxXTtcblxuICAgIHJldHVybiB7cTE6IHExLCBxMjogcTIsIHEzOiBxM307XG59O1xuXG5leHBvcnRzLnBvb2xlZFN0YW5kYXJkRGV2aWF0aW9uID0gZnVuY3Rpb24gcG9vbGVkU3RhbmRhcmREZXZpYXRpb24oc2FtcGxlcywgdW5iaWFzZWQpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGV4cG9ydHMucG9vbGVkVmFyaWFuY2Uoc2FtcGxlcywgdW5iaWFzZWQpKTtcbn07XG5cbmV4cG9ydHMucG9vbGVkVmFyaWFuY2UgPSBmdW5jdGlvbiBwb29sZWRWYXJpYW5jZShzYW1wbGVzLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBsZW5ndGggPSAwLCBsID0gc2FtcGxlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHZhbHVlcyA9IHNhbXBsZXNbaV07XG4gICAgICAgIHZhciB2YXJpID0gZXhwb3J0cy52YXJpYW5jZSh2YWx1ZXMpO1xuXG4gICAgICAgIHN1bSArPSAodmFsdWVzLmxlbmd0aCAtIDEpICogdmFyaTtcblxuICAgICAgICBpZiAodW5iaWFzZWQpXG4gICAgICAgICAgICBsZW5ndGggKz0gdmFsdWVzLmxlbmd0aCAtIDE7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGxlbmd0aCArPSB2YWx1ZXMubGVuZ3RoO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gbGVuZ3RoO1xufTtcblxuZXhwb3J0cy5tb2RlID0gZnVuY3Rpb24gbW9kZSh2YWx1ZXMpIHtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGgsXG4gICAgICAgIGl0ZW1Db3VudCA9IG5ldyBBcnJheShsKSxcbiAgICAgICAgaTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGl0ZW1Db3VudFtpXSA9IDA7XG4gICAgfVxuICAgIHZhciBpdGVtQXJyYXkgPSBuZXcgQXJyYXkobCk7XG4gICAgdmFyIGNvdW50ID0gMDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGluZGV4ID0gaXRlbUFycmF5LmluZGV4T2YodmFsdWVzW2ldKTtcbiAgICAgICAgaWYgKGluZGV4ID49IDApXG4gICAgICAgICAgICBpdGVtQ291bnRbaW5kZXhdKys7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaXRlbUFycmF5W2NvdW50XSA9IHZhbHVlc1tpXTtcbiAgICAgICAgICAgIGl0ZW1Db3VudFtjb3VudF0gPSAxO1xuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBtYXhWYWx1ZSA9IDAsIG1heEluZGV4ID0gMDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICBpZiAoaXRlbUNvdW50W2ldID4gbWF4VmFsdWUpIHtcbiAgICAgICAgICAgIG1heFZhbHVlID0gaXRlbUNvdW50W2ldO1xuICAgICAgICAgICAgbWF4SW5kZXggPSBpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGl0ZW1BcnJheVttYXhJbmRleF07XG59O1xuXG5leHBvcnRzLmNvdmFyaWFuY2UgPSBmdW5jdGlvbiBjb3ZhcmlhbmNlKHZlY3RvcjEsIHZlY3RvcjIsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIG1lYW4xID0gZXhwb3J0cy5tZWFuKHZlY3RvcjEpO1xuICAgIHZhciBtZWFuMiA9IGV4cG9ydHMubWVhbih2ZWN0b3IyKTtcblxuICAgIGlmICh2ZWN0b3IxLmxlbmd0aCAhPT0gdmVjdG9yMi5sZW5ndGgpXG4gICAgICAgIHRocm93IFwiVmVjdG9ycyBkbyBub3QgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zXCI7XG5cbiAgICB2YXIgY292ID0gMCwgbCA9IHZlY3RvcjEubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciB4ID0gdmVjdG9yMVtpXSAtIG1lYW4xO1xuICAgICAgICB2YXIgeSA9IHZlY3RvcjJbaV0gLSBtZWFuMjtcbiAgICAgICAgY292ICs9IHggKiB5O1xuICAgIH1cblxuICAgIGlmICh1bmJpYXNlZClcbiAgICAgICAgcmV0dXJuIGNvdiAvIChsIC0gMSk7XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gY292IC8gbDtcbn07XG5cbmV4cG9ydHMuc2tld25lc3MgPSBmdW5jdGlvbiBza2V3bmVzcyh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4odmFsdWVzKTtcblxuICAgIHZhciBzMiA9IDAsIHMzID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGRldiA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgczMgKz0gZGV2ICogZGV2ICogZGV2O1xuICAgIH1cbiAgICB2YXIgbTIgPSBzMiAvIGw7XG4gICAgdmFyIG0zID0gczMgLyBsO1xuXG4gICAgdmFyIGcgPSBtMyAvIChNYXRoLnBvdyhtMiwgMyAvIDIuMCkpO1xuICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICB2YXIgYSA9IE1hdGguc3FydChsICogKGwgLSAxKSk7XG4gICAgICAgIHZhciBiID0gbCAtIDI7XG4gICAgICAgIHJldHVybiAoYSAvIGIpICogZztcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBnO1xuICAgIH1cbn07XG5cbmV4cG9ydHMua3VydG9zaXMgPSBmdW5jdGlvbiBrdXJ0b3Npcyh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4odmFsdWVzKTtcbiAgICB2YXIgbiA9IHZhbHVlcy5sZW5ndGgsIHMyID0gMCwgczQgPSAwO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGRldiA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgczQgKz0gZGV2ICogZGV2ICogZGV2ICogZGV2O1xuICAgIH1cbiAgICB2YXIgbTIgPSBzMiAvIG47XG4gICAgdmFyIG00ID0gczQgLyBuO1xuXG4gICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgIHZhciB2ID0gczIgLyAobiAtIDEpO1xuICAgICAgICB2YXIgYSA9IChuICogKG4gKyAxKSkgLyAoKG4gLSAxKSAqIChuIC0gMikgKiAobiAtIDMpKTtcbiAgICAgICAgdmFyIGIgPSBzNCAvICh2ICogdik7XG4gICAgICAgIHZhciBjID0gKChuIC0gMSkgKiAobiAtIDEpKSAvICgobiAtIDIpICogKG4gLSAzKSk7XG5cbiAgICAgICAgcmV0dXJuIGEgKiBiIC0gMyAqIGM7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gbTQgLyAobTIgKiBtMikgLSAzO1xuICAgIH1cbn07XG5cbmV4cG9ydHMuZW50cm9weSA9IGZ1bmN0aW9uIGVudHJvcHkodmFsdWVzLCBlcHMpIHtcbiAgICBpZiAodHlwZW9mKGVwcykgPT09ICd1bmRlZmluZWQnKSBlcHMgPSAwO1xuICAgIHZhciBzdW0gPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKylcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXSAqIE1hdGgubG9nKHZhbHVlc1tpXSArIGVwcyk7XG4gICAgcmV0dXJuIC1zdW07XG59O1xuXG5leHBvcnRzLndlaWdodGVkTWVhbiA9IGZ1bmN0aW9uIHdlaWdodGVkTWVhbih2YWx1ZXMsIHdlaWdodHMpIHtcbiAgICB2YXIgc3VtID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV0gKiB3ZWlnaHRzW2ldO1xuICAgIHJldHVybiBzdW07XG59O1xuXG5leHBvcnRzLndlaWdodGVkU3RhbmRhcmREZXZpYXRpb24gPSBmdW5jdGlvbiB3ZWlnaHRlZFN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcywgd2VpZ2h0cykge1xuICAgIHJldHVybiBNYXRoLnNxcnQoZXhwb3J0cy53ZWlnaHRlZFZhcmlhbmNlKHZhbHVlcywgd2VpZ2h0cykpO1xufTtcblxuZXhwb3J0cy53ZWlnaHRlZFZhcmlhbmNlID0gZnVuY3Rpb24gd2VpZ2h0ZWRWYXJpYW5jZSh2YWx1ZXMsIHdlaWdodHMpIHtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMud2VpZ2h0ZWRNZWFuKHZhbHVlcywgd2VpZ2h0cyk7XG4gICAgdmFyIHZhcmkgPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgYSA9IDAsIGIgPSAwO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHogPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICB2YXIgdyA9IHdlaWdodHNbaV07XG5cbiAgICAgICAgdmFyaSArPSB3ICogKHogKiB6KTtcbiAgICAgICAgYiArPSB3O1xuICAgICAgICBhICs9IHcgKiB3O1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpICogKGIgLyAoYiAqIGIgLSBhKSk7XG59O1xuXG5leHBvcnRzLmNlbnRlciA9IGZ1bmN0aW9uIGNlbnRlcih2YWx1ZXMsIGluUGxhY2UpIHtcbiAgICBpZiAodHlwZW9mKGluUGxhY2UpID09PSAndW5kZWZpbmVkJykgaW5QbGFjZSA9IGZhbHNlO1xuXG4gICAgdmFyIHJlc3VsdCA9IHZhbHVlcztcbiAgICBpZiAoIWluUGxhY2UpXG4gICAgICAgIHJlc3VsdCA9IHZhbHVlcy5zbGljZSgpO1xuXG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4ocmVzdWx0KSwgbCA9IHJlc3VsdC5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHJlc3VsdFtpXSAtPSB0aGVNZWFuO1xufTtcblxuZXhwb3J0cy5zdGFuZGFyZGl6ZSA9IGZ1bmN0aW9uIHN0YW5kYXJkaXplKHZhbHVlcywgc3RhbmRhcmREZXYsIGluUGxhY2UpIHtcbiAgICBpZiAodHlwZW9mKHN0YW5kYXJkRGV2KSA9PT0gJ3VuZGVmaW5lZCcpIHN0YW5kYXJkRGV2ID0gZXhwb3J0cy5zdGFuZGFyZERldmlhdGlvbih2YWx1ZXMpO1xuICAgIGlmICh0eXBlb2YoaW5QbGFjZSkgPT09ICd1bmRlZmluZWQnKSBpblBsYWNlID0gZmFsc2U7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSBpblBsYWNlID8gdmFsdWVzIDogbmV3IEFycmF5KGwpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKVxuICAgICAgICByZXN1bHRbaV0gPSB2YWx1ZXNbaV0gLyBzdGFuZGFyZERldjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuZXhwb3J0cy5jdW11bGF0aXZlU3VtID0gZnVuY3Rpb24gY3VtdWxhdGl2ZVN1bShhcnJheSkge1xuICAgIHZhciBsID0gYXJyYXkubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobCk7XG4gICAgcmVzdWx0WzBdID0gYXJyYXlbMF07XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBsOyBpKyspXG4gICAgICAgIHJlc3VsdFtpXSA9IHJlc3VsdFtpIC0gMV0gKyBhcnJheVtpXTtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5hcnJheSA9IHJlcXVpcmUoJy4vYXJyYXknKTtcbmV4cG9ydHMubWF0cml4ID0gcmVxdWlyZSgnLi9tYXRyaXgnKTtcbiIsIid1c2Ugc3RyaWN0JztcbnZhciBhcnJheVN0YXQgPSByZXF1aXJlKCcuL2FycmF5Jyk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hY2NvcmQtbmV0L2ZyYW1ld29yay9ibG9iL2RldmVsb3BtZW50L1NvdXJjZXMvQWNjb3JkLlN0YXRpc3RpY3MvVG9vbHMuY3NcblxuZnVuY3Rpb24gZW50cm9weShtYXRyaXgsIGVwcykge1xuICAgIGlmICh0eXBlb2YoZXBzKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZXBzID0gMDtcbiAgICB9XG4gICAgdmFyIHN1bSA9IDAsXG4gICAgICAgIGwxID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgbDIgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDE7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGwyOyBqKyspIHtcbiAgICAgICAgICAgIHN1bSArPSBtYXRyaXhbaV1bal0gKiBNYXRoLmxvZyhtYXRyaXhbaV1bal0gKyBlcHMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtc3VtO1xufVxuXG5mdW5jdGlvbiBtZWFuKG1hdHJpeCwgZGltZW5zaW9uKSB7XG4gICAgaWYgKHR5cGVvZihkaW1lbnNpb24pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkaW1lbnNpb24gPSAwO1xuICAgIH1cbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICB0aGVNZWFuLCBOLCBpLCBqO1xuXG4gICAgaWYgKGRpbWVuc2lvbiA9PT0gLTEpIHtcbiAgICAgICAgdGhlTWVhbiA9IFswXTtcbiAgICAgICAgTiA9IHJvd3MgKiBjb2xzO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhlTWVhblswXSArPSBtYXRyaXhbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhlTWVhblswXSAvPSBOO1xuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIHRoZU1lYW4gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIE4gPSByb3dzO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICB0aGVNZWFuW2pdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGVNZWFuW2pdICs9IG1hdHJpeFtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZU1lYW5bal0gLz0gTjtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIHRoZU1lYW4gPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIE4gPSBjb2xzO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICB0aGVNZWFuW2pdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGVNZWFuW2pdICs9IG1hdHJpeFtqXVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZU1lYW5bal0gLz0gTjtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoZU1lYW47XG59XG5cbmZ1bmN0aW9uIHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCwgbWVhbnMsIHVuYmlhc2VkKSB7XG4gICAgdmFyIHZhcmkgPSB2YXJpYW5jZShtYXRyaXgsIG1lYW5zLCB1bmJpYXNlZCksIGwgPSB2YXJpLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXJpW2ldID0gTWF0aC5zcXJ0KHZhcmlbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gdmFyaTtcbn1cblxuZnVuY3Rpb24gdmFyaWFuY2UobWF0cml4LCBtZWFucywgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdW5iaWFzZWQgPSB0cnVlO1xuICAgIH1cbiAgICBtZWFucyA9IG1lYW5zIHx8IG1lYW4obWF0cml4KTtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHJldHVybiBbXTtcbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIHZhcmkgPSBuZXcgQXJyYXkoY29scyk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICB2YXIgc3VtMSA9IDAsIHN1bTIgPSAwLCB4ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHggPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgICAgIHN1bTEgKz0geDtcbiAgICAgICAgICAgIHN1bTIgKz0geCAqIHg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgICAgICB2YXJpW2pdID0gKHN1bTIgLSAoKHN1bTEgKiBzdW0xKSAvIHJvd3MpKSAvIChyb3dzIC0gMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXJpW2pdID0gKHN1bTIgLSAoKHN1bTEgKiBzdW0xKSAvIHJvd3MpKSAvIHJvd3M7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhcmk7XG59XG5cbmZ1bmN0aW9uIG1lZGlhbihtYXRyaXgpIHtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGgsIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIHZhciBtZWRpYW5zID0gbmV3IEFycmF5KGNvbHMpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgdmFyIGRhdGEgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICBkYXRhW2pdID0gbWF0cml4W2pdW2ldO1xuICAgICAgICB9XG4gICAgICAgIGRhdGEuc29ydCgpO1xuICAgICAgICB2YXIgTiA9IGRhdGEubGVuZ3RoO1xuICAgICAgICBpZiAoTiAlIDIgPT09IDApIHtcbiAgICAgICAgICAgIG1lZGlhbnNbaV0gPSAoZGF0YVtOIC8gMl0gKyBkYXRhWyhOIC8gMikgLSAxXSkgKiAwLjU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtZWRpYW5zW2ldID0gZGF0YVtNYXRoLmZsb29yKE4gLyAyKV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1lZGlhbnM7XG59XG5cbmZ1bmN0aW9uIG1vZGUobWF0cml4KSB7XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgbW9kZXMgPSBuZXcgQXJyYXkoY29scyksXG4gICAgICAgIGksIGo7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICB2YXIgaXRlbUNvdW50ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IHJvd3M7IGsrKykge1xuICAgICAgICAgICAgaXRlbUNvdW50W2tdID0gMDtcbiAgICAgICAgfVxuICAgICAgICB2YXIgaXRlbUFycmF5ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB2YXIgY291bnQgPSAwO1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IGl0ZW1BcnJheS5pbmRleE9mKG1hdHJpeFtqXVtpXSk7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIGl0ZW1Db3VudFtpbmRleF0rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaXRlbUFycmF5W2NvdW50XSA9IG1hdHJpeFtqXVtpXTtcbiAgICAgICAgICAgICAgICBpdGVtQ291bnRbY291bnRdID0gMTtcbiAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFZhbHVlID0gMCwgbWF4SW5kZXggPSAwO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgaWYgKGl0ZW1Db3VudFtqXSA+IG1heFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgbWF4VmFsdWUgPSBpdGVtQ291bnRbal07XG4gICAgICAgICAgICAgICAgbWF4SW5kZXggPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW9kZXNbaV0gPSBpdGVtQXJyYXlbbWF4SW5kZXhdO1xuICAgIH1cbiAgICByZXR1cm4gbW9kZXM7XG59XG5cbmZ1bmN0aW9uIHNrZXduZXNzKG1hdHJpeCwgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIG4gPSBtYXRyaXgubGVuZ3RoLCBsID0gbWVhbnMubGVuZ3RoO1xuICAgIHZhciBza2V3ID0gbmV3IEFycmF5KGwpO1xuXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBsOyBqKyspIHtcbiAgICAgICAgdmFyIHMyID0gMCwgczMgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgdmFyIGRldiA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgczIgKz0gZGV2ICogZGV2O1xuICAgICAgICAgICAgczMgKz0gZGV2ICogZGV2ICogZGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG0yID0gczIgLyBuO1xuICAgICAgICB2YXIgbTMgPSBzMyAvIG47XG4gICAgICAgIHZhciBnID0gbTMgLyBNYXRoLnBvdyhtMiwgMyAvIDIpO1xuXG4gICAgICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICAgICAgdmFyIGEgPSBNYXRoLnNxcnQobiAqIChuIC0gMSkpO1xuICAgICAgICAgICAgdmFyIGIgPSBuIC0gMjtcbiAgICAgICAgICAgIHNrZXdbal0gPSAoYSAvIGIpICogZztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNrZXdbal0gPSBnO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBza2V3O1xufVxuXG5mdW5jdGlvbiBrdXJ0b3NpcyhtYXRyaXgsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpO1xuICAgIHZhciBuID0gbWF0cml4Lmxlbmd0aCwgbSA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIGt1cnQgPSBuZXcgQXJyYXkobSk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG07IGorKykge1xuICAgICAgICB2YXIgczIgPSAwLCBzNCA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGV2ID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgICAgICBzMiArPSBkZXYgKiBkZXY7XG4gICAgICAgICAgICBzNCArPSBkZXYgKiBkZXYgKiBkZXYgKiBkZXY7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG0yID0gczIgLyBuO1xuICAgICAgICB2YXIgbTQgPSBzNCAvIG47XG5cbiAgICAgICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgICAgICB2YXIgdiA9IHMyIC8gKG4gLSAxKTtcbiAgICAgICAgICAgIHZhciBhID0gKG4gKiAobiArIDEpKSAvICgobiAtIDEpICogKG4gLSAyKSAqIChuIC0gMykpO1xuICAgICAgICAgICAgdmFyIGIgPSBzNCAvICh2ICogdik7XG4gICAgICAgICAgICB2YXIgYyA9ICgobiAtIDEpICogKG4gLSAxKSkgLyAoKG4gLSAyKSAqIChuIC0gMykpO1xuICAgICAgICAgICAga3VydFtqXSA9IGEgKiBiIC0gMyAqIGM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrdXJ0W2pdID0gbTQgLyAobTIgKiBtMikgLSAzO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBrdXJ0O1xufVxuXG5mdW5jdGlvbiBzdGFuZGFyZEVycm9yKG1hdHJpeCkge1xuICAgIHZhciBzYW1wbGVzID0gbWF0cml4Lmxlbmd0aDtcbiAgICB2YXIgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4KSwgbCA9IHN0YW5kYXJkRGV2aWF0aW9ucy5sZW5ndGg7XG4gICAgdmFyIHN0YW5kYXJkRXJyb3JzID0gbmV3IEFycmF5KGwpO1xuICAgIHZhciBzcXJ0TiA9IE1hdGguc3FydChzYW1wbGVzKTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHN0YW5kYXJkRXJyb3JzW2ldID0gc3RhbmRhcmREZXZpYXRpb25zW2ldIC8gc3FydE47XG4gICAgfVxuICAgIHJldHVybiBzdGFuZGFyZEVycm9ycztcbn1cblxuZnVuY3Rpb24gY292YXJpYW5jZShtYXRyaXgsIGRpbWVuc2lvbikge1xuICAgIHJldHVybiBzY2F0dGVyKG1hdHJpeCwgdW5kZWZpbmVkLCBkaW1lbnNpb24pO1xufVxuXG5mdW5jdGlvbiBzY2F0dGVyKG1hdHJpeCwgZGl2aXNvciwgZGltZW5zaW9uKSB7XG4gICAgaWYgKHR5cGVvZihkaW1lbnNpb24pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkaW1lbnNpb24gPSAwO1xuICAgIH1cbiAgICBpZiAodHlwZW9mKGRpdmlzb3IpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgICAgICBkaXZpc29yID0gbWF0cml4Lmxlbmd0aCAtIDE7XG4gICAgICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgICAgICBkaXZpc29yID0gbWF0cml4WzBdLmxlbmd0aCAtIDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgsIGRpbWVuc2lvbiksXG4gICAgICAgIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbW11dO1xuICAgIH1cbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGNvdiwgaSwgaiwgcywgaztcblxuICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCByb3dzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSAobWF0cml4W2tdW2pdIC0gbWVhbnNbal0pICogKG1hdHJpeFtrXVtpXSAtIG1lYW5zW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyAvPSBkaXZpc29yO1xuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHM7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gKG1hdHJpeFtqXVtrXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhbaV1ba10gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgLz0gZGl2aXNvcjtcbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvdjtcbn1cblxuZnVuY3Rpb24gY29ycmVsYXRpb24obWF0cml4KSB7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpLFxuICAgICAgICBzdGFuZGFyZERldmlhdGlvbnMgPSBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgsIHRydWUsIG1lYW5zKSxcbiAgICAgICAgc2NvcmVzID0gelNjb3JlcyhtYXRyaXgsIG1lYW5zLCBzdGFuZGFyZERldmlhdGlvbnMpLFxuICAgICAgICByb3dzID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGksIGo7XG5cbiAgICB2YXIgY29yID0gbmV3IEFycmF5KGNvbHMpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgY29yW2ldID0gbmV3IEFycmF5KGNvbHMpO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgIGZvciAoaiA9IGk7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGsgPSAwLCBsID0gc2NvcmVzLmxlbmd0aDsgayA8IGw7IGsrKykge1xuICAgICAgICAgICAgICAgIGMgKz0gc2NvcmVzW2tdW2pdICogc2NvcmVzW2tdW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYyAvPSByb3dzIC0gMTtcbiAgICAgICAgICAgIGNvcltpXVtqXSA9IGM7XG4gICAgICAgICAgICBjb3Jbal1baV0gPSBjO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb3I7XG59XG5cbmZ1bmN0aW9uIHpTY29yZXMobWF0cml4LCBtZWFucywgc3RhbmRhcmREZXZpYXRpb25zKSB7XG4gICAgbWVhbnMgPSBtZWFucyB8fCBtZWFuKG1hdHJpeCk7XG4gICAgaWYgKHR5cGVvZihzdGFuZGFyZERldmlhdGlvbnMpID09PSAndW5kZWZpbmVkJykgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4LCB0cnVlLCBtZWFucyk7XG4gICAgcmV0dXJuIHN0YW5kYXJkaXplKGNlbnRlcihtYXRyaXgsIG1lYW5zLCBmYWxzZSksIHN0YW5kYXJkRGV2aWF0aW9ucywgdHJ1ZSk7XG59XG5cbmZ1bmN0aW9uIGNlbnRlcihtYXRyaXgsIG1lYW5zLCBpblBsYWNlKSB7XG4gICAgbWVhbnMgPSBtZWFucyB8fCBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIHJlc3VsdCA9IG1hdHJpeCxcbiAgICAgICAgbCA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGksIGosIGpqO1xuXG4gICAgaWYgKCFpblBsYWNlKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyBBcnJheShsKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG1hdHJpeFtpXS5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gcmVzdWx0W2ldO1xuICAgICAgICBmb3IgKGogPSAwLCBqaiA9IHJvdy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICByb3dbal0gPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBzdGFuZGFyZGl6ZShtYXRyaXgsIHN0YW5kYXJkRGV2aWF0aW9ucywgaW5QbGFjZSkge1xuICAgIGlmICh0eXBlb2Yoc3RhbmRhcmREZXZpYXRpb25zKSA9PT0gJ3VuZGVmaW5lZCcpIHN0YW5kYXJkRGV2aWF0aW9ucyA9IHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCk7XG4gICAgdmFyIHJlc3VsdCA9IG1hdHJpeCxcbiAgICAgICAgbCA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGksIGosIGpqO1xuXG4gICAgaWYgKCFpblBsYWNlKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyBBcnJheShsKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG1hdHJpeFtpXS5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0Um93ID0gcmVzdWx0W2ldO1xuICAgICAgICB2YXIgc291cmNlUm93ID0gbWF0cml4W2ldO1xuICAgICAgICBmb3IgKGogPSAwLCBqaiA9IHJlc3VsdFJvdy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICBpZiAoc3RhbmRhcmREZXZpYXRpb25zW2pdICE9PSAwICYmICFpc05hTihzdGFuZGFyZERldmlhdGlvbnNbal0pKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0Um93W2pdID0gc291cmNlUm93W2pdIC8gc3RhbmRhcmREZXZpYXRpb25zW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHdlaWdodGVkVmFyaWFuY2UobWF0cml4LCB3ZWlnaHRzKSB7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpO1xuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICB2YXIgdmFyaSA9IG5ldyBBcnJheShjb2xzKTtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgIHZhciBzdW0gPSAwO1xuICAgICAgICB2YXIgYSA9IDAsIGIgPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgeiA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgdmFyIHcgPSB3ZWlnaHRzW2ldO1xuXG4gICAgICAgICAgICBzdW0gKz0gdyAqICh6ICogeik7XG4gICAgICAgICAgICBiICs9IHc7XG4gICAgICAgICAgICBhICs9IHcgKiB3O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyaVtqXSA9IHN1bSAqIChiIC8gKGIgKiBiIC0gYSkpO1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpO1xufVxuXG5mdW5jdGlvbiB3ZWlnaHRlZE1lYW4obWF0cml4LCB3ZWlnaHRzLCBkaW1lbnNpb24pIHtcbiAgICBpZiAodHlwZW9mKGRpbWVuc2lvbikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9IDA7XG4gICAgfVxuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgbWVhbnMsIGksIGlpLCBqLCB3LCByb3c7XG5cbiAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIG1lYW5zID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBtZWFuc1tpXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgcm93ID0gbWF0cml4W2ldO1xuICAgICAgICAgICAgdyA9IHdlaWdodHNbaV07XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgbWVhbnNbal0gKz0gcm93W2pdICogdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIG1lYW5zID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBtZWFuc1tpXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgcm93ID0gbWF0cml4W2pdO1xuICAgICAgICAgICAgdyA9IHdlaWdodHNbal07XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbWVhbnNbal0gKz0gcm93W2ldICogdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG5cbiAgICB2YXIgd2VpZ2h0U3VtID0gYXJyYXlTdGF0LnN1bSh3ZWlnaHRzKTtcbiAgICBpZiAod2VpZ2h0U3VtICE9PSAwKSB7XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gbWVhbnMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgbWVhbnNbaV0gLz0gd2VpZ2h0U3VtO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtZWFucztcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRDb3ZhcmlhbmNlKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGRpbWVuc2lvbikge1xuICAgIGRpbWVuc2lvbiA9IGRpbWVuc2lvbiB8fCAwO1xuICAgIG1lYW5zID0gbWVhbnMgfHwgd2VpZ2h0ZWRNZWFuKG1hdHJpeCwgd2VpZ2h0cywgZGltZW5zaW9uKTtcbiAgICB2YXIgczEgPSAwLCBzMiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDAsIGlpID0gd2VpZ2h0cy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgIHMxICs9IHdlaWdodHNbaV07XG4gICAgICAgIHMyICs9IHdlaWdodHNbaV0gKiB3ZWlnaHRzW2ldO1xuICAgIH1cbiAgICB2YXIgZmFjdG9yID0gczEgLyAoczEgKiBzMSAtIHMyKTtcbiAgICByZXR1cm4gd2VpZ2h0ZWRTY2F0dGVyKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGZhY3RvciwgZGltZW5zaW9uKTtcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRTY2F0dGVyKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGZhY3RvciwgZGltZW5zaW9uKSB7XG4gICAgZGltZW5zaW9uID0gZGltZW5zaW9uIHx8IDA7XG4gICAgbWVhbnMgPSBtZWFucyB8fCB3ZWlnaHRlZE1lYW4obWF0cml4LCB3ZWlnaHRzLCBkaW1lbnNpb24pO1xuICAgIGlmICh0eXBlb2YoZmFjdG9yKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZmFjdG9yID0gMTtcbiAgICB9XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbW11dO1xuICAgIH1cbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGNvdiwgaSwgaiwgaywgcztcblxuICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCByb3dzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSB3ZWlnaHRzW2tdICogKG1hdHJpeFtrXVtqXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhba11baV0gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcyAqIGZhY3RvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gd2VpZ2h0c1trXSAqIChtYXRyaXhbal1ba10gLSBtZWFuc1tqXSkgKiAobWF0cml4W2ldW2tdIC0gbWVhbnNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzICogZmFjdG9yO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvdjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgZW50cm9weTogZW50cm9weSxcbiAgICBtZWFuOiBtZWFuLFxuICAgIHN0YW5kYXJkRGV2aWF0aW9uOiBzdGFuZGFyZERldmlhdGlvbixcbiAgICB2YXJpYW5jZTogdmFyaWFuY2UsXG4gICAgbWVkaWFuOiBtZWRpYW4sXG4gICAgbW9kZTogbW9kZSxcbiAgICBza2V3bmVzczogc2tld25lc3MsXG4gICAga3VydG9zaXM6IGt1cnRvc2lzLFxuICAgIHN0YW5kYXJkRXJyb3I6IHN0YW5kYXJkRXJyb3IsXG4gICAgY292YXJpYW5jZTogY292YXJpYW5jZSxcbiAgICBzY2F0dGVyOiBzY2F0dGVyLFxuICAgIGNvcnJlbGF0aW9uOiBjb3JyZWxhdGlvbixcbiAgICB6U2NvcmVzOiB6U2NvcmVzLFxuICAgIGNlbnRlcjogY2VudGVyLFxuICAgIHN0YW5kYXJkaXplOiBzdGFuZGFyZGl6ZSxcbiAgICB3ZWlnaHRlZFZhcmlhbmNlOiB3ZWlnaHRlZFZhcmlhbmNlLFxuICAgIHdlaWdodGVkTWVhbjogd2VpZ2h0ZWRNZWFuLFxuICAgIHdlaWdodGVkQ292YXJpYW5jZTogd2VpZ2h0ZWRDb3ZhcmlhbmNlLFxuICAgIHdlaWdodGVkU2NhdHRlcjogd2VpZ2h0ZWRTY2F0dGVyXG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3BjYScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFN0YXQgPSByZXF1aXJlKCdtbC1zdGF0Jyk7XG52YXIgU1ZEID0gTWF0cml4LkRDLlNWRDtcblxubW9kdWxlLmV4cG9ydHMgPSBQQ0E7XG5cbi8qKlxuKiBDcmVhdGVzIG5ldyBQQ0EgKFByaW5jaXBhbCBDb21wb25lbnQgQW5hbHlzaXMpIGZyb20gdGhlIGRhdGFzZXRcbiogQHBhcmFtIHtNYXRyaXh9IGRhdGFzZXRcbiogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBvcHRpb25zIGZvciB0aGUgUENBIGFsZ29yaXRobVxuKiBAcGFyYW0ge2Jvb2xlYW59IHJlbG9hZCAtIGZvciBsb2FkIHB1cnBvc2VzXG4qIEBwYXJhbSB7T2JqZWN0fSBtb2RlbCAtIGZvciBsb2FkIHB1cnBvc2VzXG4qIEBjb25zdHJ1Y3RvclxuKiAqL1xuZnVuY3Rpb24gUENBKGRhdGFzZXQsIG9wdGlvbnMsIHJlbG9hZCwgbW9kZWwpIHtcblxuICAgIGlmIChyZWxvYWQpIHtcbiAgICAgICAgdGhpcy5VID0gbW9kZWwuVTtcbiAgICAgICAgdGhpcy5TID0gbW9kZWwuUztcbiAgICAgICAgdGhpcy5tZWFucyA9IG1vZGVsLm1lYW5zO1xuICAgICAgICB0aGlzLnN0ZCA9IG1vZGVsLnN0ZDtcbiAgICAgICAgdGhpcy5zdGFuZGFyZGl6ZSA9IG1vZGVsLnN0YW5kYXJkaXplXG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYob3B0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIHN0YW5kYXJkaXplOiBmYWxzZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3RhbmRhcmRpemUgPSBvcHRpb25zLnN0YW5kYXJkaXplO1xuXG4gICAgICAgIGlmICghTWF0cml4LmlzTWF0cml4KGRhdGFzZXQpKSB7XG4gICAgICAgICAgICBkYXRhc2V0ID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRhdGFzZXQgPSBkYXRhc2V0LmNsb25lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbm9ybWFsaXphdGlvbiA9IGFkanVzdChkYXRhc2V0LCB0aGlzLnN0YW5kYXJkaXplKTtcbiAgICAgICAgdmFyIG5vcm1hbGl6ZWREYXRhc2V0ID0gbm9ybWFsaXphdGlvbi5yZXN1bHQ7XG5cbiAgICAgICAgdmFyIGNvdmFyaWFuY2VNYXRyaXggPSBub3JtYWxpemVkRGF0YXNldC50cmFuc3Bvc2UoKS5tbXVsKG5vcm1hbGl6ZWREYXRhc2V0KS5kaXZTKGRhdGFzZXQucm93cyk7XG5cbiAgICAgICAgdmFyIHRhcmdldCA9IG5ldyBTVkQoY292YXJpYW5jZU1hdHJpeCwge1xuICAgICAgICAgICAgY29tcHV0ZUxlZnRTaW5ndWxhclZlY3RvcnM6IHRydWUsXG4gICAgICAgICAgICBjb21wdXRlUmlnaHRTaW5ndWxhclZlY3RvcnM6IHRydWUsXG4gICAgICAgICAgICBhdXRvVHJhbnNwb3NlOiBmYWxzZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLlUgPSB0YXJnZXQubGVmdFNpbmd1bGFyVmVjdG9ycztcbiAgICAgICAgdGhpcy5TID0gdGFyZ2V0LmRpYWdvbmFsO1xuICAgICAgICB0aGlzLm1lYW5zID0gbm9ybWFsaXphdGlvbi5tZWFucztcbiAgICAgICAgdGhpcy5zdGQgPSBub3JtYWxpemF0aW9uLnN0ZDtcbiAgICB9XG59XG5cbi8qKlxuKiBMb2FkIGEgUENBIG1vZGVsIGZyb20gSlNPTlxuKiBAb2FyYW0ge09iamVjdH0gbW9kZWxcbiogQHJldHVybiB7UENBfVxuKiAqL1xuUENBLmxvYWQgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICBpZihtb2RlbC5tb2RlbE5hbWUgIT09ICdQQ0EnKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIlRoZSBjdXJyZW50IG1vZGVsIGlzIGludmFsaWQhXCIpO1xuXG4gICAgcmV0dXJuIG5ldyBQQ0EobnVsbCwgbnVsbCwgdHJ1ZSwgbW9kZWwpO1xufTtcblxuLyoqXG4qIEV4cG9ydHMgdGhlIGN1cnJlbnQgbW9kZWwgdG8gYW4gT2JqZWN0XG4qIEByZXR1cm4ge09iamVjdH0gbW9kZWxcbiogKi9cblBDQS5wcm90b3R5cGUuZXhwb3J0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG1vZGVsTmFtZTogXCJQQ0FcIixcbiAgICAgICAgVTogdGhpcy5VLFxuICAgICAgICBTOiB0aGlzLlMsXG4gICAgICAgIG1lYW5zOiB0aGlzLm1lYW5zLFxuICAgICAgICBzdGQ6IHRoaXMuc3RkLFxuICAgICAgICBzdGFuZGFyZGl6ZTogdGhpcy5zdGFuZGFyZGl6ZVxuICAgIH07XG59O1xuXG4vKipcbiogRnVuY3Rpb24gdGhhdCBwcm9qZWN0IHRoZSBkYXRhc2V0IGludG8gbmV3IHNwYWNlIG9mIGsgZGltZW5zaW9ucyxcbiogdGhpcyBtZXRob2QgZG9lc24ndCBtb2RpZnkgeW91ciBkYXRhc2V0LlxuKiBAcGFyYW0ge01hdHJpeH0gZGF0YXNldC5cbiogQHBhcmFtIHtOdW1iZXJ9IGsgLSBkaW1lbnNpb25zIHRvIHByb2plY3QuXG4qIEByZXR1cm4ge01hdHJpeH0gZGF0YXNldCBwcm9qZWN0ZWQgaW4gayBkaW1lbnNpb25zLlxuKiBAdGhyb3dzIHtSYW5nZUVycm9yfSBpZiBrIGlzIGxhcmdlciB0aGFuIHRoZSBudW1iZXIgb2YgZWlnZW52ZWN0b3JcbiogICAgICAgICAgICAgICAgICAgICAgb2YgdGhlIG1vZGVsLlxuKiAqL1xuUENBLnByb3RvdHlwZS5wcm9qZWN0ID0gZnVuY3Rpb24gKGRhdGFzZXQsIGspIHtcbiAgICB2YXIgZGltZW5zaW9ucyA9IGsgLSAxO1xuICAgIGlmKGsgPiB0aGlzLlUuY29sdW1ucylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJ0aGUgbnVtYmVyIG9mIGRpbWVuc2lvbnMgbXVzdCBub3QgYmUgbGFyZ2VyIHRoYW4gXCIgKyB0aGlzLlUuY29sdW1ucyk7XG5cbiAgICBpZiAoIU1hdHJpeC5pc01hdHJpeChkYXRhc2V0KSkge1xuICAgICAgICBkYXRhc2V0ID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhc2V0ID0gZGF0YXNldC5jbG9uZSgpO1xuICAgIH1cblxuICAgIHZhciBYID0gYWRqdXN0KGRhdGFzZXQsIHRoaXMuc3RhbmRhcmRpemUpLnJlc3VsdDtcbiAgICByZXR1cm4gWC5tbXVsKHRoaXMuVS5zdWJNYXRyaXgoMCwgdGhpcy5VLnJvd3MgLSAxLCAwLCBkaW1lbnNpb25zKSk7XG59O1xuXG4vKipcbiogVGhpcyBtZXRob2QgcmV0dXJucyB0aGUgcGVyY2VudGFnZSB2YXJpYW5jZSBvZiBlYWNoIGVpZ2VudmVjdG9yLlxuKiBAcmV0dXJuIHtOdW1iZXJ9IHBlcmNlbnRhZ2UgdmFyaWFuY2Ugb2YgZWFjaCBlaWdlbnZlY3Rvci5cbiogKi9cblBDQS5wcm90b3R5cGUuZ2V0RXhwbGFpbmVkVmFyaWFuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN1bSA9IHRoaXMuUy5yZWR1Y2UoZnVuY3Rpb24gKHByZXZpb3VzLCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gcHJldmlvdXMgKyB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5TLm1hcChmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlIC8gc3VtO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIEVpZ2VudmVjdG9ycyBvZiB0aGUgY292YXJpYW5jZSBtYXRyaXguXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5QQ0EucHJvdG90eXBlLmdldEVpZ2VudmVjdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5VO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIEVpZ2VudmFsdWVzIChvbiB0aGUgZGlhZ29uYWwpLlxuICogQHJldHVybnMgeyp9XG4gKi9cblBDQS5wcm90b3R5cGUuZ2V0RWlnZW52YWx1ZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuUztcbn07XG5cbi8qKlxuKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgZGF0YXNldCBub3JtYWxpemVkIGluIHRoZSBmb2xsb3dpbmcgZm9ybTpcbiogWCA9IChYIC0gbWVhbikgLyBzdGRcbiogQHBhcmFtIGRhdGFzZXQuXG4qIEBwYXJhbSB7Qm9vbGVhbn0gc3RhbmRhcml6ZSAtIGRvIHN0YW5kYXJkaXphdGlvblxuKiBAcmV0dXJuIEEgZGF0YXNldCBub3JtYWxpemVkLlxuKiAqL1xuZnVuY3Rpb24gYWRqdXN0KGRhdGFzZXQsIHN0YW5kYXJpemUpIHtcbiAgICB2YXIgbWVhbnMgPSBTdGF0Lm1hdHJpeC5tZWFuKGRhdGFzZXQpO1xuICAgIHZhciBzdGQgPSBzdGFuZGFyaXplID8gU3RhdC5tYXRyaXguc3RhbmRhcmREZXZpYXRpb24oZGF0YXNldCwgbWVhbnMsIHRydWUpIDogdW5kZWZpbmVkO1xuXG4gICAgdmFyIHJlc3VsdCA9IGRhdGFzZXQuc3ViUm93VmVjdG9yKG1lYW5zKTtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN1bHQ6IHN0YW5kYXJpemUgPyByZXN1bHQuZGl2Um93VmVjdG9yKHN0ZCkgOiByZXN1bHQsXG4gICAgICAgIG1lYW5zOiBtZWFucyxcbiAgICAgICAgc3RkOiBzdGRcbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSByZXF1aXJlKCcuL3BscycpO1xuZXhwb3J0cy5VdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbmV4cG9ydHMuT1BMUyA9IHJlcXVpcmUoJy4vb3BscycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gT1BMUztcblxuZnVuY3Rpb24gT1BMUyhkYXRhc2V0LCBwcmVkaWN0aW9ucywgbnVtYmVyT1NDKSB7XG4gICAgdmFyIFggPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuICAgIHZhciB5ID0gbmV3IE1hdHJpeChwcmVkaWN0aW9ucyk7XG5cbiAgICBYID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZShYKS5yZXN1bHQ7XG4gICAgeSA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUoeSkucmVzdWx0O1xuXG4gICAgdmFyIHJvd3MgPSBYLnJvd3M7XG4gICAgdmFyIGNvbHVtbnMgPSBYLmNvbHVtbnM7XG5cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7XG4gICAgdmFyIHcgPSBYLnRyYW5zcG9zZSgpLm1tdWwoeSk7XG4gICAgdy5kaXYoVXRpbHMubm9ybSh3KSk7XG5cbiAgICB2YXIgb3J0aG9XID0gbmV3IEFycmF5KG51bWJlck9TQyk7XG4gICAgdmFyIG9ydGhvVCA9IG5ldyBBcnJheShudW1iZXJPU0MpO1xuICAgIHZhciBvcnRob1AgPSBuZXcgQXJyYXkobnVtYmVyT1NDKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bWJlck9TQzsgaSsrKSB7XG4gICAgICAgIHZhciB0ID0gWC5tbXVsKHcpO1xuXG4gICAgICAgIHZhciBudW1lcmF0b3IgPSBYLnRyYW5zcG9zZSgpLm1tdWwodCk7XG4gICAgICAgIHZhciBkZW5vbWluYXRvciA9IHQudHJhbnNwb3NlKCkubW11bCh0KVswXVswXTtcbiAgICAgICAgdmFyIHAgPSAgbnVtZXJhdG9yLmRpdihkZW5vbWluYXRvcik7XG5cbiAgICAgICAgbnVtZXJhdG9yID0gdy50cmFuc3Bvc2UoKS5tbXVsKHApWzBdWzBdO1xuICAgICAgICBkZW5vbWluYXRvciA9IHcudHJhbnNwb3NlKCkubW11bCh3KVswXVswXTtcbiAgICAgICAgdmFyIHdPc2MgPSBwLnN1Yih3LmNsb25lKCkubXVsKG51bWVyYXRvciAvIGRlbm9taW5hdG9yKSk7XG4gICAgICAgIHdPc2MuZGl2KFV0aWxzLm5vcm0od09zYykpO1xuXG4gICAgICAgIHZhciB0T3NjID0gWC5tbXVsKHdPc2MpO1xuXG4gICAgICAgIG51bWVyYXRvciA9IFgudHJhbnNwb3NlKCkubW11bCh0T3NjKTtcbiAgICAgICAgZGVub21pbmF0b3IgPSB0T3NjLnRyYW5zcG9zZSgpLm1tdWwodE9zYylbMF1bMF07XG4gICAgICAgIHZhciBwT3NjID0gbnVtZXJhdG9yLmRpdihkZW5vbWluYXRvcik7XG5cbiAgICAgICAgWC5zdWIodE9zYy5tbXVsKHBPc2MudHJhbnNwb3NlKCkpKTtcbiAgICAgICAgb3J0aG9XW2ldID0gd09zYy5nZXRDb2x1bW4oMCk7XG4gICAgICAgIG9ydGhvVFtpXSA9IHRPc2MuZ2V0Q29sdW1uKDApO1xuICAgICAgICBvcnRob1BbaV0gPSBwT3NjLmdldENvbHVtbigwKTtcbiAgICB9XG5cbiAgICB0aGlzLlhvc2MgPSBYO1xuXG4gICAgdmFyIHN1bU9mU3F1YXJlc1hvc3ggPSB0aGlzLlhvc2MuY2xvbmUoKS5tdWwodGhpcy5Yb3NjKS5zdW0oKTtcbiAgICB0aGlzLlIyWCA9IDEgLSBzdW1PZlNxdWFyZXNYb3N4L3N1bU9mU3F1YXJlc1g7XG5cbiAgICB0aGlzLlcgPSBvcnRob1c7XG4gICAgdGhpcy5UID0gb3J0aG9UO1xuICAgIHRoaXMuUCA9IG9ydGhvUDtcbiAgICB0aGlzLm51bWJlck9TQyA9IG51bWJlck9TQztcbn1cblxuT1BMUy5wcm90b3R5cGUuY29ycmVjdERhdGFzZXQgPSBmdW5jdGlvbiAoZGF0YXNldCkge1xuICAgIHZhciBYID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcblxuICAgIHZhciBzdW1PZlNxdWFyZXNYID0gWC5jbG9uZSgpLm11bChYKS5zdW0oKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubnVtYmVyT1NDOyBpKyspIHtcbiAgICAgICAgdmFyIGN1cnJlbnRXID0gdGhpcy5XLmdldENvbHVtblZlY3RvcihpKTtcbiAgICAgICAgdmFyIGN1cnJlbnRQID0gdGhpcy5QLmdldENvbHVtblZlY3RvcihpKTtcblxuICAgICAgICB2YXIgdCA9IFgubW11bChjdXJyZW50Vyk7XG4gICAgICAgIFguc3ViKHQubW11bChjdXJyZW50UCkpO1xuICAgIH1cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWG9zeCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7XG5cbiAgICB2YXIgUjJYID0gMSAtIHN1bU9mU3F1YXJlc1hvc3ggLyBzdW1PZlNxdWFyZXNYO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YXNldE9zYzogWCxcbiAgICAgICAgUjJEYXRhc2V0OiBSMlhcbiAgICB9O1xufTsiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gUExTO1xudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgc3VtIGF0IHRoZSBjb2x1bW4gb2YgdGhlIGdpdmVuIG1hdHJpeC5cbiAqIEBwYXJhbSBtYXRyaXhcbiAqIEBwYXJhbSBjb2x1bW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGdldENvbFN1bShtYXRyaXgsIGNvbHVtbikge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF0cml4LnJvd3M7IGkrKykge1xuICAgICAgICBzdW0gKz0gbWF0cml4W2ldW2NvbHVtbl07XG4gICAgfVxuICAgIHJldHVybiBzdW07XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBpbmRleCB3aGVyZSB0aGUgc3VtIG9mIGVhY2hcbiAqIGNvbHVtbiB2ZWN0b3IgaXMgbWF4aW11bS5cbiAqIEBwYXJhbSB7TWF0cml4fSBkYXRhXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBpbmRleCBvZiB0aGUgbWF4aW11bVxuICovXG5mdW5jdGlvbiBtYXhTdW1Db2xJbmRleChkYXRhKSB7XG4gICAgdmFyIG1heEluZGV4ID0gMDtcbiAgICB2YXIgbWF4U3VtID0gLUluZmluaXR5O1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhLmNvbHVtbnM7ICsraSkge1xuICAgICAgICB2YXIgY3VycmVudFN1bSA9IGdldENvbFN1bShkYXRhLCBpKTtcbiAgICAgICAgaWYoY3VycmVudFN1bSA+IG1heFN1bSkge1xuICAgICAgICAgICAgbWF4U3VtID0gY3VycmVudFN1bTtcbiAgICAgICAgICAgIG1heEluZGV4ID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWF4SW5kZXg7XG59XG5cbi8qKlxuICogQ29uc3RydWN0b3Igb2YgdGhlIFBMUyBtb2RlbC5cbiAqIEBwYXJhbSByZWxvYWQgLSB1c2VkIGZvciBsb2FkIHB1cnBvc2VzLlxuICogQHBhcmFtIG1vZGVsIC0gdXNlZCBmb3IgbG9hZCBwdXJwb3Nlcy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBQTFMocmVsb2FkLCBtb2RlbCkge1xuICAgIGlmKHJlbG9hZCkge1xuICAgICAgICB0aGlzLkUgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuRSk7XG4gICAgICAgIHRoaXMuRiA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5GKTtcbiAgICAgICAgdGhpcy5zc3FZY2FsID0gbW9kZWwuc3NxWWNhbDtcbiAgICAgICAgdGhpcy5SMlggPSBtb2RlbC5SMlg7XG4gICAgICAgIHRoaXMueW1lYW4gPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwueW1lYW4pO1xuICAgICAgICB0aGlzLnlzdGQgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwueXN0ZCk7XG4gICAgICAgIHRoaXMuUEJRID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlBCUSk7XG4gICAgICAgIHRoaXMuVCA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5UKTtcbiAgICAgICAgdGhpcy5QID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlApO1xuICAgICAgICB0aGlzLlUgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuVSk7XG4gICAgICAgIHRoaXMuUSA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5RKTtcbiAgICAgICAgdGhpcy5XID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlcpO1xuICAgICAgICB0aGlzLkIgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuQik7XG4gICAgfVxufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgZml0IHRoZSBtb2RlbCB3aXRoIHRoZSBnaXZlbiBkYXRhIGFuZCBwcmVkaWN0aW9ucywgaW4gdGhpcyBmdW5jdGlvbiBpcyBjYWxjdWxhdGVkIHRoZVxuICogZm9sbG93aW5nIG91dHB1dHM6XG4gKlxuICogVCAtIFNjb3JlIG1hdHJpeCBvZiBYXG4gKiBQIC0gTG9hZGluZyBtYXRyaXggb2YgWFxuICogVSAtIFNjb3JlIG1hdHJpeCBvZiBZXG4gKiBRIC0gTG9hZGluZyBtYXRyaXggb2YgWVxuICogQiAtIE1hdHJpeCBvZiByZWdyZXNzaW9uIGNvZWZmaWNpZW50XG4gKiBXIC0gV2VpZ2h0IG1hdHJpeCBvZiBYXG4gKlxuICogQHBhcmFtIHtNYXRyaXh9IHRyYWluaW5nU2V0IC0gRGF0YXNldCB0byBiZSBhcHBseSB0aGUgbW9kZWxcbiAqIEBwYXJhbSB7TWF0cml4fSBwcmVkaWN0aW9ucyAtIFByZWRpY3Rpb25zIG92ZXIgZWFjaCBjYXNlIG9mIHRoZSBkYXRhc2V0XG4gKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucyAtIHJlY2lldmVzIHRoZSBsYXRlbnRWZWN0b3JzIGFuZCB0aGUgdG9sZXJhbmNlIG9mIGVhY2ggc3RlcCBvZiB0aGUgUExTXG4gKi9cblBMUy5wcm90b3R5cGUudHJhaW4gPSBmdW5jdGlvbiAodHJhaW5pbmdTZXQsIHByZWRpY3Rpb25zLCBvcHRpb25zKSB7XG5cbiAgICBpZihvcHRpb25zID09PSB1bmRlZmluZWQpIG9wdGlvbnMgPSB7fTtcblxuICAgIHZhciBsYXRlbnRWZWN0b3JzID0gb3B0aW9ucy5sYXRlbnRWZWN0b3JzO1xuICAgIGlmKGxhdGVudFZlY3RvcnMgPT09IHVuZGVmaW5lZCB8fCBpc05hTihsYXRlbnRWZWN0b3JzKSkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIkxhdGVudCB2ZWN0b3IgbXVzdCBiZSBhIG51bWJlci5cIik7XG4gICAgfVxuXG4gICAgdmFyIHRvbGVyYW5jZSA9IG9wdGlvbnMudG9sZXJhbmNlO1xuICAgIGlmKHRvbGVyYW5jZSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKHRvbGVyYW5jZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUb2xlcmFuY2UgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICB9XG5cbiAgICBpZih0cmFpbmluZ1NldC5sZW5ndGggIT09IHByZWRpY3Rpb25zLmxlbmd0aClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUaGUgbnVtYmVyIG9mIHByZWRpY3Rpb25zIGFuZCBlbGVtZW50cyBpbiB0aGUgZGF0YXNldCBtdXN0IGJlIHRoZSBzYW1lXCIpO1xuXG4gICAgLy92YXIgdG9sZXJhbmNlID0gMWUtOTtcbiAgICB2YXIgWCA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUobmV3IE1hdHJpeCh0cmFpbmluZ1NldCkpLnJlc3VsdDtcbiAgICB2YXIgcmVzdWx0WSA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUobmV3IE1hdHJpeChwcmVkaWN0aW9ucykpO1xuICAgIHRoaXMueW1lYW4gPSByZXN1bHRZLm1lYW5zLm5lZygpO1xuICAgIHRoaXMueXN0ZCA9IHJlc3VsdFkuc3RkO1xuICAgIHZhciBZID0gcmVzdWx0WS5yZXN1bHQ7XG5cbiAgICB2YXIgcnggPSBYLnJvd3M7XG4gICAgdmFyIGN4ID0gWC5jb2x1bW5zO1xuICAgIHZhciByeSA9IFkucm93cztcbiAgICB2YXIgY3kgPSBZLmNvbHVtbnM7XG5cbiAgICBpZihyeCAhPSByeSkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcImRhdGFzZXQgY2FzZXMgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBwcmVkaWN0aW9uc1wiKTtcbiAgICB9XG5cbiAgICB2YXIgc3NxWGNhbCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7IC8vIGZvciB0aGUgcsKyXG4gICAgdmFyIHN1bU9mU3F1YXJlc1kgPSBZLmNsb25lKCkubXVsKFkpLnN1bSgpO1xuXG4gICAgdmFyIG4gPSBsYXRlbnRWZWN0b3JzOyAvL01hdGgubWF4KGN4LCBjeSk7IC8vIGNvbXBvbmVudHMgb2YgdGhlIHBsc1xuICAgIHZhciBUID0gTWF0cml4Lnplcm9zKHJ4LCBuKTtcbiAgICB2YXIgUCA9IE1hdHJpeC56ZXJvcyhjeCwgbik7XG4gICAgdmFyIFUgPSBNYXRyaXguemVyb3MocnksIG4pO1xuICAgIHZhciBRID0gTWF0cml4Lnplcm9zKGN5LCBuKTtcbiAgICB2YXIgQiA9IE1hdHJpeC56ZXJvcyhuLCBuKTtcbiAgICB2YXIgVyA9IFAuY2xvbmUoKTtcbiAgICB2YXIgayA9IDA7XG4gICAgdmFyIFIyWCA9IG5ldyBBcnJheShuKTtcblxuICAgIHdoaWxlKFV0aWxzLm5vcm0oWSkgPiB0b2xlcmFuY2UgJiYgayA8IG4pIHtcbiAgICAgICAgdmFyIHRyYW5zcG9zZVggPSBYLnRyYW5zcG9zZSgpO1xuICAgICAgICB2YXIgdHJhbnNwb3NlWSA9IFkudHJhbnNwb3NlKCk7XG5cbiAgICAgICAgdmFyIHRJbmRleCA9IG1heFN1bUNvbEluZGV4KFguY2xvbmUoKS5tdWxNKFgpKTtcbiAgICAgICAgdmFyIHVJbmRleCA9IG1heFN1bUNvbEluZGV4KFkuY2xvbmUoKS5tdWxNKFkpKTtcblxuICAgICAgICB2YXIgdDEgPSBYLmdldENvbHVtblZlY3Rvcih0SW5kZXgpO1xuICAgICAgICB2YXIgdSA9IFkuZ2V0Q29sdW1uVmVjdG9yKHVJbmRleCk7XG4gICAgICAgIHZhciB0ID0gTWF0cml4Lnplcm9zKHJ4LCAxKTtcblxuICAgICAgICB3aGlsZShVdGlscy5ub3JtKHQxLmNsb25lKCkuc3ViKHQpKSA+IHRvbGVyYW5jZSkge1xuICAgICAgICAgICAgdmFyIHcgPSB0cmFuc3Bvc2VYLm1tdWwodSk7XG4gICAgICAgICAgICB3LmRpdihVdGlscy5ub3JtKHcpKTtcbiAgICAgICAgICAgIHQgPSB0MTtcbiAgICAgICAgICAgIHQxID0gWC5tbXVsKHcpO1xuICAgICAgICAgICAgdmFyIHEgPSB0cmFuc3Bvc2VZLm1tdWwodDEpO1xuICAgICAgICAgICAgcS5kaXYoVXRpbHMubm9ybShxKSk7XG4gICAgICAgICAgICB1ID0gWS5tbXVsKHEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdCA9IHQxO1xuICAgICAgICB2YXIgbnVtID0gdHJhbnNwb3NlWC5tbXVsKHQpO1xuICAgICAgICB2YXIgZGVuID0gKHQudHJhbnNwb3NlKCkubW11bCh0KSlbMF1bMF07XG4gICAgICAgIHZhciBwID0gbnVtLmRpdihkZW4pO1xuICAgICAgICB2YXIgcG5vcm0gPSBVdGlscy5ub3JtKHApO1xuICAgICAgICBwLmRpdihwbm9ybSk7XG4gICAgICAgIHQubXVsKHBub3JtKTtcbiAgICAgICAgdy5tdWwocG5vcm0pO1xuXG4gICAgICAgIG51bSA9IHUudHJhbnNwb3NlKCkubW11bCh0KTtcbiAgICAgICAgZGVuID0gKHQudHJhbnNwb3NlKCkubW11bCh0KSlbMF1bMF07XG4gICAgICAgIHZhciBiID0gKG51bS5kaXYoZGVuKSlbMF1bMF07XG4gICAgICAgIFguc3ViKHQubW11bChwLnRyYW5zcG9zZSgpKSk7XG4gICAgICAgIFkuc3ViKHQuY2xvbmUoKS5tdWwoYikubW11bChxLnRyYW5zcG9zZSgpKSk7XG5cbiAgICAgICAgVC5zZXRDb2x1bW4oaywgdCk7XG4gICAgICAgIFAuc2V0Q29sdW1uKGssIHApO1xuICAgICAgICBVLnNldENvbHVtbihrLCB1KTtcbiAgICAgICAgUS5zZXRDb2x1bW4oaywgcSk7XG4gICAgICAgIFcuc2V0Q29sdW1uKGssIHcpO1xuXG4gICAgICAgIEJba11ba10gPSBiO1xuICAgICAgICBrKys7XG4gICAgfVxuXG4gICAgay0tO1xuICAgIFQgPSBULnN1Yk1hdHJpeCgwLCBULnJvd3MgLSAxLCAwLCBrKTtcbiAgICBQID0gUC5zdWJNYXRyaXgoMCwgUC5yb3dzIC0gMSwgMCwgayk7XG4gICAgVSA9IFUuc3ViTWF0cml4KDAsIFUucm93cyAtIDEsIDAsIGspO1xuICAgIFEgPSBRLnN1Yk1hdHJpeCgwLCBRLnJvd3MgLSAxLCAwLCBrKTtcbiAgICBXID0gVy5zdWJNYXRyaXgoMCwgVy5yb3dzIC0gMSwgMCwgayk7XG4gICAgQiA9IEIuc3ViTWF0cml4KDAsIGssIDAsIGspO1xuXG4gICAgdGhpcy5SMlggPSB0LnRyYW5zcG9zZSgpLm1tdWwodCkubW11bChwLnRyYW5zcG9zZSgpLm1tdWwocCkpLmRpdlMoc3NxWGNhbClbMF1bMF07XG5cbiAgICAvLyBUT0RPOiByZXZpZXcgb2YgUjJZXG4gICAgLy90aGlzLlIyWSA9IHQudHJhbnNwb3NlKCkubW11bCh0KS5tdWwocVtrXVswXSpxW2tdWzBdKS5kaXZTKHNzcVljYWwpWzBdWzBdO1xuXG4gICAgdGhpcy5zc3FZY2FsID0gc3VtT2ZTcXVhcmVzWTtcbiAgICB0aGlzLkUgPSBYO1xuICAgIHRoaXMuRiA9IFk7XG4gICAgdGhpcy5UID0gVDtcbiAgICB0aGlzLlAgPSBQO1xuICAgIHRoaXMuVSA9IFU7XG4gICAgdGhpcy5RID0gUTtcbiAgICB0aGlzLlcgPSBXO1xuICAgIHRoaXMuQiA9IEI7XG4gICAgdGhpcy5QQlEgPSBQLm1tdWwoQikubW11bChRLnRyYW5zcG9zZSgpKTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBwcmVkaWN0IHRoZSBiZWhhdmlvciBvZiB0aGUgZ2l2ZW4gZGF0YXNldC5cbiAqIEBwYXJhbSBkYXRhc2V0IC0gZGF0YSB0byBiZSBwcmVkaWN0ZWQuXG4gKiBAcmV0dXJucyB7TWF0cml4fSAtIHByZWRpY3Rpb25zIG9mIGVhY2ggZWxlbWVudCBvZiB0aGUgZGF0YXNldC5cbiAqL1xuUExTLnByb3RvdHlwZS5wcmVkaWN0ID0gZnVuY3Rpb24gKGRhdGFzZXQpIHtcbiAgICB2YXIgWCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG4gICAgdmFyIG5vcm1hbGl6YXRpb24gPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKFgpO1xuICAgIFggPSBub3JtYWxpemF0aW9uLnJlc3VsdDtcbiAgICB2YXIgWSA9IFgubW11bCh0aGlzLlBCUSk7XG4gICAgWS5tdWxSb3dWZWN0b3IodGhpcy55c3RkKTtcbiAgICBZLmFkZFJvd1ZlY3Rvcih0aGlzLnltZWFuKTtcbiAgICByZXR1cm4gWTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBleHBsYWluZWQgdmFyaWFuY2Ugb24gdHJhaW5pbmcgb2YgdGhlIFBMUyBtb2RlbC5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblBMUy5wcm90b3R5cGUuZ2V0RXhwbGFpbmVkVmFyaWFuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuUjJYO1xufTtcblxuLyoqXG4gKiBMb2FkIGEgUExTIG1vZGVsIGZyb20gYW4gT2JqZWN0XG4gKiBAcGFyYW0gbW9kZWxcbiAqIEByZXR1cm5zIHtQTFN9IC0gUExTIG9iamVjdCBmcm9tIHRoZSBnaXZlbiBtb2RlbFxuICovXG5QTFMubG9hZCA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIGlmKG1vZGVsLm1vZGVsTmFtZSAhPT0gJ1BMUycpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiVGhlIGN1cnJlbnQgbW9kZWwgaXMgaW52YWxpZCFcIik7XG5cbiAgICByZXR1cm4gbmV3IFBMUyh0cnVlLCBtb2RlbCk7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgZXhwb3J0cyBhIFBMUyBtb2RlbCB0byBhbiBPYmplY3QuXG4gKiBAcmV0dXJucyB7e21vZGVsTmFtZTogc3RyaW5nLCB5bWVhbjogKiwgeXN0ZDogKiwgUEJROiAqfX0gbW9kZWwuXG4gKi9cblBMUy5wcm90b3R5cGUuZXhwb3J0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG1vZGVsTmFtZTogXCJQTFNcIixcbiAgICAgICAgRTogdGhpcy5FLFxuICAgICAgICBGOiB0aGlzLkYsXG4gICAgICAgIFIyWDogdGhpcy5SMlgsXG4gICAgICAgIHNzcVljYWw6IHRoaXMuc3NxWWNhbCxcbiAgICAgICAgeW1lYW46IHRoaXMueW1lYW4sXG4gICAgICAgIHlzdGQ6IHRoaXMueXN0ZCxcbiAgICAgICAgUEJROiB0aGlzLlBCUSxcbiAgICAgICAgVDogdGhpcy5ULFxuICAgICAgICBQOiB0aGlzLlAsXG4gICAgICAgIFU6IHRoaXMuVSxcbiAgICAgICAgUTogdGhpcy5RLFxuICAgICAgICBXOiB0aGlzLlcsXG4gICAgICAgIEI6IHRoaXMuQlxuICAgIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgU3RhdCA9IHJlcXVpcmUoJ21sLXN0YXQnKTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IGdpdmVuIHZlY3RvciwgcmV0dXJucyBoaXMgbm9ybVxuICogQHBhcmFtIHtWZWN0b3J9IFhcbiAqIEByZXR1cm5zIHtudW1iZXJ9IE5vcm0gb2YgdGhlIHZlY3RvclxuICovXG5mdW5jdGlvbiBub3JtKFgpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KFguY2xvbmUoKS5hcHBseShwb3cyYXJyYXkpLnN1bSgpKTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHBvdyAyIGVhY2ggZWxlbWVudCBvZiBhIE1hdHJpeCBvciBhIFZlY3RvcixcbiAqIHVzZWQgaW4gdGhlIGFwcGx5IG1ldGhvZCBvZiB0aGUgTWF0cml4IG9iamVjdFxuICogQHBhcmFtIGkgLSBpbmRleCBpLlxuICogQHBhcmFtIGogLSBpbmRleCBqLlxuICogQHJldHVybiBUaGUgTWF0cml4IG9iamVjdCBtb2RpZmllZCBhdCB0aGUgaW5kZXggaSwgai5cbiAqICovXG5mdW5jdGlvbiBwb3cyYXJyYXkoaSwgaikge1xuICAgIHRoaXNbaV1bal0gPSB0aGlzW2ldW2pdICogdGhpc1tpXVtqXTtcbiAgICByZXR1cm4gdGhpcztcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IG5vcm1hbGl6ZSB0aGUgZGF0YXNldCBhbmQgcmV0dXJuIHRoZSBtZWFucyBhbmRcbiAqIHN0YW5kYXJkIGRldmlhdGlvbiBvZiBlYWNoIGZlYXR1cmUuXG4gKiBAcGFyYW0gZGF0YXNldFxuICogQHJldHVybnMge3tyZXN1bHQ6IE1hdHJpeCwgbWVhbnM6ICgqfG51bWJlciksIHN0ZDogTWF0cml4fX0gZGF0YXNldCBub3JtYWxpemVkLCBtZWFuc1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYW5kIHN0YW5kYXJkIGRldmlhdGlvbnNcbiAqL1xuZnVuY3Rpb24gZmVhdHVyZU5vcm1hbGl6ZShkYXRhc2V0KSB7XG4gICAgdmFyIG1lYW5zID0gU3RhdC5tYXRyaXgubWVhbihkYXRhc2V0KTtcbiAgICB2YXIgc3RkID0gTWF0cml4LnJvd1ZlY3RvcihTdGF0Lm1hdHJpeC5zdGFuZGFyZERldmlhdGlvbihkYXRhc2V0LCBtZWFucywgdHJ1ZSkpO1xuICAgIG1lYW5zID0gTWF0cml4LnJvd1ZlY3RvcihtZWFucyk7XG5cbiAgICB2YXIgcmVzdWx0ID0gZGF0YXNldC5hZGRSb3dWZWN0b3IobWVhbnMubmVnKCkpO1xuICAgIHJldHVybiB7cmVzdWx0OiByZXN1bHQuZGl2Um93VmVjdG9yKHN0ZCksIG1lYW5zOiBtZWFucywgc3RkOiBzdGR9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBub3JtOiBub3JtLFxuICAgIHBvdzJhcnJheTogcG93MmFycmF5LFxuICAgIGZlYXR1cmVOb3JtYWxpemU6IGZlYXR1cmVOb3JtYWxpemVcbn07XG5cbiIsIi8qIVxuICogbmdDb3Jkb3ZhXG4gKiB2MC4xLjIzLWFscGhhXG4gKiBDb3B5cmlnaHQgMjAxNSBEcmlmdHkgQ28uIGh0dHA6Ly9kcmlmdHkuY29tL1xuICogU2VlIExJQ0VOU0UgaW4gdGhpcyByZXBvc2l0b3J5IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uXG4gKi9cbihmdW5jdGlvbigpe1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhJywgW1xuICAnbmdDb3Jkb3ZhLnBsdWdpbnMnXG5dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9jb3Jkb3ZhLXBsdWdpbi1hY3Rpb25zaGVldC5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9jb3Jkb3ZhLXBsdWdpbi1hY3Rpb25zaGVldFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYWN0aW9uU2hlZXQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFBY3Rpb25TaGVldCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3c6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuYWN0aW9uc2hlZXQuc2hvdyhvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbnMuYWN0aW9uc2hlZXQuaGlkZSgpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1hZG1vYi5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1hZG1vYlxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYWRNb2InLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFBZE1vYicsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNyZWF0ZUJhbm5lclZpZXc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuQWRNb2IuY3JlYXRlQmFubmVyVmlldyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlSW50ZXJzdGl0aWFsVmlldzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5BZE1vYi5jcmVhdGVJbnRlcnN0aXRpYWxWaWV3KG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZXF1ZXN0QWQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuQWRNb2IucmVxdWVzdEFkKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QWQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuQWRNb2Iuc2hvd0FkKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZXF1ZXN0SW50ZXJzdGl0aWFsQWQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuQWRNb2IucmVxdWVzdEludGVyc3RpdGlhbEFkKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL29oaDJhaGgvQXBwQXZhaWxhYmlsaXR5LmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL29oaDJhaGgvQXBwQXZhaWxhYmlsaXR5XG5cbi8qIGdsb2JhbHMgYXBwQXZhaWxhYmlsaXR5OiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwQXZhaWxhYmlsaXR5JywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQXBwQXZhaWxhYmlsaXR5JywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNoZWNrOiBmdW5jdGlvbiAodXJsU2NoZW1lKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBhcHBBdmFpbGFiaWxpdHkuY2hlY2sodXJsU2NoZW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9wdXNoYW5kcGxheS9jb3Jkb3ZhLXBsdWdpbi1hcHByYXRlLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL3B1c2hhbmRwbGF5L2NvcmRvdmEtcGx1Z2luLWFwcHJhdGVcblxuLyogZ2xvYmFscyBBcHBSYXRlOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwUmF0ZScsIFtdKVxuXG4gIC5wcm92aWRlcignJGNvcmRvdmFBcHBSYXRlJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIC8qKlxuICAgICAgKiBTZXQgZGVmYXVsdHMgc2V0dGluZ3MgdG8gQXBwUmF0ZVxuICAgICAgKlxuICAgICAgKiBAcGFyYW0ge09iamVjdH0gZGVmYXVsdHMgLSBBcHBSYXRlIGRlZmF1bHQgc2V0dGluZ3NcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLmxhbmd1YWdlXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy5hcHBOYW1lXG4gICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZGVmYXVsdHMucHJvbXB0Rm9yTmV3VmVyc2lvblxuICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGRlZmF1bHRzLm9wZW5TdG9yZUluQXBwXG4gICAgICAqIEBwYXJhbSB7bnVtYmVyfSBkZWZhdWx0cy51c2VzVW50aWxQcm9tcHRcbiAgICAgICogQHBhcmFtIHtib29sZWFufSBkZWZhdWx0cy51c2VDdXN0b21SYXRlRGlhbG9nXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy5pb3NVUkxcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLmFuZHJvaWRVUkxcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLmJsYWNrYmVycnlVUkxcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLndpbmRvd3NVUkxcbiAgICAgICovXG4gICAgdGhpcy5zZXRQcmVmZXJlbmNlcyA9IGZ1bmN0aW9uIChkZWZhdWx0cykge1xuICAgICAgaWYgKCFkZWZhdWx0cyB8fCAhYW5ndWxhci5pc09iamVjdChkZWZhdWx0cykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnVzZUxhbmd1YWdlID0gZGVmYXVsdHMubGFuZ3VhZ2UgfHwgbnVsbDtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuZGlzcGxheUFwcE5hbWUgPSBkZWZhdWx0cy5hcHBOYW1lIHx8ICcnO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5wcm9tcHRBZ2FpbkZvckVhY2hOZXdWZXJzaW9uID0gZGVmYXVsdHMucHJvbXB0Rm9yTmV3VmVyc2lvbiB8fCB0cnVlO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5vcGVuU3RvcmVJbkFwcCA9IGRlZmF1bHRzLm9wZW5TdG9yZUluQXBwIHx8IGZhbHNlO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy51c2VzVW50aWxQcm9tcHQgPSBkZWZhdWx0cy51c2VzVW50aWxQcm9tcHQgfHwgMztcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMudXNlQ3VzdG9tUmF0ZURpYWxvZyA9IGRlZmF1bHRzLnVzZUN1c3RvbVJhdGVEaWFsb2cgfHwgZmFsc2U7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnN0b3JlQXBwVVJMLmlvcyA9IGRlZmF1bHRzLmlvc1VSTCB8fCBudWxsO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5zdG9yZUFwcFVSTC5hbmRyb2lkID0gZGVmYXVsdHMuYW5kcm9pZFVSTCB8fCBudWxsO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5zdG9yZUFwcFVSTC5ibGFja2JlcnJ5ID0gZGVmYXVsdHMuYmxhY2tiZXJyeVVSTCB8fCBudWxsO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5zdG9yZUFwcFVSTC53aW5kb3dzOCA9IGRlZmF1bHRzLndpbmRvd3NVUkwgfHwgbnVsbDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICAqIFNldCBjdXN0b20gbG9jYWxlXG4gICAgICAqXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjdXN0b21PYmpcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGN1c3RvbU9iai50aXRsZVxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY3VzdG9tT2JqLmNhbmNlbEJ1dHRvbkxhYmVsXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjdXN0b21PYmoubGF0ZXJCdXR0b25MYWJlbFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY3VzdG9tT2JqLnJhdGVCdXR0b25MYWJlbFxuICAgICAgKi9cbiAgICB0aGlzLnNldEN1c3RvbUxvY2FsZSA9IGZ1bmN0aW9uIChjdXN0b21PYmopIHtcbiAgICAgIHZhciBzdHJpbmdzID0ge1xuICAgICAgICB0aXRsZTogJ1JhdGUgJUAnLFxuICAgICAgICBtZXNzYWdlOiAnSWYgeW91IGVuam95IHVzaW5nICVALCB3b3VsZCB5b3UgbWluZCB0YWtpbmcgYSBtb21lbnQgdG8gcmF0ZSBpdD8gSXQgd29u4oCZdCB0YWtlIG1vcmUgdGhhbiBhIG1pbnV0ZS4gVGhhbmtzIGZvciB5b3VyIHN1cHBvcnQhJyxcbiAgICAgICAgY2FuY2VsQnV0dG9uTGFiZWw6ICdObywgVGhhbmtzJyxcbiAgICAgICAgbGF0ZXJCdXR0b25MYWJlbDogJ1JlbWluZCBNZSBMYXRlcicsXG4gICAgICAgIHJhdGVCdXR0b25MYWJlbDogJ1JhdGUgSXQgTm93J1xuICAgICAgfTtcblxuICAgICAgc3RyaW5ncyA9IGFuZ3VsYXIuZXh0ZW5kKHN0cmluZ3MsIGN1c3RvbU9iaik7XG5cbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuY3VzdG9tTG9jYWxlID0gc3RyaW5ncztcbiAgICB9O1xuXG4gICAgdGhpcy4kZ2V0ID0gWyckcScsIGZ1bmN0aW9uICgkcSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcHJvbXB0Rm9yUmF0aW5nOiBmdW5jdGlvbiAoaW1tZWRpYXRlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIHZhciBwcm9tcHQgPSBBcHBSYXRlLnByb21wdEZvclJhdGluZyhpbW1lZGlhdGUpO1xuICAgICAgICAgIHEucmVzb2x2ZShwcm9tcHQpO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBuYXZpZ2F0ZVRvQXBwU3RvcmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgdmFyIG5hdmlnYXRlID0gQXBwUmF0ZS5uYXZpZ2F0ZVRvQXBwU3RvcmUoKTtcbiAgICAgICAgICBxLnJlc29sdmUobmF2aWdhdGUpO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBvbkJ1dHRvbkNsaWNrZWQ6IGZ1bmN0aW9uIChjYikge1xuICAgICAgICAgIEFwcFJhdGUub25CdXR0b25DbGlja2VkID0gZnVuY3Rpb24gKGJ1dHRvbkluZGV4KSB7XG4gICAgICAgICAgICBjYi5jYWxsKHRoaXMsIGJ1dHRvbkluZGV4KTtcbiAgICAgICAgICB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIG9uUmF0ZURpYWxvZ1Nob3c6IGZ1bmN0aW9uIChjYikge1xuICAgICAgICAgIEFwcFJhdGUub25SYXRlRGlhbG9nU2hvdyA9IGNiKCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vd2hpdGVvY3RvYmVyL2NvcmRvdmEtcGx1Z2luLWFwcC12ZXJzaW9uLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS93aGl0ZW9jdG9iZXIvY29yZG92YS1wbHVnaW4tYXBwLXZlcnNpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmFwcFZlcnNpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFBcHBWZXJzaW9uJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldEFwcE5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLmdldEFwcFZlcnNpb24uZ2V0QXBwTmFtZShmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShuYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFBhY2thZ2VOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5nZXRBcHBWZXJzaW9uLmdldFBhY2thZ2VOYW1lKGZ1bmN0aW9uIChwYWNrYWdlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHBhY2thZ2UpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0VmVyc2lvbk51bWJlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEuZ2V0QXBwVmVyc2lvbi5nZXRWZXJzaW9uTnVtYmVyKGZ1bmN0aW9uICh2ZXJzaW9uKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHZlcnNpb24pO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0VmVyc2lvbkNvZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLmdldEFwcFZlcnNpb24uZ2V0VmVyc2lvbkNvZGUoZnVuY3Rpb24gKGNvZGUpIHtcbiAgICAgICAgICBxLnJlc29sdmUoY29kZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9jaHJpc3RvY3JhY3kvY29yZG92YS1wbHVnaW4tYmFja2dyb3VuZC1nZW9sb2NhdGlvbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vY2hyaXN0b2NyYWN5L2NvcmRvdmEtcGx1Z2luLWJhY2tncm91bmQtZ2VvbG9jYXRpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJhY2tncm91bmRHZW9sb2NhdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJhY2tncm91bmRHZW9sb2NhdGlvbicsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcblxuICAgICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAkd2luZG93Lm5hdmlnYXRvci5nZW9sb2NhdGlvbi5nZXRDdXJyZW50UG9zaXRpb24oZnVuY3Rpb24gKGxvY2F0aW9uKSB7XG4gICAgICAgICAgcmV0dXJuIGxvY2F0aW9uO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIGNvbmZpZ3VyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcblxuICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5iYWNrZ3JvdW5kR2VvTG9jYXRpb24uY29uZmlndXJlKFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAkd2luZG93LnBsdWdpbnMuYmFja2dyb3VuZEdlb0xvY2F0aW9uLmZpbmlzaCgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICB0aGlzLnN0YXJ0KCk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0YXJ0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuYmFja2dyb3VuZEdlb0xvY2F0aW9uLnN0YXJ0KFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmJhY2tncm91bmRHZW9Mb2NhdGlvbi5zdG9wKFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBdKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tYmFkZ2UuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWJhZGdlXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5iYWRnZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJhZGdlJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhhc1Blcm1pc3Npb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmhhc1Blcm1pc3Npb24oZnVuY3Rpb24gKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICBpZiAocGVybWlzc2lvbikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcm9tcHRGb3JQZXJtaXNzaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLnByb21wdEZvclBlcm1pc3Npb24oKTtcbiAgICAgIH0sXG5cbiAgICAgIHNldDogZnVuY3Rpb24gKGJhZGdlLCBjYWxsYmFjaywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuaGFzUGVybWlzc2lvbihmdW5jdGlvbiAocGVybWlzc2lvbikge1xuICAgICAgICAgIGlmIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoXG4gICAgICAgICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2Uuc2V0KGJhZGdlLCBjYWxsYmFjaywgc2NvcGUpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gc2V0IEJhZGdlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuaGFzUGVybWlzc2lvbihmdW5jdGlvbiAocGVybWlzc2lvbikge1xuICAgICAgICAgIGlmIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmdldChmdW5jdGlvbiAoYmFkZ2UpIHtcbiAgICAgICAgICAgICAgcS5yZXNvbHZlKGJhZGdlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gZ2V0IEJhZGdlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXI6IGZ1bmN0aW9uIChjYWxsYmFjaywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuaGFzUGVybWlzc2lvbihmdW5jdGlvbiAocGVybWlzc2lvbikge1xuICAgICAgICAgIGlmIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5jbGVhcihjYWxsYmFjaywgc2NvcGUpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGNsZWFyIEJhZGdlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGluY3JlYXNlOiBmdW5jdGlvbiAoY291bnQsIGNhbGxiYWNrLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgdGhpcy5oYXNQZXJtaXNzaW9uKCkudGhlbihmdW5jdGlvbiAoKXtcbiAgICAgICAgICBxLnJlc29sdmUoXG4gICAgICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmluY3JlYXNlKGNvdW50LCBjYWxsYmFjaywgc2NvcGUpXG4gICAgICAgICAgKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCl7XG4gICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGluY3JlYXNlIEJhZGdlJyk7XG4gICAgICAgIH0pIDtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGVjcmVhc2U6IGZ1bmN0aW9uIChjb3VudCwgY2FsbGJhY2ssIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICB0aGlzLmhhc1Blcm1pc3Npb24oKS50aGVuKGZ1bmN0aW9uICgpe1xuICAgICAgICAgIHEucmVzb2x2ZShcbiAgICAgICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuZGVjcmVhc2UoY291bnQsIGNhbGxiYWNrLCBzY29wZSlcbiAgICAgICAgICApO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKXtcbiAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gZGVjcmVhc2UgQmFkZ2UnKTtcbiAgICAgICAgfSkgO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjb25maWd1cmU6IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuY29uZmlndXJlKGNvbmZpZyk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAvcGhvbmVnYXAtcGx1Z2luLWJhcmNvZGVzY2FubmVyLmdpdFxuLy8gbGluayAgICAgOiAgICBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAvcGhvbmVnYXAtcGx1Z2luLWJhcmNvZGVzY2FubmVyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5iYXJjb2RlU2Nhbm5lcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJhcmNvZGVTY2FubmVyJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNjYW46IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5iYXJjb2RlU2Nhbm5lci5zY2FuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIGNvbmZpZyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGVuY29kZTogZnVuY3Rpb24gKHR5cGUsIGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB0eXBlID0gdHlwZSB8fCAnVEVYVF9UWVBFJztcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuYmFyY29kZVNjYW5uZXIuZW5jb2RlKHR5cGUsIGRhdGEsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyAgaW5zdGFsbCAgIDogICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tYmF0dGVyeS1zdGF0dXNcbi8vICBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tYmF0dGVyeS1zdGF0dXNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJhdHRlcnlTdGF0dXMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCYXR0ZXJ5U3RhdHVzJywgWyckcm9vdFNjb3BlJywgJyR3aW5kb3cnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHdpbmRvdywgJHRpbWVvdXQpIHtcblxuICAgIC8qKlxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RhdHVzXG4gICAgICAqL1xuICAgIHZhciBiYXR0ZXJ5U3RhdHVzID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmF0dGVyeVN0YXR1czpzdGF0dXMnLCBzdGF0dXMpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RhdHVzXG4gICAgICAqL1xuICAgIHZhciBiYXR0ZXJ5Q3JpdGljYWwgPSBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCYXR0ZXJ5U3RhdHVzOmNyaXRpY2FsJywgc3RhdHVzKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IHN0YXR1c1xuICAgICAgKi9cbiAgICB2YXIgYmF0dGVyeUxvdyA9IGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJhdHRlcnlTdGF0dXM6bG93Jywgc3RhdHVzKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChuYXZpZ2F0b3IuYmF0dGVyeSkge1xuICAgICAgICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JhdHRlcnlzdGF0dXMnLCBiYXR0ZXJ5U3RhdHVzLCBmYWxzZSk7XG4gICAgICAgICR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmF0dGVyeWNyaXRpY2FsJywgYmF0dGVyeUNyaXRpY2FsLCBmYWxzZSk7XG4gICAgICAgICR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmF0dGVyeWxvdycsIGJhdHRlcnlMb3csIGZhbHNlKTtcblxuICAgICAgfVxuICAgIH0sIGZhbHNlKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfV0pXG4gIC5ydW4oWyckaW5qZWN0b3InLCBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgJGluamVjdG9yLmdldCgnJGNvcmRvdmFCYXR0ZXJ5U3RhdHVzJyk7IC8vZW5zdXJlIHRoZSBmYWN0b3J5IGFuZCBzdWJzZXF1ZW50IGV2ZW50IGxpc3RlbmVycyBnZXQgaW5pdGlhbGlzZWRcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9wZXRlcm1ldHovY29yZG92YS1wbHVnaW4taWJlYWNvbi5naXRcbi8vIGxpbmsgICAgICA6ICBodHRwczovL2dpdGh1Yi5jb20vcGV0ZXJtZXR6L2NvcmRvdmEtcGx1Z2luLWliZWFjb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJlYWNvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJlYWNvbicsIFsnJHdpbmRvdycsICckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgJyRxJywgZnVuY3Rpb24gKCR3aW5kb3csICRyb290U2NvcGUsICR0aW1lb3V0LCAkcSkge1xuICAgIHZhciBjYWxsYmFja0RpZERldGVybWluZVN0YXRlRm9yUmVnaW9uID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tEaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24gPSBudWxsO1xuICAgIHZhciBjYWxsYmFja0RpZEV4aXRSZWdpb24gPSBudWxsO1xuICAgIHZhciBjYWxsYmFja0RpZEVudGVyUmVnaW9uID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tEaWRSYW5nZUJlYWNvbnNJblJlZ2lvbiA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tEaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzID0gbnVsbDtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKCR3aW5kb3cuY29yZG92YSAmJlxuICAgICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zICYmXG4gICAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyKSB7XG4gICAgICAgIHZhciBkZWxlZ2F0ZSA9IG5ldyAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuRGVsZWdhdGUoKTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbiA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZERldGVybWluZVN0YXRlRm9yUmVnaW9uJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZERldGVybWluZVN0YXRlRm9yUmVnaW9uKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZERldGVybWluZVN0YXRlRm9yUmVnaW9uKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbiA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbicsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZEV4aXRSZWdpb24gPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWRFeGl0UmVnaW9uJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZEV4aXRSZWdpb24pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkRXhpdFJlZ2lvbihwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWRFbnRlclJlZ2lvbiA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZEVudGVyUmVnaW9uJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZEVudGVyUmVnaW9uKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZEVudGVyUmVnaW9uKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZFJhbmdlQmVhY29uc0luUmVnaW9uID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkUmFuZ2VCZWFjb25zSW5SZWdpb24nLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkUmFuZ2VCZWFjb25zSW5SZWdpb24pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkUmFuZ2VCZWFjb25zSW5SZWdpb24ocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUucGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246cGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZykge1xuICAgICAgICAgICAgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUucGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZSA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOnBlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUnLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZSkge1xuICAgICAgICAgICAgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMgPSBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzJywgc3RhdHVzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cyhzdGF0dXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc2V0RGVsZWdhdGUoZGVsZWdhdGUpO1xuICAgICAgfVxuICAgIH0sIGZhbHNlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRDYWxsYmFja0RpZERldGVybWluZVN0YXRlRm9yUmVnaW9uOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbiA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrRGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24gPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja0RpZEV4aXRSZWdpb246IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZEV4aXRSZWdpb24gPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja0RpZEVudGVyUmVnaW9uOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWRFbnRlclJlZ2lvbiA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrRGlkUmFuZ2VCZWFjb25zSW5SZWdpb246IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZFJhbmdlQmVhY29uc0luUmVnaW9uID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmc6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZyA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZTogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZSA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrRGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1czogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cyA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIGNyZWF0ZUJlYWNvblJlZ2lvbjogZnVuY3Rpb24gKGlkZW50aWZpZXIsIHV1aWQsIG1ham9yLCBtaW5vciwgbm90aWZ5RW50cnlTdGF0ZU9uRGlzcGxheSkge1xuICAgICAgICBtYWpvciA9IG1ham9yIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgbWlub3IgPSBtaW5vciB8fCB1bmRlZmluZWQ7XG5cbiAgICAgICAgcmV0dXJuIG5ldyAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuQmVhY29uUmVnaW9uKFxuICAgICAgICAgIGlkZW50aWZpZXIsXG4gICAgICAgICAgdXVpZCxcbiAgICAgICAgICBtYWpvcixcbiAgICAgICAgICBtaW5vcixcbiAgICAgICAgICBub3RpZnlFbnRyeVN0YXRlT25EaXNwbGF5XG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICAgaXNCbHVldG9vdGhFbmFibGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5pc0JsdWV0b290aEVuYWJsZWQoKSk7XG4gICAgICB9LFxuICAgICAgZW5hYmxlQmx1ZXRvb3RoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5lbmFibGVCbHVldG9vdGgoKSk7XG4gICAgICB9LFxuICAgICAgZGlzYWJsZUJsdWV0b290aDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZGlzYWJsZUJsdWV0b290aCgpKTtcbiAgICAgIH0sXG4gICAgICBzdGFydE1vbml0b3JpbmdGb3JSZWdpb246IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbihyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICBzdG9wTW9uaXRvcmluZ0ZvclJlZ2lvbjogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RvcE1vbml0b3JpbmdGb3JSZWdpb24ocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgcmVxdWVzdFN0YXRlRm9yUmVnaW9uOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5yZXF1ZXN0U3RhdGVGb3JSZWdpb24ocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgc3RhcnRSYW5naW5nQmVhY29uc0luUmVnaW9uOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdGFydFJhbmdpbmdCZWFjb25zSW5SZWdpb24ocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgc3RvcFJhbmdpbmdCZWFjb25zSW5SZWdpb246IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0b3BSYW5naW5nQmVhY29uc0luUmVnaW9uKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIGdldEF1dGhvcml6YXRpb25TdGF0dXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmdldEF1dGhvcml6YXRpb25TdGF0dXMoKSk7XG4gICAgICB9LFxuICAgICAgcmVxdWVzdFdoZW5JblVzZUF1dGhvcml6YXRpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnJlcXVlc3RXaGVuSW5Vc2VBdXRob3JpemF0aW9uKCkpO1xuICAgICAgfSxcbiAgICAgIHJlcXVlc3RBbHdheXNBdXRob3JpemF0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5yZXF1ZXN0QWx3YXlzQXV0aG9yaXphdGlvbigpKTtcbiAgICAgIH0sXG4gICAgICBnZXRNb25pdG9yZWRSZWdpb25zOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5nZXRNb25pdG9yZWRSZWdpb25zKCkpO1xuICAgICAgfSxcbiAgICAgIGdldFJhbmdlZFJlZ2lvbnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmdldFJhbmdlZFJlZ2lvbnMoKSk7XG4gICAgICB9LFxuICAgICAgaXNSYW5naW5nQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5pc1JhbmdpbmdBdmFpbGFibGUoKSk7XG4gICAgICB9LFxuICAgICAgaXNNb25pdG9yaW5nQXZhaWxhYmxlRm9yQ2xhc3M6IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmlzTW9uaXRvcmluZ0F2YWlsYWJsZUZvckNsYXNzKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIHN0YXJ0QWR2ZXJ0aXNpbmc6IGZ1bmN0aW9uIChyZWdpb24sIG1lYXN1cmVkUG93ZXIpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0YXJ0QWR2ZXJ0aXNpbmcocmVnaW9uLCBtZWFzdXJlZFBvd2VyKSk7XG4gICAgICB9LFxuICAgICAgc3RvcEFkdmVydGlzaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdG9wQWR2ZXJ0aXNpbmcoKSk7XG4gICAgICB9LFxuICAgICAgaXNBZHZlcnRpc2luZ0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuaXNBZHZlcnRpc2luZ0F2YWlsYWJsZSgpKTtcbiAgICAgIH0sXG4gICAgICBpc0FkdmVydGlzaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5pc0FkdmVydGlzaW5nKCkpO1xuICAgICAgfSxcbiAgICAgIGRpc2FibGVEZWJ1Z0xvZ3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmRpc2FibGVEZWJ1Z0xvZ3MoKSk7XG4gICAgICB9LFxuICAgICAgZW5hYmxlRGVidWdOb3RpZmljYXRpb25zOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5lbmFibGVEZWJ1Z05vdGlmaWNhdGlvbnMoKSk7XG4gICAgICB9LFxuICAgICAgZGlzYWJsZURlYnVnTm90aWZpY2F0aW9uczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZGlzYWJsZURlYnVnTm90aWZpY2F0aW9ucygpKTtcbiAgICAgIH0sXG4gICAgICBlbmFibGVEZWJ1Z0xvZ3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmVuYWJsZURlYnVnTG9ncygpKTtcbiAgICAgIH0sXG4gICAgICBhcHBlbmRUb0RldmljZUxvZzogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmFwcGVuZFRvRGV2aWNlTG9nKG1lc3NhZ2UpKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vICBpbnN0YWxsICAgOiAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZG9uL2NvcmRvdmEtcGx1Z2luLWJsZS1jZW50cmFsLmdpdFxuLy8gIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL2Rvbi9jb3Jkb3ZhLXBsdWdpbi1ibGUtY2VudHJhbFxuXG4vKiBnbG9iYWxzIGJsZTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJsZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJMRScsIFsnJHEnLCAnJHRpbWVvdXQnLCAnJGxvZycsIGZ1bmN0aW9uICgkcSwgJHRpbWVvdXQsICRsb2cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzY2FuOiBmdW5jdGlvbiAoc2VydmljZXMsIHNlY29uZHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGJsZS5zdGFydFNjYW4oc2VydmljZXMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGJsZS5zdG9wU2NhbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBzZWNvbmRzKjEwMDApO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdGFydFNjYW46IGZ1bmN0aW9uIChzZXJ2aWNlcywgY2FsbGJhY2ssIGVycm9yQ2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGJsZS5zdGFydFNjYW4oc2VydmljZXMsIGNhbGxiYWNrLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgIH0sXG5cbiAgICAgIHN0b3BTY2FuOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLnN0b3BTY2FuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNvbm5lY3Q6IGZ1bmN0aW9uIChkZXZpY2VJRCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5jb25uZWN0KGRldmljZUlELCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkaXNjb25uZWN0OiBmdW5jdGlvbiAoZGV2aWNlSUQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuZGlzY29ubmVjdChkZXZpY2VJRCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZDogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlEKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLnJlYWQoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdyaXRlOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUud3JpdGUoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdyaXRlV2l0aG91dFJlc3BvbnNlOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUud3JpdGVXaXRob3V0UmVzcG9uc2UoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdyaXRlQ29tbWFuZDogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhKSB7XG4gICAgICAgICRsb2cud2FybmluZygnd3JpdGVDb21tYW5kIGlzIGRlcHJlY2F0ZWQsIHVzZSB3cml0ZVdpdGhvdXRSZXNwb25zZScpO1xuICAgICAgICByZXR1cm4gdGhpcy53cml0ZVdpdGhvdXRSZXNwb25zZShkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSk7XG4gICAgICB9LFxuXG4gICAgICBzdGFydE5vdGlmaWNhdGlvbjogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBjYWxsYmFjaywgZXJyb3JDYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gYmxlLnN0YXJ0Tm90aWZpY2F0aW9uKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBjYWxsYmFjaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICB9LFxuXG4gICAgICBzdG9wTm90aWZpY2F0aW9uOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuc3RvcE5vdGlmaWNhdGlvbihkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNDb25uZWN0ZWQ6IGZ1bmN0aW9uIChkZXZpY2VJRCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5pc0Nvbm5lY3RlZChkZXZpY2VJRCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZW5hYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLmVuYWJsZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc0VuYWJsZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuaXNFbmFibGVkKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Rvbi9CbHVldG9vdGhTZXJpYWwuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Rvbi9CbHVldG9vdGhTZXJpYWxcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJsdWV0b290aFNlcmlhbCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJsdWV0b290aFNlcmlhbCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbm5lY3Q6IGZ1bmN0aW9uIChhZGRyZXNzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGRpc2Nvbm5lY3Rpb25Qcm9taXNlID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGlzQ29ubmVjdGVkID0gZmFsc2U7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmNvbm5lY3QoYWRkcmVzcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgICBxLnJlc29sdmUoZGlzY29ubmVjdGlvblByb21pc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBpZihpc0Nvbm5lY3RlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGRpc2Nvbm5lY3Rpb25Qcm9taXNlLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvLyBub3Qgc3VwcG9ydGVkIG9uIGlPU1xuICAgICAgY29ubmVjdEluc2VjdXJlOiBmdW5jdGlvbiAoYWRkcmVzcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmNvbm5lY3RJbnNlY3VyZShhZGRyZXNzLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkaXNjb25uZWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuZGlzY29ubmVjdChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBsaXN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwubGlzdChmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRpc2NvdmVyVW5wYWlyZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5kaXNjb3ZlclVucGFpcmVkKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0RGV2aWNlRGlzY292ZXJlZExpc3RlbmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuc2V0RGV2aWNlRGlzY292ZXJlZExpc3RlbmVyKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5ub3RpZnkoZGF0YSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJEZXZpY2VEaXNjb3ZlcmVkTGlzdGVuZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuY2xlYXJEZXZpY2VEaXNjb3ZlcmVkTGlzdGVuZXIoKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCbHVldG9vdGhTZXR0aW5nczogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnNob3dCbHVldG9vdGhTZXR0aW5ncyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc0VuYWJsZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5pc0VuYWJsZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBlbmFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5lbmFibGUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc0Nvbm5lY3RlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmlzQ29ubmVjdGVkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuYXZhaWxhYmxlKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnJlYWQoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkVW50aWw6IGZ1bmN0aW9uIChkZWxpbWl0ZXIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5yZWFkVW50aWwoZGVsaW1pdGVyLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdyaXRlOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLndyaXRlKGRhdGEsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN1YnNjcmliZTogZnVuY3Rpb24gKGRlbGltaXRlcikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnN1YnNjcmliZShkZWxpbWl0ZXIsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5ub3RpZnkoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdWJzY3JpYmVSYXdEYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuc3Vic2NyaWJlUmF3RGF0YShmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEubm90aWZ5KGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5zdWJzY3JpYmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC51bnN1YnNjcmliZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bnN1YnNjcmliZVJhd0RhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC51bnN1YnNjcmliZVJhd0RhdGEoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5jbGVhcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkUlNTSTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnJlYWRSU1NJKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zpc2NhbC1jbGlmZi9waG9uZWdhcC1wbHVnaW4tYnJpZ2h0bmVzcy5naXRcbi8vIGxpbmsgICAgIDogICAgaHR0cHM6Ly9naXRodWIuY29tL2Zpc2NhbC1jbGlmZi9waG9uZWdhcC1wbHVnaW4tYnJpZ2h0bmVzc1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYnJpZ2h0bmVzcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJyaWdodG5lc3MnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5jb3Jkb3ZhKSB7XG4gICAgICAgICAgcS5yZWplY3QoJ05vdCBzdXBwb3J0ZWQgd2l0aG91dCBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMuYnJpZ2h0bmVzcy5nZXRCcmlnaHRuZXNzKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0OiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93LmNvcmRvdmEpIHtcbiAgICAgICAgICBxLnJlamVjdCgnTm90IHN1cHBvcnRlZCB3aXRob3V0IGNvcmRvdmEuanMnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5icmlnaHRuZXNzLnNldEJyaWdodG5lc3MoZGF0YSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXRLZWVwU2NyZWVuT246IGZ1bmN0aW9uIChib29sKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cuY29yZG92YSkge1xuICAgICAgICAgIHEucmVqZWN0KCdOb3Qgc3VwcG9ydGVkIHdpdGhvdXQgY29yZG92YS5qcycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmJyaWdodG5lc3Muc2V0S2VlcFNjcmVlbk9uKGJvb2wsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0NhbGVuZGFyLVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9DYWxlbmRhci1QaG9uZUdhcC1QbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNhbGVuZGFyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQ2FsZW5kYXInLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgY3JlYXRlQ2FsZW5kYXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBjcmVhdGVDYWxPcHRpb25zID0gJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmdldENyZWF0ZUNhbGVuZGFyT3B0aW9ucygpO1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBjcmVhdGVDYWxPcHRpb25zLmNhbGVuZGFyTmFtZSA9IG9wdGlvbnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY3JlYXRlQ2FsT3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGNyZWF0ZUNhbE9wdGlvbnMsIG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmNyZWF0ZUNhbGVuZGFyKGNyZWF0ZUNhbE9wdGlvbnMsIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkZWxldGVDYWxlbmRhcjogZnVuY3Rpb24gKGNhbGVuZGFyTmFtZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmRlbGV0ZUNhbGVuZGFyKGNhbGVuZGFyTmFtZSwgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUV2ZW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuY3JlYXRlRXZlbnQoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlRXZlbnRXaXRoT3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25LZXlzID0gW10sXG4gICAgICAgICAgY2FsT3B0aW9ucyA9IHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmdldENhbGVuZGFyT3B0aW9ucygpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbktleXMgPSBPYmplY3Qua2V5cyhkZWZhdWx0T3B0aW9ucyk7XG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMpIHtcbiAgICAgICAgICBpZiAoZGVmYXVsdE9wdGlvbktleXMuaW5kZXhPZihrZXkpID09PSAtMSkge1xuICAgICAgICAgICAgY2FsT3B0aW9uc1trZXldID0gb3B0aW9uc1trZXldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZWZhdWx0T3B0aW9uc1trZXldID0gb3B0aW9uc1trZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5jcmVhdGVFdmVudFdpdGhPcHRpb25zKFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgY2FsT3B0aW9ucyxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlRXZlbnRJbnRlcmFjdGl2ZWx5OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuY3JlYXRlRXZlbnRJbnRlcmFjdGl2ZWx5KFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUV2ZW50SW5OYW1lZENhbGVuZGFyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsLFxuICAgICAgICAgICAgY2FsZW5kYXJOYW1lOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuY3JlYXRlRXZlbnRJbk5hbWVkQ2FsZW5kYXIoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5jYWxlbmRhck5hbWUsXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGZpbmRFdmVudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmZpbmRFdmVudChcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGZ1bmN0aW9uIChmb3VuZEV2ZW50KSB7XG4gICAgICAgICAgICBkLnJlc29sdmUoZm91bmRFdmVudCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBsaXN0RXZlbnRzSW5SYW5nZTogZnVuY3Rpb24gKHN0YXJ0RGF0ZSwgZW5kRGF0ZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmxpc3RFdmVudHNJblJhbmdlKHN0YXJ0RGF0ZSwgZW5kRGF0ZSwgZnVuY3Rpb24gKGV2ZW50cykge1xuICAgICAgICAgIGQucmVzb2x2ZShldmVudHMpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBsaXN0Q2FsZW5kYXJzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIubGlzdENhbGVuZGFycyhmdW5jdGlvbiAoY2FsZW5kYXJzKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKGNhbGVuZGFycyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGZpbmRBbGxFdmVudHNJbk5hbWVkQ2FsZW5kYXI6IGZ1bmN0aW9uIChjYWxlbmRhck5hbWUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5maW5kQWxsRXZlbnRzSW5OYW1lZENhbGVuZGFyKGNhbGVuZGFyTmFtZSwgZnVuY3Rpb24gKGV2ZW50cykge1xuICAgICAgICAgIGQucmVzb2x2ZShldmVudHMpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBtb2RpZnlFdmVudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbCxcbiAgICAgICAgICAgIG5ld1RpdGxlOiBudWxsLFxuICAgICAgICAgICAgbmV3TG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBuZXdOb3RlczogbnVsbCxcbiAgICAgICAgICAgIG5ld1N0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIG5ld0VuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5tb2RpZnlFdmVudChcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5ld1RpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5ld0xvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5ld05vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLm5ld1N0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMubmV3RW5kRGF0ZSksXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRlbGV0ZUV2ZW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBuZXdUaXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZGVsZXRlRXZlbnQoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubmV3VGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tY2FtZXJhXG4vLyBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tY2FtZXJhXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jYW1lcmEnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFDYW1lcmEnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0UGljdHVyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghbmF2aWdhdG9yLmNhbWVyYSkge1xuICAgICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmNhbWVyYS5nZXRQaWN0dXJlKGZ1bmN0aW9uIChpbWFnZURhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoaW1hZ2VEYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhbnVwOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuY2FtZXJhLmNsZWFudXAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1tZWRpYS1jYXB0dXJlXG4vLyBsaW5rICAgICAgOiAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLW1lZGlhLWNhcHR1cmVcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNhcHR1cmUnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFDYXB0dXJlJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhcHR1cmVBdWRpbzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUuY2FwdHVyZUF1ZGlvKGZ1bmN0aW9uIChhdWRpb0RhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoYXVkaW9EYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgY2FwdHVyZUltYWdlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUpIHtcbiAgICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZS5jYXB0dXJlSW1hZ2UoZnVuY3Rpb24gKGltYWdlRGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShpbWFnZURhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBjYXB0dXJlVmlkZW86IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoIW5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlLmNhcHR1cmVWaWRlbyhmdW5jdGlvbiAodmlkZW9EYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHZpZGVvRGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCA6IGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vdmtlZXBlL2NhcmQuaW8uZ2l0XG4vLyBsaW5rICAgIDogaHR0cHM6Ly9naXRodWIuY29tL3ZrZWVwZS9jYXJkLmlvLmdpdFxuXG4vKiBnbG9iYWxzIENhcmRJTzogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNhcmRJTycsIFtdKVxuXG4gIC5wcm92aWRlcihcbiAgJyRjb3Jkb3ZhTmdDYXJkSU8nLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgLyoqXG4gICAgICogRGVmYXVsdCBhcnJheSBvZiByZXNwb25zZSBkYXRhIGZyb20gY2FyZElPIHNjYW4gY2FyZFxuICAgICAqL1xuICAgIHZhciBkZWZhdWx0UmVzcEZpZWxkcyA9IFtcbiAgICAgICdjYXJkX3R5cGUnLFxuICAgICAgJ3JlZGFjdGVkX2NhcmRfbnVtYmVyJyxcbiAgICAgICdjYXJkX251bWJlcicsXG4gICAgICAnZXhwaXJ5X21vbnRoJyxcbiAgICAgICdleHBpcnlfeWVhcicsXG4gICAgICAnc2hvcnRfZXhwaXJ5X3llYXInLFxuICAgICAgJ2N2dicsXG4gICAgICAnemlwJ1xuICAgIF07XG5cbiAgICAvKipcbiAgICAgKiBEZWZhdWx0IGNvbmZpZyBmb3IgY2FyZElPIHNjYW4gZnVuY3Rpb25cbiAgICAgKi9cbiAgICB2YXIgZGVmYXVsdFNjYW5Db25maWcgPSB7XG4gICAgICAnZXhwaXJ5JzogdHJ1ZSxcbiAgICAgICdjdnYnOiB0cnVlLFxuICAgICAgJ3ppcCc6IGZhbHNlLFxuICAgICAgJ3N1cHByZXNzTWFudWFsJzogZmFsc2UsXG4gICAgICAnc3VwcHJlc3NDb25maXJtJzogZmFsc2UsXG4gICAgICAnaGlkZUxvZ28nOiB0cnVlXG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIENvbmZpZ3VyaW5nIGRlZmF1bHRSZXNwRmllbGRzIHVzaW5nICRjb3Jkb3ZhTmdDYXJkSU9Qcm92aWRlclxuICAgICAqXG4gICAgICovXG4gICAgdGhpcy5zZXRDYXJkSU9SZXNwb25zZUZpZWxkcyA9IGZ1bmN0aW9uIChmaWVsZHMpIHtcbiAgICAgIGlmICghZmllbGRzIHx8ICFhbmd1bGFyLmlzQXJyYXkoZmllbGRzKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBkZWZhdWx0UmVzcEZpZWxkcyA9IGZpZWxkcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBDb25maWd1cmluZyBkZWZhdWx0U2NhbkNvbmZpZyB1c2luZyAkY29yZG92YU5nQ2FyZElPUHJvdmlkZXJcbiAgICAgKi9cbiAgICB0aGlzLnNldFNjYW5lckNvbmZpZyA9IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgIGlmICghY29uZmlnIHx8ICFhbmd1bGFyLmlzT2JqZWN0KGNvbmZpZykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy5leHBpcnkgPSBjb25maWcuZXhwaXJ5IHx8IHRydWU7XG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy5jdnYgPSBjb25maWcuY3Z2IHx8IHRydWU7XG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy56aXAgPSBjb25maWcuemlwIHx8IGZhbHNlO1xuICAgICAgZGVmYXVsdFNjYW5Db25maWcuc3VwcHJlc3NNYW51YWwgPSBjb25maWcuc3VwcHJlc3NNYW51YWwgfHwgZmFsc2U7XG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy5zdXBwcmVzc0NvbmZpcm0gPSBjb25maWcuc3VwcHJlc3NDb25maXJtIHx8IGZhbHNlO1xuICAgICAgZGVmYXVsdFNjYW5Db25maWcuaGlkZUxvZ28gPSBjb25maWcuaGlkZUxvZ28gfHwgdHJ1ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRnVuY3Rpb24gc2NhbkNhcmQgZm9yICRjb3Jkb3ZhTmdDYXJkSU8gc2VydmljZSB0byBtYWtlIHNjYW4gb2YgY2FyZFxuICAgICAqXG4gICAgICovXG4gICAgdGhpcy4kZ2V0ID0gWyckcScsIGZ1bmN0aW9uICgkcSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc2NhbkNhcmQ6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgIHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgQ2FyZElPLnNjYW4oXG4gICAgICAgICAgICBkZWZhdWx0U2NhbkNvbmZpZyxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChudWxsKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIHZhciByZXNwRGF0YSA9IHt9O1xuICAgICAgICAgICAgICAgIGZvciAoXG4gICAgICAgICAgICAgICAgICB2YXIgaSA9IDAsIGxlbiA9IGRlZmF1bHRSZXNwRmllbGRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgZmllbGQgPSBkZWZhdWx0UmVzcEZpZWxkc1tpXTtcblxuICAgICAgICAgICAgICAgICAgaWYgKGZpZWxkID09PSAnc2hvcnRfZXhwaXJ5X3llYXInKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3BEYXRhW2ZpZWxkXSA9IFN0cmluZyhyZXNwb25zZS5leHBpcnlfeWVhcikuc3Vic3RyKCAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiAgICAgICAgICAgICAgICAgICAgICAyLCAyXG4gICAgICAgICAgICAgICAgICAgICkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNwRGF0YVtmaWVsZF0gPSByZXNwb25zZVtmaWVsZF0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzcERhdGEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV1cbik7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1ZlcnNvU29sdXRpb25zL0NvcmRvdmFDbGlwYm9hcmQuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL1ZlcnNvU29sdXRpb25zL0NvcmRvdmFDbGlwYm9hcmRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNsaXBib2FyZCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUNsaXBib2FyZCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvcHk6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5jbGlwYm9hcmQuY29weSh0ZXh0LFxuICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHBhc3RlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5jbGlwYm9hcmQucGFzdGUoZnVuY3Rpb24gKHRleHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUodGV4dCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1jb250YWN0c1xuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tY29udGFjdHNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNvbnRhY3RzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQ29udGFjdHMnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2F2ZTogZnVuY3Rpb24gKGNvbnRhY3QpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZGV2aWNlQ29udGFjdCA9IG5hdmlnYXRvci5jb250YWN0cy5jcmVhdGUoY29udGFjdCk7XG5cbiAgICAgICAgZGV2aWNlQ29udGFjdC5zYXZlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlOiBmdW5jdGlvbiAoY29udGFjdCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBkZXZpY2VDb250YWN0ID0gbmF2aWdhdG9yLmNvbnRhY3RzLmNyZWF0ZShjb250YWN0KTtcblxuICAgICAgICBkZXZpY2VDb250YWN0LnJlbW92ZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsb25lOiBmdW5jdGlvbiAoY29udGFjdCkge1xuICAgICAgICB2YXIgZGV2aWNlQ29udGFjdCA9IG5hdmlnYXRvci5jb250YWN0cy5jcmVhdGUoY29udGFjdCk7XG4gICAgICAgIHJldHVybiBkZXZpY2VDb250YWN0LmNsb25lKGNvbnRhY3QpO1xuICAgICAgfSxcblxuICAgICAgZmluZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZmllbGRzID0gb3B0aW9ucy5maWVsZHMgfHwgWydpZCcsICdkaXNwbGF5TmFtZSddO1xuICAgICAgICBkZWxldGUgb3B0aW9ucy5maWVsZHM7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhvcHRpb25zKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuY29udGFjdHMuZmluZChmaWVsZHMsIGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0cyk7XG4gICAgICAgICAgfSxmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIG5hdmlnYXRvci5jb250YWN0cy5maW5kKGZpZWxkcywgZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHRzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sIG9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwaWNrQ29udGFjdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmNvbnRhY3RzLnBpY2tDb250YWN0KGZ1bmN0aW9uIChjb250YWN0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGNvbnRhY3QpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETzogbWV0aG9kIHRvIHNldCAvIGdldCBDb250YWN0QWRkcmVzc1xuICAgICAgLy8gVE9ETzogbWV0aG9kIHRvIHNldCAvIGdldCBDb250YWN0RXJyb3JcbiAgICAgIC8vIFRPRE86IG1ldGhvZCB0byBzZXQgLyBnZXQgQ29udGFjdEZpZWxkXG4gICAgICAvLyBUT0RPOiBtZXRob2QgdG8gc2V0IC8gZ2V0IENvbnRhY3ROYW1lXG4gICAgICAvLyBUT0RPOiBtZXRob2QgdG8gc2V0IC8gZ2V0IENvbnRhY3RPcmdhbml6YXRpb25cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9WaXRhbGlpQmxhZ29kaXIvY29yZG92YS1wbHVnaW4tZGF0ZXBpY2tlci5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL1ZpdGFsaWlCbGFnb2Rpci9jb3Jkb3ZhLXBsdWdpbi1kYXRlcGlja2VyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5kYXRlUGlja2VyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRGF0ZVBpY2tlcicsIFsnJHdpbmRvdycsICckcScsIGZ1bmN0aW9uICgkd2luZG93LCAkcSkge1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzaG93OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHtkYXRlOiBuZXcgRGF0ZSgpLCBtb2RlOiAnZGF0ZSd9O1xuICAgICAgICAkd2luZG93LmRhdGVQaWNrZXIuc2hvdyhvcHRpb25zLCBmdW5jdGlvbiAoZGF0ZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24oZXJyb3Ipe1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1kZXZpY2Vcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZVxuXG4vKiBnbG9iYWxzIGRldmljZTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YURldmljZScsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSB3aG9sZSBkZXZpY2Ugb2JqZWN0LlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZVxuICAgICAgICogQHJldHVybnMge09iamVjdH0gVGhlIGRldmljZSBvYmplY3QuXG4gICAgICAgKi9cbiAgICAgIGdldERldmljZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBDb3Jkb3ZhIHZlcnNpb24uXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlI2RldmljZWNvcmRvdmFcbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBDb3Jkb3ZhIHZlcnNpb24uXG4gICAgICAgKi9cbiAgICAgIGdldENvcmRvdmE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5jb3Jkb3ZhO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBuYW1lIG9mIHRoZSBkZXZpY2UncyBtb2RlbCBvciBwcm9kdWN0LlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZSNkZXZpY2Vtb2RlbFxuICAgICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIG5hbWUgb2YgdGhlIGRldmljZSdzIG1vZGVsIG9yIHByb2R1Y3QuXG4gICAgICAgKi9cbiAgICAgIGdldE1vZGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UubW9kZWw7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIEBkZXByZWNhdGVkIGRldmljZS5uYW1lIGlzIGRlcHJlY2F0ZWQgYXMgb2YgdmVyc2lvbiAyLjMuMC4gVXNlIGRldmljZS5tb2RlbCBpbnN0ZWFkLlxuICAgICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgICAqL1xuICAgICAgZ2V0TmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLm5hbWU7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIGRldmljZSdzIG9wZXJhdGluZyBzeXN0ZW0gbmFtZS5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UjZGV2aWNlcGxhdGZvcm1cbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBkZXZpY2UncyBvcGVyYXRpbmcgc3lzdGVtIG5hbWUuXG4gICAgICAgKi9cbiAgICAgIGdldFBsYXRmb3JtOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UucGxhdGZvcm07XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIGRldmljZSdzIFVuaXZlcnNhbGx5IFVuaXF1ZSBJZGVudGlmaWVyLlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZSNkZXZpY2V1dWlkXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgZGV2aWNlJ3MgVW5pdmVyc2FsbHkgVW5pcXVlIElkZW50aWZpZXJcbiAgICAgICAqL1xuICAgICAgZ2V0VVVJRDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLnV1aWQ7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIG9wZXJhdGluZyBzeXN0ZW0gdmVyc2lvbi5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UjZGV2aWNldmVyc2lvblxuICAgICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgICAqL1xuICAgICAgZ2V0VmVyc2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLnZlcnNpb247XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIGRldmljZSBtYW51ZmFjdHVyZXIuXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAgICovXG4gICAgICBnZXRNYW51ZmFjdHVyZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5tYW51ZmFjdHVyZXI7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWRldmljZS1tb3Rpb25cbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZS1tb3Rpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZU1vdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YURldmljZU1vdGlvbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRDdXJyZW50QWNjZWxlcmF0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoYW5ndWxhci5pc1VuZGVmaW5lZChuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlcikgfHxcbiAgICAgICAgIWFuZ3VsYXIuaXNGdW5jdGlvbihuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci5nZXRDdXJyZW50QWNjZWxlcmF0aW9uKSkge1xuICAgICAgICAgIHEucmVqZWN0KCdEZXZpY2UgZG8gbm90IHN1cHBvcnQgd2F0Y2hBY2NlbGVyYXRpb24nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLmdldEN1cnJlbnRBY2NlbGVyYXRpb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdhdGNoQWNjZWxlcmF0aW9uOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKGFuZ3VsYXIuaXNVbmRlZmluZWQobmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIpIHx8XG4gICAgICAgICFhbmd1bGFyLmlzRnVuY3Rpb24obmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIud2F0Y2hBY2NlbGVyYXRpb24pKSB7XG4gICAgICAgICAgcS5yZWplY3QoJ0RldmljZSBkbyBub3Qgc3VwcG9ydCB3YXRjaEFjY2VsZXJhdGlvbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHdhdGNoSUQgPSBuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci53YXRjaEFjY2VsZXJhdGlvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHEucHJvbWlzZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIuY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2UuY2xlYXJXYXRjaCA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgIG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLmNsZWFyV2F0Y2goaWQgfHwgd2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLndhdGNoSUQgPSB3YXRjaElEO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcldhdGNoOiBmdW5jdGlvbiAod2F0Y2hJRCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIuY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZGV2aWNlLW9yaWVudGF0aW9uXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2Utb3JpZW50YXRpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZU9yaWVudGF0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRGV2aWNlT3JpZW50YXRpb24nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICB2YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICBmcmVxdWVuY3k6IDMwMDAgLy8gZXZlcnkgM3NcbiAgICB9O1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBnZXRDdXJyZW50SGVhZGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYoIW5hdmlnYXRvci5jb21wYXNzKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnTm8gY29tcGFzcyBvbiBEZXZpY2UnKTtcbiAgICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuY29tcGFzcy5nZXRDdXJyZW50SGVhZGluZyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd2F0Y2hIZWFkaW5nOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYoIW5hdmlnYXRvci5jb21wYXNzKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnTm8gY29tcGFzcyBvbiBEZXZpY2UnKTtcbiAgICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX29wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG4gICAgICAgIHZhciB3YXRjaElEID0gbmF2aWdhdG9yLmNvbXBhc3Mud2F0Y2hIZWFkaW5nKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgX29wdGlvbnMpO1xuXG4gICAgICAgIHEucHJvbWlzZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmNvbXBhc3MuY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2UuY2xlYXJXYXRjaCA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgIG5hdmlnYXRvci5jb21wYXNzLmNsZWFyV2F0Y2goaWQgfHwgd2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLndhdGNoSUQgPSB3YXRjaElEO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcldhdGNoOiBmdW5jdGlvbiAod2F0Y2hJRCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLmNvbXBhc3MuY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZGlhbG9nc1xuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGlhbG9nc1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZGlhbG9ncycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YURpYWxvZ3MnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBhbGVydDogZnVuY3Rpb24gKG1lc3NhZ2UsIHRpdGxlLCBidXR0b25OYW1lKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cubmF2aWdhdG9yLm5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICR3aW5kb3cuYWxlcnQobWVzc2FnZSk7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi5hbGVydChtZXNzYWdlLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9LCB0aXRsZSwgYnV0dG9uTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY29uZmlybTogZnVuY3Rpb24gKG1lc3NhZ2UsIHRpdGxlLCBidXR0b25MYWJlbHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5uYXZpZ2F0b3Iubm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgaWYgKCR3aW5kb3cuY29uZmlybShtZXNzYWdlKSkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKDEpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoMik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5hdmlnYXRvci5ub3RpZmljYXRpb24uY29uZmlybShtZXNzYWdlLCBmdW5jdGlvbiAoYnV0dG9uSW5kZXgpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShidXR0b25JbmRleCk7XG4gICAgICAgICAgfSwgdGl0bGUsIGJ1dHRvbkxhYmVscyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJvbXB0OiBmdW5jdGlvbiAobWVzc2FnZSwgdGl0bGUsIGJ1dHRvbkxhYmVscywgZGVmYXVsdFRleHQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5uYXZpZ2F0b3Iubm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgdmFyIHJlcyA9ICR3aW5kb3cucHJvbXB0KG1lc3NhZ2UsIGRlZmF1bHRUZXh0KTtcbiAgICAgICAgICBpZiAocmVzICE9PSBudWxsKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoe2lucHV0MTogcmVzLCBidXR0b25JbmRleDogMX0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoe2lucHV0MTogcmVzLCBidXR0b25JbmRleDogMn0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLnByb21wdChtZXNzYWdlLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LCB0aXRsZSwgYnV0dG9uTGFiZWxzLCBkZWZhdWx0VGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGJlZXA6IGZ1bmN0aW9uICh0aW1lcykge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi5iZWVwKHRpbWVzKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWVtYWlsLWNvbXBvc2VyLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1lbWFpbC1jb21wb3NlclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZW1haWxDb21wb3NlcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUVtYWlsQ29tcG9zZXInLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaXNBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5lbWFpbC5pc0F2YWlsYWJsZShmdW5jdGlvbiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICBpZiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIG9wZW46IGZ1bmN0aW9uIChwcm9wZXJ0aWVzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZW1haWwub3Blbihwcm9wZXJ0aWVzLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoKTsgLy8gdXNlciBjbG9zZWQgZW1haWwgY29tcG9zZXJcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFkZEFsaWFzOiBmdW5jdGlvbiAoYXBwLCBzY2hlbWEpIHtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmVtYWlsLmFkZEFsaWFzKGFwcCwgc2NoZW1hKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgY29yZG92YSAtZCBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9XaXpjb3JwL3Bob25lZ2FwLWZhY2Vib29rLXBsdWdpbi5naXQgLS12YXJpYWJsZSBBUFBfSUQ9XCIxMjM0NTY3ODlcIiAtLXZhcmlhYmxlIEFQUF9OQU1FPVwibXlBcHBsaWNhdGlvblwiXG4vLyBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9XaXpjb3JwL3Bob25lZ2FwLWZhY2Vib29rLXBsdWdpblxuXG4vKiBnbG9iYWxzIGZhY2Vib29rQ29ubmVjdFBsdWdpbjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZhY2Vib29rJywgW10pXG5cbiAgLnByb3ZpZGVyKCckY29yZG92YUZhY2Vib29rJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIC8qKlxuICAgICAgKiBJbml0IGJyb3dzZXIgc2V0dGluZ3MgZm9yIEZhY2Vib29rIHBsdWdpblxuICAgICAgKlxuICAgICAgKiBAcGFyYW0ge251bWJlcn0gaWRcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb25cbiAgICAgICovXG4gICAgdGhpcy5icm93c2VySW5pdCA9IGZ1bmN0aW9uIChpZCwgdmVyc2lvbikge1xuICAgICAgdGhpcy5hcHBJRCA9IGlkO1xuICAgICAgdGhpcy5hcHBWZXJzaW9uID0gdmVyc2lvbiB8fCAndjIuMCc7XG4gICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4uYnJvd3NlckluaXQodGhpcy5hcHBJRCwgdGhpcy5hcHBWZXJzaW9uKTtcbiAgICB9O1xuXG4gICAgdGhpcy4kZ2V0ID0gWyckcScsIGZ1bmN0aW9uICgkcSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbG9naW46IGZ1bmN0aW9uIChwZXJtaXNzaW9ucykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4ubG9naW4ocGVybWlzc2lvbnMsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KHJlcyk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNob3dEaWFsb2c6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5zaG93RGlhbG9nKG9wdGlvbnMsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBhcGk6IGZ1bmN0aW9uIChwYXRoLCBwZXJtaXNzaW9ucykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4uYXBpKHBhdGgsIHBlcm1pc3Npb25zLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0QWNjZXNzVG9rZW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmdldEFjY2Vzc1Rva2VuKGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXRMb2dpblN0YXR1czogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4uZ2V0TG9naW5TdGF0dXMoZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGxvZ291dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4ubG9nb3V0KGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWZhY2Vib29rYWRzLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWZhY2Vib29rYWRzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5mYWNlYm9va0FkcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUZhY2Vib29rQWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1maWxlXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1maWxlXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5maWxlJywgW10pXG5cbiAgLmNvbnN0YW50KCckY29yZG92YUZpbGVFcnJvcicsIHtcbiAgICAxOiAnTk9UX0ZPVU5EX0VSUicsXG4gICAgMjogJ1NFQ1VSSVRZX0VSUicsXG4gICAgMzogJ0FCT1JUX0VSUicsXG4gICAgNDogJ05PVF9SRUFEQUJMRV9FUlInLFxuICAgIDU6ICdFTkNPRElOR19FUlInLFxuICAgIDY6ICdOT19NT0RJRklDQVRJT05fQUxMT1dFRF9FUlInLFxuICAgIDc6ICdJTlZBTElEX1NUQVRFX0VSUicsXG4gICAgODogJ1NZTlRBWF9FUlInLFxuICAgIDk6ICdJTlZBTElEX01PRElGSUNBVElPTl9FUlInLFxuICAgIDEwOiAnUVVPVEFfRVhDRUVERURfRVJSJyxcbiAgICAxMTogJ1RZUEVfTUlTTUFUQ0hfRVJSJyxcbiAgICAxMjogJ1BBVEhfRVhJU1RTX0VSUidcbiAgfSlcblxuICAucHJvdmlkZXIoJyRjb3Jkb3ZhRmlsZScsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICB0aGlzLiRnZXQgPSBbJyRxJywgJyR3aW5kb3cnLCAnJGNvcmRvdmFGaWxlRXJyb3InLCBmdW5jdGlvbiAoJHEsICR3aW5kb3csICRjb3Jkb3ZhRmlsZUVycm9yKSB7XG5cbiAgICAgIHJldHVybiB7XG5cbiAgICAgICAgZ2V0RnJlZURpc2tTcGFjZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBjb3Jkb3ZhLmV4ZWMoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSwgJ0ZpbGUnLCAnZ2V0RnJlZURpc2tTcGFjZScsIFtdKTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNoZWNrRGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChkaXIpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2RpcmVjdG9yeSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGRpcmVjdG9yeSA9IHBhdGggKyBkaXI7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwoZGlyZWN0b3J5LCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBpZiAoZmlsZVN5c3RlbS5pc0RpcmVjdG9yeSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHEucmVzb2x2ZShmaWxlU3lzdGVtKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogMTMsIG1lc3NhZ2U6ICdpbnB1dCBpcyBub3QgYSBkaXJlY3RvcnknfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2hlY2tGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZGlyZWN0b3J5IGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgZGlyZWN0b3J5ID0gcGF0aCArIGZpbGU7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwoZGlyZWN0b3J5LCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBpZiAoZmlsZVN5c3RlbS5pc0ZpbGUgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBxLnJlc29sdmUoZmlsZVN5c3RlbSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IDEzLCBtZXNzYWdlOiAnaW5wdXQgaXMgbm90IGEgZmlsZSd9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjcmVhdGVEaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lLCByZXBsYWNlQm9vbCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZGlyTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZGlyZWN0b3J5IGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcGxhY2VCb29sID0gcmVwbGFjZUJvb2wgPyBmYWxzZSA6IHRydWU7XG5cbiAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICAgIGV4Y2x1c2l2ZTogcmVwbGFjZUJvb2xcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCBvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNyZWF0ZUZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSwgcmVwbGFjZUJvb2wpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVwbGFjZUJvb2wgPSByZXBsYWNlQm9vbCA/IGZhbHNlIDogdHJ1ZTtcblxuICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgICAgZXhjbHVzaXZlOiByZXBsYWNlQm9vbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwgb3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlRGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZGlyTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZGlyRW50cnkpIHtcbiAgICAgICAgICAgICAgICBkaXJFbnRyeS5yZW1vdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHtzdWNjZXNzOiB0cnVlLCBmaWxlUmVtb3ZlZDogZGlyRW50cnl9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIGVyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZUZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LnJlbW92ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlc29sdmUoe3N1Y2Nlc3M6IHRydWUsIGZpbGVSZW1vdmVkOiBmaWxlRW50cnl9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIGVyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVJlY3Vyc2l2ZWx5OiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZGlyTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZGlyRW50cnkpIHtcbiAgICAgICAgICAgICAgICBkaXJFbnRyeS5yZW1vdmVSZWN1cnNpdmVseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlc29sdmUoe3N1Y2Nlc3M6IHRydWUsIGZpbGVSZW1vdmVkOiBkaXJFbnRyeX0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgZXIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2VyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgd3JpdGVGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUsIHRleHQsIHJlcGxhY2VCb29sKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcGxhY2VCb29sID0gcmVwbGFjZUJvb2wgPyBmYWxzZSA6IHRydWU7XG5cbiAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICAgIGV4Y2x1c2l2ZTogcmVwbGFjZUJvb2xcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIG9wdGlvbnMsIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuY3JlYXRlV3JpdGVyKGZ1bmN0aW9uICh3cml0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmFwcGVuZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXIuc2Vlayh3cml0ZXIubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMudHJ1bmNhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVyLnRydW5jYXRlKG9wdGlvbnMudHJ1bmNhdGUpO1xuICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICB3cml0ZXIub253cml0ZWVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh0aGlzLmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgd3JpdGVyLndyaXRlKHRleHQpO1xuXG4gICAgICAgICAgICAgICAgICBxLnByb21pc2UuYWJvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlci5hYm9ydCgpO1xuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgd3JpdGVFeGlzdGluZ0ZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSwgdGV4dCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmNyZWF0ZVdyaXRlcihmdW5jdGlvbiAod3JpdGVyKSB7XG4gICAgICAgICAgICAgICAgICB3cml0ZXIuc2Vlayh3cml0ZXIubGVuZ3RoKTtcblxuICAgICAgICAgICAgICAgICAgd3JpdGVyLm9ud3JpdGVlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QodGhpcy5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgIHdyaXRlci53cml0ZSh0ZXh0KTtcblxuICAgICAgICAgICAgICAgICAgcS5wcm9taXNlLmFib3J0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXIuYWJvcnQoKTtcbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlYWRBc1RleHQ6IGZ1bmN0aW9uIChwYXRoLCBmaWxlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmZpbGUoZnVuY3Rpb24gKGZpbGVEYXRhKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblxuICAgICAgICAgICAgICAgICAgcmVhZGVyLm9ubG9hZGVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2dC50YXJnZXQucmVzdWx0ICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5yZXN1bHQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0LnRhcmdldC5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV2dC50YXJnZXQuZXJyb3IgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LmVycm9yICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXZ0LnRhcmdldC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IG51bGwsIG1lc3NhZ2U6ICdSRUFERVJfT05MT0FERU5EX0VSUid9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc1RleHQoZmlsZURhdGEpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWFkQXNEYXRhVVJMOiBmdW5jdGlvbiAocGF0aCwgZmlsZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5maWxlKGZ1bmN0aW9uIChmaWxlRGF0YSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gICAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZ0LnRhcmdldC5yZXN1bHQgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LnJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQudGFyZ2V0LnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZ0LnRhcmdldC5lcnJvciAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQuZXJyb3IgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChldnQudGFyZ2V0LmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogbnVsbCwgbWVzc2FnZTogJ1JFQURFUl9PTkxPQURFTkRfRVJSJ30pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc0RhdGFVUkwoZmlsZURhdGEpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWFkQXNCaW5hcnlTdHJpbmc6IGZ1bmN0aW9uIChwYXRoLCBmaWxlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmZpbGUoZnVuY3Rpb24gKGZpbGVEYXRhKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWRlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChldnQudGFyZ2V0LnJlc3VsdCAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQucmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dC50YXJnZXQucmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChldnQudGFyZ2V0LmVycm9yICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5lcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGV2dC50YXJnZXQuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiBudWxsLCBtZXNzYWdlOiAnUkVBREVSX09OTE9BREVORF9FUlInfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzQmluYXJ5U3RyaW5nKGZpbGVEYXRhKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVhZEFzQXJyYXlCdWZmZXI6IGZ1bmN0aW9uIChwYXRoLCBmaWxlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmZpbGUoZnVuY3Rpb24gKGZpbGVEYXRhKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWRlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChldnQudGFyZ2V0LnJlc3VsdCAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQucmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dC50YXJnZXQucmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChldnQudGFyZ2V0LmVycm9yICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5lcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGV2dC50YXJnZXQuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiBudWxsLCBtZXNzYWdlOiAnUkVBREVSX09OTE9BREVORF9FUlInfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoZmlsZURhdGEpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBtb3ZlRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lLCBuZXdQYXRoLCBuZXdGaWxlTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIG5ld0ZpbGVOYW1lID0gbmV3RmlsZU5hbWUgfHwgZmlsZU5hbWU7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkgfHwgKC9eXFwvLy50ZXN0KG5ld0ZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChuZXdQYXRoLCBmdW5jdGlvbiAobmV3RmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgICBmaWxlRW50cnkubW92ZVRvKG5ld0ZpbGVFbnRyeSwgbmV3RmlsZU5hbWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIG1vdmVEaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lLCBuZXdQYXRoLCBuZXdEaXJOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgbmV3RGlyTmFtZSA9IG5ld0Rpck5hbWUgfHwgZGlyTmFtZTtcblxuICAgICAgICAgIGlmICgvXlxcLy8udGVzdChkaXJOYW1lKSB8fCAoL15cXC8vLnRlc3QobmV3RGlyTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZGlyRW50cnkpIHtcbiAgICAgICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwobmV3UGF0aCwgZnVuY3Rpb24gKG5ld0RpckVudHJ5KSB7XG4gICAgICAgICAgICAgICAgICBkaXJFbnRyeS5tb3ZlVG8obmV3RGlyRW50cnksIG5ld0Rpck5hbWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm8pIHtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm8pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY29weURpcjogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUsIG5ld1BhdGgsIG5ld0Rpck5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBuZXdEaXJOYW1lID0gbmV3RGlyTmFtZSB8fCBkaXJOYW1lO1xuXG4gICAgICAgICAgaWYgKC9eXFwvLy50ZXN0KGRpck5hbWUpIHx8ICgvXlxcLy8udGVzdChuZXdEaXJOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCB7Y3JlYXRlOiBmYWxzZSwgZXhjbHVzaXZlOiBmYWxzZX0sIGZ1bmN0aW9uIChkaXJFbnRyeSkge1xuXG4gICAgICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKG5ld1BhdGgsIGZ1bmN0aW9uIChuZXdEaXJFbnRyeSkge1xuICAgICAgICAgICAgICAgICAgZGlyRW50cnkuY29weVRvKG5ld0RpckVudHJ5LCBuZXdEaXJOYW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm8pIHtcbiAgICAgICAgICAgICAgICAgIGVycm8ubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm8uY29kZV07XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIGVyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvcHlGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUsIG5ld1BhdGgsIG5ld0ZpbGVOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgbmV3RmlsZU5hbWUgPSBuZXdGaWxlTmFtZSB8fCBmaWxlTmFtZTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwge2NyZWF0ZTogZmFsc2UsIGV4Y2x1c2l2ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG5cbiAgICAgICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwobmV3UGF0aCwgZnVuY3Rpb24gKG5ld0ZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgICAgZmlsZUVudHJ5LmNvcHlUbyhuZXdGaWxlRW50cnksIG5ld0ZpbGVOYW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm8pIHtcbiAgICAgICAgICAgICAgICAgIGVycm8ubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm8uY29kZV07XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIGVyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLypcbiAgICAgICAgIGxpc3RGaWxlczogZnVuY3Rpb24gKHBhdGgsIGRpcikge1xuXG4gICAgICAgICB9LFxuXG4gICAgICAgICBsaXN0RGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSkge1xuICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICB0cnkge1xuICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCBvcHRpb25zLCBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgICAgICB2YXIgcmVhZGVyID0gcGFyZW50LmNyZWF0ZVJlYWRlcigpO1xuICAgICAgICAgcmVhZGVyLnJlYWRFbnRyaWVzKGZ1bmN0aW9uIChlbnRyaWVzKSB7XG4gICAgICAgICBxLnJlc29sdmUoZW50cmllcyk7XG4gICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICBxLnJlamVjdCgnRElSX1JFQURfRVJST1IgOiAnICsgcGF0aCArIGRpck5hbWUpO1xuICAgICAgICAgfSk7XG4gICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgIH0pO1xuICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgICB9LFxuXG4gICAgICAgICByZWFkRmlsZU1ldGFkYXRhOiBmdW5jdGlvbiAoZmlsZVBhdGgpIHtcbiAgICAgICAgIC8vcmV0dXJuIGdldEZpbGUoZmlsZVBhdGgsIHtjcmVhdGU6IGZhbHNlfSk7XG4gICAgICAgICB9XG4gICAgICAgICAqL1xuICAgICAgfTtcblxuICAgIH1dO1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9wd2xpbi9jb3Jkb3ZhLXBsdWdpbi1maWxlLW9wZW5lcjIuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9wd2xpbi9jb3Jkb3ZhLXBsdWdpbi1maWxlLW9wZW5lcjJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZpbGVPcGVuZXIyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRmlsZU9wZW5lcjInLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgb3BlbjogZnVuY3Rpb24gKGZpbGUsIHR5cGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZmlsZU9wZW5lcjIub3BlbihmaWxlLCB0eXBlLCB7XG4gICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9LCBzdWNjZXNzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5pbnN0YWxsOiBmdW5jdGlvbiAocGFjaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5maWxlT3BlbmVyMi51bmluc3RhbGwocGFjaywge1xuICAgICAgICAgIGVycm9yOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfSwgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFwcElzSW5zdGFsbGVkOiBmdW5jdGlvbiAocGFjaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5maWxlT3BlbmVyMi5hcHBJc0luc3RhbGxlZChwYWNrLCB7XG4gICAgICAgICAgc3VjY2VzczogZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZmlsZS10cmFuc2ZlclxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZmlsZS10cmFuc2ZlclxuXG4vKiBnbG9iYWxzIEZpbGVUcmFuc2ZlcjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZpbGVUcmFuc2ZlcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUZpbGVUcmFuc2ZlcicsIFsnJHEnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHEsICR0aW1lb3V0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRvd25sb2FkOiBmdW5jdGlvbiAoc291cmNlLCBmaWxlUGF0aCwgb3B0aW9ucywgdHJ1c3RBbGxIb3N0cykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBmdCA9IG5ldyBGaWxlVHJhbnNmZXIoKTtcbiAgICAgICAgdmFyIHVyaSA9IChvcHRpb25zICYmIG9wdGlvbnMuZW5jb2RlVVJJID09PSBmYWxzZSkgPyBzb3VyY2UgOiBlbmNvZGVVUkkoc291cmNlKTtcblxuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnRpbWVvdXQgIT09IHVuZGVmaW5lZCAmJiBvcHRpb25zLnRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBmdC5hYm9ydCgpO1xuICAgICAgICAgIH0sIG9wdGlvbnMudGltZW91dCk7XG4gICAgICAgICAgb3B0aW9ucy50aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ0Lm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcbiAgICAgICAgICBxLm5vdGlmeShwcm9ncmVzcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLmFib3J0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGZ0LmFib3J0KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZnQuZG93bmxvYWQodXJpLCBmaWxlUGF0aCwgcS5yZXNvbHZlLCBxLnJlamVjdCwgdHJ1c3RBbGxIb3N0cywgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1cGxvYWQ6IGZ1bmN0aW9uIChzZXJ2ZXIsIGZpbGVQYXRoLCBvcHRpb25zLCB0cnVzdEFsbEhvc3RzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGZ0ID0gbmV3IEZpbGVUcmFuc2ZlcigpO1xuICAgICAgICB2YXIgdXJpID0gKG9wdGlvbnMgJiYgb3B0aW9ucy5lbmNvZGVVUkkgPT09IGZhbHNlKSA/IHNlcnZlciA6IGVuY29kZVVSSShzZXJ2ZXIpO1xuXG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMudGltZW91dCAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMudGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGZ0LmFib3J0KCk7XG4gICAgICAgICAgfSwgb3B0aW9ucy50aW1lb3V0KTtcbiAgICAgICAgICBvcHRpb25zLnRpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgZnQub25wcm9ncmVzcyA9IGZ1bmN0aW9uIChwcm9ncmVzcykge1xuICAgICAgICAgIHEubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2UuYWJvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZnQuYWJvcnQoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBmdC51cGxvYWQoZmlsZVBhdGgsIHVyaSwgcS5yZXNvbHZlLCBxLnJlamVjdCwgb3B0aW9ucywgdHJ1c3RBbGxIb3N0cyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9GbGFzaGxpZ2h0LVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vRmxhc2hsaWdodC1QaG9uZUdhcC1QbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZsYXNobGlnaHQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFGbGFzaGxpZ2h0JywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmZsYXNobGlnaHQuYXZhaWxhYmxlKGZ1bmN0aW9uIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShpc0F2YWlsYWJsZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3dpdGNoT246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZmxhc2hsaWdodC5zd2l0Y2hPbihmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3dpdGNoT2ZmOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmZsYXNobGlnaHQuc3dpdGNoT2ZmKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0b2dnbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZmxhc2hsaWdodC50b2dnbGUoZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tZmx1cnJ5LmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWZsdXJyeVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmx1cnJ5QWRzJywgW10pXG4gIC5mYWN0b3J5KCckY29yZG92YUZsdXJyeUFkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAtYnVpbGQvR0FQbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwLWJ1aWxkL0dBUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nYScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdBJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaW5pdDogZnVuY3Rpb24gKGlkLCBtaW5nYXApIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBtaW5nYXAgPSAobWluZ2FwID49IDApID8gbWluZ2FwIDogMTA7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nYVBsdWdpbi5pbml0KGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBpZCwgbWluZ2FwKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrRXZlbnQ6IGZ1bmN0aW9uIChzdWNjZXNzLCBmYWlsLCBjYXRlZ29yeSwgZXZlbnRBY3Rpb24sIGV2ZW50TGFiZWwsIGV2ZW50VmFsdWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ2FQbHVnaW4udHJhY2tFdmVudChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgY2F0ZWdvcnksIGV2ZW50QWN0aW9uLCBldmVudExhYmVsLCBldmVudFZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrUGFnZTogZnVuY3Rpb24gKHN1Y2Nlc3MsIGZhaWwsIHBhZ2VVUkwpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ2FQbHVnaW4udHJhY2tQYWdlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBwYWdlVVJMKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldFZhcmlhYmxlOiBmdW5jdGlvbiAoc3VjY2VzcywgZmFpbCwgaW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdhUGx1Z2luLnNldFZhcmlhYmxlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBpbmRleCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZXhpdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nYVBsdWdpbi5leGl0KGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWdlb2xvY2F0aW9uXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1nZW9sb2NhdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2VvbG9jYXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHZW9sb2NhdGlvbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRDdXJyZW50UG9zaXRpb246IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24uZ2V0Q3VycmVudFBvc2l0aW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3YXRjaFBvc2l0aW9uOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgdmFyIHdhdGNoSUQgPSBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24ud2F0Y2hQb3NpdGlvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHEucHJvbWlzZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLmNsZWFyV2F0Y2ggPSBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24uY2xlYXJXYXRjaChpZCB8fCB3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2Uud2F0Y2hJRCA9IHdhdGNoSUQ7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyV2F0Y2g6IGZ1bmN0aW9uICh3YXRjaElEKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24uY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWdsb2JhbGl6YXRpb25cbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1nbG9iYWxpemF0aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nbG9iYWxpemF0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR2xvYmFsaXphdGlvbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRQcmVmZXJyZWRMYW5ndWFnZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0UHJlZmVycmVkTGFuZ3VhZ2UoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0TG9jYWxlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0TG9jYWxlTmFtZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRGaXJzdERheU9mV2VlazogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0Rmlyc3REYXlPZldlZWsoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLy8gXCJkYXRlXCIgcGFyYW1ldGVyIG11c3QgYmUgYSBKYXZhU2NyaXB0IERhdGUgT2JqZWN0LlxuICAgICAgZGF0ZVRvU3RyaW5nOiBmdW5jdGlvbiAoZGF0ZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZGF0ZVRvU3RyaW5nKFxuICAgICAgICAgIGRhdGUsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdHJpbmdUb0RhdGU6IGZ1bmN0aW9uIChkYXRlU3RyaW5nLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5zdHJpbmdUb0RhdGUoXG4gICAgICAgICAgZGF0ZVN0cmluZyxcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldERhdGVQYXR0ZXJuOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0RGF0ZVBhdHRlcm4oXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXREYXRlTmFtZXM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXREYXRlTmFtZXMoXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvLyBcImRhdGVcIiBwYXJhbWV0ZXIgbXVzdCBiZSBhIEphdmFTY3JpcHQgRGF0ZSBPYmplY3QuXG4gICAgICBpc0RheUxpZ2h0U2F2aW5nc1RpbWU6IGZ1bmN0aW9uIChkYXRlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5pc0RheUxpZ2h0U2F2aW5nc1RpbWUoXG4gICAgICAgICAgZGF0ZSxcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBudW1iZXJUb1N0cmluZzogZnVuY3Rpb24gKG51bWJlciwgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24ubnVtYmVyVG9TdHJpbmcoXG4gICAgICAgICAgbnVtYmVyLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RyaW5nVG9OdW1iZXI6IGZ1bmN0aW9uIChudW1iZXJTdHJpbmcsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLnN0cmluZ1RvTnVtYmVyKFxuICAgICAgICAgIG51bWJlclN0cmluZyxcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldE51bWJlclBhdHRlcm46IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXROdW1iZXJQYXR0ZXJuKFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0Q3VycmVuY3lQYXR0ZXJuOiBmdW5jdGlvbiAoY3VycmVuY3lDb2RlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXRDdXJyZW5jeVBhdHRlcm4oXG4gICAgICAgICAgY3VycmVuY3lDb2RlLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cblxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLWFkbW9iLXByby5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLWFkbW9iLXByb1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlQWRzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR29vZ2xlQWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2Iuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2Iuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZGFud2lsc29uL2dvb2dsZS1hbmFseXRpY3MtcGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9kYW53aWxzb24vZ29vZ2xlLWFuYWx5dGljcy1wbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZUFuYWx5dGljcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdvb2dsZUFuYWx5dGljcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXJ0VHJhY2tlcldpdGhJZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5zdGFydFRyYWNrZXJXaXRoSWQoaWQsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldFVzZXJJZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5zZXRVc2VySWQoaWQsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRlYnVnTW9kZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MuZGVidWdNb2RlKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tWaWV3OiBmdW5jdGlvbiAoc2NyZWVuTmFtZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MudHJhY2tWaWV3KHNjcmVlbk5hbWUsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFkZEN1c3RvbURpbWVuc2lvbjogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLmFkZEN1c3RvbURpbWVuc2lvbihrZXksIHZhbHVlLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrRXZlbnQ6IGZ1bmN0aW9uIChjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnRyYWNrRXZlbnQoY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja0V4Y2VwdGlvbjogZnVuY3Rpb24gKGRlc2NyaXB0aW9uLCBmYXRhbCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MudHJhY2tFeGNlcHRpb24oZGVzY3JpcHRpb24sIGZhdGFsLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja1RpbWluZzogZnVuY3Rpb24gKGNhdGVnb3J5LCBtaWxsaXNlY29uZHMsIHZhcmlhYmxlLCBsYWJlbCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MudHJhY2tUaW1pbmcoY2F0ZWdvcnksIG1pbGxpc2Vjb25kcywgdmFyaWFibGUsIGxhYmVsLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhZGRUcmFuc2FjdGlvbjogZnVuY3Rpb24gKHRyYW5zYWN0aW9uSWQsIGFmZmlsaWF0aW9uLCByZXZlbnVlLCB0YXgsIHNoaXBwaW5nLCBjdXJyZW5jeUNvZGUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLmFkZFRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uSWQsIGFmZmlsaWF0aW9uLCByZXZlbnVlLCB0YXgsIHNoaXBwaW5nLCBjdXJyZW5jeUNvZGUsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFkZFRyYW5zYWN0aW9uSXRlbTogZnVuY3Rpb24gKHRyYW5zYWN0aW9uSWQsIG5hbWUsIHNrdSwgY2F0ZWdvcnksIHByaWNlLCBxdWFudGl0eSwgY3VycmVuY3lDb2RlKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5hZGRUcmFuc2FjdGlvbkl0ZW0odHJhbnNhY3Rpb25JZCwgbmFtZSwgc2t1LCBjYXRlZ29yeSwgcHJpY2UsIHF1YW50aXR5LCBjdXJyZW5jeUNvZGUsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6XG4vLyBsaW5rICAgICAgOlxuXG4vLyBHb29nbGUgTWFwcyBuZWVkcyBBTE9UIG9mIHdvcmshXG4vLyBOb3QgZm9yIHByb2R1Y3Rpb24gdXNlXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVNYXAnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHb29nbGVNYXAnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHZhciBtYXAgPSBudWxsO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldE1hcDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5wbHVnaW4uZ29vZ2xlLm1hcHMpIHtcbiAgICAgICAgICBxLnJlamVjdChudWxsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgZGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21hcF9jYW52YXMnKTtcbiAgICAgICAgICBtYXAgPSAkd2luZG93LnBsdWdpbi5nb29nbGUubWFwcy5NYXAuZ2V0TWFwKG9wdGlvbnMpO1xuICAgICAgICAgIG1hcC5zZXREaXYoZGl2KTtcbiAgICAgICAgICBxLnJlc29sdmUobWFwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNNYXBMb2FkZWQ6IGZ1bmN0aW9uICgpIHsgLy8gY2hlY2sgaWYgYW4gaW5zdGFuY2Ugb2YgdGhlIG1hcCBleGlzdHNcbiAgICAgICAgcmV0dXJuICEhbWFwO1xuICAgICAgfSxcbiAgICAgIGFkZE1hcmtlcjogZnVuY3Rpb24gKG1hcmtlck9wdGlvbnMpIHsgLy8gYWRkIGEgbWFya2VyIHRvIHRoZSBtYXAgd2l0aCBnaXZlbiBtYXJrZXJPcHRpb25zXG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbWFwLmFkZE1hcmtlcihtYXJrZXJPcHRpb25zLCBmdW5jdGlvbiAobWFya2VyKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG1hcmtlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgZ2V0TWFwVHlwZUlkczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW4uZ29vZ2xlLm1hcHMubWFwVHlwZUlkO1xuICAgICAgfSxcbiAgICAgIHNldFZpc2libGU6IGZ1bmN0aW9uIChpc1Zpc2libGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBtYXAuc2V0VmlzaWJsZShpc1Zpc2libGUpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIC8vIEkgZG9uJ3Qga25vdyBob3cgdG8gZGVhbGxvY2F0ZSB0ZSBtYXAgYW5kIHRoZSBnb29nbGUgbWFwIHBsdWdpbi5cbiAgICAgIGNsZWFudXA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbWFwID0gbnVsbDtcbiAgICAgICAgLy8gZGVsZXRlIG1hcDtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9wdGdhbXIvY29yZG92YS1nb29nbGUtcGxheS1nYW1lLmdpdCAtLXZhcmlhYmxlIEFQUF9JRD0xMjM0NTY3ODlcbi8vIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL3B0Z2Ftci9jb3Jkb3ZhLWdvb2dsZS1wbGF5LWdhbWVcblxuLyogZ2xvYmFscyBnb29nbGVwbGF5Z2FtZTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZVBsYXlHYW1lJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR29vZ2xlUGxheUdhbWUnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYXV0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuYXV0aChmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzaWdub3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zaWdub3V0KGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIGlzU2lnbmVkSW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLmlzU2lnbmVkSW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2hvd1BsYXllcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc2hvd1BsYXllcihmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzdWJtaXRTY29yZTogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnN1Ym1pdFNjb3JlKGRhdGEsIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNob3dBbGxMZWFkZXJib2FyZHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnNob3dBbGxMZWFkZXJib2FyZHMoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2hvd0xlYWRlcmJvYXJkOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc2hvd0xlYWRlcmJvYXJkKGRhdGEsIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHVubG9ja0FjaGlldmVtZW50OiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUudW5sb2NrQWNoaWV2ZW1lbnQoZGF0YSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgaW5jcmVtZW50QWNoaWV2ZW1lbnQ6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5pbmNyZW1lbnRBY2hpZXZlbWVudChkYXRhLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzaG93QWNoaWV2ZW1lbnRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zaG93QWNoaWV2ZW1lbnRzKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL2NvcmRvdmEtcGx1Z2luLWdvb2dsZXBsdXMuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vY29yZG92YS1wbHVnaW4tZ29vZ2xlcGx1c1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlUGx1cycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdvb2dsZVBsdXMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBsb2dpbjogZnVuY3Rpb24gKGlvc0tleSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKGlvc0tleSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaW9zS2V5ID0ge307XG4gICAgICAgIH1cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdvb2dsZXBsdXMubG9naW4oeydpT1NBcGlLZXknOiBpb3NLZXl9LCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaWxlbnRMb2dpbjogZnVuY3Rpb24gKGlvc0tleSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKGlvc0tleSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaW9zS2V5ID0ge307XG4gICAgICAgIH1cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdvb2dsZXBsdXMudHJ5U2lsZW50TG9naW4oeydpT1NBcGlLZXknOiBpb3NLZXl9LCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBsb2dvdXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ29vZ2xlcGx1cy5sb2dvdXQoZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICBkaXNjb25uZWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdvb2dsZXBsdXMuZGlzY29ubmVjdChmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIGlzQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdvb2dsZXBsdXMuaXNBdmFpbGFibGUoZnVuY3Rpb24gKGF2YWlsYWJsZSkge1xuICAgICAgICAgIGlmIChhdmFpbGFibGUpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShhdmFpbGFibGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdChhdmFpbGFibGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vVGVsZXJpay1WZXJpZmllZC1QbHVnaW5zL0hlYWx0aEtpdC5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL1RlbGVyaWstVmVyaWZpZWQtUGx1Z2lucy9IZWFsdGhLaXRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmhlYWx0aEtpdCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUhlYWx0aEtpdCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlzQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LmF2YWlsYWJsZShmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIENoZWNrIHdoZXRoZXIgb3Igbm90IHRoZSB1c2VyIGdyYW50ZWQgeW91ciBhcHAgYWNjZXNzIHRvIGEgc3BlY2lmaWMgSGVhbHRoS2l0IHR5cGUuXG4gICAgICAgKiBSZWZlcmVuY2UgZm9yIHBvc3NpYmxlIHR5cGVzOlxuICAgICAgICogaHR0cHM6Ly9kZXZlbG9wZXIuYXBwbGUuY29tL2xpYnJhcnkvaW9zL2RvY3VtZW50YXRpb24vSGVhbHRoS2l0L1JlZmVyZW5jZS9IZWFsdGhLaXRfQ29uc3RhbnRzL1xuICAgICAgICovXG4gICAgICBjaGVja0F1dGhTdGF0dXM6IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICB0eXBlID0gdHlwZSB8fCAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVySGVpZ2h0JztcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LmNoZWNrQXV0aFN0YXR1cyh7XG4gICAgICAgICAgJ3R5cGUnOiB0eXBlXG4gICAgICAgIH0sIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmVxdWVzdCBhdXRob3JpemF0aW9uIHRvIGFjY2VzcyBIZWFsdGhLaXQgZGF0YS4gU2VlIHRoZSBmdWxsIEhlYWx0aEtpdCBjb25zdGFudHNcbiAgICAgICAqIHJlZmVyZW5jZSBmb3IgcG9zc2libGUgcmVhZCBhbmQgd3JpdGUgdHlwZXM6XG4gICAgICAgKiBodHRwczovL2RldmVsb3Blci5hcHBsZS5jb20vbGlicmFyeS9pb3MvZG9jdW1lbnRhdGlvbi9IZWFsdGhLaXQvUmVmZXJlbmNlL0hlYWx0aEtpdF9Db25zdGFudHMvXG4gICAgICAgKi9cbiAgICAgIHJlcXVlc3RBdXRob3JpemF0aW9uOiBmdW5jdGlvbiAocmVhZFR5cGVzLCB3cml0ZVR5cGVzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICByZWFkVHlwZXMgPSByZWFkVHlwZXMgfHwgW1xuICAgICAgICAgICdIS0NoYXJhY3RlcmlzdGljVHlwZUlkZW50aWZpZXJEYXRlT2ZCaXJ0aCcsICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJBY3RpdmVFbmVyZ3lCdXJuZWQnLCAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVySGVpZ2h0J1xuICAgICAgICBdO1xuICAgICAgICB3cml0ZVR5cGVzID0gd3JpdGVUeXBlcyB8fCBbXG4gICAgICAgICAgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckFjdGl2ZUVuZXJneUJ1cm5lZCcsICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJIZWlnaHQnLCAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVyRGlzdGFuY2VDeWNsaW5nJ1xuICAgICAgICBdO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucmVxdWVzdEF1dGhvcml6YXRpb24oe1xuICAgICAgICAgICdyZWFkVHlwZXMnOiByZWFkVHlwZXMsXG4gICAgICAgICAgJ3dyaXRlVHlwZXMnOiB3cml0ZVR5cGVzXG4gICAgICAgIH0sIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWREYXRlT2ZCaXJ0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucmVhZERhdGVPZkJpcnRoKFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWRHZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnJlYWRHZW5kZXIoXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2F2ZVdlaWdodDogZnVuY3Rpb24gKHZhbHVlLCB1bml0cywgZGF0ZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuc2F2ZVdlaWdodCh7XG4gICAgICAgICAgICAndW5pdCc6IHVuaXRzIHx8ICdsYicsXG4gICAgICAgICAgICAnYW1vdW50JzogdmFsdWUsXG4gICAgICAgICAgICAnZGF0ZSc6IGRhdGUgfHwgbmV3IERhdGUoKVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWRXZWlnaHQ6IGZ1bmN0aW9uICh1bml0cykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucmVhZFdlaWdodCh7XG4gICAgICAgICAgICAndW5pdCc6IHVuaXRzIHx8ICdsYidcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzYXZlSGVpZ2h0OiBmdW5jdGlvbiAodmFsdWUsIHVuaXRzLCBkYXRlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5zYXZlSGVpZ2h0KHtcbiAgICAgICAgICAgICd1bml0JzogdW5pdHMgfHwgJ2luJyxcbiAgICAgICAgICAgICdhbW91bnQnOiB2YWx1ZSxcbiAgICAgICAgICAgICdkYXRlJzogZGF0ZSB8fCBuZXcgRGF0ZSgpXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHJlYWRIZWlnaHQ6IGZ1bmN0aW9uICh1bml0cykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucmVhZEhlaWdodCh7XG4gICAgICAgICAgICAndW5pdCc6IHVuaXRzIHx8ICdpbidcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGZpbmRXb3Jrb3V0czogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuZmluZFdvcmtvdXRzKHt9LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFNhdmUgYSB3b3Jrb3V0LlxuICAgICAgICpcbiAgICAgICAqIFdvcmtvdXQgcGFyYW0gc2hvdWxkIGJlIG9mIHRoZSBmb3JtYXQ6XG4gICAgICAge1xuICAgICAgICAgJ2FjdGl2aXR5VHlwZSc6ICdIS1dvcmtvdXRBY3Rpdml0eVR5cGVDeWNsaW5nJywgLy8gSEtXb3Jrb3V0QWN0aXZpdHlUeXBlIGNvbnN0YW50IChodHRwczovL2RldmVsb3Blci5hcHBsZS5jb20vbGlicmFyeS9pb3MvZG9jdW1lbnRhdGlvbi9IZWFsdGhLaXQvUmVmZXJlbmNlL0hLV29ya291dF9DbGFzcy8jLy9hcHBsZV9yZWYvYy90ZGVmL0hLV29ya291dEFjdGl2aXR5VHlwZSlcbiAgICAgICAgICdxdWFudGl0eVR5cGUnOiAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVyRGlzdGFuY2VDeWNsaW5nJyxcbiAgICAgICAgICdzdGFydERhdGUnOiBuZXcgRGF0ZSgpLCAvLyBtYW5kYXRvcnlcbiAgICAgICAgICdlbmREYXRlJzogbnVsbCwgLy8gb3B0aW9uYWwsIHVzZSBlaXRoZXIgdGhpcyBvciBkdXJhdGlvblxuICAgICAgICAgJ2R1cmF0aW9uJzogMzYwMCwgLy8gaW4gc2Vjb25kcywgb3B0aW9uYWwsIHVzZSBlaXRoZXIgdGhpcyBvciBlbmREYXRlXG4gICAgICAgICAnZW5lcmd5JzogMzAwLCAvL1xuICAgICAgICAgJ2VuZXJneVVuaXQnOiAna2NhbCcsIC8vIEp8Y2FsfGtjYWxcbiAgICAgICAgICdkaXN0YW5jZSc6IDExLCAvLyBvcHRpb25hbFxuICAgICAgICAgJ2Rpc3RhbmNlVW5pdCc6ICdrbScgLy8gcHJvYmFibHkgdXNlZnVsIHdpdGggdGhlIGZvcm1lciBwYXJhbVxuICAgICAgICAgLy8gJ2V4dHJhRGF0YSc6IFwiXCIsIC8vIE5vdCBzdXJlIGhvdyBuZWNlc3NhcnkgdGhpcyBpc1xuICAgICAgIH0sXG4gICAgICAgKi9cbiAgICAgIHNhdmVXb3Jrb3V0OiBmdW5jdGlvbiAod29ya291dCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuc2F2ZVdvcmtvdXQod29ya291dCxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBTYW1wbGUgYW55IGtpbmQgb2YgaGVhbHRoIGRhdGEgdGhyb3VnaCBhIGdpdmVuIGRhdGUgcmFuZ2UuXG4gICAgICAgKiBzYW1wbGVRdWVyeSBvZiB0aGUgZm9ybWF0OlxuICAgICAgIHtcblx0XHRcdFx0XHRcdFx0XHRcdCdzdGFydERhdGUnOiB5ZXN0ZXJkYXksIC8vIG1hbmRhdG9yeVxuXHRcdFx0XHRcdFx0XHRcdFx0J2VuZERhdGUnOiB0b21vcnJvdywgLy8gbWFuZGF0b3J5XG5cdFx0XHRcdFx0XHRcdFx0XHQnc2FtcGxlVHlwZSc6ICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJIZWlnaHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J3VuaXQnIDogJ2NtJ1xuXHRcdFx0XHRcdFx0XHR9LFxuICAgICAgICovXG4gICAgICBxdWVyeVNhbXBsZVR5cGU6IGZ1bmN0aW9uIChzYW1wbGVRdWVyeSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucXVlcnlTYW1wbGVUeXBlKHNhbXBsZVF1ZXJ5LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtaHR0cGQuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1odHRwZFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaHR0cGQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFIdHRwZCcsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGFydFNlcnZlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5Db3JIdHRwZC5zdGFydFNlcnZlcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RvcFNlcnZlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLkNvckh0dHBkLnN0b3BTZXJ2ZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFVSTDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLkNvckh0dHBkLmdldFVSTChmdW5jdGlvbiAodXJsKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHVybCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0TG9jYWxQYXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuQ29ySHR0cGQuZ2V0TG9jYWxQYXRoKGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHBhdGgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cblxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1pYWQuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4taWFkXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5pQWQnLCBbXSlcbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhaUFkJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3d5bXNlZS9jb3Jkb3ZhLWltYWdlUGlja2VyLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL3d5bXNlZS9jb3Jkb3ZhLWltYWdlUGlja2VyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5pbWFnZVBpY2tlcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUltYWdlUGlja2VyJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0UGljdHVyZXM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmltYWdlUGlja2VyLmdldFBpY3R1cmVzKGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWluYXBwYnJvd3NlclxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4taW5hcHBicm93c2VyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5pbkFwcEJyb3dzZXInLCBbXSlcblxuICAucHJvdmlkZXIoJyRjb3Jkb3ZhSW5BcHBCcm93c2VyJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHZhciByZWY7XG4gICAgdmFyIGRlZmF1bHRPcHRpb25zID0gdGhpcy5kZWZhdWx0T3B0aW9ucyA9IHt9O1xuXG4gICAgdGhpcy5zZXREZWZhdWx0T3B0aW9ucyA9IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIGNvbmZpZyk7XG4gICAgfTtcblxuICAgIHRoaXMuJGdldCA9IFsnJHJvb3RTY29wZScsICckcScsICckd2luZG93JywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCAkd2luZG93LCAkdGltZW91dCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb3BlbjogZnVuY3Rpb24gKHVybCwgdGFyZ2V0LCByZXF1ZXN0T3B0aW9ucykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmIChyZXF1ZXN0T3B0aW9ucyAmJiAhYW5ndWxhci5pc09iamVjdChyZXF1ZXN0T3B0aW9ucykpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdvcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBvcHRpb25zID0gYW5ndWxhci5leHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLCByZXF1ZXN0T3B0aW9ucyk7XG5cbiAgICAgICAgICB2YXIgb3B0ID0gW107XG4gICAgICAgICAgYW5ndWxhci5mb3JFYWNoKG9wdGlvbnMsIGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICBvcHQucHVzaChrZXkgKyAnPScgKyB2YWx1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgdmFyIG9wdGlvbnNTdHJpbmcgPSBvcHQuam9pbigpO1xuXG4gICAgICAgICAgcmVmID0gJHdpbmRvdy5vcGVuKHVybCwgdGFyZ2V0LCBvcHRpb25zU3RyaW5nKTtcblxuICAgICAgICAgIHJlZi5hZGRFdmVudExpc3RlbmVyKCdsb2Fkc3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUluQXBwQnJvd3Nlcjpsb2Fkc3RhcnQnLCBldmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgICByZWYuYWRkRXZlbnRMaXN0ZW5lcignbG9hZHN0b3AnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShldmVudCk7XG4gICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFJbkFwcEJyb3dzZXI6bG9hZHN0b3AnLCBldmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgICByZWYuYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVycm9yJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBxLnJlamVjdChldmVudCk7XG4gICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFJbkFwcEJyb3dzZXI6bG9hZGVycm9yJywgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgICAgcmVmLmFkZEV2ZW50TGlzdGVuZXIoJ2V4aXQnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUluQXBwQnJvd3NlcjpleGl0JywgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjbG9zZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJlZi5jbG9zZSgpO1xuICAgICAgICAgIHJlZiA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2hvdzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJlZi5zaG93KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZXhlY3V0ZVNjcmlwdDogZnVuY3Rpb24gKGRldGFpbHMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICByZWYuZXhlY3V0ZVNjcmlwdChkZXRhaWxzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW5zZXJ0Q1NTOiBmdW5jdGlvbiAoZGV0YWlscykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIHJlZi5pbnNlcnRDU1MoZGV0YWlscywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vSW5zb21uaWEtUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0luc29tbmlhLVBob25lR2FwLVBsdWdpblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmluc29tbmlhJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhSW5zb21uaWEnLCBbJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGtlZXBBd2FrZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW5zLmluc29tbmlhLmtlZXBBd2FrZSgpO1xuICAgICAgfSxcbiAgICAgIGFsbG93U2xlZXBBZ2FpbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW5zLmluc29tbmlhLmFsbG93U2xlZXBBZ2FpbigpO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgIGNvcmRvdmEgcGx1Z2lucyBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3ZzdGlyYnUvSW5zdGFncmFtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vdnN0aXJidS9JbnN0YWdyYW1QbHVnaW5cblxuLyogZ2xvYmFscyBJbnN0YWdyYW06IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5pbnN0YWdyYW0nLCBbXSlcblxuLmZhY3RvcnkoJyRjb3Jkb3ZhSW5zdGFncmFtJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gIHJldHVybiB7XG4gICAgc2hhcmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgIGlmICghd2luZG93Lkluc3RhZ3JhbSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdUcmllZCB0byBjYWxsIEluc3RhZ3JhbS5zaGFyZSBidXQgdGhlIEluc3RhZ3JhbSBwbHVnaW4gaXNuXFwndCBpbnN0YWxsZWQhJyk7XG4gICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cblxuICAgICAgSW5zdGFncmFtLnNoYXJlKG9wdGlvbnMuaW1hZ2UsIG9wdGlvbnMuY2FwdGlvbiwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBpZihlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgIH0sXG4gICAgaXNJbnN0YWxsZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgaWYgKCF3aW5kb3cuSW5zdGFncmFtKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1RyaWVkIHRvIGNhbGwgSW5zdGFncmFtLmlzSW5zdGFsbGVkIGJ1dCB0aGUgSW5zdGFncmFtIHBsdWdpbiBpc25cXCd0IGluc3RhbGxlZCEnKTtcbiAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgICBJbnN0YWdyYW0uaXNJbnN0YWxsZWQoZnVuY3Rpb24gKGVyciwgaW5zdGFsbGVkKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHEucmVzb2x2ZShpbnN0YWxsZWQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgfVxuICB9O1xufV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZHJpZnR5Y28vaW9uaWMtcGx1Z2lucy1rZXlib2FyZC5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2RyaWZ0eWNvL2lvbmljLXBsdWdpbnMta2V5Ym9hcmRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmtleWJvYXJkJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhS2V5Ym9hcmQnLCBbJyRyb290U2NvcGUnLCBmdW5jdGlvbiAoJHJvb3RTY29wZSkge1xuXG4gICAgdmFyIGtleWJvYXJkU2hvd0V2ZW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgJHJvb3RTY29wZS4kZXZhbEFzeW5jKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUtleWJvYXJkOnNob3cnKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB2YXIga2V5Ym9hcmRIaWRlRXZlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAkcm9vdFNjb3BlLiRldmFsQXN5bmMoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhS2V5Ym9hcmQ6aGlkZScpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZCkge1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbmF0aXZlLmtleWJvYXJkc2hvdycsIGtleWJvYXJkU2hvd0V2ZW50LCBmYWxzZSk7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCduYXRpdmUua2V5Ym9hcmRoaWRlJywga2V5Ym9hcmRIaWRlRXZlbnQsIGZhbHNlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBoaWRlQWNjZXNzb3J5QmFyOiBmdW5jdGlvbiAoYm9vbCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLktleWJvYXJkLmhpZGVLZXlib2FyZEFjY2Vzc29yeUJhcihib29sKTtcbiAgICAgIH0sXG5cbiAgICAgIGNsb3NlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQuY2xvc2UoKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZC5zaG93KCk7XG4gICAgICB9LFxuXG4gICAgICBkaXNhYmxlU2Nyb2xsOiBmdW5jdGlvbiAoYm9vbCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLktleWJvYXJkLmRpc2FibGVTY3JvbGwoYm9vbCk7XG4gICAgICB9LFxuXG4gICAgICBpc1Zpc2libGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZC5pc1Zpc2libGU7XG4gICAgICB9LFxuXG4gICAgICBjbGVhclNob3dXYXRjaDogZnVuY3Rpb24gKCkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCduYXRpdmUua2V5Ym9hcmRzaG93Jywga2V5Ym9hcmRTaG93RXZlbnQpO1xuICAgICAgICAkcm9vdFNjb3BlLiQkbGlzdGVuZXJzWyckY29yZG92YUtleWJvYXJkOnNob3cnXSA9IFtdO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJIaWRlV2F0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbmF0aXZlLmtleWJvYXJkaGlkZScsIGtleWJvYXJkSGlkZUV2ZW50KTtcbiAgICAgICAgJHJvb3RTY29wZS4kJGxpc3RlbmVyc1snJGNvcmRvdmFLZXlib2FyZDpoaWRlJ10gPSBbXTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9zaGF6cm9uL0tleWNoYWluUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vc2hhenJvbi9LZXljaGFpblBsdWdpblxuXG4vKiBnbG9iYWxzIEtleWNoYWluOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMua2V5Y2hhaW4nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFLZXljaGFpbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRGb3JLZXk6IGZ1bmN0aW9uIChrZXksIHNlcnZpY2VOYW1lKSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBrYyA9IG5ldyBLZXljaGFpbigpO1xuXG4gICAgICAgIGtjLmdldEZvcktleShkZWZlci5yZXNvbHZlLCBkZWZlci5yZWplY3QsIGtleSwgc2VydmljZU5hbWUpO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0Rm9yS2V5OiBmdW5jdGlvbiAoa2V5LCBzZXJ2aWNlTmFtZSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIGtjID0gbmV3IEtleWNoYWluKCk7XG5cbiAgICAgICAga2Muc2V0Rm9yS2V5KGRlZmVyLnJlc29sdmUsIGRlZmVyLnJlamVjdCwga2V5LCBzZXJ2aWNlTmFtZSwgdmFsdWUpO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlRm9yS2V5OiBmdW5jdGlvbiAoa2V5LCBzZXJ2aWNlTmFtZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAga2MgPSBuZXcgS2V5Y2hhaW4oKTtcblxuICAgICAgICBrYy5yZW1vdmVGb3JLZXkoZGVmZXIucmVzb2x2ZSwgZGVmZXIucmVqZWN0LCBrZXksIHNlcnZpY2VOYW1lKTtcblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIHVrLmNvLndvcmtpbmdlZGdlLnBob25lZ2FwLnBsdWdpbi5sYXVuY2huYXZpZ2F0b3Jcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2RwYTk5Yy9waG9uZWdhcC1sYXVuY2gtbmF2aWdhdG9yXG5cbi8qIGdsb2JhbHMgbGF1bmNobmF2aWdhdG9yOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubGF1bmNoTmF2aWdhdG9yJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTGF1bmNoTmF2aWdhdG9yJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hdmlnYXRlOiBmdW5jdGlvbiAoZGVzdGluYXRpb24sIHN0YXJ0LCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbGF1bmNobmF2aWdhdG9yLm5hdmlnYXRlKFxuICAgICAgICAgIGRlc3RpbmF0aW9uLFxuICAgICAgICAgIHN0YXJ0LFxuICAgICAgICAgIGZ1bmN0aW9uICgpe1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3Ipe1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sXG5cdFx0ICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWxvY2FsLW5vdGlmaWNhdGlvbnMuZ2l0XG4vLyBsaW5rICAgICAgOiAgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1sb2NhbC1ub3RpZmljYXRpb25zXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5sb2NhbE5vdGlmaWNhdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uJywgWyckcScsICckd2luZG93JywgJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3csICRyb290U2NvcGUsICR0aW1lb3V0KSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoJHdpbmRvdy5jb3Jkb3ZhICYmXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zICYmXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbiAmJlxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwpIHtcbiAgICAgICAgLy8gLS0tLS0gXCJTY2hlZHVsaW5nXCIgZXZlbnRzXG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIHNjaGVkdWxlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ3NjaGVkdWxlJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246c2NoZWR1bGUnLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIHRyaWdnZXJlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ3RyaWdnZXInLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjp0cmlnZ2VyJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLS0tIFwiVXBkYXRlXCIgZXZlbnRzXG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIHVwZGF0ZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCd1cGRhdGUnLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjp1cGRhdGUnLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLS0tLS0gXCJDbGVhclwiIGV2ZW50c1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyBjbGVhcmVkIGZyb20gdGhlIG5vdGlmaWNhdGlvbiBjZW50ZXJcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdjbGVhcicsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOmNsZWFyJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFsbCBsb2NhbCBub3RpZmljYXRpb25zIHdlcmUgY2xlYXJlZCBmcm9tIHRoZSBub3RpZmljYXRpb24gY2VudGVyXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignY2xlYXJhbGwnLCBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246Y2xlYXJhbGwnLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLS0tIFwiQ2FuY2VsXCIgZXZlbnRzXG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIGNhbmNlbGxlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ2NhbmNlbCcsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOmNhbmNlbCcsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGwgbG9jYWwgbm90aWZpY2F0aW9ucyB3ZXJlIGNhbmNlbGxlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ2NhbmNlbGFsbCcsIGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpjYW5jZWxhbGwnLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLS0tIE90aGVyIGV2ZW50c1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyBjbGlja2VkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignY2xpY2snLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpjbGljaycsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LCBmYWxzZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNjaGVkdWxlOiBmdW5jdGlvbiAob3B0aW9ucywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnNjaGVkdWxlKG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhZGQ6IGZ1bmN0aW9uIChvcHRpb25zLCBzY29wZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0RlcHJlY2F0ZWQ6IHVzZSBcInNjaGVkdWxlXCIgaW5zdGVhZC4nKTtcblxuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuc2NoZWR1bGUob3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKG9wdGlvbnMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC51cGRhdGUob3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyOiBmdW5jdGlvbiAoaWRzLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuY2xlYXIoaWRzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJBbGw6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuY2xlYXJBbGwoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNhbmNlbDogZnVuY3Rpb24gKGlkcywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmNhbmNlbChpZHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjYW5jZWxBbGw6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuY2FuY2VsQWxsKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc1ByZXNlbnQ6IGZ1bmN0aW9uIChpZCwgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmlzUHJlc2VudChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzU2NoZWR1bGVkOiBmdW5jdGlvbiAoaWQsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5pc1NjaGVkdWxlZChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzVHJpZ2dlcmVkOiBmdW5jdGlvbiAoaWQsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5pc1RyaWdnZXJlZChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhhc1Blcm1pc3Npb246IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuaGFzUGVybWlzc2lvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlZ2lzdGVyUGVybWlzc2lvbjogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5yZWdpc3RlclBlcm1pc3Npb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdChyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcm9tcHRGb3JQZXJtaXNzaW9uOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdEZXByZWNhdGVkOiB1c2UgXCJyZWdpc3RlclBlcm1pc3Npb25cIiBpbnN0ZWFkLicpO1xuXG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5yZWdpc3RlclBlcm1pc3Npb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdChyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRBbGxJZHM6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0QWxsSWRzKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRJZHM6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0SWRzKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRTY2hlZHVsZWRJZHM6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0U2NoZWR1bGVkSWRzKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRUcmlnZ2VyZWRJZHM6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0VHJpZ2dlcmVkSWRzKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXQ6IGZ1bmN0aW9uIChpZHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXQoaWRzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0QWxsOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldEFsbChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0U2NoZWR1bGVkOiBmdW5jdGlvbiAoaWRzLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0U2NoZWR1bGVkKGlkcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEFsbFNjaGVkdWxlZDogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRBbGxTY2hlZHVsZWQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFRyaWdnZXJlZDogZnVuY3Rpb24gKGlkcywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldFRyaWdnZXJlZChpZHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRBbGxUcmlnZ2VyZWQ6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0QWxsVHJpZ2dlcmVkKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXREZWZhdWx0czogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldERlZmF1bHRzKCk7XG4gICAgICB9LFxuXG4gICAgICBzZXREZWZhdWx0czogZnVuY3Rpb24gKE9iamVjdCkge1xuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuc2V0RGVmYXVsdHMoT2JqZWN0KTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tbW1lZGlhLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLW1tZWRpYVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubU1lZGlhQWRzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTU1lZGlhQWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1tZWRpYVxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLW1lZGlhXG5cbi8qIGdsb2JhbHMgTWVkaWE6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5tZWRpYScsIFtdKVxuXG4uc2VydmljZSgnTmV3TWVkaWEnLCBbJyRxJywgJyRpbnRlcnZhbCcsIGZ1bmN0aW9uICgkcSwgJGludGVydmFsKSB7XG4gIHZhciBxLCBxMiwgcTMsIG1lZGlhU3RhdHVzID0gbnVsbCwgbWVkaWFQb3NpdGlvbiA9IC0xLCBtZWRpYVRpbWVyLCBtZWRpYUR1cmF0aW9uID0gLTE7XG5cbiAgZnVuY3Rpb24gc2V0VGltZXIobWVkaWEpIHtcbiAgICAgIGlmIChhbmd1bGFyLmlzRGVmaW5lZChtZWRpYVRpbWVyKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIG1lZGlhVGltZXIgPSAkaW50ZXJ2YWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlmIChtZWRpYUR1cmF0aW9uIDwgMCkge1xuICAgICAgICAgICAgICBtZWRpYUR1cmF0aW9uID0gbWVkaWEuZ2V0RHVyYXRpb24oKTtcbiAgICAgICAgICAgICAgaWYgKHEgJiYgbWVkaWFEdXJhdGlvbiA+IDApIHtcbiAgICAgICAgICAgICAgICBxLm5vdGlmeSh7ZHVyYXRpb246IG1lZGlhRHVyYXRpb259KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIG1lZGlhLmdldEN1cnJlbnRQb3NpdGlvbihcbiAgICAgICAgICAgIC8vIHN1Y2Nlc3MgY2FsbGJhY2tcbiAgICAgICAgICAgIGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICAgICAgICAgIGlmIChwb3NpdGlvbiA+IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lZGlhUG9zaXRpb24gPSBwb3NpdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLy8gZXJyb3IgY2FsbGJhY2tcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0Vycm9yIGdldHRpbmcgcG9zPScgKyBlKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKHEpIHtcbiAgICAgICAgICAgIHEubm90aWZ5KHtwb3NpdGlvbjogbWVkaWFQb3NpdGlvbn0pO1xuICAgICAgICAgIH1cblxuICAgICAgfSwgMTAwMCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclRpbWVyKCkge1xuICAgICAgaWYgKGFuZ3VsYXIuaXNEZWZpbmVkKG1lZGlhVGltZXIpKSB7XG4gICAgICAgICAgJGludGVydmFsLmNhbmNlbChtZWRpYVRpbWVyKTtcbiAgICAgICAgICBtZWRpYVRpbWVyID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzZXRWYWx1ZXMoKSB7XG4gICAgICBtZWRpYVBvc2l0aW9uID0gLTE7XG4gICAgICBtZWRpYUR1cmF0aW9uID0gLTE7XG4gIH1cblxuICBmdW5jdGlvbiBOZXdNZWRpYShzcmMpIHtcbiAgICAgIHRoaXMubWVkaWEgPSBuZXcgTWVkaWEoc3JjLFxuICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgY2xlYXJUaW1lcigpO1xuICAgICAgICAgICAgcmVzZXRWYWx1ZXMoKTtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVyKCk7XG4gICAgICAgICAgICByZXNldFZhbHVlcygpO1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAgICAgICBtZWRpYVN0YXR1cyA9IHN0YXR1cztcbiAgICAgICAgICAgIHEubm90aWZ5KHtzdGF0dXM6IG1lZGlhU3RhdHVzfSk7XG4gICAgICAgIH0pO1xuICB9XG5cbiAgLy8gaU9TIHF1aXJrcyA6XG4gIC8vIC0gIG15TWVkaWEucGxheSh7IG51bWJlck9mTG9vcHM6IDIgfSkgLT4gbG9vcGluZ1xuICAvLyAtICBteU1lZGlhLnBsYXkoeyBwbGF5QXVkaW9XaGVuU2NyZWVuSXNMb2NrZWQgOiBmYWxzZSB9KVxuICBOZXdNZWRpYS5wcm90b3R5cGUucGxheSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5tZWRpYS5wbGF5KG9wdGlvbnMpO1xuXG4gICAgICBzZXRUaW1lcih0aGlzLm1lZGlhKTtcblxuICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBjbGVhclRpbWVyKCk7XG4gICAgICB0aGlzLm1lZGlhLnBhdXNlKCk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnN0b3AgID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5tZWRpYS5zdG9wKCk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnJlbGVhc2UgID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5tZWRpYS5yZWxlYXNlKCk7XG4gICAgICB0aGlzLm1lZGlhID0gdW5kZWZpbmVkO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5zZWVrVG8gID0gZnVuY3Rpb24gKHRpbWluZykge1xuICAgICAgdGhpcy5tZWRpYS5zZWVrVG8odGltaW5nKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuc2V0Vm9sdW1lID0gZnVuY3Rpb24gKHZvbHVtZSkge1xuICAgICAgdGhpcy5tZWRpYS5zZXRWb2x1bWUodm9sdW1lKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuc3RhcnRSZWNvcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLm1lZGlhLnN0YXJ0UmVjb3JkKCk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnN0b3BSZWNvcmQgID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5tZWRpYS5zdG9wUmVjb3JkKCk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLmN1cnJlbnRUaW1lID0gZnVuY3Rpb24gKCkge1xuICAgICAgcTIgPSAkcS5kZWZlcigpO1xuICAgICAgdGhpcy5tZWRpYS5nZXRDdXJyZW50UG9zaXRpb24oZnVuY3Rpb24gKHBvc2l0aW9uKXtcbiAgICAgIHEyLnJlc29sdmUocG9zaXRpb24pO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcTIucHJvbWlzZTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcTMgPSAkcS5kZWZlcigpO1xuICAgIHRoaXMubWVkaWEuZ2V0RHVyYXRpb24oZnVuY3Rpb24gKGR1cmF0aW9uKXtcbiAgICBxMy5yZXNvbHZlKGR1cmF0aW9uKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcTMucHJvbWlzZTtcbiAgfTtcblxuICByZXR1cm4gTmV3TWVkaWE7XG5cbn1dKVxuLmZhY3RvcnkoJyRjb3Jkb3ZhTWVkaWEnLCBbJ05ld01lZGlhJywgZnVuY3Rpb24gKE5ld01lZGlhKSB7XG4gIHJldHVybiB7XG4gICAgICBuZXdNZWRpYTogZnVuY3Rpb24gKHNyYykge1xuICAgICAgICAgIHJldHVybiBuZXcgTmV3TWVkaWEoc3JjKTtcbiAgICAgIH1cbiAgfTtcbn1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLW1vYmZveC1wcm8uZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1tb2Jmb3gtcHJvXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5tb2Jmb3hBZHMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFNb2JGb3hBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucycsIFtcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmFjdGlvblNoZWV0JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmFkTW9iJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmFwcEF2YWlsYWJpbGl0eScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5hcHBSYXRlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmFwcFZlcnNpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFja2dyb3VuZEdlb2xvY2F0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJhZGdlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJhcmNvZGVTY2FubmVyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJhdHRlcnlTdGF0dXMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmVhY29uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJsZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5ibHVldG9vdGhTZXJpYWwnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYnJpZ2h0bmVzcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5jYWxlbmRhcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5jYW1lcmEnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FwdHVyZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5jbGlwYm9hcmQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuY29udGFjdHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZGF0ZVBpY2tlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2UnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlTW90aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZU9yaWVudGF0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmRpYWxvZ3MnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZW1haWxDb21wb3NlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5mYWNlYm9vaycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5mYWNlYm9va0FkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5maWxlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZpbGVUcmFuc2ZlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5maWxlT3BlbmVyMicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5mbGFzaGxpZ2h0JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZsdXJyeUFkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nYScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nZW9sb2NhdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nbG9iYWxpemF0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZUFkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVBbmFseXRpY3MnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlTWFwJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZVBsYXlHYW1lJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZVBsdXMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaGVhbHRoS2l0JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmh0dHBkJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmlBZCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5pbWFnZVBpY2tlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5pbkFwcEJyb3dzZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5zdGFncmFtJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmtleWJvYXJkJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmtleWNoYWluJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmxhdW5jaE5hdmlnYXRvcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5sb2NhbE5vdGlmaWNhdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5tZWRpYScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5tTWVkaWFBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubW9iZm94QWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm1vcHViQWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm5hdGl2ZUF1ZGlvJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm5ldHdvcmsnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucGluRGlhbG9nJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnByZWZlcmVuY2VzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnByaW50ZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucHJvZ3Jlc3NJbmRpY2F0b3InLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucHVzaCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5wdXNoX3Y1JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnNtcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zb2NpYWxTaGFyaW5nJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnNwaW5uZXJEaWFsb2cnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc3BsYXNoc2NyZWVuJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnNxbGl0ZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zdGF0dXNiYXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMudG9hc3QnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMudG91Y2hpZCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy52aWJyYXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMudmlkZW9DYXB0dXJlUGx1cycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy56aXAnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5zb21uaWEnXG5dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1tb3B1Yi5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1tb3B1YlxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubW9wdWJBZHMnLCBbXSlcbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTW9QdWJBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3NpZG5leXMvY29yZG92YS1wbHVnaW4tbmF0aXZlYXVkaW8uZ2l0XG4vLyBsaW5rICAgICAgOiBodHRwczovL2dpdGh1Yi5jb20vc2lkbmV5cy9jb3Jkb3ZhLXBsdWdpbi1uYXRpdmVhdWRpb1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubmF0aXZlQXVkaW8nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFOYXRpdmVBdWRpbycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHByZWxvYWRTaW1wbGU6IGZ1bmN0aW9uIChpZCwgYXNzZXRQYXRoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnByZWxvYWRTaW1wbGUoaWQsIGFzc2V0UGF0aCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZWxvYWRDb21wbGV4OiBmdW5jdGlvbiAoaWQsIGFzc2V0UGF0aCwgdm9sdW1lLCB2b2ljZXMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8ucHJlbG9hZENvbXBsZXgoaWQsIGFzc2V0UGF0aCwgdm9sdW1lLCB2b2ljZXMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwbGF5OiBmdW5jdGlvbiAoaWQsIGNvbXBsZXRlQ2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8ucGxheShpZCwgY29tcGxldGVDYWxsYmFjaywgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0b3A6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5zdG9wKGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGxvb3A6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5sb29wKGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5sb2FkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8udW5sb2FkKGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0Vm9sdW1lRm9yQ29tcGxleEFzc2V0OiBmdW5jdGlvbiAoaWQsIHZvbHVtZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5zZXRWb2x1bWVGb3JDb21wbGV4QXNzZXQoaWQsIHZvbHVtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLW5ldHdvcmstaW5mb3JtYXRpb25cbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1uZXR3b3JrLWluZm9ybWF0aW9uXG5cbi8qIGdsb2JhbHMgQ29ubmVjdGlvbjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm5ldHdvcmsnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFOZXR3b3JrJywgWyckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRyb290U2NvcGUsICR0aW1lb3V0KSB7XG5cbiAgICAvKipcbiAgICAgICogRmlyZXMgb2ZmbGluZSBhIGV2ZW50XG4gICAgICAqL1xuICAgIHZhciBvZmZsaW5lRXZlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbmV0d29ya1N0YXRlID0gbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZTtcbiAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YU5ldHdvcms6b2ZmbGluZScsIG5ldHdvcmtTdGF0ZSk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICAqIEZpcmVzIG9ubGluZSBhIGV2ZW50XG4gICAgICAqL1xuICAgIHZhciBvbmxpbmVFdmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBuZXR3b3JrU3RhdGUgPSBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlO1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTmV0d29yazpvbmxpbmUnLCBuZXR3b3JrU3RhdGUpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKG5hdmlnYXRvci5jb25uZWN0aW9uKSB7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCBvZmZsaW5lRXZlbnQsIGZhbHNlKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignb25saW5lJywgb25saW5lRXZlbnQsIGZhbHNlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXROZXR3b3JrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlO1xuICAgICAgfSxcblxuICAgICAgaXNPbmxpbmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG5ldHdvcmtTdGF0ZSA9IG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGU7XG4gICAgICAgIHJldHVybiBuZXR3b3JrU3RhdGUgIT09IENvbm5lY3Rpb24uVU5LTk9XTiAmJiBuZXR3b3JrU3RhdGUgIT09IENvbm5lY3Rpb24uTk9ORTtcbiAgICAgIH0sXG5cbiAgICAgIGlzT2ZmbGluZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbmV0d29ya1N0YXRlID0gbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZTtcbiAgICAgICAgcmV0dXJuIG5ldHdvcmtTdGF0ZSA9PT0gQ29ubmVjdGlvbi5VTktOT1dOIHx8IG5ldHdvcmtTdGF0ZSA9PT0gQ29ubmVjdGlvbi5OT05FO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJPZmZsaW5lV2F0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignb2ZmbGluZScsIG9mZmxpbmVFdmVudCk7XG4gICAgICAgICRyb290U2NvcGUuJCRsaXN0ZW5lcnNbJyRjb3Jkb3ZhTmV0d29yazpvZmZsaW5lJ10gPSBbXTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyT25saW5lV2F0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignb25saW5lJywgb25saW5lRXZlbnQpO1xuICAgICAgICAkcm9vdFNjb3BlLiQkbGlzdGVuZXJzWyckY29yZG92YU5ldHdvcms6b25saW5lJ10gPSBbXTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSlcbiAgLnJ1bihbJyRpbmplY3RvcicsIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAkaW5qZWN0b3IuZ2V0KCckY29yZG92YU5ldHdvcmsnKTsgLy9lbnN1cmUgdGhlIGZhY3RvcnkgYWx3YXlzIGdldHMgaW5pdGlhbGlzZWRcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vUGFsZG9tL1BpbkRpYWxvZy5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL1BhbGRvbS9QaW5EaWFsb2dcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnBpbkRpYWxvZycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVBpbkRpYWxvZycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHByb21wdDogZnVuY3Rpb24gKG1lc3NhZ2UsIHRpdGxlLCBidXR0b25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMucGluRGlhbG9nLnByb21wdChtZXNzYWdlLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgIH0sIHRpdGxlLCBidXR0b25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tYXBwLXByZWZlcmVuY2VzXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGxhL21lLmFwbGEuY29yZG92YS5hcHAtcHJlZmVyZW5jZXNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnByZWZlcmVuY2VzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUHJlZmVyZW5jZXMnLCBbJyR3aW5kb3cnLCAnJHEnLCBmdW5jdGlvbiAoJHdpbmRvdywgJHEpIHtcblxuICAgICByZXR1cm4ge1xuICAgICAgICAgXG4gICAgICAgICBwbHVnaW5Ob3RFbmFibGVkTWVzc2FnZTogJ1BsdWdpbiBub3QgZW5hYmxlZCcsXG4gICAgXHRcbiAgICBcdC8qKlxuICAgIFx0ICogRGVjb3JhdGUgdGhlIHByb21pc2Ugb2JqZWN0LlxuICAgIFx0ICogQHBhcmFtIHByb21pc2UgVGhlIHByb21pc2Ugb2JqZWN0LlxuICAgIFx0ICovXG4gICAgXHRkZWNvcmF0ZVByb21pc2U6IGZ1bmN0aW9uKHByb21pc2Upe1xuICAgIFx0XHRwcm9taXNlLnN1Y2Nlc3MgPSBmdW5jdGlvbihmbikge1xuXHQgICAgICAgICAgICBwcm9taXNlLnRoZW4oZm4pO1xuXHQgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcblx0ICAgICAgICB9O1xuXG5cdCAgICAgICAgcHJvbWlzZS5lcnJvciA9IGZ1bmN0aW9uKGZuKSB7XG5cdCAgICAgICAgICAgIHByb21pc2UudGhlbihudWxsLCBmbik7XG5cdCAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuXHQgICAgICAgIH07XG4gICAgXHR9LFxuICAgIFx0XG4gICAgXHQvKipcbiAgICBcdCAqIFN0b3JlIHRoZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gZGljdGlvbmFyeSBhbmQga2V5LlxuICAgIFx0ICogQHBhcmFtIGtleSBUaGUga2V5IG9mIHRoZSBwcmVmZXJlbmNlLlxuICAgIFx0ICogQHBhcmFtIHZhbHVlIFRoZSB2YWx1ZSB0byBzZXQuXG4gICAgICAgICAqIEBwYXJhbSBkaWN0IFRoZSBkaWN0aW9uYXJ5LiBJdCdzIG9wdGlvbmFsLlxuICAgICAgICAgKiBAcmV0dXJucyBSZXR1cm5zIGEgcHJvbWlzZS5cbiAgICBcdCAqL1xuXHQgICAgc3RvcmU6IGZ1bmN0aW9uKGtleSwgdmFsdWUsIGRpY3QpIHtcblx0ICAgIFx0dmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblx0ICAgIFx0dmFyIHByb21pc2UgPSBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBvayh2YWx1ZSl7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIGVycm9yQ2FsbGJhY2soZXJyb3Ipe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IoZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoJHdpbmRvdy5wbHVnaW5zKXtcbiAgICAgICAgICAgICAgICB2YXIgc3RvcmVSZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMyl7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JlUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLnN0b3JlKGRpY3QsIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JlUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLnN0b3JlKGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBzdG9yZVJlc3VsdC50aGVuKG9rLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcih0aGlzLnBsdWdpbk5vdEVuYWJsZWRNZXNzYWdlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcblx0ICAgIFx0dGhpcy5kZWNvcmF0ZVByb21pc2UocHJvbWlzZSk7XG5cdCAgICBcdHJldHVybiBwcm9taXNlO1xuXHQgICAgfSxcblx0ICAgIFxuXHQgICAgLyoqXG5cdCAgICAgKiBGZXRjaCB0aGUgdmFsdWUgYnkgdGhlIGdpdmVuIGRpY3Rpb25hcnkgYW5kIGtleS5cblx0ICAgICAqIEBwYXJhbSBrZXkgVGhlIGtleSBvZiB0aGUgcHJlZmVyZW5jZSB0byByZXRyaWV2ZS5cbiAgICAgICAgICogQHBhcmFtIGRpY3QgVGhlIGRpY3Rpb25hcnkuIEl0J3Mgb3B0aW9uYWwuXG4gICAgICAgICAqIEByZXR1cm5zIFJldHVybnMgYSBwcm9taXNlLlxuXHQgICAgICovXG5cdCAgICBmZXRjaDogZnVuY3Rpb24oa2V5LCBkaWN0KSB7XG5cdCAgICBcdHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG5cdCAgICBcdHZhciBwcm9taXNlID0gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gb2sodmFsdWUpe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBlcnJvckNhbGxiYWNrKGVycm9yKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKGVycm9yKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKCR3aW5kb3cucGx1Z2lucyl7XG4gICAgICAgICAgICAgICAgdmFyIGZldGNoUmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpe1xuICAgICAgICAgICAgICAgICAgICBmZXRjaFJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5mZXRjaChkaWN0LCBrZXkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZldGNoUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLmZldGNoKGtleSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZldGNoUmVzdWx0LnRoZW4ob2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKHRoaXMucGx1Z2luTm90RW5hYmxlZE1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuXHQgICAgXHR0aGlzLmRlY29yYXRlUHJvbWlzZShwcm9taXNlKTtcblx0ICAgIFx0cmV0dXJuIHByb21pc2U7XG5cdCAgICB9LFxuICAgICAgICBcbiAgICAgICAgLyoqXG5cdCAgICAgKiBSZW1vdmUgdGhlIHZhbHVlIGJ5IHRoZSBnaXZlbiBrZXkuXG5cdCAgICAgKiBAcGFyYW0ga2V5IFRoZSBrZXkgb2YgdGhlIHByZWZlcmVuY2UgdG8gcmV0cmlldmUuXG4gICAgICAgICAqIEBwYXJhbSBkaWN0IFRoZSBkaWN0aW9uYXJ5LiBJdCdzIG9wdGlvbmFsLlxuICAgICAgICAgKiBAcmV0dXJucyBSZXR1cm5zIGEgcHJvbWlzZS5cblx0ICAgICAqL1xuXHQgICAgcmVtb3ZlOiBmdW5jdGlvbihrZXksIGRpY3QpIHtcblx0ICAgIFx0dmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblx0ICAgIFx0dmFyIHByb21pc2UgPSBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBvayh2YWx1ZSl7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIGVycm9yQ2FsbGJhY2soZXJyb3Ipe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IoZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoJHdpbmRvdy5wbHVnaW5zKXtcbiAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpe1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMucmVtb3ZlKGRpY3QsIGtleSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLnJlbW92ZShrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZW1vdmVSZXN1bHQudGhlbihvaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IodGhpcy5wbHVnaW5Ob3RFbmFibGVkTWVzc2FnZSkpO1xuICAgICAgICAgICAgfVxuXHQgICAgXHRcblx0ICAgIFx0dGhpcy5kZWNvcmF0ZVByb21pc2UocHJvbWlzZSk7XG5cdCAgICBcdHJldHVybiBwcm9taXNlO1xuXHQgICAgfSxcbiAgICAgICAgXG4gICAgICAgIC8qKlxuXHQgICAgICogU2hvdyB0aGUgYXBwbGljYXRpb24gcHJlZmVyZW5jZXMuXG4gICAgICAgICAqIEByZXR1cm5zIFJldHVybnMgYSBwcm9taXNlLlxuXHQgICAgICovXG5cdCAgICBzaG93OiBmdW5jdGlvbigpIHtcblx0ICAgIFx0dmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblx0ICAgIFx0dmFyIHByb21pc2UgPSBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBvayh2YWx1ZSl7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIGVycm9yQ2FsbGJhY2soZXJyb3Ipe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IoZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoJHdpbmRvdy5wbHVnaW5zKXtcbiAgICAgICAgICAgICAgICAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMuc2hvdygpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKG9rLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcih0aGlzLnBsdWdpbk5vdEVuYWJsZWRNZXNzYWdlKSk7XG4gICAgICAgICAgICB9XG5cdCAgICBcdFxuXHQgICAgXHR0aGlzLmRlY29yYXRlUHJvbWlzZShwcm9taXNlKTtcblx0ICAgIFx0cmV0dXJuIHByb21pc2U7XG5cdCAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6IGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLXByaW50ZXIuZ2l0XG4vLyBsaW5rICAgICAgOiBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLXByaW50ZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnByaW50ZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFQcmludGVyJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaXNBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2luLnByaW50ZXIuaXNBdmFpbGFibGUoZnVuY3Rpb24gKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGlzQXZhaWxhYmxlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByaW50OiBmdW5jdGlvbiAoZG9jLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW4ucHJpbnRlci5wcmludChkb2MsIG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcGJlcm5hc2NvbmkvY29yZG92YS1wcm9ncmVzc0luZGljYXRvci5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cDovL3BiZXJuYXNjb25pLmdpdGh1Yi5pby9jb3Jkb3ZhLXByb2dyZXNzSW5kaWNhdG9yL1xuXG4vKiBnbG9iYWxzIFByb2dyZXNzSW5kaWNhdG9yOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucHJvZ3Jlc3NJbmRpY2F0b3InLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFQcm9ncmVzcycsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hvdzogZnVuY3Rpb24gKF9tZXNzYWdlKSB7XG4gICAgICAgIHZhciBtZXNzYWdlID0gX21lc3NhZ2UgfHwgJ1BsZWFzZSB3YWl0Li4uJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3cobWVzc2FnZSk7XG4gICAgICB9LFxuXG4gICAgICBzaG93U2ltcGxlOiBmdW5jdGlvbiAoX2RpbSkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dTaW1wbGUoZGltKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTaW1wbGVXaXRoTGFiZWw6IGZ1bmN0aW9uIChfZGltLCBfbGFiZWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnTG9hZGluZy4uLic7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93U2ltcGxlV2l0aExhYmVsKGRpbSwgbGFiZWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd1NpbXBsZVdpdGhMYWJlbERldGFpbDogZnVuY3Rpb24gKF9kaW0sIF9sYWJlbCwgX2RldGFpbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdMb2FkaW5nLi4uJztcbiAgICAgICAgdmFyIGRldGFpbCA9IF9kZXRhaWwgfHwgJ1BsZWFzZSB3YWl0JztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dTaW1wbGVXaXRoTGFiZWxEZXRhaWwoZGltLCBsYWJlbCwgZGV0YWlsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dEZXRlcm1pbmF0ZTogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0KSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0RldGVybWluYXRlKGRpbSwgdGltZW91dCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93RGV0ZXJtaW5hdGVXaXRoTGFiZWw6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCwgX2xhYmVsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ0xvYWRpbmcuLi4nO1xuXG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93RGV0ZXJtaW5hdGVXaXRoTGFiZWwoZGltLCB0aW1lb3V0LCBsYWJlbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93QW5udWxhcjogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0KSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0FubnVsYXIoZGltLCB0aW1lb3V0KTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dBbm51bGFyV2l0aExhYmVsOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQsIF9sYWJlbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdMb2FkaW5nLi4uJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dBbm51bGFyV2l0aExhYmVsKGRpbSwgdGltZW91dCwgbGFiZWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0JhcjogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0KSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0JhcihkaW0sIHRpbWVvdXQpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0JhcldpdGhMYWJlbDogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0LCBfbGFiZWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnTG9hZGluZy4uLic7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93QmFyV2l0aExhYmVsKGRpbSwgdGltZW91dCwgbGFiZWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd1N1Y2Nlc3M6IGZ1bmN0aW9uIChfZGltLCBfbGFiZWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnU3VjY2Vzcyc7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93U3VjY2VzcyhkaW0sIGxhYmVsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dUZXh0OiBmdW5jdGlvbiAoX2RpbSwgX3RleHQsIF9wb3NpdGlvbikge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRleHQgPSBfdGV4dCB8fCAnV2FybmluZyc7XG4gICAgICAgIHZhciBwb3NpdGlvbiA9IF9wb3NpdGlvbiB8fCAnY2VudGVyJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dUZXh0KGRpbSwgdGV4dCwgcG9zaXRpb24pO1xuICAgICAgfSxcblxuICAgICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3IuaGlkZSgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAtYnVpbGQvUHVzaFBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwLWJ1aWxkL1B1c2hQbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnB1c2gnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFQdXNoJywgWyckcScsICckd2luZG93JywgJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3csICRyb290U2NvcGUsICR0aW1lb3V0KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgb25Ob3RpZmljYXRpb246IGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFQdXNoOm5vdGlmaWNhdGlvblJlY2VpdmVkJywgbm90aWZpY2F0aW9uKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICByZWdpc3RlcjogZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBpbmplY3RvcjtcbiAgICAgICAgaWYgKGNvbmZpZyAhPT0gdW5kZWZpbmVkICYmIGNvbmZpZy5lY2IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmctYXBwXScpID09PSBudWxsKSB7XG4gICAgICAgICAgICBpbmplY3RvciA9ICdkb2N1bWVudC5ib2R5JztcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpbmplY3RvciA9ICdkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxcJ1tuZy1hcHBdXFwnKSc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbmZpZy5lY2IgPSAnYW5ndWxhci5lbGVtZW50KCcgKyBpbmplY3RvciArICcpLmluamVjdG9yKCkuZ2V0KFxcJyRjb3Jkb3ZhUHVzaFxcJykub25Ob3RpZmljYXRpb24nO1xuICAgICAgICB9XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnB1c2hOb3RpZmljYXRpb24ucmVnaXN0ZXIoZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRva2VuKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBjb25maWcpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bnJlZ2lzdGVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5wdXNoTm90aWZpY2F0aW9uLnVucmVnaXN0ZXIoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvLyBpT1Mgb25seVxuICAgICAgc2V0QmFkZ2VOdW1iZXI6IGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMucHVzaE5vdGlmaWNhdGlvbi5zZXRBcHBsaWNhdGlvbkljb25CYWRnZU51bWJlcihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgbnVtYmVyKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgcGhvbmVnYXAtcGx1Z2luLXB1c2hcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1wdXNoXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5wdXNoX3Y1JywgW10pXG4gIC5mYWN0b3J5KCckY29yZG92YVB1c2hWNScsWyckcScsICckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRxLCAkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuICAgLypnbG9iYWwgUHVzaE5vdGlmaWNhdGlvbiovXG5cbiAgICB2YXIgcHVzaDtcbiAgICByZXR1cm4ge1xuICAgICAgaW5pdGlhbGl6ZSA6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgcHVzaCA9IFB1c2hOb3RpZmljYXRpb24uaW5pdChvcHRpb25zKTtcbiAgICAgICAgcS5yZXNvbHZlKHB1c2gpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIG9uTm90aWZpY2F0aW9uIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcHVzaC5vbignbm90aWZpY2F0aW9uJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kZW1pdCgnJGNvcmRvdmFQdXNoVjU6bm90aWZpY2F0aW9uUmVjZWl2ZWQnLCBub3RpZmljYXRpb24pO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBvbkVycm9yIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcHVzaC5vbignZXJyb3InLCBmdW5jdGlvbiAoZXJyb3IpIHsgJHJvb3RTY29wZS4kZW1pdCgnJGNvcmRvdmFQdXNoVjU6ZXJyb3JPY2N1cnJlZCcsIGVycm9yKTt9KTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgcmVnaXN0ZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgaWYgKHB1c2ggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHEucmVqZWN0KG5ldyBFcnJvcignaW5pdCBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgYW55IG90aGVyIG9wZXJhdGlvbicpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoLm9uKCdyZWdpc3RyYXRpb24nLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgdW5yZWdpc3RlciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBpZiAocHVzaCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcS5yZWplY3QobmV3IEVycm9yKCdpbml0IG11c3QgYmUgY2FsbGVkIGJlZm9yZSBhbnkgb3RoZXIgb3BlcmF0aW9uJykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2gudW5yZWdpc3RlcihmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzZXRCYWRnZU51bWJlciA6IGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBpZiAocHVzaCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcS5yZWplY3QobmV3IEVycm9yKCdpbml0IG11c3QgYmUgY2FsbGVkIGJlZm9yZSBhbnkgb3RoZXIgb3BlcmF0aW9uJykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2guc2V0QXBwbGljYXRpb25JY29uQmFkZ2VOdW1iZXIoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LCBudW1iZXIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9naXRhd2Vnby9jb3Jkb3ZhLXNjcmVlbnNob3QuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2dpdGF3ZWdvL2NvcmRvdmEtc2NyZWVuc2hvdFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc2NyZWVuc2hvdCcsIFtdKVxuLmZhY3RvcnkoJyRjb3Jkb3ZhU2NyZWVuc2hvdCcsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcbiAgcmV0dXJuIHtcbiAgICBjYXB0dXJlVG9GaWxlOiBmdW5jdGlvbiAob3B0cykge1xuXG4gICAgICB2YXIgb3B0aW9ucyA9IG9wdHMgfHwge307XG5cbiAgICAgIHZhciBleHRlbnNpb24gPSBvcHRpb25zLmV4dGVuc2lvbiB8fCAnanBnJztcbiAgICAgIHZhciBxdWFsaXR5ID0gb3B0aW9ucy5xdWFsaXR5IHx8ICcxMDAnO1xuXG4gICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpO1xuXG4gICAgICBpZiAoIW5hdmlnYXRvci5zY3JlZW5zaG90KSB7XG4gICAgICAgIGRlZmVyLnJlc29sdmUobnVsbCk7XG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgICBuYXZpZ2F0b3Iuc2NyZWVuc2hvdC5zYXZlKGZ1bmN0aW9uIChlcnJvciwgcmVzKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgIGRlZmVyLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVmZXIucmVzb2x2ZShyZXMuZmlsZVBhdGgpO1xuICAgICAgICB9XG4gICAgICB9LCBleHRlbnNpb24sIHF1YWxpdHksIG9wdGlvbnMuZmlsZW5hbWUpO1xuXG4gICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICB9LFxuICAgIGNhcHR1cmVUb1VyaTogZnVuY3Rpb24gKG9wdHMpIHtcblxuICAgICAgdmFyIG9wdGlvbnMgPSBvcHRzIHx8IHt9O1xuXG4gICAgICB2YXIgZXh0ZW5zaW9uID0gb3B0aW9ucy5leHRlbnNpb24gfHwgJ2pwZyc7XG4gICAgICB2YXIgcXVhbGl0eSA9IG9wdGlvbnMucXVhbGl0eSB8fCAnMTAwJztcblxuICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKTtcblxuICAgICAgaWYgKCFuYXZpZ2F0b3Iuc2NyZWVuc2hvdCkge1xuICAgICAgICBkZWZlci5yZXNvbHZlKG51bGwpO1xuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH1cblxuICAgICAgbmF2aWdhdG9yLnNjcmVlbnNob3QuVVJJKGZ1bmN0aW9uIChlcnJvciwgcmVzKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgIGRlZmVyLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVmZXIucmVzb2x2ZShyZXMuVVJJKTtcbiAgICAgICAgfVxuICAgICAgfSwgZXh0ZW5zaW9uLCBxdWFsaXR5LCBvcHRpb25zLmZpbGVuYW1lKTtcblxuICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgfVxuICB9O1xufV0pO1xuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2NvcmRvdmEtc21zL2NvcmRvdmEtc21zLXBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2NvcmRvdmEtc21zL2NvcmRvdmEtc21zLXBsdWdpblxuXG4vKiBnbG9iYWxzIHNtczogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNtcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVNtcycsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZW5kOiBmdW5jdGlvbiAobnVtYmVyLCBtZXNzYWdlLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc21zLnNlbmQobnVtYmVyLCBtZXNzYWdlLCBvcHRpb25zLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1NvY2lhbFNoYXJpbmctUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vU29jaWFsU2hhcmluZy1QaG9uZUdhcC1QbHVnaW5cblxuLy8gTk9URTogc2hhcmVWaWFFbWFpbCAtPiBpZiB1c2VyIGNhbmNlbHMgc2hhcmluZyBlbWFpbCwgc3VjY2VzcyBpcyBzdGlsbCBjYWxsZWRcbi8vIFRPRE86IGFkZCBzdXBwb3J0IGZvciBpUGFkXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zb2NpYWxTaGFyaW5nJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhU29jaWFsU2hhcmluZycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNoYXJlOiBmdW5jdGlvbiAobWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHN1YmplY3QgPSBzdWJqZWN0IHx8IG51bGw7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlKG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmssIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFUd2l0dGVyOiBmdW5jdGlvbiAobWVzc2FnZSwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhVHdpdHRlcihtZXNzYWdlLCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhV2hhdHNBcHA6IGZ1bmN0aW9uIChtZXNzYWdlLCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFXaGF0c0FwcChtZXNzYWdlLCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhRmFjZWJvb2s6IGZ1bmN0aW9uIChtZXNzYWdlLCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbWVzc2FnZSA9IG1lc3NhZ2UgfHwgbnVsbDtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFGYWNlYm9vayhtZXNzYWdlLCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhRmFjZWJvb2tXaXRoUGFzdGVNZXNzYWdlSGludDogZnVuY3Rpb24gKG1lc3NhZ2UsIGZpbGUsIGxpbmssIHBhc3RlTWVzc2FnZUhpbnQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYUZhY2Vib29rV2l0aFBhc3RlTWVzc2FnZUhpbnQobWVzc2FnZSwgZmlsZSwgbGluaywgcGFzdGVNZXNzYWdlSGludCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYVNNUzogZnVuY3Rpb24gKG1lc3NhZ2UsIGNvbW1hU2VwYXJhdGVkUGhvbmVOdW1iZXJzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFTTVMobWVzc2FnZSwgY29tbWFTZXBhcmF0ZWRQaG9uZU51bWJlcnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFFbWFpbDogZnVuY3Rpb24gKG1lc3NhZ2UsIHN1YmplY3QsIHRvQXJyLCBjY0FyciwgYmNjQXJyLCBmaWxlQXJyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdG9BcnIgPSB0b0FyciB8fCBudWxsO1xuICAgICAgICBjY0FyciA9IGNjQXJyIHx8IG51bGw7XG4gICAgICAgIGJjY0FyciA9IGJjY0FyciB8fCBudWxsO1xuICAgICAgICBmaWxlQXJyID0gZmlsZUFyciB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYUVtYWlsKG1lc3NhZ2UsIHN1YmplY3QsIHRvQXJyLCBjY0FyciwgYmNjQXJyLCBmaWxlQXJyLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhOiBmdW5jdGlvbiAodmlhLCBtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbWVzc2FnZSA9IG1lc3NhZ2UgfHwgbnVsbDtcbiAgICAgICAgc3ViamVjdCA9IHN1YmplY3QgfHwgbnVsbDtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWEodmlhLCBtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNhblNoYXJlVmlhRW1haWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5jYW5TaGFyZVZpYUVtYWlsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2FuU2hhcmVWaWE6IGZ1bmN0aW9uICh2aWEsIG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5jYW5TaGFyZVZpYSh2aWEsIG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmssIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5hdmFpbGFibGUoZnVuY3Rpb24gKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgaWYgKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9QYWxkb20vU3Bpbm5lckRpYWxvZy5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9QYWxkb20vU3Bpbm5lckRpYWxvZ1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc3Bpbm5lckRpYWxvZycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVNwaW5uZXJEaWFsb2cnLCBbJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3c6IGZ1bmN0aW9uICh0aXRsZSwgbWVzc2FnZSwgZml4ZWQpIHtcbiAgICAgICAgZml4ZWQgPSBmaXhlZCB8fCBmYWxzZTtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2lucy5zcGlubmVyRGlhbG9nLnNob3codGl0bGUsIG1lc3NhZ2UsIGZpeGVkKTtcbiAgICAgIH0sXG4gICAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbnMuc3Bpbm5lckRpYWxvZy5oaWRlKCk7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLXNwbGFzaHNjcmVlblxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLXNwbGFzaHNjcmVlblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc3BsYXNoc2NyZWVuJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhU3BsYXNoc2NyZWVuJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iuc3BsYXNoc2NyZWVuLmhpZGUoKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5zcGxhc2hzY3JlZW4uc2hvdygpO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vbGl0ZWhlbHBlcnMvQ29yZG92YS1zcWxpdGUtc3RvcmFnZS5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2xpdGVoZWxwZXJzL0NvcmRvdmEtc3FsaXRlLXN0b3JhZ2VcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNxbGl0ZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVNRTGl0ZScsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG9wZW5EQjogZnVuY3Rpb24gKG9wdGlvbnMsIGJhY2tncm91bmQpIHtcblxuICAgICAgICBpZiAoYW5ndWxhci5pc09iamVjdChvcHRpb25zKSAmJiAhYW5ndWxhci5pc1N0cmluZyhvcHRpb25zKSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgYmFja2dyb3VuZCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdGlvbnMuYmdUeXBlID0gYmFja2dyb3VuZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuICR3aW5kb3cuc3FsaXRlUGx1Z2luLm9wZW5EYXRhYmFzZShvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAkd2luZG93LnNxbGl0ZVBsdWdpbi5vcGVuRGF0YWJhc2Uoe1xuICAgICAgICAgIG5hbWU6IG9wdGlvbnMsXG4gICAgICAgICAgYmdUeXBlOiBiYWNrZ3JvdW5kXG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgZXhlY3V0ZTogZnVuY3Rpb24gKGRiLCBxdWVyeSwgYmluZGluZykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0eCkge1xuICAgICAgICAgIHR4LmV4ZWN1dGVTcWwocXVlcnksIGJpbmRpbmcsIGZ1bmN0aW9uICh0eCwgcmVzdWx0KSB7XG4gICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uICh0cmFuc2FjdGlvbiwgZXJyb3IpIHtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaW5zZXJ0Q29sbGVjdGlvbjogZnVuY3Rpb24gKGRiLCBxdWVyeSwgYmluZGluZ3MpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgY29sbCA9IGJpbmRpbmdzLnNsaWNlKDApOyAvLyBjbG9uZSBjb2xsZWN0aW9uXG5cbiAgICAgICAgZGIudHJhbnNhY3Rpb24oZnVuY3Rpb24gKHR4KSB7XG4gICAgICAgICAgKGZ1bmN0aW9uIGluc2VydE9uZSgpIHtcbiAgICAgICAgICAgIHZhciByZWNvcmQgPSBjb2xsLnNwbGljZSgwLCAxKVswXTsgLy8gZ2V0IHRoZSBmaXJzdCByZWNvcmQgb2YgY29sbCBhbmQgcmVkdWNlIGNvbGwgYnkgb25lXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICB0eC5leGVjdXRlU3FsKHF1ZXJ5LCByZWNvcmQsIGZ1bmN0aW9uICh0eCwgcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgaW5zZXJ0T25lKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodHJhbnNhY3Rpb24sIGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXhjZXB0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIG5lc3RlZEV4ZWN1dGU6IGZ1bmN0aW9uIChkYiwgcXVlcnkxLCBxdWVyeTIsIGJpbmRpbmcxLCBiaW5kaW5nMikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZGIudHJhbnNhY3Rpb24oZnVuY3Rpb24gKHR4KSB7XG4gICAgICAgICAgICB0eC5leGVjdXRlU3FsKHF1ZXJ5MSwgYmluZGluZzEsIGZ1bmN0aW9uICh0eCwgcmVzdWx0KSB7XG4gICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICB0eC5leGVjdXRlU3FsKHF1ZXJ5MiwgYmluZGluZzIsIGZ1bmN0aW9uICh0eCwgcmVzKSB7XG4gICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAodHJhbnNhY3Rpb24sIGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRlbGV0ZURCOiBmdW5jdGlvbiAoZGJOYW1lKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnNxbGl0ZVBsdWdpbi5kZWxldGVEYXRhYmFzZShkYk5hbWUsIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1zdGF0dXNiYXJcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1zdGF0dXNiYXJcblxuLyogZ2xvYmFscyBTdGF0dXNCYXI6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zdGF0dXNiYXInLCBbXSlcblxuLmZhY3RvcnkoJyRjb3Jkb3ZhU3RhdHVzYmFyJywgW2Z1bmN0aW9uICgpIHtcblxuICByZXR1cm4ge1xuXG4gICAgLyoqXG4gICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gYm9vbFxuICAgICAgKi9cbiAgICBvdmVybGF5c1dlYlZpZXc6IGZ1bmN0aW9uIChib29sKSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLm92ZXJsYXlzV2ViVmlldyghIWJvb2wpO1xuICAgIH0sXG5cbiAgICBTVFlMRVM6IHtcbiAgICAgIERFRkFVTFQ6IDAsXG4gICAgICBMSUdIVF9DT05URU5UOiAxLFxuICAgICAgQkxBQ0tfVFJBTlNMVUNFTlQ6IDIsXG4gICAgICBCTEFDS19PUEFRVUU6IDNcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzdHlsZVxuICAgICAgKi9cbiAgICBzdHlsZTogZnVuY3Rpb24gKHN0eWxlKSB7XG4gICAgICBzd2l0Y2ggKHN0eWxlKSB7XG4gICAgICAgIC8vIERlZmF1bHRcbiAgICAgICAgY2FzZSAwOlxuICAgICAgICByZXR1cm4gU3RhdHVzQmFyLnN0eWxlRGVmYXVsdCgpO1xuXG4gICAgICAgIC8vIExpZ2h0Q29udGVudFxuICAgICAgICBjYXNlIDE6XG4gICAgICAgIHJldHVybiBTdGF0dXNCYXIuc3R5bGVMaWdodENvbnRlbnQoKTtcblxuICAgICAgICAvLyBCbGFja1RyYW5zbHVjZW50XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zdHlsZUJsYWNrVHJhbnNsdWNlbnQoKTtcblxuICAgICAgICAvLyBCbGFja09wYXF1ZVxuICAgICAgICBjYXNlIDM6XG4gICAgICAgIHJldHVybiBTdGF0dXNCYXIuc3R5bGVCbGFja09wYXF1ZSgpO1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBTdGF0dXNCYXIuc3R5bGVEZWZhdWx0KCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIHN1cHBvcnRlZCBuYW1lczpcbiAgICAvLyBibGFjaywgZGFya0dyYXksIGxpZ2h0R3JheSwgd2hpdGUsIGdyYXksIHJlZCwgZ3JlZW4sXG4gICAgLy8gYmx1ZSwgY3lhbiwgeWVsbG93LCBtYWdlbnRhLCBvcmFuZ2UsIHB1cnBsZSwgYnJvd25cbiAgICBzdHlsZUNvbG9yOiBmdW5jdGlvbiAoY29sb3IpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIuYmFja2dyb3VuZENvbG9yQnlOYW1lKGNvbG9yKTtcbiAgICB9LFxuXG4gICAgc3R5bGVIZXg6IGZ1bmN0aW9uIChjb2xvckhleCkge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5iYWNrZ3JvdW5kQ29sb3JCeUhleFN0cmluZyhjb2xvckhleCk7XG4gICAgfSxcblxuICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIuaGlkZSgpO1xuICAgIH0sXG5cbiAgICBzaG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLnNob3coKTtcbiAgICB9LFxuXG4gICAgaXNWaXNpYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLmlzVmlzaWJsZTtcbiAgICB9XG4gIH07XG59XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9Ub2FzdC1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9Ub2FzdC1QaG9uZUdhcC1QbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnRvYXN0JywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhVG9hc3QnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzaG93U2hvcnRUb3A6IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dTaG9ydFRvcChtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd1Nob3J0Q2VudGVyOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93U2hvcnRDZW50ZXIobWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTaG9ydEJvdHRvbTogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd1Nob3J0Qm90dG9tKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93TG9uZ1RvcDogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd0xvbmdUb3AobWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dMb25nQ2VudGVyOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93TG9uZ0NlbnRlcihtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0xvbmdCb3R0b206IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dMb25nQm90dG9tKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93OiBmdW5jdGlvbiAobWVzc2FnZSwgZHVyYXRpb24sIHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3cobWVzc2FnZSwgZHVyYXRpb24sIHBvc2l0aW9uLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LmhpZGUoKTtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvciAmJiBlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vbGVlY3Jvc3NsZXkvY29yZG92YS1wbHVnaW4tdG91Y2hpZC5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2xlZWNyb3NzbGV5L2NvcmRvdmEtcGx1Z2luLXRvdWNoaWRcblxuLyogZ2xvYmFscyB0b3VjaGlkOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMudG91Y2hpZCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVRvdWNoSUQnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY2hlY2tTdXBwb3J0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGlmICghd2luZG93LmNvcmRvdmEpIHtcbiAgICAgICAgICBkZWZlci5yZWplY3QoJ05vdCBzdXBwb3J0ZWQgd2l0aG91dCBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdG91Y2hpZC5jaGVja1N1cHBvcnQoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBkZWZlci5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYXV0aGVudGljYXRlOiBmdW5jdGlvbiAoYXV0aFJlYXNvblRleHQpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKTtcbiAgICAgICAgaWYgKCF3aW5kb3cuY29yZG92YSkge1xuICAgICAgICAgIGRlZmVyLnJlamVjdCgnTm90IHN1cHBvcnRlZCB3aXRob3V0IGNvcmRvdmEuanMnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0b3VjaGlkLmF1dGhlbnRpY2F0ZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sIGF1dGhSZWFzb25UZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Flcm9nZWFyL2Flcm9nZWFyLWNvcmRvdmEtcHVzaC5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Flcm9nZWFyL2Flcm9nZWFyLWNvcmRvdmEtcHVzaFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMudXBzUHVzaCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVVwc1B1c2gnLCBbJyRxJywgJyR3aW5kb3cnLCAnJHJvb3RTY29wZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdywgJHJvb3RTY29wZSwgJHRpbWVvdXQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVnaXN0ZXI6IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucHVzaC5yZWdpc3RlcihmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YVVwc1B1c2g6bm90aWZpY2F0aW9uUmVjZWl2ZWQnLCBub3RpZmljYXRpb24pO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgY29uZmlnKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5yZWdpc3RlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnB1c2gudW5yZWdpc3RlcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIGlPUyBvbmx5XG4gICAgICBzZXRCYWRnZU51bWJlcjogZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucHVzaC5zZXRBcHBsaWNhdGlvbkljb25CYWRnZU51bWJlcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIG51bWJlcik7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi12aWJyYXRpb25cbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi12aWJyYXRpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnZpYnJhdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVZpYnJhdGlvbicsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlicmF0ZTogZnVuY3Rpb24gKHRpbWVzKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLnZpYnJhdGUodGltZXMpO1xuICAgICAgfSxcbiAgICAgIHZpYnJhdGVXaXRoUGF0dGVybjogZnVuY3Rpb24gKHBhdHRlcm4sIHJlcGVhdCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi52aWJyYXRlV2l0aFBhdHRlcm4ocGF0dGVybiwgcmVwZWF0KTtcbiAgICAgIH0sXG4gICAgICBjYW5jZWxWaWJyYXRpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5ub3RpZmljYXRpb24uY2FuY2VsVmlicmF0aW9uKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1ZpZGVvQ2FwdHVyZVBsdXMtUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1ZpZGVvQ2FwdHVyZVBsdXMtUGhvbmVHYXAtUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy52aWRlb0NhcHR1cmVQbHVzJywgW10pXG5cbiAgLnByb3ZpZGVyKCckY29yZG92YVZpZGVvQ2FwdHVyZVBsdXMnLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIGRlZmF1bHRPcHRpb25zID0ge307XG5cblxuICAgIC8qKlxuICAgICAqIHRoZSBuciBvZiB2aWRlb3MgdG8gcmVjb3JkLCBkZWZhdWx0IDEgKG9uIGlPUyBhbHdheXMgMSlcbiAgICAgKlxuICAgICAqIEBwYXJhbSBsaW1pdFxuICAgICAqL1xuICAgIHRoaXMuc2V0TGltaXQgPSBmdW5jdGlvbiBzZXRMaW1pdChsaW1pdCkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBtYXggZHVyYXRpb24gaW4gc2Vjb25kcywgZGVmYXVsdCAwLCB3aGljaCBpcyAnZm9yZXZlcidcbiAgICAgKlxuICAgICAqIEBwYXJhbSBzZWNvbmRzXG4gICAgICovXG4gICAgdGhpcy5zZXRNYXhEdXJhdGlvbiA9IGZ1bmN0aW9uIHNldE1heER1cmF0aW9uKHNlY29uZHMpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLmR1cmF0aW9uID0gc2Vjb25kcztcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBzZXQgdG8gdHJ1ZSB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBsb3cgcXVhbGl0eSBzZXR0aW5nXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGhpZ2hxdWFsaXR5XG4gICAgICovXG4gICAgdGhpcy5zZXRIaWdoUXVhbGl0eSA9IGZ1bmN0aW9uIHNldEhpZ2hRdWFsaXR5KGhpZ2hxdWFsaXR5KSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5oaWdocXVhbGl0eSA9IGhpZ2hxdWFsaXR5O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiB5b3UnbGwgd2FudCB0byBzbmlmZiB0aGUgdXNlci1BZ2VudC9kZXZpY2UgYW5kIHBhc3MgdGhlIGJlc3Qgb3ZlcmxheSBiYXNlZCBvbiB0aGF0Li5cbiAgICAgKiBzZXQgdG8gdHJ1ZSB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBiYWNrZmFjaW5nIGNhbWVyYSBzZXR0aW5nLiBpT1M6IHdvcmtzIGZpbmUsIEFuZHJvaWQ6IFlNTVYgKCMxOClcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZnJvbnRjYW1lcmFcbiAgICAgKi9cbiAgICB0aGlzLnVzZUZyb250Q2FtZXJhID0gZnVuY3Rpb24gdXNlRnJvbnRDYW1lcmEoZnJvbnRjYW1lcmEpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLmZyb250Y2FtZXJhID0gZnJvbnRjYW1lcmE7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogcHV0IHRoZSBwbmcgaW4geW91ciB3d3cgZm9sZGVyXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW1hZ2VVcmxcbiAgICAgKi9cbiAgICB0aGlzLnNldFBvcnRyYWl0T3ZlcmxheSA9IGZ1bmN0aW9uIHNldFBvcnRyYWl0T3ZlcmxheShpbWFnZVVybCkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMucG9ydHJhaXRPdmVybGF5ID0gaW1hZ2VVcmw7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW1hZ2VVcmxcbiAgICAgKi9cbiAgICB0aGlzLnNldExhbmRzY2FwZU92ZXJsYXkgPSBmdW5jdGlvbiBzZXRMYW5kc2NhcGVPdmVybGF5KGltYWdlVXJsKSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5sYW5kc2NhcGVPdmVybGF5ID0gaW1hZ2VVcmw7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogaU9TIG9ubHlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB0ZXh0XG4gICAgICovXG4gICAgdGhpcy5zZXRPdmVybGF5VGV4dCA9IGZ1bmN0aW9uIHNldE92ZXJsYXlUZXh0KHRleHQpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLm92ZXJsYXlUZXh0ID0gdGV4dDtcbiAgICB9O1xuXG5cbiAgICB0aGlzLiRnZXQgPSBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNhcHR1cmVWaWRlbzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoISR3aW5kb3cucGx1Z2lucy52aWRlb2NhcHR1cmVwbHVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgICR3aW5kb3cucGx1Z2lucy52aWRlb2NhcHR1cmVwbHVzLmNhcHR1cmVWaWRlbyhxLnJlc29sdmUsIHEucmVqZWN0LFxuICAgICAgICAgICAgYW5ndWxhci5leHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vTW9iaWxlQ2hyb21lQXBwcy96aXAuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vTW9iaWxlQ2hyb21lQXBwcy96aXBcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnppcCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVppcCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHVuemlwOiBmdW5jdGlvbiAoc291cmNlLCBkZXN0aW5hdGlvbikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy56aXAudW56aXAoc291cmNlLCBkZXN0aW5hdGlvbiwgZnVuY3Rpb24gKGlzRXJyb3IpIHtcbiAgICAgICAgICBpZiAoaXNFcnJvciA9PT0gMCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAocHJvZ3Jlc3NFdmVudCkge1xuICAgICAgICAgIHEubm90aWZ5KHByb2dyZXNzRXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxufSkoKTsiXX0=
