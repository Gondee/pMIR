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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJXV1cvanMvbm9kZVNlcnZpY2VzLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvY2hvbGVza3kuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9ldmQuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9sdS5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RjL3FyLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvc3ZkLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RlY29tcG9zaXRpb25zLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9tYXRyaXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL25vZGVfbW9kdWxlcy9tbC1zdGF0L2FycmF5LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9ub2RlX21vZHVsZXMvbWwtc3RhdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wY2Evbm9kZV9tb2R1bGVzL21sLXN0YXQvbWF0cml4LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL3NyYy9wY2EuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL29wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy91dGlscy5qcyIsIm5vZGVfbW9kdWxlcy9uZy1jb3Jkb3ZhL2Rpc3QvbmctY29yZG92YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbHZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ253QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pnQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUM5MENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeGdCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBsaWJfY29yZG92YSA9IHJlcXVpcmUoJ25nLWNvcmRvdmEnKTtcclxuXHJcbi8vVGhpcyBmaWxlIGluY2x1ZGVzIHNlcnZpY2VzIHdoaWNoIHJlbHkgb24gbm9kZSBwdWJsaWMgbW9kdWxlcy5cclxuYW5ndWxhci5tb2R1bGUoJ2FwcC5ub2RlU2VydmljZXMnLCBbJ2lvbmljJywgJ25nQ29yZG92YSddKVxyXG5cclxuLnNlcnZpY2UoJ2NoZW1vJywgZnVuY3Rpb24gKGRhdGFiYXNlKSB7XHJcblxyXG4gICAgdmFyIGxpYl9wbHMgPSByZXF1aXJlKCdtbC1wbHMnKTtcclxuICAgIHZhciBsaWJfcGNhID0gcmVxdWlyZSgnbWwtcGNhJyk7XHJcbiAgICB2YXIgbGliX21hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xyXG5cclxuICAgIHZhciBjaGVtb0lzUGxzO1xyXG4gICAgdmFyIGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucyA9IFtdO1xyXG4gICAgdmFyIGNoZW1vUENBQ29tcHJlc3NlZCA9IFtdO1xyXG4gICAgdmFyIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IDA7XHJcbiAgICB2YXIgY2hlbW9Jc1RyYWluZWQgPSBmYWxzZTtcclxuICAgIHZhciBjaGVtb1NhbXBsZU5hbWVzID0gW107XHJcbiAgICAvL3JlcHJlc2VudHMgYSBQbHMgb3IgUENBIG1vZHVsZS5cclxuICAgIHZhciBjaGVtb0FsZ287XHJcblxyXG4gICAgdmFyIGNoZW1vRmxhZ3MgPSB7XHJcbiAgICAgICAgc3VjY2VzczogMCxcclxuICAgICAgICBmYWlsRmlsZUlEOiAxLFxyXG4gICAgICAgIGZhaWxUcmFpbmluZ1Jvd01pc21hdGNoOiAyLFxyXG4gICAgICAgIGZhaWxOb3RFbm91Z2hMYWJlbHM6IDMsXHJcbiAgICAgICAgZmFpbE5vVHJhaW5pbmdEYXRhOiA0LFxyXG4gICAgICAgIGZhaWxVbmtub3duVHJhaW5FcnJvcjogNSxcclxuICAgICAgICBmYWlsVW5rbm93bkluZmVyZW5jZUVycm9yOiA2LFxyXG4gICAgICAgIGZhaWxBYnNvcmJhbmNlTWlzbWF0Y2g6IDcsXHJcbiAgICAgICAgZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaDogOCxcclxuICAgICAgICBmYWlsRmlsZU5vdFNhdmVkOiA5LFxyXG4gICAgICAgIGZhaWxJbmZlcmVuY2VSb3dNaXNtYXRjaDogMTAsXHJcbiAgICAgICAgZmFpbEluZmVyZW5jZUNvbHVtbk1pc21hdGNoOiAxMVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjb25zb2xlT3V0cHV0KHdobywgaWRlbnRpZmllciwgbWVzc2FnZSkge1xyXG4gICAgICAgIHZhciBuYW1lID0gXCJcIjtcclxuICAgICAgICBzd2l0Y2ggKHdobykge1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICBuYW1lID0gbmFtZS5jb25jYXQoXCJjaGVtb1RyYWluOiBcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgbmFtZSA9IG5hbWUuY29uY2F0KFwiQ2hlbW9JbmZlcjogXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG5hbWUgPSBuYW1lLmNvbmNhdChpZGVudGlmaWVyKTtcclxuICAgICAgICByZXR1cm4gbmFtZS5jb25jYXQobWVzc2FnZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNoZW1vQWRkTGFiZWxzKGxhYmVscykge1xyXG5cclxuICAgICAgICB2YXIgbmV3TGFiZWxzTGVuZ3RoID0gbGFiZWxzLmxlbmd0aDtcclxuICAgICAgICB2YXIgb2xkTGFiZWxzTGVuZ3RoID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aDtcclxuICAgICAgICAvL2xvY2F0aW9uQXJyIChbaW50XSkgaG9sZHMgdGhlIG51bWJlciBvZiB0aGUgY29sdW1uIG9mIGEgY29uY2VudHJhdGlvbiBtYXRyaXggdGhpcyBsYWJlbCBpcyBsaW5rZWQgdG9cclxuICAgICAgICB2YXIgbG9jYXRpb25BcnIgPSBbXTtcclxuICAgICAgICAvL0xvb2sgdG8gc2VlIGlmIHdlIGhhdmUgc2VlbiB0aGlzIGxhYmVsIGJlZm9yZVxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3TGFiZWxzTGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG5vdEZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBvbGRMYWJlbHNMZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgLy9JZiB3ZSBoYXZlIHNlZW4gYmVmb3JlLCBtYWtlIGEgbm90ZSBvZiB3aGF0IGNvbHVtbiB0aGUgY29uY2VudHJhdGlvbiB3aWxsIGdvIGluXHJcbiAgICAgICAgICAgICAgICAvL2luc2lkZSBvZiB0cmFpbmluZy1ZIG1hdHJpeC5cclxuICAgICAgICAgICAgICAgIGlmIChsYWJlbHNbaV0gPT0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2pdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm90Rm91bmQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gajtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0lmIG5ldmVyIHNlZW4gYmVmb3JlLCB3ZSBhZGQgdGhlIGxhYmVsIHRvIGEgbGlzdGluZyBvZiBsYWJlbHMuXHJcbiAgICAgICAgICAgIGlmIChub3RGb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW29sZExhYmVsc0xlbmd0aF0gPSBsYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gb2xkTGFiZWxzTGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsb2NhdGlvbkFycjtcclxuICAgIH07XHJcblxyXG4gICAgLy9BZGRzIGEgZmlsZSB3aXRoIHRoZSBtZWFzdXJlZCBhYnNvcnB0aW9ucyBhbmQgZXN0aW1hdGVkIGNvbmNlbnRyYXRpb25zLlxyXG4gICAgZnVuY3Rpb24gY2hlbW9BZGRGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFiZWxzLCBjb25jZW50cmF0aW9ucykge1xyXG4gICAgICAgIGRhdGFiYXNlQWRkRmlsZShhYnNvcmJhbmNlcywgY29uY2VudHJhdGlvbkxhYmVscywgY29uY2VudHJhdGlvbnMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0FkZENvbmNlbnRyYXRpb24obmV3Q29uY2VudHJhdGlvbiwgY3VyclJvdywgY3VyckNvbCkge1xyXG4gICAgICAgIC8vYWRkIGluZGV4XHJcbiAgICAgICAgdmFyIG51bVJvdyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGg7XHJcbiAgICAgICAgdmFyIG51bUNvbCA9IDA7XHJcbiAgICAgICAgaWYgKG51bVJvdyA+IDApIHtcclxuICAgICAgICAgICAgbnVtQ29sID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zWzBdLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vSWYgcGFzdCBsYXN0IHJvdyBieSAxLCBtYWtlIGEgbmV3IHJvdyAoZnVsbCBvZiBub3QtaW5pdClcclxuICAgICAgICBpZiAoY3VyclJvdyA9PSBudW1Sb3cpIHtcclxuICAgICAgICAgICAgbnVtUm93ICs9IDE7XHJcbiAgICAgICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XSA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgY3VyclJvd0FyciA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db2w7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgY3VyclJvd0FycltpXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy9XZSBwYXNzIHRoZSBsYXN0IGNvbHVtbi0gYWRkIG5ldyBjb2x1bW4gd2l0aCAwIHN0YXRlcy5cclxuICAgICAgICBpZiAoY3VyckNvbCA9PSBudW1Db2wpIHtcclxuICAgICAgICAgICAgbnVtQ29sICs9IDE7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUm93OyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjdXJyUm93QXJyID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKGkgPT0gY3VyclJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJSb3dBcnJbY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9XaGVuIHdlIGFkZCBhIGNvbHVtbiwgd2UgbGVhdmUgaW5kaWNlcyAwXHJcbiAgICAgICAgICAgICAgICAgICAgY3VyclJvd0FycltjdXJyQ29sXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIC8vSW4gdGhpcyBzaXR1YXRpb24gd2UgYXJlIG92ZXJ3cml0aW5nIGEgMFxyXG4gICAgICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbY3VyclJvd11bY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlbW9HZXRNb2RlbCgpIHtcclxuICAgICAgICBpZiAoY2hlbW9Jc1RyYWluZWQpIHtcclxuICAgICAgICAgICAgdmFyIG1vZGVsID0gY2hlbW9BbGdvLmV4cG9ydCgpO1xyXG4gICAgICAgICAgICBtb2RlbC5jb25jZW50cmF0aW9uTGFiZWxzID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzO1xyXG4gICAgICAgICAgICBpZiAoIWNoZW1vSXNQbHMpIHtcclxuICAgICAgICAgICAgICAgIG1vZGVsLlBDQUNvbXByZXNzZWQgPSBjaGVtb1BDQUNvbXByZXNzZWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHsgbW9kZWw6IG1vZGVsLCBzdGF0dXM6IGNoZW1vRmxhZ3Muc3VjY2VzcyB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4geyBtb2RlbDogbnVsbCwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YSB9O1xyXG4gICAgfTtcclxuXHJcbiAgICAvL0FkZCBiZXR0ZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0xvYWRNb2RlbChtb2RlbCwgaXNQbHMpIHtcclxuICAgICAgICBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMgPSBtb2RlbC5jb25jZW50cmF0aW9uTGFiZWxzO1xyXG4gICAgICAgIGlmIChpc1Bscykge1xyXG4gICAgICAgICAgICBjaGVtb0lzUGxzID0gdHJ1ZTtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wbHModHJ1ZSwgbW9kZWwpO1xyXG4gICAgICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBjaGVtb0lzUGxzID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNoZW1vQWxnbyA9IG5ldyBsaWJfcGNhKG51bGwsIG51bGwsIHRydWUsIG1vZGVsKTtcclxuICAgICAgICAgICAgY2hlbW9QQ0FDb21wcmVzc2VkID0gbW9kZWwuUENBQ29tcHJlc3NlZDtcclxuICAgICAgICAgICAgY2hlbW9Jc1RyYWluZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZmxhZ1RvU3RyaW5nKGZsYWcpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gXCJOTyBTVUNIIEZMQUdcIjtcclxuICAgICAgICBzd2l0Y2ggKGZsYWcpIHtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJzdWNjZXNzXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsRmlsZUlEXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsVHJhaW5pbmdSb3dNaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbE5vdEVub3VnaExhYmVsc1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgNDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbE5vVHJhaW5pbmdEYXRhXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA1OlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsVW5rbm93blRyYWluRXJyb3JcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDY6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxVbmtub3duSW5mZXJlbmNlRXJyb3JcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDc6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxBYnNvcmJhbmNlTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDg6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxDb25jZW50cmF0aW9uTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDk6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxGaWxlTm90U2F2ZWRcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDEwOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDExOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsSW5mZXJlbmNlQ29sdW1uTWlzbWF0Y2hcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpblBscygpIHtcclxuICAgICAgICB2YXIgbnVtQ29sQWJzb3JiYW5jZXMgPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXNbMF0ubGVuZ3RoO1xyXG4gICAgICAgIHZhciBudW1Db2xDb25jZW50cmF0aW9ucyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGg7XHJcbiAgICAgICAgLy9UYWtlIDEwJSBvZiBkYXRhIChwcm9iYWJseSBvZiBZKS5cclxuICAgICAgICB2YXIgbWF4VmVjdG9ycyA9IE1hdGgubWluKG51bUNvbEFic29yYmFuY2VzLCBudW1Db2xDb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgdmFyIG51bUxhdGVudFZlY3RvcnMgPSBNYXRoLmZsb29yKG1heFZlY3RvcnMgKiAwLjEpO1xyXG4gICAgICAgIGlmIChudW1MYXRlbnRWZWN0b3JzID09IDApIHtcclxuICAgICAgICAgICAgbnVtTGF0ZW50VmVjdG9ycyArPSAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gMDtcclxuICAgICAgICB3aGlsZSAobnVtTGF0ZW50VmVjdG9ycyA8PSBtYXhWZWN0b3JzICYmIGV4cGxhaW5lZFZhcmlhbmNlcyA8IDAuODUpIHtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wbHMoKTtcclxuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgICAgICBsYXRlbnRWZWN0b3JzOiBudW1MYXRlbnRWZWN0b3JzLFxyXG4gICAgICAgICAgICAgICAgdG9sZXJhbmNlOiAxZS01XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAvL0l0IGlzIHZlcnkgY2xlYW4gdG8gcmVwcnNlbnQgYWxsIGFic29yYmFuY2VzIGFzIGEgcm93LCBidXQtIGVhY2ggb25lIGNvbnNpZGVyZWRcclxuICAgICAgICAgICAgICAgIC8vYSB2YXJpYWJsZSBpbiBQTFMsIHRodXMgZWFjaCBvbmUgaGFzIGl0cyBvd24gcm93IChjb2x1bW5zIGRpZmZlcmVudGlhdGUgc2FtcGxlKVxyXG4gICAgICAgICAgICAgICAgLyp2YXIgYWJzb3JiYW5jZXNUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMpO1xyXG4gICAgICAgICAgICAgICAgYWJzb3JiYW5jZXNUcmFuc3Bvc2UgPSBhYnNvcmJhbmNlc1RyYW5zcG9zZS50cmFuc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgIHZhciBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgICAgICAgICBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSA9IGNvbmNlbnRyYXRpb25zVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coY29uY2VudHJhdGlvbnNUcmFuc3Bvc2UpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYWJzb3JiYW5jZXNUcmFuc3Bvc2UpO1xyXG4gICAgICAgICAgICAgICAgY2hlbW9BbGdvLnRyYWluKGFic29yYmFuY2VzVHJhbnNwb3NlLCBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSwgb3B0aW9ucyk7Ki9cclxuICAgICAgICAgICAgICAgIGNoZW1vQWxnby50cmFpbihjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMsIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucywgb3B0aW9ucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZXJyKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duVHJhaW5FcnJvcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBleHBsYWluZWRWYXJpYW5jZXMgPSBjaGVtb0FsZ28uZ2V0RXhwbGFpbmVkVmFyaWFuY2UoKTtcclxuICAgICAgICAgICAgaWYgKGV4cGxhaW5lZFZhcmlhbmNlcyA8IDAuODUpIHtcclxuICAgICAgICAgICAgICAgIG51bUxhdGVudFZlY3RvcnMrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjaGVtb0lzUGxzID0gdHJ1ZTtcclxuICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5zdWNjZXNzO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpblBjYSgpIHtcclxuICAgICAgICAvL0dldCBwcmluY2lwbGUgY29tcG9uZW50cyBhc3NvY2lhdGVkIHdpdGggdHJhaW5pbmcgc2V0IGFic29yYmFuY2VzIFguXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wY2EoY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsVW5rbm93blRyYWluRXJyb3I7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IDI7IC8vVGVtcG9yYXJ5LSAyIGNvbXBvbmVudHMgc28gdGhhdCB3ZSBjYW4gaGF2ZSB0aGUgeC15IG9mIGEgZ3JhcGhcclxuICAgICAgICAvL2NoZW1vTnVtTGF0ZW50VmVjdG9ycyA9IGZsb29yKG51bUNvbEFic29yYmFuY2VzICogMC4xKTtcclxuICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gY2hlbW9BbGdvLmdldEV4cGxhaW5lZFZhcmlhbmNlKCk7XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgwLCBcIkxhdGVudCBWZWN0b3JzXCIsIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyk7XHJcbiAgICAgICAgLy9Ib3cgbWFueSB2ZWN0b3JzIHRvIGdldCB+ODUlIG9mIHZhcmlhbmNlP1xyXG4gICAgICAgIC8qY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IoMC44NSAvIGV4cGxhaW5lZFZhcmlhbmNlcyk7XHJcbiAgICAgICAgaWYgKGNoZW1vTnVtTGF0ZW50VmVjdG9ycyA9PSAwKSB7XHJcbiAgICAgICAgICAgIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyArPSAxO1xyXG4gICAgICAgIH0qL1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vQ2hlY2sgcGFyYW1ldGVyIHJlcXVpcmVtZW50c1xyXG4gICAgICAgICAgICBjaGVtb1BDQUNvbXByZXNzZWQgPSBjaGVtb0FsZ28ucHJvamVjdChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMsIGNoZW1vTnVtTGF0ZW50VmVjdG9ycyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbFVua25vd25UcmFpbkVycm9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgbnVtUG9pbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkLmxlbmd0aDtcclxuICAgICAgICB2YXIgdGVtcHN0cmluZyA9IFwicHJvamVjdGVkXCI7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Qb2ludHM7ICsraSkge1xyXG4gICAgICAgICAgICBjb25zb2xlT3V0cHV0KDAsIHRlbXBzdHJpbmcuY29uY2F0KGkpLCBjaGVtb1BDQUNvbXByZXNzZWRbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5zdWNjZXNzO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdUcmFpbihpc1F1YW50aWZ5KSB7XHJcbiAgICAgICAgY2hlbW9Jc1BscyA9IGlzUXVhbnRpZnk7XHJcbiAgICAgICAgaWYgKGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICAvL05vIHRyYWluaW5nIGRhdGEgbWVhbnMgbm8gc3VjY2VzcyAoYWxzbyBzb21ldGltZXMgd2UgdXNlIDB0aCByb3cgdG8gZmluZCBudW0gb2YgY29sKVxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbE5vVHJhaW5pbmdEYXRhIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgLy9UaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgY29uY2VudHJhdGlvbnMgZm9yIGV2ZXJ5IGFycmF5IG9mIGFic29yYmFuY2VzXHJcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogY2hlbW9GbGFncy5mYWlsVHJhaW5pbmdSb3dNaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aCAhPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0ubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIC8vV2UgZG9uJ3QgaGF2ZSBhIG5hbWUgZm9yIGVhY2ggbWF0ZXJpYWwgKENyeSlcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb3RFbm91Z2hMYWJlbHMgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgICAgIGlmIChpc1F1YW50aWZ5KSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ld1RyYWluUGxzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQgPSBuZXdUcmFpblBjYSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocmVzdWx0ID09IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG5ld0luZmVyUGxzKG1lYXN1cmVkQWJzb3JiYW5jZXMpIHtcclxuICAgICAgICBhbGVydChcIkVudGVyIElJXCIpO1xyXG4gICAgICAgIHZhciBpbmZlcnJlZCA9IFtdO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiQmVmb3JlIHRyYW5zcG9zZVwiKTtcclxuICAgICAgICAgICAgdmFyIG1hdEZvcm0gPSBbbWVhc3VyZWRBYnNvcmJhbmNlc107XHJcbiAgICAgICAgICAgIHZhciBtZWFzdXJlZFRyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KG1hdEZvcm0pO1xyXG4gICAgICAgICAgICBtZWFzdXJlZFRyYW5zcG9zZSA9IG1lYXN1cmVkVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICBhbGVydChcIkFmdGVyIHRyYW5zcG9zZVwiKTtcclxuICAgICAgICAgICAgaW5mZXJyZWQgPSBjaGVtb0FsZ28ucHJlZGljdChtYXRGb3JtKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coaW5mZXJyZWQpO1xyXG4gICAgICAgICAgICB2YXIgaW5mZXJyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChpbmZlcnJlZCk7XHJcbiAgICAgICAgICAgIGluZmVycmVkVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICBpbmZlcnJlZCA9IGluZmVycmVkVHJhbnNwb3NlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbmZlcnJlZCk7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiQWZ0ZXIgSW5mZXJyZWRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgYWxlcnQoXCJSZWFsbHkgYmFkXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsVW5rbm93bkluZmVyZW5jZUVycm9yIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbmZlcnJlZC5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICBhbGVydChcIk5vIGxlbmd0aFwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbFVua25vd25JbmZlcmVuY2VFcnJvciB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaW5mZXJyZWRbMF0ubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL1RoZSBpbXBsZW1lbnRhdGlvbiBwcm92aWRlcyB0aGUgYmVzdCBhbnN3ZXIgZmlyc3RcclxuICAgICAgICB2YXIgaW5mZXJyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChpbmZlcnJlZCk7XHJcbiAgICAgICAgaW5mZXJyZWRUcmFuc3Bvc2UgPSBpbmZlcnJlZFRyYW5zcG9zZS50cmFuc3Bvc2UoKTtcclxuICAgICAgICB2YXIgYWxsQ29uY2VudHJhdGlvbnMgPSBpbmZlcnJlZFRyYW5zcG9zZVswXTtcclxuXHJcbiAgICAgICAgLy9GaW5kIHRoZSBjaGVtaWNhbCBuYW1lcyB3aGljaCBoYXZlIGJlZW4gZGV0ZWN0ZWQuXHJcbiAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgIHZhciBub25aZXJvQ29uY2VudHJhdGlvbnMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFsbENvbmNlbnRyYXRpb25zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICBsYWJlbHNbbGFiZWxzLmxlbmd0aF0gPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBub25aZXJvQ29uY2VudHJhdGlvbnNbbm9uWmVyb0NvbmNlbnRyYXRpb25zLmxlbmd0aF0gPSBhbGxDb25jZW50cmF0aW9uc1tpXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzIH07XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG5ld0luZmVyUGNhKG1lYXN1cmVkQWJzb3JiYW5jZXMpIHtcclxuICAgICAgICB2YXIgbWVhc3VyZWQgPSBbXTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAvL0FwcGVuZCBvYnNlcnZlZCBkYXRhIHRvIHRyYWluaW5nIGRhdGEgKHRlbXBvcmFyeSwgb2JzZXJ2ZWQgZGF0YSBpcyBOT1QgdHJhaW5pbmcgZGF0YSlcclxuICAgICAgICAgICAgdmFyIG1hdEZvcm0gPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMuc2xpY2UoMCk7XHJcbiAgICAgICAgICAgIG1hdEZvcm1bbWF0Rm9ybS5sZW5ndGhdID0gbWVhc3VyZWRBYnNvcmJhbmNlcztcclxuICAgICAgICAgICAgbWVhc3VyZWQgPSBjaGVtb0FsZ28ucHJvamVjdChtYXRGb3JtLCBjaGVtb051bUxhdGVudFZlY3RvcnMpO1xyXG4gICAgICAgICAgICBtZWFzdXJlZCA9IG1lYXN1cmVkW21lYXN1cmVkLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duSW5mZXJlbmNlRXJyb3IgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIlJlY2VudCBQb2ludFwiLCBtZWFzdXJlZCk7XHJcbiAgICAgICAgdmFyIGRpc3RhbmNlcyA9IFtdO1xyXG4gICAgICAgIHZhciBudW1Qb2ludHMgPSBjaGVtb1BDQUNvbXByZXNzZWQubGVuZ3RoO1xyXG4gICAgICAgIC8vYWxlcnQobnVtUG9pbnRzKTtcclxuICAgICAgICAvL2FsZXJ0KGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnNvbGVPdXRwdXQoMSwgXCJudW0gcG9pbnRzXCIsIG51bVBvaW50cyk7XHJcbiAgICAgICAgaWYgKG51bVBvaW50cyAhPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxJbmZlcmVuY2VSb3dNaXNtYXRjaCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9OdW1MYXRlbnRWZWN0b3JzICE9IGNoZW1vUENBQ29tcHJlc3NlZFswXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbEluZmVyZW5jZUNvbHVtbk1pc21hdGNoIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBkaXN0YW5jZSA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIHN1bSA9IDA7XHJcbiAgICAgICAgICAgIHZhciBudW1Db21wb25lbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkW2ldLmxlbmd0aDtcclxuICAgICAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIm51bSBjb21wb25lbnRzXCIsIG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bUNvbXBvbmVudHM7ICsraikge1xyXG4gICAgICAgICAgICAgICAgLy8oeDEteDIpXjJcclxuICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnQgPSBtZWFzdXJlZFtqXSAtIGNoZW1vUENBQ29tcHJlc3NlZFtpXVtqXTtcclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudCA9IGNvbXBvbmVudCAqIGNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIHN1bSArPSBjb21wb25lbnQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9TcXVhcmUgcm9vdCBvZiBkaXN0YW5jZXMgc3F1YXJlZCBpcyB0aGUgZXVjbGlkZWFuIGRpc3RhbmNlIGZvcm11bGFcclxuICAgICAgICAgICAgc3VtID0gTWF0aC5zcXJ0KHN1bSk7XHJcbiAgICAgICAgICAgIGRpc3RhbmNlW2ldID0gc3VtO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL0xpbmVhciBzZWFyY2ggdG8gZmluZCBwb2ludCB3aXRoIG1pbmltdW0gZGlzdGFuY2UgZnJvbSBuZXcgb2JzZXJ2YXRpb25cclxuICAgICAgICB2YXIgbWluaW11bURpc3RhbmNlID0gZGlzdGFuY2VzWzBdO1xyXG4gICAgICAgIHZhciBtaW5pbXVtSW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGRpc3RhbmNlc1tpXSA8IG1pbmltdW1EaXN0YW5jZSkge1xyXG4gICAgICAgICAgICAgICAgbWluaW11bURpc3RhbmNlID0gZGlzdGFuY2VzW2ldO1xyXG4gICAgICAgICAgICAgICAgbWluaW11bUluZGV4ID0gaTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgY2xvc2VzdFNhbXBsZSA9IGNoZW1vU2FtcGxlTmFtZXNbbWluaW11bUluZGV4XTtcclxuICAgICAgICB2YXIgY2xvc2VzdFNhbXBsZVhZID0gY2hlbW9QQ0FDb21wcmVzc2VkW21pbmltdW1JbmRleF07XHJcbiAgICAgICAgdmFyIGFsbENvbmNlbnRyYXRpb25zID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW21pbmltdW1JbmRleF07XHJcbiAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgIHZhciBub25aZXJvQ29uY2VudHJhdGlvbnMgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFsbENvbmNlbnRyYXRpb25zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICBsYWJlbHNbbGFiZWxzLmxlbmd0aF0gPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBub25aZXJvQ29uY2VudHJhdGlvbnNbbm9uWmVyb0NvbmNlbnRyYXRpb25zLmxlbmd0aF0gPSBhbGxDb25jZW50cmF0aW9uc1tpXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zb2xlT3V0cHV0KDEsIFwibGFiZWxzXCIsIGxhYmVscyk7XHJcblxyXG4gICAgICAgIC8vTmV3IHZlcnNpb24gcmV0dXJucyBhIG1hdHJpeCB3aXRoIHRoZSAyRCBjb29yZGluYXRlcyBmb3IgZXZlcnkgcG9pbnQgKHRyYWluaW5nUG9pbnRzKVxyXG4gICAgICAgIC8vQW5kIHRoZSBsYXN0IHBvaW50ICh3aGljaCB3YXMganVzdCBpbmZlcnJlZCkgaXMgcmVjZW50UG9pbnQuXHJcbiAgICAgICAgLy9yZXR1cm4geyBjb21wb3VuZHM6IGxhYmVscywgY29uY2VudHJhdGlvbnM6IG5vblplcm9Db25jZW50cmF0aW9ucywgc3RhdHVzOiBjaGVtb0ZsYWdzLnN1Y2Nlc3MgfTtcclxuICAgICAgICAvL1NvbWVvbmUgc2hvdWxkIHJlZmFjdG9yIHRoaXMgcHJvamVjdC4gTXkgbmFtaW5nIGNvbnZlbnRpb25zIGFyZSBqdXN0IGJhZC5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0cmFpbmluZ1BvaW50czogY2hlbW9QQ0FDb21wcmVzc2VkLCB0cmFpbmluZ1NhbXBsZU5hbWVzOiBjaGVtb1NhbXBsZU5hbWVzLCByZWNlbnRQb2ludDogbWVhc3VyZWQsXHJcbiAgICAgICAgICAgIGNsb3Nlc3RTYW1wbGU6IGNsb3Nlc3RTYW1wbGUsIGNsb3Nlc3RTYW1wbGVYWTogY2xvc2VzdFNhbXBsZVhZLCBjb21wb3VuZHM6IGxhYmVscyxcclxuICAgICAgICAgICAgY29uY2VudHJhdGlvbnM6IG5vblplcm9Db25jZW50cmF0aW9ucywgc3RhdHVzOiBjaGVtb0ZsYWdzLnN1Y2Nlc3NcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBuZXdJbmZlcihtZWFzdXJlZEFic29yYmFuY2VzKSB7XHJcbiAgICAgICAgLy9SZXBsYWNlIE5hTnMgd2l0aCAwcyBpbiB0aGUgYWJzb3JiYW5jZXNcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1lYXN1cmVkQWJzb3JiYW5jZXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGlzTmFOKG1lYXN1cmVkQWJzb3JiYW5jZXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICBtZWFzdXJlZEFic29yYmFuY2VzW2ldID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoIWNoZW1vSXNUcmFpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVhc3VyZWRBYnNvcmJhbmNlcy5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzWzBdLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsQWJzb3JiYW5jZU1pc21hdGNoIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciByZXN1bHQ7XHJcbiAgICAgICAgaWYgKGNoZW1vSXNQbHMpIHtcclxuICAgICAgICAgICAgYWxlcnQoXCJFbnRlclwiKTtcclxuICAgICAgICAgICAgcmVzdWx0ID0gbmV3SW5mZXJQbHMobWVhc3VyZWRBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAvL2FsZXJ0KFwiSHVoXCIpO1xyXG4gICAgICAgICAgICByZXN1bHQgPSBuZXdJbmZlclBjYShtZWFzdXJlZEFic29yYmFuY2VzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gcGNhVGVzdCgpIHtcclxuXHJcbiAgICAgICAgdmFyIHRyYWluT2JqID0ge1xyXG4gICAgICAgICAgICBcImFic29yYmFuY2VcIjogW1stMC43NjU3NzMsIC0wLjc1NTM2MiwgLTAuNzY0OTM2LCAtMC42OTEzOTY2NjcsIC0wLjcxNTc2MDMzMywgLTAuNzE0MDExNjY3LCAtMC43Mjg5ODYzMzMsIC0wLjY5ODMyNjMzMywgLTAuNzAzNjAxNjY3LCAtMC42NjA1MTg2NjcsIC0wLjY2MTU0MTY2NywgLTAuNjMxNzg1NjY3LFxyXG4gICAgICAgICAtMC42MjUwOTMsIC0wLjYxNzQyNzY2NywgLTAuNTkxNTMyLCAtMC41ODE5OTM2NjcsIC0wLjYxNTE3MTY2NywgLTAuNTYwNjg5LCAtMC41NTkxNjEsIC0wLjU1OTQwNiwgLTAuNTYyMDY2NjY3LCAtMC41NTM0NDUsIC0wLjU2NTMxODMzMywgLTAuNTkwMjkxNjY3LCAtMC41NTkyNTQ2NjcsXHJcbiAgICAgICAgIC0wLjU4MjQyMjY2NywgLTAuNTc2NjY2LCAtMC41Nzk5NjEsIC0wLjU3NTcxNiwgLTAuNTgzOTAxNjY3LCAtMC41ODk5MTgzMzMsIC0wLjU4NjY5MjMzMywgLTAuNjA5NTQ3LCAtMC42MTIyOTEsIC0wLjYwMDg3NDMzMywgLTAuNjI5MTI5LCAtMC41ODYzOTU2NjcsIC0wLjU5NTc3ODY2NyxcclxuICAgICAgICAgLTAuNTc0MTkxMzMzLCAtMC41NzUzMDA2NjcsIC0wLjU3MTEyNSwgLTAuNTYxODU3NjY3LCAtMC41NTE3NTc2NjcsIC0wLjU0NTcwNDY2NywgLTAuNTM3MjMzLCAtMC41MTc5MzgsIC0wLjUxNjYwMjY2NywgLTAuNTU0NzkwNjY3LCAtMC41MjQ2NzQ2NjcsIC0wLjUyNDk3NzMzMywgLTAuNTM1NjY5LFxyXG4gICAgICAgICAtMC41Mzc3MTY2NjcsIC0wLjUxOTU1MTY2NywgLTAuNTI3MzY3NjY3LCAtMC41MTAzODEsIC0wLjQ5OTM1NDY2NywgLTAuNDg3NjAxMzMzLCAtMC40OTM2ODQ2NjcsIC0wLjQxNzg5NSwgLTAuNDA5NzQ2NjY3LCAtMC4zNzUyODIsIC0wLjM1NzYyMDY2NywgLTAuMzU4MTIsIC0wLjMzODAwNTMzMywgLTAuMzIyMzYzNjY3LFxyXG4gICAgICAgICAtMC4zMjgyMjQ2NjcsIC0wLjMyMDgyNiwgLTAuMjk1MDg2LCAtMC4yODkzNTIsIC0wLjI4NTA5NTY2NywgLTAuMjY3NzEzMzMzLCAtMC4yNzUxMDc2NjcsIC0wLjI3Mjk4NjMzMywgLTAuMjgyODA0MzMzLCAtMC4yNzE2MTM2NjcsIC0wLjI4ODE1OTY2NywgLTAuMjk5Mzg3LCAtMC4yODc0MDIsIC0wLjI5MDQ3NTY2NyxcclxuICAgICAgICAgLTAuMjcxMDQxNjY3LCAtMC4zMDQ3ODcsIC0wLjI4NzMyMiwgLTAuMjk1NjAwNjY3LCAtMC4yODc5NzkzMzMsIC0wLjI2OTYzMTY2NywgLTAuMjc5Mjc2MzMzLCAtMC4yNjk0MDMzMzMsIC0wLjI3MDE0MjY2NywgLTAuMjY2OTQsIC0wLjI1MDAzNjMzMywgLTAuMjY1NzAzNjY3LCAtMC4yNzAwMDUzMzMsIC0wLjI1MjQ4OSxcclxuICAgICAgICAgLTAuMjQ1MjUzMzMzLCAtMC4yMjc0MjYzMzMsIC0wLjIyMDgxOSwgLTAuMjI4MjIxLCAtMC4yNDI2NTcsIC0wLjI0NjQxNDY2NywgLTAuMjI1NzExMzMzLCAtMC4yMzE3ODczMzMsIC0wLjIyMTU0MDY2NywgLTAuMjI4MTY3LCAtMC4xOTQzMiwgLTAuMjExNjUsIC0wLjE5NDkxNDMzMywgLTAuMTY5MDA4LCAtMC4xNzY1NzksXHJcbiAgICAgICAgIC0wLjE0NTAzMDY2NywgLTAuMTMxNjk2LCAtMC4xMjE4MDUzMzMsIC0wLjA5NjY3OCwgLTAuMTAxODU3NjY3LCAtMC4wODA3NDQsIC0wLjA1MDkyNiwgLTAuMDM1NTI1MzMzLCAtMC4wMjQ5OTcsIC0wLjAyMTI1NjMzMywgLTAuMDA0OTQ4LCAwLjAyMDAzNzY2NywgMC4wMzY0MDE2NjcsIDAuMDI0NTA0MzMzLCAwLjA0NDQzODY2NyxcclxuICAgICAgICAgMC4wNDE4MTUzMzMsIDAuMDYyNzYxLCAwLjA5NTIxMiwgMC4xMTUzOTc2NjcsIDAuMTYzOTg3LCAwLjE5NTYzNjY2NywgMC4yMTI0NDgzMzMsIDAuMjM3MTAxMzMzLCAwLjI2Mjk2MDY2NywgMC4yNDE4OTU2NjcsIDAuMjgzNDEwNjY3LCAwLjI4NzMzOTY2NywgMC4zMDE5Mzc2NjcsIDAuMzE1NTM4LCAwLjMyNzE5NTMzMyxcclxuICAgICAgICAgMC4zNTA3MzY2NjcsIDAuMzQzNDQ3MzMzLCAwLjM4Njc3OCwgMC4zOTk2ODQzMzMsIDAuMzk2MDY1LCAwLjM4NjcwNzY2NywgMC4zOTU0NiwgMC4zNzQxOTM2NjcsIDAuMzg4MDEwNjY3LCAwLjM2NTk3NDMzMywgMC4zMjI3MSwgMC4zMTQwNDE2NjcsIDAuMjg3Mzk2LCAwLjI3NzYxMjY2NywgMC4yNzg4MjEzMzMsIDAuMjc5Nzc5LFxyXG4gICAgICAgICAwLjI1NzQxMDMzMywgMC4yNjkyNDU2NjcsIDAuMjk3MzQ3MzMzLCAwLjMxMDY0MjMzMywgMC4yOTg4ODc2NjcsIDAuMjkwODQ5MzMzLCAwLjI3ODg1MjY2NywgMC4yNDEzMzk2NjcsIDAuMjQ1MjYwMzMzLCAwLjMwOTM1NDMzMywgMC4zMDc1NTE2NjcsIDAuMzQyMDkxLCAwLjMyMzE3OCwgMC4zMzUyNzY2NjcsIDAuMzI0NzE0LFxyXG4gICAgICAgICAwLjMzMzA1MjY2NywgMC4yOTg0MTEsIDAuMjc2MDU3LCAwLjI1NTg5MjY2NywgMC4yMDU4OCwgMC4xOTg2ODczMzMsIDAuMTQwNDE4LCAwLjIwMjE0NDMzMywgMC4xODUzMDY2NjcsIDAuMTkzNzczLCAwLjE1MTU1NTMzMywgMC4xNzA4MzY2NjcsIDAuMTY2MjQxLCAwLjE1MDI2NTMzMywgMC4xNjU4OTE2NjcsIDAuMTUzMjAzLFxyXG4gICAgICAgICAwLjE3MTk3ODY2NywgMC4xMzUwMzUzMzMsIDAuMTcxMDU2MzMzLCAwLjIyNjE5MywgMC4xNzIwMTcsIDAuMjUwODk3NjY3LCAwLjI3MjI1ODMzMywgMC4xODEzNjUsIDAuMTYzNzA3MzMzLCAwLjE2Mzg2NDY2NywgMC4xNTE4MzAzMzMsIDAuMTQ5NDA3LCAwLjEwNjMyOTY2NywgMC4wNzg4MDksIDAuMDcwNzQ2LFxyXG4gICAgICAgICAwLjExMTQ5LCAwLjAzODk1OTMzMywgMC4wODA4MzEsIDAuMDkxMzcwNjY3LCAwLjA3NTEyMDY2NywgMC4wMDQ3NTAzMzMsIDAuMDAzNDg4NjY3LCAwLjA2NzQ0OTMzMywgMC4wMzkwOTQ2NjcsIDAuMTAyMDAyNjY3LCAwLjA1NzMzMzMzMywgMC4xNjIxMjczMzMsIDAuMjUwMjc0MzMzLCAwLjA3NzEwNjMzMywgMC4yMzMzMjQsXHJcbiAgICAgICAgIDAuMjU1MzIxLCAwLjM2MjQzODMzMywgLTAuMDQ5MjAwMzMzLCAtMC4wNzMyODIzMzMsIC0wLjQ3MDQ0OCwgLTAuMzE0ODI4NSwgLTAuOTA0Njc1LCAtMC43MTcyNTQsIC0wLjg4NzU4OCwgMCwgMCwgMCwgMF0sXHJcbiAgICAgICAgIFstMC4zNDY0OTQsIC0wLjMzMzAxOTY2NywgLTAuMzQ1MjA5MzMzLCAtMC4yNzM0NTA2NjcsIC0wLjI5NjYxOCwgLTAuMzE5ODA2NjY3LCAtMC4zNTc5OTQ2NjcsIC0wLjM1OTE5NDY2NywgLTAuMzkwNjc4MzMzLCAtMC4zNTIzNTEzMzMsIC0wLjM3NTM3NTMzMywgLTAuMzY1MjgzNjY3LCAtMC4zNjc3ODYsXHJcbi0wLjM3NzM0NywgLTAuMzY0MTUwNjY3LCAtMC4zNjA5MzUzMzMsIC0wLjM5MTU0OTMzMywgLTAuMzQwNDcxLCAtMC4zNDMxNjIsIC0wLjM1MDIzNTMzMywgLTAuMzU0Nzk2NjY3LCAtMC4zNDU3MTE2NjcsIC0wLjM0MzkxNDMzMywgLTAuMzc1MjUxMzMzLCAtMC4zNDAzMzUsIC0wLjM1MTQ5NDY2NywgLTAuMzQxNDgyNjY3LFxyXG4tMC4zNDI5NTg2NjcsIC0wLjMzNTI5NywgLTAuMzM3MDA1LCAtMC4zNDI0NDUzMzMsIC0wLjMzNjQ5OCwgLTAuMzU5Mjg0MzMzLCAtMC4zNTcwNjk2NjcsIC0wLjM1Njk1MTMzMywgLTAuMzgwNjAzLCAtMC4zNDI3MTMsIC0wLjM1MzE5NSwgLTAuMzM4NDE3MzMzLCAtMC4zNDgzNjY2NjcsIC0wLjM0NDk5NjMzMyxcclxuLTAuMzQ1ODE4LCAtMC4zNTA2MTkzMzMsIC0wLjM0NzI2MjMzMywgLTAuMzUxMzkwNjY3LCAtMC4zMzk2NTQ2NjcsIC0wLjM0MzQ4NDMzMywgLTAuMzkxNDksIC0wLjM2NTY3OTY2NywgLTAuMzc2NjQzMzMzLCAtMC4zOTU1MjMsIC0wLjM5ODE1MDY2NywgLTAuMzc0OTczNjY3LCAtMC4zOTMyMDcsIC0wLjM4MDIxNDY2NyxcclxuLTAuMzcxMjQ5MzMzLCAtMC4zNjEzNDcsIC0wLjM2NzM5ODMzMywgLTAuMjgwMDAzLCAtMC4yNTM3MTM2NjcsIC0wLjIwMjg3NCwgLTAuMTc0NTMyMzMzLCAtMC4xMzMzNzEzMzMsIC0wLjA5MTY4MiwgLTAuMDQxODI5NjY3LCAtMC4wMTY3MjM2NjcsIDAuMDIyNjczNjY3LCAwLjEwMTM1NzY2NywgMC4xNjE2OSxcclxuMC4yMzYzNzUzMzMsIDAuMjk5Mjc1MzMzLCAwLjM0NjA3NjMzMywgMC4zNzk0MDUsIDAuMzc0NTU5LCAwLjQwMTQ1MiwgMC4zODA4Nzg2NjcsIDAuMzYxNjE0LCAwLjM4NzcxOCwgMC4zNDc2MzQsIDAuMzEyNzY5LCAwLjIyOTk0NCwgMC4xOTY2NjIzMzMsIDAuMTI4NjY1MzMzLCAwLjA3ODQ5NSwgMC4wMzUwODcsXHJcbi0wLjAzODYxNTMzMywgLTAuMDU5NDA2NjY3LCAtMC4xMDA2MjczMzMsIC0wLjEyODIxMjY2NywgLTAuMTQzMzgyMzMzLCAtMC4xOTQ5NjUzMzMsIC0wLjIxMDU2NywgLTAuMjIxNDcxMzMzLCAtMC4yMzkxMDkzMzMsIC0wLjI0NDQ1NSwgLTAuMjU2ODU0NjY3LCAtMC4yNzU1MDczMzMsIC0wLjMwMjk4NzMzMyxcclxuLTAuMzE3NDkyLCAtMC4zMDgwMDU2NjcsIC0wLjMyMTM2NywgLTAuMzI1NzA4NjY3LCAtMC4zNDQ4MjA2NjcsIC0wLjMyNjIzNTMzMywgLTAuMzU2Mjg1LCAtMC4zNDcwNTU2NjcsIC0wLjM0MDkyMiwgLTAuMzU4MzAwNjY3LCAtMC4zMzEyMTgzMzMsIC0wLjM0MTc5MiwgLTAuMzQzNjkxLCAtMC4zMzAxNjMzMzMsXHJcbi0wLjM0NjU4OTY2NywgLTAuMzI5OTU5LCAtMC4zMDMyNTIsIC0wLjI4MjY4OCwgLTAuMjYxODEyNjY3LCAtMC4yMjU0MSwgLTAuMTc3NzE1MzMzLCAtMC4xMTgwNDQ2NjcsIC0wLjA4MDEyNCwgLTAuMDM2NDI3NjY3LCAwLjAyNjE1OTY2NywgMC4wNjAzMzgsIDAuMTI5NTQyLCAwLjE4MDgyMywgMC4yMTM4ODUzMzMsXHJcbjAuMjI5ODc0MzMzLCAwLjI3MTcwNzY2NywgMC4yMjY3Mjg2NjcsIDAuMjEzNzYzNjY3LCAwLjIyNTI3OSwgMC4yMjE3NTcsIDAuMjcwMzMyNjY3LCAwLjI3NTU3OTMzMywgMC4yNjAxNjYzMzMsIDAuMjI5NTk3NjY3LCAwLjIyOTU5MjY2NywgMC4yMTA5MjIsIDAuMTg5MTkzNjY3LCAwLjE3MzY1OTMzMywgMC4xMzg1NTQsXHJcbjAuMTI0OTA1NjY3LCAwLjA5NDA4NzMzMywgMC4wNzYxNTY2NjcsIDAuMDMzOTY5LCAwLjAxOTgzODY2NywgLTAuMDA4MDI1LCAtMC4wNDI4ODE2NjcsIC0wLjA2MzczNSwgLTAuMDg0ODA4MzMzLCAtMC4wODc2NzMzMzMsIC0wLjExMjg4OSwgLTAuMTE3NzMwMzMzLCAtMC4xNDMxOTMsIC0wLjE0MDAxNjY2NyxcclxuLTAuMTM4Mjg0NjY3LCAtMC4xMzQ4Nzg2NjcsIC0wLjE2MzY0ODY2NywgLTAuMTQxMDU1NjY3LCAtMC4xNjA1MjkzMzMsIC0wLjE5MzU0MDMzMywgLTAuMTk4MjAxNjY3LCAtMC4xNzYyMjYzMzMsIC0wLjIwOTgwMywgLTAuMTg1NzcxLCAtMC4xODc2MjgzMzMsIC0wLjIwMTIyOTY2NywgLTAuMjA0MzA3MzMzLFxyXG4tMC4yMTA0OTMsIC0wLjIzOTczMywgLTAuMjMwNTMsIC0wLjI2OTkwNSwgLTAuMjY5MDM2MzMzLCAtMC4yODMwNzgzMzMsIC0wLjMwMzg0MTMzMywgLTAuMjgxOTY4MzMzLCAtMC4yNzIwMzUsIC0wLjI1ODAyOSwgLTAuMjgyMDQyMzMzLCAtMC4yOTAwNjY2NjcsIC0wLjI4MDQ5NDY2NywgLTAuMjgzMTYxMzMzLFxyXG4tMC4yNzQyMjMzMzMsIC0wLjI4MDE5NiwgLTAuMjM2MTAxLCAtMC4yNjYxNDI2NjcsIC0wLjIzMzMzNTY2NywgLTAuMjI4ODIyNjY3LCAtMC4yNTYyNjYsIC0wLjIxNjM5MTMzMywgLTAuMjAyNTI2MzMzLCAtMC4yNTYyOTAzMzMsIC0wLjIzNzEyMSwgLTAuMjQ0NTQ0LCAtMC4yNTMwNzIsIC0wLjE4NTM5NSxcclxuLTAuMjU2OTU0LCAtMC4yMTUxOTksIC0wLjIwNjE5MjMzMywgLTAuMTc2Mzc4LCAtMC4yMTA3OTMsIC0wLjExMjM1NywgLTAuMDYyMTc5MzMzLCAtMC4wNzU1MDkzMzMsIC0wLjA5Mzk5NSwgLTAuMDMzMzcsIDAuMDA4ODA0MzMzLCAtMC4wMzk4OTAzMzMsIDAuMTE3ODQzMzMzLCAwLjAyNDA1NiwgMC4xMTIxOTkzMzMsXHJcbjAuMTM5OTU5LCAwLjAyODYwODY2NywgMC4yMDM2MDU2NjcsIDAuMTI5Nzc0NjY3LCAwLjIzNzA5MTY2NywgMC4xODM3NjUzMzMsIC0wLjEwNDMzNzY2NywgLTAuMzc2NjcxNSwgLTAuNDQ0NzY4LCAtMC42OTYwODU1LCAtMC40NTkyODU1LCAtMC43MjI2NjYsIDAsIDAsIDAsXHJcbjAsIF1cclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgXCJjb25jZW50cmF0aW9uXCI6IFtbMSwgMF0sIFswLCAxXV0sXHJcbiAgICAgICAgICAgIFwiY29uY2VudHJhdGlvbkxhYmVsc1wiOiBbXCJTa2ltIE1pbGtcIiwgXCJPbGl2ZSBPaWxcIl1cclxuICAgICAgICB9O1xyXG4gICAgICAgIHVwZGF0ZURhdGEodHJhaW5PYmouYWJzb3JiYW5jZVswXSwgWzAuMjUsMC43NV0sIFtcIkFcIixcIkJcIl0sIFwiU2FtcGxlIDFcIik7XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzFdLCBbMC42NiwwLjMzXSwgW1wiQ1wiLCBcIkRcIl0sIFwiU2FtcGxlIDJcIik7XHJcbiAgICAgICAgdmFyIGRldGVjdGVkQWJzb3JiYW5jZXMgPSBbLTAuNzY1NzczLCAtMC43NTUzNjIsIC0wLjc2NDkzNiwgLTAuNjkxMzk2NjY3LCAtMC43MTU3NjAzMzMsIC0wLjcxNDAxMTY2NywgLTAuNzI4OTg2MzMzLCAtMC42OTgzMjYzMzMsIC0wLjcwMzYwMTY2NywgLTAuNjYwNTE4NjY3LCAtMC42NjE1NDE2NjcsIC0wLjYzMTc4NTY2NyxcclxuICAgICAgICAgICAgICAgICAtMC42MjUwOTMsIC0wLjYxNzQyNzY2NywgLTAuNTkxNTMyLCAtMC41ODE5OTM2NjcsIC0wLjYxNTE3MTY2NywgLTAuNTYwNjg5LCAtMC41NTkxNjEsIC0wLjU1OTQwNiwgLTAuNTYyMDY2NjY3LCAtMC41NTM0NDUsIC0wLjU2NTMxODMzMywgLTAuNTkwMjkxNjY3LCAtMC41NTkyNTQ2NjcsXHJcbiAgICAgICAgICAgICAgICAgLTAuNTgyNDIyNjY3LCAtMC41NzY2NjYsIC0wLjU3OTk2MSwgLTAuNTc1NzE2LCAtMC41ODM5MDE2NjcsIC0wLjU4OTkxODMzMywgLTAuNTg2NjkyMzMzLCAtMC42MDk1NDcsIC0wLjYxMjI5MSwgLTAuNjAwODc0MzMzLCAtMC42MjkxMjksIC0wLjU4NjM5NTY2NywgLTAuNTk1Nzc4NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjU3NDE5MTMzMywgLTAuNTc1MzAwNjY3LCAtMC41NzExMjUsIC0wLjU2MTg1NzY2NywgLTAuNTUxNzU3NjY3LCAtMC41NDU3MDQ2NjcsIC0wLjUzNzIzMywgLTAuNTE3OTM4LCAtMC41MTY2MDI2NjcsIC0wLjU1NDc5MDY2NywgLTAuNTI0Njc0NjY3LCAtMC41MjQ5NzczMzMsIC0wLjUzNTY2OSxcclxuICAgICAgICAgICAgICAgICAtMC41Mzc3MTY2NjcsIC0wLjUxOTU1MTY2NywgLTAuNTI3MzY3NjY3LCAtMC41MTAzODEsIC0wLjQ5OTM1NDY2NywgLTAuNDg3NjAxMzMzLCAtMC40OTM2ODQ2NjcsIC0wLjQxNzg5NSwgLTAuNDA5NzQ2NjY3LCAtMC4zNzUyODIsIC0wLjM1NzYyMDY2NywgLTAuMzU4MTIsIC0wLjMzODAwNTMzMywgLTAuMzIyMzYzNjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjMyODIyNDY2NywgLTAuMzIwODI2LCAtMC4yOTUwODYsIC0wLjI4OTM1MiwgLTAuMjg1MDk1NjY3LCAtMC4yNjc3MTMzMzMsIC0wLjI3NTEwNzY2NywgLTAuMjcyOTg2MzMzLCAtMC4yODI4MDQzMzMsIC0wLjI3MTYxMzY2NywgLTAuMjg4MTU5NjY3LCAtMC4yOTkzODcsIC0wLjI4NzQwMiwgLTAuMjkwNDc1NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjI3MTA0MTY2NywgLTAuMzA0Nzg3LCAtMC4yODczMjIsIC0wLjI5NTYwMDY2NywgLTAuMjg3OTc5MzMzLCAtMC4yNjk2MzE2NjcsIC0wLjI3OTI3NjMzMywgLTAuMjY5NDAzMzMzLCAtMC4yNzAxNDI2NjcsIC0wLjI2Njk0LCAtMC4yNTAwMzYzMzMsIC0wLjI2NTcwMzY2NywgLTAuMjcwMDA1MzMzLCAtMC4yNTI0ODksXHJcbiAgICAgICAgICAgICAgICAgLTAuMjQ1MjUzMzMzLCAtMC4yMjc0MjYzMzMsIC0wLjIyMDgxOSwgLTAuMjI4MjIxLCAtMC4yNDI2NTcsIC0wLjI0NjQxNDY2NywgLTAuMjI1NzExMzMzLCAtMC4yMzE3ODczMzMsIC0wLjIyMTU0MDY2NywgLTAuMjI4MTY3LCAtMC4xOTQzMiwgLTAuMjExNjUsIC0wLjE5NDkxNDMzMywgLTAuMTY5MDA4LCAtMC4xNzY1NzksXHJcbiAgICAgICAgICAgICAgICAgLTAuMTQ1MDMwNjY3LCAtMC4xMzE2OTYsIC0wLjEyMTgwNTMzMywgLTAuMDk2Njc4LCAtMC4xMDE4NTc2NjcsIC0wLjA4MDc0NCwgLTAuMDUwOTI2LCAtMC4wMzU1MjUzMzMsIC0wLjAyNDk5NywgLTAuMDIxMjU2MzMzLCAtMC4wMDQ5NDgsIDAuMDIwMDM3NjY3LCAwLjAzNjQwMTY2NywgMC4wMjQ1MDQzMzMsIDAuMDQ0NDM4NjY3LFxyXG4gICAgICAgICAgICAgICAgIDAuMDQxODE1MzMzLCAwLjA2Mjc2MSwgMC4wOTUyMTIsIDAuMTE1Mzk3NjY3LCAwLjE2Mzk4NywgMC4xOTU2MzY2NjcsIDAuMjEyNDQ4MzMzLCAwLjIzNzEwMTMzMywgMC4yNjI5NjA2NjcsIDAuMjQxODk1NjY3LCAwLjI4MzQxMDY2NywgMC4yODczMzk2NjcsIDAuMzAxOTM3NjY3LCAwLjMxNTUzOCwgMC4zMjcxOTUzMzMsXHJcbiAgICAgICAgICAgICAgICAgMC4zNTA3MzY2NjcsIDAuMzQzNDQ3MzMzLCAwLjM4Njc3OCwgMC4zOTk2ODQzMzMsIDAuMzk2MDY1LCAwLjM4NjcwNzY2NywgMC4zOTU0NiwgMC4zNzQxOTM2NjcsIDAuMzg4MDEwNjY3LCAwLjM2NTk3NDMzMywgMC4zMjI3MSwgMC4zMTQwNDE2NjcsIDAuMjg3Mzk2LCAwLjI3NzYxMjY2NywgMC4yNzg4MjEzMzMsIDAuMjc5Nzc5LFxyXG4gICAgICAgICAgICAgICAgIDAuMjU3NDEwMzMzLCAwLjI2OTI0NTY2NywgMC4yOTczNDczMzMsIDAuMzEwNjQyMzMzLCAwLjI5ODg4NzY2NywgMC4yOTA4NDkzMzMsIDAuMjc4ODUyNjY3LCAwLjI0MTMzOTY2NywgMC4yNDUyNjAzMzMsIDAuMzA5MzU0MzMzLCAwLjMwNzU1MTY2NywgMC4zNDIwOTEsIDAuMzIzMTc4LCAwLjMzNTI3NjY2NywgMC4zMjQ3MTQsXHJcbiAgICAgICAgICAgICAgICAgMC4zMzMwNTI2NjcsIDAuMjk4NDExLCAwLjI3NjA1NywgMC4yNTU4OTI2NjcsIDAuMjA1ODgsIDAuMTk4Njg3MzMzLCAwLjE0MDQxOCwgMC4yMDIxNDQzMzMsIDAuMTg1MzA2NjY3LCAwLjE5Mzc3MywgMC4xNTE1NTUzMzMsIDAuMTcwODM2NjY3LCAwLjE2NjI0MSwgMC4xNTAyNjUzMzMsIDAuMTY1ODkxNjY3LCAwLjE1MzIwMyxcclxuICAgICAgICAgICAgICAgICAwLjE3MTk3ODY2NywgMC4xMzUwMzUzMzMsIDAuMTcxMDU2MzMzLCAwLjIyNjE5MywgMC4xNzIwMTcsIDAuMjUwODk3NjY3LCAwLjI3MjI1ODMzMywgMC4xODEzNjUsIDAuMTYzNzA3MzMzLCAwLjE2Mzg2NDY2NywgMC4xNTE4MzAzMzMsIDAuMTQ5NDA3LCAwLjEwNjMyOTY2NywgMC4wNzg4MDksIDAuMDcwNzQ2LFxyXG4gICAgICAgICAgICAgICAgIDAuMTExNDksIDAuMDM4OTU5MzMzLCAwLjA4MDgzMSwgMC4wOTEzNzA2NjcsIDAuMDc1MTIwNjY3LCAwLjAwNDc1MDMzMywgMC4wMDM0ODg2NjcsIDAuMDY3NDQ5MzMzLCAwLjAzOTA5NDY2NywgMC4xMDIwMDI2NjcsIDAuMDU3MzMzMzMzLCAwLjE2MjEyNzMzMywgMC4yNTAyNzQzMzMsIDAuMDc3MTA2MzMzLCAwLjIzMzMyNCxcclxuICAgICAgICAgICAgICAgICAwLjI1NTMyMSwgMC4zNjI0MzgzMzMsIC0wLjA0OTIwMDMzMywgLTAuMDczMjgyMzMzLCAtMC40NzA0NDgsIC0wLjMxNDgyODUsIC0wLjkwNDY3NSwgLTAuNzE3MjU0LCAtMC44ODc1ODgsIDAsIDAsIDAsIDBdO1xyXG5cclxuICAgICAgICBhbGVydChcIlBDQSB0ZXN0IGNvbW1lbmNlXCIpO1xyXG5cclxuICAgICAgICAvL1Jlc3VsdHMgb2YgdHJhaW4/XHJcbiAgICAgICAgdmFyIHJldFRyYWluID0gbmV3VHJhaW4oZmFsc2UpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiVHJhaW5pbmcgU3RhdHVzOiBcIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coZmxhZ1RvU3RyaW5nKHJldFRyYWluKSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coY2hlbW9QQ0FDb21wcmVzc2VkLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coY2hlbW9QQ0FDb21wcmVzc2VkWzBdLmxlbmd0aCk7XHJcbiAgICAgICAgaWYgKHJldFRyYWluID09IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAvL0luZmVyLCBubyBzYXZlXHJcbiAgICAgICAgICAgIHZhciByZXRJbmZlciA9IG5ld0luZmVyKGRldGVjdGVkQWJzb3JiYW5jZXMpO1xyXG4gICAgICAgICAgICAvL3Jlc3VsdHMgb2YgaW5mZXI/XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiSW5mZXIgU3RhdHVzOiBcIik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGZsYWdUb1N0cmluZyhyZXRJbmZlci5zdGF0dXMpKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgIC8vSWYgd2UgZGlkbid0IGZhaWwsIHByaW50IGFsbCByZXN1bHRzLlxyXG4gICAgICAgICAgICBpZiAocmV0SW5mZXIuc3RhdHVzID09IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJMYWJlbHMgb2YgY2xvc2VzdCBwb2ludDpcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXRJbmZlci5jb21wb3VuZHMpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNvbmNlbnRyYXRpb25zIG9uIGNsb3Nlc3QgcG9pbnQ6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmV0SW5mZXIuY29uY2VudHJhdGlvbnMpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlBvaW50czpcXG5cIik7XHJcbiAgICAgICAgICAgICAgICB2YXIgbnVtUG9pbnRzID0gcmV0SW5mZXIudHJhaW5pbmdQb2ludHMubGVuZ3RoOyBcclxuICAgICAgICAgICAgICAgIGZvcih2YXIgaSA9MDtpPG51bVBvaW50czsrK2kpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmV0SW5mZXIudHJhaW5pbmdQb2ludHNbaV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlNjYW5uZWQgUG9pbnQ6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmV0SW5mZXIucmVjZW50UG9pbnQpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNsb3Nlc3QgU2FtcGxlOlxcblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLmNsb3Nlc3RTYW1wbGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBwbHNUZXN0KCkge1xyXG4gICAgICAgIHZhciB0cmFpbk9iaiA9IHtcclxuICAgICAgICAgICAgXCJhYnNvcmJhbmNlXCI6IFtbLTAuNzY1NzczLCAtMC43NTUzNjIsIC0wLjc2NDkzNiwgLTAuNjkxMzk2NjY3LCAtMC43MTU3NjAzMzMsIC0wLjcxNDAxMTY2NywgLTAuNzI4OTg2MzMzLCAtMC42OTgzMjYzMzMsIC0wLjcwMzYwMTY2NywgLTAuNjYwNTE4NjY3LCAtMC42NjE1NDE2NjcsIC0wLjYzMTc4NTY2NyxcclxuICAgICAgICAgLTAuNjI1MDkzLCAtMC42MTc0Mjc2NjcsIC0wLjU5MTUzMiwgLTAuNTgxOTkzNjY3LCAtMC42MTUxNzE2NjcsIC0wLjU2MDY4OSwgLTAuNTU5MTYxLCAtMC41NTk0MDYsIC0wLjU2MjA2NjY2NywgLTAuNTUzNDQ1LCAtMC41NjUzMTgzMzMsIC0wLjU5MDI5MTY2NywgLTAuNTU5MjU0NjY3LFxyXG4gICAgICAgICAtMC41ODI0MjI2NjcsIC0wLjU3NjY2NiwgLTAuNTc5OTYxLCAtMC41NzU3MTYsIC0wLjU4MzkwMTY2NywgLTAuNTg5OTE4MzMzLCAtMC41ODY2OTIzMzMsIC0wLjYwOTU0NywgLTAuNjEyMjkxLCAtMC42MDA4NzQzMzMsIC0wLjYyOTEyOSwgLTAuNTg2Mzk1NjY3LCAtMC41OTU3Nzg2NjcsXHJcbiAgICAgICAgIC0wLjU3NDE5MTMzMywgLTAuNTc1MzAwNjY3LCAtMC41NzExMjUsIC0wLjU2MTg1NzY2NywgLTAuNTUxNzU3NjY3LCAtMC41NDU3MDQ2NjcsIC0wLjUzNzIzMywgLTAuNTE3OTM4LCAtMC41MTY2MDI2NjcsIC0wLjU1NDc5MDY2NywgLTAuNTI0Njc0NjY3LCAtMC41MjQ5NzczMzMsIC0wLjUzNTY2OSxcclxuICAgICAgICAgLTAuNTM3NzE2NjY3LCAtMC41MTk1NTE2NjcsIC0wLjUyNzM2NzY2NywgLTAuNTEwMzgxLCAtMC40OTkzNTQ2NjcsIC0wLjQ4NzYwMTMzMywgLTAuNDkzNjg0NjY3LCAtMC40MTc4OTUsIC0wLjQwOTc0NjY2NywgLTAuMzc1MjgyLCAtMC4zNTc2MjA2NjcsIC0wLjM1ODEyLCAtMC4zMzgwMDUzMzMsIC0wLjMyMjM2MzY2NyxcclxuICAgICAgICAgLTAuMzI4MjI0NjY3LCAtMC4zMjA4MjYsIC0wLjI5NTA4NiwgLTAuMjg5MzUyLCAtMC4yODUwOTU2NjcsIC0wLjI2NzcxMzMzMywgLTAuMjc1MTA3NjY3LCAtMC4yNzI5ODYzMzMsIC0wLjI4MjgwNDMzMywgLTAuMjcxNjEzNjY3LCAtMC4yODgxNTk2NjcsIC0wLjI5OTM4NywgLTAuMjg3NDAyLCAtMC4yOTA0NzU2NjcsXHJcbiAgICAgICAgIC0wLjI3MTA0MTY2NywgLTAuMzA0Nzg3LCAtMC4yODczMjIsIC0wLjI5NTYwMDY2NywgLTAuMjg3OTc5MzMzLCAtMC4yNjk2MzE2NjcsIC0wLjI3OTI3NjMzMywgLTAuMjY5NDAzMzMzLCAtMC4yNzAxNDI2NjcsIC0wLjI2Njk0LCAtMC4yNTAwMzYzMzMsIC0wLjI2NTcwMzY2NywgLTAuMjcwMDA1MzMzLCAtMC4yNTI0ODksXHJcbiAgICAgICAgIC0wLjI0NTI1MzMzMywgLTAuMjI3NDI2MzMzLCAtMC4yMjA4MTksIC0wLjIyODIyMSwgLTAuMjQyNjU3LCAtMC4yNDY0MTQ2NjcsIC0wLjIyNTcxMTMzMywgLTAuMjMxNzg3MzMzLCAtMC4yMjE1NDA2NjcsIC0wLjIyODE2NywgLTAuMTk0MzIsIC0wLjIxMTY1LCAtMC4xOTQ5MTQzMzMsIC0wLjE2OTAwOCwgLTAuMTc2NTc5LFxyXG4gICAgICAgICAtMC4xNDUwMzA2NjcsIC0wLjEzMTY5NiwgLTAuMTIxODA1MzMzLCAtMC4wOTY2NzgsIC0wLjEwMTg1NzY2NywgLTAuMDgwNzQ0LCAtMC4wNTA5MjYsIC0wLjAzNTUyNTMzMywgLTAuMDI0OTk3LCAtMC4wMjEyNTYzMzMsIC0wLjAwNDk0OCwgMC4wMjAwMzc2NjcsIDAuMDM2NDAxNjY3LCAwLjAyNDUwNDMzMywgMC4wNDQ0Mzg2NjcsXHJcbiAgICAgICAgIDAuMDQxODE1MzMzLCAwLjA2Mjc2MSwgMC4wOTUyMTIsIDAuMTE1Mzk3NjY3LCAwLjE2Mzk4NywgMC4xOTU2MzY2NjcsIDAuMjEyNDQ4MzMzLCAwLjIzNzEwMTMzMywgMC4yNjI5NjA2NjcsIDAuMjQxODk1NjY3LCAwLjI4MzQxMDY2NywgMC4yODczMzk2NjcsIDAuMzAxOTM3NjY3LCAwLjMxNTUzOCwgMC4zMjcxOTUzMzMsXHJcbiAgICAgICAgIDAuMzUwNzM2NjY3LCAwLjM0MzQ0NzMzMywgMC4zODY3NzgsIDAuMzk5Njg0MzMzLCAwLjM5NjA2NSwgMC4zODY3MDc2NjcsIDAuMzk1NDYsIDAuMzc0MTkzNjY3LCAwLjM4ODAxMDY2NywgMC4zNjU5NzQzMzMsIDAuMzIyNzEsIDAuMzE0MDQxNjY3LCAwLjI4NzM5NiwgMC4yNzc2MTI2NjcsIDAuMjc4ODIxMzMzLCAwLjI3OTc3OSxcclxuICAgICAgICAgMC4yNTc0MTAzMzMsIDAuMjY5MjQ1NjY3LCAwLjI5NzM0NzMzMywgMC4zMTA2NDIzMzMsIDAuMjk4ODg3NjY3LCAwLjI5MDg0OTMzMywgMC4yNzg4NTI2NjcsIDAuMjQxMzM5NjY3LCAwLjI0NTI2MDMzMywgMC4zMDkzNTQzMzMsIDAuMzA3NTUxNjY3LCAwLjM0MjA5MSwgMC4zMjMxNzgsIDAuMzM1Mjc2NjY3LCAwLjMyNDcxNCxcclxuICAgICAgICAgMC4zMzMwNTI2NjcsIDAuMjk4NDExLCAwLjI3NjA1NywgMC4yNTU4OTI2NjcsIDAuMjA1ODgsIDAuMTk4Njg3MzMzLCAwLjE0MDQxOCwgMC4yMDIxNDQzMzMsIDAuMTg1MzA2NjY3LCAwLjE5Mzc3MywgMC4xNTE1NTUzMzMsIDAuMTcwODM2NjY3LCAwLjE2NjI0MSwgMC4xNTAyNjUzMzMsIDAuMTY1ODkxNjY3LCAwLjE1MzIwMyxcclxuICAgICAgICAgMC4xNzE5Nzg2NjcsIDAuMTM1MDM1MzMzLCAwLjE3MTA1NjMzMywgMC4yMjYxOTMsIDAuMTcyMDE3LCAwLjI1MDg5NzY2NywgMC4yNzIyNTgzMzMsIDAuMTgxMzY1LCAwLjE2MzcwNzMzMywgMC4xNjM4NjQ2NjcsIDAuMTUxODMwMzMzLCAwLjE0OTQwNywgMC4xMDYzMjk2NjcsIDAuMDc4ODA5LCAwLjA3MDc0NixcclxuICAgICAgICAgMC4xMTE0OSwgMC4wMzg5NTkzMzMsIDAuMDgwODMxLCAwLjA5MTM3MDY2NywgMC4wNzUxMjA2NjcsIDAuMDA0NzUwMzMzLCAwLjAwMzQ4ODY2NywgMC4wNjc0NDkzMzMsIDAuMDM5MDk0NjY3LCAwLjEwMjAwMjY2NywgMC4wNTczMzMzMzMsIDAuMTYyMTI3MzMzLCAwLjI1MDI3NDMzMywgMC4wNzcxMDYzMzMsIDAuMjMzMzI0LFxyXG4gICAgICAgICAwLjI1NTMyMSwgMC4zNjI0MzgzMzMsIC0wLjA0OTIwMDMzMywgLTAuMDczMjgyMzMzLCAtMC40NzA0NDgsIC0wLjMxNDgyODUsIC0wLjkwNDY3NSwgLTAuNzE3MjU0LCAtMC44ODc1ODgsIDAsIDAsIDAsIDBdLFxyXG4gICAgICAgICBbLTAuMzQ2NDk0LCAtMC4zMzMwMTk2NjcsIC0wLjM0NTIwOTMzMywgLTAuMjczNDUwNjY3LCAtMC4yOTY2MTgsIC0wLjMxOTgwNjY2NywgLTAuMzU3OTk0NjY3LCAtMC4zNTkxOTQ2NjcsIC0wLjM5MDY3ODMzMywgLTAuMzUyMzUxMzMzLCAtMC4zNzUzNzUzMzMsIC0wLjM2NTI4MzY2NywgLTAuMzY3Nzg2LFxyXG4tMC4zNzczNDcsIC0wLjM2NDE1MDY2NywgLTAuMzYwOTM1MzMzLCAtMC4zOTE1NDkzMzMsIC0wLjM0MDQ3MSwgLTAuMzQzMTYyLCAtMC4zNTAyMzUzMzMsIC0wLjM1NDc5NjY2NywgLTAuMzQ1NzExNjY3LCAtMC4zNDM5MTQzMzMsIC0wLjM3NTI1MTMzMywgLTAuMzQwMzM1LCAtMC4zNTE0OTQ2NjcsIC0wLjM0MTQ4MjY2NyxcclxuLTAuMzQyOTU4NjY3LCAtMC4zMzUyOTcsIC0wLjMzNzAwNSwgLTAuMzQyNDQ1MzMzLCAtMC4zMzY0OTgsIC0wLjM1OTI4NDMzMywgLTAuMzU3MDY5NjY3LCAtMC4zNTY5NTEzMzMsIC0wLjM4MDYwMywgLTAuMzQyNzEzLCAtMC4zNTMxOTUsIC0wLjMzODQxNzMzMywgLTAuMzQ4MzY2NjY3LCAtMC4zNDQ5OTYzMzMsXHJcbi0wLjM0NTgxOCwgLTAuMzUwNjE5MzMzLCAtMC4zNDcyNjIzMzMsIC0wLjM1MTM5MDY2NywgLTAuMzM5NjU0NjY3LCAtMC4zNDM0ODQzMzMsIC0wLjM5MTQ5LCAtMC4zNjU2Nzk2NjcsIC0wLjM3NjY0MzMzMywgLTAuMzk1NTIzLCAtMC4zOTgxNTA2NjcsIC0wLjM3NDk3MzY2NywgLTAuMzkzMjA3LCAtMC4zODAyMTQ2NjcsXHJcbi0wLjM3MTI0OTMzMywgLTAuMzYxMzQ3LCAtMC4zNjczOTgzMzMsIC0wLjI4MDAwMywgLTAuMjUzNzEzNjY3LCAtMC4yMDI4NzQsIC0wLjE3NDUzMjMzMywgLTAuMTMzMzcxMzMzLCAtMC4wOTE2ODIsIC0wLjA0MTgyOTY2NywgLTAuMDE2NzIzNjY3LCAwLjAyMjY3MzY2NywgMC4xMDEzNTc2NjcsIDAuMTYxNjksXHJcbjAuMjM2Mzc1MzMzLCAwLjI5OTI3NTMzMywgMC4zNDYwNzYzMzMsIDAuMzc5NDA1LCAwLjM3NDU1OSwgMC40MDE0NTIsIDAuMzgwODc4NjY3LCAwLjM2MTYxNCwgMC4zODc3MTgsIDAuMzQ3NjM0LCAwLjMxMjc2OSwgMC4yMjk5NDQsIDAuMTk2NjYyMzMzLCAwLjEyODY2NTMzMywgMC4wNzg0OTUsIDAuMDM1MDg3LFxyXG4tMC4wMzg2MTUzMzMsIC0wLjA1OTQwNjY2NywgLTAuMTAwNjI3MzMzLCAtMC4xMjgyMTI2NjcsIC0wLjE0MzM4MjMzMywgLTAuMTk0OTY1MzMzLCAtMC4yMTA1NjcsIC0wLjIyMTQ3MTMzMywgLTAuMjM5MTA5MzMzLCAtMC4yNDQ0NTUsIC0wLjI1Njg1NDY2NywgLTAuMjc1NTA3MzMzLCAtMC4zMDI5ODczMzMsXHJcbi0wLjMxNzQ5MiwgLTAuMzA4MDA1NjY3LCAtMC4zMjEzNjcsIC0wLjMyNTcwODY2NywgLTAuMzQ0ODIwNjY3LCAtMC4zMjYyMzUzMzMsIC0wLjM1NjI4NSwgLTAuMzQ3MDU1NjY3LCAtMC4zNDA5MjIsIC0wLjM1ODMwMDY2NywgLTAuMzMxMjE4MzMzLCAtMC4zNDE3OTIsIC0wLjM0MzY5MSwgLTAuMzMwMTYzMzMzLFxyXG4tMC4zNDY1ODk2NjcsIC0wLjMyOTk1OSwgLTAuMzAzMjUyLCAtMC4yODI2ODgsIC0wLjI2MTgxMjY2NywgLTAuMjI1NDEsIC0wLjE3NzcxNTMzMywgLTAuMTE4MDQ0NjY3LCAtMC4wODAxMjQsIC0wLjAzNjQyNzY2NywgMC4wMjYxNTk2NjcsIDAuMDYwMzM4LCAwLjEyOTU0MiwgMC4xODA4MjMsIDAuMjEzODg1MzMzLFxyXG4wLjIyOTg3NDMzMywgMC4yNzE3MDc2NjcsIDAuMjI2NzI4NjY3LCAwLjIxMzc2MzY2NywgMC4yMjUyNzksIDAuMjIxNzU3LCAwLjI3MDMzMjY2NywgMC4yNzU1NzkzMzMsIDAuMjYwMTY2MzMzLCAwLjIyOTU5NzY2NywgMC4yMjk1OTI2NjcsIDAuMjEwOTIyLCAwLjE4OTE5MzY2NywgMC4xNzM2NTkzMzMsIDAuMTM4NTU0LFxyXG4wLjEyNDkwNTY2NywgMC4wOTQwODczMzMsIDAuMDc2MTU2NjY3LCAwLjAzMzk2OSwgMC4wMTk4Mzg2NjcsIC0wLjAwODAyNSwgLTAuMDQyODgxNjY3LCAtMC4wNjM3MzUsIC0wLjA4NDgwODMzMywgLTAuMDg3NjczMzMzLCAtMC4xMTI4ODksIC0wLjExNzczMDMzMywgLTAuMTQzMTkzLCAtMC4xNDAwMTY2NjcsXHJcbi0wLjEzODI4NDY2NywgLTAuMTM0ODc4NjY3LCAtMC4xNjM2NDg2NjcsIC0wLjE0MTA1NTY2NywgLTAuMTYwNTI5MzMzLCAtMC4xOTM1NDAzMzMsIC0wLjE5ODIwMTY2NywgLTAuMTc2MjI2MzMzLCAtMC4yMDk4MDMsIC0wLjE4NTc3MSwgLTAuMTg3NjI4MzMzLCAtMC4yMDEyMjk2NjcsIC0wLjIwNDMwNzMzMyxcclxuLTAuMjEwNDkzLCAtMC4yMzk3MzMsIC0wLjIzMDUzLCAtMC4yNjk5MDUsIC0wLjI2OTAzNjMzMywgLTAuMjgzMDc4MzMzLCAtMC4zMDM4NDEzMzMsIC0wLjI4MTk2ODMzMywgLTAuMjcyMDM1LCAtMC4yNTgwMjksIC0wLjI4MjA0MjMzMywgLTAuMjkwMDY2NjY3LCAtMC4yODA0OTQ2NjcsIC0wLjI4MzE2MTMzMyxcclxuLTAuMjc0MjIzMzMzLCAtMC4yODAxOTYsIC0wLjIzNjEwMSwgLTAuMjY2MTQyNjY3LCAtMC4yMzMzMzU2NjcsIC0wLjIyODgyMjY2NywgLTAuMjU2MjY2LCAtMC4yMTYzOTEzMzMsIC0wLjIwMjUyNjMzMywgLTAuMjU2MjkwMzMzLCAtMC4yMzcxMjEsIC0wLjI0NDU0NCwgLTAuMjUzMDcyLCAtMC4xODUzOTUsXHJcbi0wLjI1Njk1NCwgLTAuMjE1MTk5LCAtMC4yMDYxOTIzMzMsIC0wLjE3NjM3OCwgLTAuMjEwNzkzLCAtMC4xMTIzNTcsIC0wLjA2MjE3OTMzMywgLTAuMDc1NTA5MzMzLCAtMC4wOTM5OTUsIC0wLjAzMzM3LCAwLjAwODgwNDMzMywgLTAuMDM5ODkwMzMzLCAwLjExNzg0MzMzMywgMC4wMjQwNTYsIDAuMTEyMTk5MzMzLFxyXG4wLjEzOTk1OSwgMC4wMjg2MDg2NjcsIDAuMjAzNjA1NjY3LCAwLjEyOTc3NDY2NywgMC4yMzcwOTE2NjcsIDAuMTgzNzY1MzMzLCAtMC4xMDQzMzc2NjcsIC0wLjM3NjY3MTUsIC0wLjQ0NDc2OCwgLTAuNjk2MDg1NSwgLTAuNDU5Mjg1NSwgLTAuNzIyNjY2LCAwLCAwLCAwLFxyXG4wLCBdXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFwiY29uY2VudHJhdGlvblwiOiBbWzEsIDBdLCBbMCwgMV1dLFxyXG4gICAgICAgICAgICBcImNvbmNlbnRyYXRpb25MYWJlbHNcIjogW1wiU2tpbSBNaWxrXCIsIFwiT2xpdmUgT2lsXCJdXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdmFyIGRldGVjdGVkQWJzb3JiYW5jZXMgPSBbLTAuNzY1NzczLCAtMC43NTUzNjIsIC0wLjc2NDkzNiwgLTAuNjkxMzk2NjY3LCAtMC43MTU3NjAzMzMsIC0wLjcxNDAxMTY2NywgLTAuNzI4OTg2MzMzLCAtMC42OTgzMjYzMzMsIC0wLjcwMzYwMTY2NywgLTAuNjYwNTE4NjY3LCAtMC42NjE1NDE2NjcsIC0wLjYzMTc4NTY2NyxcclxuICAgICAgICAgICAgICAgICAtMC42MjUwOTMsIC0wLjYxNzQyNzY2NywgLTAuNTkxNTMyLCAtMC41ODE5OTM2NjcsIC0wLjYxNTE3MTY2NywgLTAuNTYwNjg5LCAtMC41NTkxNjEsIC0wLjU1OTQwNiwgLTAuNTYyMDY2NjY3LCAtMC41NTM0NDUsIC0wLjU2NTMxODMzMywgLTAuNTkwMjkxNjY3LCAtMC41NTkyNTQ2NjcsXHJcbiAgICAgICAgICAgICAgICAgLTAuNTgyNDIyNjY3LCAtMC41NzY2NjYsIC0wLjU3OTk2MSwgLTAuNTc1NzE2LCAtMC41ODM5MDE2NjcsIC0wLjU4OTkxODMzMywgLTAuNTg2NjkyMzMzLCAtMC42MDk1NDcsIC0wLjYxMjI5MSwgLTAuNjAwODc0MzMzLCAtMC42MjkxMjksIC0wLjU4NjM5NTY2NywgLTAuNTk1Nzc4NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjU3NDE5MTMzMywgLTAuNTc1MzAwNjY3LCAtMC41NzExMjUsIC0wLjU2MTg1NzY2NywgLTAuNTUxNzU3NjY3LCAtMC41NDU3MDQ2NjcsIC0wLjUzNzIzMywgLTAuNTE3OTM4LCAtMC41MTY2MDI2NjcsIC0wLjU1NDc5MDY2NywgLTAuNTI0Njc0NjY3LCAtMC41MjQ5NzczMzMsIC0wLjUzNTY2OSxcclxuICAgICAgICAgICAgICAgICAtMC41Mzc3MTY2NjcsIC0wLjUxOTU1MTY2NywgLTAuNTI3MzY3NjY3LCAtMC41MTAzODEsIC0wLjQ5OTM1NDY2NywgLTAuNDg3NjAxMzMzLCAtMC40OTM2ODQ2NjcsIC0wLjQxNzg5NSwgLTAuNDA5NzQ2NjY3LCAtMC4zNzUyODIsIC0wLjM1NzYyMDY2NywgLTAuMzU4MTIsIC0wLjMzODAwNTMzMywgLTAuMzIyMzYzNjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjMyODIyNDY2NywgLTAuMzIwODI2LCAtMC4yOTUwODYsIC0wLjI4OTM1MiwgLTAuMjg1MDk1NjY3LCAtMC4yNjc3MTMzMzMsIC0wLjI3NTEwNzY2NywgLTAuMjcyOTg2MzMzLCAtMC4yODI4MDQzMzMsIC0wLjI3MTYxMzY2NywgLTAuMjg4MTU5NjY3LCAtMC4yOTkzODcsIC0wLjI4NzQwMiwgLTAuMjkwNDc1NjY3LFxyXG4gICAgICAgICAgICAgICAgIC0wLjI3MTA0MTY2NywgLTAuMzA0Nzg3LCAtMC4yODczMjIsIC0wLjI5NTYwMDY2NywgLTAuMjg3OTc5MzMzLCAtMC4yNjk2MzE2NjcsIC0wLjI3OTI3NjMzMywgLTAuMjY5NDAzMzMzLCAtMC4yNzAxNDI2NjcsIC0wLjI2Njk0LCAtMC4yNTAwMzYzMzMsIC0wLjI2NTcwMzY2NywgLTAuMjcwMDA1MzMzLCAtMC4yNTI0ODksXHJcbiAgICAgICAgICAgICAgICAgLTAuMjQ1MjUzMzMzLCAtMC4yMjc0MjYzMzMsIC0wLjIyMDgxOSwgLTAuMjI4MjIxLCAtMC4yNDI2NTcsIC0wLjI0NjQxNDY2NywgLTAuMjI1NzExMzMzLCAtMC4yMzE3ODczMzMsIC0wLjIyMTU0MDY2NywgLTAuMjI4MTY3LCAtMC4xOTQzMiwgLTAuMjExNjUsIC0wLjE5NDkxNDMzMywgLTAuMTY5MDA4LCAtMC4xNzY1NzksXHJcbiAgICAgICAgICAgICAgICAgLTAuMTQ1MDMwNjY3LCAtMC4xMzE2OTYsIC0wLjEyMTgwNTMzMywgLTAuMDk2Njc4LCAtMC4xMDE4NTc2NjcsIC0wLjA4MDc0NCwgLTAuMDUwOTI2LCAtMC4wMzU1MjUzMzMsIC0wLjAyNDk5NywgLTAuMDIxMjU2MzMzLCAtMC4wMDQ5NDgsIDAuMDIwMDM3NjY3LCAwLjAzNjQwMTY2NywgMC4wMjQ1MDQzMzMsIDAuMDQ0NDM4NjY3LFxyXG4gICAgICAgICAgICAgICAgIDAuMDQxODE1MzMzLCAwLjA2Mjc2MSwgMC4wOTUyMTIsIDAuMTE1Mzk3NjY3LCAwLjE2Mzk4NywgMC4xOTU2MzY2NjcsIDAuMjEyNDQ4MzMzLCAwLjIzNzEwMTMzMywgMC4yNjI5NjA2NjcsIDAuMjQxODk1NjY3LCAwLjI4MzQxMDY2NywgMC4yODczMzk2NjcsIDAuMzAxOTM3NjY3LCAwLjMxNTUzOCwgMC4zMjcxOTUzMzMsXHJcbiAgICAgICAgICAgICAgICAgMC4zNTA3MzY2NjcsIDAuMzQzNDQ3MzMzLCAwLjM4Njc3OCwgMC4zOTk2ODQzMzMsIDAuMzk2MDY1LCAwLjM4NjcwNzY2NywgMC4zOTU0NiwgMC4zNzQxOTM2NjcsIDAuMzg4MDEwNjY3LCAwLjM2NTk3NDMzMywgMC4zMjI3MSwgMC4zMTQwNDE2NjcsIDAuMjg3Mzk2LCAwLjI3NzYxMjY2NywgMC4yNzg4MjEzMzMsIDAuMjc5Nzc5LFxyXG4gICAgICAgICAgICAgICAgIDAuMjU3NDEwMzMzLCAwLjI2OTI0NTY2NywgMC4yOTczNDczMzMsIDAuMzEwNjQyMzMzLCAwLjI5ODg4NzY2NywgMC4yOTA4NDkzMzMsIDAuMjc4ODUyNjY3LCAwLjI0MTMzOTY2NywgMC4yNDUyNjAzMzMsIDAuMzA5MzU0MzMzLCAwLjMwNzU1MTY2NywgMC4zNDIwOTEsIDAuMzIzMTc4LCAwLjMzNTI3NjY2NywgMC4zMjQ3MTQsXHJcbiAgICAgICAgICAgICAgICAgMC4zMzMwNTI2NjcsIDAuMjk4NDExLCAwLjI3NjA1NywgMC4yNTU4OTI2NjcsIDAuMjA1ODgsIDAuMTk4Njg3MzMzLCAwLjE0MDQxOCwgMC4yMDIxNDQzMzMsIDAuMTg1MzA2NjY3LCAwLjE5Mzc3MywgMC4xNTE1NTUzMzMsIDAuMTcwODM2NjY3LCAwLjE2NjI0MSwgMC4xNTAyNjUzMzMsIDAuMTY1ODkxNjY3LCAwLjE1MzIwMyxcclxuICAgICAgICAgICAgICAgICAwLjE3MTk3ODY2NywgMC4xMzUwMzUzMzMsIDAuMTcxMDU2MzMzLCAwLjIyNjE5MywgMC4xNzIwMTcsIDAuMjUwODk3NjY3LCAwLjI3MjI1ODMzMywgMC4xODEzNjUsIDAuMTYzNzA3MzMzLCAwLjE2Mzg2NDY2NywgMC4xNTE4MzAzMzMsIDAuMTQ5NDA3LCAwLjEwNjMyOTY2NywgMC4wNzg4MDksIDAuMDcwNzQ2LFxyXG4gICAgICAgICAgICAgICAgIDAuMTExNDksIDAuMDM4OTU5MzMzLCAwLjA4MDgzMSwgMC4wOTEzNzA2NjcsIDAuMDc1MTIwNjY3LCAwLjAwNDc1MDMzMywgMC4wMDM0ODg2NjcsIDAuMDY3NDQ5MzMzLCAwLjAzOTA5NDY2NywgMC4xMDIwMDI2NjcsIDAuMDU3MzMzMzMzLCAwLjE2MjEyNzMzMywgMC4yNTAyNzQzMzMsIDAuMDc3MTA2MzMzLCAwLjIzMzMyNCxcclxuICAgICAgICAgICAgICAgICAwLjI1NTMyMSwgMC4zNjI0MzgzMzMsIC0wLjA0OTIwMDMzMywgLTAuMDczMjgyMzMzLCAtMC40NzA0NDgsIC0wLjMxNDgyODUsIC0wLjkwNDY3NSwgLTAuNzE3MjU0LCAtMC44ODc1ODgsIDAsIDAsIDAsIDBdO1xyXG5cclxuICAgICAgICBhbGVydChcIlBMUyB0ZXN0IGNvbW1lbmNlXCIpO1xyXG5cclxuICAgICAgICB2YXIgdHJhaW5SZXN1bHQgPSBuZXdUcmFpbih0cnVlLCB0cmFpbk9iai5hYnNvcmJhbmNlLCB0cmFpbk9iai5jb25jZW50cmF0aW9uLCB0cmFpbk9iai5jb25jZW50cmF0aW9uTGFiZWxzKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIlRyYWluaW5nIFN0YXR1czogXCIpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGZsYWdUb1N0cmluZyh0cmFpblJlc3VsdCkpO1xyXG4gICAgICAgIGlmKHRyYWluUmVzdWx0PT1jaGVtb0ZsYWdzLnN1Y2Nlc3MpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB2YXIgaW5mZXJSZXN1bHQgPSBuZXdJbmZlcihkZXRlY3RlZEFic29yYmFuY2VzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJJbmZlciBTdGF0dXM6IFwiKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coZmxhZ1RvU3RyaW5nKGluZmVyUmVzdWx0LnN0YXR1cykpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlxcblwiKTtcclxuICAgICAgICAgICAgaWYoaW5mZXJSZXN1bHQuc3RhdHVzPT1jaGVtb0ZsYWdzLnN1Y2Nlc3MpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTGFiZWxzIG9mIG5vbi16ZXJvIGNoZW1zOlwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGluZmVyUmVzdWx0LmNvbXBvdW5kcyk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIm5vbi16ZXJvIGNoZW1zOlwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGluZmVyUmVzdWx0LmNvbmNlbnRyYXRpb25zKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG9yaWVudExhYmVscyhsYWJlbHMsIGNvbmNlbnRyYXRpb25zKVxyXG4gICAge1xyXG4gICAgICAgIHZhciBudW1MYWJlbHNPbGQgPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMubGVuZ3RoO1xyXG4gICAgICAgIHZhciBjdXJyZW50RW5kID0gbnVtTGFiZWxzT2xkO1xyXG4gICAgICAgIHZhciBudW1Ob3RGb3VuZCA9IDA7XHJcbiAgICAgICAgLy9Gb3IgZWFjaCBpbmRleCBpIG9mIGxvY2F0aW9uQXJyLCB0YWtlIGl0aCBpbmRleCBvZiBsYWJlbHMgYW5kIHB1dCBpdCBhdCBsb2NhdGlvbkFycltpXVxyXG4gICAgICAgIHZhciBsb2NhdGlvbkFyciA9IFtdO1xyXG4gICAgICAgIC8vRm9yIGVhY2ggbGFiZWwsIGxvb2sgZm9yIGl0IGluIHRoZSBwcmV2aW91cyBsYWJlbHMuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsYWJlbHMubGVuZ3RoOyArK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB2YXIgbm90Rm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAvL2xvb2sgZm9yIGV4aXN0aW5nIGxhYmVsXHJcbiAgICAgICAgICAgIGZvcih2YXIgaiA9IDA7IGo8bnVtTGFiZWxzT2xkOyArK2opXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vSWYgZXhpc3RzLCBwb2ludCBpbmRleCBpIHRvIGluZGV4IGpcclxuICAgICAgICAgICAgICAgIGlmKGxhYmVsc1tpXT09Y2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2pdKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGxvY2F0aW9uQXJyW2ldID0gajtcclxuICAgICAgICAgICAgICAgICAgICBub3RGb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vSWYgbm90IGZvdW5kLCBwb2ludCBpbmRleCBpIHRvIHRoZSBlbmQgb2Ygb2xkIGxhYmVsIGFycmF5XHJcbiAgICAgICAgICAgIC8vYW5kIGFkZCBuZXcgbGFiZWwgdG8gb2xkIGxhYmVsIGFycmF5XHJcbiAgICAgICAgICAgIGlmKG5vdEZvdW5kKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB2YXIgbmV4dExhYmVsID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNoZW1vQ29uY2VudHJhdGlvbkxhYmVsc1tuZXh0TGFiZWxdID0gbGFiZWxzW2ldO1xyXG4gICAgICAgICAgICAgICAgbG9jYXRpb25BcnJbaV0gPSBuZXh0TGFiZWw7XHJcbiAgICAgICAgICAgICAgICBudW1Ob3RGb3VuZCArPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vVGFrZSB0aGUgY29uY2VudHJhdGlvbnMgd2UgYXJlIGFkZGluZyBhbmQgdXNlIGxvY2F0aW9uIGFycmF5XHJcbiAgICAgICAgLy90byBtb3ZlIHRoZSBjb25jZW50cmF0aW9ucyBhcmUgYXBwcm9wcmlhdGVseS4gMHMgZm9yIGNvbmNlbnRyYXRpb25zIHRoYXQgZG9uJ3QgZXhpc3QuXHJcbiAgICAgICAgdmFyIG5ld0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICAgICAgdmFyIHRvdGFsRWxlbSA9IGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscy5sZW5ndGg7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b3RhbEVsZW07ICsraSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG5ld0NvbmNlbnRyYXRpb25zW25ld0NvbmNlbnRyYXRpb25zLmxlbmd0aF0gPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpPGxvY2F0aW9uQXJyLmxlbmd0aDsrK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBuZXdDb25jZW50cmF0aW9uc1tsb2NhdGlvbkFycltpXV0gPSBjb25jZW50cmF0aW9uc1tpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy9Ib3cgbWFueSBuZXcgY2hlbWljYWxzIGZvdW5kP1xyXG4gICAgICAgIHZhciBhZGRpdGlvbmFsWmVyb2VzID0gW107XHJcbiAgICAgICAgZm9yKHZhciBpID0gMDtpPG51bU5vdEZvdW5kOysraSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFkZGl0aW9uYWxaZXJvZXNbaV0gPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL091ciBvbGQgc2FtcGxlcyBoYXZlIG5vbmUgb2YgdGhlc2UgbmV3IGNoZW1pY2Fscy5cclxuICAgICAgICB2YXIgbnVtU2FtcGxlcyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGg7XHJcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaTwgbnVtU2FtcGxlczsrK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbaV0gPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbaV0uY29uY2F0KGFkZGl0aW9uYWxaZXJvZXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL0FkZCBuZXcgc2FtcGxlLlxyXG4gICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tudW1TYW1wbGVzXSA9IG5ld0NvbmNlbnRyYXRpb25zO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHVwZGF0ZURhdGEoYWJzb3JiYW5jZXMsIGNvbmNlbnRyYXRpb25zLCBsYWJlbHMsIHNhbXBsZU5hbWUpIHtcclxuICAgICAgICAvL1JlcGxhY2UgTmFOcyB3aXRoIDBzIGluIHRoZSBhYnNvcmJhbmNlcyBhbmQgYWRkIGFic29yYmFuY2VzLlxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWJzb3JiYW5jZXMubGVuZ3RoOyArK2kpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZihpc05hTihhYnNvcmJhbmNlc1tpXSkpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGFic29yYmFuY2VzW2ldID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL0FkZCBhIG5ldyByb3cgdG8gYWJzb3JiYW5jZXNcclxuICAgICAgICB2YXIgbmV4dEFic29yYmFuY2VJbmRleCA9IGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGg7XHJcbiAgICAgICAgY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzW25leHRBYnNvcmJhbmNlSW5kZXhdID0gYWJzb3JiYW5jZXM7XHJcbiAgICAgICAgaWYoY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zLmxlbmd0aD09MClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXSA9IGNvbmNlbnRyYXRpb25zO1xyXG4gICAgICAgICAgICBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHM9bGFiZWxzO1xyXG4gICAgICAgICAgICBjaGVtb1NhbXBsZU5hbWVzWzBdPXNhbXBsZU5hbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHZhciBuZXh0U2FtcGxlTmFtZSA9IGNoZW1vU2FtcGxlTmFtZXMubGVuZ3RoO1xyXG4gICAgICAgICAgICBjaGVtb1NhbXBsZU5hbWVzW25leHRTYW1wbGVOYW1lXSA9IHNhbXBsZU5hbWU7XHJcbiAgICAgICAgICAgIG9yaWVudExhYmVscyhsYWJlbHMsIGNvbmNlbnRyYXRpb25zKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIHVwZGF0ZVRlc3QoKSB7XHJcbiAgICAgICAgdmFyIHRyYWluT2JqID0ge1xyXG4gICAgICAgICAgICBcImFic29yYmFuY2VcIjogW1stMC43NjU3NzMsIC0wLjc1NTM2MiwgLTAuNzY0OTM2LCAtMC42OTEzOTY2NjcsIC0wLjcxNTc2MDMzMywgLTAuNzE0MDExNjY3LCAtMC43Mjg5ODYzMzMsIC0wLjY5ODMyNjMzMywgLTAuNzAzNjAxNjY3LCAtMC42NjA1MTg2NjcsIC0wLjY2MTU0MTY2NywgLTAuNjMxNzg1NjY3LFxyXG4gICAgICAgICAtMC42MjUwOTMsIC0wLjYxNzQyNzY2NywgLTAuNTkxNTMyLCAtMC41ODE5OTM2NjcsIC0wLjYxNTE3MTY2NywgLTAuNTYwNjg5LCAtMC41NTkxNjEsIC0wLjU1OTQwNiwgLTAuNTYyMDY2NjY3LCAtMC41NTM0NDUsIC0wLjU2NTMxODMzMywgLTAuNTkwMjkxNjY3LCAtMC41NTkyNTQ2NjcsXHJcbiAgICAgICAgIC0wLjU4MjQyMjY2NywgLTAuNTc2NjY2LCAtMC41Nzk5NjEsIC0wLjU3NTcxNiwgLTAuNTgzOTAxNjY3LCAtMC41ODk5MTgzMzMsIC0wLjU4NjY5MjMzMywgLTAuNjA5NTQ3LCAtMC42MTIyOTEsIC0wLjYwMDg3NDMzMywgLTAuNjI5MTI5LCAtMC41ODYzOTU2NjcsIC0wLjU5NTc3ODY2NyxcclxuICAgICAgICAgLTAuNTc0MTkxMzMzLCAtMC41NzUzMDA2NjcsIC0wLjU3MTEyNSwgLTAuNTYxODU3NjY3LCAtMC41NTE3NTc2NjcsIC0wLjU0NTcwNDY2NywgLTAuNTM3MjMzLCAtMC41MTc5MzgsIC0wLjUxNjYwMjY2NywgLTAuNTU0NzkwNjY3LCAtMC41MjQ2NzQ2NjcsIC0wLjUyNDk3NzMzMywgLTAuNTM1NjY5LFxyXG4gICAgICAgICAtMC41Mzc3MTY2NjcsIC0wLjUxOTU1MTY2NywgLTAuNTI3MzY3NjY3LCAtMC41MTAzODEsIC0wLjQ5OTM1NDY2NywgLTAuNDg3NjAxMzMzLCAtMC40OTM2ODQ2NjcsIC0wLjQxNzg5NSwgLTAuNDA5NzQ2NjY3LCAtMC4zNzUyODIsIC0wLjM1NzYyMDY2NywgLTAuMzU4MTIsIC0wLjMzODAwNTMzMywgLTAuMzIyMzYzNjY3LFxyXG4gICAgICAgICAtMC4zMjgyMjQ2NjcsIC0wLjMyMDgyNiwgLTAuMjk1MDg2LCAtMC4yODkzNTIsIC0wLjI4NTA5NTY2NywgLTAuMjY3NzEzMzMzLCAtMC4yNzUxMDc2NjcsIC0wLjI3Mjk4NjMzMywgLTAuMjgyODA0MzMzLCAtMC4yNzE2MTM2NjcsIC0wLjI4ODE1OTY2NywgLTAuMjk5Mzg3LCAtMC4yODc0MDIsIC0wLjI5MDQ3NTY2NyxcclxuICAgICAgICAgLTAuMjcxMDQxNjY3LCAtMC4zMDQ3ODcsIC0wLjI4NzMyMiwgLTAuMjk1NjAwNjY3LCAtMC4yODc5NzkzMzMsIC0wLjI2OTYzMTY2NywgLTAuMjc5Mjc2MzMzLCAtMC4yNjk0MDMzMzMsIC0wLjI3MDE0MjY2NywgLTAuMjY2OTQsIC0wLjI1MDAzNjMzMywgLTAuMjY1NzAzNjY3LCAtMC4yNzAwMDUzMzMsIC0wLjI1MjQ4OSxcclxuICAgICAgICAgLTAuMjQ1MjUzMzMzLCAtMC4yMjc0MjYzMzMsIC0wLjIyMDgxOSwgLTAuMjI4MjIxLCAtMC4yNDI2NTcsIC0wLjI0NjQxNDY2NywgLTAuMjI1NzExMzMzLCAtMC4yMzE3ODczMzMsIC0wLjIyMTU0MDY2NywgLTAuMjI4MTY3LCAtMC4xOTQzMiwgLTAuMjExNjUsIC0wLjE5NDkxNDMzMywgLTAuMTY5MDA4LCAtMC4xNzY1NzksXHJcbiAgICAgICAgIC0wLjE0NTAzMDY2NywgLTAuMTMxNjk2LCAtMC4xMjE4MDUzMzMsIC0wLjA5NjY3OCwgLTAuMTAxODU3NjY3LCAtMC4wODA3NDQsIC0wLjA1MDkyNiwgLTAuMDM1NTI1MzMzLCAtMC4wMjQ5OTcsIC0wLjAyMTI1NjMzMywgLTAuMDA0OTQ4LCAwLjAyMDAzNzY2NywgMC4wMzY0MDE2NjcsIDAuMDI0NTA0MzMzLCAwLjA0NDQzODY2NyxcclxuICAgICAgICAgMC4wNDE4MTUzMzMsIDAuMDYyNzYxLCAwLjA5NTIxMiwgMC4xMTUzOTc2NjcsIDAuMTYzOTg3LCAwLjE5NTYzNjY2NywgMC4yMTI0NDgzMzMsIDAuMjM3MTAxMzMzLCAwLjI2Mjk2MDY2NywgMC4yNDE4OTU2NjcsIDAuMjgzNDEwNjY3LCAwLjI4NzMzOTY2NywgMC4zMDE5Mzc2NjcsIDAuMzE1NTM4LCAwLjMyNzE5NTMzMyxcclxuICAgICAgICAgMC4zNTA3MzY2NjcsIDAuMzQzNDQ3MzMzLCAwLjM4Njc3OCwgMC4zOTk2ODQzMzMsIDAuMzk2MDY1LCAwLjM4NjcwNzY2NywgMC4zOTU0NiwgMC4zNzQxOTM2NjcsIDAuMzg4MDEwNjY3LCAwLjM2NTk3NDMzMywgMC4zMjI3MSwgMC4zMTQwNDE2NjcsIDAuMjg3Mzk2LCAwLjI3NzYxMjY2NywgMC4yNzg4MjEzMzMsIDAuMjc5Nzc5LFxyXG4gICAgICAgICAwLjI1NzQxMDMzMywgMC4yNjkyNDU2NjcsIDAuMjk3MzQ3MzMzLCAwLjMxMDY0MjMzMywgMC4yOTg4ODc2NjcsIDAuMjkwODQ5MzMzLCAwLjI3ODg1MjY2NywgMC4yNDEzMzk2NjcsIDAuMjQ1MjYwMzMzLCAwLjMwOTM1NDMzMywgMC4zMDc1NTE2NjcsIDAuMzQyMDkxLCAwLjMyMzE3OCwgMC4zMzUyNzY2NjcsIDAuMzI0NzE0LFxyXG4gICAgICAgICAwLjMzMzA1MjY2NywgMC4yOTg0MTEsIDAuMjc2MDU3LCAwLjI1NTg5MjY2NywgMC4yMDU4OCwgMC4xOTg2ODczMzMsIDAuMTQwNDE4LCAwLjIwMjE0NDMzMywgMC4xODUzMDY2NjcsIDAuMTkzNzczLCAwLjE1MTU1NTMzMywgMC4xNzA4MzY2NjcsIDAuMTY2MjQxLCAwLjE1MDI2NTMzMywgMC4xNjU4OTE2NjcsIDAuMTUzMjAzLFxyXG4gICAgICAgICAwLjE3MTk3ODY2NywgMC4xMzUwMzUzMzMsIDAuMTcxMDU2MzMzLCAwLjIyNjE5MywgMC4xNzIwMTcsIDAuMjUwODk3NjY3LCAwLjI3MjI1ODMzMywgMC4xODEzNjUsIDAuMTYzNzA3MzMzLCAwLjE2Mzg2NDY2NywgMC4xNTE4MzAzMzMsIDAuMTQ5NDA3LCAwLjEwNjMyOTY2NywgMC4wNzg4MDksIDAuMDcwNzQ2LFxyXG4gICAgICAgICAwLjExMTQ5LCAwLjAzODk1OTMzMywgMC4wODA4MzEsIDAuMDkxMzcwNjY3LCAwLjA3NTEyMDY2NywgMC4wMDQ3NTAzMzMsIDAuMDAzNDg4NjY3LCAwLjA2NzQ0OTMzMywgMC4wMzkwOTQ2NjcsIDAuMTAyMDAyNjY3LCAwLjA1NzMzMzMzMywgMC4xNjIxMjczMzMsIDAuMjUwMjc0MzMzLCAwLjA3NzEwNjMzMywgMC4yMzMzMjQsXHJcbiAgICAgICAgIDAuMjU1MzIxLCAwLjM2MjQzODMzMywgLTAuMDQ5MjAwMzMzLCAtMC4wNzMyODIzMzMsIC0wLjQ3MDQ0OCwgLTAuMzE0ODI4NSwgLTAuOTA0Njc1LCAtMC43MTcyNTQsIC0wLjg4NzU4OCwgXCJOQU1FP1wiLCBcIlZBTFVFP1wiLCBcIk5BTUU/XCIsIFwiVkFMVUU/XCJdLFxyXG4gICAgICAgICBbLTAuMzQ2NDk0LCAtMC4zMzMwMTk2NjcsIC0wLjM0NTIwOTMzMywgLTAuMjczNDUwNjY3LCAtMC4yOTY2MTgsIC0wLjMxOTgwNjY2NywgLTAuMzU3OTk0NjY3LCAtMC4zNTkxOTQ2NjcsIC0wLjM5MDY3ODMzMywgLTAuMzUyMzUxMzMzLCAtMC4zNzUzNzUzMzMsIC0wLjM2NTI4MzY2NywgLTAuMzY3Nzg2LFxyXG4tMC4zNzczNDcsIC0wLjM2NDE1MDY2NywgLTAuMzYwOTM1MzMzLCAtMC4zOTE1NDkzMzMsIC0wLjM0MDQ3MSwgLTAuMzQzMTYyLCAtMC4zNTAyMzUzMzMsIC0wLjM1NDc5NjY2NywgLTAuMzQ1NzExNjY3LCAtMC4zNDM5MTQzMzMsIC0wLjM3NTI1MTMzMywgLTAuMzQwMzM1LCAtMC4zNTE0OTQ2NjcsIC0wLjM0MTQ4MjY2NyxcclxuLTAuMzQyOTU4NjY3LCAtMC4zMzUyOTcsIC0wLjMzNzAwNSwgLTAuMzQyNDQ1MzMzLCAtMC4zMzY0OTgsIC0wLjM1OTI4NDMzMywgLTAuMzU3MDY5NjY3LCAtMC4zNTY5NTEzMzMsIC0wLjM4MDYwMywgLTAuMzQyNzEzLCAtMC4zNTMxOTUsIC0wLjMzODQxNzMzMywgLTAuMzQ4MzY2NjY3LCAtMC4zNDQ5OTYzMzMsXHJcbi0wLjM0NTgxOCwgLTAuMzUwNjE5MzMzLCAtMC4zNDcyNjIzMzMsIC0wLjM1MTM5MDY2NywgLTAuMzM5NjU0NjY3LCAtMC4zNDM0ODQzMzMsIC0wLjM5MTQ5LCAtMC4zNjU2Nzk2NjcsIC0wLjM3NjY0MzMzMywgLTAuMzk1NTIzLCAtMC4zOTgxNTA2NjcsIC0wLjM3NDk3MzY2NywgLTAuMzkzMjA3LCAtMC4zODAyMTQ2NjcsXHJcbi0wLjM3MTI0OTMzMywgLTAuMzYxMzQ3LCAtMC4zNjczOTgzMzMsIC0wLjI4MDAwMywgLTAuMjUzNzEzNjY3LCAtMC4yMDI4NzQsIC0wLjE3NDUzMjMzMywgLTAuMTMzMzcxMzMzLCAtMC4wOTE2ODIsIC0wLjA0MTgyOTY2NywgLTAuMDE2NzIzNjY3LCAwLjAyMjY3MzY2NywgMC4xMDEzNTc2NjcsIDAuMTYxNjksXHJcbjAuMjM2Mzc1MzMzLCAwLjI5OTI3NTMzMywgMC4zNDYwNzYzMzMsIDAuMzc5NDA1LCAwLjM3NDU1OSwgMC40MDE0NTIsIDAuMzgwODc4NjY3LCAwLjM2MTYxNCwgMC4zODc3MTgsIDAuMzQ3NjM0LCAwLjMxMjc2OSwgMC4yMjk5NDQsIDAuMTk2NjYyMzMzLCAwLjEyODY2NTMzMywgMC4wNzg0OTUsIDAuMDM1MDg3LFxyXG4tMC4wMzg2MTUzMzMsIC0wLjA1OTQwNjY2NywgLTAuMTAwNjI3MzMzLCAtMC4xMjgyMTI2NjcsIC0wLjE0MzM4MjMzMywgLTAuMTk0OTY1MzMzLCAtMC4yMTA1NjcsIC0wLjIyMTQ3MTMzMywgLTAuMjM5MTA5MzMzLCAtMC4yNDQ0NTUsIC0wLjI1Njg1NDY2NywgLTAuMjc1NTA3MzMzLCAtMC4zMDI5ODczMzMsXHJcbi0wLjMxNzQ5MiwgLTAuMzA4MDA1NjY3LCAtMC4zMjEzNjcsIC0wLjMyNTcwODY2NywgLTAuMzQ0ODIwNjY3LCAtMC4zMjYyMzUzMzMsIC0wLjM1NjI4NSwgLTAuMzQ3MDU1NjY3LCAtMC4zNDA5MjIsIC0wLjM1ODMwMDY2NywgLTAuMzMxMjE4MzMzLCAtMC4zNDE3OTIsIC0wLjM0MzY5MSwgLTAuMzMwMTYzMzMzLFxyXG4tMC4zNDY1ODk2NjcsIC0wLjMyOTk1OSwgLTAuMzAzMjUyLCAtMC4yODI2ODgsIC0wLjI2MTgxMjY2NywgLTAuMjI1NDEsIC0wLjE3NzcxNTMzMywgLTAuMTE4MDQ0NjY3LCAtMC4wODAxMjQsIC0wLjAzNjQyNzY2NywgMC4wMjYxNTk2NjcsIDAuMDYwMzM4LCAwLjEyOTU0MiwgMC4xODA4MjMsIDAuMjEzODg1MzMzLFxyXG4wLjIyOTg3NDMzMywgMC4yNzE3MDc2NjcsIDAuMjI2NzI4NjY3LCAwLjIxMzc2MzY2NywgMC4yMjUyNzksIDAuMjIxNzU3LCAwLjI3MDMzMjY2NywgMC4yNzU1NzkzMzMsIDAuMjYwMTY2MzMzLCAwLjIyOTU5NzY2NywgMC4yMjk1OTI2NjcsIDAuMjEwOTIyLCAwLjE4OTE5MzY2NywgMC4xNzM2NTkzMzMsIDAuMTM4NTU0LFxyXG4wLjEyNDkwNTY2NywgMC4wOTQwODczMzMsIDAuMDc2MTU2NjY3LCAwLjAzMzk2OSwgMC4wMTk4Mzg2NjcsIC0wLjAwODAyNSwgLTAuMDQyODgxNjY3LCAtMC4wNjM3MzUsIC0wLjA4NDgwODMzMywgLTAuMDg3NjczMzMzLCAtMC4xMTI4ODksIC0wLjExNzczMDMzMywgLTAuMTQzMTkzLCAtMC4xNDAwMTY2NjcsXHJcbi0wLjEzODI4NDY2NywgLTAuMTM0ODc4NjY3LCAtMC4xNjM2NDg2NjcsIC0wLjE0MTA1NTY2NywgLTAuMTYwNTI5MzMzLCAtMC4xOTM1NDAzMzMsIC0wLjE5ODIwMTY2NywgLTAuMTc2MjI2MzMzLCAtMC4yMDk4MDMsIC0wLjE4NTc3MSwgLTAuMTg3NjI4MzMzLCAtMC4yMDEyMjk2NjcsIC0wLjIwNDMwNzMzMyxcclxuLTAuMjEwNDkzLCAtMC4yMzk3MzMsIC0wLjIzMDUzLCAtMC4yNjk5MDUsIC0wLjI2OTAzNjMzMywgLTAuMjgzMDc4MzMzLCAtMC4zMDM4NDEzMzMsIC0wLjI4MTk2ODMzMywgLTAuMjcyMDM1LCAtMC4yNTgwMjksIC0wLjI4MjA0MjMzMywgLTAuMjkwMDY2NjY3LCAtMC4yODA0OTQ2NjcsIC0wLjI4MzE2MTMzMyxcclxuLTAuMjc0MjIzMzMzLCAtMC4yODAxOTYsIC0wLjIzNjEwMSwgLTAuMjY2MTQyNjY3LCAtMC4yMzMzMzU2NjcsIC0wLjIyODgyMjY2NywgLTAuMjU2MjY2LCAtMC4yMTYzOTEzMzMsIC0wLjIwMjUyNjMzMywgLTAuMjU2MjkwMzMzLCAtMC4yMzcxMjEsIC0wLjI0NDU0NCwgLTAuMjUzMDcyLCAtMC4xODUzOTUsXHJcbi0wLjI1Njk1NCwgLTAuMjE1MTk5LCAtMC4yMDYxOTIzMzMsIC0wLjE3NjM3OCwgLTAuMjEwNzkzLCAtMC4xMTIzNTcsIC0wLjA2MjE3OTMzMywgLTAuMDc1NTA5MzMzLCAtMC4wOTM5OTUsIC0wLjAzMzM3LCAwLjAwODgwNDMzMywgLTAuMDM5ODkwMzMzLCAwLjExNzg0MzMzMywgMC4wMjQwNTYsIDAuMTEyMTk5MzMzLFxyXG4wLjEzOTk1OSwgMC4wMjg2MDg2NjcsIDAuMjAzNjA1NjY3LCAwLjEyOTc3NDY2NywgMC4yMzcwOTE2NjcsIDAuMTgzNzY1MzMzLCAtMC4xMDQzMzc2NjcsIC0wLjM3NjY3MTUsIC0wLjQ0NDc2OCwgLTAuNjk2MDg1NSwgLTAuNDU5Mjg1NSwgLTAuNzIyNjY2LCBcIk5BTUU/XCIsIFwiTkFNRT9cIiwgXCJOQU1FP1wiLFxyXG5cIk5BTUU/XCIgXVxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImNvbmNlbnRyYXRpb25cIjogW1sxLCAwXSwgWzAsIDFdXSxcclxuICAgICAgICAgICAgXCJjb25jZW50cmF0aW9uTGFiZWxzXCI6IFtcIlNraW0gTWlsa1wiLCBcIk9saXZlIE9pbFwiXVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzBdLCBbMV0sIFtcIlNraW0gTWlsa1wiXSwgXCJTYW1wbGUgMVwiKTtcclxuICAgICAgICB1cGRhdGVEYXRhKHRyYWluT2JqLmFic29yYmFuY2VbMV0sIFsxXSwgW1wiT2xpdmUgT2lsXCJdLCBcIlNhbXBsZSAyXCIpO1xyXG4gICAgICAgIHVwZGF0ZURhdGEodHJhaW5PYmouYWJzb3JiYW5jZVsxXSwgWzFdLCBbXCJPbGl2ZSBPaWxcIl0sIFwiU2FtcGxlIDNcIik7XHJcbiAgICAgICAgdXBkYXRlRGF0YSh0cmFpbk9iai5hYnNvcmJhbmNlWzFdLCBbMV0sIFtcIlNraW0gTWlsa1wiXSwgXCJTYW1wbGUgNFwiKTtcclxuICAgICAgICB1cGRhdGVEYXRhKHRyYWluT2JqLmFic29yYmFuY2VbMV0sIFsxXSwgW1wiUGFyYWRveGl1bVwiXSwgXCJTYW1wbGUgNFwiKTtcclxuICAgICAgICB1cGRhdGVEYXRhKHRyYWluT2JqLmFic29yYmFuY2VbMV0sIFswLjUsIDAuNV0sIFtcIlBhcmFkb3hpdW1cIiwgXCJTa2ltIE1pbGtcIl0sIFwiU2FtcGxlIDRcIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coY2hlbW9TYW1wbGVOYW1lcyk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGdldFBDQSgpIHtcclxuICAgICAgICByZXR1cm4gY2hlbW9QQ0FDb21wcmVzc2VkO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4geyB0cmFpbjogbmV3VHJhaW4sIGluZmVyOiBuZXdJbmZlciwgZmxhZ3M6IGNoZW1vRmxhZ3MsIGdldE1vZGVsOiBjaGVtb0dldE1vZGVsLCBsb2FkTW9kZWw6IGNoZW1vTG9hZE1vZGVsLCBwY2FUZXN0OiBwY2FUZXN0LCBwbHNUZXN0OiBwbHNUZXN0LCB1cGRhdGVUZXN0OnVwZGF0ZVRlc3QsIHVwZGF0ZURhdGE6dXBkYXRlRGF0YSwgZ2V0UENBOiBnZXRQQ0EgfTtcclxuXHJcbn0pOyIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbHV0enJvZWRlci9NYXBhY2svYmxvYi9tYXN0ZXIvU291cmNlL0Nob2xlc2t5RGVjb21wb3NpdGlvbi5jc1xuZnVuY3Rpb24gQ2hvbGVza3lEZWNvbXBvc2l0aW9uKHZhbHVlKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIENob2xlc2t5RGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDaG9sZXNreURlY29tcG9zaXRpb24odmFsdWUpO1xuICAgIH1cbiAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG4gICAgaWYgKCF2YWx1ZS5pc1N5bW1ldHJpYygpKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBpcyBub3Qgc3ltbWV0cmljJyk7XG5cbiAgICB2YXIgYSA9IHZhbHVlLFxuICAgICAgICBkaW1lbnNpb24gPSBhLnJvd3MsXG4gICAgICAgIGwgPSBuZXcgTWF0cml4KGRpbWVuc2lvbiwgZGltZW5zaW9uKSxcbiAgICAgICAgcG9zaXRpdmVEZWZpbml0ZSA9IHRydWUsXG4gICAgICAgIGksIGosIGs7XG5cbiAgICBmb3IgKGogPSAwOyBqIDwgZGltZW5zaW9uOyBqKyspIHtcbiAgICAgICAgdmFyIExyb3dqID0gbFtqXTtcbiAgICAgICAgdmFyIGQgPSAwO1xuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgajsgaysrKSB7XG4gICAgICAgICAgICB2YXIgTHJvd2sgPSBsW2tdO1xuICAgICAgICAgICAgdmFyIHMgPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgIHMgKz0gTHJvd2tbaV0gKiBMcm93altpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIExyb3dqW2tdID0gcyA9IChhW2pdW2tdIC0gcykgLyBsW2tdW2tdO1xuICAgICAgICAgICAgZCA9IGQgKyBzICogcztcbiAgICAgICAgfVxuXG4gICAgICAgIGQgPSBhW2pdW2pdIC0gZDtcblxuICAgICAgICBwb3NpdGl2ZURlZmluaXRlICY9IChkID4gMCk7XG4gICAgICAgIGxbal1bal0gPSBNYXRoLnNxcnQoTWF0aC5tYXgoZCwgMCkpO1xuICAgICAgICBmb3IgKGsgPSBqICsgMTsgayA8IGRpbWVuc2lvbjsgaysrKSB7XG4gICAgICAgICAgICBsW2pdW2tdID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghcG9zaXRpdmVEZWZpbml0ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBpcyBub3QgcG9zaXRpdmUgZGVmaW5pdGUnKTtcbiAgICB9XG5cbiAgICB0aGlzLkwgPSBsO1xufVxuXG5DaG9sZXNreURlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIGdldCBsb3dlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkw7XG4gICAgfSxcbiAgICBzb2x2ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgICAgICB2YXIgbCA9IHRoaXMuTCxcbiAgICAgICAgICAgIGRpbWVuc2lvbiA9IGwucm93cztcblxuICAgICAgICBpZiAodmFsdWUucm93cyAhPT0gZGltZW5zaW9uKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBkaW1lbnNpb25zIGRvIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNvdW50ID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgICAgIEIgPSB2YWx1ZS5jbG9uZSgpLFxuICAgICAgICAgICAgaSwgaiwgaztcblxuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgZGltZW5zaW9uOyBrKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBCW2tdW2pdIC09IEJbaV1bal0gKiBsW2tdW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBCW2tdW2pdIC89IGxba11ba107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGsgPSBkaW1lbnNpb24gLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IGRpbWVuc2lvbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEJba11bal0gLT0gQltpXVtqXSAqIGxbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIEJba11bal0gLz0gbFtrXVtrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBCO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hvbGVza3lEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xudmFyIGh5cG90ZW51c2UgPSB1dGlsLmh5cG90ZW51c2U7XG52YXIgZ2V0RmlsbGVkMkRBcnJheSA9IHV0aWwuZ2V0RmlsbGVkMkRBcnJheTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9FaWdlbnZhbHVlRGVjb21wb3NpdGlvbi5jc1xuZnVuY3Rpb24gRWlnZW52YWx1ZURlY29tcG9zaXRpb24obWF0cml4KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uKG1hdHJpeCk7XG4gICAgfVxuICAgIG1hdHJpeCA9IE1hdHJpeC5jaGVja01hdHJpeChtYXRyaXgpO1xuICAgIGlmICghbWF0cml4LmlzU3F1YXJlKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgbm90IGEgc3F1YXJlIG1hdHJpeCcpO1xuICAgIH1cblxuICAgIHZhciBuID0gbWF0cml4LmNvbHVtbnMsXG4gICAgICAgIFYgPSBnZXRGaWxsZWQyREFycmF5KG4sIG4sIDApLFxuICAgICAgICBkID0gbmV3IEFycmF5KG4pLFxuICAgICAgICBlID0gbmV3IEFycmF5KG4pLFxuICAgICAgICB2YWx1ZSA9IG1hdHJpeCxcbiAgICAgICAgaSwgajtcblxuICAgIGlmIChtYXRyaXguaXNTeW1tZXRyaWMoKSkge1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgVltpXVtqXSA9IHZhbHVlW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRyZWQyKG4sIGUsIGQsIFYpO1xuICAgICAgICB0cWwyKG4sIGUsIGQsIFYpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIEggPSBnZXRGaWxsZWQyREFycmF5KG4sIG4sIDApLFxuICAgICAgICAgICAgb3J0ID0gbmV3IEFycmF5KG4pO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgSFtpXVtqXSA9IHZhbHVlW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG9ydGhlcyhuLCBILCBvcnQsIFYpO1xuICAgICAgICBocXIyKG4sIGUsIGQsIFYsIEgpO1xuICAgIH1cblxuICAgIHRoaXMubiA9IG47XG4gICAgdGhpcy5lID0gZTtcbiAgICB0aGlzLmQgPSBkO1xuICAgIHRoaXMuViA9IFY7XG59XG5cbkVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBnZXQgcmVhbEVpZ2VudmFsdWVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kO1xuICAgIH0sXG4gICAgZ2V0IGltYWdpbmFyeUVpZ2VudmFsdWVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5lO1xuICAgIH0sXG4gICAgZ2V0IGVpZ2VudmVjdG9yTWF0cml4KCkge1xuICAgICAgICBpZiAoIU1hdHJpeC5pc01hdHJpeCh0aGlzLlYpKSB7XG4gICAgICAgICAgICB0aGlzLlYgPSBuZXcgTWF0cml4KHRoaXMuVik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuVjtcbiAgICB9LFxuICAgIGdldCBkaWFnb25hbE1hdHJpeCgpIHtcbiAgICAgICAgdmFyIG4gPSB0aGlzLm4sXG4gICAgICAgICAgICBlID0gdGhpcy5lLFxuICAgICAgICAgICAgZCA9IHRoaXMuZCxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KG4sIG4pLFxuICAgICAgICAgICAgaSwgajtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgWFtpXVtpXSA9IGRbaV07XG4gICAgICAgICAgICBpZiAoZVtpXSA+IDApIHtcbiAgICAgICAgICAgICAgICBYW2ldW2kgKyAxXSA9IGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChlW2ldIDwgMCkge1xuICAgICAgICAgICAgICAgIFhbaV1baSAtIDFdID0gZVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiB0cmVkMihuLCBlLCBkLCBWKSB7XG5cbiAgICB2YXIgZiwgZywgaCwgaSwgaiwgayxcbiAgICAgICAgaGgsIHNjYWxlO1xuXG4gICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICBkW2pdID0gVltuIC0gMV1bal07XG4gICAgfVxuXG4gICAgZm9yIChpID0gbiAtIDE7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgc2NhbGUgPSAwO1xuICAgICAgICBoID0gMDtcbiAgICAgICAgZm9yIChrID0gMDsgayA8IGk7IGsrKykge1xuICAgICAgICAgICAgc2NhbGUgPSBzY2FsZSArIE1hdGguYWJzKGRba10pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNjYWxlID09PSAwKSB7XG4gICAgICAgICAgICBlW2ldID0gZFtpIC0gMV07XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZFtqXSA9IFZbaSAtIDFdW2pdO1xuICAgICAgICAgICAgICAgIFZbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIFZbal1baV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGk7IGsrKykge1xuICAgICAgICAgICAgICAgIGRba10gLz0gc2NhbGU7XG4gICAgICAgICAgICAgICAgaCArPSBkW2tdICogZFtrXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZiA9IGRbaSAtIDFdO1xuICAgICAgICAgICAgZyA9IE1hdGguc3FydChoKTtcbiAgICAgICAgICAgIGlmIChmID4gMCkge1xuICAgICAgICAgICAgICAgIGcgPSAtZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZVtpXSA9IHNjYWxlICogZztcbiAgICAgICAgICAgIGggPSBoIC0gZiAqIGc7XG4gICAgICAgICAgICBkW2kgLSAxXSA9IGYgLSBnO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGVbal0gPSAwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZiA9IGRbal07XG4gICAgICAgICAgICAgICAgVltqXVtpXSA9IGY7XG4gICAgICAgICAgICAgICAgZyA9IGVbal0gKyBWW2pdW2pdICogZjtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSBqICsgMTsgayA8PSBpIC0gMTsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIGcgKz0gVltrXVtqXSAqIGRba107XG4gICAgICAgICAgICAgICAgICAgIGVba10gKz0gVltrXVtqXSAqIGY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVbal0gPSBnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmID0gMDtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBlW2pdIC89IGg7XG4gICAgICAgICAgICAgICAgZiArPSBlW2pdICogZFtqXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaGggPSBmIC8gKGggKyBoKTtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBlW2pdIC09IGhoICogZFtqXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGYgPSBkW2pdO1xuICAgICAgICAgICAgICAgIGcgPSBlW2pdO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IGo7IGsgPD0gaSAtIDE7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBWW2tdW2pdIC09IChmICogZVtrXSArIGcgKiBkW2tdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZFtqXSA9IFZbaSAtIDFdW2pdO1xuICAgICAgICAgICAgICAgIFZbaV1bal0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRbaV0gPSBoO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBuIC0gMTsgaSsrKSB7XG4gICAgICAgIFZbbiAtIDFdW2ldID0gVltpXVtpXTtcbiAgICAgICAgVltpXVtpXSA9IDE7XG4gICAgICAgIGggPSBkW2kgKyAxXTtcbiAgICAgICAgaWYgKGggIT09IDApIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPD0gaTsgaysrKSB7XG4gICAgICAgICAgICAgICAgZFtrXSA9IFZba11baSArIDFdIC8gaDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8PSBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBnID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDw9IGk7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBnICs9IFZba11baSArIDFdICogVltrXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVltrXVtqXSAtPSBnICogZFtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGsgPSAwOyBrIDw9IGk7IGsrKykge1xuICAgICAgICAgICAgVltrXVtpICsgMV0gPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICBkW2pdID0gVltuIC0gMV1bal07XG4gICAgICAgIFZbbiAtIDFdW2pdID0gMDtcbiAgICB9XG5cbiAgICBWW24gLSAxXVtuIC0gMV0gPSAxO1xuICAgIGVbMF0gPSAwO1xufVxuXG5mdW5jdGlvbiB0cWwyKG4sIGUsIGQsIFYpIHtcblxuICAgIHZhciBnLCBoLCBpLCBqLCBrLCBsLCBtLCBwLCByLFxuICAgICAgICBkbDEsIGMsIGMyLCBjMywgZWwxLCBzLCBzMixcbiAgICAgICAgaXRlcjtcblxuICAgIGZvciAoaSA9IDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgZVtpIC0gMV0gPSBlW2ldO1xuICAgIH1cblxuICAgIGVbbiAtIDFdID0gMDtcblxuICAgIHZhciBmID0gMCxcbiAgICAgICAgdHN0MSA9IDAsXG4gICAgICAgIGVwcyA9IE1hdGgucG93KDIsIC01Mik7XG5cbiAgICBmb3IgKGwgPSAwOyBsIDwgbjsgbCsrKSB7XG4gICAgICAgIHRzdDEgPSBNYXRoLm1heCh0c3QxLCBNYXRoLmFicyhkW2xdKSArIE1hdGguYWJzKGVbbF0pKTtcbiAgICAgICAgbSA9IGw7XG4gICAgICAgIHdoaWxlIChtIDwgbikge1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKGVbbV0pIDw9IGVwcyAqIHRzdDEpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG0rKztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtID4gbCkge1xuICAgICAgICAgICAgaXRlciA9IDA7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgaXRlciA9IGl0ZXIgKyAxO1xuXG4gICAgICAgICAgICAgICAgZyA9IGRbbF07XG4gICAgICAgICAgICAgICAgcCA9IChkW2wgKyAxXSAtIGcpIC8gKDIgKiBlW2xdKTtcbiAgICAgICAgICAgICAgICByID0gaHlwb3RlbnVzZShwLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAocCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgciA9IC1yO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGRbbF0gPSBlW2xdIC8gKHAgKyByKTtcbiAgICAgICAgICAgICAgICBkW2wgKyAxXSA9IGVbbF0gKiAocCArIHIpO1xuICAgICAgICAgICAgICAgIGRsMSA9IGRbbCArIDFdO1xuICAgICAgICAgICAgICAgIGggPSBnIC0gZFtsXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBsICsgMjsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBkW2ldIC09IGg7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZiA9IGYgKyBoO1xuXG4gICAgICAgICAgICAgICAgcCA9IGRbbV07XG4gICAgICAgICAgICAgICAgYyA9IDE7XG4gICAgICAgICAgICAgICAgYzIgPSBjO1xuICAgICAgICAgICAgICAgIGMzID0gYztcbiAgICAgICAgICAgICAgICBlbDEgPSBlW2wgKyAxXTtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBzMiA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbSAtIDE7IGkgPj0gbDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGMzID0gYzI7XG4gICAgICAgICAgICAgICAgICAgIGMyID0gYztcbiAgICAgICAgICAgICAgICAgICAgczIgPSBzO1xuICAgICAgICAgICAgICAgICAgICBnID0gYyAqIGVbaV07XG4gICAgICAgICAgICAgICAgICAgIGggPSBjICogcDtcbiAgICAgICAgICAgICAgICAgICAgciA9IGh5cG90ZW51c2UocCwgZVtpXSk7XG4gICAgICAgICAgICAgICAgICAgIGVbaSArIDFdID0gcyAqIHI7XG4gICAgICAgICAgICAgICAgICAgIHMgPSBlW2ldIC8gcjtcbiAgICAgICAgICAgICAgICAgICAgYyA9IHAgLyByO1xuICAgICAgICAgICAgICAgICAgICBwID0gYyAqIGRbaV0gLSBzICogZztcbiAgICAgICAgICAgICAgICAgICAgZFtpICsgMV0gPSBoICsgcyAqIChjICogZyArIHMgKiBkW2ldKTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgbjsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBoID0gVltrXVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBWW2tdW2kgKyAxXSA9IHMgKiBWW2tdW2ldICsgYyAqIGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBWW2tdW2ldID0gYyAqIFZba11baV0gLSBzICogaDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHAgPSAtcyAqIHMyICogYzMgKiBlbDEgKiBlW2xdIC8gZGwxO1xuICAgICAgICAgICAgICAgIGVbbF0gPSBzICogcDtcbiAgICAgICAgICAgICAgICBkW2xdID0gYyAqIHA7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdoaWxlIChNYXRoLmFicyhlW2xdKSA+IGVwcyAqIHRzdDEpO1xuICAgICAgICB9XG4gICAgICAgIGRbbF0gPSBkW2xdICsgZjtcbiAgICAgICAgZVtsXSA9IDA7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG4gLSAxOyBpKyspIHtcbiAgICAgICAgayA9IGk7XG4gICAgICAgIHAgPSBkW2ldO1xuICAgICAgICBmb3IgKGogPSBpICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgaWYgKGRbal0gPCBwKSB7XG4gICAgICAgICAgICAgICAgayA9IGo7XG4gICAgICAgICAgICAgICAgcCA9IGRbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoayAhPT0gaSkge1xuICAgICAgICAgICAgZFtrXSA9IGRbaV07XG4gICAgICAgICAgICBkW2ldID0gcDtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBwID0gVltqXVtpXTtcbiAgICAgICAgICAgICAgICBWW2pdW2ldID0gVltqXVtrXTtcbiAgICAgICAgICAgICAgICBWW2pdW2tdID0gcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gb3J0aGVzKG4sIEgsIG9ydCwgVikge1xuXG4gICAgdmFyIGxvdyA9IDAsXG4gICAgICAgIGhpZ2ggPSBuIC0gMSxcbiAgICAgICAgZiwgZywgaCwgaSwgaiwgbSxcbiAgICAgICAgc2NhbGU7XG5cbiAgICBmb3IgKG0gPSBsb3cgKyAxOyBtIDw9IGhpZ2ggLSAxOyBtKyspIHtcbiAgICAgICAgc2NhbGUgPSAwO1xuICAgICAgICBmb3IgKGkgPSBtOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgc2NhbGUgPSBzY2FsZSArIE1hdGguYWJzKEhbaV1bbSAtIDFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzY2FsZSAhPT0gMCkge1xuICAgICAgICAgICAgaCA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSBoaWdoOyBpID49IG07IGktLSkge1xuICAgICAgICAgICAgICAgIG9ydFtpXSA9IEhbaV1bbSAtIDFdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgaCArPSBvcnRbaV0gKiBvcnRbaV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGcgPSBNYXRoLnNxcnQoaCk7XG4gICAgICAgICAgICBpZiAob3J0W21dID4gMCkge1xuICAgICAgICAgICAgICAgIGcgPSAtZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaCA9IGggLSBvcnRbbV0gKiBnO1xuICAgICAgICAgICAgb3J0W21dID0gb3J0W21dIC0gZztcblxuICAgICAgICAgICAgZm9yIChqID0gbTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIGYgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGhpZ2g7IGkgPj0gbTsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGYgKz0gb3J0W2ldICogSFtpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmID0gZiAvIGg7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtqXSAtPSBmICogb3J0W2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBoaWdoOyBqID49IG07IGotLSkge1xuICAgICAgICAgICAgICAgICAgICBmICs9IG9ydFtqXSAqIEhbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZiA9IGYgLyBoO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IG07IGogPD0gaGlnaDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bal0gLT0gZiAqIG9ydFtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG9ydFttXSA9IHNjYWxlICogb3J0W21dO1xuICAgICAgICAgICAgSFttXVttIC0gMV0gPSBzY2FsZSAqIGc7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgIFZbaV1bal0gPSAoaSA9PT0gaiA/IDEgOiAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAobSA9IGhpZ2ggLSAxOyBtID49IGxvdyArIDE7IG0tLSkge1xuICAgICAgICBpZiAoSFttXVttIC0gMV0gIT09IDApIHtcbiAgICAgICAgICAgIGZvciAoaSA9IG0gKyAxOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgIG9ydFtpXSA9IEhbaV1bbSAtIDFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGogPSBtOyBqIDw9IGhpZ2g7IGorKykge1xuICAgICAgICAgICAgICAgIGcgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGcgKz0gb3J0W2ldICogVltpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBnID0gKGcgLyBvcnRbbV0pIC8gSFttXVttIC0gMV07XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVltpXVtqXSArPSBnICogb3J0W2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gaHFyMihubiwgZSwgZCwgViwgSCkge1xuICAgIHZhciBuID0gbm4gLSAxLFxuICAgICAgICBsb3cgPSAwLFxuICAgICAgICBoaWdoID0gbm4gLSAxLFxuICAgICAgICBlcHMgPSBNYXRoLnBvdygyLCAtNTIpLFxuICAgICAgICBleHNoaWZ0ID0gMCxcbiAgICAgICAgbm9ybSA9IDAsXG4gICAgICAgIHAgPSAwLFxuICAgICAgICBxID0gMCxcbiAgICAgICAgciA9IDAsXG4gICAgICAgIHMgPSAwLFxuICAgICAgICB6ID0gMCxcbiAgICAgICAgaXRlciA9IDAsXG4gICAgICAgIGksIGosIGssIGwsIG0sIHQsIHcsIHgsIHksXG4gICAgICAgIHJhLCBzYSwgdnIsIHZpLFxuICAgICAgICBub3RsYXN0LCBjZGl2cmVzO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IG5uOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPCBsb3cgfHwgaSA+IGhpZ2gpIHtcbiAgICAgICAgICAgIGRbaV0gPSBIW2ldW2ldO1xuICAgICAgICAgICAgZVtpXSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGogPSBNYXRoLm1heChpIC0gMSwgMCk7IGogPCBubjsgaisrKSB7XG4gICAgICAgICAgICBub3JtID0gbm9ybSArIE1hdGguYWJzKEhbaV1bal0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgd2hpbGUgKG4gPj0gbG93KSB7XG4gICAgICAgIGwgPSBuO1xuICAgICAgICB3aGlsZSAobCA+IGxvdykge1xuICAgICAgICAgICAgcyA9IE1hdGguYWJzKEhbbCAtIDFdW2wgLSAxXSkgKyBNYXRoLmFicyhIW2xdW2xdKTtcbiAgICAgICAgICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcyA9IG5vcm07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoSFtsXVtsIC0gMV0pIDwgZXBzICogcykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbC0tO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGwgPT09IG4pIHtcbiAgICAgICAgICAgIEhbbl1bbl0gPSBIW25dW25dICsgZXhzaGlmdDtcbiAgICAgICAgICAgIGRbbl0gPSBIW25dW25dO1xuICAgICAgICAgICAgZVtuXSA9IDA7XG4gICAgICAgICAgICBuLS07XG4gICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChsID09PSBuIC0gMSkge1xuICAgICAgICAgICAgdyA9IEhbbl1bbiAtIDFdICogSFtuIC0gMV1bbl07XG4gICAgICAgICAgICBwID0gKEhbbiAtIDFdW24gLSAxXSAtIEhbbl1bbl0pIC8gMjtcbiAgICAgICAgICAgIHEgPSBwICogcCArIHc7XG4gICAgICAgICAgICB6ID0gTWF0aC5zcXJ0KE1hdGguYWJzKHEpKTtcbiAgICAgICAgICAgIEhbbl1bbl0gPSBIW25dW25dICsgZXhzaGlmdDtcbiAgICAgICAgICAgIEhbbiAtIDFdW24gLSAxXSA9IEhbbiAtIDFdW24gLSAxXSArIGV4c2hpZnQ7XG4gICAgICAgICAgICB4ID0gSFtuXVtuXTtcblxuICAgICAgICAgICAgaWYgKHEgPj0gMCkge1xuICAgICAgICAgICAgICAgIHogPSAocCA+PSAwKSA/IChwICsgeikgOiAocCAtIHopO1xuICAgICAgICAgICAgICAgIGRbbiAtIDFdID0geCArIHo7XG4gICAgICAgICAgICAgICAgZFtuXSA9IGRbbiAtIDFdO1xuICAgICAgICAgICAgICAgIGlmICh6ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGRbbl0gPSB4IC0gdyAvIHo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVbbiAtIDFdID0gMDtcbiAgICAgICAgICAgICAgICBlW25dID0gMDtcbiAgICAgICAgICAgICAgICB4ID0gSFtuXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgcyA9IE1hdGguYWJzKHgpICsgTWF0aC5hYnMoeik7XG4gICAgICAgICAgICAgICAgcCA9IHggLyBzO1xuICAgICAgICAgICAgICAgIHEgPSB6IC8gcztcbiAgICAgICAgICAgICAgICByID0gTWF0aC5zcXJ0KHAgKiBwICsgcSAqIHEpO1xuICAgICAgICAgICAgICAgIHAgPSBwIC8gcjtcbiAgICAgICAgICAgICAgICBxID0gcSAvIHI7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBuIC0gMTsgaiA8IG5uOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IEhbbiAtIDFdW2pdO1xuICAgICAgICAgICAgICAgICAgICBIW24gLSAxXVtqXSA9IHEgKiB6ICsgcCAqIEhbbl1bal07XG4gICAgICAgICAgICAgICAgICAgIEhbbl1bal0gPSBxICogSFtuXVtqXSAtIHAgKiB6O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSBIW2ldW24gLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtuIC0gMV0gPSBxICogeiArIHAgKiBIW2ldW25dO1xuICAgICAgICAgICAgICAgICAgICBIW2ldW25dID0gcSAqIEhbaV1bbl0gLSBwICogejtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSBWW2ldW24gLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgVltpXVtuIC0gMV0gPSBxICogeiArIHAgKiBWW2ldW25dO1xuICAgICAgICAgICAgICAgICAgICBWW2ldW25dID0gcSAqIFZbaV1bbl0gLSBwICogejtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRbbiAtIDFdID0geCArIHA7XG4gICAgICAgICAgICAgICAgZFtuXSA9IHggKyBwO1xuICAgICAgICAgICAgICAgIGVbbiAtIDFdID0gejtcbiAgICAgICAgICAgICAgICBlW25dID0gLXo7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG4gPSBuIC0gMjtcbiAgICAgICAgICAgIGl0ZXIgPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgeCA9IEhbbl1bbl07XG4gICAgICAgICAgICB5ID0gMDtcbiAgICAgICAgICAgIHcgPSAwO1xuICAgICAgICAgICAgaWYgKGwgPCBuKSB7XG4gICAgICAgICAgICAgICAgeSA9IEhbbiAtIDFdW24gLSAxXTtcbiAgICAgICAgICAgICAgICB3ID0gSFtuXVtuIC0gMV0gKiBIW24gLSAxXVtuXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZXIgPT09IDEwKSB7XG4gICAgICAgICAgICAgICAgZXhzaGlmdCArPSB4O1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtpXSAtPSB4O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzID0gTWF0aC5hYnMoSFtuXVtuIC0gMV0pICsgTWF0aC5hYnMoSFtuIC0gMV1bbiAtIDJdKTtcbiAgICAgICAgICAgICAgICB4ID0geSA9IDAuNzUgKiBzO1xuICAgICAgICAgICAgICAgIHcgPSAtMC40Mzc1ICogcyAqIHM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpdGVyID09PSAzMCkge1xuICAgICAgICAgICAgICAgIHMgPSAoeSAtIHgpIC8gMjtcbiAgICAgICAgICAgICAgICBzID0gcyAqIHMgKyB3O1xuICAgICAgICAgICAgICAgIGlmIChzID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBzID0gTWF0aC5zcXJ0KHMpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoeSA8IHgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHMgPSAtcztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzID0geCAtIHcgLyAoKHkgLSB4KSAvIDIgKyBzKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtpXSAtPSBzO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGV4c2hpZnQgKz0gcztcbiAgICAgICAgICAgICAgICAgICAgeCA9IHkgPSB3ID0gMC45NjQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpdGVyID0gaXRlciArIDE7XG5cbiAgICAgICAgICAgIG0gPSBuIC0gMjtcbiAgICAgICAgICAgIHdoaWxlIChtID49IGwpIHtcbiAgICAgICAgICAgICAgICB6ID0gSFttXVttXTtcbiAgICAgICAgICAgICAgICByID0geCAtIHo7XG4gICAgICAgICAgICAgICAgcyA9IHkgLSB6O1xuICAgICAgICAgICAgICAgIHAgPSAociAqIHMgLSB3KSAvIEhbbSArIDFdW21dICsgSFttXVttICsgMV07XG4gICAgICAgICAgICAgICAgcSA9IEhbbSArIDFdW20gKyAxXSAtIHogLSByIC0gcztcbiAgICAgICAgICAgICAgICByID0gSFttICsgMl1bbSArIDFdO1xuICAgICAgICAgICAgICAgIHMgPSBNYXRoLmFicyhwKSArIE1hdGguYWJzKHEpICsgTWF0aC5hYnMocik7XG4gICAgICAgICAgICAgICAgcCA9IHAgLyBzO1xuICAgICAgICAgICAgICAgIHEgPSBxIC8gcztcbiAgICAgICAgICAgICAgICByID0gciAvIHM7XG4gICAgICAgICAgICAgICAgaWYgKG0gPT09IGwpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhIW21dW20gLSAxXSkgKiAoTWF0aC5hYnMocSkgKyBNYXRoLmFicyhyKSkgPCBlcHMgKiAoTWF0aC5hYnMocCkgKiAoTWF0aC5hYnMoSFttIC0gMV1bbSAtIDFdKSArIE1hdGguYWJzKHopICsgTWF0aC5hYnMoSFttICsgMV1bbSArIDFdKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtLS07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IG0gKyAyOyBpIDw9IG47IGkrKykge1xuICAgICAgICAgICAgICAgIEhbaV1baSAtIDJdID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IG0gKyAyKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1baSAtIDNdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoayA9IG07IGsgPD0gbiAtIDE7IGsrKykge1xuICAgICAgICAgICAgICAgIG5vdGxhc3QgPSAoayAhPT0gbiAtIDEpO1xuICAgICAgICAgICAgICAgIGlmIChrICE9PSBtKSB7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBIW2tdW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgcSA9IEhbayArIDFdW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgciA9IChub3RsYXN0ID8gSFtrICsgMl1bayAtIDFdIDogMCk7XG4gICAgICAgICAgICAgICAgICAgIHggPSBNYXRoLmFicyhwKSArIE1hdGguYWJzKHEpICsgTWF0aC5hYnMocik7XG4gICAgICAgICAgICAgICAgICAgIGlmICh4ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwID0gcCAvIHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBxID0gcSAvIHg7XG4gICAgICAgICAgICAgICAgICAgICAgICByID0gciAvIHg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoeCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzID0gTWF0aC5zcXJ0KHAgKiBwICsgcSAqIHEgKyByICogcik7XG4gICAgICAgICAgICAgICAgaWYgKHAgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgPSAtcztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocyAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoayAhPT0gbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtrXVtrIC0gMV0gPSAtcyAqIHg7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobCAhPT0gbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtrXVtrIC0gMV0gPSAtSFtrXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBwID0gcCArIHM7XG4gICAgICAgICAgICAgICAgICAgIHggPSBwIC8gcztcbiAgICAgICAgICAgICAgICAgICAgeSA9IHEgLyBzO1xuICAgICAgICAgICAgICAgICAgICB6ID0gciAvIHM7XG4gICAgICAgICAgICAgICAgICAgIHEgPSBxIC8gcDtcbiAgICAgICAgICAgICAgICAgICAgciA9IHIgLyBwO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IGs7IGogPCBubjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwID0gSFtrXVtqXSArIHEgKiBIW2sgKyAxXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub3RsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyByICogSFtrICsgMl1bal07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtrICsgMl1bal0gPSBIW2sgKyAyXVtqXSAtIHAgKiB6O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBIW2tdW2pdID0gSFtrXVtqXSAtIHAgKiB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtrICsgMV1bal0gPSBIW2sgKyAxXVtqXSAtIHAgKiB5O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8PSBNYXRoLm1pbihuLCBrICsgMyk7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHggKiBIW2ldW2tdICsgeSAqIEhbaV1bayArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vdGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwID0gcCArIHogKiBIW2ldW2sgKyAyXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2sgKyAyXSA9IEhbaV1bayArIDJdIC0gcCAqIHI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1ba10gPSBIW2ldW2tdIC0gcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bayArIDFdID0gSFtpXVtrICsgMV0gLSBwICogcTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAgPSB4ICogVltpXVtrXSArIHkgKiBWW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub3RsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyB6ICogVltpXVtrICsgMl07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrICsgMl0gPSBWW2ldW2sgKyAyXSAtIHAgKiByO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gVltpXVtrXSAtIHA7XG4gICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2sgKyAxXSA9IFZbaV1bayArIDFdIC0gcCAqIHE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobm9ybSA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChuID0gbm4gLSAxOyBuID49IDA7IG4tLSkge1xuICAgICAgICBwID0gZFtuXTtcbiAgICAgICAgcSA9IGVbbl07XG5cbiAgICAgICAgaWYgKHEgPT09IDApIHtcbiAgICAgICAgICAgIGwgPSBuO1xuICAgICAgICAgICAgSFtuXVtuXSA9IDE7XG4gICAgICAgICAgICBmb3IgKGkgPSBuIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICB3ID0gSFtpXVtpXSAtIHA7XG4gICAgICAgICAgICAgICAgciA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gbDsgaiA8PSBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgciA9IHIgKyBIW2ldW2pdICogSFtqXVtuXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZVtpXSA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IHc7XG4gICAgICAgICAgICAgICAgICAgIHMgPSByO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGwgPSBpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9ICh3ICE9PSAwKSA/ICgtciAvIHcpIDogKC1yIC8gKGVwcyAqIG5vcm0pKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHggPSBIW2ldW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHkgPSBIW2kgKyAxXVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEgPSAoZFtpXSAtIHApICogKGRbaV0gLSBwKSArIGVbaV0gKiBlW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgdCA9ICh4ICogcyAtIHogKiByKSAvIHE7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW25dID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaSArIDFdW25dID0gKE1hdGguYWJzKHgpID4gTWF0aC5hYnMoeikpID8gKCgtciAtIHcgKiB0KSAvIHgpIDogKCgtcyAtIHkgKiB0KSAvIHopO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdCA9IE1hdGguYWJzKEhbaV1bbl0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGVwcyAqIHQpICogdCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtqXVtuXSA9IEhbal1bbl0gLyB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHEgPCAwKSB7XG4gICAgICAgICAgICBsID0gbiAtIDE7XG5cbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhIW25dW24gLSAxXSkgPiBNYXRoLmFicyhIW24gLSAxXVtuXSkpIHtcbiAgICAgICAgICAgICAgICBIW24gLSAxXVtuIC0gMV0gPSBxIC8gSFtuXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgSFtuIC0gMV1bbl0gPSAtKEhbbl1bbl0gLSBwKSAvIEhbbl1bbiAtIDFdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZGl2cmVzID0gY2RpdigwLCAtSFtuIC0gMV1bbl0sIEhbbiAtIDFdW24gLSAxXSAtIHAsIHEpO1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW24gLSAxXSA9IGNkaXZyZXNbMF07XG4gICAgICAgICAgICAgICAgSFtuIC0gMV1bbl0gPSBjZGl2cmVzWzFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBIW25dW24gLSAxXSA9IDA7XG4gICAgICAgICAgICBIW25dW25dID0gMTtcbiAgICAgICAgICAgIGZvciAoaSA9IG4gLSAyOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHJhID0gMDtcbiAgICAgICAgICAgICAgICBzYSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gbDsgaiA8PSBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcmEgPSByYSArIEhbaV1bal0gKiBIW2pdW24gLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgc2EgPSBzYSArIEhbaV1bal0gKiBIW2pdW25dO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHcgPSBIW2ldW2ldIC0gcDtcblxuICAgICAgICAgICAgICAgIGlmIChlW2ldIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB6ID0gdztcbiAgICAgICAgICAgICAgICAgICAgciA9IHJhO1xuICAgICAgICAgICAgICAgICAgICBzID0gc2E7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlW2ldID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjZGl2cmVzID0gY2RpdigtcmEsIC1zYSwgdywgcSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW24gLSAxXSA9IGNkaXZyZXNbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW25dID0gY2RpdnJlc1sxXTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHggPSBIW2ldW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHkgPSBIW2kgKyAxXVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZyID0gKGRbaV0gLSBwKSAqIChkW2ldIC0gcCkgKyBlW2ldICogZVtpXSAtIHEgKiBxO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmkgPSAoZFtpXSAtIHApICogMiAqIHE7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodnIgPT09IDAgJiYgdmkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ciA9IGVwcyAqIG5vcm0gKiAoTWF0aC5hYnModykgKyBNYXRoLmFicyhxKSArIE1hdGguYWJzKHgpICsgTWF0aC5hYnMoeSkgKyBNYXRoLmFicyh6KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjZGl2cmVzID0gY2Rpdih4ICogciAtIHogKiByYSArIHEgKiBzYSwgeCAqIHMgLSB6ICogc2EgLSBxICogcmEsIHZyLCB2aSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW24gLSAxXSA9IGNkaXZyZXNbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW25dID0gY2RpdnJlc1sxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyh4KSA+IChNYXRoLmFicyh6KSArIE1hdGguYWJzKHEpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbaSArIDFdW24gLSAxXSA9ICgtcmEgLSB3ICogSFtpXVtuIC0gMV0gKyBxICogSFtpXVtuXSkgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbaSArIDFdW25dID0gKC1zYSAtIHcgKiBIW2ldW25dIC0gcSAqIEhbaV1bbiAtIDFdKSAvIHg7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNkaXZyZXMgPSBjZGl2KC1yIC0geSAqIEhbaV1bbiAtIDFdLCAtcyAtIHkgKiBIW2ldW25dLCB6LCBxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbaSArIDFdW25dID0gY2RpdnJlc1sxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHQgPSBNYXRoLm1heChNYXRoLmFicyhIW2ldW24gLSAxXSksIE1hdGguYWJzKEhbaV1bbl0pKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKChlcHMgKiB0KSAqIHQgPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSBpOyBqIDw9IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbal1bbiAtIDFdID0gSFtqXVtuIC0gMV0gLyB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbal1bbl0gPSBIW2pdW25dIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBubjsgaSsrKSB7XG4gICAgICAgIGlmIChpIDwgbG93IHx8IGkgPiBoaWdoKSB7XG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgICAgIFZbaV1bal0gPSBIW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChqID0gbm4gLSAxOyBqID49IGxvdzsgai0tKSB7XG4gICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgIHogPSAwO1xuICAgICAgICAgICAgZm9yIChrID0gbG93OyBrIDw9IE1hdGgubWluKGosIGhpZ2gpOyBrKyspIHtcbiAgICAgICAgICAgICAgICB6ID0geiArIFZbaV1ba10gKiBIW2tdW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgVltpXVtqXSA9IHo7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNkaXYoeHIsIHhpLCB5ciwgeWkpIHtcbiAgICB2YXIgciwgZDtcbiAgICBpZiAoTWF0aC5hYnMoeXIpID4gTWF0aC5hYnMoeWkpKSB7XG4gICAgICAgIHIgPSB5aSAvIHlyO1xuICAgICAgICBkID0geXIgKyByICogeWk7XG4gICAgICAgIHJldHVybiBbKHhyICsgciAqIHhpKSAvIGQsICh4aSAtIHIgKiB4cikgLyBkXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHIgPSB5ciAvIHlpO1xuICAgICAgICBkID0geWkgKyByICogeXI7XG4gICAgICAgIHJldHVybiBbKHIgKiB4ciArIHhpKSAvIGQsIChyICogeGkgLSB4cikgLyBkXTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRWlnZW52YWx1ZURlY29tcG9zaXRpb247XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9MdURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIEx1RGVjb21wb3NpdGlvbihtYXRyaXgpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTHVEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IEx1RGVjb21wb3NpdGlvbihtYXRyaXgpO1xuICAgIH1cbiAgICBtYXRyaXggPSBNYXRyaXguY2hlY2tNYXRyaXgobWF0cml4KTtcblxuICAgIHZhciBsdSA9IG1hdHJpeC5jbG9uZSgpLFxuICAgICAgICByb3dzID0gbHUucm93cyxcbiAgICAgICAgY29sdW1ucyA9IGx1LmNvbHVtbnMsXG4gICAgICAgIHBpdm90VmVjdG9yID0gbmV3IEFycmF5KHJvd3MpLFxuICAgICAgICBwaXZvdFNpZ24gPSAxLFxuICAgICAgICBpLCBqLCBrLCBwLCBzLCB0LCB2LFxuICAgICAgICBMVXJvd2ksIExVY29saiwga21heDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgcGl2b3RWZWN0b3JbaV0gPSBpO1xuICAgIH1cblxuICAgIExVY29saiA9IG5ldyBBcnJheShyb3dzKTtcblxuICAgIGZvciAoaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBMVWNvbGpbaV0gPSBsdVtpXVtqXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIExVcm93aSA9IGx1W2ldO1xuICAgICAgICAgICAga21heCA9IE1hdGgubWluKGksIGopO1xuICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwga21heDsgaysrKSB7XG4gICAgICAgICAgICAgICAgcyArPSBMVXJvd2lba10gKiBMVWNvbGpba107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBMVXJvd2lbal0gPSBMVWNvbGpbaV0gLT0gcztcbiAgICAgICAgfVxuXG4gICAgICAgIHAgPSBqO1xuICAgICAgICBmb3IgKGkgPSBqICsgMTsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKExVY29saltpXSkgPiBNYXRoLmFicyhMVWNvbGpbcF0pKSB7XG4gICAgICAgICAgICAgICAgcCA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocCAhPT0gaikge1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGNvbHVtbnM7IGsrKykge1xuICAgICAgICAgICAgICAgIHQgPSBsdVtwXVtrXTtcbiAgICAgICAgICAgICAgICBsdVtwXVtrXSA9IGx1W2pdW2tdO1xuICAgICAgICAgICAgICAgIGx1W2pdW2tdID0gdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdiA9IHBpdm90VmVjdG9yW3BdO1xuICAgICAgICAgICAgcGl2b3RWZWN0b3JbcF0gPSBwaXZvdFZlY3RvcltqXTtcbiAgICAgICAgICAgIHBpdm90VmVjdG9yW2pdID0gdjtcblxuICAgICAgICAgICAgcGl2b3RTaWduID0gLXBpdm90U2lnbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChqIDwgcm93cyAmJiBsdVtqXVtqXSAhPT0gMCkge1xuICAgICAgICAgICAgZm9yIChpID0gaiArIDE7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsdVtpXVtqXSAvPSBsdVtqXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuTFUgPSBsdTtcbiAgICB0aGlzLnBpdm90VmVjdG9yID0gcGl2b3RWZWN0b3I7XG4gICAgdGhpcy5waXZvdFNpZ24gPSBwaXZvdFNpZ247XG59XG5cbkx1RGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgaXNTaW5ndWxhcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuTFUsXG4gICAgICAgICAgICBjb2wgPSBkYXRhLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChkYXRhW2pdW2pdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG4gICAgZ2V0IGRldGVybWluYW50KCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuTFU7XG4gICAgICAgIGlmICghZGF0YS5pc1NxdWFyZSgpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggbXVzdCBiZSBzcXVhcmUnKTtcbiAgICAgICAgdmFyIGRldGVybWluYW50ID0gdGhpcy5waXZvdFNpZ24sIGNvbCA9IGRhdGEuY29sdW1ucztcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2w7IGorKylcbiAgICAgICAgICAgIGRldGVybWluYW50ICo9IGRhdGFbal1bal07XG4gICAgICAgIHJldHVybiBkZXRlcm1pbmFudDtcbiAgICB9LFxuICAgIGdldCBsb3dlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5MVSxcbiAgICAgICAgICAgIHJvd3MgPSBkYXRhLnJvd3MsXG4gICAgICAgICAgICBjb2x1bW5zID0gZGF0YS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpID4gaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gZGF0YVtpXVtqXTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPT09IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH0sXG4gICAgZ2V0IHVwcGVyVHJpYW5ndWxhck1hdHJpeCgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVLFxuICAgICAgICAgICAgcm93cyA9IGRhdGEucm93cyxcbiAgICAgICAgICAgIGNvbHVtbnMgPSBkYXRhLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPD0gaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gZGF0YVtpXVtqXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfSxcbiAgICBnZXQgcGl2b3RQZXJtdXRhdGlvblZlY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGl2b3RWZWN0b3Iuc2xpY2UoKTtcbiAgICB9LFxuICAgIHNvbHZlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgICAgIHZhciBsdSA9IHRoaXMuTFUsXG4gICAgICAgICAgICByb3dzID0gbHUucm93cztcblxuICAgICAgICBpZiAocm93cyAhPT0gdmFsdWUucm93cylcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBtYXRyaXggZGltZW5zaW9ucycpO1xuICAgICAgICBpZiAodGhpcy5pc1Npbmd1bGFyKCkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0xVIG1hdHJpeCBpcyBzaW5ndWxhcicpO1xuXG4gICAgICAgIHZhciBjb3VudCA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gdmFsdWUuc3ViTWF0cml4Um93KHRoaXMucGl2b3RWZWN0b3IsIDAsIGNvdW50IC0gMSksXG4gICAgICAgICAgICBjb2x1bW5zID0gbHUuY29sdW1ucyxcbiAgICAgICAgICAgIGksIGosIGs7XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8IGNvbHVtbnM7IGsrKykge1xuICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBjb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdIC09IFhba11bal0gKiBsdVtpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChrID0gY29sdW1ucyAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIFhba11bal0gLz0gbHVba11ba107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgazsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSAtPSBYW2tdW2pdICogbHVbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTHVEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG52YXIgaHlwb3RlbnVzZSA9IHJlcXVpcmUoJy4vdXRpbCcpLmh5cG90ZW51c2U7XG5cbi8vaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9RckRlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIFFyRGVjb21wb3NpdGlvbih2YWx1ZSkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBRckRlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgUXJEZWNvbXBvc2l0aW9uKHZhbHVlKTtcbiAgICB9XG4gICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgdmFyIHFyID0gdmFsdWUuY2xvbmUoKSxcbiAgICAgICAgbSA9IHZhbHVlLnJvd3MsXG4gICAgICAgIG4gPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICByZGlhZyA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgaSwgaiwgaywgcztcblxuICAgIGZvciAoayA9IDA7IGsgPCBuOyBrKyspIHtcbiAgICAgICAgdmFyIG5ybSA9IDA7XG4gICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgIG5ybSA9IGh5cG90ZW51c2UobnJtLCBxcltpXVtrXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5ybSAhPT0gMCkge1xuICAgICAgICAgICAgaWYgKHFyW2tdW2tdIDwgMCkge1xuICAgICAgICAgICAgICAgIG5ybSA9IC1ucm07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcXJbaV1ba10gLz0gbnJtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcXJba11ba10gKz0gMTtcbiAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IHFyW2ldW2tdICogcXJbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgPSAtcyAvIHFyW2tdW2tdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcXJbaV1bal0gKz0gcyAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZGlhZ1trXSA9IC1ucm07XG4gICAgfVxuXG4gICAgdGhpcy5RUiA9IHFyO1xuICAgIHRoaXMuUmRpYWcgPSByZGlhZztcbn1cblxuUXJEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBzb2x2ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgICAgICB2YXIgcXIgPSB0aGlzLlFSLFxuICAgICAgICAgICAgbSA9IHFyLnJvd3M7XG5cbiAgICAgICAgaWYgKHZhbHVlLnJvd3MgIT09IG0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCByb3cgZGltZW5zaW9ucyBtdXN0IGFncmVlJyk7XG4gICAgICAgIGlmICghdGhpcy5pc0Z1bGxSYW5rKCkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBpcyByYW5rIGRlZmljaWVudCcpO1xuXG4gICAgICAgIHZhciBjb3VudCA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gdmFsdWUuY2xvbmUoKSxcbiAgICAgICAgICAgIG4gPSBxci5jb2x1bW5zLFxuICAgICAgICAgICAgaSwgaiwgaywgcztcblxuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgbjsgaysrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSBxcltpXVtrXSAqIFhbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgPSAtcyAvIHFyW2tdW2tdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSArPSBzICogcXJbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoayA9IG4gLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBYW2tdW2pdIC89IHRoaXMuUmRpYWdba107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgazsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSAtPSBYW2tdW2pdICogcXJbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFguc3ViTWF0cml4KDAsIG4gLSAxLCAwLCBjb3VudCAtIDEpO1xuICAgIH0sXG4gICAgaXNGdWxsUmFuazogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY29sdW1ucyA9IHRoaXMuUVIuY29sdW1ucztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLlJkaWFnW2ldID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG4gICAgZ2V0IHVwcGVyVHJpYW5ndWxhck1hdHJpeCgpIHtcbiAgICAgICAgdmFyIHFyID0gdGhpcy5RUixcbiAgICAgICAgICAgIG4gPSBxci5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgobiwgbiksXG4gICAgICAgICAgICBpLCBqO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSBxcltpXVtqXTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPT09IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IHRoaXMuUmRpYWdbaV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH0sXG4gICAgZ2V0IG9ydGhvZ29uYWxNYXRyaXgoKSB7XG4gICAgICAgIHZhciBxciA9IHRoaXMuUVIsXG4gICAgICAgICAgICByb3dzID0gcXIucm93cyxcbiAgICAgICAgICAgIGNvbHVtbnMgPSBxci5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyksXG4gICAgICAgICAgICBpLCBqLCBrLCBzO1xuXG4gICAgICAgIGZvciAoayA9IGNvbHVtbnMgLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIFhbaV1ba10gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgWFtrXVtrXSA9IDE7XG4gICAgICAgICAgICBmb3IgKGogPSBrOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHFyW2tdW2tdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzICs9IHFyW2ldW2tdICogWFtpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHMgPSAtcyAvIHFyW2tdW2tdO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFhbaV1bal0gKz0gcyAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUXJEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xudmFyIGh5cG90ZW51c2UgPSB1dGlsLmh5cG90ZW51c2U7XG52YXIgZ2V0RmlsbGVkMkRBcnJheSA9IHV0aWwuZ2V0RmlsbGVkMkRBcnJheTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9TaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbi5jc1xuZnVuY3Rpb24gU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24odmFsdWUsIG9wdGlvbnMpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24odmFsdWUsIG9wdGlvbnMpO1xuICAgIH1cbiAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHZhciBtID0gdmFsdWUucm93cyxcbiAgICAgICAgbiA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgIG51ID0gTWF0aC5taW4obSwgbik7XG5cbiAgICB2YXIgd2FudHUgPSB0cnVlLCB3YW50diA9IHRydWU7XG4gICAgaWYgKG9wdGlvbnMuY29tcHV0ZUxlZnRTaW5ndWxhclZlY3RvcnMgPT09IGZhbHNlKVxuICAgICAgICB3YW50dSA9IGZhbHNlO1xuICAgIGlmIChvcHRpb25zLmNvbXB1dGVSaWdodFNpbmd1bGFyVmVjdG9ycyA9PT0gZmFsc2UpXG4gICAgICAgIHdhbnR2ID0gZmFsc2U7XG4gICAgdmFyIGF1dG9UcmFuc3Bvc2UgPSBvcHRpb25zLmF1dG9UcmFuc3Bvc2UgPT09IHRydWU7XG5cbiAgICB2YXIgc3dhcHBlZCA9IGZhbHNlO1xuICAgIHZhciBhO1xuICAgIGlmIChtIDwgbikge1xuICAgICAgICBpZiAoIWF1dG9UcmFuc3Bvc2UpIHtcbiAgICAgICAgICAgIGEgPSB2YWx1ZS5jbG9uZSgpO1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdDb21wdXRpbmcgU1ZEIG9uIGEgbWF0cml4IHdpdGggbW9yZSBjb2x1bW5zIHRoYW4gcm93cy4gQ29uc2lkZXIgZW5hYmxpbmcgYXV0b1RyYW5zcG9zZScpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYSA9IHZhbHVlLnRyYW5zcG9zZSgpO1xuICAgICAgICAgICAgbSA9IGEucm93cztcbiAgICAgICAgICAgIG4gPSBhLmNvbHVtbnM7XG4gICAgICAgICAgICBzd2FwcGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHZhciBhdXggPSB3YW50dTtcbiAgICAgICAgICAgIHdhbnR1ID0gd2FudHY7XG4gICAgICAgICAgICB3YW50diA9IGF1eDtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGEgPSB2YWx1ZS5jbG9uZSgpO1xuICAgIH1cblxuICAgIHZhciBzID0gbmV3IEFycmF5KE1hdGgubWluKG0gKyAxLCBuKSksXG4gICAgICAgIFUgPSBnZXRGaWxsZWQyREFycmF5KG0sIG51LCAwKSxcbiAgICAgICAgViA9IGdldEZpbGxlZDJEQXJyYXkobiwgbiwgMCksXG4gICAgICAgIGUgPSBuZXcgQXJyYXkobiksXG4gICAgICAgIHdvcmsgPSBuZXcgQXJyYXkobSk7XG5cbiAgICB2YXIgbmN0ID0gTWF0aC5taW4obSAtIDEsIG4pO1xuICAgIHZhciBucnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihuIC0gMiwgbSkpO1xuXG4gICAgdmFyIGksIGosIGssIHAsIHQsIGtzLCBmLCBjcywgc24sIG1heCwga2FzZSxcbiAgICAgICAgc2NhbGUsIHNwLCBzcG0xLCBlcG0xLCBzaywgZWssIGIsIGMsIHNoaWZ0LCBnO1xuXG4gICAgZm9yIChrID0gMCwgbWF4ID0gTWF0aC5tYXgobmN0LCBucnQpOyBrIDwgbWF4OyBrKyspIHtcbiAgICAgICAgaWYgKGsgPCBuY3QpIHtcbiAgICAgICAgICAgIHNba10gPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIHNba10gPSBoeXBvdGVudXNlKHNba10sIGFbaV1ba10pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNba10gIT09IDApIHtcbiAgICAgICAgICAgICAgICBpZiAoYVtrXVtrXSA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc1trXSA9IC1zW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFbaV1ba10gLz0gc1trXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYVtrXVtrXSArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc1trXSA9IC1zW2tdO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgIGlmICgoayA8IG5jdCkgJiYgKHNba10gIT09IDApKSB7XG4gICAgICAgICAgICAgICAgdCA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0ICs9IGFbaV1ba10gKiBhW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ID0gLXQgLyBhW2tdW2tdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYVtpXVtqXSArPSB0ICogYVtpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlW2pdID0gYVtrXVtqXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh3YW50dSAmJiAoayA8IG5jdCkpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBVW2ldW2tdID0gYVtpXVtrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChrIDwgbnJ0KSB7XG4gICAgICAgICAgICBlW2tdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZVtrXSA9IGh5cG90ZW51c2UoZVtrXSwgZVtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZVtrXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGlmIChlW2sgKyAxXSA8IDApXG4gICAgICAgICAgICAgICAgICAgIGVba10gPSAtZVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBlW2ldIC89IGVba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVbayArIDFdICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlW2tdID0gLWVba107XG4gICAgICAgICAgICBpZiAoKGsgKyAxIDwgbSkgJiYgKGVba10gIT09IDApKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgd29ya1tpXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3b3JrW2ldICs9IGVbal0gKiBhW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSAtZVtqXSAvIGVbayArIDFdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYVtpXVtqXSArPSB0ICogd29ya1tpXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3YW50dikge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZbaV1ba10gPSBlW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHAgPSBNYXRoLm1pbihuLCBtICsgMSk7XG4gICAgaWYgKG5jdCA8IG4pIHtcbiAgICAgICAgc1tuY3RdID0gYVtuY3RdW25jdF07XG4gICAgfVxuICAgIGlmIChtIDwgcCkge1xuICAgICAgICBzW3AgLSAxXSA9IDA7XG4gICAgfVxuICAgIGlmIChucnQgKyAxIDwgcCkge1xuICAgICAgICBlW25ydF0gPSBhW25ydF1bcCAtIDFdO1xuICAgIH1cbiAgICBlW3AgLSAxXSA9IDA7XG5cbiAgICBpZiAod2FudHUpIHtcbiAgICAgICAgZm9yIChqID0gbmN0OyBqIDwgbnU7IGorKykge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIFVbaV1bal0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgVVtqXVtqXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChrID0gbmN0IC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGlmIChzW2tdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBudTsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSAwO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ICs9IFVbaV1ba10gKiBVW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQgPSAtdCAvIFVba11ba107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bal0gKz0gdCAqIFVbaV1ba107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBVW2ldW2tdID0gLVVbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFVba11ba10gPSAxICsgVVtrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgayAtIDE7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBVW2ldW2tdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFVba11ba10gPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHdhbnR2KSB7XG4gICAgICAgIGZvciAoayA9IG4gLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgaWYgKChrIDwgbnJ0KSAmJiAoZVtrXSAhPT0gMCkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgKz0gVltpXVtrXSAqIFZbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IC10IC8gVltrICsgMV1ba107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2pdICs9IHQgKiBWW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIFZbaV1ba10gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgVltrXVtrXSA9IDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgcHAgPSBwIC0gMSxcbiAgICAgICAgaXRlciA9IDAsXG4gICAgICAgIGVwcyA9IE1hdGgucG93KDIsIC01Mik7XG4gICAgd2hpbGUgKHAgPiAwKSB7XG4gICAgICAgIGZvciAoayA9IHAgLSAyOyBrID49IC0xOyBrLS0pIHtcbiAgICAgICAgICAgIGlmIChrID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKGVba10pIDw9IGVwcyAqIChNYXRoLmFicyhzW2tdKSArIE1hdGguYWJzKHNbayArIDFdKSkpIHtcbiAgICAgICAgICAgICAgICBlW2tdID0gMDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoayA9PT0gcCAtIDIpIHtcbiAgICAgICAgICAgIGthc2UgPSA0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChrcyA9IHAgLSAxOyBrcyA+PSBrOyBrcy0tKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtzID09PSBrKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ID0gKGtzICE9PSBwID8gTWF0aC5hYnMoZVtrc10pIDogMCkgKyAoa3MgIT09IGsgKyAxID8gTWF0aC5hYnMoZVtrcyAtIDFdKSA6IDApO1xuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhzW2tzXSkgPD0gZXBzICogdCkge1xuICAgICAgICAgICAgICAgICAgICBzW2tzXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChrcyA9PT0gaykge1xuICAgICAgICAgICAgICAgIGthc2UgPSAzO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChrcyA9PT0gcCAtIDEpIHtcbiAgICAgICAgICAgICAgICBrYXNlID0gMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAga2FzZSA9IDI7XG4gICAgICAgICAgICAgICAgayA9IGtzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaysrO1xuXG4gICAgICAgIHN3aXRjaCAoa2FzZSkge1xuICAgICAgICAgICAgY2FzZSAxOiB7XG4gICAgICAgICAgICAgICAgZiA9IGVbcCAtIDJdO1xuICAgICAgICAgICAgICAgIGVbcCAtIDJdID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBwIC0gMjsgaiA+PSBrOyBqLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IGh5cG90ZW51c2Uoc1tqXSwgZik7XG4gICAgICAgICAgICAgICAgICAgIGNzID0gc1tqXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNuID0gZiAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNbal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoaiAhPT0gaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZiA9IC1zbiAqIGVbaiAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZVtqIC0gMV0gPSBjcyAqIGVbaiAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBjcyAqIFZbaV1bal0gKyBzbiAqIFZbaV1bcCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bcCAtIDFdID0gLXNuICogVltpXVtqXSArIGNzICogVltpXVtwIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIDIgOiB7XG4gICAgICAgICAgICAgICAgZiA9IGVbayAtIDFdO1xuICAgICAgICAgICAgICAgIGVbayAtIDFdID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrOyBqIDwgcDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKHNbal0sIGYpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IHNbal0gLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgZiA9IC1zbiAqIGVbal07XG4gICAgICAgICAgICAgICAgICAgIGVbal0gPSBjcyAqIGVbal07XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBjcyAqIFVbaV1bal0gKyBzbiAqIFVbaV1bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bayAtIDFdID0gLXNuICogVVtpXVtqXSArIGNzICogVVtpXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIDMgOiB7XG4gICAgICAgICAgICAgICAgc2NhbGUgPSBNYXRoLm1heChNYXRoLm1heChNYXRoLm1heChNYXRoLm1heChNYXRoLmFicyhzW3AgLSAxXSksIE1hdGguYWJzKHNbcCAtIDJdKSksIE1hdGguYWJzKGVbcCAtIDJdKSksIE1hdGguYWJzKHNba10pKSwgTWF0aC5hYnMoZVtrXSkpO1xuICAgICAgICAgICAgICAgIHNwID0gc1twIC0gMV0gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBzcG0xID0gc1twIC0gMl0gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBlcG0xID0gZVtwIC0gMl0gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBzayA9IHNba10gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBlayA9IGVba10gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBiID0gKChzcG0xICsgc3ApICogKHNwbTEgLSBzcCkgKyBlcG0xICogZXBtMSkgLyAyO1xuICAgICAgICAgICAgICAgIGMgPSAoc3AgKiBlcG0xKSAqIChzcCAqIGVwbTEpO1xuICAgICAgICAgICAgICAgIHNoaWZ0ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoKGIgIT09IDApIHx8IChjICE9PSAwKSkge1xuICAgICAgICAgICAgICAgICAgICBzaGlmdCA9IE1hdGguc3FydChiICogYiArIGMpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYiA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNoaWZ0ID0gLXNoaWZ0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNoaWZ0ID0gYyAvIChiICsgc2hpZnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmID0gKHNrICsgc3ApICogKHNrIC0gc3ApICsgc2hpZnQ7XG4gICAgICAgICAgICAgICAgZyA9IHNrICogZWs7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IHAgLSAxOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IGh5cG90ZW51c2UoZiwgZyk7XG4gICAgICAgICAgICAgICAgICAgIGNzID0gZiAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNuID0gZyAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChqICE9PSBrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlW2ogLSAxXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZiA9IGNzICogc1tqXSArIHNuICogZVtqXTtcbiAgICAgICAgICAgICAgICAgICAgZVtqXSA9IGNzICogZVtqXSAtIHNuICogc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgZyA9IHNuICogc1tqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIHNbaiArIDFdID0gY3MgKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IGNzICogVltpXVtqXSArIHNuICogVltpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqICsgMV0gPSAtc24gKiBWW2ldW2pdICsgY3MgKiBWW2ldW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0ID0gaHlwb3RlbnVzZShmLCBnKTtcbiAgICAgICAgICAgICAgICAgICAgY3MgPSBmIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc24gPSBnIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc1tqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIGYgPSBjcyAqIGVbal0gKyBzbiAqIHNbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBzW2ogKyAxXSA9IC1zbiAqIGVbal0gKyBjcyAqIHNbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBnID0gc24gKiBlW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgZVtqICsgMV0gPSBjcyAqIGVbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHUgJiYgKGogPCBtIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBVW2ldW2pdICsgc24gKiBVW2ldW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2ogKyAxXSA9IC1zbiAqIFVbaV1bal0gKyBjcyAqIFVbaV1baiArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVbcCAtIDJdID0gZjtcbiAgICAgICAgICAgICAgICBpdGVyID0gaXRlciArIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIDQ6IHtcbiAgICAgICAgICAgICAgICBpZiAoc1trXSA8PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNba10gPSAoc1trXSA8IDAgPyAtc1trXSA6IDApO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gcHA7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1ba10gPSAtVltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aGlsZSAoayA8IHBwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzW2tdID49IHNbayArIDFdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0ID0gc1trXTtcbiAgICAgICAgICAgICAgICAgICAgc1trXSA9IHNbayArIDFdO1xuICAgICAgICAgICAgICAgICAgICBzW2sgKyAxXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50diAmJiAoayA8IG4gLSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBWW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2sgKyAxXSA9IFZbaV1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR1ICYmIChrIDwgbSAtIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IFVbaV1bayArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bayArIDFdID0gVVtpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2tdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBrKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGl0ZXIgPSAwO1xuICAgICAgICAgICAgICAgIHAtLTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzd2FwcGVkKSB7XG4gICAgICAgIHZhciB0bXAgPSBWO1xuICAgICAgICBWID0gVTtcbiAgICAgICAgVSA9IHRtcDtcbiAgICB9XG5cbiAgICB0aGlzLm0gPSBtO1xuICAgIHRoaXMubiA9IG47XG4gICAgdGhpcy5zID0gcztcbiAgICB0aGlzLlUgPSBVO1xuICAgIHRoaXMuViA9IFY7XG59XG5cblNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBnZXQgY29uZGl0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zWzBdIC8gdGhpcy5zW01hdGgubWluKHRoaXMubSwgdGhpcy5uKSAtIDFdO1xuICAgIH0sXG4gICAgZ2V0IG5vcm0yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zWzBdO1xuICAgIH0sXG4gICAgZ2V0IHJhbmsoKSB7XG4gICAgICAgIHZhciBlcHMgPSBNYXRoLnBvdygyLCAtNTIpLFxuICAgICAgICAgICAgdG9sID0gTWF0aC5tYXgodGhpcy5tLCB0aGlzLm4pICogdGhpcy5zWzBdICogZXBzLFxuICAgICAgICAgICAgciA9IDAsXG4gICAgICAgICAgICBzID0gdGhpcy5zO1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgaWkgPSBzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzW2ldID4gdG9sKSB7XG4gICAgICAgICAgICAgICAgcisrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByO1xuICAgIH0sXG4gICAgZ2V0IGRpYWdvbmFsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zO1xuICAgIH0sXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FjY29yZC1uZXQvZnJhbWV3b3JrL2Jsb2IvZGV2ZWxvcG1lbnQvU291cmNlcy9BY2NvcmQuTWF0aC9EZWNvbXBvc2l0aW9ucy9TaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbi5jc1xuICAgIGdldCB0aHJlc2hvbGQoKSB7XG4gICAgICAgIHJldHVybiAoTWF0aC5wb3coMiwgLTUyKSAvIDIpICogTWF0aC5tYXgodGhpcy5tLCB0aGlzLm4pICogdGhpcy5zWzBdO1xuICAgIH0sXG4gICAgZ2V0IGxlZnRTaW5ndWxhclZlY3RvcnMoKSB7XG4gICAgICAgIGlmICghTWF0cml4LmlzTWF0cml4KHRoaXMuVSkpIHtcbiAgICAgICAgICAgIHRoaXMuVSA9IG5ldyBNYXRyaXgodGhpcy5VKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5VO1xuICAgIH0sXG4gICAgZ2V0IHJpZ2h0U2luZ3VsYXJWZWN0b3JzKCkge1xuICAgICAgICBpZiAoIU1hdHJpeC5pc01hdHJpeCh0aGlzLlYpKSB7XG4gICAgICAgICAgICB0aGlzLlYgPSBuZXcgTWF0cml4KHRoaXMuVik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuVjtcbiAgICB9LFxuICAgIGdldCBkaWFnb25hbE1hdHJpeCgpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5kaWFnKHRoaXMucyk7XG4gICAgfSxcbiAgICBzb2x2ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG5cbiAgICAgICAgdmFyIFkgPSB2YWx1ZSxcbiAgICAgICAgICAgIGUgPSB0aGlzLnRocmVzaG9sZCxcbiAgICAgICAgICAgIHNjb2xzID0gdGhpcy5zLmxlbmd0aCxcbiAgICAgICAgICAgIExzID0gTWF0cml4Lnplcm9zKHNjb2xzLCBzY29scyksXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBzY29sczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnModGhpcy5zW2ldKSA8PSBlKSB7XG4gICAgICAgICAgICAgICAgTHNbaV1baV0gPSAwO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBMc1tpXVtpXSA9IDEgLyB0aGlzLnNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgVSA9IHRoaXMuVTtcbiAgICAgICAgdmFyIFYgPSB0aGlzLnJpZ2h0U2luZ3VsYXJWZWN0b3JzO1xuXG4gICAgICAgIHZhciBWTCA9IFYubW11bChMcyksXG4gICAgICAgICAgICB2cm93cyA9IFYucm93cyxcbiAgICAgICAgICAgIHVyb3dzID0gVS5sZW5ndGgsXG4gICAgICAgICAgICBWTFUgPSBNYXRyaXguemVyb3ModnJvd3MsIHVyb3dzKSxcbiAgICAgICAgICAgIGosIGssIHN1bTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVyb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzdW0gPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBzY29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN1bSArPSBWTFtpXVtrXSAqIFVbal1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFZMVVtpXVtqXSA9IHN1bTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBWTFUubW11bChZKTtcbiAgICB9LFxuICAgIHNvbHZlRm9yRGlhZ29uYWw6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zb2x2ZShNYXRyaXguZGlhZyh2YWx1ZSkpO1xuICAgIH0sXG4gICAgaW52ZXJzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgViA9IHRoaXMuVjtcbiAgICAgICAgdmFyIGUgPSB0aGlzLnRocmVzaG9sZCxcbiAgICAgICAgICAgIHZyb3dzID0gVi5sZW5ndGgsXG4gICAgICAgICAgICB2Y29scyA9IFZbMF0ubGVuZ3RoLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgodnJvd3MsIHRoaXMucy5sZW5ndGgpLFxuICAgICAgICAgICAgaSwgajtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHZjb2xzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnModGhpcy5zW2pdKSA+IGUpIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IFZbaV1bal0gLyB0aGlzLnNbal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIFUgPSB0aGlzLlU7XG5cbiAgICAgICAgdmFyIHVyb3dzID0gVS5sZW5ndGgsXG4gICAgICAgICAgICB1Y29scyA9IFVbMF0ubGVuZ3RoLFxuICAgICAgICAgICAgWSA9IG5ldyBNYXRyaXgodnJvd3MsIHVyb3dzKSxcbiAgICAgICAgICAgIGssIHN1bTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVyb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzdW0gPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCB1Y29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN1bSArPSBYW2ldW2tdICogVVtqXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgWVtpXVtqXSA9IHN1bTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBZO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb247XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuaHlwb3RlbnVzZSA9IGZ1bmN0aW9uIGh5cG90ZW51c2UoYSwgYikge1xuICAgIGlmIChNYXRoLmFicyhhKSA+IE1hdGguYWJzKGIpKSB7XG4gICAgICAgIHZhciByID0gYiAvIGE7XG4gICAgICAgIHJldHVybiBNYXRoLmFicyhhKSAqIE1hdGguc3FydCgxICsgciAqIHIpO1xuICAgIH1cbiAgICBpZiAoYiAhPT0gMCkge1xuICAgICAgICB2YXIgciA9IGEgLyBiO1xuICAgICAgICByZXR1cm4gTWF0aC5hYnMoYikgKiBNYXRoLnNxcnQoMSArIHIgKiByKTtcbiAgICB9XG4gICAgcmV0dXJuIDA7XG59O1xuXG4vLyBGb3IgdXNlIGluIHRoZSBkZWNvbXBvc2l0aW9uIGFsZ29yaXRobXMuIFdpdGggYmlnIG1hdHJpY2VzLCBhY2Nlc3MgdGltZSBpc1xuLy8gdG9vIGxvbmcgb24gZWxlbWVudHMgZnJvbSBhcnJheSBzdWJjbGFzc1xuLy8gdG9kbyBjaGVjayB3aGVuIGl0IGlzIGZpeGVkIGluIHY4XG4vLyBodHRwOi8vanNwZXJmLmNvbS9hY2Nlc3MtYW5kLXdyaXRlLWFycmF5LXN1YmNsYXNzXG5leHBvcnRzLmdldEVtcHR5MkRBcnJheSA9IGZ1bmN0aW9uIChyb3dzLCBjb2x1bW5zKSB7XG4gICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gbmV3IEFycmF5KGNvbHVtbnMpO1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG59O1xuXG5leHBvcnRzLmdldEZpbGxlZDJEQXJyYXkgPSBmdW5jdGlvbiAocm93cywgY29sdW1ucywgdmFsdWUpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSBuZXcgQXJyYXkoY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICBhcnJheVtpXVtqXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuL21hdHJpeCcpO1xuXG52YXIgU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL3N2ZCcpO1xudmFyIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9ldmQnKTtcbnZhciBMdURlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL2x1Jyk7XG52YXIgUXJEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9xcicpO1xudmFyIENob2xlc2t5RGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvY2hvbGVza3knKTtcblxuZnVuY3Rpb24gaW52ZXJzZShtYXRyaXgpIHtcbiAgICBtYXRyaXggPSBNYXRyaXguY2hlY2tNYXRyaXgobWF0cml4KTtcbiAgICByZXR1cm4gc29sdmUobWF0cml4LCBNYXRyaXguZXllKG1hdHJpeC5yb3dzKSk7XG59XG5cbk1hdHJpeC5pbnZlcnNlID0gTWF0cml4LmludiA9IGludmVyc2U7XG5NYXRyaXgucHJvdG90eXBlLmludmVyc2UgPSBNYXRyaXgucHJvdG90eXBlLmludiA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gaW52ZXJzZSh0aGlzKTtcbn07XG5cbmZ1bmN0aW9uIHNvbHZlKGxlZnRIYW5kU2lkZSwgcmlnaHRIYW5kU2lkZSkge1xuICAgIGxlZnRIYW5kU2lkZSA9IE1hdHJpeC5jaGVja01hdHJpeChsZWZ0SGFuZFNpZGUpO1xuICAgIHJpZ2h0SGFuZFNpZGUgPSBNYXRyaXguY2hlY2tNYXRyaXgocmlnaHRIYW5kU2lkZSk7XG4gICAgcmV0dXJuIGxlZnRIYW5kU2lkZS5pc1NxdWFyZSgpID8gbmV3IEx1RGVjb21wb3NpdGlvbihsZWZ0SGFuZFNpZGUpLnNvbHZlKHJpZ2h0SGFuZFNpZGUpIDogbmV3IFFyRGVjb21wb3NpdGlvbihsZWZ0SGFuZFNpZGUpLnNvbHZlKHJpZ2h0SGFuZFNpZGUpO1xufVxuXG5NYXRyaXguc29sdmUgPSBzb2x2ZTtcbk1hdHJpeC5wcm90b3R5cGUuc29sdmUgPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICByZXR1cm4gc29sdmUodGhpcywgb3RoZXIpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb246IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIFNWRDogU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24sXG4gICAgRWlnZW52YWx1ZURlY29tcG9zaXRpb246IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIEVWRDogRWlnZW52YWx1ZURlY29tcG9zaXRpb24sXG4gICAgTHVEZWNvbXBvc2l0aW9uOiBMdURlY29tcG9zaXRpb24sXG4gICAgTFU6IEx1RGVjb21wb3NpdGlvbixcbiAgICBRckRlY29tcG9zaXRpb246IFFyRGVjb21wb3NpdGlvbixcbiAgICBRUjogUXJEZWNvbXBvc2l0aW9uLFxuICAgIENob2xlc2t5RGVjb21wb3NpdGlvbjogQ2hvbGVza3lEZWNvbXBvc2l0aW9uLFxuICAgIENITzogQ2hvbGVza3lEZWNvbXBvc2l0aW9uLFxuICAgIGludmVyc2U6IGludmVyc2UsXG4gICAgc29sdmU6IHNvbHZlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbWF0cml4Jyk7XG5tb2R1bGUuZXhwb3J0cy5EZWNvbXBvc2l0aW9ucyA9IG1vZHVsZS5leHBvcnRzLkRDID0gcmVxdWlyZSgnLi9kZWNvbXBvc2l0aW9ucycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFJlYWwgbWF0cml4XG4gKi9cbmNsYXNzIE1hdHJpeCBleHRlbmRzIEFycmF5IHtcbiAgICAvKipcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0ge251bWJlcnxBcnJheXxNYXRyaXh9IG5Sb3dzIC0gTnVtYmVyIG9mIHJvd3Mgb2YgdGhlIG5ldyBtYXRyaXgsXG4gICAgICogMkQgYXJyYXkgY29udGFpbmluZyB0aGUgZGF0YSBvciBNYXRyaXggaW5zdGFuY2UgdG8gY2xvbmVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW25Db2x1bW5zXSAtIE51bWJlciBvZiBjb2x1bW5zIG9mIHRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgY29uc3RydWN0b3IoblJvd3MsIG5Db2x1bW5zKSB7XG4gICAgICAgIGlmIChNYXRyaXguaXNNYXRyaXgoblJvd3MpKSB7XG4gICAgICAgICAgICByZXR1cm4gblJvd3MuY2xvbmUoKTtcbiAgICAgICAgfSBlbHNlIGlmIChOdW1iZXIuaXNJbnRlZ2VyKG5Sb3dzKSAmJiBuUm93cyA+IDApIHsgLy8gQ3JlYXRlIGFuIGVtcHR5IG1hdHJpeFxuICAgICAgICAgICAgc3VwZXIoblJvd3MpO1xuICAgICAgICAgICAgaWYgKE51bWJlci5pc0ludGVnZXIobkNvbHVtbnMpICYmIG5Db2x1bW5zID4gMCkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgblJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW2ldID0gbmV3IEFycmF5KG5Db2x1bW5zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ25Db2x1bW5zIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShuUm93cykpIHsgLy8gQ29weSB0aGUgdmFsdWVzIGZyb20gdGhlIDJEIGFycmF5XG4gICAgICAgICAgICB2YXIgbWF0cml4ID0gblJvd3M7XG4gICAgICAgICAgICBuUm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgICAgICAgICBuQ29sdW1ucyA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG5Db2x1bW5zICE9PSAnbnVtYmVyJyB8fCBuQ29sdW1ucyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0RhdGEgbXVzdCBiZSBhIDJEIGFycmF5IHdpdGggYXQgbGVhc3Qgb25lIGVsZW1lbnQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN1cGVyKG5Sb3dzKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgblJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChtYXRyaXhbaV0ubGVuZ3RoICE9PSBuQ29sdW1ucykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW5jb25zaXN0ZW50IGFycmF5IGRpbWVuc2lvbnMnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpc1tpXSA9IFtdLmNvbmNhdChtYXRyaXhbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlciBvciBhbiBhcnJheScpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucm93cyA9IG5Sb3dzO1xuICAgICAgICB0aGlzLmNvbHVtbnMgPSBuQ29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb25zdHJ1Y3RzIGEgTWF0cml4IHdpdGggdGhlIGNob3NlbiBkaW1lbnNpb25zIGZyb20gYSAxRCBhcnJheVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBuZXdSb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbmV3Q29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHBhcmFtIHtBcnJheX0gbmV3RGF0YSAtIEEgMUQgYXJyYXkgY29udGFpbmluZyBkYXRhIGZvciB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBmcm9tMURBcnJheShuZXdSb3dzLCBuZXdDb2x1bW5zLCBuZXdEYXRhKSB7XG4gICAgICAgIHZhciBsZW5ndGggPSBuZXdSb3dzICogbmV3Q29sdW1ucztcbiAgICAgICAgaWYgKGxlbmd0aCAhPT0gbmV3RGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdEYXRhIGxlbmd0aCBkb2VzIG5vdCBtYXRjaCBnaXZlbiBkaW1lbnNpb25zJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgobmV3Um93cywgbmV3Q29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IG5ld1Jvd3M7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gPSAwOyBjb2x1bW4gPCBuZXdDb2x1bW5zOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtyb3ddW2NvbHVtbl0gPSBuZXdEYXRhW3JvdyAqIG5ld0NvbHVtbnMgKyBjb2x1bW5dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIHJvdyB2ZWN0b3IsIGEgbWF0cml4IHdpdGggb25seSBvbmUgcm93LlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IG5ld0RhdGEgLSBBIDFEIGFycmF5IGNvbnRhaW5pbmcgZGF0YSBmb3IgdGhlIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgcm93VmVjdG9yKG5ld0RhdGEpIHtcbiAgICAgICAgdmFyIHZlY3RvciA9IG5ldyBNYXRyaXgoMSwgbmV3RGF0YS5sZW5ndGgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5ld0RhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZlY3RvclswXVtpXSA9IG5ld0RhdGFbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZlY3RvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgY29sdW1uIHZlY3RvciwgYSBtYXRyaXggd2l0aCBvbmx5IG9uZSBjb2x1bW4uXG4gICAgICogQHBhcmFtIHtBcnJheX0gbmV3RGF0YSAtIEEgMUQgYXJyYXkgY29udGFpbmluZyBkYXRhIGZvciB0aGUgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBjb2x1bW5WZWN0b3IobmV3RGF0YSkge1xuICAgICAgICB2YXIgdmVjdG9yID0gbmV3IE1hdHJpeChuZXdEYXRhLmxlbmd0aCwgMSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3RGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmVjdG9yW2ldWzBdID0gbmV3RGF0YVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmVjdG9yO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYW4gZW1wdHkgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHVuZGVmaW5lZC4gU2FtZSBhcyB1c2luZyBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBlbXB0eShyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIHJldHVybiBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZGltZW5zaW9ucy4gVmFsdWVzIHdpbGwgYmUgc2V0IHRvIHplcm8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIHplcm9zKHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5lbXB0eShyb3dzLCBjb2x1bW5zKS5maWxsKDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZGltZW5zaW9ucy4gVmFsdWVzIHdpbGwgYmUgc2V0IHRvIG9uZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgb25lcyhyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguZW1wdHkocm93cywgY29sdW1ucykuZmlsbCgxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHJhbmRvbWx5IHNldC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IFtybmddIC0gUmFuZG9tIG51bWJlciBnZW5lcmF0b3IgKGRlZmF1bHQ6IE1hdGgucmFuZG9tKVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIHJhbmQocm93cywgY29sdW1ucywgcm5nKSB7XG4gICAgICAgIGlmIChybmcgPT09IHVuZGVmaW5lZCkgcm5nID0gTWF0aC5yYW5kb207XG4gICAgICAgIHZhciBtYXRyaXggPSBNYXRyaXguZW1wdHkocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIG1hdHJpeFtpXVtqXSA9IHJuZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBpZGVudGl0eSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZGltZW5zaW9uLiBWYWx1ZXMgb2YgdGhlIGRpYWdvbmFsIHdpbGwgYmUgMSBhbmQgb3RoZXJzIHdpbGwgYmUgMC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtjb2x1bW5zXSAtIE51bWJlciBvZiBjb2x1bW5zIChEZWZhdWx0OiByb3dzKVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBpZGVudGl0eSBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZXllKHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMgPT09IHVuZGVmaW5lZCkgY29sdW1ucyA9IHJvd3M7XG4gICAgICAgIHZhciBtaW4gPSBNYXRoLm1pbihyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgdmFyIG1hdHJpeCA9IE1hdHJpeC56ZXJvcyhyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgbWF0cml4W2ldW2ldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBkaWFnb25hbCBtYXRyaXggYmFzZWQgb24gdGhlIGdpdmVuIGFycmF5LlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRhdGEgLSBBcnJheSBjb250YWluaW5nIHRoZSBkYXRhIGZvciB0aGUgZGlhZ29uYWxcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3Jvd3NdIC0gTnVtYmVyIG9mIHJvd3MgKERlZmF1bHQ6IGRhdGEubGVuZ3RoKVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbY29sdW1uc10gLSBOdW1iZXIgb2YgY29sdW1ucyAoRGVmYXVsdDogcm93cylcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgZGlhZ29uYWwgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGRpYWcoZGF0YSwgcm93cywgY29sdW1ucykge1xuICAgICAgICB2YXIgbCA9IGRhdGEubGVuZ3RoO1xuICAgICAgICBpZiAocm93cyA9PT0gdW5kZWZpbmVkKSByb3dzID0gbDtcbiAgICAgICAgaWYgKGNvbHVtbnMgPT09IHVuZGVmaW5lZCkgY29sdW1ucyA9IHJvd3M7XG4gICAgICAgIHZhciBtaW4gPSBNYXRoLm1pbihsLCByb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgdmFyIG1hdHJpeCA9IE1hdHJpeC56ZXJvcyhyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgbWF0cml4W2ldW2ldID0gZGF0YVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBtYXRyaXggd2hvc2UgZWxlbWVudHMgYXJlIHRoZSBtaW5pbXVtIGJldHdlZW4gbWF0cml4MSBhbmQgbWF0cml4MlxuICAgICAqIEBwYXJhbSBtYXRyaXgxXG4gICAgICogQHBhcmFtIG1hdHJpeDJcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN0YXRpYyBtaW4obWF0cml4MSwgbWF0cml4Mikge1xuICAgICAgICB2YXIgcm93cyA9IG1hdHJpeDEubGVuZ3RoO1xuICAgICAgICB2YXIgY29sdW1ucyA9IG1hdHJpeDFbMF0ubGVuZ3RoO1xuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvcih2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICByZXN1bHRbaV1bal0gPSBNYXRoLm1pbihtYXRyaXgxW2ldW2pdLCBtYXRyaXgyW2ldW2pdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBtYXRyaXggd2hvc2UgZWxlbWVudHMgYXJlIHRoZSBtYXhpbXVtIGJldHdlZW4gbWF0cml4MSBhbmQgbWF0cml4MlxuICAgICAqIEBwYXJhbSBtYXRyaXgxXG4gICAgICogQHBhcmFtIG1hdHJpeDJcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN0YXRpYyBtYXgobWF0cml4MSwgbWF0cml4Mikge1xuICAgICAgICB2YXIgcm93cyA9IG1hdHJpeDEubGVuZ3RoO1xuICAgICAgICB2YXIgY29sdW1ucyA9IG1hdHJpeDFbMF0ubGVuZ3RoO1xuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvcih2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICByZXN1bHRbaV1bal0gPSBNYXRoLm1heChtYXRyaXgxW2ldW2pdLCBtYXRyaXgyW2ldW2pdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrIHRoYXQgdGhlIHByb3ZpZGVkIHZhbHVlIGlzIGEgTWF0cml4IGFuZCB0cmllcyB0byBpbnN0YW50aWF0ZSBvbmUgaWYgbm90XG4gICAgICogQHBhcmFtIHZhbHVlIC0gVGhlIHZhbHVlIHRvIGNoZWNrXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdGF0aWMgY2hlY2tNYXRyaXgodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5pc01hdHJpeCh2YWx1ZSkgPyB2YWx1ZSA6IG5ldyBNYXRyaXgodmFsdWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYXJndW1lbnQgaXMgYSBNYXRyaXgsIGZhbHNlIG90aGVyd2lzZVxuICAgICAqIEBwYXJhbSB2YWx1ZSAtIFRoZSB2YWx1ZSB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgc3RhdGljIGlzTWF0cml4KHZhbHVlKSB7XG4gICAgICAgIHJldHVybiAodmFsdWUgIT0gbnVsbCkgJiYgKHZhbHVlLmtsYXNzID09PSAnTWF0cml4Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHtudW1iZXJ9IC0gVGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiB0aGUgbWF0cml4LlxuICAgICAqL1xuICAgIGdldCBzaXplKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yb3dzICogdGhpcy5jb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFwcGxpZXMgYSBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50IG9mIHRoZSBtYXRyaXguIFRoZSBmdW5jdGlvbiBpcyBjYWxsZWQgaW4gdGhlIG1hdHJpeCAodGhpcykgY29udGV4dC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIEZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2l0aCB0d28gcGFyYW1ldGVycyA6IGkgKHJvdykgYW5kIGogKGNvbHVtbilcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYXBwbHkoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGlpID0gdGhpcy5yb3dzO1xuICAgICAgICB2YXIgamogPSB0aGlzLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCBpLCBqKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGV4YWN0IGFuZCBpbmRlcGVuZGVudCBjb3B5IG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIGNsb25lKCkge1xuICAgICAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeCh0aGlzLnJvd3MsIHRoaXMuY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IHRoaXMucm93czsgcm93KyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGNvbHVtbiA9IDA7IGNvbHVtbiA8IHRoaXMuY29sdW1uczsgY29sdW1uKyspIHtcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbcm93XVtjb2x1bW5dID0gdGhpc1tyb3ddW2NvbHVtbl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld01hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IDFEIGFycmF5IGZpbGxlZCByb3cgYnkgcm93IHdpdGggdGhlIG1hdHJpeCB2YWx1ZXNcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgdG8xREFycmF5KCkge1xuICAgICAgICB2YXIgYXJyYXkgPSBuZXcgQXJyYXkodGhpcy5zaXplKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGFycmF5W2kgKiB0aGlzLmNvbHVtbnMgKyBqXSA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFycmF5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSAyRCBhcnJheSBjb250YWluaW5nIGEgY29weSBvZiB0aGUgZGF0YVxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICB0bzJEQXJyYXkoKSB7XG4gICAgICAgIHZhciBjb3B5ID0gbmV3IEFycmF5KHRoaXMucm93cyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGNvcHlbaV0gPSBbXS5jb25jYXQodGhpc1tpXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBoYXMgb25lIHJvd1xuICAgICAqL1xuICAgIGlzUm93VmVjdG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yb3dzID09PSAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaGFzIG9uZSBjb2x1bW5cbiAgICAgKi9cbiAgICBpc0NvbHVtblZlY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sdW1ucyA9PT0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyBvbmUgcm93IG9yIG9uZSBjb2x1bW5cbiAgICAgKi9cbiAgICBpc1ZlY3RvcigpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLnJvd3MgPT09IDEpIHx8ICh0aGlzLmNvbHVtbnMgPT09IDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaGFzIHRoZSBzYW1lIG51bWJlciBvZiByb3dzIGFuZCBjb2x1bW5zXG4gICAgICovXG4gICAgaXNTcXVhcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJvd3MgPT09IHRoaXMuY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGlzIHNxdWFyZSBhbmQgaGFzIHRoZSBzYW1lIHZhbHVlcyBvbiBib3RoIHNpZGVzIG9mIHRoZSBkaWFnb25hbFxuICAgICAqL1xuICAgIGlzU3ltbWV0cmljKCkge1xuICAgICAgICBpZiAodGhpcy5pc1NxdWFyZSgpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPD0gaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdICE9PSB0aGlzW2pdW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIGdpdmVuIGVsZW1lbnQgb2YgdGhlIG1hdHJpeC4gbWF0LnNldCgzLDQsMSkgaXMgZXF1aXZhbGVudCB0byBtYXRbM11bNF09MVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dJbmRleCAtIEluZGV4IG9mIHRoZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uSW5kZXggLSBJbmRleCBvZiB0aGUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIC0gVGhlIG5ldyB2YWx1ZSBmb3IgdGhlIGVsZW1lbnRcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc2V0KHJvd0luZGV4LCBjb2x1bW5JbmRleCwgdmFsdWUpIHtcbiAgICAgICAgdGhpc1tyb3dJbmRleF1bY29sdW1uSW5kZXhdID0gdmFsdWU7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGdpdmVuIGVsZW1lbnQgb2YgdGhlIG1hdHJpeC4gbWF0LmdldCgzLDQpIGlzIGVxdWl2YWxlbnQgdG8gbWF0cml4WzNdWzRdXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd0luZGV4IC0gSW5kZXggb2YgdGhlIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5JbmRleCAtIEluZGV4IG9mIHRoZSBjb2x1bW5cbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIGdldChyb3dJbmRleCwgY29sdW1uSW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbcm93SW5kZXhdW2NvbHVtbkluZGV4XTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaWxscyB0aGUgbWF0cml4IHdpdGggYSBnaXZlbiB2YWx1ZS4gQWxsIGVsZW1lbnRzIHdpbGwgYmUgc2V0IHRvIHRoaXMgdmFsdWUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIC0gTmV3IHZhbHVlXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGZpbGwodmFsdWUpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBOZWdhdGVzIHRoZSBtYXRyaXguIEFsbCBlbGVtZW50cyB3aWxsIGJlIG11bHRpcGxpZWQgYnkgKC0xKVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBuZWcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm11bFMoLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgYXJyYXkgZnJvbSB0aGUgZ2l2ZW4gcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIGdldFJvdyhpbmRleCkge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgcmV0dXJuIFtdLmNvbmNhdCh0aGlzW2luZGV4XSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyByb3cgdmVjdG9yIGZyb20gdGhlIGdpdmVuIHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgZ2V0Um93VmVjdG9yKGluZGV4KSB7XG4gICAgICAgIHJldHVybiBNYXRyaXgucm93VmVjdG9yKHRoaXMuZ2V0Um93KGluZGV4KSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIHJvdyBhdCB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gYXJyYXkgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc2V0Um93KGluZGV4LCBhcnJheSkge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgYXJyYXkgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCBhcnJheSwgdHJ1ZSk7XG4gICAgICAgIHRoaXNbaW5kZXhdID0gYXJyYXk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSByb3cgZnJvbSB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgcmVtb3ZlUm93KGluZGV4KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBpZiAodGhpcy5yb3dzID09PSAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0EgbWF0cml4IGNhbm5vdCBoYXZlIGxlc3MgdGhhbiBvbmUgcm93Jyk7XG4gICAgICAgIHRoaXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgdGhpcy5yb3dzIC09IDE7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByb3cgYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpbmRleCA9IHRoaXMucm93c10gLSBSb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gYXJyYXkgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYWRkUm93KGluZGV4LCBhcnJheSkge1xuICAgICAgICBpZiAoYXJyYXkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYXJyYXkgPSBpbmRleDtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5yb3dzO1xuICAgICAgICB9XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgsIHRydWUpO1xuICAgICAgICBhcnJheSA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIGFycmF5LCB0cnVlKTtcbiAgICAgICAgdGhpcy5zcGxpY2UoaW5kZXgsIDAsIGFycmF5KTtcbiAgICAgICAgdGhpcy5yb3dzICs9IDE7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN3YXBzIHR3byByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdzEgLSBGaXJzdCByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93MiAtIFNlY29uZCByb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc3dhcFJvd3Mocm93MSwgcm93Mikge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdzEpO1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdzIpO1xuICAgICAgICB2YXIgdGVtcCA9IHRoaXNbcm93MV07XG4gICAgICAgIHRoaXNbcm93MV0gPSB0aGlzW3JvdzJdO1xuICAgICAgICB0aGlzW3JvdzJdID0gdGVtcDtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyBhcnJheSBmcm9tIHRoZSBnaXZlbiBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgZ2V0Q29sdW1uKGluZGV4KSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICB2YXIgY29sdW1uID0gbmV3IEFycmF5KHRoaXMucm93cyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGNvbHVtbltpXSA9IHRoaXNbaV1baW5kZXhdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb2x1bW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyBjb2x1bW4gdmVjdG9yIGZyb20gdGhlIGdpdmVuIGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgZ2V0Q29sdW1uVmVjdG9yKGluZGV4KSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguY29sdW1uVmVjdG9yKHRoaXMuZ2V0Q29sdW1uKGluZGV4KSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIGNvbHVtbiBhdCB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gYXJyYXkgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc2V0Q29sdW1uKGluZGV4LCBhcnJheSkge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgYXJyYXkgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCBhcnJheSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1baW5kZXhdID0gYXJyYXlbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIGNvbHVtbiBmcm9tIHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICByZW1vdmVDb2x1bW4oaW5kZXgpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGlmICh0aGlzLmNvbHVtbnMgPT09IDEpXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQSBtYXRyaXggY2Fubm90IGhhdmUgbGVzcyB0aGFuIG9uZSBjb2x1bW4nKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXS5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29sdW1ucyAtPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgY29sdW1uIGF0IHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbaW5kZXggPSB0aGlzLmNvbHVtbnNdIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFkZENvbHVtbihpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcnJheSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGFycmF5ID0gaW5kZXg7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMuY29sdW1ucztcbiAgICAgICAgfVxuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4LCB0cnVlKTtcbiAgICAgICAgYXJyYXkgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCBhcnJheSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV0uc3BsaWNlKGluZGV4LCAwLCBhcnJheVtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb2x1bW5zICs9IDE7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN3YXBzIHR3byBjb2x1bW5zXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbjEgLSBGaXJzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uMiAtIFNlY29uZCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc3dhcENvbHVtbnMoY29sdW1uMSwgY29sdW1uMikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbjEpO1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbjIpO1xuICAgICAgICB2YXIgdGVtcCwgcm93O1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICByb3cgPSB0aGlzW2ldO1xuICAgICAgICAgICAgdGVtcCA9IHJvd1tjb2x1bW4xXTtcbiAgICAgICAgICAgIHJvd1tjb2x1bW4xXSA9IHJvd1tjb2x1bW4yXTtcbiAgICAgICAgICAgIHJvd1tjb2x1bW4yXSA9IHRlbXA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHRvIGVhY2ggcm93XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRSb3dWZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdICs9IHZlY3RvcltqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciBmcm9tIGVhY2ggcm93XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzdWJSb3dWZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC09IHZlY3RvcltqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3Igd2l0aCBlYWNoIHJvd1xuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbXVsUm93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAqPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGl2aWRlcyB0aGUgdmFsdWVzIG9mIGVhY2ggcm93IGJ5IHRob3NlIG9mIGEgdmVjdG9yXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBkaXZSb3dWZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC89IHZlY3RvcltqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3IgdG8gZWFjaCBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFkZENvbHVtblZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gKz0gdmVjdG9yW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0cyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIGZyb20gZWFjaCBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN1YkNvbHVtblZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gLT0gdmVjdG9yW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciB3aXRoIGVhY2ggY29sdW1uXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdICo9IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIHRoZSB2YWx1ZXMgb2YgZWFjaCBjb2x1bW4gYnkgdGhvc2Ugb2YgYSB2ZWN0b3JcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGRpdkNvbHVtblZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gLz0gdmVjdG9yW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXMgdGhlIHZhbHVlcyBvZiBhIHJvdyB3aXRoIGEgc2NhbGFyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG11bFJvdyhpbmRleCwgdmFsdWUpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaW5kZXhdW2ldICo9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXMgdGhlIHZhbHVlcyBvZiBhIGNvbHVtbiB3aXRoIGEgc2NhbGFyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG11bENvbHVtbihpbmRleCwgdmFsdWUpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1baW5kZXhdICo9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtYXgoKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdID4gdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1heGltdW0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWF4SW5kZXgoKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCAwXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdID4gdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzFdID0gajtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtaW5pbXVtIHZhbHVlIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1pbigpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdWzBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXNbaV1bal0gPCB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWluaW11bSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtaW5JbmRleCgpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdWzBdO1xuICAgICAgICB2YXIgaWR4ID0gWzAsIDBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXNbaV1bal0gPCB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZHhbMF0gPSBpO1xuICAgICAgICAgICAgICAgICAgICBpZHhbMV0gPSBqO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1heFJvdyhyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbcm93XVtpXSA+IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tyb3ddW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1heFJvd0luZGV4KHJvdykge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdyk7XG4gICAgICAgIHZhciB2ID0gdGhpc1tyb3ddWzBdO1xuICAgICAgICB2YXIgaWR4ID0gW3JvdywgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPiB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgICAgICBpZHhbMV0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWluaW11bSB2YWx1ZSBvZiBvbmUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWluUm93KHJvdykge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdyk7XG4gICAgICAgIHZhciB2ID0gdGhpc1tyb3ddWzBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tyb3ddW2ldIDwgdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW3Jvd11baV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWluUm93SW5kZXgocm93KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93KTtcbiAgICAgICAgdmFyIHYgPSB0aGlzW3Jvd11bMF07XG4gICAgICAgIHZhciBpZHggPSBbcm93LCAwXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbcm93XVtpXSA8IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tyb3ddW2ldO1xuICAgICAgICAgICAgICAgIGlkeFsxXSA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtYXhDb2x1bW4oY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW2ldW2NvbHVtbl0gPiB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtYXhDb2x1bW5JbmRleChjb2x1bW4pIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4pO1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bY29sdW1uXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCBjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1pbmltdW0gdmFsdWUgb2Ygb25lIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1pbkNvbHVtbihjb2x1bW4pIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4pO1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bY29sdW1uXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV1bY29sdW1uXSA8IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtjb2x1bW5dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtaW5pbXVtIHZhbHVlIG9mIG9uZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1pbkNvbHVtbkluZGV4KGNvbHVtbikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbik7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVtjb2x1bW5dO1xuICAgICAgICB2YXIgaWR4ID0gWzAsIGNvbHVtbl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW2ldW2NvbHVtbl0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bY29sdW1uXTtcbiAgICAgICAgICAgICAgICBpZHhbMF0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBkaWFnb25hbCB2YWx1ZXMgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBkaWFnKCkge1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4odGhpcy5yb3dzLCB0aGlzLmNvbHVtbnMpO1xuICAgICAgICB2YXIgZGlhZyA9IG5ldyBBcnJheShtaW4pO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pbjsgaSsrKSB7XG4gICAgICAgICAgICBkaWFnW2ldID0gdGhpc1tpXVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGlhZztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdW0gb2YgYWxsIGVsZW1lbnRzIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIHN1bSgpIHtcbiAgICAgICAgdmFyIHYgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdiArPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1lYW4gb2YgYWxsIGVsZW1lbnRzIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1lYW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN1bSgpIC8gdGhpcy5zaXplO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHByb2R1Y3Qgb2YgYWxsIGVsZW1lbnRzIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIHByb2QoKSB7XG4gICAgICAgIHZhciBwcm9kID0gMTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHByb2QgKj0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJvZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21wdXRlcyB0aGUgY3VtdWxhdGl2ZSBzdW0gb2YgdGhlIG1hdHJpeCBlbGVtZW50cyAoaW4gcGxhY2UsIHJvdyBieSByb3cpXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGN1bXVsYXRpdmVTdW0oKSB7XG4gICAgICAgIHZhciBzdW0gPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgc3VtICs9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSA9IHN1bTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb21wdXRlcyB0aGUgZG90IChzY2FsYXIpIHByb2R1Y3QgYmV0d2VlbiB0aGUgbWF0cml4IGFuZCBhbm90aGVyXG4gICAgICogQHBhcmFtIHtNYXRyaXh9IHZlY3RvcjIgdmVjdG9yXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBkb3QodmVjdG9yMikge1xuICAgICAgICBpZiAoTWF0cml4LmlzTWF0cml4KHZlY3RvcjIpKSB2ZWN0b3IyID0gdmVjdG9yMi50bzFEQXJyYXkoKTtcbiAgICAgICAgdmFyIHZlY3RvcjEgPSB0aGlzLnRvMURBcnJheSgpO1xuICAgICAgICBpZiAodmVjdG9yMS5sZW5ndGggIT09IHZlY3RvcjIubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmVjdG9ycyBkbyBub3QgaGF2ZSB0aGUgc2FtZSBzaXplJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRvdCA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmVjdG9yMS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZG90ICs9IHZlY3RvcjFbaV0gKiB2ZWN0b3IyW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkb3Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWF0cml4IHByb2R1Y3QgYmV0d2VlbiB0aGlzIGFuZCBvdGhlclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgbW11bChvdGhlcikge1xuICAgICAgICBvdGhlciA9IE1hdHJpeC5jaGVja01hdHJpeChvdGhlcik7XG4gICAgICAgIGlmICh0aGlzLmNvbHVtbnMgIT09IG90aGVyLnJvd3MpXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ051bWJlciBvZiBjb2x1bW5zIG9mIGxlZnQgbWF0cml4IGFyZSBub3QgZXF1YWwgdG8gbnVtYmVyIG9mIHJvd3Mgb2YgcmlnaHQgbWF0cml4LicpO1xuXG4gICAgICAgIHZhciBtID0gdGhpcy5yb3dzO1xuICAgICAgICB2YXIgbiA9IHRoaXMuY29sdW1ucztcbiAgICAgICAgdmFyIHAgPSBvdGhlci5jb2x1bW5zO1xuXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KG0sIHApO1xuXG4gICAgICAgIHZhciBCY29saiA9IG5ldyBBcnJheShuKTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBwOyBqKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbjsgaysrKVxuICAgICAgICAgICAgICAgIEJjb2xqW2tdID0gb3RoZXJba11bal07XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIEFyb3dpID0gdGhpc1tpXTtcblxuICAgICAgICAgICAgICAgIHZhciBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgbjsgaysrKVxuICAgICAgICAgICAgICAgICAgICBzICs9IEFyb3dpW2tdICogQmNvbGpba107XG5cbiAgICAgICAgICAgICAgICByZXN1bHRbaV1bal0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJhbnNwb3NlcyB0aGUgbWF0cml4IGFuZCByZXR1cm5zIGEgbmV3IG9uZSBjb250YWluaW5nIHRoZSByZXN1bHRcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHRyYW5zcG9zZSgpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgodGhpcy5jb2x1bW5zLCB0aGlzLnJvd3MpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2pdW2ldID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNvcnRzIHRoZSByb3dzIChpbiBwbGFjZSlcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjb21wYXJlRnVuY3Rpb24gLSB1c3VhbCBBcnJheS5wcm90b3R5cGUuc29ydCBjb21wYXJpc29uIGZ1bmN0aW9uXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNvcnRSb3dzKGNvbXBhcmVGdW5jdGlvbikge1xuICAgICAgICBpZiAoY29tcGFyZUZ1bmN0aW9uID09PSB1bmRlZmluZWQpIGNvbXBhcmVGdW5jdGlvbiA9IGNvbXBhcmVOdW1iZXJzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldLnNvcnQoY29tcGFyZUZ1bmN0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTb3J0cyB0aGUgY29sdW1ucyAoaW4gcGxhY2UpXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY29tcGFyZUZ1bmN0aW9uIC0gdXN1YWwgQXJyYXkucHJvdG90eXBlLnNvcnQgY29tcGFyaXNvbiBmdW5jdGlvblxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzb3J0Q29sdW1ucyhjb21wYXJlRnVuY3Rpb24pIHtcbiAgICAgICAgaWYgKGNvbXBhcmVGdW5jdGlvbiA9PT0gdW5kZWZpbmVkKSBjb21wYXJlRnVuY3Rpb24gPSBjb21wYXJlTnVtYmVycztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5zZXRDb2x1bW4oaSwgdGhpcy5nZXRDb2x1bW4oaSkuc29ydChjb21wYXJlRnVuY3Rpb24pKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgc3Vic2V0IG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc3RhcnRSb3cgLSBGaXJzdCByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZW5kUm93IC0gTGFzdCByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc3RhcnRDb2x1bW4gLSBGaXJzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZW5kQ29sdW1uIC0gTGFzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN1Yk1hdHJpeChzdGFydFJvdywgZW5kUm93LCBzdGFydENvbHVtbiwgZW5kQ29sdW1uKSB7XG4gICAgICAgIGlmICgoc3RhcnRSb3cgPiBlbmRSb3cpIHx8IChzdGFydENvbHVtbiA+IGVuZENvbHVtbikgfHwgKHN0YXJ0Um93IDwgMCkgfHwgKHN0YXJ0Um93ID49IHRoaXMucm93cykgfHwgKGVuZFJvdyA8IDApIHx8IChlbmRSb3cgPj0gdGhpcy5yb3dzKSB8fCAoc3RhcnRDb2x1bW4gPCAwKSB8fCAoc3RhcnRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSB8fCAoZW5kQ29sdW1uIDwgMCkgfHwgKGVuZENvbHVtbiA+PSB0aGlzLmNvbHVtbnMpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQXJndW1lbnQgb3V0IG9mIHJhbmdlJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgoZW5kUm93IC0gc3RhcnRSb3cgKyAxLCBlbmRDb2x1bW4gLSBzdGFydENvbHVtbiArIDEpO1xuICAgICAgICBmb3IgKHZhciBpID0gc3RhcnRSb3c7IGkgPD0gZW5kUm93OyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydENvbHVtbjsgaiA8PSBlbmRDb2x1bW47IGorKykge1xuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtpIC0gc3RhcnRSb3ddW2ogLSBzdGFydENvbHVtbl0gPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHN1YnNldCBvZiB0aGUgbWF0cml4IGJhc2VkIG9uIGFuIGFycmF5IG9mIHJvdyBpbmRpY2VzXG4gICAgICogQHBhcmFtIHtBcnJheX0gaW5kaWNlcyAtIEFycmF5IGNvbnRhaW5pbmcgdGhlIHJvdyBpbmRpY2VzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtzdGFydENvbHVtbiA9IDBdIC0gRmlyc3QgY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtlbmRDb2x1bW4gPSB0aGlzLmNvbHVtbnMtMV0gLSBMYXN0IGNvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3ViTWF0cml4Um93KGluZGljZXMsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0Q29sdW1uID09PSB1bmRlZmluZWQpIHN0YXJ0Q29sdW1uID0gMDtcbiAgICAgICAgaWYgKGVuZENvbHVtbiA9PT0gdW5kZWZpbmVkKSBlbmRDb2x1bW4gPSB0aGlzLmNvbHVtbnMgLSAxO1xuICAgICAgICBpZiAoKHN0YXJ0Q29sdW1uID4gZW5kQ29sdW1uKSB8fCAoc3RhcnRDb2x1bW4gPCAwKSB8fCAoc3RhcnRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSB8fCAoZW5kQ29sdW1uIDwgMCkgfHwgKGVuZENvbHVtbiA+PSB0aGlzLmNvbHVtbnMpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQXJndW1lbnQgb3V0IG9mIHJhbmdlJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChpbmRpY2VzLmxlbmd0aCwgZW5kQ29sdW1uIC0gc3RhcnRDb2x1bW4gKyAxKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbmRpY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnRDb2x1bW47IGogPD0gZW5kQ29sdW1uOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kaWNlc1tpXSA8IDAgfHwgaW5kaWNlc1tpXSA+PSB0aGlzLnJvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1JvdyBpbmRleCBvdXQgb2YgcmFuZ2U6ICcgKyBpbmRpY2VzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W2ldW2ogLSBzdGFydENvbHVtbl0gPSB0aGlzW2luZGljZXNbaV1dW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHN1YnNldCBvZiB0aGUgbWF0cml4IGJhc2VkIG9uIGFuIGFycmF5IG9mIGNvbHVtbiBpbmRpY2VzXG4gICAgICogQHBhcmFtIHtBcnJheX0gaW5kaWNlcyAtIEFycmF5IGNvbnRhaW5pbmcgdGhlIGNvbHVtbiBpbmRpY2VzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtzdGFydFJvdyA9IDBdIC0gRmlyc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtlbmRSb3cgPSB0aGlzLnJvd3MtMV0gLSBMYXN0IHJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3ViTWF0cml4Q29sdW1uKGluZGljZXMsIHN0YXJ0Um93LCBlbmRSb3cpIHtcbiAgICAgICAgaWYgKHN0YXJ0Um93ID09PSB1bmRlZmluZWQpIHN0YXJ0Um93ID0gMDtcbiAgICAgICAgaWYgKGVuZFJvdyA9PT0gdW5kZWZpbmVkKSBlbmRSb3cgPSB0aGlzLnJvd3MgLSAxO1xuICAgICAgICBpZiAoKHN0YXJ0Um93ID4gZW5kUm93KSB8fCAoc3RhcnRSb3cgPCAwKSB8fCAoc3RhcnRSb3cgPj0gdGhpcy5yb3dzKSB8fCAoZW5kUm93IDwgMCkgfHwgKGVuZFJvdyA+PSB0aGlzLnJvd3MpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQXJndW1lbnQgb3V0IG9mIHJhbmdlJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChlbmRSb3cgLSBzdGFydFJvdyArIDEsIGluZGljZXMubGVuZ3RoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbmRpY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnRSb3c7IGogPD0gZW5kUm93OyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kaWNlc1tpXSA8IDAgfHwgaW5kaWNlc1tpXSA+PSB0aGlzLmNvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0NvbHVtbiBpbmRleCBvdXQgb2YgcmFuZ2U6ICcgKyBpbmRpY2VzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W2ogLSBzdGFydFJvd11baV0gPSB0aGlzW2pdW2luZGljZXNbaV1dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgdHJhY2Ugb2YgdGhlIG1hdHJpeCAoc3VtIG9mIHRoZSBkaWFnb25hbCBlbGVtZW50cylcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIHRyYWNlKCkge1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4odGhpcy5yb3dzLCB0aGlzLmNvbHVtbnMpO1xuICAgICAgICB2YXIgdHJhY2UgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pbjsgaSsrKSB7XG4gICAgICAgICAgICB0cmFjZSArPSB0aGlzW2ldW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cmFjZTtcbiAgICB9XG59XG5cbk1hdHJpeC5wcm90b3R5cGUua2xhc3MgPSAnTWF0cml4JztcblxubW9kdWxlLmV4cG9ydHMgPSBNYXRyaXg7XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgYSByb3cgaW5kZXggaXMgbm90IG91dCBvZiBib3VuZHNcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleFxuICogQHBhcmFtIHtib29sZWFufSBbb3V0ZXJdXG4gKi9cbmZ1bmN0aW9uIGNoZWNrUm93SW5kZXgobWF0cml4LCBpbmRleCwgb3V0ZXIpIHtcbiAgICB2YXIgbWF4ID0gb3V0ZXIgPyBtYXRyaXgucm93cyA6IG1hdHJpeC5yb3dzIC0gMTtcbiAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID4gbWF4KVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignUm93IGluZGV4IG91dCBvZiByYW5nZScpO1xufVxuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IHRoZSBwcm92aWRlZCB2ZWN0b3IgaXMgYW4gYXJyYXkgd2l0aCB0aGUgcmlnaHQgbGVuZ3RoXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNvcHlcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqIEB0aHJvd3Mge1JhbmdlRXJyb3J9XG4gKi9cbmZ1bmN0aW9uIGNoZWNrUm93VmVjdG9yKG1hdHJpeCwgdmVjdG9yLCBjb3B5KSB7XG4gICAgaWYgKE1hdHJpeC5pc01hdHJpeCh2ZWN0b3IpKSB7XG4gICAgICAgIHZlY3RvciA9IHZlY3Rvci50bzFEQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGNvcHkpIHtcbiAgICAgICAgdmVjdG9yID0gW10uY29uY2F0KHZlY3Rvcik7XG4gICAgfVxuICAgIGlmICh2ZWN0b3IubGVuZ3RoICE9PSBtYXRyaXguY29sdW1ucylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZlY3RvciBzaXplIG11c3QgYmUgdGhlIHNhbWUgYXMgdGhlIG51bWJlciBvZiBjb2x1bW5zJyk7XG4gICAgcmV0dXJuIHZlY3Rvcjtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCB0aGUgcHJvdmlkZWQgdmVjdG9yIGlzIGFuIGFycmF5IHdpdGggdGhlIHJpZ2h0IGxlbmd0aFxuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvclxuICogQHBhcmFtIHtib29sZWFufSBjb3B5XG4gKiBAcmV0dXJucyB7QXJyYXl9XG4gKiBAdGhyb3dzIHtSYW5nZUVycm9yfVxuICovXG5mdW5jdGlvbiBjaGVja0NvbHVtblZlY3RvcihtYXRyaXgsIHZlY3RvciwgY29weSkge1xuICAgIGlmIChNYXRyaXguaXNNYXRyaXgodmVjdG9yKSkge1xuICAgICAgICB2ZWN0b3IgPSB2ZWN0b3IudG8xREFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChjb3B5KSB7XG4gICAgICAgIHZlY3RvciA9IFtdLmNvbmNhdCh2ZWN0b3IpO1xuICAgIH1cbiAgICBpZiAodmVjdG9yLmxlbmd0aCAhPT0gbWF0cml4LnJvd3MpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd2ZWN0b3Igc2l6ZSBtdXN0IGJlIHRoZSBzYW1lIGFzIHRoZSBudW1iZXIgb2Ygcm93cycpO1xuICAgIHJldHVybiB2ZWN0b3I7XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgYSBjb2x1bW4gaW5kZXggaXMgbm90IG91dCBvZiBib3VuZHNcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleFxuICogQHBhcmFtIHtib29sZWFufSBbb3V0ZXJdXG4gKi9cbmZ1bmN0aW9uIGNoZWNrQ29sdW1uSW5kZXgobWF0cml4LCBpbmRleCwgb3V0ZXIpIHtcbiAgICB2YXIgbWF4ID0gb3V0ZXIgPyBtYXRyaXguY29sdW1ucyA6IG1hdHJpeC5jb2x1bW5zIC0gMTtcbiAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID4gbWF4KVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQ29sdW1uIGluZGV4IG91dCBvZiByYW5nZScpO1xufVxuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IHR3byBtYXRyaWNlcyBoYXZlIHRoZSBzYW1lIGRpbWVuc2lvbnNcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7TWF0cml4fSBvdGhlck1hdHJpeFxuICovXG5mdW5jdGlvbiBjaGVja0RpbWVuc2lvbnMobWF0cml4LCBvdGhlck1hdHJpeCkge1xuICAgIGlmIChtYXRyaXgucm93cyAhPT0gb3RoZXJNYXRyaXgubGVuZ3RoIHx8XG4gICAgICAgIG1hdHJpeC5jb2x1bW5zICE9PSBvdGhlck1hdHJpeFswXS5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ01hdHJpY2VzIGRpbWVuc2lvbnMgbXVzdCBiZSBlcXVhbCcpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY29tcGFyZU51bWJlcnMoYSwgYikge1xuICAgIHJldHVybiBhIC0gYjtcbn1cblxuLypcblN5bm9ueW1zXG4gKi9cblxuTWF0cml4LnJhbmRvbSA9IE1hdHJpeC5yYW5kO1xuTWF0cml4LmRpYWdvbmFsID0gTWF0cml4LmRpYWc7XG5NYXRyaXgucHJvdG90eXBlLmRpYWdvbmFsID0gTWF0cml4LnByb3RvdHlwZS5kaWFnO1xuTWF0cml4LmlkZW50aXR5ID0gTWF0cml4LmV5ZTtcbk1hdHJpeC5wcm90b3R5cGUubmVnYXRlID0gTWF0cml4LnByb3RvdHlwZS5uZWc7XG5cbi8qXG5BZGQgZHluYW1pY2FsbHkgaW5zdGFuY2UgYW5kIHN0YXRpYyBtZXRob2RzIGZvciBtYXRoZW1hdGljYWwgb3BlcmF0aW9uc1xuICovXG5cbnZhciBpbnBsYWNlT3BlcmF0b3IgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB0aGlzLiVuYW1lJVModmFsdWUpO1xuICAgIHJldHVybiB0aGlzLiVuYW1lJU0odmFsdWUpO1xufSlcbmA7XG5cbnZhciBpbnBsYWNlT3BlcmF0b3JTY2FsYXIgPSBgXG4oZnVuY3Rpb24gJW5hbWUlUyh2YWx1ZSkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgdGhpc1tpXVtqXSA9IHRoaXNbaV1bal0gJW9wJSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbn0pXG5gO1xuXG52YXIgaW5wbGFjZU9wZXJhdG9yTWF0cml4ID0gYFxuKGZ1bmN0aW9uICVuYW1lJU0obWF0cml4KSB7XG4gICAgY2hlY2tEaW1lbnNpb25zKHRoaXMsIG1hdHJpeCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2pdID0gdGhpc1tpXVtqXSAlb3AlIG1hdHJpeFtpXVtqXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbn0pXG5gO1xuXG52YXIgc3RhdGljT3BlcmF0b3IgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKG1hdHJpeCwgdmFsdWUpIHtcbiAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChtYXRyaXgpO1xuICAgIHJldHVybiBuZXdNYXRyaXguJW5hbWUlKHZhbHVlKTtcbn0pXG5gO1xuXG52YXIgaW5wbGFjZU1ldGhvZCA9IGBcbihmdW5jdGlvbiAlbmFtZSUoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2pdID0gJW1ldGhvZCUodGhpc1tpXVtqXSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59KVxuYDtcblxudmFyIHN0YXRpY01ldGhvZCA9IGBcbihmdW5jdGlvbiAlbmFtZSUobWF0cml4KSB7XG4gICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgobWF0cml4KTtcbiAgICByZXR1cm4gbmV3TWF0cml4LiVuYW1lJSgpO1xufSlcbmA7XG5cbnZhciBvcGVyYXRvcnMgPSBbXG4gICAgLy8gQXJpdGhtZXRpYyBvcGVyYXRvcnNcbiAgICBbJysnLCAnYWRkJ10sXG4gICAgWyctJywgJ3N1YicsICdzdWJ0cmFjdCddLFxuICAgIFsnKicsICdtdWwnLCAnbXVsdGlwbHknXSxcbiAgICBbJy8nLCAnZGl2JywgJ2RpdmlkZSddLFxuICAgIFsnJScsICdtb2QnLCAnbW9kdWx1cyddLFxuICAgIC8vIEJpdHdpc2Ugb3BlcmF0b3JzXG4gICAgWycmJywgJ2FuZCddLFxuICAgIFsnfCcsICdvciddLFxuICAgIFsnXicsICd4b3InXSxcbiAgICBbJzw8JywgJ2xlZnRTaGlmdCddLFxuICAgIFsnPj4nLCAnc2lnblByb3BhZ2F0aW5nUmlnaHRTaGlmdCddLFxuICAgIFsnPj4+JywgJ3JpZ2h0U2hpZnQnLCAnemVyb0ZpbGxSaWdodFNoaWZ0J11cbl07XG5cbmZvciAodmFyIG9wZXJhdG9yIG9mIG9wZXJhdG9ycykge1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgb3BlcmF0b3IubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgTWF0cml4LnByb3RvdHlwZVtvcGVyYXRvcltpXV0gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKGlucGxhY2VPcGVyYXRvciwge25hbWU6IG9wZXJhdG9yW2ldLCBvcDogb3BlcmF0b3JbMF19KSk7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbb3BlcmF0b3JbaV0gKyAnUyddID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihpbnBsYWNlT3BlcmF0b3JTY2FsYXIsIHtuYW1lOiBvcGVyYXRvcltpXSArICdTJywgb3A6IG9wZXJhdG9yWzBdfSkpO1xuICAgICAgICBNYXRyaXgucHJvdG90eXBlW29wZXJhdG9yW2ldICsgJ00nXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU9wZXJhdG9yTWF0cml4LCB7bmFtZTogb3BlcmF0b3JbaV0gKyAnTScsIG9wOiBvcGVyYXRvclswXX0pKTtcblxuICAgICAgICBNYXRyaXhbb3BlcmF0b3JbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihzdGF0aWNPcGVyYXRvciwge25hbWU6IG9wZXJhdG9yW2ldfSkpO1xuICAgIH1cbn1cblxudmFyIG1ldGhvZHMgPSBbXG4gICAgWyd+JywgJ25vdCddXG5dO1xuXG5bXG4gICAgJ2FicycsICdhY29zJywgJ2Fjb3NoJywgJ2FzaW4nLCAnYXNpbmgnLCAnYXRhbicsICdhdGFuaCcsICdjYnJ0JywgJ2NlaWwnLFxuICAgICdjbHozMicsICdjb3MnLCAnY29zaCcsICdleHAnLCAnZXhwbTEnLCAnZmxvb3InLCAnZnJvdW5kJywgJ2xvZycsICdsb2cxcCcsXG4gICAgJ2xvZzEwJywgJ2xvZzInLCAncm91bmQnLCAnc2lnbicsICdzaW4nLCAnc2luaCcsICdzcXJ0JywgJ3RhbicsICd0YW5oJywgJ3RydW5jJ1xuXS5mb3JFYWNoKGZ1bmN0aW9uIChtYXRoTWV0aG9kKSB7XG4gICAgbWV0aG9kcy5wdXNoKFsnTWF0aC4nICsgbWF0aE1ldGhvZCwgbWF0aE1ldGhvZF0pO1xufSk7XG5cbmZvciAodmFyIG1ldGhvZCBvZiBtZXRob2RzKSB7XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBtZXRob2QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgTWF0cml4LnByb3RvdHlwZVttZXRob2RbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihpbnBsYWNlTWV0aG9kLCB7bmFtZTogbWV0aG9kW2ldLCBtZXRob2Q6IG1ldGhvZFswXX0pKTtcbiAgICAgICAgTWF0cml4W21ldGhvZFtpXV0gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKHN0YXRpY01ldGhvZCwge25hbWU6IG1ldGhvZFtpXX0pKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKHRlbXBsYXRlLCB2YWx1ZXMpIHtcbiAgICBmb3IgKHZhciBpIGluIHZhbHVlcykge1xuICAgICAgICB0ZW1wbGF0ZSA9IHRlbXBsYXRlLnJlcGxhY2UobmV3IFJlZ0V4cCgnJScgKyBpICsgJyUnLCAnZycpLCB2YWx1ZXNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gdGVtcGxhdGU7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGNvbXBhcmVOdW1iZXJzKGEsIGIpIHtcbiAgICByZXR1cm4gYSAtIGI7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHN1bSBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuc3VtID0gZnVuY3Rpb24gc3VtKHZhbHVlcykge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmFsdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtYXhpbXVtIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5tYXggPSBmdW5jdGlvbiBtYXgodmFsdWVzKSB7XG4gICAgdmFyIG1heCA9IC1JbmZpbml0eTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA+IG1heCkgbWF4ID0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gbWF4O1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWluaW11bSBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubWluID0gZnVuY3Rpb24gbWluKHZhbHVlcykge1xuICAgIHZhciBtaW4gPSBJbmZpbml0eTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA8IG1pbikgbWluID0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gbWluO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWluIGFuZCBtYXggb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7e21pbjogbnVtYmVyLCBtYXg6IG51bWJlcn19XG4gKi9cbmV4cG9ydHMubWluTWF4ID0gZnVuY3Rpb24gbWluTWF4KHZhbHVlcykge1xuICAgIHZhciBtaW4gPSBJbmZpbml0eTtcbiAgICB2YXIgbWF4ID0gLUluZmluaXR5O1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAodmFsdWVzW2ldIDwgbWluKSBtaW4gPSB2YWx1ZXNbaV07XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPiBtYXgpIG1heCA9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWluOiBtaW4sXG4gICAgICAgIG1heDogbWF4XG4gICAgfTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGFyaXRobWV0aWMgbWVhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuYXJpdGhtZXRpY01lYW4gPSBmdW5jdGlvbiBhcml0aG1ldGljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bSAvIGw7XG59O1xuXG4vKipcbiAqIHtAbGluayBhcml0aG1ldGljTWVhbn1cbiAqL1xuZXhwb3J0cy5tZWFuID0gZXhwb3J0cy5hcml0aG1ldGljTWVhbjtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgZ2VvbWV0cmljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmdlb21ldHJpY01lYW4gPSBmdW5jdGlvbiBnZW9tZXRyaWNNZWFuKHZhbHVlcykge1xuICAgIHZhciBtdWwgPSAxO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBtdWwgKj0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gTWF0aC5wb3cobXVsLCAxIC8gbCk7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtZWFuIG9mIHRoZSBsb2cgb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogSWYgdGhlIHJldHVybiB2YWx1ZSBpcyBleHBvbmVudGlhdGVkLCBpdCBnaXZlcyB0aGUgc2FtZSByZXN1bHQgYXMgdGhlXG4gKiBnZW9tZXRyaWMgbWVhbi5cbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5sb2dNZWFuID0gZnVuY3Rpb24gbG9nTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgbG5zdW0gPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBsbnN1bSArPSBNYXRoLmxvZyh2YWx1ZXNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gbG5zdW0gLyBsO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgd2VpZ2h0ZWQgZ3JhbmQgbWVhbiBmb3IgYSBsaXN0IG9mIG1lYW5zIGFuZCBzYW1wbGUgc2l6ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IG1lYW5zIC0gTWVhbiB2YWx1ZXMgZm9yIGVhY2ggc2V0IG9mIHNhbXBsZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHNhbXBsZXMgLSBOdW1iZXIgb2Ygb3JpZ2luYWwgdmFsdWVzIGZvciBlYWNoIHNldCBvZiBzYW1wbGVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmdyYW5kTWVhbiA9IGZ1bmN0aW9uIGdyYW5kTWVhbihtZWFucywgc2FtcGxlcykge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBuID0gMDtcbiAgICB2YXIgbCA9IG1lYW5zLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBzdW0gKz0gc2FtcGxlc1tpXSAqIG1lYW5zW2ldO1xuICAgICAgICBuICs9IHNhbXBsZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyBuO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgdHJ1bmNhdGVkIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlcyB1c2luZyBhIGdpdmVuIHBlcmNlbnRhZ2VcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHBhcmFtIHtudW1iZXJ9IHBlcmNlbnQgLSBUaGUgcGVyY2VudGFnZSBvZiB2YWx1ZXMgdG8ga2VlcCAocmFuZ2U6IFswLDFdKVxuICogQHBhcmFtIHtib29sZWFufSBbYWxyZWFkeVNvcnRlZD1mYWxzZV1cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMudHJ1bmNhdGVkTWVhbiA9IGZ1bmN0aW9uIHRydW5jYXRlZE1lYW4odmFsdWVzLCBwZXJjZW50LCBhbHJlYWR5U29ydGVkKSB7XG4gICAgaWYgKGFscmVhZHlTb3J0ZWQgPT09IHVuZGVmaW5lZCkgYWxyZWFkeVNvcnRlZCA9IGZhbHNlO1xuICAgIGlmICghYWxyZWFkeVNvcnRlZCkge1xuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKS5zb3J0KGNvbXBhcmVOdW1iZXJzKTtcbiAgICB9XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIHZhciBrID0gTWF0aC5mbG9vcihsICogcGVyY2VudCk7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IGs7IGkgPCAobCAtIGspOyBpKyspIHtcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bSAvIChsIC0gMiAqIGspO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgaGFybW9uaWMgbWVhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuaGFybW9uaWNNZWFuID0gZnVuY3Rpb24gaGFybW9uaWNNZWFuKHZhbHVlcykge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAodmFsdWVzW2ldID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgYXQgaW5kZXggJyArIGkgKyAnaXMgemVybycpO1xuICAgICAgICB9XG4gICAgICAgIHN1bSArPSAxIC8gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gbCAvIHN1bTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGNvbnRyYWhhcm1vbmljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmNvbnRyYUhhcm1vbmljTWVhbiA9IGZ1bmN0aW9uIGNvbnRyYUhhcm1vbmljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgcjEgPSAwO1xuICAgIHZhciByMiA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHIxICs9IHZhbHVlc1tpXSAqIHZhbHVlc1tpXTtcbiAgICAgICAgcjIgKz0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICBpZiAocjIgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdzdW0gb2YgdmFsdWVzIGlzIG5lZ2F0aXZlJyk7XG4gICAgfVxuICAgIHJldHVybiByMSAvIHIyO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWVkaWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHBhcmFtIHtib29sZWFufSBbYWxyZWFkeVNvcnRlZD1mYWxzZV1cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubWVkaWFuID0gZnVuY3Rpb24gbWVkaWFuKHZhbHVlcywgYWxyZWFkeVNvcnRlZCkge1xuICAgIGlmIChhbHJlYWR5U29ydGVkID09PSB1bmRlZmluZWQpIGFscmVhZHlTb3J0ZWQgPSBmYWxzZTtcbiAgICBpZiAoIWFscmVhZHlTb3J0ZWQpIHtcbiAgICAgICAgdmFsdWVzID0gdmFsdWVzLnNsaWNlKCkuc29ydChjb21wYXJlTnVtYmVycyk7XG4gICAgfVxuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgaGFsZiA9IE1hdGguZmxvb3IobCAvIDIpO1xuICAgIGlmIChsICUgMiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gKHZhbHVlc1toYWxmIC0gMV0gKyB2YWx1ZXNbaGFsZl0pICogMC41O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB2YWx1ZXNbaGFsZl07XG4gICAgfVxufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgdmFyaWFuY2Ugb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFt1bmJpYXNlZD10cnVlXSAtIGlmIHRydWUsIGRpdmlkZSBieSAobi0xKTsgaWYgZmFsc2UsIGRpdmlkZSBieSBuLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy52YXJpYW5jZSA9IGZ1bmN0aW9uIHZhcmlhbmNlKHZhbHVlcywgdW5iaWFzZWQpIHtcbiAgICBpZiAodW5iaWFzZWQgPT09IHVuZGVmaW5lZCkgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciB0aGVNZWFuID0gZXhwb3J0cy5tZWFuKHZhbHVlcyk7XG4gICAgdmFyIHRoZVZhcmlhbmNlID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgeCA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHRoZVZhcmlhbmNlICs9IHggKiB4O1xuICAgIH1cblxuICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICByZXR1cm4gdGhlVmFyaWFuY2UgLyAobCAtIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGVWYXJpYW5jZSAvIGw7XG4gICAgfVxufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgc3RhbmRhcmQgZGV2aWF0aW9uIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHBhcmFtIHtib29sZWFufSBbdW5iaWFzZWQ9dHJ1ZV0gLSBpZiB0cnVlLCBkaXZpZGUgYnkgKG4tMSk7IGlmIGZhbHNlLCBkaXZpZGUgYnkgbi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuc3RhbmRhcmREZXZpYXRpb24gPSBmdW5jdGlvbiBzdGFuZGFyZERldmlhdGlvbih2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChleHBvcnRzLnZhcmlhbmNlKHZhbHVlcywgdW5iaWFzZWQpKTtcbn07XG5cbmV4cG9ydHMuc3RhbmRhcmRFcnJvciA9IGZ1bmN0aW9uIHN0YW5kYXJkRXJyb3IodmFsdWVzKSB7XG4gICAgcmV0dXJuIGV4cG9ydHMuc3RhbmRhcmREZXZpYXRpb24odmFsdWVzKSAvIE1hdGguc3FydCh2YWx1ZXMubGVuZ3RoKTtcbn07XG5cbmV4cG9ydHMucXVhcnRpbGVzID0gZnVuY3Rpb24gcXVhcnRpbGVzKHZhbHVlcywgYWxyZWFkeVNvcnRlZCkge1xuICAgIGlmICh0eXBlb2YoYWxyZWFkeVNvcnRlZCkgPT09ICd1bmRlZmluZWQnKSBhbHJlYWR5U29ydGVkID0gZmFsc2U7XG4gICAgaWYgKCFhbHJlYWR5U29ydGVkKSB7XG4gICAgICAgIHZhbHVlcyA9IHZhbHVlcy5zbGljZSgpO1xuICAgICAgICB2YWx1ZXMuc29ydChjb21wYXJlTnVtYmVycyk7XG4gICAgfVxuXG4gICAgdmFyIHF1YXJ0ID0gdmFsdWVzLmxlbmd0aCAvIDQ7XG4gICAgdmFyIHExID0gdmFsdWVzW01hdGguY2VpbChxdWFydCkgLSAxXTtcbiAgICB2YXIgcTIgPSBleHBvcnRzLm1lZGlhbih2YWx1ZXMsIHRydWUpO1xuICAgIHZhciBxMyA9IHZhbHVlc1tNYXRoLmNlaWwocXVhcnQgKiAzKSAtIDFdO1xuXG4gICAgcmV0dXJuIHtxMTogcTEsIHEyOiBxMiwgcTM6IHEzfTtcbn07XG5cbmV4cG9ydHMucG9vbGVkU3RhbmRhcmREZXZpYXRpb24gPSBmdW5jdGlvbiBwb29sZWRTdGFuZGFyZERldmlhdGlvbihzYW1wbGVzLCB1bmJpYXNlZCkge1xuICAgIHJldHVybiBNYXRoLnNxcnQoZXhwb3J0cy5wb29sZWRWYXJpYW5jZShzYW1wbGVzLCB1bmJpYXNlZCkpO1xufTtcblxuZXhwb3J0cy5wb29sZWRWYXJpYW5jZSA9IGZ1bmN0aW9uIHBvb2xlZFZhcmlhbmNlKHNhbXBsZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgdmFyIGxlbmd0aCA9IDAsIGwgPSBzYW1wbGVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgdmFsdWVzID0gc2FtcGxlc1tpXTtcbiAgICAgICAgdmFyIHZhcmkgPSBleHBvcnRzLnZhcmlhbmNlKHZhbHVlcyk7XG5cbiAgICAgICAgc3VtICs9ICh2YWx1ZXMubGVuZ3RoIC0gMSkgKiB2YXJpO1xuXG4gICAgICAgIGlmICh1bmJpYXNlZClcbiAgICAgICAgICAgIGxlbmd0aCArPSB2YWx1ZXMubGVuZ3RoIC0gMTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgbGVuZ3RoICs9IHZhbHVlcy5sZW5ndGg7XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyBsZW5ndGg7XG59O1xuXG5leHBvcnRzLm1vZGUgPSBmdW5jdGlvbiBtb2RlKHZhbHVlcykge1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aCxcbiAgICAgICAgaXRlbUNvdW50ID0gbmV3IEFycmF5KGwpLFxuICAgICAgICBpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaXRlbUNvdW50W2ldID0gMDtcbiAgICB9XG4gICAgdmFyIGl0ZW1BcnJheSA9IG5ldyBBcnJheShsKTtcbiAgICB2YXIgY291bnQgPSAwO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgaW5kZXggPSBpdGVtQXJyYXkuaW5kZXhPZih2YWx1ZXNbaV0pO1xuICAgICAgICBpZiAoaW5kZXggPj0gMClcbiAgICAgICAgICAgIGl0ZW1Db3VudFtpbmRleF0rKztcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpdGVtQXJyYXlbY291bnRdID0gdmFsdWVzW2ldO1xuICAgICAgICAgICAgaXRlbUNvdW50W2NvdW50XSA9IDE7XG4gICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1heFZhbHVlID0gMCwgbWF4SW5kZXggPSAwO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGlmIChpdGVtQ291bnRbaV0gPiBtYXhWYWx1ZSkge1xuICAgICAgICAgICAgbWF4VmFsdWUgPSBpdGVtQ291bnRbaV07XG4gICAgICAgICAgICBtYXhJbmRleCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaXRlbUFycmF5W21heEluZGV4XTtcbn07XG5cbmV4cG9ydHMuY292YXJpYW5jZSA9IGZ1bmN0aW9uIGNvdmFyaWFuY2UodmVjdG9yMSwgdmVjdG9yMiwgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgbWVhbjEgPSBleHBvcnRzLm1lYW4odmVjdG9yMSk7XG4gICAgdmFyIG1lYW4yID0gZXhwb3J0cy5tZWFuKHZlY3RvcjIpO1xuXG4gICAgaWYgKHZlY3RvcjEubGVuZ3RoICE9PSB2ZWN0b3IyLmxlbmd0aClcbiAgICAgICAgdGhyb3cgXCJWZWN0b3JzIGRvIG5vdCBoYXZlIHRoZSBzYW1lIGRpbWVuc2lvbnNcIjtcblxuICAgIHZhciBjb3YgPSAwLCBsID0gdmVjdG9yMS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHggPSB2ZWN0b3IxW2ldIC0gbWVhbjE7XG4gICAgICAgIHZhciB5ID0gdmVjdG9yMltpXSAtIG1lYW4yO1xuICAgICAgICBjb3YgKz0geCAqIHk7XG4gICAgfVxuXG4gICAgaWYgKHVuYmlhc2VkKVxuICAgICAgICByZXR1cm4gY292IC8gKGwgLSAxKTtcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiBjb3YgLyBsO1xufTtcblxuZXhwb3J0cy5za2V3bmVzcyA9IGZ1bmN0aW9uIHNrZXduZXNzKHZhbHVlcywgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMubWVhbih2YWx1ZXMpO1xuXG4gICAgdmFyIHMyID0gMCwgczMgPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgZGV2ID0gdmFsdWVzW2ldIC0gdGhlTWVhbjtcbiAgICAgICAgczIgKz0gZGV2ICogZGV2O1xuICAgICAgICBzMyArPSBkZXYgKiBkZXYgKiBkZXY7XG4gICAgfVxuICAgIHZhciBtMiA9IHMyIC8gbDtcbiAgICB2YXIgbTMgPSBzMyAvIGw7XG5cbiAgICB2YXIgZyA9IG0zIC8gKE1hdGgucG93KG0yLCAzIC8gMi4wKSk7XG4gICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgIHZhciBhID0gTWF0aC5zcXJ0KGwgKiAobCAtIDEpKTtcbiAgICAgICAgdmFyIGIgPSBsIC0gMjtcbiAgICAgICAgcmV0dXJuIChhIC8gYikgKiBnO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGc7XG4gICAgfVxufTtcblxuZXhwb3J0cy5rdXJ0b3NpcyA9IGZ1bmN0aW9uIGt1cnRvc2lzKHZhbHVlcywgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMubWVhbih2YWx1ZXMpO1xuICAgIHZhciBuID0gdmFsdWVzLmxlbmd0aCwgczIgPSAwLCBzNCA9IDA7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgZGV2ID0gdmFsdWVzW2ldIC0gdGhlTWVhbjtcbiAgICAgICAgczIgKz0gZGV2ICogZGV2O1xuICAgICAgICBzNCArPSBkZXYgKiBkZXYgKiBkZXYgKiBkZXY7XG4gICAgfVxuICAgIHZhciBtMiA9IHMyIC8gbjtcbiAgICB2YXIgbTQgPSBzNCAvIG47XG5cbiAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgdmFyIHYgPSBzMiAvIChuIC0gMSk7XG4gICAgICAgIHZhciBhID0gKG4gKiAobiArIDEpKSAvICgobiAtIDEpICogKG4gLSAyKSAqIChuIC0gMykpO1xuICAgICAgICB2YXIgYiA9IHM0IC8gKHYgKiB2KTtcbiAgICAgICAgdmFyIGMgPSAoKG4gLSAxKSAqIChuIC0gMSkpIC8gKChuIC0gMikgKiAobiAtIDMpKTtcblxuICAgICAgICByZXR1cm4gYSAqIGIgLSAzICogYztcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBtNCAvIChtMiAqIG0yKSAtIDM7XG4gICAgfVxufTtcblxuZXhwb3J0cy5lbnRyb3B5ID0gZnVuY3Rpb24gZW50cm9weSh2YWx1ZXMsIGVwcykge1xuICAgIGlmICh0eXBlb2YoZXBzKSA9PT0gJ3VuZGVmaW5lZCcpIGVwcyA9IDA7XG4gICAgdmFyIHN1bSA9IDAsIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKVxuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldICogTWF0aC5sb2codmFsdWVzW2ldICsgZXBzKTtcbiAgICByZXR1cm4gLXN1bTtcbn07XG5cbmV4cG9ydHMud2VpZ2h0ZWRNZWFuID0gZnVuY3Rpb24gd2VpZ2h0ZWRNZWFuKHZhbHVlcywgd2VpZ2h0cykge1xuICAgIHZhciBzdW0gPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKylcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXSAqIHdlaWdodHNbaV07XG4gICAgcmV0dXJuIHN1bTtcbn07XG5cbmV4cG9ydHMud2VpZ2h0ZWRTdGFuZGFyZERldmlhdGlvbiA9IGZ1bmN0aW9uIHdlaWdodGVkU3RhbmRhcmREZXZpYXRpb24odmFsdWVzLCB3ZWlnaHRzKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChleHBvcnRzLndlaWdodGVkVmFyaWFuY2UodmFsdWVzLCB3ZWlnaHRzKSk7XG59O1xuXG5leHBvcnRzLndlaWdodGVkVmFyaWFuY2UgPSBmdW5jdGlvbiB3ZWlnaHRlZFZhcmlhbmNlKHZhbHVlcywgd2VpZ2h0cykge1xuICAgIHZhciB0aGVNZWFuID0gZXhwb3J0cy53ZWlnaHRlZE1lYW4odmFsdWVzLCB3ZWlnaHRzKTtcbiAgICB2YXIgdmFyaSA9IDAsIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIHZhciBhID0gMCwgYiA9IDA7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgeiA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHZhciB3ID0gd2VpZ2h0c1tpXTtcblxuICAgICAgICB2YXJpICs9IHcgKiAoeiAqIHopO1xuICAgICAgICBiICs9IHc7XG4gICAgICAgIGEgKz0gdyAqIHc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhcmkgKiAoYiAvIChiICogYiAtIGEpKTtcbn07XG5cbmV4cG9ydHMuY2VudGVyID0gZnVuY3Rpb24gY2VudGVyKHZhbHVlcywgaW5QbGFjZSkge1xuICAgIGlmICh0eXBlb2YoaW5QbGFjZSkgPT09ICd1bmRlZmluZWQnKSBpblBsYWNlID0gZmFsc2U7XG5cbiAgICB2YXIgcmVzdWx0ID0gdmFsdWVzO1xuICAgIGlmICghaW5QbGFjZSlcbiAgICAgICAgcmVzdWx0ID0gdmFsdWVzLnNsaWNlKCk7XG5cbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMubWVhbihyZXN1bHQpLCBsID0gcmVzdWx0Lmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKylcbiAgICAgICAgcmVzdWx0W2ldIC09IHRoZU1lYW47XG59O1xuXG5leHBvcnRzLnN0YW5kYXJkaXplID0gZnVuY3Rpb24gc3RhbmRhcmRpemUodmFsdWVzLCBzdGFuZGFyZERldiwgaW5QbGFjZSkge1xuICAgIGlmICh0eXBlb2Yoc3RhbmRhcmREZXYpID09PSAndW5kZWZpbmVkJykgc3RhbmRhcmREZXYgPSBleHBvcnRzLnN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcyk7XG4gICAgaWYgKHR5cGVvZihpblBsYWNlKSA9PT0gJ3VuZGVmaW5lZCcpIGluUGxhY2UgPSBmYWxzZTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgdmFyIHJlc3VsdCA9IGluUGxhY2UgPyB2YWx1ZXMgOiBuZXcgQXJyYXkobCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHJlc3VsdFtpXSA9IHZhbHVlc1tpXSAvIHN0YW5kYXJkRGV2O1xuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5leHBvcnRzLmN1bXVsYXRpdmVTdW0gPSBmdW5jdGlvbiBjdW11bGF0aXZlU3VtKGFycmF5KSB7XG4gICAgdmFyIGwgPSBhcnJheS5sZW5ndGg7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShsKTtcbiAgICByZXN1bHRbMF0gPSBhcnJheVswXTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGw7IGkrKylcbiAgICAgICAgcmVzdWx0W2ldID0gcmVzdWx0W2kgLSAxXSArIGFycmF5W2ldO1xuICAgIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmFycmF5ID0gcmVxdWlyZSgnLi9hcnJheScpO1xuZXhwb3J0cy5tYXRyaXggPSByZXF1aXJlKCcuL21hdHJpeCcpO1xuIiwiJ3VzZSBzdHJpY3QnO1xudmFyIGFycmF5U3RhdCA9IHJlcXVpcmUoJy4vYXJyYXknKTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2FjY29yZC1uZXQvZnJhbWV3b3JrL2Jsb2IvZGV2ZWxvcG1lbnQvU291cmNlcy9BY2NvcmQuU3RhdGlzdGljcy9Ub29scy5jc1xuXG5mdW5jdGlvbiBlbnRyb3B5KG1hdHJpeCwgZXBzKSB7XG4gICAgaWYgKHR5cGVvZihlcHMpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBlcHMgPSAwO1xuICAgIH1cbiAgICB2YXIgc3VtID0gMCxcbiAgICAgICAgbDEgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBsMiA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsMTsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbDI7IGorKykge1xuICAgICAgICAgICAgc3VtICs9IG1hdHJpeFtpXVtqXSAqIE1hdGgubG9nKG1hdHJpeFtpXVtqXSArIGVwcyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIC1zdW07XG59XG5cbmZ1bmN0aW9uIG1lYW4obWF0cml4LCBkaW1lbnNpb24pIHtcbiAgICBpZiAodHlwZW9mKGRpbWVuc2lvbikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9IDA7XG4gICAgfVxuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIHRoZU1lYW4sIE4sIGksIGo7XG5cbiAgICBpZiAoZGltZW5zaW9uID09PSAtMSkge1xuICAgICAgICB0aGVNZWFuID0gWzBdO1xuICAgICAgICBOID0gcm93cyAqIGNvbHM7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGVNZWFuWzBdICs9IG1hdHJpeFtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGVNZWFuWzBdIC89IE47XG4gICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgdGhlTWVhbiA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgTiA9IHJvd3M7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgIHRoZU1lYW5bal0gPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoZU1lYW5bal0gKz0gbWF0cml4W2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhlTWVhbltqXSAvPSBOO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDEpIHtcbiAgICAgICAgdGhlTWVhbiA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgTiA9IGNvbHM7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgIHRoZU1lYW5bal0gPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoZU1lYW5bal0gKz0gbWF0cml4W2pdW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhlTWVhbltqXSAvPSBOO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRpbWVuc2lvbicpO1xuICAgIH1cbiAgICByZXR1cm4gdGhlTWVhbjtcbn1cblxuZnVuY3Rpb24gc3RhbmRhcmREZXZpYXRpb24obWF0cml4LCBtZWFucywgdW5iaWFzZWQpIHtcbiAgICB2YXIgdmFyaSA9IHZhcmlhbmNlKG1hdHJpeCwgbWVhbnMsIHVuYmlhc2VkKSwgbCA9IHZhcmkubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhcmlbaV0gPSBNYXRoLnNxcnQodmFyaVtpXSk7XG4gICAgfVxuICAgIHJldHVybiB2YXJpO1xufVxuXG5mdW5jdGlvbiB2YXJpYW5jZShtYXRyaXgsIG1lYW5zLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICB1bmJpYXNlZCA9IHRydWU7XG4gICAgfVxuICAgIG1lYW5zID0gbWVhbnMgfHwgbWVhbihtYXRyaXgpO1xuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICB2YXIgdmFyaSA9IG5ldyBBcnJheShjb2xzKTtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgIHZhciBzdW0xID0gMCwgc3VtMiA9IDAsIHggPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgeCA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgc3VtMSArPSB4O1xuICAgICAgICAgICAgc3VtMiArPSB4ICogeDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgICAgIHZhcmlbal0gPSAoc3VtMiAtICgoc3VtMSAqIHN1bTEpIC8gcm93cykpIC8gKHJvd3MgLSAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhcmlbal0gPSAoc3VtMiAtICgoc3VtMSAqIHN1bTEpIC8gcm93cykpIC8gcm93cztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFyaTtcbn1cblxuZnVuY3Rpb24gbWVkaWFuKG1hdHJpeCkge1xuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aCwgY29scyA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIG1lZGlhbnMgPSBuZXcgQXJyYXkoY29scyk7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICB2YXIgZGF0YSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgIGRhdGFbal0gPSBtYXRyaXhbal1baV07XG4gICAgICAgIH1cbiAgICAgICAgZGF0YS5zb3J0KCk7XG4gICAgICAgIHZhciBOID0gZGF0YS5sZW5ndGg7XG4gICAgICAgIGlmIChOICUgMiA9PT0gMCkge1xuICAgICAgICAgICAgbWVkaWFuc1tpXSA9IChkYXRhW04gLyAyXSArIGRhdGFbKE4gLyAyKSAtIDFdKSAqIDAuNTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1lZGlhbnNbaV0gPSBkYXRhW01hdGguZmxvb3IoTiAvIDIpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWVkaWFucztcbn1cblxuZnVuY3Rpb24gbW9kZShtYXRyaXgpIHtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICBtb2RlcyA9IG5ldyBBcnJheShjb2xzKSxcbiAgICAgICAgaSwgajtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgIHZhciBpdGVtQ291bnQgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgcm93czsgaysrKSB7XG4gICAgICAgICAgICBpdGVtQ291bnRba10gPSAwO1xuICAgICAgICB9XG4gICAgICAgIHZhciBpdGVtQXJyYXkgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIHZhciBjb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gaXRlbUFycmF5LmluZGV4T2YobWF0cml4W2pdW2ldKTtcbiAgICAgICAgICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgaXRlbUNvdW50W2luZGV4XSsrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpdGVtQXJyYXlbY291bnRdID0gbWF0cml4W2pdW2ldO1xuICAgICAgICAgICAgICAgIGl0ZW1Db3VudFtjb3VudF0gPSAxO1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbWF4VmFsdWUgPSAwLCBtYXhJbmRleCA9IDA7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICBpZiAoaXRlbUNvdW50W2pdID4gbWF4VmFsdWUpIHtcbiAgICAgICAgICAgICAgICBtYXhWYWx1ZSA9IGl0ZW1Db3VudFtqXTtcbiAgICAgICAgICAgICAgICBtYXhJbmRleCA9IGo7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBtb2Rlc1tpXSA9IGl0ZW1BcnJheVttYXhJbmRleF07XG4gICAgfVxuICAgIHJldHVybiBtb2Rlcztcbn1cblxuZnVuY3Rpb24gc2tld25lc3MobWF0cml4LCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciBtZWFucyA9IG1lYW4obWF0cml4KTtcbiAgICB2YXIgbiA9IG1hdHJpeC5sZW5ndGgsIGwgPSBtZWFucy5sZW5ndGg7XG4gICAgdmFyIHNrZXcgPSBuZXcgQXJyYXkobCk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGw7IGorKykge1xuICAgICAgICB2YXIgczIgPSAwLCBzMyA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGV2ID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgICAgICBzMiArPSBkZXYgKiBkZXY7XG4gICAgICAgICAgICBzMyArPSBkZXYgKiBkZXYgKiBkZXY7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbTIgPSBzMiAvIG47XG4gICAgICAgIHZhciBtMyA9IHMzIC8gbjtcbiAgICAgICAgdmFyIGcgPSBtMyAvIE1hdGgucG93KG0yLCAzIC8gMik7XG5cbiAgICAgICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgICAgICB2YXIgYSA9IE1hdGguc3FydChuICogKG4gLSAxKSk7XG4gICAgICAgICAgICB2YXIgYiA9IG4gLSAyO1xuICAgICAgICAgICAgc2tld1tqXSA9IChhIC8gYikgKiBnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2tld1tqXSA9IGc7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNrZXc7XG59XG5cbmZ1bmN0aW9uIGt1cnRvc2lzKG1hdHJpeCwgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIG4gPSBtYXRyaXgubGVuZ3RoLCBtID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICB2YXIga3VydCA9IG5ldyBBcnJheShtKTtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbTsgaisrKSB7XG4gICAgICAgIHZhciBzMiA9IDAsIHM0ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkZXYgPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgICAgIHM0ICs9IGRldiAqIGRldiAqIGRldiAqIGRldjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbTIgPSBzMiAvIG47XG4gICAgICAgIHZhciBtNCA9IHM0IC8gbjtcblxuICAgICAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgICAgIHZhciB2ID0gczIgLyAobiAtIDEpO1xuICAgICAgICAgICAgdmFyIGEgPSAobiAqIChuICsgMSkpIC8gKChuIC0gMSkgKiAobiAtIDIpICogKG4gLSAzKSk7XG4gICAgICAgICAgICB2YXIgYiA9IHM0IC8gKHYgKiB2KTtcbiAgICAgICAgICAgIHZhciBjID0gKChuIC0gMSkgKiAobiAtIDEpKSAvICgobiAtIDIpICogKG4gLSAzKSk7XG4gICAgICAgICAgICBrdXJ0W2pdID0gYSAqIGIgLSAzICogYztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGt1cnRbal0gPSBtNCAvIChtMiAqIG0yKSAtIDM7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGt1cnQ7XG59XG5cbmZ1bmN0aW9uIHN0YW5kYXJkRXJyb3IobWF0cml4KSB7XG4gICAgdmFyIHNhbXBsZXMgPSBtYXRyaXgubGVuZ3RoO1xuICAgIHZhciBzdGFuZGFyZERldmlhdGlvbnMgPSBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgpLCBsID0gc3RhbmRhcmREZXZpYXRpb25zLmxlbmd0aDtcbiAgICB2YXIgc3RhbmRhcmRFcnJvcnMgPSBuZXcgQXJyYXkobCk7XG4gICAgdmFyIHNxcnROID0gTWF0aC5zcXJ0KHNhbXBsZXMpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgc3RhbmRhcmRFcnJvcnNbaV0gPSBzdGFuZGFyZERldmlhdGlvbnNbaV0gLyBzcXJ0TjtcbiAgICB9XG4gICAgcmV0dXJuIHN0YW5kYXJkRXJyb3JzO1xufVxuXG5mdW5jdGlvbiBjb3ZhcmlhbmNlKG1hdHJpeCwgZGltZW5zaW9uKSB7XG4gICAgcmV0dXJuIHNjYXR0ZXIobWF0cml4LCB1bmRlZmluZWQsIGRpbWVuc2lvbik7XG59XG5cbmZ1bmN0aW9uIHNjYXR0ZXIobWF0cml4LCBkaXZpc29yLCBkaW1lbnNpb24pIHtcbiAgICBpZiAodHlwZW9mKGRpbWVuc2lvbikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9IDA7XG4gICAgfVxuICAgIGlmICh0eXBlb2YoZGl2aXNvcikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgICAgIGRpdmlzb3IgPSBtYXRyaXgubGVuZ3RoIC0gMTtcbiAgICAgICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDEpIHtcbiAgICAgICAgICAgIGRpdmlzb3IgPSBtYXRyaXhbMF0ubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCwgZGltZW5zaW9uKSxcbiAgICAgICAgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIFtbXV07XG4gICAgfVxuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgY292LCBpLCBqLCBzLCBrO1xuXG4gICAgaWYgKGRpbWVuc2lvbiA9PT0gMCkge1xuICAgICAgICBjb3YgPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIGNvdltpXSA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IHJvd3M7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IChtYXRyaXhba11bal0gLSBtZWFuc1tqXSkgKiAobWF0cml4W2tdW2ldIC0gbWVhbnNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzIC89IGRpdmlzb3I7XG4gICAgICAgICAgICAgICAgY292W2ldW2pdID0gcztcbiAgICAgICAgICAgICAgICBjb3Zbal1baV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDEpIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2xzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSAobWF0cml4W2pdW2tdIC0gbWVhbnNbal0pICogKG1hdHJpeFtpXVtrXSAtIG1lYW5zW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyAvPSBkaXZpc29yO1xuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHM7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY292O1xufVxuXG5mdW5jdGlvbiBjb3JyZWxhdGlvbihtYXRyaXgpIHtcbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCksXG4gICAgICAgIHN0YW5kYXJkRGV2aWF0aW9ucyA9IHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCwgdHJ1ZSwgbWVhbnMpLFxuICAgICAgICBzY29yZXMgPSB6U2NvcmVzKG1hdHJpeCwgbWVhbnMsIHN0YW5kYXJkRGV2aWF0aW9ucyksXG4gICAgICAgIHJvd3MgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgaSwgajtcblxuICAgIHZhciBjb3IgPSBuZXcgQXJyYXkoY29scyk7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICBjb3JbaV0gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgZm9yIChqID0gaTsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgdmFyIGMgPSAwO1xuICAgICAgICAgICAgZm9yICh2YXIgayA9IDAsIGwgPSBzY29yZXMubGVuZ3RoOyBrIDwgbDsgaysrKSB7XG4gICAgICAgICAgICAgICAgYyArPSBzY29yZXNba11bal0gKiBzY29yZXNba11baV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjIC89IHJvd3MgLSAxO1xuICAgICAgICAgICAgY29yW2ldW2pdID0gYztcbiAgICAgICAgICAgIGNvcltqXVtpXSA9IGM7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvcjtcbn1cblxuZnVuY3Rpb24gelNjb3JlcyhtYXRyaXgsIG1lYW5zLCBzdGFuZGFyZERldmlhdGlvbnMpIHtcbiAgICBtZWFucyA9IG1lYW5zIHx8IG1lYW4obWF0cml4KTtcbiAgICBpZiAodHlwZW9mKHN0YW5kYXJkRGV2aWF0aW9ucykgPT09ICd1bmRlZmluZWQnKSBzdGFuZGFyZERldmlhdGlvbnMgPSBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgsIHRydWUsIG1lYW5zKTtcbiAgICByZXR1cm4gc3RhbmRhcmRpemUoY2VudGVyKG1hdHJpeCwgbWVhbnMsIGZhbHNlKSwgc3RhbmRhcmREZXZpYXRpb25zLCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gY2VudGVyKG1hdHJpeCwgbWVhbnMsIGluUGxhY2UpIHtcbiAgICBtZWFucyA9IG1lYW5zIHx8IG1lYW4obWF0cml4KTtcbiAgICB2YXIgcmVzdWx0ID0gbWF0cml4LFxuICAgICAgICBsID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgaSwgaiwgamo7XG5cbiAgICBpZiAoIWluUGxhY2UpIHtcbiAgICAgICAgcmVzdWx0ID0gbmV3IEFycmF5KGwpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSBuZXcgQXJyYXkobWF0cml4W2ldLmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciByb3cgPSByZXN1bHRbaV07XG4gICAgICAgIGZvciAoaiA9IDAsIGpqID0gcm93Lmxlbmd0aDsgaiA8IGpqOyBqKyspIHtcbiAgICAgICAgICAgIHJvd1tqXSA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHN0YW5kYXJkaXplKG1hdHJpeCwgc3RhbmRhcmREZXZpYXRpb25zLCBpblBsYWNlKSB7XG4gICAgaWYgKHR5cGVvZihzdGFuZGFyZERldmlhdGlvbnMpID09PSAndW5kZWZpbmVkJykgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4KTtcbiAgICB2YXIgcmVzdWx0ID0gbWF0cml4LFxuICAgICAgICBsID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgaSwgaiwgamo7XG5cbiAgICBpZiAoIWluUGxhY2UpIHtcbiAgICAgICAgcmVzdWx0ID0gbmV3IEFycmF5KGwpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICByZXN1bHRbaV0gPSBuZXcgQXJyYXkobWF0cml4W2ldLmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciByZXN1bHRSb3cgPSByZXN1bHRbaV07XG4gICAgICAgIHZhciBzb3VyY2VSb3cgPSBtYXRyaXhbaV07XG4gICAgICAgIGZvciAoaiA9IDAsIGpqID0gcmVzdWx0Um93Lmxlbmd0aDsgaiA8IGpqOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChzdGFuZGFyZERldmlhdGlvbnNbal0gIT09IDAgJiYgIWlzTmFOKHN0YW5kYXJkRGV2aWF0aW9uc1tqXSkpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRSb3dbal0gPSBzb3VyY2VSb3dbal0gLyBzdGFuZGFyZERldmlhdGlvbnNbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRWYXJpYW5jZShtYXRyaXgsIHdlaWdodHMpIHtcbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSByZXR1cm4gW107XG4gICAgdmFyIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIHZhciB2YXJpID0gbmV3IEFycmF5KGNvbHMpO1xuXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgdmFyIHN1bSA9IDA7XG4gICAgICAgIHZhciBhID0gMCwgYiA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHZhciB6ID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgICAgICB2YXIgdyA9IHdlaWdodHNbaV07XG5cbiAgICAgICAgICAgIHN1bSArPSB3ICogKHogKiB6KTtcbiAgICAgICAgICAgIGIgKz0gdztcbiAgICAgICAgICAgIGEgKz0gdyAqIHc7XG4gICAgICAgIH1cblxuICAgICAgICB2YXJpW2pdID0gc3VtICogKGIgLyAoYiAqIGIgLSBhKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhcmk7XG59XG5cbmZ1bmN0aW9uIHdlaWdodGVkTWVhbihtYXRyaXgsIHdlaWdodHMsIGRpbWVuc2lvbikge1xuICAgIGlmICh0eXBlb2YoZGltZW5zaW9uKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGltZW5zaW9uID0gMDtcbiAgICB9XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSByZXR1cm4gW107XG4gICAgdmFyIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICBtZWFucywgaSwgaWksIGosIHcsIHJvdztcblxuICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgbWVhbnMgPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIG1lYW5zW2ldID0gMDtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICByb3cgPSBtYXRyaXhbaV07XG4gICAgICAgICAgICB3ID0gd2VpZ2h0c1tpXTtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBtZWFuc1tqXSArPSByb3dbal0gKiB3O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDEpIHtcbiAgICAgICAgbWVhbnMgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIG1lYW5zW2ldID0gMDtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICByb3cgPSBtYXRyaXhbal07XG4gICAgICAgICAgICB3ID0gd2VpZ2h0c1tqXTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBtZWFuc1tqXSArPSByb3dbaV0gKiB3O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRpbWVuc2lvbicpO1xuICAgIH1cblxuICAgIHZhciB3ZWlnaHRTdW0gPSBhcnJheVN0YXQuc3VtKHdlaWdodHMpO1xuICAgIGlmICh3ZWlnaHRTdW0gIT09IDApIHtcbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBtZWFucy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBtZWFuc1tpXSAvPSB3ZWlnaHRTdW07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1lYW5zO1xufVxuXG5mdW5jdGlvbiB3ZWlnaHRlZENvdmFyaWFuY2UobWF0cml4LCB3ZWlnaHRzLCBtZWFucywgZGltZW5zaW9uKSB7XG4gICAgZGltZW5zaW9uID0gZGltZW5zaW9uIHx8IDA7XG4gICAgbWVhbnMgPSBtZWFucyB8fCB3ZWlnaHRlZE1lYW4obWF0cml4LCB3ZWlnaHRzLCBkaW1lbnNpb24pO1xuICAgIHZhciBzMSA9IDAsIHMyID0gMDtcbiAgICBmb3IgKHZhciBpID0gMCwgaWkgPSB3ZWlnaHRzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgczEgKz0gd2VpZ2h0c1tpXTtcbiAgICAgICAgczIgKz0gd2VpZ2h0c1tpXSAqIHdlaWdodHNbaV07XG4gICAgfVxuICAgIHZhciBmYWN0b3IgPSBzMSAvIChzMSAqIHMxIC0gczIpO1xuICAgIHJldHVybiB3ZWlnaHRlZFNjYXR0ZXIobWF0cml4LCB3ZWlnaHRzLCBtZWFucywgZmFjdG9yLCBkaW1lbnNpb24pO1xufVxuXG5mdW5jdGlvbiB3ZWlnaHRlZFNjYXR0ZXIobWF0cml4LCB3ZWlnaHRzLCBtZWFucywgZmFjdG9yLCBkaW1lbnNpb24pIHtcbiAgICBkaW1lbnNpb24gPSBkaW1lbnNpb24gfHwgMDtcbiAgICBtZWFucyA9IG1lYW5zIHx8IHdlaWdodGVkTWVhbihtYXRyaXgsIHdlaWdodHMsIGRpbWVuc2lvbik7XG4gICAgaWYgKHR5cGVvZihmYWN0b3IpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBmYWN0b3IgPSAxO1xuICAgIH1cbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIFtbXV07XG4gICAgfVxuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgY292LCBpLCBqLCBrLCBzO1xuXG4gICAgaWYgKGRpbWVuc2lvbiA9PT0gMCkge1xuICAgICAgICBjb3YgPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIGNvdltpXSA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IHJvd3M7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IHdlaWdodHNba10gKiAobWF0cml4W2tdW2pdIC0gbWVhbnNbal0pICogKG1hdHJpeFtrXVtpXSAtIG1lYW5zW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY292W2ldW2pdID0gcyAqIGZhY3RvcjtcbiAgICAgICAgICAgICAgICBjb3Zbal1baV0gPSBzICogZmFjdG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChkaW1lbnNpb24gPT09IDEpIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2xzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSB3ZWlnaHRzW2tdICogKG1hdHJpeFtqXVtrXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhbaV1ba10gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcyAqIGZhY3RvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY292O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBlbnRyb3B5OiBlbnRyb3B5LFxuICAgIG1lYW46IG1lYW4sXG4gICAgc3RhbmRhcmREZXZpYXRpb246IHN0YW5kYXJkRGV2aWF0aW9uLFxuICAgIHZhcmlhbmNlOiB2YXJpYW5jZSxcbiAgICBtZWRpYW46IG1lZGlhbixcbiAgICBtb2RlOiBtb2RlLFxuICAgIHNrZXduZXNzOiBza2V3bmVzcyxcbiAgICBrdXJ0b3Npczoga3VydG9zaXMsXG4gICAgc3RhbmRhcmRFcnJvcjogc3RhbmRhcmRFcnJvcixcbiAgICBjb3ZhcmlhbmNlOiBjb3ZhcmlhbmNlLFxuICAgIHNjYXR0ZXI6IHNjYXR0ZXIsXG4gICAgY29ycmVsYXRpb246IGNvcnJlbGF0aW9uLFxuICAgIHpTY29yZXM6IHpTY29yZXMsXG4gICAgY2VudGVyOiBjZW50ZXIsXG4gICAgc3RhbmRhcmRpemU6IHN0YW5kYXJkaXplLFxuICAgIHdlaWdodGVkVmFyaWFuY2U6IHdlaWdodGVkVmFyaWFuY2UsXG4gICAgd2VpZ2h0ZWRNZWFuOiB3ZWlnaHRlZE1lYW4sXG4gICAgd2VpZ2h0ZWRDb3ZhcmlhbmNlOiB3ZWlnaHRlZENvdmFyaWFuY2UsXG4gICAgd2VpZ2h0ZWRTY2F0dGVyOiB3ZWlnaHRlZFNjYXR0ZXJcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vcGNhJyk7XG4iLCIndXNlIHN0cmljdCc7XG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgU3RhdCA9IHJlcXVpcmUoJ21sLXN0YXQnKTtcbnZhciBTVkQgPSBNYXRyaXguREMuU1ZEO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBDQTtcblxuLyoqXG4qIENyZWF0ZXMgbmV3IFBDQSAoUHJpbmNpcGFsIENvbXBvbmVudCBBbmFseXNpcykgZnJvbSB0aGUgZGF0YXNldFxuKiBAcGFyYW0ge01hdHJpeH0gZGF0YXNldFxuKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIG9wdGlvbnMgZm9yIHRoZSBQQ0EgYWxnb3JpdGhtXG4qIEBwYXJhbSB7Ym9vbGVhbn0gcmVsb2FkIC0gZm9yIGxvYWQgcHVycG9zZXNcbiogQHBhcmFtIHtPYmplY3R9IG1vZGVsIC0gZm9yIGxvYWQgcHVycG9zZXNcbiogQGNvbnN0cnVjdG9yXG4qICovXG5mdW5jdGlvbiBQQ0EoZGF0YXNldCwgb3B0aW9ucywgcmVsb2FkLCBtb2RlbCkge1xuXG4gICAgaWYgKHJlbG9hZCkge1xuICAgICAgICB0aGlzLlUgPSBtb2RlbC5VO1xuICAgICAgICB0aGlzLlMgPSBtb2RlbC5TO1xuICAgICAgICB0aGlzLm1lYW5zID0gbW9kZWwubWVhbnM7XG4gICAgICAgIHRoaXMuc3RkID0gbW9kZWwuc3RkO1xuICAgICAgICB0aGlzLnN0YW5kYXJkaXplID0gbW9kZWwuc3RhbmRhcmRpemVcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZihvcHRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgc3RhbmRhcmRpemU6IGZhbHNlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zdGFuZGFyZGl6ZSA9IG9wdGlvbnMuc3RhbmRhcmRpemU7XG5cbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgoZGF0YXNldCkpIHtcbiAgICAgICAgICAgIGRhdGFzZXQgPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGF0YXNldCA9IGRhdGFzZXQuY2xvbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBub3JtYWxpemF0aW9uID0gYWRqdXN0KGRhdGFzZXQsIHRoaXMuc3RhbmRhcmRpemUpO1xuICAgICAgICB2YXIgbm9ybWFsaXplZERhdGFzZXQgPSBub3JtYWxpemF0aW9uLnJlc3VsdDtcblxuICAgICAgICB2YXIgY292YXJpYW5jZU1hdHJpeCA9IG5vcm1hbGl6ZWREYXRhc2V0LnRyYW5zcG9zZSgpLm1tdWwobm9ybWFsaXplZERhdGFzZXQpLmRpdlMoZGF0YXNldC5yb3dzKTtcblxuICAgICAgICB2YXIgdGFyZ2V0ID0gbmV3IFNWRChjb3ZhcmlhbmNlTWF0cml4LCB7XG4gICAgICAgICAgICBjb21wdXRlTGVmdFNpbmd1bGFyVmVjdG9yczogdHJ1ZSxcbiAgICAgICAgICAgIGNvbXB1dGVSaWdodFNpbmd1bGFyVmVjdG9yczogdHJ1ZSxcbiAgICAgICAgICAgIGF1dG9UcmFuc3Bvc2U6IGZhbHNlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuVSA9IHRhcmdldC5sZWZ0U2luZ3VsYXJWZWN0b3JzO1xuICAgICAgICB0aGlzLlMgPSB0YXJnZXQuZGlhZ29uYWw7XG4gICAgICAgIHRoaXMubWVhbnMgPSBub3JtYWxpemF0aW9uLm1lYW5zO1xuICAgICAgICB0aGlzLnN0ZCA9IG5vcm1hbGl6YXRpb24uc3RkO1xuICAgIH1cbn1cblxuLyoqXG4qIExvYWQgYSBQQ0EgbW9kZWwgZnJvbSBKU09OXG4qIEBvYXJhbSB7T2JqZWN0fSBtb2RlbFxuKiBAcmV0dXJuIHtQQ0F9XG4qICovXG5QQ0EubG9hZCA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIGlmKG1vZGVsLm1vZGVsTmFtZSAhPT0gJ1BDQScpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiVGhlIGN1cnJlbnQgbW9kZWwgaXMgaW52YWxpZCFcIik7XG5cbiAgICByZXR1cm4gbmV3IFBDQShudWxsLCBudWxsLCB0cnVlLCBtb2RlbCk7XG59O1xuXG4vKipcbiogRXhwb3J0cyB0aGUgY3VycmVudCBtb2RlbCB0byBhbiBPYmplY3RcbiogQHJldHVybiB7T2JqZWN0fSBtb2RlbFxuKiAqL1xuUENBLnByb3RvdHlwZS5leHBvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbW9kZWxOYW1lOiBcIlBDQVwiLFxuICAgICAgICBVOiB0aGlzLlUsXG4gICAgICAgIFM6IHRoaXMuUyxcbiAgICAgICAgbWVhbnM6IHRoaXMubWVhbnMsXG4gICAgICAgIHN0ZDogdGhpcy5zdGQsXG4gICAgICAgIHN0YW5kYXJkaXplOiB0aGlzLnN0YW5kYXJkaXplXG4gICAgfTtcbn07XG5cbi8qKlxuKiBGdW5jdGlvbiB0aGF0IHByb2plY3QgdGhlIGRhdGFzZXQgaW50byBuZXcgc3BhY2Ugb2YgayBkaW1lbnNpb25zLFxuKiB0aGlzIG1ldGhvZCBkb2Vzbid0IG1vZGlmeSB5b3VyIGRhdGFzZXQuXG4qIEBwYXJhbSB7TWF0cml4fSBkYXRhc2V0LlxuKiBAcGFyYW0ge051bWJlcn0gayAtIGRpbWVuc2lvbnMgdG8gcHJvamVjdC5cbiogQHJldHVybiB7TWF0cml4fSBkYXRhc2V0IHByb2plY3RlZCBpbiBrIGRpbWVuc2lvbnMuXG4qIEB0aHJvd3Mge1JhbmdlRXJyb3J9IGlmIGsgaXMgbGFyZ2VyIHRoYW4gdGhlIG51bWJlciBvZiBlaWdlbnZlY3RvclxuKiAgICAgICAgICAgICAgICAgICAgICBvZiB0aGUgbW9kZWwuXG4qICovXG5QQ0EucHJvdG90eXBlLnByb2plY3QgPSBmdW5jdGlvbiAoZGF0YXNldCwgaykge1xuICAgIHZhciBkaW1lbnNpb25zID0gayAtIDE7XG4gICAgaWYoayA+IHRoaXMuVS5jb2x1bW5zKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcInRoZSBudW1iZXIgb2YgZGltZW5zaW9ucyBtdXN0IG5vdCBiZSBsYXJnZXIgdGhhbiBcIiArIHRoaXMuVS5jb2x1bW5zKTtcblxuICAgIGlmICghTWF0cml4LmlzTWF0cml4KGRhdGFzZXQpKSB7XG4gICAgICAgIGRhdGFzZXQgPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGFzZXQgPSBkYXRhc2V0LmNsb25lKCk7XG4gICAgfVxuXG4gICAgdmFyIFggPSBhZGp1c3QoZGF0YXNldCwgdGhpcy5zdGFuZGFyZGl6ZSkucmVzdWx0O1xuICAgIHJldHVybiBYLm1tdWwodGhpcy5VLnN1Yk1hdHJpeCgwLCB0aGlzLlUucm93cyAtIDEsIDAsIGRpbWVuc2lvbnMpKTtcbn07XG5cbi8qKlxuKiBUaGlzIG1ldGhvZCByZXR1cm5zIHRoZSBwZXJjZW50YWdlIHZhcmlhbmNlIG9mIGVhY2ggZWlnZW52ZWN0b3IuXG4qIEByZXR1cm4ge051bWJlcn0gcGVyY2VudGFnZSB2YXJpYW5jZSBvZiBlYWNoIGVpZ2VudmVjdG9yLlxuKiAqL1xuUENBLnByb3RvdHlwZS5nZXRFeHBsYWluZWRWYXJpYW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc3VtID0gdGhpcy5TLnJlZHVjZShmdW5jdGlvbiAocHJldmlvdXMsIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwcmV2aW91cyArIHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLlMubWFwKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgLyBzdW07XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgRWlnZW52ZWN0b3JzIG9mIHRoZSBjb3ZhcmlhbmNlIG1hdHJpeC5cbiAqIEByZXR1cm5zIHtNYXRyaXh9XG4gKi9cblBDQS5wcm90b3R5cGUuZ2V0RWlnZW52ZWN0b3JzID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLlU7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgRWlnZW52YWx1ZXMgKG9uIHRoZSBkaWFnb25hbCkuXG4gKiBAcmV0dXJucyB7Kn1cbiAqL1xuUENBLnByb3RvdHlwZS5nZXRFaWdlbnZhbHVlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5TO1xufTtcblxuLyoqXG4qIFRoaXMgbWV0aG9kIHJldHVybnMgYSBkYXRhc2V0IG5vcm1hbGl6ZWQgaW4gdGhlIGZvbGxvd2luZyBmb3JtOlxuKiBYID0gKFggLSBtZWFuKSAvIHN0ZFxuKiBAcGFyYW0gZGF0YXNldC5cbiogQHBhcmFtIHtCb29sZWFufSBzdGFuZGFyaXplIC0gZG8gc3RhbmRhcmRpemF0aW9uXG4qIEByZXR1cm4gQSBkYXRhc2V0IG5vcm1hbGl6ZWQuXG4qICovXG5mdW5jdGlvbiBhZGp1c3QoZGF0YXNldCwgc3RhbmRhcml6ZSkge1xuICAgIHZhciBtZWFucyA9IFN0YXQubWF0cml4Lm1lYW4oZGF0YXNldCk7XG4gICAgdmFyIHN0ZCA9IHN0YW5kYXJpemUgPyBTdGF0Lm1hdHJpeC5zdGFuZGFyZERldmlhdGlvbihkYXRhc2V0LCBtZWFucywgdHJ1ZSkgOiB1bmRlZmluZWQ7XG5cbiAgICB2YXIgcmVzdWx0ID0gZGF0YXNldC5zdWJSb3dWZWN0b3IobWVhbnMpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3VsdDogc3RhbmRhcml6ZSA/IHJlc3VsdC5kaXZSb3dWZWN0b3Ioc3RkKSA6IHJlc3VsdCxcbiAgICAgICAgbWVhbnM6IG1lYW5zLFxuICAgICAgICBzdGQ6IHN0ZFxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IHJlcXVpcmUoJy4vcGxzJyk7XG5leHBvcnRzLlV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuZXhwb3J0cy5PUExTID0gcmVxdWlyZSgnLi9vcGxzJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCdtbC1tYXRyaXgnKTtcbnZhciBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBPUExTO1xuXG5mdW5jdGlvbiBPUExTKGRhdGFzZXQsIHByZWRpY3Rpb25zLCBudW1iZXJPU0MpIHtcbiAgICB2YXIgWCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG4gICAgdmFyIHkgPSBuZXcgTWF0cml4KHByZWRpY3Rpb25zKTtcblxuICAgIFggPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKFgpLnJlc3VsdDtcbiAgICB5ID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZSh5KS5yZXN1bHQ7XG5cbiAgICB2YXIgcm93cyA9IFgucm93cztcbiAgICB2YXIgY29sdW1ucyA9IFguY29sdW1ucztcblxuICAgIHZhciBzdW1PZlNxdWFyZXNYID0gWC5jbG9uZSgpLm11bChYKS5zdW0oKTtcbiAgICB2YXIgdyA9IFgudHJhbnNwb3NlKCkubW11bCh5KTtcbiAgICB3LmRpdihVdGlscy5ub3JtKHcpKTtcblxuICAgIHZhciBvcnRob1cgPSBuZXcgQXJyYXkobnVtYmVyT1NDKTtcbiAgICB2YXIgb3J0aG9UID0gbmV3IEFycmF5KG51bWJlck9TQyk7XG4gICAgdmFyIG9ydGhvUCA9IG5ldyBBcnJheShudW1iZXJPU0MpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtYmVyT1NDOyBpKyspIHtcbiAgICAgICAgdmFyIHQgPSBYLm1tdWwodyk7XG5cbiAgICAgICAgdmFyIG51bWVyYXRvciA9IFgudHJhbnNwb3NlKCkubW11bCh0KTtcbiAgICAgICAgdmFyIGRlbm9taW5hdG9yID0gdC50cmFuc3Bvc2UoKS5tbXVsKHQpWzBdWzBdO1xuICAgICAgICB2YXIgcCA9ICBudW1lcmF0b3IuZGl2KGRlbm9taW5hdG9yKTtcblxuICAgICAgICBudW1lcmF0b3IgPSB3LnRyYW5zcG9zZSgpLm1tdWwocClbMF1bMF07XG4gICAgICAgIGRlbm9taW5hdG9yID0gdy50cmFuc3Bvc2UoKS5tbXVsKHcpWzBdWzBdO1xuICAgICAgICB2YXIgd09zYyA9IHAuc3ViKHcuY2xvbmUoKS5tdWwobnVtZXJhdG9yIC8gZGVub21pbmF0b3IpKTtcbiAgICAgICAgd09zYy5kaXYoVXRpbHMubm9ybSh3T3NjKSk7XG5cbiAgICAgICAgdmFyIHRPc2MgPSBYLm1tdWwod09zYyk7XG5cbiAgICAgICAgbnVtZXJhdG9yID0gWC50cmFuc3Bvc2UoKS5tbXVsKHRPc2MpO1xuICAgICAgICBkZW5vbWluYXRvciA9IHRPc2MudHJhbnNwb3NlKCkubW11bCh0T3NjKVswXVswXTtcbiAgICAgICAgdmFyIHBPc2MgPSBudW1lcmF0b3IuZGl2KGRlbm9taW5hdG9yKTtcblxuICAgICAgICBYLnN1Yih0T3NjLm1tdWwocE9zYy50cmFuc3Bvc2UoKSkpO1xuICAgICAgICBvcnRob1dbaV0gPSB3T3NjLmdldENvbHVtbigwKTtcbiAgICAgICAgb3J0aG9UW2ldID0gdE9zYy5nZXRDb2x1bW4oMCk7XG4gICAgICAgIG9ydGhvUFtpXSA9IHBPc2MuZ2V0Q29sdW1uKDApO1xuICAgIH1cblxuICAgIHRoaXMuWG9zYyA9IFg7XG5cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWG9zeCA9IHRoaXMuWG9zYy5jbG9uZSgpLm11bCh0aGlzLlhvc2MpLnN1bSgpO1xuICAgIHRoaXMuUjJYID0gMSAtIHN1bU9mU3F1YXJlc1hvc3gvc3VtT2ZTcXVhcmVzWDtcblxuICAgIHRoaXMuVyA9IG9ydGhvVztcbiAgICB0aGlzLlQgPSBvcnRob1Q7XG4gICAgdGhpcy5QID0gb3J0aG9QO1xuICAgIHRoaXMubnVtYmVyT1NDID0gbnVtYmVyT1NDO1xufVxuXG5PUExTLnByb3RvdHlwZS5jb3JyZWN0RGF0YXNldCA9IGZ1bmN0aW9uIChkYXRhc2V0KSB7XG4gICAgdmFyIFggPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuXG4gICAgdmFyIHN1bU9mU3F1YXJlc1ggPSBYLmNsb25lKCkubXVsKFgpLnN1bSgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5udW1iZXJPU0M7IGkrKykge1xuICAgICAgICB2YXIgY3VycmVudFcgPSB0aGlzLlcuZ2V0Q29sdW1uVmVjdG9yKGkpO1xuICAgICAgICB2YXIgY3VycmVudFAgPSB0aGlzLlAuZ2V0Q29sdW1uVmVjdG9yKGkpO1xuXG4gICAgICAgIHZhciB0ID0gWC5tbXVsKGN1cnJlbnRXKTtcbiAgICAgICAgWC5zdWIodC5tbXVsKGN1cnJlbnRQKSk7XG4gICAgfVxuICAgIHZhciBzdW1PZlNxdWFyZXNYb3N4ID0gWC5jbG9uZSgpLm11bChYKS5zdW0oKTtcblxuICAgIHZhciBSMlggPSAxIC0gc3VtT2ZTcXVhcmVzWG9zeCAvIHN1bU9mU3F1YXJlc1g7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBkYXRhc2V0T3NjOiBYLFxuICAgICAgICBSMkRhdGFzZXQ6IFIyWFxuICAgIH07XG59OyIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBQTFM7XG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSBzdW0gYXQgdGhlIGNvbHVtbiBvZiB0aGUgZ2l2ZW4gbWF0cml4LlxuICogQHBhcmFtIG1hdHJpeFxuICogQHBhcmFtIGNvbHVtblxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gZ2V0Q29sU3VtKG1hdHJpeCwgY29sdW1uKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXRyaXgucm93czsgaSsrKSB7XG4gICAgICAgIHN1bSArPSBtYXRyaXhbaV1bY29sdW1uXTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGluZGV4IHdoZXJlIHRoZSBzdW0gb2YgZWFjaFxuICogY29sdW1uIHZlY3RvciBpcyBtYXhpbXVtLlxuICogQHBhcmFtIHtNYXRyaXh9IGRhdGFcbiAqIEByZXR1cm5zIHtudW1iZXJ9IGluZGV4IG9mIHRoZSBtYXhpbXVtXG4gKi9cbmZ1bmN0aW9uIG1heFN1bUNvbEluZGV4KGRhdGEpIHtcbiAgICB2YXIgbWF4SW5kZXggPSAwO1xuICAgIHZhciBtYXhTdW0gPSAtSW5maW5pdHk7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGRhdGEuY29sdW1uczsgKytpKSB7XG4gICAgICAgIHZhciBjdXJyZW50U3VtID0gZ2V0Q29sU3VtKGRhdGEsIGkpO1xuICAgICAgICBpZihjdXJyZW50U3VtID4gbWF4U3VtKSB7XG4gICAgICAgICAgICBtYXhTdW0gPSBjdXJyZW50U3VtO1xuICAgICAgICAgICAgbWF4SW5kZXggPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtYXhJbmRleDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RvciBvZiB0aGUgUExTIG1vZGVsLlxuICogQHBhcmFtIHJlbG9hZCAtIHVzZWQgZm9yIGxvYWQgcHVycG9zZXMuXG4gKiBAcGFyYW0gbW9kZWwgLSB1c2VkIGZvciBsb2FkIHB1cnBvc2VzLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFBMUyhyZWxvYWQsIG1vZGVsKSB7XG4gICAgaWYocmVsb2FkKSB7XG4gICAgICAgIHRoaXMuRSA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5FKTtcbiAgICAgICAgdGhpcy5GID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLkYpO1xuICAgICAgICB0aGlzLnNzcVljYWwgPSBtb2RlbC5zc3FZY2FsO1xuICAgICAgICB0aGlzLlIyWCA9IG1vZGVsLlIyWDtcbiAgICAgICAgdGhpcy55bWVhbiA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC55bWVhbik7XG4gICAgICAgIHRoaXMueXN0ZCA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC55c3RkKTtcbiAgICAgICAgdGhpcy5QQlEgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuUEJRKTtcbiAgICAgICAgdGhpcy5UID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlQpO1xuICAgICAgICB0aGlzLlAgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuUCk7XG4gICAgICAgIHRoaXMuVSA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5VKTtcbiAgICAgICAgdGhpcy5RID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlEpO1xuICAgICAgICB0aGlzLlcgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuVyk7XG4gICAgICAgIHRoaXMuQiA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5CKTtcbiAgICB9XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBmaXQgdGhlIG1vZGVsIHdpdGggdGhlIGdpdmVuIGRhdGEgYW5kIHByZWRpY3Rpb25zLCBpbiB0aGlzIGZ1bmN0aW9uIGlzIGNhbGN1bGF0ZWQgdGhlXG4gKiBmb2xsb3dpbmcgb3V0cHV0czpcbiAqXG4gKiBUIC0gU2NvcmUgbWF0cml4IG9mIFhcbiAqIFAgLSBMb2FkaW5nIG1hdHJpeCBvZiBYXG4gKiBVIC0gU2NvcmUgbWF0cml4IG9mIFlcbiAqIFEgLSBMb2FkaW5nIG1hdHJpeCBvZiBZXG4gKiBCIC0gTWF0cml4IG9mIHJlZ3Jlc3Npb24gY29lZmZpY2llbnRcbiAqIFcgLSBXZWlnaHQgbWF0cml4IG9mIFhcbiAqXG4gKiBAcGFyYW0ge01hdHJpeH0gdHJhaW5pbmdTZXQgLSBEYXRhc2V0IHRvIGJlIGFwcGx5IHRoZSBtb2RlbFxuICogQHBhcmFtIHtNYXRyaXh9IHByZWRpY3Rpb25zIC0gUHJlZGljdGlvbnMgb3ZlciBlYWNoIGNhc2Ugb2YgdGhlIGRhdGFzZXRcbiAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zIC0gcmVjaWV2ZXMgdGhlIGxhdGVudFZlY3RvcnMgYW5kIHRoZSB0b2xlcmFuY2Ugb2YgZWFjaCBzdGVwIG9mIHRoZSBQTFNcbiAqL1xuUExTLnByb3RvdHlwZS50cmFpbiA9IGZ1bmN0aW9uICh0cmFpbmluZ1NldCwgcHJlZGljdGlvbnMsIG9wdGlvbnMpIHtcblxuICAgIGlmKG9wdGlvbnMgPT09IHVuZGVmaW5lZCkgb3B0aW9ucyA9IHt9O1xuXG4gICAgdmFyIGxhdGVudFZlY3RvcnMgPSBvcHRpb25zLmxhdGVudFZlY3RvcnM7XG4gICAgaWYobGF0ZW50VmVjdG9ycyA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKGxhdGVudFZlY3RvcnMpKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiTGF0ZW50IHZlY3RvciBtdXN0IGJlIGEgbnVtYmVyLlwiKTtcbiAgICB9XG5cbiAgICB2YXIgdG9sZXJhbmNlID0gb3B0aW9ucy50b2xlcmFuY2U7XG4gICAgaWYodG9sZXJhbmNlID09PSB1bmRlZmluZWQgfHwgaXNOYU4odG9sZXJhbmNlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIlRvbGVyYW5jZSBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgIH1cblxuICAgIGlmKHRyYWluaW5nU2V0Lmxlbmd0aCAhPT0gcHJlZGljdGlvbnMubGVuZ3RoKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIlRoZSBudW1iZXIgb2YgcHJlZGljdGlvbnMgYW5kIGVsZW1lbnRzIGluIHRoZSBkYXRhc2V0IG11c3QgYmUgdGhlIHNhbWVcIik7XG5cbiAgICAvL3ZhciB0b2xlcmFuY2UgPSAxZS05O1xuICAgIHZhciBYID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZShuZXcgTWF0cml4KHRyYWluaW5nU2V0KSkucmVzdWx0O1xuICAgIHZhciByZXN1bHRZID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZShuZXcgTWF0cml4KHByZWRpY3Rpb25zKSk7XG4gICAgdGhpcy55bWVhbiA9IHJlc3VsdFkubWVhbnMubmVnKCk7XG4gICAgdGhpcy55c3RkID0gcmVzdWx0WS5zdGQ7XG4gICAgdmFyIFkgPSByZXN1bHRZLnJlc3VsdDtcblxuICAgIHZhciByeCA9IFgucm93cztcbiAgICB2YXIgY3ggPSBYLmNvbHVtbnM7XG4gICAgdmFyIHJ5ID0gWS5yb3dzO1xuICAgIHZhciBjeSA9IFkuY29sdW1ucztcblxuICAgIGlmKHJ4ICE9IHJ5KSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiZGF0YXNldCBjYXNlcyBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIHByZWRpY3Rpb25zXCIpO1xuICAgIH1cblxuICAgIHZhciBzc3FYY2FsID0gWC5jbG9uZSgpLm11bChYKS5zdW0oKTsgLy8gZm9yIHRoZSBywrJcbiAgICB2YXIgc3VtT2ZTcXVhcmVzWSA9IFkuY2xvbmUoKS5tdWwoWSkuc3VtKCk7XG5cbiAgICB2YXIgbiA9IGxhdGVudFZlY3RvcnM7IC8vTWF0aC5tYXgoY3gsIGN5KTsgLy8gY29tcG9uZW50cyBvZiB0aGUgcGxzXG4gICAgdmFyIFQgPSBNYXRyaXguemVyb3MocngsIG4pO1xuICAgIHZhciBQID0gTWF0cml4Lnplcm9zKGN4LCBuKTtcbiAgICB2YXIgVSA9IE1hdHJpeC56ZXJvcyhyeSwgbik7XG4gICAgdmFyIFEgPSBNYXRyaXguemVyb3MoY3ksIG4pO1xuICAgIHZhciBCID0gTWF0cml4Lnplcm9zKG4sIG4pO1xuICAgIHZhciBXID0gUC5jbG9uZSgpO1xuICAgIHZhciBrID0gMDtcbiAgICB2YXIgUjJYID0gbmV3IEFycmF5KG4pO1xuXG4gICAgd2hpbGUoVXRpbHMubm9ybShZKSA+IHRvbGVyYW5jZSAmJiBrIDwgbikge1xuICAgICAgICB2YXIgdHJhbnNwb3NlWCA9IFgudHJhbnNwb3NlKCk7XG4gICAgICAgIHZhciB0cmFuc3Bvc2VZID0gWS50cmFuc3Bvc2UoKTtcblxuICAgICAgICB2YXIgdEluZGV4ID0gbWF4U3VtQ29sSW5kZXgoWC5jbG9uZSgpLm11bE0oWCkpO1xuICAgICAgICB2YXIgdUluZGV4ID0gbWF4U3VtQ29sSW5kZXgoWS5jbG9uZSgpLm11bE0oWSkpO1xuXG4gICAgICAgIHZhciB0MSA9IFguZ2V0Q29sdW1uVmVjdG9yKHRJbmRleCk7XG4gICAgICAgIHZhciB1ID0gWS5nZXRDb2x1bW5WZWN0b3IodUluZGV4KTtcbiAgICAgICAgdmFyIHQgPSBNYXRyaXguemVyb3MocngsIDEpO1xuXG4gICAgICAgIHdoaWxlKFV0aWxzLm5vcm0odDEuY2xvbmUoKS5zdWIodCkpID4gdG9sZXJhbmNlKSB7XG4gICAgICAgICAgICB2YXIgdyA9IHRyYW5zcG9zZVgubW11bCh1KTtcbiAgICAgICAgICAgIHcuZGl2KFV0aWxzLm5vcm0odykpO1xuICAgICAgICAgICAgdCA9IHQxO1xuICAgICAgICAgICAgdDEgPSBYLm1tdWwodyk7XG4gICAgICAgICAgICB2YXIgcSA9IHRyYW5zcG9zZVkubW11bCh0MSk7XG4gICAgICAgICAgICBxLmRpdihVdGlscy5ub3JtKHEpKTtcbiAgICAgICAgICAgIHUgPSBZLm1tdWwocSk7XG4gICAgICAgIH1cblxuICAgICAgICB0ID0gdDE7XG4gICAgICAgIHZhciBudW0gPSB0cmFuc3Bvc2VYLm1tdWwodCk7XG4gICAgICAgIHZhciBkZW4gPSAodC50cmFuc3Bvc2UoKS5tbXVsKHQpKVswXVswXTtcbiAgICAgICAgdmFyIHAgPSBudW0uZGl2KGRlbik7XG4gICAgICAgIHZhciBwbm9ybSA9IFV0aWxzLm5vcm0ocCk7XG4gICAgICAgIHAuZGl2KHBub3JtKTtcbiAgICAgICAgdC5tdWwocG5vcm0pO1xuICAgICAgICB3Lm11bChwbm9ybSk7XG5cbiAgICAgICAgbnVtID0gdS50cmFuc3Bvc2UoKS5tbXVsKHQpO1xuICAgICAgICBkZW4gPSAodC50cmFuc3Bvc2UoKS5tbXVsKHQpKVswXVswXTtcbiAgICAgICAgdmFyIGIgPSAobnVtLmRpdihkZW4pKVswXVswXTtcbiAgICAgICAgWC5zdWIodC5tbXVsKHAudHJhbnNwb3NlKCkpKTtcbiAgICAgICAgWS5zdWIodC5jbG9uZSgpLm11bChiKS5tbXVsKHEudHJhbnNwb3NlKCkpKTtcblxuICAgICAgICBULnNldENvbHVtbihrLCB0KTtcbiAgICAgICAgUC5zZXRDb2x1bW4oaywgcCk7XG4gICAgICAgIFUuc2V0Q29sdW1uKGssIHUpO1xuICAgICAgICBRLnNldENvbHVtbihrLCBxKTtcbiAgICAgICAgVy5zZXRDb2x1bW4oaywgdyk7XG5cbiAgICAgICAgQltrXVtrXSA9IGI7XG4gICAgICAgIGsrKztcbiAgICB9XG5cbiAgICBrLS07XG4gICAgVCA9IFQuc3ViTWF0cml4KDAsIFQucm93cyAtIDEsIDAsIGspO1xuICAgIFAgPSBQLnN1Yk1hdHJpeCgwLCBQLnJvd3MgLSAxLCAwLCBrKTtcbiAgICBVID0gVS5zdWJNYXRyaXgoMCwgVS5yb3dzIC0gMSwgMCwgayk7XG4gICAgUSA9IFEuc3ViTWF0cml4KDAsIFEucm93cyAtIDEsIDAsIGspO1xuICAgIFcgPSBXLnN1Yk1hdHJpeCgwLCBXLnJvd3MgLSAxLCAwLCBrKTtcbiAgICBCID0gQi5zdWJNYXRyaXgoMCwgaywgMCwgayk7XG5cbiAgICB0aGlzLlIyWCA9IHQudHJhbnNwb3NlKCkubW11bCh0KS5tbXVsKHAudHJhbnNwb3NlKCkubW11bChwKSkuZGl2Uyhzc3FYY2FsKVswXVswXTtcblxuICAgIC8vIFRPRE86IHJldmlldyBvZiBSMllcbiAgICAvL3RoaXMuUjJZID0gdC50cmFuc3Bvc2UoKS5tbXVsKHQpLm11bChxW2tdWzBdKnFba11bMF0pLmRpdlMoc3NxWWNhbClbMF1bMF07XG5cbiAgICB0aGlzLnNzcVljYWwgPSBzdW1PZlNxdWFyZXNZO1xuICAgIHRoaXMuRSA9IFg7XG4gICAgdGhpcy5GID0gWTtcbiAgICB0aGlzLlQgPSBUO1xuICAgIHRoaXMuUCA9IFA7XG4gICAgdGhpcy5VID0gVTtcbiAgICB0aGlzLlEgPSBRO1xuICAgIHRoaXMuVyA9IFc7XG4gICAgdGhpcy5CID0gQjtcbiAgICB0aGlzLlBCUSA9IFAubW11bChCKS5tbXVsKFEudHJhbnNwb3NlKCkpO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHByZWRpY3QgdGhlIGJlaGF2aW9yIG9mIHRoZSBnaXZlbiBkYXRhc2V0LlxuICogQHBhcmFtIGRhdGFzZXQgLSBkYXRhIHRvIGJlIHByZWRpY3RlZC5cbiAqIEByZXR1cm5zIHtNYXRyaXh9IC0gcHJlZGljdGlvbnMgb2YgZWFjaCBlbGVtZW50IG9mIHRoZSBkYXRhc2V0LlxuICovXG5QTFMucHJvdG90eXBlLnByZWRpY3QgPSBmdW5jdGlvbiAoZGF0YXNldCkge1xuICAgIHZhciBYID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICB2YXIgbm9ybWFsaXphdGlvbiA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUoWCk7XG4gICAgWCA9IG5vcm1hbGl6YXRpb24ucmVzdWx0O1xuICAgIHZhciBZID0gWC5tbXVsKHRoaXMuUEJRKTtcbiAgICBZLm11bFJvd1ZlY3Rvcih0aGlzLnlzdGQpO1xuICAgIFkuYWRkUm93VmVjdG9yKHRoaXMueW1lYW4pO1xuICAgIHJldHVybiBZO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGV4cGxhaW5lZCB2YXJpYW5jZSBvbiB0cmFpbmluZyBvZiB0aGUgUExTIG1vZGVsLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuUExTLnByb3RvdHlwZS5nZXRFeHBsYWluZWRWYXJpYW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5SMlg7XG59O1xuXG4vKipcbiAqIExvYWQgYSBQTFMgbW9kZWwgZnJvbSBhbiBPYmplY3RcbiAqIEBwYXJhbSBtb2RlbFxuICogQHJldHVybnMge1BMU30gLSBQTFMgb2JqZWN0IGZyb20gdGhlIGdpdmVuIG1vZGVsXG4gKi9cblBMUy5sb2FkID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgaWYobW9kZWwubW9kZWxOYW1lICE9PSAnUExTJylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUaGUgY3VycmVudCBtb2RlbCBpcyBpbnZhbGlkIVwiKTtcblxuICAgIHJldHVybiBuZXcgUExTKHRydWUsIG1vZGVsKTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBleHBvcnRzIGEgUExTIG1vZGVsIHRvIGFuIE9iamVjdC5cbiAqIEByZXR1cm5zIHt7bW9kZWxOYW1lOiBzdHJpbmcsIHltZWFuOiAqLCB5c3RkOiAqLCBQQlE6ICp9fSBtb2RlbC5cbiAqL1xuUExTLnByb3RvdHlwZS5leHBvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbW9kZWxOYW1lOiBcIlBMU1wiLFxuICAgICAgICBFOiB0aGlzLkUsXG4gICAgICAgIEY6IHRoaXMuRixcbiAgICAgICAgUjJYOiB0aGlzLlIyWCxcbiAgICAgICAgc3NxWWNhbDogdGhpcy5zc3FZY2FsLFxuICAgICAgICB5bWVhbjogdGhpcy55bWVhbixcbiAgICAgICAgeXN0ZDogdGhpcy55c3RkLFxuICAgICAgICBQQlE6IHRoaXMuUEJRLFxuICAgICAgICBUOiB0aGlzLlQsXG4gICAgICAgIFA6IHRoaXMuUCxcbiAgICAgICAgVTogdGhpcy5VLFxuICAgICAgICBROiB0aGlzLlEsXG4gICAgICAgIFc6IHRoaXMuVyxcbiAgICAgICAgQjogdGhpcy5CXG4gICAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCdtbC1tYXRyaXgnKTtcbnZhciBTdGF0ID0gcmVxdWlyZSgnbWwtc3RhdCcpO1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgZ2l2ZW4gdmVjdG9yLCByZXR1cm5zIGhpcyBub3JtXG4gKiBAcGFyYW0ge1ZlY3Rvcn0gWFxuICogQHJldHVybnMge251bWJlcn0gTm9ybSBvZiB0aGUgdmVjdG9yXG4gKi9cbmZ1bmN0aW9uIG5vcm0oWCkge1xuICAgIHJldHVybiBNYXRoLnNxcnQoWC5jbG9uZSgpLmFwcGx5KHBvdzJhcnJheSkuc3VtKCkpO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcG93IDIgZWFjaCBlbGVtZW50IG9mIGEgTWF0cml4IG9yIGEgVmVjdG9yLFxuICogdXNlZCBpbiB0aGUgYXBwbHkgbWV0aG9kIG9mIHRoZSBNYXRyaXggb2JqZWN0XG4gKiBAcGFyYW0gaSAtIGluZGV4IGkuXG4gKiBAcGFyYW0gaiAtIGluZGV4IGouXG4gKiBAcmV0dXJuIFRoZSBNYXRyaXggb2JqZWN0IG1vZGlmaWVkIGF0IHRoZSBpbmRleCBpLCBqLlxuICogKi9cbmZ1bmN0aW9uIHBvdzJhcnJheShpLCBqKSB7XG4gICAgdGhpc1tpXVtqXSA9IHRoaXNbaV1bal0gKiB0aGlzW2ldW2pdO1xuICAgIHJldHVybiB0aGlzO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgbm9ybWFsaXplIHRoZSBkYXRhc2V0IGFuZCByZXR1cm4gdGhlIG1lYW5zIGFuZFxuICogc3RhbmRhcmQgZGV2aWF0aW9uIG9mIGVhY2ggZmVhdHVyZS5cbiAqIEBwYXJhbSBkYXRhc2V0XG4gKiBAcmV0dXJucyB7e3Jlc3VsdDogTWF0cml4LCBtZWFuczogKCp8bnVtYmVyKSwgc3RkOiBNYXRyaXh9fSBkYXRhc2V0IG5vcm1hbGl6ZWQsIG1lYW5zXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmQgc3RhbmRhcmQgZGV2aWF0aW9uc1xuICovXG5mdW5jdGlvbiBmZWF0dXJlTm9ybWFsaXplKGRhdGFzZXQpIHtcbiAgICB2YXIgbWVhbnMgPSBTdGF0Lm1hdHJpeC5tZWFuKGRhdGFzZXQpO1xuICAgIHZhciBzdGQgPSBNYXRyaXgucm93VmVjdG9yKFN0YXQubWF0cml4LnN0YW5kYXJkRGV2aWF0aW9uKGRhdGFzZXQsIG1lYW5zLCB0cnVlKSk7XG4gICAgbWVhbnMgPSBNYXRyaXgucm93VmVjdG9yKG1lYW5zKTtcblxuICAgIHZhciByZXN1bHQgPSBkYXRhc2V0LmFkZFJvd1ZlY3RvcihtZWFucy5uZWcoKSk7XG4gICAgcmV0dXJuIHtyZXN1bHQ6IHJlc3VsdC5kaXZSb3dWZWN0b3Ioc3RkKSwgbWVhbnM6IG1lYW5zLCBzdGQ6IHN0ZH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIG5vcm06IG5vcm0sXG4gICAgcG93MmFycmF5OiBwb3cyYXJyYXksXG4gICAgZmVhdHVyZU5vcm1hbGl6ZTogZmVhdHVyZU5vcm1hbGl6ZVxufTtcblxuIiwiLyohXG4gKiBuZ0NvcmRvdmFcbiAqIHYwLjEuMjMtYWxwaGFcbiAqIENvcHlyaWdodCAyMDE1IERyaWZ0eSBDby4gaHR0cDovL2RyaWZ0eS5jb20vXG4gKiBTZWUgTElDRU5TRSBpbiB0aGlzIHJlcG9zaXRvcnkgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb25cbiAqL1xuKGZ1bmN0aW9uKCl7XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEnLCBbXG4gICduZ0NvcmRvdmEucGx1Z2lucydcbl0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL2NvcmRvdmEtcGx1Z2luLWFjdGlvbnNoZWV0LmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL2NvcmRvdmEtcGx1Z2luLWFjdGlvbnNoZWV0XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5hY3Rpb25TaGVldCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUFjdGlvblNoZWV0JywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hvdzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5hY3Rpb25zaGVldC5zaG93KG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2lucy5hY3Rpb25zaGVldC5oaWRlKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWFkbW9iLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWFkbW9iXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5hZE1vYicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUFkTW9iJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY3JlYXRlQmFubmVyVmlldzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5BZE1vYi5jcmVhdGVCYW5uZXJWaWV3KG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVJbnRlcnN0aXRpYWxWaWV3OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLkFkTW9iLmNyZWF0ZUludGVyc3RpdGlhbFZpZXcob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlcXVlc3RBZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5BZE1vYi5yZXF1ZXN0QWQob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dBZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5BZE1vYi5zaG93QWQob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlcXVlc3RJbnRlcnN0aXRpYWxBZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5BZE1vYi5yZXF1ZXN0SW50ZXJzdGl0aWFsQWQob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vb2hoMmFoaC9BcHBBdmFpbGFiaWxpdHkuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vb2hoMmFoaC9BcHBBdmFpbGFiaWxpdHlcblxuLyogZ2xvYmFscyBhcHBBdmFpbGFiaWxpdHk6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5hcHBBdmFpbGFiaWxpdHknLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFBcHBBdmFpbGFiaWxpdHknLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY2hlY2s6IGZ1bmN0aW9uICh1cmxTY2hlbWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGFwcEF2YWlsYWJpbGl0eS5jaGVjayh1cmxTY2hlbWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3B1c2hhbmRwbGF5L2NvcmRvdmEtcGx1Z2luLWFwcHJhdGUuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vcHVzaGFuZHBsYXkvY29yZG92YS1wbHVnaW4tYXBwcmF0ZVxuXG4vKiBnbG9iYWxzIEFwcFJhdGU6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5hcHBSYXRlJywgW10pXG5cbiAgLnByb3ZpZGVyKCckY29yZG92YUFwcFJhdGUnLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgLyoqXG4gICAgICAqIFNldCBkZWZhdWx0cyBzZXR0aW5ncyB0byBBcHBSYXRlXG4gICAgICAqXG4gICAgICAqIEBwYXJhbSB7T2JqZWN0fSBkZWZhdWx0cyAtIEFwcFJhdGUgZGVmYXVsdCBzZXR0aW5nc1xuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMubGFuZ3VhZ2VcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLmFwcE5hbWVcbiAgICAgICogQHBhcmFtIHtib29sZWFufSBkZWZhdWx0cy5wcm9tcHRGb3JOZXdWZXJzaW9uXG4gICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZGVmYXVsdHMub3BlblN0b3JlSW5BcHBcbiAgICAgICogQHBhcmFtIHtudW1iZXJ9IGRlZmF1bHRzLnVzZXNVbnRpbFByb21wdFxuICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGRlZmF1bHRzLnVzZUN1c3RvbVJhdGVEaWFsb2dcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGRlZmF1bHRzLmlvc1VSTFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMuYW5kcm9pZFVSTFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMuYmxhY2tiZXJyeVVSTFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMud2luZG93c1VSTFxuICAgICAgKi9cbiAgICB0aGlzLnNldFByZWZlcmVuY2VzID0gZnVuY3Rpb24gKGRlZmF1bHRzKSB7XG4gICAgICBpZiAoIWRlZmF1bHRzIHx8ICFhbmd1bGFyLmlzT2JqZWN0KGRlZmF1bHRzKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMudXNlTGFuZ3VhZ2UgPSBkZWZhdWx0cy5sYW5ndWFnZSB8fCBudWxsO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5kaXNwbGF5QXBwTmFtZSA9IGRlZmF1bHRzLmFwcE5hbWUgfHwgJyc7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnByb21wdEFnYWluRm9yRWFjaE5ld1ZlcnNpb24gPSBkZWZhdWx0cy5wcm9tcHRGb3JOZXdWZXJzaW9uIHx8IHRydWU7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLm9wZW5TdG9yZUluQXBwID0gZGVmYXVsdHMub3BlblN0b3JlSW5BcHAgfHwgZmFsc2U7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnVzZXNVbnRpbFByb21wdCA9IGRlZmF1bHRzLnVzZXNVbnRpbFByb21wdCB8fCAzO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy51c2VDdXN0b21SYXRlRGlhbG9nID0gZGVmYXVsdHMudXNlQ3VzdG9tUmF0ZURpYWxvZyB8fCBmYWxzZTtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuc3RvcmVBcHBVUkwuaW9zID0gZGVmYXVsdHMuaW9zVVJMIHx8IG51bGw7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnN0b3JlQXBwVVJMLmFuZHJvaWQgPSBkZWZhdWx0cy5hbmRyb2lkVVJMIHx8IG51bGw7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnN0b3JlQXBwVVJMLmJsYWNrYmVycnkgPSBkZWZhdWx0cy5ibGFja2JlcnJ5VVJMIHx8IG51bGw7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnN0b3JlQXBwVVJMLndpbmRvd3M4ID0gZGVmYXVsdHMud2luZG93c1VSTCB8fCBudWxsO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgICogU2V0IGN1c3RvbSBsb2NhbGVcbiAgICAgICpcbiAgICAgICogQHBhcmFtIHtPYmplY3R9IGN1c3RvbU9ialxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY3VzdG9tT2JqLnRpdGxlXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjdXN0b21PYmouY2FuY2VsQnV0dG9uTGFiZWxcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGN1c3RvbU9iai5sYXRlckJ1dHRvbkxhYmVsXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjdXN0b21PYmoucmF0ZUJ1dHRvbkxhYmVsXG4gICAgICAqL1xuICAgIHRoaXMuc2V0Q3VzdG9tTG9jYWxlID0gZnVuY3Rpb24gKGN1c3RvbU9iaikge1xuICAgICAgdmFyIHN0cmluZ3MgPSB7XG4gICAgICAgIHRpdGxlOiAnUmF0ZSAlQCcsXG4gICAgICAgIG1lc3NhZ2U6ICdJZiB5b3UgZW5qb3kgdXNpbmcgJUAsIHdvdWxkIHlvdSBtaW5kIHRha2luZyBhIG1vbWVudCB0byByYXRlIGl0PyBJdCB3b27igJl0IHRha2UgbW9yZSB0aGFuIGEgbWludXRlLiBUaGFua3MgZm9yIHlvdXIgc3VwcG9ydCEnLFxuICAgICAgICBjYW5jZWxCdXR0b25MYWJlbDogJ05vLCBUaGFua3MnLFxuICAgICAgICBsYXRlckJ1dHRvbkxhYmVsOiAnUmVtaW5kIE1lIExhdGVyJyxcbiAgICAgICAgcmF0ZUJ1dHRvbkxhYmVsOiAnUmF0ZSBJdCBOb3cnXG4gICAgICB9O1xuXG4gICAgICBzdHJpbmdzID0gYW5ndWxhci5leHRlbmQoc3RyaW5ncywgY3VzdG9tT2JqKTtcblxuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5jdXN0b21Mb2NhbGUgPSBzdHJpbmdzO1xuICAgIH07XG5cbiAgICB0aGlzLiRnZXQgPSBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwcm9tcHRGb3JSYXRpbmc6IGZ1bmN0aW9uIChpbW1lZGlhdGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgdmFyIHByb21wdCA9IEFwcFJhdGUucHJvbXB0Rm9yUmF0aW5nKGltbWVkaWF0ZSk7XG4gICAgICAgICAgcS5yZXNvbHZlKHByb21wdCk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIG5hdmlnYXRlVG9BcHBTdG9yZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICB2YXIgbmF2aWdhdGUgPSBBcHBSYXRlLm5hdmlnYXRlVG9BcHBTdG9yZSgpO1xuICAgICAgICAgIHEucmVzb2x2ZShuYXZpZ2F0ZSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIG9uQnV0dG9uQ2xpY2tlZDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgQXBwUmF0ZS5vbkJ1dHRvbkNsaWNrZWQgPSBmdW5jdGlvbiAoYnV0dG9uSW5kZXgpIHtcbiAgICAgICAgICAgIGNiLmNhbGwodGhpcywgYnV0dG9uSW5kZXgpO1xuICAgICAgICAgIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgb25SYXRlRGlhbG9nU2hvdzogZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgQXBwUmF0ZS5vblJhdGVEaWFsb2dTaG93ID0gY2IoKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS93aGl0ZW9jdG9iZXIvY29yZG92YS1wbHVnaW4tYXBwLXZlcnNpb24uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL3doaXRlb2N0b2Jlci9jb3Jkb3ZhLXBsdWdpbi1hcHAtdmVyc2lvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwVmVyc2lvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUFwcFZlcnNpb24nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0QXBwTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEuZ2V0QXBwVmVyc2lvbi5nZXRBcHBOYW1lKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG5hbWUpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0UGFja2FnZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLmdldEFwcFZlcnNpb24uZ2V0UGFja2FnZU5hbWUoZnVuY3Rpb24gKHBhY2thZ2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocGFja2FnZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRWZXJzaW9uTnVtYmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5nZXRBcHBWZXJzaW9uLmdldFZlcnNpb25OdW1iZXIoZnVuY3Rpb24gKHZlcnNpb24pIHtcbiAgICAgICAgICBxLnJlc29sdmUodmVyc2lvbik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRWZXJzaW9uQ29kZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEuZ2V0QXBwVmVyc2lvbi5nZXRWZXJzaW9uQ29kZShmdW5jdGlvbiAoY29kZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShjb2RlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2NocmlzdG9jcmFjeS9jb3Jkb3ZhLXBsdWdpbi1iYWNrZ3JvdW5kLWdlb2xvY2F0aW9uLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9jaHJpc3RvY3JhY3kvY29yZG92YS1wbHVnaW4tYmFja2dyb3VuZC1nZW9sb2NhdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFja2dyb3VuZEdlb2xvY2F0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmFja2dyb3VuZEdlb2xvY2F0aW9uJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuXG4gICAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR3aW5kb3cubmF2aWdhdG9yLmdlb2xvY2F0aW9uLmdldEN1cnJlbnRQb3NpdGlvbihmdW5jdGlvbiAobG9jYXRpb24pIHtcbiAgICAgICAgICByZXR1cm4gbG9jYXRpb247XG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgY29uZmlndXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuXG4gICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmJhY2tncm91bmRHZW9Mb2NhdGlvbi5jb25maWd1cmUoXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgICAgICR3aW5kb3cucGx1Z2lucy5iYWNrZ3JvdW5kR2VvTG9jYXRpb24uZmluaXNoKCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHRoaXMuc3RhcnQoKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RhcnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5iYWNrZ3JvdW5kR2VvTG9jYXRpb24uc3RhcnQoXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuYmFja2dyb3VuZEdlb0xvY2F0aW9uLnN0b3AoXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIF0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1iYWRnZS5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tYmFkZ2VcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJhZGdlJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmFkZ2UnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaGFzUGVybWlzc2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuaGFzUGVybWlzc2lvbihmdW5jdGlvbiAocGVybWlzc2lvbikge1xuICAgICAgICAgIGlmIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbicpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByb21wdEZvclBlcm1pc3Npb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UucHJvbXB0Rm9yUGVybWlzc2lvbigpO1xuICAgICAgfSxcblxuICAgICAgc2V0OiBmdW5jdGlvbiAoYmFkZ2UsIGNhbGxiYWNrLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5oYXNQZXJtaXNzaW9uKGZ1bmN0aW9uIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgaWYgKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShcbiAgICAgICAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5zZXQoYmFkZ2UsIGNhbGxiYWNrLCBzY29wZSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byBzZXQgQmFkZ2UnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5oYXNQZXJtaXNzaW9uKGZ1bmN0aW9uIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgaWYgKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuZ2V0KGZ1bmN0aW9uIChiYWRnZSkge1xuICAgICAgICAgICAgICBxLnJlc29sdmUoYmFkZ2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byBnZXQgQmFkZ2UnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcjogZnVuY3Rpb24gKGNhbGxiYWNrLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5oYXNQZXJtaXNzaW9uKGZ1bmN0aW9uIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgaWYgKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmNsZWFyKGNhbGxiYWNrLCBzY29wZSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gY2xlYXIgQmFkZ2UnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaW5jcmVhc2U6IGZ1bmN0aW9uIChjb3VudCwgY2FsbGJhY2ssIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICB0aGlzLmhhc1Blcm1pc3Npb24oKS50aGVuKGZ1bmN0aW9uICgpe1xuICAgICAgICAgIHEucmVzb2x2ZShcbiAgICAgICAgICAgIGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuaW5jcmVhc2UoY291bnQsIGNhbGxiYWNrLCBzY29wZSlcbiAgICAgICAgICApO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKXtcbiAgICAgICAgICBxLnJlamVjdCgnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gaW5jcmVhc2UgQmFkZ2UnKTtcbiAgICAgICAgfSkgO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkZWNyZWFzZTogZnVuY3Rpb24gKGNvdW50LCBjYWxsYmFjaywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHRoaXMuaGFzUGVybWlzc2lvbigpLnRoZW4oZnVuY3Rpb24gKCl7XG4gICAgICAgICAgcS5yZXNvbHZlKFxuICAgICAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5kZWNyZWFzZShjb3VudCwgY2FsbGJhY2ssIHNjb3BlKVxuICAgICAgICAgICk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpe1xuICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byBkZWNyZWFzZSBCYWRnZScpO1xuICAgICAgICB9KSA7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNvbmZpZ3VyZTogZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5jb25maWd1cmUoY29uZmlnKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC9waG9uZWdhcC1wbHVnaW4tYmFyY29kZXNjYW5uZXIuZ2l0XG4vLyBsaW5rICAgICA6ICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC9waG9uZWdhcC1wbHVnaW4tYmFyY29kZXNjYW5uZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJhcmNvZGVTY2FubmVyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmFyY29kZVNjYW5uZXInLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2NhbjogZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmJhcmNvZGVTY2FubmVyLnNjYW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgY29uZmlnKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZW5jb2RlOiBmdW5jdGlvbiAodHlwZSwgZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHR5cGUgPSB0eXBlIHx8ICdURVhUX1RZUEUnO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5iYXJjb2RlU2Nhbm5lci5lbmNvZGUodHlwZSwgZGF0YSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vICBpbnN0YWxsICAgOiAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1iYXR0ZXJ5LXN0YXR1c1xuLy8gIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1iYXR0ZXJ5LXN0YXR1c1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmF0dGVyeVN0YXR1cycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUJhdHRlcnlTdGF0dXMnLCBbJyRyb290U2NvcGUnLCAnJHdpbmRvdycsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkd2luZG93LCAkdGltZW91dCkge1xuXG4gICAgLyoqXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXNcbiAgICAgICovXG4gICAgdmFyIGJhdHRlcnlTdGF0dXMgPSBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCYXR0ZXJ5U3RhdHVzOnN0YXR1cycsIHN0YXR1cyk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXNcbiAgICAgICovXG4gICAgdmFyIGJhdHRlcnlDcml0aWNhbCA9IGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJhdHRlcnlTdGF0dXM6Y3JpdGljYWwnLCBzdGF0dXMpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RhdHVzXG4gICAgICAqL1xuICAgIHZhciBiYXR0ZXJ5TG93ID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmF0dGVyeVN0YXR1czpsb3cnLCBzdGF0dXMpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKG5hdmlnYXRvci5iYXR0ZXJ5KSB7XG4gICAgICAgICR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmF0dGVyeXN0YXR1cycsIGJhdHRlcnlTdGF0dXMsIGZhbHNlKTtcbiAgICAgICAgJHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiYXR0ZXJ5Y3JpdGljYWwnLCBiYXR0ZXJ5Q3JpdGljYWwsIGZhbHNlKTtcbiAgICAgICAgJHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiYXR0ZXJ5bG93JywgYmF0dGVyeUxvdywgZmFsc2UpO1xuXG4gICAgICB9XG4gICAgfSwgZmFsc2UpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XSlcbiAgLnJ1bihbJyRpbmplY3RvcicsIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAkaW5qZWN0b3IuZ2V0KCckY29yZG92YUJhdHRlcnlTdGF0dXMnKTsgLy9lbnN1cmUgdGhlIGZhY3RvcnkgYW5kIHN1YnNlcXVlbnQgZXZlbnQgbGlzdGVuZXJzIGdldCBpbml0aWFsaXNlZFxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3BldGVybWV0ei9jb3Jkb3ZhLXBsdWdpbi1pYmVhY29uLmdpdFxuLy8gbGluayAgICAgIDogIGh0dHBzOi8vZ2l0aHViLmNvbS9wZXRlcm1ldHovY29yZG92YS1wbHVnaW4taWJlYWNvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmVhY29uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmVhY29uJywgWyckd2luZG93JywgJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCAnJHEnLCBmdW5jdGlvbiAoJHdpbmRvdywgJHJvb3RTY29wZSwgJHRpbWVvdXQsICRxKSB7XG4gICAgdmFyIGNhbGxiYWNrRGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24gPSBudWxsO1xuICAgIHZhciBjYWxsYmFja0RpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbiA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrRGlkRXhpdFJlZ2lvbiA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrRGlkRW50ZXJSZWdpb24gPSBudWxsO1xuICAgIHZhciBjYWxsYmFja0RpZFJhbmdlQmVhY29uc0luUmVnaW9uID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcgPSBudWxsO1xuICAgIHZhciBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUgPSBudWxsO1xuICAgIHZhciBjYWxsYmFja0RpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMgPSBudWxsO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoJHdpbmRvdy5jb3Jkb3ZhICYmXG4gICAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMgJiZcbiAgICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIpIHtcbiAgICAgICAgdmFyIGRlbGVnYXRlID0gbmV3ICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5EZWxlZ2F0ZSgpO1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZERldGVybWluZVN0YXRlRm9yUmVnaW9uID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24nLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24ocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbikge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24ocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkRXhpdFJlZ2lvbiA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZEV4aXRSZWdpb24nLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkRXhpdFJlZ2lvbikge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWRFeGl0UmVnaW9uKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLmRpZEVudGVyUmVnaW9uID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkRW50ZXJSZWdpb24nLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkRW50ZXJSZWdpb24pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrRGlkRW50ZXJSZWdpb24ocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkUmFuZ2VCZWFjb25zSW5SZWdpb24gPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWRSYW5nZUJlYWNvbnNJblJlZ2lvbicsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWRSYW5nZUJlYWNvbnNJblJlZ2lvbikge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWRSYW5nZUJlYWNvbnNJblJlZ2lvbihwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5wZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcgPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpwZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcnLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nKSB7XG4gICAgICAgICAgICBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZyhwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5wZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246cGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZScsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlKSB7XG4gICAgICAgICAgICBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cyA9IGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMnLCBzdGF0dXMpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cykge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzKHN0YXR1cyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zZXREZWxlZ2F0ZShkZWxlZ2F0ZSk7XG4gICAgICB9XG4gICAgfSwgZmFsc2UpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldENhbGxiYWNrRGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb246IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZERldGVybWluZVN0YXRlRm9yUmVnaW9uID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tEaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb246IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbiA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrRGlkRXhpdFJlZ2lvbjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkRXhpdFJlZ2lvbiA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrRGlkRW50ZXJSZWdpb246IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZEVudGVyUmVnaW9uID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tEaWRSYW5nZUJlYWNvbnNJblJlZ2lvbjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkUmFuZ2VCZWFjb25zSW5SZWdpb24gPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZzogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tEaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgY3JlYXRlQmVhY29uUmVnaW9uOiBmdW5jdGlvbiAoaWRlbnRpZmllciwgdXVpZCwgbWFqb3IsIG1pbm9yLCBub3RpZnlFbnRyeVN0YXRlT25EaXNwbGF5KSB7XG4gICAgICAgIG1ham9yID0gbWFqb3IgfHwgdW5kZWZpbmVkO1xuICAgICAgICBtaW5vciA9IG1pbm9yIHx8IHVuZGVmaW5lZDtcblxuICAgICAgICByZXR1cm4gbmV3ICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5CZWFjb25SZWdpb24oXG4gICAgICAgICAgaWRlbnRpZmllcixcbiAgICAgICAgICB1dWlkLFxuICAgICAgICAgIG1ham9yLFxuICAgICAgICAgIG1pbm9yLFxuICAgICAgICAgIG5vdGlmeUVudHJ5U3RhdGVPbkRpc3BsYXlcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgICBpc0JsdWV0b290aEVuYWJsZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmlzQmx1ZXRvb3RoRW5hYmxlZCgpKTtcbiAgICAgIH0sXG4gICAgICBlbmFibGVCbHVldG9vdGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmVuYWJsZUJsdWV0b290aCgpKTtcbiAgICAgIH0sXG4gICAgICBkaXNhYmxlQmx1ZXRvb3RoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5kaXNhYmxlQmx1ZXRvb3RoKCkpO1xuICAgICAgfSxcbiAgICAgIHN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbjogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIHN0b3BNb25pdG9yaW5nRm9yUmVnaW9uOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdG9wTW9uaXRvcmluZ0ZvclJlZ2lvbihyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICByZXF1ZXN0U3RhdGVGb3JSZWdpb246IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnJlcXVlc3RTdGF0ZUZvclJlZ2lvbihyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICBzdGFydFJhbmdpbmdCZWFjb25zSW5SZWdpb246IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0YXJ0UmFuZ2luZ0JlYWNvbnNJblJlZ2lvbihyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICBzdG9wUmFuZ2luZ0JlYWNvbnNJblJlZ2lvbjogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RvcFJhbmdpbmdCZWFjb25zSW5SZWdpb24ocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgZ2V0QXV0aG9yaXphdGlvblN0YXR1czogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZ2V0QXV0aG9yaXphdGlvblN0YXR1cygpKTtcbiAgICAgIH0sXG4gICAgICByZXF1ZXN0V2hlbkluVXNlQXV0aG9yaXphdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIucmVxdWVzdFdoZW5JblVzZUF1dGhvcml6YXRpb24oKSk7XG4gICAgICB9LFxuICAgICAgcmVxdWVzdEFsd2F5c0F1dGhvcml6YXRpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnJlcXVlc3RBbHdheXNBdXRob3JpemF0aW9uKCkpO1xuICAgICAgfSxcbiAgICAgIGdldE1vbml0b3JlZFJlZ2lvbnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmdldE1vbml0b3JlZFJlZ2lvbnMoKSk7XG4gICAgICB9LFxuICAgICAgZ2V0UmFuZ2VkUmVnaW9uczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZ2V0UmFuZ2VkUmVnaW9ucygpKTtcbiAgICAgIH0sXG4gICAgICBpc1JhbmdpbmdBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmlzUmFuZ2luZ0F2YWlsYWJsZSgpKTtcbiAgICAgIH0sXG4gICAgICBpc01vbml0b3JpbmdBdmFpbGFibGVGb3JDbGFzczogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuaXNNb25pdG9yaW5nQXZhaWxhYmxlRm9yQ2xhc3MocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgc3RhcnRBZHZlcnRpc2luZzogZnVuY3Rpb24gKHJlZ2lvbiwgbWVhc3VyZWRQb3dlcikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RhcnRBZHZlcnRpc2luZyhyZWdpb24sIG1lYXN1cmVkUG93ZXIpKTtcbiAgICAgIH0sXG4gICAgICBzdG9wQWR2ZXJ0aXNpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0b3BBZHZlcnRpc2luZygpKTtcbiAgICAgIH0sXG4gICAgICBpc0FkdmVydGlzaW5nQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5pc0FkdmVydGlzaW5nQXZhaWxhYmxlKCkpO1xuICAgICAgfSxcbiAgICAgIGlzQWR2ZXJ0aXNpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmlzQWR2ZXJ0aXNpbmcoKSk7XG4gICAgICB9LFxuICAgICAgZGlzYWJsZURlYnVnTG9nczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZGlzYWJsZURlYnVnTG9ncygpKTtcbiAgICAgIH0sXG4gICAgICBlbmFibGVEZWJ1Z05vdGlmaWNhdGlvbnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmVuYWJsZURlYnVnTm90aWZpY2F0aW9ucygpKTtcbiAgICAgIH0sXG4gICAgICBkaXNhYmxlRGVidWdOb3RpZmljYXRpb25zOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5kaXNhYmxlRGVidWdOb3RpZmljYXRpb25zKCkpO1xuICAgICAgfSxcbiAgICAgIGVuYWJsZURlYnVnTG9nczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZW5hYmxlRGVidWdMb2dzKCkpO1xuICAgICAgfSxcbiAgICAgIGFwcGVuZFRvRGV2aWNlTG9nOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuYXBwZW5kVG9EZXZpY2VMb2cobWVzc2FnZSkpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gIGluc3RhbGwgICA6ICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9kb24vY29yZG92YS1wbHVnaW4tYmxlLWNlbnRyYWwuZ2l0XG4vLyAgbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vZG9uL2NvcmRvdmEtcGx1Z2luLWJsZS1jZW50cmFsXG5cbi8qIGdsb2JhbHMgYmxlOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmxlJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQkxFJywgWyckcScsICckdGltZW91dCcsICckbG9nJywgZnVuY3Rpb24gKCRxLCAkdGltZW91dCwgJGxvZykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNjYW46IGZ1bmN0aW9uIChzZXJ2aWNlcywgc2Vjb25kcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgYmxlLnN0YXJ0U2NhbihzZXJ2aWNlcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYmxlLnN0b3BTY2FuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHNlY29uZHMqMTAwMCk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0YXJ0U2NhbjogZnVuY3Rpb24gKHNlcnZpY2VzLCBjYWxsYmFjaywgZXJyb3JDYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gYmxlLnN0YXJ0U2NhbihzZXJ2aWNlcywgY2FsbGJhY2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgfSxcblxuICAgICAgc3RvcFNjYW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuc3RvcFNjYW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY29ubmVjdDogZnVuY3Rpb24gKGRldmljZUlEKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLmNvbm5lY3QoZGV2aWNlSUQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uIChkZXZpY2VJRCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5kaXNjb25uZWN0KGRldmljZUlELCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUucmVhZChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd3JpdGU6IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS53cml0ZShkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd3JpdGVXaXRob3V0UmVzcG9uc2U6IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS53cml0ZVdpdGhvdXRSZXNwb25zZShkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd3JpdGVDb21tYW5kOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEpIHtcbiAgICAgICAgJGxvZy53YXJuaW5nKCd3cml0ZUNvbW1hbmQgaXMgZGVwcmVjYXRlZCwgdXNlIHdyaXRlV2l0aG91dFJlc3BvbnNlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLndyaXRlV2l0aG91dFJlc3BvbnNlKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhKTtcbiAgICAgIH0sXG5cbiAgICAgIHN0YXJ0Tm90aWZpY2F0aW9uOiBmdW5jdGlvbiAoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGNhbGxiYWNrLCBlcnJvckNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBibGUuc3RhcnROb3RpZmljYXRpb24oZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGNhbGxiYWNrLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgIH0sXG5cbiAgICAgIHN0b3BOb3RpZmljYXRpb246IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5zdG9wTm90aWZpY2F0aW9uKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc0Nvbm5lY3RlZDogZnVuY3Rpb24gKGRldmljZUlEKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLmlzQ29ubmVjdGVkKGRldmljZUlELCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBlbmFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuZW5hYmxlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzRW5hYmxlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5pc0VuYWJsZWQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZG9uL0JsdWV0b290aFNlcmlhbC5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZG9uL0JsdWV0b290aFNlcmlhbFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmx1ZXRvb3RoU2VyaWFsJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmx1ZXRvb3RoU2VyaWFsJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY29ubmVjdDogZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZGlzY29ubmVjdGlvblByb21pc2UgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuY29ubmVjdChhZGRyZXNzLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgaXNDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICAgIHEucmVzb2x2ZShkaXNjb25uZWN0aW9uUHJvbWlzZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGlmKGlzQ29ubmVjdGVkID09PSBmYWxzZSkge1xuICAgICAgICAgICAgZGlzY29ubmVjdGlvblByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgb24gaU9TXG4gICAgICBjb25uZWN0SW5zZWN1cmU6IGZ1bmN0aW9uIChhZGRyZXNzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuY29ubmVjdEluc2VjdXJlKGFkZHJlc3MsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5kaXNjb25uZWN0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGxpc3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5saXN0KGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGlzY292ZXJVbnBhaXJlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmRpc2NvdmVyVW5wYWlyZWQoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXREZXZpY2VEaXNjb3ZlcmVkTGlzdGVuZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5zZXREZXZpY2VEaXNjb3ZlcmVkTGlzdGVuZXIoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLm5vdGlmeShkYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhckRldmljZURpc2NvdmVyZWRMaXN0ZW5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5jbGVhckRldmljZURpc2NvdmVyZWRMaXN0ZW5lcigpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0JsdWV0b290aFNldHRpbmdzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuc2hvd0JsdWV0b290aFNldHRpbmdzKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzRW5hYmxlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmlzRW5hYmxlZChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGVuYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmVuYWJsZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzQ29ubmVjdGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuaXNDb25uZWN0ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5hdmFpbGFibGUoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwucmVhZChmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWRVbnRpbDogZnVuY3Rpb24gKGRlbGltaXRlcikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnJlYWRVbnRpbChkZWxpbWl0ZXIsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd3JpdGU6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwud3JpdGUoZGF0YSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3Vic2NyaWJlOiBmdW5jdGlvbiAoZGVsaW1pdGVyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuc3Vic2NyaWJlKGRlbGltaXRlciwgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLm5vdGlmeShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN1YnNjcmliZVJhd0RhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5zdWJzY3JpYmVSYXdEYXRhKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5ub3RpZnkoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bnN1YnNjcmliZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnVuc3Vic2NyaWJlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVuc3Vic2NyaWJlUmF3RGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnVuc3Vic2NyaWJlUmF3RGF0YShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmNsZWFyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWRSU1NJOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwucmVhZFJTU0koZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmlzY2FsLWNsaWZmL3Bob25lZ2FwLXBsdWdpbi1icmlnaHRuZXNzLmdpdFxuLy8gbGluayAgICAgOiAgICBodHRwczovL2dpdGh1Yi5jb20vZmlzY2FsLWNsaWZmL3Bob25lZ2FwLXBsdWdpbi1icmlnaHRuZXNzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5icmlnaHRuZXNzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQnJpZ2h0bmVzcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93LmNvcmRvdmEpIHtcbiAgICAgICAgICBxLnJlamVjdCgnTm90IHN1cHBvcnRlZCB3aXRob3V0IGNvcmRvdmEuanMnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5icmlnaHRuZXNzLmdldEJyaWdodG5lc3MoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXQ6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cuY29yZG92YSkge1xuICAgICAgICAgIHEucmVqZWN0KCdOb3Qgc3VwcG9ydGVkIHdpdGhvdXQgY29yZG92YS5qcycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmJyaWdodG5lc3Muc2V0QnJpZ2h0bmVzcyhkYXRhLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldEtlZXBTY3JlZW5PbjogZnVuY3Rpb24gKGJvb2wpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5jb3Jkb3ZhKSB7XG4gICAgICAgICAgcS5yZWplY3QoJ05vdCBzdXBwb3J0ZWQgd2l0aG91dCBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMuYnJpZ2h0bmVzcy5zZXRLZWVwU2NyZWVuT24oYm9vbCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vQ2FsZW5kYXItUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0NhbGVuZGFyLVBob25lR2FwLVBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FsZW5kYXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFDYWxlbmRhcicsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBjcmVhdGVDYWxlbmRhcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGNyZWF0ZUNhbE9wdGlvbnMgPSAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZ2V0Q3JlYXRlQ2FsZW5kYXJPcHRpb25zKCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGNyZWF0ZUNhbE9wdGlvbnMuY2FsZW5kYXJOYW1lID0gb3B0aW9ucztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjcmVhdGVDYWxPcHRpb25zID0gYW5ndWxhci5leHRlbmQoY3JlYXRlQ2FsT3B0aW9ucywgb3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuY3JlYXRlQ2FsZW5kYXIoY3JlYXRlQ2FsT3B0aW9ucywgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRlbGV0ZUNhbGVuZGFyOiBmdW5jdGlvbiAoY2FsZW5kYXJOYW1lKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZGVsZXRlQ2FsZW5kYXIoY2FsZW5kYXJOYW1lLCBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlRXZlbnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5jcmVhdGVFdmVudChcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVFdmVudFdpdGhPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbktleXMgPSBbXSxcbiAgICAgICAgICBjYWxPcHRpb25zID0gd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZ2V0Q2FsZW5kYXJPcHRpb25zKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9uS2V5cyA9IE9iamVjdC5rZXlzKGRlZmF1bHRPcHRpb25zKTtcblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gb3B0aW9ucykge1xuICAgICAgICAgIGlmIChkZWZhdWx0T3B0aW9uS2V5cy5pbmRleE9mKGtleSkgPT09IC0xKSB7XG4gICAgICAgICAgICBjYWxPcHRpb25zW2tleV0gPSBvcHRpb25zW2tleV07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlZmF1bHRPcHRpb25zW2tleV0gPSBvcHRpb25zW2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmNyZWF0ZUV2ZW50V2l0aE9wdGlvbnMoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBjYWxPcHRpb25zLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVFdmVudEludGVyYWN0aXZlbHk6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5jcmVhdGVFdmVudEludGVyYWN0aXZlbHkoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlRXZlbnRJbk5hbWVkQ2FsZW5kYXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGwsXG4gICAgICAgICAgICBjYWxlbmRhck5hbWU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5jcmVhdGVFdmVudEluTmFtZWRDYWxlbmRhcihcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmNhbGVuZGFyTmFtZSxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZmluZEV2ZW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZmluZEV2ZW50KFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZnVuY3Rpb24gKGZvdW5kRXZlbnQpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShmb3VuZEV2ZW50KTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGxpc3RFdmVudHNJblJhbmdlOiBmdW5jdGlvbiAoc3RhcnREYXRlLCBlbmREYXRlKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIubGlzdEV2ZW50c0luUmFuZ2Uoc3RhcnREYXRlLCBlbmREYXRlLCBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKGV2ZW50cyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGxpc3RDYWxlbmRhcnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5saXN0Q2FsZW5kYXJzKGZ1bmN0aW9uIChjYWxlbmRhcnMpIHtcbiAgICAgICAgICBkLnJlc29sdmUoY2FsZW5kYXJzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZmluZEFsbEV2ZW50c0luTmFtZWRDYWxlbmRhcjogZnVuY3Rpb24gKGNhbGVuZGFyTmFtZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmZpbmRBbGxFdmVudHNJbk5hbWVkQ2FsZW5kYXIoY2FsZW5kYXJOYW1lLCBmdW5jdGlvbiAoZXZlbnRzKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKGV2ZW50cyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIG1vZGlmeUV2ZW50OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICB0aXRsZTogbnVsbCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbm90ZXM6IG51bGwsXG4gICAgICAgICAgICBzdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBlbmREYXRlOiBudWxsLFxuICAgICAgICAgICAgbmV3VGl0bGU6IG51bGwsXG4gICAgICAgICAgICBuZXdMb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5ld05vdGVzOiBudWxsLFxuICAgICAgICAgICAgbmV3U3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgbmV3RW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLm1vZGlmeUV2ZW50KFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubmV3VGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubmV3TG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubmV3Tm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMubmV3U3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5uZXdFbmREYXRlKSxcbiAgICAgICAgICBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGVsZXRlRXZlbnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIG5ld1RpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5kZWxldGVFdmVudChcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5uZXdUaXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1jYW1lcmFcbi8vIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1jYW1lcmFcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmNhbWVyYScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUNhbWVyYScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRQaWN0dXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuY2FtZXJhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuY2FtZXJhLmdldFBpY3R1cmUoZnVuY3Rpb24gKGltYWdlRGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShpbWFnZURhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFudXA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5jYW1lcmEuY2xlYW51cChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLW1lZGlhLWNhcHR1cmVcbi8vIGxpbmsgICAgICA6ICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tbWVkaWEtY2FwdHVyZVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FwdHVyZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUNhcHR1cmUnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY2FwdHVyZUF1ZGlvOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUpIHtcbiAgICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZS5jYXB0dXJlQXVkaW8oZnVuY3Rpb24gKGF1ZGlvRGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShhdWRpb0RhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBjYXB0dXJlSW1hZ2U6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoIW5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlLmNhcHR1cmVJbWFnZShmdW5jdGlvbiAoaW1hZ2VEYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGltYWdlRGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIGNhcHR1cmVWaWRlbzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUuY2FwdHVyZVZpZGVvKGZ1bmN0aW9uICh2aWRlb0RhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUodmlkZW9EYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsIDogY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS92a2VlcGUvY2FyZC5pby5naXRcbi8vIGxpbmsgICAgOiBodHRwczovL2dpdGh1Yi5jb20vdmtlZXBlL2NhcmQuaW8uZ2l0XG5cbi8qIGdsb2JhbHMgQ2FyZElPOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FyZElPJywgW10pXG5cbiAgLnByb3ZpZGVyKFxuICAnJGNvcmRvdmFOZ0NhcmRJTycsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICAvKipcbiAgICAgKiBEZWZhdWx0IGFycmF5IG9mIHJlc3BvbnNlIGRhdGEgZnJvbSBjYXJkSU8gc2NhbiBjYXJkXG4gICAgICovXG4gICAgdmFyIGRlZmF1bHRSZXNwRmllbGRzID0gW1xuICAgICAgJ2NhcmRfdHlwZScsXG4gICAgICAncmVkYWN0ZWRfY2FyZF9udW1iZXInLFxuICAgICAgJ2NhcmRfbnVtYmVyJyxcbiAgICAgICdleHBpcnlfbW9udGgnLFxuICAgICAgJ2V4cGlyeV95ZWFyJyxcbiAgICAgICdzaG9ydF9leHBpcnlfeWVhcicsXG4gICAgICAnY3Z2JyxcbiAgICAgICd6aXAnXG4gICAgXTtcblxuICAgIC8qKlxuICAgICAqIERlZmF1bHQgY29uZmlnIGZvciBjYXJkSU8gc2NhbiBmdW5jdGlvblxuICAgICAqL1xuICAgIHZhciBkZWZhdWx0U2NhbkNvbmZpZyA9IHtcbiAgICAgICdleHBpcnknOiB0cnVlLFxuICAgICAgJ2N2dic6IHRydWUsXG4gICAgICAnemlwJzogZmFsc2UsXG4gICAgICAnc3VwcHJlc3NNYW51YWwnOiBmYWxzZSxcbiAgICAgICdzdXBwcmVzc0NvbmZpcm0nOiBmYWxzZSxcbiAgICAgICdoaWRlTG9nbyc6IHRydWVcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQ29uZmlndXJpbmcgZGVmYXVsdFJlc3BGaWVsZHMgdXNpbmcgJGNvcmRvdmFOZ0NhcmRJT1Byb3ZpZGVyXG4gICAgICpcbiAgICAgKi9cbiAgICB0aGlzLnNldENhcmRJT1Jlc3BvbnNlRmllbGRzID0gZnVuY3Rpb24gKGZpZWxkcykge1xuICAgICAgaWYgKCFmaWVsZHMgfHwgIWFuZ3VsYXIuaXNBcnJheShmaWVsZHMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGRlZmF1bHRSZXNwRmllbGRzID0gZmllbGRzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIENvbmZpZ3VyaW5nIGRlZmF1bHRTY2FuQ29uZmlnIHVzaW5nICRjb3Jkb3ZhTmdDYXJkSU9Qcm92aWRlclxuICAgICAqL1xuICAgIHRoaXMuc2V0U2NhbmVyQ29uZmlnID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgaWYgKCFjb25maWcgfHwgIWFuZ3VsYXIuaXNPYmplY3QoY29uZmlnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLmV4cGlyeSA9IGNvbmZpZy5leHBpcnkgfHwgdHJ1ZTtcbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLmN2diA9IGNvbmZpZy5jdnYgfHwgdHJ1ZTtcbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLnppcCA9IGNvbmZpZy56aXAgfHwgZmFsc2U7XG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy5zdXBwcmVzc01hbnVhbCA9IGNvbmZpZy5zdXBwcmVzc01hbnVhbCB8fCBmYWxzZTtcbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLnN1cHByZXNzQ29uZmlybSA9IGNvbmZpZy5zdXBwcmVzc0NvbmZpcm0gfHwgZmFsc2U7XG4gICAgICBkZWZhdWx0U2NhbkNvbmZpZy5oaWRlTG9nbyA9IGNvbmZpZy5oaWRlTG9nbyB8fCB0cnVlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBGdW5jdGlvbiBzY2FuQ2FyZCBmb3IgJGNvcmRvdmFOZ0NhcmRJTyBzZXJ2aWNlIHRvIG1ha2Ugc2NhbiBvZiBjYXJkXG4gICAgICpcbiAgICAgKi9cbiAgICB0aGlzLiRnZXQgPSBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzY2FuQ2FyZDogZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgdmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBDYXJkSU8uc2NhbihcbiAgICAgICAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLFxuICAgICAgICAgICAgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG5cbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG51bGwpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgdmFyIHJlc3BEYXRhID0ge307XG4gICAgICAgICAgICAgICAgZm9yIChcbiAgICAgICAgICAgICAgICAgIHZhciBpID0gMCwgbGVuID0gZGVmYXVsdFJlc3BGaWVsZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgIHZhciBmaWVsZCA9IGRlZmF1bHRSZXNwRmllbGRzW2ldO1xuXG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGQgPT09ICdzaG9ydF9leHBpcnlfeWVhcicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzcERhdGFbZmllbGRdID0gU3RyaW5nKHJlc3BvbnNlLmV4cGlyeV95ZWFyKS5zdWJzdHIoIC8vIGpzaGludCBpZ25vcmU6bGluZVxuICAgICAgICAgICAgICAgICAgICAgIDIsIDJcbiAgICAgICAgICAgICAgICAgICAgKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3BEYXRhW2ZpZWxkXSA9IHJlc3BvbnNlW2ZpZWxkXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXNwRGF0YSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XVxuKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vVmVyc29Tb2x1dGlvbnMvQ29yZG92YUNsaXBib2FyZC5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vVmVyc29Tb2x1dGlvbnMvQ29yZG92YUNsaXBib2FyZFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY2xpcGJvYXJkJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQ2xpcGJvYXJkJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgY29weTogZnVuY3Rpb24gKHRleHQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmNsaXBib2FyZC5jb3B5KHRleHQsXG4gICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcGFzdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmNsaXBib2FyZC5wYXN0ZShmdW5jdGlvbiAodGV4dCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0ZXh0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWNvbnRhY3RzXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1jb250YWN0c1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY29udGFjdHMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFDb250YWN0cycsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzYXZlOiBmdW5jdGlvbiAoY29udGFjdCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBkZXZpY2VDb250YWN0ID0gbmF2aWdhdG9yLmNvbnRhY3RzLmNyZWF0ZShjb250YWN0KTtcblxuICAgICAgICBkZXZpY2VDb250YWN0LnNhdmUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmU6IGZ1bmN0aW9uIChjb250YWN0KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGRldmljZUNvbnRhY3QgPSBuYXZpZ2F0b3IuY29udGFjdHMuY3JlYXRlKGNvbnRhY3QpO1xuXG4gICAgICAgIGRldmljZUNvbnRhY3QucmVtb3ZlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xvbmU6IGZ1bmN0aW9uIChjb250YWN0KSB7XG4gICAgICAgIHZhciBkZXZpY2VDb250YWN0ID0gbmF2aWdhdG9yLmNvbnRhY3RzLmNyZWF0ZShjb250YWN0KTtcbiAgICAgICAgcmV0dXJuIGRldmljZUNvbnRhY3QuY2xvbmUoY29udGFjdCk7XG4gICAgICB9LFxuXG4gICAgICBmaW5kOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBmaWVsZHMgPSBvcHRpb25zLmZpZWxkcyB8fCBbJ2lkJywgJ2Rpc3BsYXlOYW1lJ107XG4gICAgICAgIGRlbGV0ZSBvcHRpb25zLmZpZWxkcztcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKG9wdGlvbnMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIG5hdmlnYXRvci5jb250YWN0cy5maW5kKGZpZWxkcywgZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHRzKTtcbiAgICAgICAgICB9LGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmNvbnRhY3RzLmZpbmQoZmllbGRzLCBmdW5jdGlvbiAocmVzdWx0cykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSwgb3B0aW9ucyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHBpY2tDb250YWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuY29udGFjdHMucGlja0NvbnRhY3QoZnVuY3Rpb24gKGNvbnRhY3QpIHtcbiAgICAgICAgICBxLnJlc29sdmUoY29udGFjdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgICAvLyBUT0RPOiBtZXRob2QgdG8gc2V0IC8gZ2V0IENvbnRhY3RBZGRyZXNzXG4gICAgICAvLyBUT0RPOiBtZXRob2QgdG8gc2V0IC8gZ2V0IENvbnRhY3RFcnJvclxuICAgICAgLy8gVE9ETzogbWV0aG9kIHRvIHNldCAvIGdldCBDb250YWN0RmllbGRcbiAgICAgIC8vIFRPRE86IG1ldGhvZCB0byBzZXQgLyBnZXQgQ29udGFjdE5hbWVcbiAgICAgIC8vIFRPRE86IG1ldGhvZCB0byBzZXQgLyBnZXQgQ29udGFjdE9yZ2FuaXphdGlvblxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1ZpdGFsaWlCbGFnb2Rpci9jb3Jkb3ZhLXBsdWdpbi1kYXRlcGlja2VyLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vVml0YWxpaUJsYWdvZGlyL2NvcmRvdmEtcGx1Z2luLWRhdGVwaWNrZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmRhdGVQaWNrZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFEYXRlUGlja2VyJywgWyckd2luZG93JywgJyRxJywgZnVuY3Rpb24gKCR3aW5kb3csICRxKSB7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3c6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge2RhdGU6IG5ldyBEYXRlKCksIG1vZGU6ICdkYXRlJ307XG4gICAgICAgICR3aW5kb3cuZGF0ZVBpY2tlci5zaG93KG9wdGlvbnMsIGZ1bmN0aW9uIChkYXRlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGUpO1xuICAgICAgICB9LCBmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWRldmljZVxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlXG5cbi8qIGdsb2JhbHMgZGV2aWNlOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRGV2aWNlJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIHdob2xlIGRldmljZSBvYmplY3QuXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlXG4gICAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZGV2aWNlIG9iamVjdC5cbiAgICAgICAqL1xuICAgICAgZ2V0RGV2aWNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2U7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIENvcmRvdmEgdmVyc2lvbi5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UjZGV2aWNlY29yZG92YVxuICAgICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIENvcmRvdmEgdmVyc2lvbi5cbiAgICAgICAqL1xuICAgICAgZ2V0Q29yZG92YTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLmNvcmRvdmE7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdGhlIG5hbWUgb2YgdGhlIGRldmljZSdzIG1vZGVsIG9yIHByb2R1Y3QuXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlI2RldmljZW1vZGVsXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgbmFtZSBvZiB0aGUgZGV2aWNlJ3MgbW9kZWwgb3IgcHJvZHVjdC5cbiAgICAgICAqL1xuICAgICAgZ2V0TW9kZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5tb2RlbDtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogQGRlcHJlY2F0ZWQgZGV2aWNlLm5hbWUgaXMgZGVwcmVjYXRlZCBhcyBvZiB2ZXJzaW9uIDIuMy4wLiBVc2UgZGV2aWNlLm1vZGVsIGluc3RlYWQuXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAgICovXG4gICAgICBnZXROYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UubmFtZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgZGV2aWNlJ3Mgb3BlcmF0aW5nIHN5c3RlbSBuYW1lLlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZSNkZXZpY2VwbGF0Zm9ybVxuICAgICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGRldmljZSdzIG9wZXJhdGluZyBzeXN0ZW0gbmFtZS5cbiAgICAgICAqL1xuICAgICAgZ2V0UGxhdGZvcm06IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5wbGF0Zm9ybTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgZGV2aWNlJ3MgVW5pdmVyc2FsbHkgVW5pcXVlIElkZW50aWZpZXIuXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlI2RldmljZXV1aWRcbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBkZXZpY2UncyBVbml2ZXJzYWxseSBVbmlxdWUgSWRlbnRpZmllclxuICAgICAgICovXG4gICAgICBnZXRVVUlEOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UudXVpZDtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgb3BlcmF0aW5nIHN5c3RlbSB2ZXJzaW9uLlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZSNkZXZpY2V2ZXJzaW9uXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAgICovXG4gICAgICBnZXRWZXJzaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UudmVyc2lvbjtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgZGV2aWNlIG1hbnVmYWN0dXJlci5cbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICAgKi9cbiAgICAgIGdldE1hbnVmYWN0dXJlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLm1hbnVmYWN0dXJlcjtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZGV2aWNlLW1vdGlvblxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlLW1vdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlTW90aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRGV2aWNlTW90aW9uJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldEN1cnJlbnRBY2NlbGVyYXRpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKG5hdmlnYXRvci5hY2NlbGVyb21ldGVyKSB8fFxuICAgICAgICAhYW5ndWxhci5pc0Z1bmN0aW9uKG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLmdldEN1cnJlbnRBY2NlbGVyYXRpb24pKSB7XG4gICAgICAgICAgcS5yZWplY3QoJ0RldmljZSBkbyBub3Qgc3VwcG9ydCB3YXRjaEFjY2VsZXJhdGlvbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIuZ2V0Q3VycmVudEFjY2VsZXJhdGlvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd2F0Y2hBY2NlbGVyYXRpb246IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoYW5ndWxhci5pc1VuZGVmaW5lZChuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlcikgfHxcbiAgICAgICAgIWFuZ3VsYXIuaXNGdW5jdGlvbihuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci53YXRjaEFjY2VsZXJhdGlvbikpIHtcbiAgICAgICAgICBxLnJlamVjdCgnRGV2aWNlIGRvIG5vdCBzdXBwb3J0IHdhdGNoQWNjZWxlcmF0aW9uJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgd2F0Y2hJRCA9IG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLndhdGNoQWNjZWxlcmF0aW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcS5wcm9taXNlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS5jbGVhcldhdGNoID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIuY2xlYXJXYXRjaChpZCB8fCB3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2Uud2F0Y2hJRCA9IHdhdGNoSUQ7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyV2F0Y2g6IGZ1bmN0aW9uICh3YXRjaElEKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1kZXZpY2Utb3JpZW50YXRpb25cbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZS1vcmllbnRhdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlT3JpZW50YXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFEZXZpY2VPcmllbnRhdGlvbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHZhciBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIGZyZXF1ZW5jeTogMzAwMCAvLyBldmVyeSAzc1xuICAgIH07XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldEN1cnJlbnRIZWFkaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZighbmF2aWdhdG9yLmNvbXBhc3MpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdObyBjb21wYXNzIG9uIERldmljZScpO1xuICAgICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5jb21wYXNzLmdldEN1cnJlbnRIZWFkaW5nKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3YXRjaEhlYWRpbmc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZighbmF2aWdhdG9yLmNvbXBhc3MpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdObyBjb21wYXNzIG9uIERldmljZScpO1xuICAgICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBfb3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcbiAgICAgICAgdmFyIHdhdGNoSUQgPSBuYXZpZ2F0b3IuY29tcGFzcy53YXRjaEhlYWRpbmcoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBfb3B0aW9ucyk7XG5cbiAgICAgICAgcS5wcm9taXNlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuY29tcGFzcy5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS5jbGVhcldhdGNoID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmNvbXBhc3MuY2xlYXJXYXRjaChpZCB8fCB3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2Uud2F0Y2hJRCA9IHdhdGNoSUQ7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyV2F0Y2g6IGZ1bmN0aW9uICh3YXRjaElEKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3IuY29tcGFzcy5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1kaWFsb2dzXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kaWFsb2dzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5kaWFsb2dzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRGlhbG9ncycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGFsZXJ0OiBmdW5jdGlvbiAobWVzc2FnZSwgdGl0bGUsIGJ1dHRvbk5hbWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5uYXZpZ2F0b3Iubm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgJHdpbmRvdy5hbGVydChtZXNzYWdlKTtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLmFsZXJ0KG1lc3NhZ2UsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH0sIHRpdGxlLCBidXR0b25OYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjb25maXJtOiBmdW5jdGlvbiAobWVzc2FnZSwgdGl0bGUsIGJ1dHRvbkxhYmVscykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93Lm5hdmlnYXRvci5ub3RpZmljYXRpb24pIHtcbiAgICAgICAgICBpZiAoJHdpbmRvdy5jb25maXJtKG1lc3NhZ2UpKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi5jb25maXJtKG1lc3NhZ2UsIGZ1bmN0aW9uIChidXR0b25JbmRleCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGJ1dHRvbkluZGV4KTtcbiAgICAgICAgICB9LCB0aXRsZSwgYnV0dG9uTGFiZWxzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcm9tcHQ6IGZ1bmN0aW9uIChtZXNzYWdlLCB0aXRsZSwgYnV0dG9uTGFiZWxzLCBkZWZhdWx0VGV4dCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93Lm5hdmlnYXRvci5ub3RpZmljYXRpb24pIHtcbiAgICAgICAgICB2YXIgcmVzID0gJHdpbmRvdy5wcm9tcHQobWVzc2FnZSwgZGVmYXVsdFRleHQpO1xuICAgICAgICAgIGlmIChyZXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSh7aW5wdXQxOiByZXMsIGJ1dHRvbkluZGV4OiAxfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSh7aW5wdXQxOiByZXMsIGJ1dHRvbkluZGV4OiAyfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5hdmlnYXRvci5ub3RpZmljYXRpb24ucHJvbXB0KG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sIHRpdGxlLCBidXR0b25MYWJlbHMsIGRlZmF1bHRUZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYmVlcDogZnVuY3Rpb24gKHRpbWVzKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLmJlZXAodGltZXMpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tZW1haWwtY29tcG9zZXIuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWVtYWlsLWNvbXBvc2VyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5lbWFpbENvbXBvc2VyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRW1haWxDb21wb3NlcicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBpc0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmVtYWlsLmlzQXZhaWxhYmxlKGZ1bmN0aW9uIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgIGlmIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgb3BlbjogZnVuY3Rpb24gKHByb3BlcnRpZXMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5lbWFpbC5vcGVuKHByb3BlcnRpZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdCgpOyAvLyB1c2VyIGNsb3NlZCBlbWFpbCBjb21wb3NlclxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYWRkQWxpYXM6IGZ1bmN0aW9uIChhcHAsIHNjaGVtYSkge1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZW1haWwuYWRkQWxpYXMoYXBwLCBzY2hlbWEpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICBjb3Jkb3ZhIC1kIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1dpemNvcnAvcGhvbmVnYXAtZmFjZWJvb2stcGx1Z2luLmdpdCAtLXZhcmlhYmxlIEFQUF9JRD1cIjEyMzQ1Njc4OVwiIC0tdmFyaWFibGUgQVBQX05BTUU9XCJteUFwcGxpY2F0aW9uXCJcbi8vIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL1dpemNvcnAvcGhvbmVnYXAtZmFjZWJvb2stcGx1Z2luXG5cbi8qIGdsb2JhbHMgZmFjZWJvb2tDb25uZWN0UGx1Z2luOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmFjZWJvb2snLCBbXSlcblxuICAucHJvdmlkZXIoJyRjb3Jkb3ZhRmFjZWJvb2snLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgLyoqXG4gICAgICAqIEluaXQgYnJvd3NlciBzZXR0aW5ncyBmb3IgRmFjZWJvb2sgcGx1Z2luXG4gICAgICAqXG4gICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpZFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvblxuICAgICAgKi9cbiAgICB0aGlzLmJyb3dzZXJJbml0ID0gZnVuY3Rpb24gKGlkLCB2ZXJzaW9uKSB7XG4gICAgICB0aGlzLmFwcElEID0gaWQ7XG4gICAgICB0aGlzLmFwcFZlcnNpb24gPSB2ZXJzaW9uIHx8ICd2Mi4wJztcbiAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5icm93c2VySW5pdCh0aGlzLmFwcElELCB0aGlzLmFwcFZlcnNpb24pO1xuICAgIH07XG5cbiAgICB0aGlzLiRnZXQgPSBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBsb2dpbjogZnVuY3Rpb24gKHBlcm1pc3Npb25zKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5sb2dpbihwZXJtaXNzaW9ucywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZWplY3QocmVzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2hvd0RpYWxvZzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLnNob3dEaWFsb2cob3B0aW9ucywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFwaTogZnVuY3Rpb24gKHBhdGgsIHBlcm1pc3Npb25zKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5hcGkocGF0aCwgcGVybWlzc2lvbnMsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXRBY2Nlc3NUb2tlbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4uZ2V0QWNjZXNzVG9rZW4oZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldExvZ2luU3RhdHVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5nZXRMb2dpblN0YXR1cyhmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbG9nb3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5sb2dvdXQoZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tZmFjZWJvb2thZHMuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tZmFjZWJvb2thZHNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZhY2Vib29rQWRzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRmFjZWJvb2tBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWZpbGVcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWZpbGVcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZpbGUnLCBbXSlcblxuICAuY29uc3RhbnQoJyRjb3Jkb3ZhRmlsZUVycm9yJywge1xuICAgIDE6ICdOT1RfRk9VTkRfRVJSJyxcbiAgICAyOiAnU0VDVVJJVFlfRVJSJyxcbiAgICAzOiAnQUJPUlRfRVJSJyxcbiAgICA0OiAnTk9UX1JFQURBQkxFX0VSUicsXG4gICAgNTogJ0VOQ09ESU5HX0VSUicsXG4gICAgNjogJ05PX01PRElGSUNBVElPTl9BTExPV0VEX0VSUicsXG4gICAgNzogJ0lOVkFMSURfU1RBVEVfRVJSJyxcbiAgICA4OiAnU1lOVEFYX0VSUicsXG4gICAgOTogJ0lOVkFMSURfTU9ESUZJQ0FUSU9OX0VSUicsXG4gICAgMTA6ICdRVU9UQV9FWENFRURFRF9FUlInLFxuICAgIDExOiAnVFlQRV9NSVNNQVRDSF9FUlInLFxuICAgIDEyOiAnUEFUSF9FWElTVFNfRVJSJ1xuICB9KVxuXG4gIC5wcm92aWRlcignJGNvcmRvdmFGaWxlJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHRoaXMuJGdldCA9IFsnJHEnLCAnJHdpbmRvdycsICckY29yZG92YUZpbGVFcnJvcicsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdywgJGNvcmRvdmFGaWxlRXJyb3IpIHtcblxuICAgICAgcmV0dXJuIHtcblxuICAgICAgICBnZXRGcmVlRGlza1NwYWNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGNvcmRvdmEuZXhlYyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LCAnRmlsZScsICdnZXRGcmVlRGlza1NwYWNlJywgW10pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2hlY2tEaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXIpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGRpcikpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZGlyZWN0b3J5IGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgZGlyZWN0b3J5ID0gcGF0aCArIGRpcjtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChkaXJlY3RvcnksIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGlmIChmaWxlU3lzdGVtLmlzRGlyZWN0b3J5ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcS5yZXNvbHZlKGZpbGVTeXN0ZW0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiAxMywgbWVzc2FnZTogJ2lucHV0IGlzIG5vdCBhIGRpcmVjdG9yeSd9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjaGVja0ZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdkaXJlY3RvcnkgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHZhciBkaXJlY3RvcnkgPSBwYXRoICsgZmlsZTtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChkaXJlY3RvcnksIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGlmIChmaWxlU3lzdGVtLmlzRmlsZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHEucmVzb2x2ZShmaWxlU3lzdGVtKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogMTMsIG1lc3NhZ2U6ICdpbnB1dCBpcyBub3QgYSBmaWxlJ30pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNyZWF0ZURpcjogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUsIHJlcGxhY2VCb29sKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChkaXJOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdkaXJlY3RvcnkgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVwbGFjZUJvb2wgPSByZXBsYWNlQm9vbCA/IGZhbHNlIDogdHJ1ZTtcblxuICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgICAgZXhjbHVzaXZlOiByZXBsYWNlQm9vbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY3JlYXRlRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lLCByZXBsYWNlQm9vbCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXBsYWNlQm9vbCA9IHJlcGxhY2VCb29sID8gZmFsc2UgOiB0cnVlO1xuXG4gICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgICBleGNsdXNpdmU6IHJlcGxhY2VCb29sXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCBvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVEaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChkaXJOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChkaXJFbnRyeSkge1xuICAgICAgICAgICAgICAgIGRpckVudHJ5LnJlbW92ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlc29sdmUoe3N1Y2Nlc3M6IHRydWUsIGZpbGVSZW1vdmVkOiBkaXJFbnRyeX0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgZXIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2VyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkucmVtb3ZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZSh7c3VjY2VzczogdHJ1ZSwgZmlsZVJlbW92ZWQ6IGZpbGVFbnRyeX0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgZXIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2VyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlUmVjdXJzaXZlbHk6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChkaXJOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChkaXJFbnRyeSkge1xuICAgICAgICAgICAgICAgIGRpckVudHJ5LnJlbW92ZVJlY3Vyc2l2ZWx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZSh7c3VjY2VzczogdHJ1ZSwgZmlsZVJlbW92ZWQ6IGRpckVudHJ5fSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBlci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICB3cml0ZUZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSwgdGV4dCwgcmVwbGFjZUJvb2wpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVwbGFjZUJvb2wgPSByZXBsYWNlQm9vbCA/IGZhbHNlIDogdHJ1ZTtcblxuICAgICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgICAgZXhjbHVzaXZlOiByZXBsYWNlQm9vbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwgb3B0aW9ucywgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5jcmVhdGVXcml0ZXIoZnVuY3Rpb24gKHdyaXRlcikge1xuICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuYXBwZW5kID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlci5zZWVrKHdyaXRlci5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy50cnVuY2F0ZSkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXIudHJ1bmNhdGUob3B0aW9ucy50cnVuY2F0ZSk7XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIHdyaXRlci5vbndyaXRlZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICB3cml0ZXIud3JpdGUodGV4dCk7XG5cbiAgICAgICAgICAgICAgICAgIHEucHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVyLmFib3J0KCk7XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICB3cml0ZUV4aXN0aW5nRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lLCB0ZXh0KSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuY3JlYXRlV3JpdGVyKGZ1bmN0aW9uICh3cml0ZXIpIHtcbiAgICAgICAgICAgICAgICAgIHdyaXRlci5zZWVrKHdyaXRlci5sZW5ndGgpO1xuXG4gICAgICAgICAgICAgICAgICB3cml0ZXIub253cml0ZWVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh0aGlzLmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgd3JpdGVyLndyaXRlKHRleHQpO1xuXG4gICAgICAgICAgICAgICAgICBxLnByb21pc2UuYWJvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlci5hYm9ydCgpO1xuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVhZEFzVGV4dDogZnVuY3Rpb24gKHBhdGgsIGZpbGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuZmlsZShmdW5jdGlvbiAoZmlsZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG4gICAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZ0LnRhcmdldC5yZXN1bHQgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LnJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQudGFyZ2V0LnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZ0LnRhcmdldC5lcnJvciAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQuZXJyb3IgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChldnQudGFyZ2V0LmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogbnVsbCwgbWVzc2FnZTogJ1JFQURFUl9PTkxPQURFTkRfRVJSJ30pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzVGV4dChmaWxlRGF0YSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlYWRBc0RhdGFVUkw6IGZ1bmN0aW9uIChwYXRoLCBmaWxlKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmZpbGUoZnVuY3Rpb24gKGZpbGVEYXRhKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWRlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChldnQudGFyZ2V0LnJlc3VsdCAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQucmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dC50YXJnZXQucmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChldnQudGFyZ2V0LmVycm9yICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5lcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGV2dC50YXJnZXQuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiBudWxsLCBtZXNzYWdlOiAnUkVBREVSX09OTE9BREVORF9FUlInfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlRGF0YSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlYWRBc0JpbmFyeVN0cmluZzogZnVuY3Rpb24gKHBhdGgsIGZpbGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuZmlsZShmdW5jdGlvbiAoZmlsZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLm9ubG9hZGVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2dC50YXJnZXQucmVzdWx0ICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5yZXN1bHQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0LnRhcmdldC5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV2dC50YXJnZXQuZXJyb3IgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LmVycm9yICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXZ0LnRhcmdldC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IG51bGwsIG1lc3NhZ2U6ICdSRUFERVJfT05MT0FERU5EX0VSUid9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5yZWFkQXNCaW5hcnlTdHJpbmcoZmlsZURhdGEpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWFkQXNBcnJheUJ1ZmZlcjogZnVuY3Rpb24gKHBhdGgsIGZpbGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuZmlsZShmdW5jdGlvbiAoZmlsZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLm9ubG9hZGVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2dC50YXJnZXQucmVzdWx0ICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5yZXN1bHQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0LnRhcmdldC5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV2dC50YXJnZXQuZXJyb3IgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LmVycm9yICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXZ0LnRhcmdldC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IG51bGwsIG1lc3NhZ2U6ICdSRUFERVJfT05MT0FERU5EX0VSUid9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihmaWxlRGF0YSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIG1vdmVGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUsIG5ld1BhdGgsIG5ld0ZpbGVOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgbmV3RmlsZU5hbWUgPSBuZXdGaWxlTmFtZSB8fCBmaWxlTmFtZTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSB8fCAoL15cXC8vLnRlc3QobmV3RmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlTmFtZSwge2NyZWF0ZTogZmFsc2V9LCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKG5ld1BhdGgsIGZ1bmN0aW9uIChuZXdGaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5tb3ZlVG8obmV3RmlsZUVudHJ5LCBuZXdGaWxlTmFtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbW92ZURpcjogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUsIG5ld1BhdGgsIG5ld0Rpck5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBuZXdEaXJOYW1lID0gbmV3RGlyTmFtZSB8fCBkaXJOYW1lO1xuXG4gICAgICAgICAgaWYgKC9eXFwvLy50ZXN0KGRpck5hbWUpIHx8ICgvXlxcLy8udGVzdChuZXdEaXJOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldERpcmVjdG9yeShkaXJOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChkaXJFbnRyeSkge1xuICAgICAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChuZXdQYXRoLCBmdW5jdGlvbiAobmV3RGlyRW50cnkpIHtcbiAgICAgICAgICAgICAgICAgIGRpckVudHJ5Lm1vdmVUbyhuZXdEaXJFbnRyeSwgbmV3RGlyTmFtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJybykge1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJybyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb3B5RGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSwgbmV3UGF0aCwgbmV3RGlyTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIG5ld0Rpck5hbWUgPSBuZXdEaXJOYW1lIHx8IGRpck5hbWU7XG5cbiAgICAgICAgICBpZiAoL15cXC8vLnRlc3QoZGlyTmFtZSkgfHwgKC9eXFwvLy50ZXN0KG5ld0Rpck5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIHtjcmVhdGU6IGZhbHNlLCBleGNsdXNpdmU6IGZhbHNlfSwgZnVuY3Rpb24gKGRpckVudHJ5KSB7XG5cbiAgICAgICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwobmV3UGF0aCwgZnVuY3Rpb24gKG5ld0RpckVudHJ5KSB7XG4gICAgICAgICAgICAgICAgICBkaXJFbnRyeS5jb3B5VG8obmV3RGlyRW50cnksIG5ld0Rpck5hbWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJybykge1xuICAgICAgICAgICAgICAgICAgZXJyby5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyby5jb2RlXTtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm8pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgZXIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2VyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY29weUZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSwgbmV3UGF0aCwgbmV3RmlsZU5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBuZXdGaWxlTmFtZSA9IG5ld0ZpbGVOYW1lIHx8IGZpbGVOYW1lO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCB7Y3JlYXRlOiBmYWxzZSwgZXhjbHVzaXZlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcblxuICAgICAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChuZXdQYXRoLCBmdW5jdGlvbiAobmV3RmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgICBmaWxlRW50cnkuY29weVRvKG5ld0ZpbGVFbnRyeSwgbmV3RmlsZU5hbWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJybykge1xuICAgICAgICAgICAgICAgICAgZXJyby5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyby5jb2RlXTtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm8pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXIpIHtcbiAgICAgICAgICAgICAgZXIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2VyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvKlxuICAgICAgICAgbGlzdEZpbGVzOiBmdW5jdGlvbiAocGF0aCwgZGlyKSB7XG5cbiAgICAgICAgIH0sXG5cbiAgICAgICAgIGxpc3REaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lKSB7XG4gICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIG9wdGlvbnMsIGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICAgICAgIHZhciByZWFkZXIgPSBwYXJlbnQuY3JlYXRlUmVhZGVyKCk7XG4gICAgICAgICByZWFkZXIucmVhZEVudHJpZXMoZnVuY3Rpb24gKGVudHJpZXMpIHtcbiAgICAgICAgIHEucmVzb2x2ZShlbnRyaWVzKTtcbiAgICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgIHEucmVqZWN0KCdESVJfUkVBRF9FUlJPUiA6ICcgKyBwYXRoICsgZGlyTmFtZSk7XG4gICAgICAgICB9KTtcbiAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgfSk7XG4gICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgIH1cblxuICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgIH0sXG5cbiAgICAgICAgIHJlYWRGaWxlTWV0YWRhdGE6IGZ1bmN0aW9uIChmaWxlUGF0aCkge1xuICAgICAgICAgLy9yZXR1cm4gZ2V0RmlsZShmaWxlUGF0aCwge2NyZWF0ZTogZmFsc2V9KTtcbiAgICAgICAgIH1cbiAgICAgICAgICovXG4gICAgICB9O1xuXG4gICAgfV07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3B3bGluL2NvcmRvdmEtcGx1Z2luLWZpbGUtb3BlbmVyMi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL3B3bGluL2NvcmRvdmEtcGx1Z2luLWZpbGUtb3BlbmVyMlxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZU9wZW5lcjInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFGaWxlT3BlbmVyMicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBvcGVuOiBmdW5jdGlvbiAoZmlsZSwgdHlwZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5maWxlT3BlbmVyMi5vcGVuKGZpbGUsIHR5cGUsIHtcbiAgICAgICAgICBlcnJvcjogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH0sIHN1Y2Nlc3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bmluc3RhbGw6IGZ1bmN0aW9uIChwYWNrKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmZpbGVPcGVuZXIyLnVuaW5zdGFsbChwYWNrLCB7XG4gICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9LCBzdWNjZXNzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYXBwSXNJbnN0YWxsZWQ6IGZ1bmN0aW9uIChwYWNrKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmZpbGVPcGVuZXIyLmFwcElzSW5zdGFsbGVkKHBhY2ssIHtcbiAgICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1maWxlLXRyYW5zZmVyXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1maWxlLXRyYW5zZmVyXG5cbi8qIGdsb2JhbHMgRmlsZVRyYW5zZmVyOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZVRyYW5zZmVyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRmlsZVRyYW5zZmVyJywgWyckcScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcSwgJHRpbWVvdXQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZG93bmxvYWQ6IGZ1bmN0aW9uIChzb3VyY2UsIGZpbGVQYXRoLCBvcHRpb25zLCB0cnVzdEFsbEhvc3RzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGZ0ID0gbmV3IEZpbGVUcmFuc2ZlcigpO1xuICAgICAgICB2YXIgdXJpID0gKG9wdGlvbnMgJiYgb3B0aW9ucy5lbmNvZGVVUkkgPT09IGZhbHNlKSA/IHNvdXJjZSA6IGVuY29kZVVSSShzb3VyY2UpO1xuXG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMudGltZW91dCAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMudGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGZ0LmFib3J0KCk7XG4gICAgICAgICAgfSwgb3B0aW9ucy50aW1lb3V0KTtcbiAgICAgICAgICBvcHRpb25zLnRpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgZnQub25wcm9ncmVzcyA9IGZ1bmN0aW9uIChwcm9ncmVzcykge1xuICAgICAgICAgIHEubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2UuYWJvcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZnQuYWJvcnQoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBmdC5kb3dubG9hZCh1cmksIGZpbGVQYXRoLCBxLnJlc29sdmUsIHEucmVqZWN0LCB0cnVzdEFsbEhvc3RzLCBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVwbG9hZDogZnVuY3Rpb24gKHNlcnZlciwgZmlsZVBhdGgsIG9wdGlvbnMsIHRydXN0QWxsSG9zdHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZnQgPSBuZXcgRmlsZVRyYW5zZmVyKCk7XG4gICAgICAgIHZhciB1cmkgPSAob3B0aW9ucyAmJiBvcHRpb25zLmVuY29kZVVSSSA9PT0gZmFsc2UpID8gc2VydmVyIDogZW5jb2RlVVJJKHNlcnZlcik7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy50aW1lb3V0ICE9PSB1bmRlZmluZWQgJiYgb3B0aW9ucy50aW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZnQuYWJvcnQoKTtcbiAgICAgICAgICB9LCBvcHRpb25zLnRpbWVvdXQpO1xuICAgICAgICAgIG9wdGlvbnMudGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBmdC5vbnByb2dyZXNzID0gZnVuY3Rpb24gKHByb2dyZXNzKSB7XG4gICAgICAgICAgcS5ub3RpZnkocHJvZ3Jlc3MpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBmdC5hYm9ydCgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ0LnVwbG9hZChmaWxlUGF0aCwgdXJpLCBxLnJlc29sdmUsIHEucmVqZWN0LCBvcHRpb25zLCB0cnVzdEFsbEhvc3RzKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0ZsYXNobGlnaHQtUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9GbGFzaGxpZ2h0LVBob25lR2FwLVBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmxhc2hsaWdodCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUZsYXNobGlnaHQnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBhdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZmxhc2hsaWdodC5hdmFpbGFibGUoZnVuY3Rpb24gKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGlzQXZhaWxhYmxlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzd2l0Y2hPbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5mbGFzaGxpZ2h0LnN3aXRjaE9uKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzd2l0Y2hPZmY6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZmxhc2hsaWdodC5zd2l0Y2hPZmYoZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRvZ2dsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5mbGFzaGxpZ2h0LnRvZ2dsZShmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1mbHVycnkuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tZmx1cnJ5XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5mbHVycnlBZHMnLCBbXSlcbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRmx1cnJ5QWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC1idWlsZC9HQVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAtYnVpbGQvR0FQbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdhJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR0EnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBpbml0OiBmdW5jdGlvbiAoaWQsIG1pbmdhcCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG1pbmdhcCA9IChtaW5nYXAgPj0gMCkgPyBtaW5nYXAgOiAxMDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdhUGx1Z2luLmluaXQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGlkLCBtaW5nYXApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tFdmVudDogZnVuY3Rpb24gKHN1Y2Nlc3MsIGZhaWwsIGNhdGVnb3J5LCBldmVudEFjdGlvbiwgZXZlbnRMYWJlbCwgZXZlbnRWYWx1ZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nYVBsdWdpbi50cmFja0V2ZW50KGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBjYXRlZ29yeSwgZXZlbnRBY3Rpb24sIGV2ZW50TGFiZWwsIGV2ZW50VmFsdWUpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tQYWdlOiBmdW5jdGlvbiAoc3VjY2VzcywgZmFpbCwgcGFnZVVSTCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nYVBsdWdpbi50cmFja1BhZ2UoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhZ2VVUkwpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0VmFyaWFibGU6IGZ1bmN0aW9uIChzdWNjZXNzLCBmYWlsLCBpbmRleCwgdmFsdWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ2FQbHVnaW4uc2V0VmFyaWFibGUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGluZGV4LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBleGl0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdhUGx1Z2luLmV4aXQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZ2VvbG9jYXRpb25cbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWdlb2xvY2F0aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nZW9sb2NhdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdlb2xvY2F0aW9uJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldEN1cnJlbnRQb3NpdGlvbjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nZW9sb2NhdGlvbi5nZXRDdXJyZW50UG9zaXRpb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdhdGNoUG9zaXRpb246IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICB2YXIgd2F0Y2hJRCA9IG5hdmlnYXRvci5nZW9sb2NhdGlvbi53YXRjaFBvc2l0aW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcS5wcm9taXNlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24uY2xlYXJXYXRjaCh3YXRjaElEKTtcbiAgICAgICAgfTtcblxuICAgICAgICBxLnByb21pc2UuY2xlYXJXYXRjaCA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgIG5hdmlnYXRvci5nZW9sb2NhdGlvbi5jbGVhcldhdGNoKGlkIHx8IHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS53YXRjaElEID0gd2F0Y2hJRDtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJXYXRjaDogZnVuY3Rpb24gKHdhdGNoSUQpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5nZW9sb2NhdGlvbi5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZ2xvYmFsaXphdGlvblxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWdsb2JhbGl6YXRpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdsb2JhbGl6YXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHbG9iYWxpemF0aW9uJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldFByZWZlcnJlZExhbmd1YWdlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXRQcmVmZXJyZWRMYW5ndWFnZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRMb2NhbGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXRMb2NhbGVOYW1lKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEZpcnN0RGF5T2ZXZWVrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXRGaXJzdERheU9mV2VlayhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvLyBcImRhdGVcIiBwYXJhbWV0ZXIgbXVzdCBiZSBhIEphdmFTY3JpcHQgRGF0ZSBPYmplY3QuXG4gICAgICBkYXRlVG9TdHJpbmc6IGZ1bmN0aW9uIChkYXRlLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5kYXRlVG9TdHJpbmcoXG4gICAgICAgICAgZGF0ZSxcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0cmluZ1RvRGF0ZTogZnVuY3Rpb24gKGRhdGVTdHJpbmcsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLnN0cmluZ1RvRGF0ZShcbiAgICAgICAgICBkYXRlU3RyaW5nLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0RGF0ZVBhdHRlcm46IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5nZXREYXRlUGF0dGVybihcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldERhdGVOYW1lczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldERhdGVOYW1lcyhcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIFwiZGF0ZVwiIHBhcmFtZXRlciBtdXN0IGJlIGEgSmF2YVNjcmlwdCBEYXRlIE9iamVjdC5cbiAgICAgIGlzRGF5TGlnaHRTYXZpbmdzVGltZTogZnVuY3Rpb24gKGRhdGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmlzRGF5TGlnaHRTYXZpbmdzVGltZShcbiAgICAgICAgICBkYXRlLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIG51bWJlclRvU3RyaW5nOiBmdW5jdGlvbiAobnVtYmVyLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5udW1iZXJUb1N0cmluZyhcbiAgICAgICAgICBudW1iZXIsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdHJpbmdUb051bWJlcjogZnVuY3Rpb24gKG51bWJlclN0cmluZywgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uc3RyaW5nVG9OdW1iZXIoXG4gICAgICAgICAgbnVtYmVyU3RyaW5nLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0TnVtYmVyUGF0dGVybjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldE51bWJlclBhdHRlcm4oXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRDdXJyZW5jeVBhdHRlcm46IGZ1bmN0aW9uIChjdXJyZW5jeUNvZGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldEN1cnJlbmN5UGF0dGVybihcbiAgICAgICAgICBjdXJyZW5jeUNvZGUsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtYWRtb2ItcHJvLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtYWRtb2ItcHJvXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVBZHMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHb29nbGVBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2Iuc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2IuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2IucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9kYW53aWxzb24vZ29vZ2xlLWFuYWx5dGljcy1wbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2RhbndpbHNvbi9nb29nbGUtYW5hbHl0aWNzLXBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlQW5hbHl0aWNzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR29vZ2xlQW5hbHl0aWNzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhcnRUcmFja2VyV2l0aElkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnN0YXJ0VHJhY2tlcldpdGhJZChpZCwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0VXNlcklkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnNldFVzZXJJZChpZCwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGVidWdNb2RlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5kZWJ1Z01vZGUoZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja1ZpZXc6IGZ1bmN0aW9uIChzY3JlZW5OYW1lKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy50cmFja1ZpZXcoc2NyZWVuTmFtZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYWRkQ3VzdG9tRGltZW5zaW9uOiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MuYWRkQ3VzdG9tRGltZW5zaW9uKGtleSwgdmFsdWUsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tFdmVudDogZnVuY3Rpb24gKGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MudHJhY2tFdmVudChjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrRXhjZXB0aW9uOiBmdW5jdGlvbiAoZGVzY3JpcHRpb24sIGZhdGFsKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy50cmFja0V4Y2VwdGlvbihkZXNjcmlwdGlvbiwgZmF0YWwsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrVGltaW5nOiBmdW5jdGlvbiAoY2F0ZWdvcnksIG1pbGxpc2Vjb25kcywgdmFyaWFibGUsIGxhYmVsKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy50cmFja1RpbWluZyhjYXRlZ29yeSwgbWlsbGlzZWNvbmRzLCB2YXJpYWJsZSwgbGFiZWwsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFkZFRyYW5zYWN0aW9uOiBmdW5jdGlvbiAodHJhbnNhY3Rpb25JZCwgYWZmaWxpYXRpb24sIHJldmVudWUsIHRheCwgc2hpcHBpbmcsIGN1cnJlbmN5Q29kZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MuYWRkVHJhbnNhY3Rpb24odHJhbnNhY3Rpb25JZCwgYWZmaWxpYXRpb24sIHJldmVudWUsIHRheCwgc2hpcHBpbmcsIGN1cnJlbmN5Q29kZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYWRkVHJhbnNhY3Rpb25JdGVtOiBmdW5jdGlvbiAodHJhbnNhY3Rpb25JZCwgbmFtZSwgc2t1LCBjYXRlZ29yeSwgcHJpY2UsIHF1YW50aXR5LCBjdXJyZW5jeUNvZGUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLmFkZFRyYW5zYWN0aW9uSXRlbSh0cmFuc2FjdGlvbklkLCBuYW1lLCBza3UsIGNhdGVnb3J5LCBwcmljZSwgcXVhbnRpdHksIGN1cnJlbmN5Q29kZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDpcbi8vIGxpbmsgICAgICA6XG5cbi8vIEdvb2dsZSBNYXBzIG5lZWRzIEFMT1Qgb2Ygd29yayFcbi8vIE5vdCBmb3IgcHJvZHVjdGlvbiB1c2VcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZU1hcCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdvb2dsZU1hcCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgdmFyIG1hcCA9IG51bGw7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0TWFwOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93LnBsdWdpbi5nb29nbGUubWFwcykge1xuICAgICAgICAgIHEucmVqZWN0KG51bGwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhciBkaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWFwX2NhbnZhcycpO1xuICAgICAgICAgIG1hcCA9ICR3aW5kb3cucGx1Z2luLmdvb2dsZS5tYXBzLk1hcC5nZXRNYXAob3B0aW9ucyk7XG4gICAgICAgICAgbWFwLnNldERpdihkaXYpO1xuICAgICAgICAgIHEucmVzb2x2ZShtYXApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc01hcExvYWRlZDogZnVuY3Rpb24gKCkgeyAvLyBjaGVjayBpZiBhbiBpbnN0YW5jZSBvZiB0aGUgbWFwIGV4aXN0c1xuICAgICAgICByZXR1cm4gISFtYXA7XG4gICAgICB9LFxuICAgICAgYWRkTWFya2VyOiBmdW5jdGlvbiAobWFya2VyT3B0aW9ucykgeyAvLyBhZGQgYSBtYXJrZXIgdG8gdGhlIG1hcCB3aXRoIGdpdmVuIG1hcmtlck9wdGlvbnNcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBtYXAuYWRkTWFya2VyKG1hcmtlck9wdGlvbnMsIGZ1bmN0aW9uIChtYXJrZXIpIHtcbiAgICAgICAgICBxLnJlc29sdmUobWFya2VyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBnZXRNYXBUeXBlSWRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbi5nb29nbGUubWFwcy5tYXBUeXBlSWQ7XG4gICAgICB9LFxuICAgICAgc2V0VmlzaWJsZTogZnVuY3Rpb24gKGlzVmlzaWJsZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG1hcC5zZXRWaXNpYmxlKGlzVmlzaWJsZSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgLy8gSSBkb24ndCBrbm93IGhvdyB0byBkZWFsbG9jYXRlIHRlIG1hcCBhbmQgdGhlIGdvb2dsZSBtYXAgcGx1Z2luLlxuICAgICAgY2xlYW51cDogZnVuY3Rpb24gKCkge1xuICAgICAgICBtYXAgPSBudWxsO1xuICAgICAgICAvLyBkZWxldGUgbWFwO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3B0Z2Ftci9jb3Jkb3ZhLWdvb2dsZS1wbGF5LWdhbWUuZ2l0IC0tdmFyaWFibGUgQVBQX0lEPTEyMzQ1Njc4OVxuLy8gbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vcHRnYW1yL2NvcmRvdmEtZ29vZ2xlLXBsYXktZ2FtZVxuXG4vKiBnbG9iYWxzIGdvb2dsZXBsYXlnYW1lOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlUGxheUdhbWUnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHb29nbGVQbGF5R2FtZScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBhdXRoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5hdXRoKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNpZ25vdXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnNpZ25vdXQoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgaXNTaWduZWRJbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuaXNTaWduZWRJbihmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzaG93UGxheWVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zaG93UGxheWVyKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHN1Ym1pdFNjb3JlOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc3VibWl0U2NvcmUoZGF0YSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2hvd0FsbExlYWRlcmJvYXJkczogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc2hvd0FsbExlYWRlcmJvYXJkcyhmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzaG93TGVhZGVyYm9hcmQ6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zaG93TGVhZGVyYm9hcmQoZGF0YSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgdW5sb2NrQWNoaWV2ZW1lbnQ6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS51bmxvY2tBY2hpZXZlbWVudChkYXRhLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBpbmNyZW1lbnRBY2hpZXZlbWVudDogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLmluY3JlbWVudEFjaGlldmVtZW50KGRhdGEsIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNob3dBY2hpZXZlbWVudHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnNob3dBY2hpZXZlbWVudHMoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vY29yZG92YS1wbHVnaW4tZ29vZ2xlcGx1cy5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9jb3Jkb3ZhLXBsdWdpbi1nb29nbGVwbHVzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVQbHVzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR29vZ2xlUGx1cycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxvZ2luOiBmdW5jdGlvbiAoaW9zS2V5KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoaW9zS2V5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpb3NLZXkgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ29vZ2xlcGx1cy5sb2dpbih7J2lPU0FwaUtleSc6IGlvc0tleX0sIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNpbGVudExvZ2luOiBmdW5jdGlvbiAoaW9zS2V5KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoaW9zS2V5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpb3NLZXkgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ29vZ2xlcGx1cy50cnlTaWxlbnRMb2dpbih7J2lPU0FwaUtleSc6IGlvc0tleX0sIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGxvZ291dDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nb29nbGVwbHVzLmxvZ291dChmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIGRpc2Nvbm5lY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ29vZ2xlcGx1cy5kaXNjb25uZWN0KGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgaXNBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ29vZ2xlcGx1cy5pc0F2YWlsYWJsZShmdW5jdGlvbiAoYXZhaWxhYmxlKSB7XG4gICAgICAgICAgaWYgKGF2YWlsYWJsZSkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGF2YWlsYWJsZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGF2YWlsYWJsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9UZWxlcmlrLVZlcmlmaWVkLVBsdWdpbnMvSGVhbHRoS2l0LmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vVGVsZXJpay1WZXJpZmllZC1QbHVnaW5zL0hlYWx0aEtpdFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaGVhbHRoS2l0JywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhSGVhbHRoS2l0JywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaXNBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuYXZhaWxhYmxlKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogQ2hlY2sgd2hldGhlciBvciBub3QgdGhlIHVzZXIgZ3JhbnRlZCB5b3VyIGFwcCBhY2Nlc3MgdG8gYSBzcGVjaWZpYyBIZWFsdGhLaXQgdHlwZS5cbiAgICAgICAqIFJlZmVyZW5jZSBmb3IgcG9zc2libGUgdHlwZXM6XG4gICAgICAgKiBodHRwczovL2RldmVsb3Blci5hcHBsZS5jb20vbGlicmFyeS9pb3MvZG9jdW1lbnRhdGlvbi9IZWFsdGhLaXQvUmVmZXJlbmNlL0hlYWx0aEtpdF9Db25zdGFudHMvXG4gICAgICAgKi9cbiAgICAgIGNoZWNrQXV0aFN0YXR1czogZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHR5cGUgPSB0eXBlIHx8ICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJIZWlnaHQnO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuY2hlY2tBdXRoU3RhdHVzKHtcbiAgICAgICAgICAndHlwZSc6IHR5cGVcbiAgICAgICAgfSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXF1ZXN0IGF1dGhvcml6YXRpb24gdG8gYWNjZXNzIEhlYWx0aEtpdCBkYXRhLiBTZWUgdGhlIGZ1bGwgSGVhbHRoS2l0IGNvbnN0YW50c1xuICAgICAgICogcmVmZXJlbmNlIGZvciBwb3NzaWJsZSByZWFkIGFuZCB3cml0ZSB0eXBlczpcbiAgICAgICAqIGh0dHBzOi8vZGV2ZWxvcGVyLmFwcGxlLmNvbS9saWJyYXJ5L2lvcy9kb2N1bWVudGF0aW9uL0hlYWx0aEtpdC9SZWZlcmVuY2UvSGVhbHRoS2l0X0NvbnN0YW50cy9cbiAgICAgICAqL1xuICAgICAgcmVxdWVzdEF1dGhvcml6YXRpb246IGZ1bmN0aW9uIChyZWFkVHlwZXMsIHdyaXRlVHlwZXMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHJlYWRUeXBlcyA9IHJlYWRUeXBlcyB8fCBbXG4gICAgICAgICAgJ0hLQ2hhcmFjdGVyaXN0aWNUeXBlSWRlbnRpZmllckRhdGVPZkJpcnRoJywgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckFjdGl2ZUVuZXJneUJ1cm5lZCcsICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJIZWlnaHQnXG4gICAgICAgIF07XG4gICAgICAgIHdyaXRlVHlwZXMgPSB3cml0ZVR5cGVzIHx8IFtcbiAgICAgICAgICAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVyQWN0aXZlRW5lcmd5QnVybmVkJywgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckhlaWdodCcsICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJEaXN0YW5jZUN5Y2xpbmcnXG4gICAgICAgIF07XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5yZXF1ZXN0QXV0aG9yaXphdGlvbih7XG4gICAgICAgICAgJ3JlYWRUeXBlcyc6IHJlYWRUeXBlcyxcbiAgICAgICAgICAnd3JpdGVUeXBlcyc6IHdyaXRlVHlwZXNcbiAgICAgICAgfSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZERhdGVPZkJpcnRoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5yZWFkRGF0ZU9mQmlydGgoXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZEdlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQucmVhZEdlbmRlcihcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzYXZlV2VpZ2h0OiBmdW5jdGlvbiAodmFsdWUsIHVuaXRzLCBkYXRlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5zYXZlV2VpZ2h0KHtcbiAgICAgICAgICAgICd1bml0JzogdW5pdHMgfHwgJ2xiJyxcbiAgICAgICAgICAgICdhbW91bnQnOiB2YWx1ZSxcbiAgICAgICAgICAgICdkYXRlJzogZGF0ZSB8fCBuZXcgRGF0ZSgpXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZFdlaWdodDogZnVuY3Rpb24gKHVuaXRzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5yZWFkV2VpZ2h0KHtcbiAgICAgICAgICAgICd1bml0JzogdW5pdHMgfHwgJ2xiJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNhdmVIZWlnaHQ6IGZ1bmN0aW9uICh2YWx1ZSwgdW5pdHMsIGRhdGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnNhdmVIZWlnaHQoe1xuICAgICAgICAgICAgJ3VuaXQnOiB1bml0cyB8fCAnaW4nLFxuICAgICAgICAgICAgJ2Ftb3VudCc6IHZhbHVlLFxuICAgICAgICAgICAgJ2RhdGUnOiBkYXRlIHx8IG5ldyBEYXRlKClcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgcmVhZEhlaWdodDogZnVuY3Rpb24gKHVuaXRzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5yZWFkSGVpZ2h0KHtcbiAgICAgICAgICAgICd1bml0JzogdW5pdHMgfHwgJ2luJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZmluZFdvcmtvdXRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5maW5kV29ya291dHMoe30sXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogU2F2ZSBhIHdvcmtvdXQuXG4gICAgICAgKlxuICAgICAgICogV29ya291dCBwYXJhbSBzaG91bGQgYmUgb2YgdGhlIGZvcm1hdDpcbiAgICAgICB7XG4gICAgICAgICAnYWN0aXZpdHlUeXBlJzogJ0hLV29ya291dEFjdGl2aXR5VHlwZUN5Y2xpbmcnLCAvLyBIS1dvcmtvdXRBY3Rpdml0eVR5cGUgY29uc3RhbnQgKGh0dHBzOi8vZGV2ZWxvcGVyLmFwcGxlLmNvbS9saWJyYXJ5L2lvcy9kb2N1bWVudGF0aW9uL0hlYWx0aEtpdC9SZWZlcmVuY2UvSEtXb3Jrb3V0X0NsYXNzLyMvL2FwcGxlX3JlZi9jL3RkZWYvSEtXb3Jrb3V0QWN0aXZpdHlUeXBlKVxuICAgICAgICAgJ3F1YW50aXR5VHlwZSc6ICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJEaXN0YW5jZUN5Y2xpbmcnLFxuICAgICAgICAgJ3N0YXJ0RGF0ZSc6IG5ldyBEYXRlKCksIC8vIG1hbmRhdG9yeVxuICAgICAgICAgJ2VuZERhdGUnOiBudWxsLCAvLyBvcHRpb25hbCwgdXNlIGVpdGhlciB0aGlzIG9yIGR1cmF0aW9uXG4gICAgICAgICAnZHVyYXRpb24nOiAzNjAwLCAvLyBpbiBzZWNvbmRzLCBvcHRpb25hbCwgdXNlIGVpdGhlciB0aGlzIG9yIGVuZERhdGVcbiAgICAgICAgICdlbmVyZ3knOiAzMDAsIC8vXG4gICAgICAgICAnZW5lcmd5VW5pdCc6ICdrY2FsJywgLy8gSnxjYWx8a2NhbFxuICAgICAgICAgJ2Rpc3RhbmNlJzogMTEsIC8vIG9wdGlvbmFsXG4gICAgICAgICAnZGlzdGFuY2VVbml0JzogJ2ttJyAvLyBwcm9iYWJseSB1c2VmdWwgd2l0aCB0aGUgZm9ybWVyIHBhcmFtXG4gICAgICAgICAvLyAnZXh0cmFEYXRhJzogXCJcIiwgLy8gTm90IHN1cmUgaG93IG5lY2Vzc2FyeSB0aGlzIGlzXG4gICAgICAgfSxcbiAgICAgICAqL1xuICAgICAgc2F2ZVdvcmtvdXQ6IGZ1bmN0aW9uICh3b3Jrb3V0KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5zYXZlV29ya291dCh3b3Jrb3V0LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFNhbXBsZSBhbnkga2luZCBvZiBoZWFsdGggZGF0YSB0aHJvdWdoIGEgZ2l2ZW4gZGF0ZSByYW5nZS5cbiAgICAgICAqIHNhbXBsZVF1ZXJ5IG9mIHRoZSBmb3JtYXQ6XG4gICAgICAge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3N0YXJ0RGF0ZSc6IHllc3RlcmRheSwgLy8gbWFuZGF0b3J5XG5cdFx0XHRcdFx0XHRcdFx0XHQnZW5kRGF0ZSc6IHRvbW9ycm93LCAvLyBtYW5kYXRvcnlcblx0XHRcdFx0XHRcdFx0XHRcdCdzYW1wbGVUeXBlJzogJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckhlaWdodCcsXG5cdFx0XHRcdFx0XHRcdFx0XHQndW5pdCcgOiAnY20nXG5cdFx0XHRcdFx0XHRcdH0sXG4gICAgICAgKi9cbiAgICAgIHF1ZXJ5U2FtcGxlVHlwZTogZnVuY3Rpb24gKHNhbXBsZVF1ZXJ5KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5xdWVyeVNhbXBsZVR5cGUoc2FtcGxlUXVlcnksXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1odHRwZC5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLWh0dHBkXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5odHRwZCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUh0dHBkJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXJ0U2VydmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLkNvckh0dHBkLnN0YXJ0U2VydmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdG9wU2VydmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuQ29ySHR0cGQuc3RvcFNlcnZlcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0VVJMOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuQ29ySHR0cGQuZ2V0VVJMKGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgICAgICBkLnJlc29sdmUodXJsKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRMb2NhbFBhdGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5Db3JIdHRwZC5nZXRMb2NhbFBhdGgoZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgICAgICBkLnJlc29sdmUocGF0aCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWlhZC5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1pYWRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmlBZCcsIFtdKVxuICAuZmFjdG9yeSgnJGNvcmRvdmFpQWQnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vd3ltc2VlL2NvcmRvdmEtaW1hZ2VQaWNrZXIuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vd3ltc2VlL2NvcmRvdmEtaW1hZ2VQaWNrZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmltYWdlUGlja2VyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhSW1hZ2VQaWNrZXInLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRQaWN0dXJlczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaW1hZ2VQaWNrZXIuZ2V0UGljdHVyZXMoZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0cyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4taW5hcHBicm93c2VyXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1pbmFwcGJyb3dzZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmluQXBwQnJvd3NlcicsIFtdKVxuXG4gIC5wcm92aWRlcignJGNvcmRvdmFJbkFwcEJyb3dzZXInLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHJlZjtcbiAgICB2YXIgZGVmYXVsdE9wdGlvbnMgPSB0aGlzLmRlZmF1bHRPcHRpb25zID0ge307XG5cbiAgICB0aGlzLnNldERlZmF1bHRPcHRpb25zID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgY29uZmlnKTtcbiAgICB9O1xuXG4gICAgdGhpcy4kZ2V0ID0gWyckcm9vdFNjb3BlJywgJyRxJywgJyR3aW5kb3cnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsICR3aW5kb3csICR0aW1lb3V0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvcGVuOiBmdW5jdGlvbiAodXJsLCB0YXJnZXQsIHJlcXVlc3RPcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKHJlcXVlc3RPcHRpb25zICYmICFhbmd1bGFyLmlzT2JqZWN0KHJlcXVlc3RPcHRpb25zKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ29wdGlvbnMgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIG9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMsIHJlcXVlc3RPcHRpb25zKTtcblxuICAgICAgICAgIHZhciBvcHQgPSBbXTtcbiAgICAgICAgICBhbmd1bGFyLmZvckVhY2gob3B0aW9ucywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgIG9wdC5wdXNoKGtleSArICc9JyArIHZhbHVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICB2YXIgb3B0aW9uc1N0cmluZyA9IG9wdC5qb2luKCk7XG5cbiAgICAgICAgICByZWYgPSAkd2luZG93Lm9wZW4odXJsLCB0YXJnZXQsIG9wdGlvbnNTdHJpbmcpO1xuXG4gICAgICAgICAgcmVmLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRzdGFydCcsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhSW5BcHBCcm93c2VyOmxvYWRzdGFydCcsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAgIHJlZi5hZGRFdmVudExpc3RlbmVyKCdsb2Fkc3RvcCcsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGV2ZW50KTtcbiAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUluQXBwQnJvd3Nlcjpsb2Fkc3RvcCcsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAgIHJlZi5hZGRFdmVudExpc3RlbmVyKCdsb2FkZXJyb3InLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGV2ZW50KTtcbiAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUluQXBwQnJvd3Nlcjpsb2FkZXJyb3InLCBldmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgICByZWYuYWRkRXZlbnRMaXN0ZW5lcignZXhpdCcsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhSW5BcHBCcm93c2VyOmV4aXQnLCBldmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNsb3NlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmVmLmNsb3NlKCk7XG4gICAgICAgICAgcmVmID0gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICBzaG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmVmLnNob3coKTtcbiAgICAgICAgfSxcblxuICAgICAgICBleGVjdXRlU2NyaXB0OiBmdW5jdGlvbiAoZGV0YWlscykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIHJlZi5leGVjdXRlU2NyaXB0KGRldGFpbHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBpbnNlcnRDU1M6IGZ1bmN0aW9uIChkZXRhaWxzKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgcmVmLmluc2VydENTUyhkZXRhaWxzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9JbnNvbW5pYS1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vSW5zb21uaWEtUGhvbmVHYXAtUGx1Z2luXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5zb21uaWEnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFJbnNvbW5pYScsIFsnJHdpbmRvdycsIGZ1bmN0aW9uICgkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAga2VlcEF3YWtlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbnMuaW5zb21uaWEua2VlcEF3YWtlKCk7XG4gICAgICB9LFxuICAgICAgYWxsb3dTbGVlcEFnYWluOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbnMuaW5zb21uaWEuYWxsb3dTbGVlcEFnYWluKCk7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgY29yZG92YSBwbHVnaW5zIGFkZCBodHRwczovL2dpdGh1Yi5jb20vdnN0aXJidS9JbnN0YWdyYW1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS92c3RpcmJ1L0luc3RhZ3JhbVBsdWdpblxuXG4vKiBnbG9iYWxzIEluc3RhZ3JhbTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmluc3RhZ3JhbScsIFtdKVxuXG4uZmFjdG9yeSgnJGNvcmRvdmFJbnN0YWdyYW0nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgcmV0dXJuIHtcbiAgICBzaGFyZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgaWYgKCF3aW5kb3cuSW5zdGFncmFtKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1RyaWVkIHRvIGNhbGwgSW5zdGFncmFtLnNoYXJlIGJ1dCB0aGUgSW5zdGFncmFtIHBsdWdpbiBpc25cXCd0IGluc3RhbGxlZCEnKTtcbiAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgICBJbnN0YWdyYW0uc2hhcmUob3B0aW9ucy5pbWFnZSwgb3B0aW9ucy5jYXB0aW9uLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIGlmKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgfSxcbiAgICBpc0luc3RhbGxlZDogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICBpZiAoIXdpbmRvdy5JbnN0YWdyYW0pIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignVHJpZWQgdG8gY2FsbCBJbnN0YWdyYW0uaXNJbnN0YWxsZWQgYnV0IHRoZSBJbnN0YWdyYW0gcGx1Z2luIGlzblxcJ3QgaW5zdGFsbGVkIScpO1xuICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIEluc3RhZ3JhbS5pc0luc3RhbGxlZChmdW5jdGlvbiAoZXJyLCBpbnN0YWxsZWQpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGluc3RhbGxlZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICB9XG4gIH07XG59XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9kcmlmdHljby9pb25pYy1wbHVnaW5zLWtleWJvYXJkLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vZHJpZnR5Y28vaW9uaWMtcGx1Z2lucy1rZXlib2FyZFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMua2V5Ym9hcmQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFLZXlib2FyZCcsIFsnJHJvb3RTY29wZScsIGZ1bmN0aW9uICgkcm9vdFNjb3BlKSB7XG5cbiAgICB2YXIga2V5Ym9hcmRTaG93RXZlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAkcm9vdFNjb3BlLiRldmFsQXN5bmMoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhS2V5Ym9hcmQ6c2hvdycpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHZhciBrZXlib2FyZEhpZGVFdmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICRyb290U2NvcGUuJGV2YWxBc3luYyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFLZXlib2FyZDpoaWRlJyk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoY29yZG92YS5wbHVnaW5zLktleWJvYXJkKSB7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCduYXRpdmUua2V5Ym9hcmRzaG93Jywga2V5Ym9hcmRTaG93RXZlbnQsIGZhbHNlKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ25hdGl2ZS5rZXlib2FyZGhpZGUnLCBrZXlib2FyZEhpZGVFdmVudCwgZmFsc2UpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhpZGVBY2Nlc3NvcnlCYXI6IGZ1bmN0aW9uIChib29sKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQuaGlkZUtleWJvYXJkQWNjZXNzb3J5QmFyKGJvb2wpO1xuICAgICAgfSxcblxuICAgICAgY2xvc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZC5jbG9zZSgpO1xuICAgICAgfSxcblxuICAgICAgc2hvdzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLktleWJvYXJkLnNob3coKTtcbiAgICAgIH0sXG5cbiAgICAgIGRpc2FibGVTY3JvbGw6IGZ1bmN0aW9uIChib29sKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQuZGlzYWJsZVNjcm9sbChib29sKTtcbiAgICAgIH0sXG5cbiAgICAgIGlzVmlzaWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLktleWJvYXJkLmlzVmlzaWJsZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyU2hvd1dhdGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ25hdGl2ZS5rZXlib2FyZHNob3cnLCBrZXlib2FyZFNob3dFdmVudCk7XG4gICAgICAgICRyb290U2NvcGUuJCRsaXN0ZW5lcnNbJyRjb3Jkb3ZhS2V5Ym9hcmQ6c2hvdyddID0gW107XG4gICAgICB9LFxuXG4gICAgICBjbGVhckhpZGVXYXRjaDogZnVuY3Rpb24gKCkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCduYXRpdmUua2V5Ym9hcmRoaWRlJywga2V5Ym9hcmRIaWRlRXZlbnQpO1xuICAgICAgICAkcm9vdFNjb3BlLiQkbGlzdGVuZXJzWyckY29yZG92YUtleWJvYXJkOmhpZGUnXSA9IFtdO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3NoYXpyb24vS2V5Y2hhaW5QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9zaGF6cm9uL0tleWNoYWluUGx1Z2luXG5cbi8qIGdsb2JhbHMgS2V5Y2hhaW46IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5rZXljaGFpbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUtleWNoYWluJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldEZvcktleTogZnVuY3Rpb24gKGtleSwgc2VydmljZU5hbWUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIGtjID0gbmV3IEtleWNoYWluKCk7XG5cbiAgICAgICAga2MuZ2V0Rm9yS2V5KGRlZmVyLnJlc29sdmUsIGRlZmVyLnJlamVjdCwga2V5LCBzZXJ2aWNlTmFtZSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXRGb3JLZXk6IGZ1bmN0aW9uIChrZXksIHNlcnZpY2VOYW1lLCB2YWx1ZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAga2MgPSBuZXcgS2V5Y2hhaW4oKTtcblxuICAgICAgICBrYy5zZXRGb3JLZXkoZGVmZXIucmVzb2x2ZSwgZGVmZXIucmVqZWN0LCBrZXksIHNlcnZpY2VOYW1lLCB2YWx1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVGb3JLZXk6IGZ1bmN0aW9uIChrZXksIHNlcnZpY2VOYW1lKSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBrYyA9IG5ldyBLZXljaGFpbigpO1xuXG4gICAgICAgIGtjLnJlbW92ZUZvcktleShkZWZlci5yZXNvbHZlLCBkZWZlci5yZWplY3QsIGtleSwgc2VydmljZU5hbWUpO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgdWsuY28ud29ya2luZ2VkZ2UucGhvbmVnYXAucGx1Z2luLmxhdW5jaG5hdmlnYXRvclxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vZHBhOTljL3Bob25lZ2FwLWxhdW5jaC1uYXZpZ2F0b3JcblxuLyogZ2xvYmFscyBsYXVuY2huYXZpZ2F0b3I6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5sYXVuY2hOYXZpZ2F0b3InLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFMYXVuY2hOYXZpZ2F0b3InLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbmF2aWdhdGU6IGZ1bmN0aW9uIChkZXN0aW5hdGlvbiwgc3RhcnQsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBsYXVuY2huYXZpZ2F0b3IubmF2aWdhdGUoXG4gICAgICAgICAgZGVzdGluYXRpb24sXG4gICAgICAgICAgc3RhcnQsXG4gICAgICAgICAgZnVuY3Rpb24gKCl7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcil7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSxcblx0XHQgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tbG9jYWwtbm90aWZpY2F0aW9ucy5naXRcbi8vIGxpbmsgICAgICA6ICBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWxvY2FsLW5vdGlmaWNhdGlvbnNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmxvY2FsTm90aWZpY2F0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb24nLCBbJyRxJywgJyR3aW5kb3cnLCAnJHJvb3RTY29wZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdywgJHJvb3RTY29wZSwgJHRpbWVvdXQpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgkd2luZG93LmNvcmRvdmEgJiZcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMgJiZcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uICYmXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbCkge1xuICAgICAgICAvLyAtLS0tLSBcIlNjaGVkdWxpbmdcIiBldmVudHNcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgc2NoZWR1bGVkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignc2NoZWR1bGUnLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpzY2hlZHVsZScsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgdHJpZ2dlcmVkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbigndHJpZ2dlcicsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOnRyaWdnZXInLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLS0tLS0gXCJVcGRhdGVcIiBldmVudHNcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgdXBkYXRlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ3VwZGF0ZScsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOnVwZGF0ZScsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0tLSBcIkNsZWFyXCIgZXZlbnRzXG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIGNsZWFyZWQgZnJvbSB0aGUgbm90aWZpY2F0aW9uIGNlbnRlclxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ2NsZWFyJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246Y2xlYXInLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWxsIGxvY2FsIG5vdGlmaWNhdGlvbnMgd2VyZSBjbGVhcmVkIGZyb20gdGhlIG5vdGlmaWNhdGlvbiBjZW50ZXJcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdjbGVhcmFsbCcsIGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpjbGVhcmFsbCcsIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLS0tLS0gXCJDYW5jZWxcIiBldmVudHNcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgY2FuY2VsbGVkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignY2FuY2VsJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246Y2FuY2VsJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFsbCBsb2NhbCBub3RpZmljYXRpb25zIHdlcmUgY2FuY2VsbGVkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignY2FuY2VsYWxsJywgZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOmNhbmNlbGFsbCcsIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLS0tLS0gT3RoZXIgZXZlbnRzXG5cbiAgICAgICAgLy8gQSBsb2NhbCBub3RpZmljYXRpb24gd2FzIGNsaWNrZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdjbGljaycsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOmNsaWNrJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sIGZhbHNlKTtcbiAgICByZXR1cm4ge1xuICAgICAgc2NoZWR1bGU6IGZ1bmN0aW9uIChvcHRpb25zLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuc2NoZWR1bGUob3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGFkZDogZnVuY3Rpb24gKG9wdGlvbnMsIHNjb3BlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignRGVwcmVjYXRlZDogdXNlIFwic2NoZWR1bGVcIiBpbnN0ZWFkLicpO1xuXG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5zY2hlZHVsZShvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdXBkYXRlOiBmdW5jdGlvbiAob3B0aW9ucywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnVwZGF0ZShvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXI6IGZ1bmN0aW9uIChpZHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5jbGVhcihpZHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhckFsbDogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5jbGVhckFsbChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoaWRzLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuY2FuY2VsKGlkcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNhbmNlbEFsbDogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5jYW5jZWxBbGwoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzUHJlc2VudDogZnVuY3Rpb24gKGlkLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuaXNQcmVzZW50KGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNTY2hlZHVsZWQ6IGZ1bmN0aW9uIChpZCwgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmlzU2NoZWR1bGVkKGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNUcmlnZ2VyZWQ6IGZ1bmN0aW9uIChpZCwgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmlzVHJpZ2dlcmVkKGlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGFzUGVybWlzc2lvbjogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5oYXNQZXJtaXNzaW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVnaXN0ZXJQZXJtaXNzaW9uOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnJlZ2lzdGVyUGVybWlzc2lvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByb21wdEZvclBlcm1pc3Npb246IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0RlcHJlY2F0ZWQ6IHVzZSBcInJlZ2lzdGVyUGVybWlzc2lvblwiIGluc3RlYWQuJyk7XG5cbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnJlZ2lzdGVyUGVybWlzc2lvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEFsbElkczogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRBbGxJZHMoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldElkczogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRJZHMoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFNjaGVkdWxlZElkczogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRTY2hlZHVsZWRJZHMoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFRyaWdnZXJlZElkczogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRUcmlnZ2VyZWRJZHMoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldDogZnVuY3Rpb24gKGlkcywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldChpZHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRBbGw6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0QWxsKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRTY2hlZHVsZWQ6IGZ1bmN0aW9uIChpZHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRTY2hlZHVsZWQoaWRzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0QWxsU2NoZWR1bGVkOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldEFsbFNjaGVkdWxlZChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0VHJpZ2dlcmVkOiBmdW5jdGlvbiAoaWRzLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0VHJpZ2dlcmVkKGlkcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEFsbFRyaWdnZXJlZDogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRBbGxUcmlnZ2VyZWQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldERlZmF1bHRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0RGVmYXVsdHMoKTtcbiAgICAgIH0sXG5cbiAgICAgIHNldERlZmF1bHRzOiBmdW5jdGlvbiAoT2JqZWN0KSB7XG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5zZXREZWZhdWx0cyhPYmplY3QpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1tbWVkaWEuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tbW1lZGlhXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5tTWVkaWFBZHMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFNTWVkaWFBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLW1lZGlhXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tbWVkaWFcblxuLyogZ2xvYmFscyBNZWRpYTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm1lZGlhJywgW10pXG5cbi5zZXJ2aWNlKCdOZXdNZWRpYScsIFsnJHEnLCAnJGludGVydmFsJywgZnVuY3Rpb24gKCRxLCAkaW50ZXJ2YWwpIHtcbiAgdmFyIHEsIHEyLCBxMywgbWVkaWFTdGF0dXMgPSBudWxsLCBtZWRpYVBvc2l0aW9uID0gLTEsIG1lZGlhVGltZXIsIG1lZGlhRHVyYXRpb24gPSAtMTtcblxuICBmdW5jdGlvbiBzZXRUaW1lcihtZWRpYSkge1xuICAgICAgaWYgKGFuZ3VsYXIuaXNEZWZpbmVkKG1lZGlhVGltZXIpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbWVkaWFUaW1lciA9ICRpbnRlcnZhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgaWYgKG1lZGlhRHVyYXRpb24gPCAwKSB7XG4gICAgICAgICAgICAgIG1lZGlhRHVyYXRpb24gPSBtZWRpYS5nZXREdXJhdGlvbigpO1xuICAgICAgICAgICAgICBpZiAocSAmJiBtZWRpYUR1cmF0aW9uID4gMCkge1xuICAgICAgICAgICAgICAgIHEubm90aWZ5KHtkdXJhdGlvbjogbWVkaWFEdXJhdGlvbn0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbWVkaWEuZ2V0Q3VycmVudFBvc2l0aW9uKFxuICAgICAgICAgICAgLy8gc3VjY2VzcyBjYWxsYmFja1xuICAgICAgICAgICAgZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uID4gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVkaWFQb3NpdGlvbiA9IHBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvLyBlcnJvciBjYWxsYmFja1xuICAgICAgICAgICAgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRXJyb3IgZ2V0dGluZyBwb3M9JyArIGUpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAocSkge1xuICAgICAgICAgICAgcS5ub3RpZnkoe3Bvc2l0aW9uOiBtZWRpYVBvc2l0aW9ufSk7XG4gICAgICAgICAgfVxuXG4gICAgICB9LCAxMDAwKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyVGltZXIoKSB7XG4gICAgICBpZiAoYW5ndWxhci5pc0RlZmluZWQobWVkaWFUaW1lcikpIHtcbiAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKG1lZGlhVGltZXIpO1xuICAgICAgICAgIG1lZGlhVGltZXIgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXNldFZhbHVlcygpIHtcbiAgICAgIG1lZGlhUG9zaXRpb24gPSAtMTtcbiAgICAgIG1lZGlhRHVyYXRpb24gPSAtMTtcbiAgfVxuXG4gIGZ1bmN0aW9uIE5ld01lZGlhKHNyYykge1xuICAgICAgdGhpcy5tZWRpYSA9IG5ldyBNZWRpYShzcmMsXG4gICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVyKCk7XG4gICAgICAgICAgICByZXNldFZhbHVlcygpO1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZXIoKTtcbiAgICAgICAgICAgIHJlc2V0VmFsdWVzKCk7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICAgICAgIG1lZGlhU3RhdHVzID0gc3RhdHVzO1xuICAgICAgICAgICAgcS5ub3RpZnkoe3N0YXR1czogbWVkaWFTdGF0dXN9KTtcbiAgICAgICAgfSk7XG4gIH1cblxuICAvLyBpT1MgcXVpcmtzIDpcbiAgLy8gLSAgbXlNZWRpYS5wbGF5KHsgbnVtYmVyT2ZMb29wczogMiB9KSAtPiBsb29waW5nXG4gIC8vIC0gIG15TWVkaWEucGxheSh7IHBsYXlBdWRpb1doZW5TY3JlZW5Jc0xvY2tlZCA6IGZhbHNlIH0pXG4gIE5ld01lZGlhLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgfVxuXG4gICAgICB0aGlzLm1lZGlhLnBsYXkob3B0aW9ucyk7XG5cbiAgICAgIHNldFRpbWVyKHRoaXMubWVkaWEpO1xuXG4gICAgICByZXR1cm4gcS5wcm9taXNlO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNsZWFyVGltZXIoKTtcbiAgICAgIHRoaXMubWVkaWEucGF1c2UoKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuc3RvcCAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLm1lZGlhLnN0b3AoKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUucmVsZWFzZSAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLm1lZGlhLnJlbGVhc2UoKTtcbiAgICAgIHRoaXMubWVkaWEgPSB1bmRlZmluZWQ7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnNlZWtUbyAgPSBmdW5jdGlvbiAodGltaW5nKSB7XG4gICAgICB0aGlzLm1lZGlhLnNlZWtUbyh0aW1pbmcpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5zZXRWb2x1bWUgPSBmdW5jdGlvbiAodm9sdW1lKSB7XG4gICAgICB0aGlzLm1lZGlhLnNldFZvbHVtZSh2b2x1bWUpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5zdGFydFJlY29yZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMubWVkaWEuc3RhcnRSZWNvcmQoKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuc3RvcFJlY29yZCAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLm1lZGlhLnN0b3BSZWNvcmQoKTtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuY3VycmVudFRpbWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBxMiA9ICRxLmRlZmVyKCk7XG4gICAgICB0aGlzLm1lZGlhLmdldEN1cnJlbnRQb3NpdGlvbihmdW5jdGlvbiAocG9zaXRpb24pe1xuICAgICAgcTIucmVzb2x2ZShwb3NpdGlvbik7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBxMi5wcm9taXNlO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5nZXREdXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBxMyA9ICRxLmRlZmVyKCk7XG4gICAgdGhpcy5tZWRpYS5nZXREdXJhdGlvbihmdW5jdGlvbiAoZHVyYXRpb24pe1xuICAgIHEzLnJlc29sdmUoZHVyYXRpb24pO1xuICAgIH0pO1xuICAgIHJldHVybiBxMy5wcm9taXNlO1xuICB9O1xuXG4gIHJldHVybiBOZXdNZWRpYTtcblxufV0pXG4uZmFjdG9yeSgnJGNvcmRvdmFNZWRpYScsIFsnTmV3TWVkaWEnLCBmdW5jdGlvbiAoTmV3TWVkaWEpIHtcbiAgcmV0dXJuIHtcbiAgICAgIG5ld01lZGlhOiBmdW5jdGlvbiAoc3JjKSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBOZXdNZWRpYShzcmMpO1xuICAgICAgfVxuICB9O1xufV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtbW9iZm94LXByby5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLW1vYmZveC1wcm9cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm1vYmZveEFkcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YU1vYkZveEFkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3gucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3gucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zJywgW1xuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYWN0aW9uU2hlZXQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYWRNb2InLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwQXZhaWxhYmlsaXR5JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmFwcFJhdGUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwVmVyc2lvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5iYWNrZ3JvdW5kR2VvbG9jYXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFkZ2UnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFyY29kZVNjYW5uZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmF0dGVyeVN0YXR1cycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5iZWFjb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmxlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJsdWV0b290aFNlcmlhbCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5icmlnaHRuZXNzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmNhbGVuZGFyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmNhbWVyYScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5jYXB0dXJlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmNsaXBib2FyZCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5jb250YWN0cycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5kYXRlUGlja2VyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2VNb3Rpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlT3JpZW50YXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZGlhbG9ncycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5lbWFpbENvbXBvc2VyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZhY2Vib29rJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZhY2Vib29rQWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZpbGUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZVRyYW5zZmVyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZpbGVPcGVuZXIyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmZsYXNobGlnaHQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmx1cnJ5QWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdhJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdlb2xvY2F0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdsb2JhbGl6YXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlQWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZUFuYWx5dGljcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVNYXAnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlUGxheUdhbWUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlUGx1cycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5oZWFsdGhLaXQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaHR0cGQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaUFkJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmltYWdlUGlja2VyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmluQXBwQnJvd3NlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5pbnN0YWdyYW0nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMua2V5Ym9hcmQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMua2V5Y2hhaW4nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubGF1bmNoTmF2aWdhdG9yJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmxvY2FsTm90aWZpY2F0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm1lZGlhJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm1NZWRpYUFkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5tb2Jmb3hBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubW9wdWJBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubmF0aXZlQXVkaW8nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubmV0d29yaycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5waW5EaWFsb2cnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucHJlZmVyZW5jZXMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucHJpbnRlcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5wcm9ncmVzc0luZGljYXRvcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5wdXNoJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnB1c2hfdjUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc21zJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnNvY2lhbFNoYXJpbmcnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc3Bpbm5lckRpYWxvZycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zcGxhc2hzY3JlZW4nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc3FsaXRlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnN0YXR1c2JhcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy50b2FzdCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy50b3VjaGlkJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnZpYnJhdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy52aWRlb0NhcHR1cmVQbHVzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnppcCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5pbnNvbW5pYSdcbl0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLW1vcHViLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLW1vcHViXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5tb3B1YkFkcycsIFtdKVxuICAuZmFjdG9yeSgnJGNvcmRvdmFNb1B1YkFkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6IGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vc2lkbmV5cy9jb3Jkb3ZhLXBsdWdpbi1uYXRpdmVhdWRpby5naXRcbi8vIGxpbmsgICAgICA6IGh0dHBzOi8vZ2l0aHViLmNvbS9zaWRuZXlzL2NvcmRvdmEtcGx1Z2luLW5hdGl2ZWF1ZGlvXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5uYXRpdmVBdWRpbycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YU5hdGl2ZUF1ZGlvJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcHJlbG9hZFNpbXBsZTogZnVuY3Rpb24gKGlkLCBhc3NldFBhdGgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8ucHJlbG9hZFNpbXBsZShpZCwgYXNzZXRQYXRoLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlbG9hZENvbXBsZXg6IGZ1bmN0aW9uIChpZCwgYXNzZXRQYXRoLCB2b2x1bWUsIHZvaWNlcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5wcmVsb2FkQ29tcGxleChpZCwgYXNzZXRQYXRoLCB2b2x1bWUsIHZvaWNlcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHBsYXk6IGZ1bmN0aW9uIChpZCwgY29tcGxldGVDYWxsYmFjaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5wbGF5KGlkLCBjb21wbGV0ZUNhbGxiYWNrLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RvcDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnN0b3AoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbG9vcDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLmxvb3AoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bmxvYWQ6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby51bmxvYWQoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXRWb2x1bWVGb3JDb21wbGV4QXNzZXQ6IGZ1bmN0aW9uIChpZCwgdm9sdW1lKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnNldFZvbHVtZUZvckNvbXBsZXhBc3NldChpZCwgdm9sdW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tbmV0d29yay1pbmZvcm1hdGlvblxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLW5ldHdvcmstaW5mb3JtYXRpb25cblxuLyogZ2xvYmFscyBDb25uZWN0aW9uOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubmV0d29yaycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YU5ldHdvcmsnLCBbJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHRpbWVvdXQpIHtcblxuICAgIC8qKlxuICAgICAgKiBGaXJlcyBvZmZsaW5lIGEgZXZlbnRcbiAgICAgICovXG4gICAgdmFyIG9mZmxpbmVFdmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBuZXR3b3JrU3RhdGUgPSBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlO1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTmV0d29yazpvZmZsaW5lJywgbmV0d29ya1N0YXRlKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgICogRmlyZXMgb25saW5lIGEgZXZlbnRcbiAgICAgICovXG4gICAgdmFyIG9ubGluZUV2ZW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG5ldHdvcmtTdGF0ZSA9IG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGU7XG4gICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFOZXR3b3JrOm9ubGluZScsIG5ldHdvcmtTdGF0ZSk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAobmF2aWdhdG9yLmNvbm5lY3Rpb24pIHtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignb2ZmbGluZScsIG9mZmxpbmVFdmVudCwgZmFsc2UpO1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBvbmxpbmVFdmVudCwgZmFsc2UpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldE5ldHdvcms6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGU7XG4gICAgICB9LFxuXG4gICAgICBpc09ubGluZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbmV0d29ya1N0YXRlID0gbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZTtcbiAgICAgICAgcmV0dXJuIG5ldHdvcmtTdGF0ZSAhPT0gQ29ubmVjdGlvbi5VTktOT1dOICYmIG5ldHdvcmtTdGF0ZSAhPT0gQ29ubmVjdGlvbi5OT05FO1xuICAgICAgfSxcblxuICAgICAgaXNPZmZsaW5lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBuZXR3b3JrU3RhdGUgPSBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlO1xuICAgICAgICByZXR1cm4gbmV0d29ya1N0YXRlID09PSBDb25uZWN0aW9uLlVOS05PV04gfHwgbmV0d29ya1N0YXRlID09PSBDb25uZWN0aW9uLk5PTkU7XG4gICAgICB9LFxuXG4gICAgICBjbGVhck9mZmxpbmVXYXRjaDogZnVuY3Rpb24gKCkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdvZmZsaW5lJywgb2ZmbGluZUV2ZW50KTtcbiAgICAgICAgJHJvb3RTY29wZS4kJGxpc3RlbmVyc1snJGNvcmRvdmFOZXR3b3JrOm9mZmxpbmUnXSA9IFtdO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJPbmxpbmVXYXRjaDogZnVuY3Rpb24gKCkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBvbmxpbmVFdmVudCk7XG4gICAgICAgICRyb290U2NvcGUuJCRsaXN0ZW5lcnNbJyRjb3Jkb3ZhTmV0d29yazpvbmxpbmUnXSA9IFtdO1xuICAgICAgfVxuICAgIH07XG4gIH1dKVxuICAucnVuKFsnJGluamVjdG9yJywgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICRpbmplY3Rvci5nZXQoJyRjb3Jkb3ZhTmV0d29yaycpOyAvL2Vuc3VyZSB0aGUgZmFjdG9yeSBhbHdheXMgZ2V0cyBpbml0aWFsaXNlZFxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9QYWxkb20vUGluRGlhbG9nLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vUGFsZG9tL1BpbkRpYWxvZ1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucGluRGlhbG9nJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUGluRGlhbG9nJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcHJvbXB0OiBmdW5jdGlvbiAobWVzc2FnZSwgdGl0bGUsIGJ1dHRvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5waW5EaWFsb2cucHJvbXB0KG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgfSwgdGl0bGUsIGJ1dHRvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1hcHAtcHJlZmVyZW5jZXNcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwbGEvbWUuYXBsYS5jb3Jkb3ZhLmFwcC1wcmVmZXJlbmNlc1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucHJlZmVyZW5jZXMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFQcmVmZXJlbmNlcycsIFsnJHdpbmRvdycsICckcScsIGZ1bmN0aW9uICgkd2luZG93LCAkcSkge1xuXG4gICAgIHJldHVybiB7XG4gICAgICAgICBcbiAgICAgICAgIHBsdWdpbk5vdEVuYWJsZWRNZXNzYWdlOiAnUGx1Z2luIG5vdCBlbmFibGVkJyxcbiAgICBcdFxuICAgIFx0LyoqXG4gICAgXHQgKiBEZWNvcmF0ZSB0aGUgcHJvbWlzZSBvYmplY3QuXG4gICAgXHQgKiBAcGFyYW0gcHJvbWlzZSBUaGUgcHJvbWlzZSBvYmplY3QuXG4gICAgXHQgKi9cbiAgICBcdGRlY29yYXRlUHJvbWlzZTogZnVuY3Rpb24ocHJvbWlzZSl7XG4gICAgXHRcdHByb21pc2Uuc3VjY2VzcyA9IGZ1bmN0aW9uKGZuKSB7XG5cdCAgICAgICAgICAgIHByb21pc2UudGhlbihmbik7XG5cdCAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuXHQgICAgICAgIH07XG5cblx0ICAgICAgICBwcm9taXNlLmVycm9yID0gZnVuY3Rpb24oZm4pIHtcblx0ICAgICAgICAgICAgcHJvbWlzZS50aGVuKG51bGwsIGZuKTtcblx0ICAgICAgICAgICAgcmV0dXJuIHByb21pc2U7XG5cdCAgICAgICAgfTtcbiAgICBcdH0sXG4gICAgXHRcbiAgICBcdC8qKlxuICAgIFx0ICogU3RvcmUgdGhlIHZhbHVlIG9mIHRoZSBnaXZlbiBkaWN0aW9uYXJ5IGFuZCBrZXkuXG4gICAgXHQgKiBAcGFyYW0ga2V5IFRoZSBrZXkgb2YgdGhlIHByZWZlcmVuY2UuXG4gICAgXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHZhbHVlIHRvIHNldC5cbiAgICAgICAgICogQHBhcmFtIGRpY3QgVGhlIGRpY3Rpb25hcnkuIEl0J3Mgb3B0aW9uYWwuXG4gICAgICAgICAqIEByZXR1cm5zIFJldHVybnMgYSBwcm9taXNlLlxuICAgIFx0ICovXG5cdCAgICBzdG9yZTogZnVuY3Rpb24oa2V5LCB2YWx1ZSwgZGljdCkge1xuXHQgICAgXHR2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXHQgICAgXHR2YXIgcHJvbWlzZSA9IGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIG9rKHZhbHVlKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gZXJyb3JDYWxsYmFjayhlcnJvcil7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihlcnJvcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZigkd2luZG93LnBsdWdpbnMpe1xuICAgICAgICAgICAgICAgIHZhciBzdG9yZVJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAzKXtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmVSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMuc3RvcmUoZGljdCwga2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmVSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMuc3RvcmUoa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHN0b3JlUmVzdWx0LnRoZW4ob2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKHRoaXMucGx1Z2luTm90RW5hYmxlZE1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuXHQgICAgXHR0aGlzLmRlY29yYXRlUHJvbWlzZShwcm9taXNlKTtcblx0ICAgIFx0cmV0dXJuIHByb21pc2U7XG5cdCAgICB9LFxuXHQgICAgXG5cdCAgICAvKipcblx0ICAgICAqIEZldGNoIHRoZSB2YWx1ZSBieSB0aGUgZ2l2ZW4gZGljdGlvbmFyeSBhbmQga2V5LlxuXHQgICAgICogQHBhcmFtIGtleSBUaGUga2V5IG9mIHRoZSBwcmVmZXJlbmNlIHRvIHJldHJpZXZlLlxuICAgICAgICAgKiBAcGFyYW0gZGljdCBUaGUgZGljdGlvbmFyeS4gSXQncyBvcHRpb25hbC5cbiAgICAgICAgICogQHJldHVybnMgUmV0dXJucyBhIHByb21pc2UuXG5cdCAgICAgKi9cblx0ICAgIGZldGNoOiBmdW5jdGlvbihrZXksIGRpY3QpIHtcblx0ICAgIFx0dmFyIGRlZmVycmVkID0gJHEuZGVmZXIoKTtcblx0ICAgIFx0dmFyIHByb21pc2UgPSBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBvayh2YWx1ZSl7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIGVycm9yQ2FsbGJhY2soZXJyb3Ipe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IoZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoJHdpbmRvdy5wbHVnaW5zKXtcbiAgICAgICAgICAgICAgICB2YXIgZmV0Y2hSZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMil7XG4gICAgICAgICAgICAgICAgICAgIGZldGNoUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLmZldGNoKGRpY3QsIGtleSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZmV0Y2hSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMuZmV0Y2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmV0Y2hSZXN1bHQudGhlbihvaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IodGhpcy5wbHVnaW5Ob3RFbmFibGVkTWVzc2FnZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG5cdCAgICBcdHRoaXMuZGVjb3JhdGVQcm9taXNlKHByb21pc2UpO1xuXHQgICAgXHRyZXR1cm4gcHJvbWlzZTtcblx0ICAgIH0sXG4gICAgICAgIFxuICAgICAgICAvKipcblx0ICAgICAqIFJlbW92ZSB0aGUgdmFsdWUgYnkgdGhlIGdpdmVuIGtleS5cblx0ICAgICAqIEBwYXJhbSBrZXkgVGhlIGtleSBvZiB0aGUgcHJlZmVyZW5jZSB0byByZXRyaWV2ZS5cbiAgICAgICAgICogQHBhcmFtIGRpY3QgVGhlIGRpY3Rpb25hcnkuIEl0J3Mgb3B0aW9uYWwuXG4gICAgICAgICAqIEByZXR1cm5zIFJldHVybnMgYSBwcm9taXNlLlxuXHQgICAgICovXG5cdCAgICByZW1vdmU6IGZ1bmN0aW9uKGtleSwgZGljdCkge1xuXHQgICAgXHR2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXHQgICAgXHR2YXIgcHJvbWlzZSA9IGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIG9rKHZhbHVlKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gZXJyb3JDYWxsYmFjayhlcnJvcil7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihlcnJvcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZigkd2luZG93LnBsdWdpbnMpe1xuICAgICAgICAgICAgICAgIHZhciByZW1vdmVSZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMil7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5yZW1vdmUoZGljdCwga2V5KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMucmVtb3ZlKGtleSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlbW92ZVJlc3VsdC50aGVuKG9rLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcih0aGlzLnBsdWdpbk5vdEVuYWJsZWRNZXNzYWdlKSk7XG4gICAgICAgICAgICB9XG5cdCAgICBcdFxuXHQgICAgXHR0aGlzLmRlY29yYXRlUHJvbWlzZShwcm9taXNlKTtcblx0ICAgIFx0cmV0dXJuIHByb21pc2U7XG5cdCAgICB9LFxuICAgICAgICBcbiAgICAgICAgLyoqXG5cdCAgICAgKiBTaG93IHRoZSBhcHBsaWNhdGlvbiBwcmVmZXJlbmNlcy5cbiAgICAgICAgICogQHJldHVybnMgUmV0dXJucyBhIHByb21pc2UuXG5cdCAgICAgKi9cblx0ICAgIHNob3c6IGZ1bmN0aW9uKCkge1xuXHQgICAgXHR2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXHQgICAgXHR2YXIgcHJvbWlzZSA9IGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIG9rKHZhbHVlKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gZXJyb3JDYWxsYmFjayhlcnJvcil7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihlcnJvcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZigkd2luZG93LnBsdWdpbnMpe1xuICAgICAgICAgICAgICAgICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5zaG93KClcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ob2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKHRoaXMucGx1Z2luTm90RW5hYmxlZE1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH1cblx0ICAgIFx0XG5cdCAgICBcdHRoaXMuZGVjb3JhdGVQcm9taXNlKHByb21pc2UpO1xuXHQgICAgXHRyZXR1cm4gcHJvbWlzZTtcblx0ICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tcHJpbnRlci5naXRcbi8vIGxpbmsgICAgICA6IGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tcHJpbnRlclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucHJpbnRlcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVByaW50ZXInLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBpc0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW4ucHJpbnRlci5pc0F2YWlsYWJsZShmdW5jdGlvbiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICBxLnJlc29sdmUoaXNBdmFpbGFibGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJpbnQ6IGZ1bmN0aW9uIChkb2MsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbi5wcmludGVyLnByaW50KGRvYywgb3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9wYmVybmFzY29uaS9jb3Jkb3ZhLXByb2dyZXNzSW5kaWNhdG9yLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwOi8vcGJlcm5hc2NvbmkuZ2l0aHViLmlvL2NvcmRvdmEtcHJvZ3Jlc3NJbmRpY2F0b3IvXG5cbi8qIGdsb2JhbHMgUHJvZ3Jlc3NJbmRpY2F0b3I6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5wcm9ncmVzc0luZGljYXRvcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVByb2dyZXNzJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzaG93OiBmdW5jdGlvbiAoX21lc3NhZ2UpIHtcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBfbWVzc2FnZSB8fCAnUGxlYXNlIHdhaXQuLi4nO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvdyhtZXNzYWdlKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTaW1wbGU6IGZ1bmN0aW9uIChfZGltKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1NpbXBsZShkaW0pO1xuICAgICAgfSxcblxuICAgICAgc2hvd1NpbXBsZVdpdGhMYWJlbDogZnVuY3Rpb24gKF9kaW0sIF9sYWJlbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdMb2FkaW5nLi4uJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dTaW1wbGVXaXRoTGFiZWwoZGltLCBsYWJlbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93U2ltcGxlV2l0aExhYmVsRGV0YWlsOiBmdW5jdGlvbiAoX2RpbSwgX2xhYmVsLCBfZGV0YWlsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ0xvYWRpbmcuLi4nO1xuICAgICAgICB2YXIgZGV0YWlsID0gX2RldGFpbCB8fCAnUGxlYXNlIHdhaXQnO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1NpbXBsZVdpdGhMYWJlbERldGFpbChkaW0sIGxhYmVsLCBkZXRhaWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0RldGVybWluYXRlOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93RGV0ZXJtaW5hdGUoZGltLCB0aW1lb3V0KTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dEZXRlcm1pbmF0ZVdpdGhMYWJlbDogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0LCBfbGFiZWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnTG9hZGluZy4uLic7XG5cbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dEZXRlcm1pbmF0ZVdpdGhMYWJlbChkaW0sIHRpbWVvdXQsIGxhYmVsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dBbm51bGFyOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93QW5udWxhcihkaW0sIHRpbWVvdXQpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0FubnVsYXJXaXRoTGFiZWw6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCwgX2xhYmVsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ0xvYWRpbmcuLi4nO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0FubnVsYXJXaXRoTGFiZWwoZGltLCB0aW1lb3V0LCBsYWJlbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFyOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93QmFyKGRpbSwgdGltZW91dCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFyV2l0aExhYmVsOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQsIF9sYWJlbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdMb2FkaW5nLi4uJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dCYXJXaXRoTGFiZWwoZGltLCB0aW1lb3V0LCBsYWJlbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93U3VjY2VzczogZnVuY3Rpb24gKF9kaW0sIF9sYWJlbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdTdWNjZXNzJztcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dTdWNjZXNzKGRpbSwgbGFiZWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd1RleHQ6IGZ1bmN0aW9uIChfZGltLCBfdGV4dCwgX3Bvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGV4dCA9IF90ZXh0IHx8ICdXYXJuaW5nJztcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gX3Bvc2l0aW9uIHx8ICdjZW50ZXInO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1RleHQoZGltLCB0ZXh0LCBwb3NpdGlvbik7XG4gICAgICB9LFxuXG4gICAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5oaWRlKCk7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC1idWlsZC9QdXNoUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAtYnVpbGQvUHVzaFBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucHVzaCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVB1c2gnLCBbJyRxJywgJyR3aW5kb3cnLCAnJHJvb3RTY29wZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdywgJHJvb3RTY29wZSwgJHRpbWVvdXQpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBvbk5vdGlmaWNhdGlvbjogZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YVB1c2g6bm90aWZpY2F0aW9uUmVjZWl2ZWQnLCBub3RpZmljYXRpb24pO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIHJlZ2lzdGVyOiBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGluamVjdG9yO1xuICAgICAgICBpZiAoY29uZmlnICE9PSB1bmRlZmluZWQgJiYgY29uZmlnLmVjYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tuZy1hcHBdJykgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGluamVjdG9yID0gJ2RvY3VtZW50LmJvZHknO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGluamVjdG9yID0gJ2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXFwnW25nLWFwcF1cXCcpJztcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uZmlnLmVjYiA9ICdhbmd1bGFyLmVsZW1lbnQoJyArIGluamVjdG9yICsgJykuaW5qZWN0b3IoKS5nZXQoXFwnJGNvcmRvdmFQdXNoXFwnKS5vbk5vdGlmaWNhdGlvbic7XG4gICAgICAgIH1cblxuICAgICAgICAkd2luZG93LnBsdWdpbnMucHVzaE5vdGlmaWNhdGlvbi5yZWdpc3RlcihmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgICAgICBxLnJlc29sdmUodG9rZW4pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIGNvbmZpZyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVucmVnaXN0ZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnB1c2hOb3RpZmljYXRpb24udW5yZWdpc3RlcihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIGlPUyBvbmx5XG4gICAgICBzZXRCYWRnZU51bWJlcjogZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5wdXNoTm90aWZpY2F0aW9uLnNldEFwcGxpY2F0aW9uSWNvbkJhZGdlTnVtYmVyKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBudW1iZXIpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBwaG9uZWdhcC1wbHVnaW4tcHVzaFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAvcGhvbmVnYXAtcGx1Z2luLXB1c2hcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnB1c2hfdjUnLCBbXSlcbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUHVzaFY1JyxbJyRxJywgJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHEsICRyb290U2NvcGUsICR0aW1lb3V0KSB7XG4gICAvKmdsb2JhbCBQdXNoTm90aWZpY2F0aW9uKi9cblxuICAgIHZhciBwdXNoO1xuICAgIHJldHVybiB7XG4gICAgICBpbml0aWFsaXplIDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBwdXNoID0gUHVzaE5vdGlmaWNhdGlvbi5pbml0KG9wdGlvbnMpO1xuICAgICAgICBxLnJlc29sdmUocHVzaCk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgb25Ob3RpZmljYXRpb24gOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBwdXNoLm9uKCdub3RpZmljYXRpb24nLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRlbWl0KCckY29yZG92YVB1c2hWNTpub3RpZmljYXRpb25SZWNlaXZlZCcsIG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIG9uRXJyb3IgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBwdXNoLm9uKCdlcnJvcicsIGZ1bmN0aW9uIChlcnJvcikgeyAkcm9vdFNjb3BlLiRlbWl0KCckY29yZG92YVB1c2hWNTplcnJvck9jY3VycmVkJywgZXJyb3IpO30pO1xuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICByZWdpc3RlciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBpZiAocHVzaCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcS5yZWplY3QobmV3IEVycm9yKCdpbml0IG11c3QgYmUgY2FsbGVkIGJlZm9yZSBhbnkgb3RoZXIgb3BlcmF0aW9uJykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2gub24oJ3JlZ2lzdHJhdGlvbicsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICB1bnJlZ2lzdGVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGlmIChwdXNoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBxLnJlamVjdChuZXcgRXJyb3IoJ2luaXQgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGFueSBvdGhlciBvcGVyYXRpb24nKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaC51bnJlZ2lzdGVyKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNldEJhZGdlTnVtYmVyIDogZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGlmIChwdXNoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBxLnJlamVjdChuZXcgRXJyb3IoJ2luaXQgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGFueSBvdGhlciBvcGVyYXRpb24nKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaC5zZXRBcHBsaWNhdGlvbkljb25CYWRnZU51bWJlcihmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sIG51bWJlcik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2dpdGF3ZWdvL2NvcmRvdmEtc2NyZWVuc2hvdC5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZ2l0YXdlZ28vY29yZG92YS1zY3JlZW5zaG90XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zY3JlZW5zaG90JywgW10pXG4uZmFjdG9yeSgnJGNvcmRvdmFTY3JlZW5zaG90JywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuICByZXR1cm4ge1xuICAgIGNhcHR1cmVUb0ZpbGU6IGZ1bmN0aW9uIChvcHRzKSB7XG5cbiAgICAgIHZhciBvcHRpb25zID0gb3B0cyB8fCB7fTtcblxuICAgICAgdmFyIGV4dGVuc2lvbiA9IG9wdGlvbnMuZXh0ZW5zaW9uIHx8ICdqcGcnO1xuICAgICAgdmFyIHF1YWxpdHkgPSBvcHRpb25zLnF1YWxpdHkgfHwgJzEwMCc7XG5cbiAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCk7XG5cbiAgICAgIGlmICghbmF2aWdhdG9yLnNjcmVlbnNob3QpIHtcbiAgICAgICAgZGVmZXIucmVzb2x2ZShudWxsKTtcbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIG5hdmlnYXRvci5zY3JlZW5zaG90LnNhdmUoZnVuY3Rpb24gKGVycm9yLCByZXMpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgZGVmZXIucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWZlci5yZXNvbHZlKHJlcy5maWxlUGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH0sIGV4dGVuc2lvbiwgcXVhbGl0eSwgb3B0aW9ucy5maWxlbmFtZSk7XG5cbiAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgIH0sXG4gICAgY2FwdHVyZVRvVXJpOiBmdW5jdGlvbiAob3B0cykge1xuXG4gICAgICB2YXIgb3B0aW9ucyA9IG9wdHMgfHwge307XG5cbiAgICAgIHZhciBleHRlbnNpb24gPSBvcHRpb25zLmV4dGVuc2lvbiB8fCAnanBnJztcbiAgICAgIHZhciBxdWFsaXR5ID0gb3B0aW9ucy5xdWFsaXR5IHx8ICcxMDAnO1xuXG4gICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpO1xuXG4gICAgICBpZiAoIW5hdmlnYXRvci5zY3JlZW5zaG90KSB7XG4gICAgICAgIGRlZmVyLnJlc29sdmUobnVsbCk7XG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgICAgfVxuXG4gICAgICBuYXZpZ2F0b3Iuc2NyZWVuc2hvdC5VUkkoZnVuY3Rpb24gKGVycm9yLCByZXMpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgZGVmZXIucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWZlci5yZXNvbHZlKHJlcy5VUkkpO1xuICAgICAgICB9XG4gICAgICB9LCBleHRlbnNpb24sIHF1YWxpdHksIG9wdGlvbnMuZmlsZW5hbWUpO1xuXG4gICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICB9XG4gIH07XG59XSk7XG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vY29yZG92YS1zbXMvY29yZG92YS1zbXMtcGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vY29yZG92YS1zbXMvY29yZG92YS1zbXMtcGx1Z2luXG5cbi8qIGdsb2JhbHMgc21zOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc21zJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhU21zJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlbmQ6IGZ1bmN0aW9uIChudW1iZXIsIG1lc3NhZ2UsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzbXMuc2VuZChudW1iZXIsIG1lc3NhZ2UsIG9wdGlvbnMsIGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vU29jaWFsU2hhcmluZy1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9Tb2NpYWxTaGFyaW5nLVBob25lR2FwLVBsdWdpblxuXG4vLyBOT1RFOiBzaGFyZVZpYUVtYWlsIC0+IGlmIHVzZXIgY2FuY2VscyBzaGFyaW5nIGVtYWlsLCBzdWNjZXNzIGlzIHN0aWxsIGNhbGxlZFxuLy8gVE9ETzogYWRkIHN1cHBvcnQgZm9yIGlQYWRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNvY2lhbFNoYXJpbmcnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFTb2NpYWxTaGFyaW5nJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hhcmU6IGZ1bmN0aW9uIChtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc3ViamVjdCA9IHN1YmplY3QgfHwgbnVsbDtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmUobWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYVR3aXR0ZXI6IGZ1bmN0aW9uIChtZXNzYWdlLCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFUd2l0dGVyKG1lc3NhZ2UsIGZpbGUsIGxpbmssIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFXaGF0c0FwcDogZnVuY3Rpb24gKG1lc3NhZ2UsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYVdoYXRzQXBwKG1lc3NhZ2UsIGZpbGUsIGxpbmssIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFGYWNlYm9vazogZnVuY3Rpb24gKG1lc3NhZ2UsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBtZXNzYWdlID0gbWVzc2FnZSB8fCBudWxsO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYUZhY2Vib29rKG1lc3NhZ2UsIGZpbGUsIGxpbmssIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFGYWNlYm9va1dpdGhQYXN0ZU1lc3NhZ2VIaW50OiBmdW5jdGlvbiAobWVzc2FnZSwgZmlsZSwgbGluaywgcGFzdGVNZXNzYWdlSGludCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhRmFjZWJvb2tXaXRoUGFzdGVNZXNzYWdlSGludChtZXNzYWdlLCBmaWxlLCBsaW5rLCBwYXN0ZU1lc3NhZ2VIaW50LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhU01TOiBmdW5jdGlvbiAobWVzc2FnZSwgY29tbWFTZXBhcmF0ZWRQaG9uZU51bWJlcnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYVNNUyhtZXNzYWdlLCBjb21tYVNlcGFyYXRlZFBob25lTnVtYmVycywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYUVtYWlsOiBmdW5jdGlvbiAobWVzc2FnZSwgc3ViamVjdCwgdG9BcnIsIGNjQXJyLCBiY2NBcnIsIGZpbGVBcnIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB0b0FyciA9IHRvQXJyIHx8IG51bGw7XG4gICAgICAgIGNjQXJyID0gY2NBcnIgfHwgbnVsbDtcbiAgICAgICAgYmNjQXJyID0gYmNjQXJyIHx8IG51bGw7XG4gICAgICAgIGZpbGVBcnIgPSBmaWxlQXJyIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhRW1haWwobWVzc2FnZSwgc3ViamVjdCwgdG9BcnIsIGNjQXJyLCBiY2NBcnIsIGZpbGVBcnIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWE6IGZ1bmN0aW9uICh2aWEsIG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBtZXNzYWdlID0gbWVzc2FnZSB8fCBudWxsO1xuICAgICAgICBzdWJqZWN0ID0gc3ViamVjdCB8fCBudWxsO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYSh2aWEsIG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmssIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2FuU2hhcmVWaWFFbWFpbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLmNhblNoYXJlVmlhRW1haWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjYW5TaGFyZVZpYTogZnVuY3Rpb24gKHZpYSwgbWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLmNhblNoYXJlVmlhKHZpYSwgbWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaywgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLmF2YWlsYWJsZShmdW5jdGlvbiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICBpZiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1BhbGRvbS9TcGlubmVyRGlhbG9nLmdpdFxuLy8gbGluayAgICAgIDogICAgICAgaHR0cHM6Ly9naXRodWIuY29tL1BhbGRvbS9TcGlubmVyRGlhbG9nXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zcGlubmVyRGlhbG9nJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhU3Bpbm5lckRpYWxvZycsIFsnJHdpbmRvdycsIGZ1bmN0aW9uICgkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hvdzogZnVuY3Rpb24gKHRpdGxlLCBtZXNzYWdlLCBmaXhlZCkge1xuICAgICAgICBmaXhlZCA9IGZpeGVkIHx8IGZhbHNlO1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW5zLnNwaW5uZXJEaWFsb2cuc2hvdyh0aXRsZSwgbWVzc2FnZSwgZml4ZWQpO1xuICAgICAgfSxcbiAgICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2lucy5zcGlubmVyRGlhbG9nLmhpZGUoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tc3BsYXNoc2NyZWVuXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tc3BsYXNoc2NyZWVuXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zcGxhc2hzY3JlZW4nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFTcGxhc2hzY3JlZW4nLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5zcGxhc2hzY3JlZW4uaGlkZSgpO1xuICAgICAgfSxcblxuICAgICAgc2hvdzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnNwbGFzaHNjcmVlbi5zaG93KCk7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9saXRlaGVscGVycy9Db3Jkb3ZhLXNxbGl0ZS1zdG9yYWdlLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vbGl0ZWhlbHBlcnMvQ29yZG92YS1zcWxpdGUtc3RvcmFnZVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc3FsaXRlJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhU1FMaXRlJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgb3BlbkRCOiBmdW5jdGlvbiAob3B0aW9ucywgYmFja2dyb3VuZCkge1xuXG4gICAgICAgIGlmIChhbmd1bGFyLmlzT2JqZWN0KG9wdGlvbnMpICYmICFhbmd1bGFyLmlzU3RyaW5nKG9wdGlvbnMpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBiYWNrZ3JvdW5kICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0aW9ucy5iZ1R5cGUgPSBiYWNrZ3JvdW5kO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gJHdpbmRvdy5zcWxpdGVQbHVnaW4ub3BlbkRhdGFiYXNlKG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICR3aW5kb3cuc3FsaXRlUGx1Z2luLm9wZW5EYXRhYmFzZSh7XG4gICAgICAgICAgbmFtZTogb3B0aW9ucyxcbiAgICAgICAgICBiZ1R5cGU6IGJhY2tncm91bmRcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICBleGVjdXRlOiBmdW5jdGlvbiAoZGIsIHF1ZXJ5LCBiaW5kaW5nKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oZnVuY3Rpb24gKHR4KSB7XG4gICAgICAgICAgdHguZXhlY3V0ZVNxbChxdWVyeSwgYmluZGluZywgZnVuY3Rpb24gKHR4LCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKHRyYW5zYWN0aW9uLCBlcnJvcikge1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpbnNlcnRDb2xsZWN0aW9uOiBmdW5jdGlvbiAoZGIsIHF1ZXJ5LCBiaW5kaW5ncykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBjb2xsID0gYmluZGluZ3Muc2xpY2UoMCk7IC8vIGNsb25lIGNvbGxlY3Rpb25cblxuICAgICAgICBkYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodHgpIHtcbiAgICAgICAgICAoZnVuY3Rpb24gaW5zZXJ0T25lKCkge1xuICAgICAgICAgICAgdmFyIHJlY29yZCA9IGNvbGwuc3BsaWNlKDAsIDEpWzBdOyAvLyBnZXQgdGhlIGZpcnN0IHJlY29yZCBvZiBjb2xsIGFuZCByZWR1Y2UgY29sbCBieSBvbmVcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHR4LmV4ZWN1dGVTcWwocXVlcnksIHJlY29yZCwgZnVuY3Rpb24gKHR4LCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpbnNlcnRPbmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh0cmFuc2FjdGlvbiwgZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgICBxLnJlamVjdChleGNlcHRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbmVzdGVkRXhlY3V0ZTogZnVuY3Rpb24gKGRiLCBxdWVyeTEsIHF1ZXJ5MiwgYmluZGluZzEsIGJpbmRpbmcyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBkYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodHgpIHtcbiAgICAgICAgICAgIHR4LmV4ZWN1dGVTcWwocXVlcnkxLCBiaW5kaW5nMSwgZnVuY3Rpb24gKHR4LCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgIHR4LmV4ZWN1dGVTcWwocXVlcnkyLCBiaW5kaW5nMiwgZnVuY3Rpb24gKHR4LCByZXMpIHtcbiAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uICh0cmFuc2FjdGlvbiwgZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGVsZXRlREI6IGZ1bmN0aW9uIChkYk5hbWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuc3FsaXRlUGx1Z2luLmRlbGV0ZURhdGFiYXNlKGRiTmFtZSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLXN0YXR1c2JhclxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLXN0YXR1c2JhclxuXG4vKiBnbG9iYWxzIFN0YXR1c0JhcjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnN0YXR1c2JhcicsIFtdKVxuXG4uZmFjdG9yeSgnJGNvcmRvdmFTdGF0dXNiYXInLCBbZnVuY3Rpb24gKCkge1xuXG4gIHJldHVybiB7XG5cbiAgICAvKipcbiAgICAgICogQHBhcmFtIHtib29sZWFufSBib29sXG4gICAgICAqL1xuICAgIG92ZXJsYXlzV2ViVmlldzogZnVuY3Rpb24gKGJvb2wpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIub3ZlcmxheXNXZWJWaWV3KCEhYm9vbCk7XG4gICAgfSxcblxuICAgIFNUWUxFUzoge1xuICAgICAgREVGQVVMVDogMCxcbiAgICAgIExJR0hUX0NPTlRFTlQ6IDEsXG4gICAgICBCTEFDS19UUkFOU0xVQ0VOVDogMixcbiAgICAgIEJMQUNLX09QQVFVRTogM1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgICogQHBhcmFtIHtudW1iZXJ9IHN0eWxlXG4gICAgICAqL1xuICAgIHN0eWxlOiBmdW5jdGlvbiAoc3R5bGUpIHtcbiAgICAgIHN3aXRjaCAoc3R5bGUpIHtcbiAgICAgICAgLy8gRGVmYXVsdFxuICAgICAgICBjYXNlIDA6XG4gICAgICAgIHJldHVybiBTdGF0dXNCYXIuc3R5bGVEZWZhdWx0KCk7XG5cbiAgICAgICAgLy8gTGlnaHRDb250ZW50XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zdHlsZUxpZ2h0Q29udGVudCgpO1xuXG4gICAgICAgIC8vIEJsYWNrVHJhbnNsdWNlbnRcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICByZXR1cm4gU3RhdHVzQmFyLnN0eWxlQmxhY2tUcmFuc2x1Y2VudCgpO1xuXG4gICAgICAgIC8vIEJsYWNrT3BhcXVlXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zdHlsZUJsYWNrT3BhcXVlKCk7XG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zdHlsZURlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gc3VwcG9ydGVkIG5hbWVzOlxuICAgIC8vIGJsYWNrLCBkYXJrR3JheSwgbGlnaHRHcmF5LCB3aGl0ZSwgZ3JheSwgcmVkLCBncmVlbixcbiAgICAvLyBibHVlLCBjeWFuLCB5ZWxsb3csIG1hZ2VudGEsIG9yYW5nZSwgcHVycGxlLCBicm93blxuICAgIHN0eWxlQ29sb3I6IGZ1bmN0aW9uIChjb2xvcikge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5iYWNrZ3JvdW5kQ29sb3JCeU5hbWUoY29sb3IpO1xuICAgIH0sXG5cbiAgICBzdHlsZUhleDogZnVuY3Rpb24gKGNvbG9ySGV4KSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLmJhY2tncm91bmRDb2xvckJ5SGV4U3RyaW5nKGNvbG9ySGV4KTtcbiAgICB9LFxuXG4gICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5oaWRlKCk7XG4gICAgfSxcblxuICAgIHNob3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIuc2hvdygpO1xuICAgIH0sXG5cbiAgICBpc1Zpc2libGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIuaXNWaXNpYmxlO1xuICAgIH1cbiAgfTtcbn1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1RvYXN0LVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1RvYXN0LVBob25lR2FwLVBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMudG9hc3QnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFUb2FzdCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3dTaG9ydFRvcDogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd1Nob3J0VG9wKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93U2hvcnRDZW50ZXI6IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dTaG9ydENlbnRlcihtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd1Nob3J0Qm90dG9tOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93U2hvcnRCb3R0b20obWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dMb25nVG9wOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93TG9uZ1RvcChtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0xvbmdDZW50ZXI6IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dMb25nQ2VudGVyKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93TG9uZ0JvdHRvbTogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd0xvbmdCb3R0b20obWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3c6IGZ1bmN0aW9uIChtZXNzYWdlLCBkdXJhdGlvbiwgcG9zaXRpb24pIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvdyhtZXNzYWdlLCBkdXJhdGlvbiwgcG9zaXRpb24sIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3QuaGlkZSgpO1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yICYmIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9sZWVjcm9zc2xleS9jb3Jkb3ZhLXBsdWdpbi10b3VjaGlkLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vbGVlY3Jvc3NsZXkvY29yZG92YS1wbHVnaW4tdG91Y2hpZFxuXG4vKiBnbG9iYWxzIHRvdWNoaWQ6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy50b3VjaGlkJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhVG91Y2hJRCcsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjaGVja1N1cHBvcnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKTtcbiAgICAgICAgaWYgKCF3aW5kb3cuY29yZG92YSkge1xuICAgICAgICAgIGRlZmVyLnJlamVjdCgnTm90IHN1cHBvcnRlZCB3aXRob3V0IGNvcmRvdmEuanMnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0b3VjaGlkLmNoZWNrU3VwcG9ydChmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhdXRoZW50aWNhdGU6IGZ1bmN0aW9uIChhdXRoUmVhc29uVGV4dCkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpO1xuICAgICAgICBpZiAoIXdpbmRvdy5jb3Jkb3ZhKSB7XG4gICAgICAgICAgZGVmZXIucmVqZWN0KCdOb3Qgc3VwcG9ydGVkIHdpdGhvdXQgY29yZG92YS5qcycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRvdWNoaWQuYXV0aGVudGljYXRlKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXIucmVqZWN0KGVycik7XG4gICAgICAgICAgfSwgYXV0aFJlYXNvblRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vYWVyb2dlYXIvYWVyb2dlYXItY29yZG92YS1wdXNoLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYWVyb2dlYXIvYWVyb2dlYXItY29yZG92YS1wdXNoXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy51cHNQdXNoJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhVXBzUHVzaCcsIFsnJHEnLCAnJHdpbmRvdycsICckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRxLCAkd2luZG93LCAkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuICAgIHJldHVybiB7XG4gICAgICByZWdpc3RlcjogZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wdXNoLnJlZ2lzdGVyKGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhVXBzUHVzaDpub3RpZmljYXRpb25SZWNlaXZlZCcsIG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBjb25maWcpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1bnJlZ2lzdGVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucHVzaC51bnJlZ2lzdGVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLy8gaU9TIG9ubHlcbiAgICAgIHNldEJhZGdlTnVtYmVyOiBmdW5jdGlvbiAobnVtYmVyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wdXNoLnNldEFwcGxpY2F0aW9uSWNvbkJhZGdlTnVtYmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgbnVtYmVyKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLXZpYnJhdGlvblxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLXZpYnJhdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMudmlicmF0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhVmlicmF0aW9uJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHJldHVybiB7XG4gICAgICB2aWJyYXRlOiBmdW5jdGlvbiAodGltZXMpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5ub3RpZmljYXRpb24udmlicmF0ZSh0aW1lcyk7XG4gICAgICB9LFxuICAgICAgdmlicmF0ZVdpdGhQYXR0ZXJuOiBmdW5jdGlvbiAocGF0dGVybiwgcmVwZWF0KSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLnZpYnJhdGVXaXRoUGF0dGVybihwYXR0ZXJuLCByZXBlYXQpO1xuICAgICAgfSxcbiAgICAgIGNhbmNlbFZpYnJhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi5jYW5jZWxWaWJyYXRpb24oKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vVmlkZW9DYXB0dXJlUGx1cy1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vVmlkZW9DYXB0dXJlUGx1cy1QaG9uZUdhcC1QbHVnaW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnZpZGVvQ2FwdHVyZVBsdXMnLCBbXSlcblxuICAucHJvdmlkZXIoJyRjb3Jkb3ZhVmlkZW9DYXB0dXJlUGx1cycsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgZGVmYXVsdE9wdGlvbnMgPSB7fTtcblxuXG4gICAgLyoqXG4gICAgICogdGhlIG5yIG9mIHZpZGVvcyB0byByZWNvcmQsIGRlZmF1bHQgMSAob24gaU9TIGFsd2F5cyAxKVxuICAgICAqXG4gICAgICogQHBhcmFtIGxpbWl0XG4gICAgICovXG4gICAgdGhpcy5zZXRMaW1pdCA9IGZ1bmN0aW9uIHNldExpbWl0KGxpbWl0KSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqIG1heCBkdXJhdGlvbiBpbiBzZWNvbmRzLCBkZWZhdWx0IDAsIHdoaWNoIGlzICdmb3JldmVyJ1xuICAgICAqXG4gICAgICogQHBhcmFtIHNlY29uZHNcbiAgICAgKi9cbiAgICB0aGlzLnNldE1heER1cmF0aW9uID0gZnVuY3Rpb24gc2V0TWF4RHVyYXRpb24oc2Vjb25kcykge1xuICAgICAgZGVmYXVsdE9wdGlvbnMuZHVyYXRpb24gPSBzZWNvbmRzO1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqIHNldCB0byB0cnVlIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGxvdyBxdWFsaXR5IHNldHRpbmdcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gaGlnaHF1YWxpdHlcbiAgICAgKi9cbiAgICB0aGlzLnNldEhpZ2hRdWFsaXR5ID0gZnVuY3Rpb24gc2V0SGlnaFF1YWxpdHkoaGlnaHF1YWxpdHkpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLmhpZ2hxdWFsaXR5ID0gaGlnaHF1YWxpdHk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIHlvdSdsbCB3YW50IHRvIHNuaWZmIHRoZSB1c2VyLUFnZW50L2RldmljZSBhbmQgcGFzcyB0aGUgYmVzdCBvdmVybGF5IGJhc2VkIG9uIHRoYXQuLlxuICAgICAqIHNldCB0byB0cnVlIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGJhY2tmYWNpbmcgY2FtZXJhIHNldHRpbmcuIGlPUzogd29ya3MgZmluZSwgQW5kcm9pZDogWU1NViAoIzE4KVxuICAgICAqXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBmcm9udGNhbWVyYVxuICAgICAqL1xuICAgIHRoaXMudXNlRnJvbnRDYW1lcmEgPSBmdW5jdGlvbiB1c2VGcm9udENhbWVyYShmcm9udGNhbWVyYSkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMuZnJvbnRjYW1lcmEgPSBmcm9udGNhbWVyYTtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBwdXQgdGhlIHBuZyBpbiB5b3VyIHd3dyBmb2xkZXJcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbWFnZVVybFxuICAgICAqL1xuICAgIHRoaXMuc2V0UG9ydHJhaXRPdmVybGF5ID0gZnVuY3Rpb24gc2V0UG9ydHJhaXRPdmVybGF5KGltYWdlVXJsKSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5wb3J0cmFpdE92ZXJsYXkgPSBpbWFnZVVybDtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbWFnZVVybFxuICAgICAqL1xuICAgIHRoaXMuc2V0TGFuZHNjYXBlT3ZlcmxheSA9IGZ1bmN0aW9uIHNldExhbmRzY2FwZU92ZXJsYXkoaW1hZ2VVcmwpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLmxhbmRzY2FwZU92ZXJsYXkgPSBpbWFnZVVybDtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBpT1Mgb25seVxuICAgICAqXG4gICAgICogQHBhcmFtIHRleHRcbiAgICAgKi9cbiAgICB0aGlzLnNldE92ZXJsYXlUZXh0ID0gZnVuY3Rpb24gc2V0T3ZlcmxheVRleHQodGV4dCkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMub3ZlcmxheVRleHQgPSB0ZXh0O1xuICAgIH07XG5cblxuICAgIHRoaXMuJGdldCA9IFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY2FwdHVyZVZpZGVvOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICghJHdpbmRvdy5wbHVnaW5zLnZpZGVvY2FwdHVyZXBsdXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnZpZGVvY2FwdHVyZXBsdXMuY2FwdHVyZVZpZGVvKHEucmVzb2x2ZSwgcS5yZWplY3QsXG4gICAgICAgICAgICBhbmd1bGFyLmV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpKTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9Nb2JpbGVDaHJvbWVBcHBzL3ppcC5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9Nb2JpbGVDaHJvbWVBcHBzL3ppcFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuemlwJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhWmlwJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdW56aXA6IGZ1bmN0aW9uIChzb3VyY2UsIGRlc3RpbmF0aW9uKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnppcC51bnppcChzb3VyY2UsIGRlc3RpbmF0aW9uLCBmdW5jdGlvbiAoaXNFcnJvcikge1xuICAgICAgICAgIGlmIChpc0Vycm9yID09PSAwKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uIChwcm9ncmVzc0V2ZW50KSB7XG4gICAgICAgICAgcS5ub3RpZnkocHJvZ3Jlc3NFdmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG59KSgpOyJdfQ==
