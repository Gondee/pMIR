﻿var lib_cordova = require('ng-cordova');

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
        failInferenceColumnMismatch: 11,
        failNeedMoarDataForPls: 12
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
            case 12:
                result = "failNeedMoarDataForPls";
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
                console.log(chemoTrainingAbsorbances);
                console.log(chemoTrainingConcentrations);
                chemoAlgo.train(chemoTrainingAbsorbances, chemoTrainingConcentrations, options);
            }
            catch (err) {
                console.log(err);
                alert(err);
                return chemoFlags.failUnknownTrainError;
            }
            explainedVariances = chemoAlgo.getExplainedVariance();
            //alert(explainedVariances);
            if (isNaN(explainedVariances))
            {
                return chemoFlags.failNeedMoarDataForPls;
            }
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
        var inferred = [];
        try {
            //alert("Before transpose");
            var newDataset = chemoTrainingAbsorbances.splice(0);
            newDataset[newDataset.length] = measuredAbsorbances;
            var inferred = chemoAlgo.predict(newDataset);
            /*var matForm = [measuredAbsorbances, measuredAbsorbances];
            var measuredTranspose = new lib_matrix(matForm);
            measuredTranspose = measuredTranspose.transpose();
            //alert("After transpose");
            inferred = chemoAlgo.predict(matForm);
            console.log(inferred);
            var inferredTranspose = new lib_matrix(inferred);
            inferredTranspose.transpose();
            inferred = inferredTranspose;
            console.log(inferred);
            //console.log(chemoAlgo.export());
            //alert("After Inferred");*/
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
        /*var inferredTranspose = new lib_matrix(inferred);
        inferredTranspose = inferredTranspose.transpose();*/
        //var allConcentrations = inferredTranspose[0];
        var allConcentrations = inferred[inferred.length-1];
        console.log(allConcentrations);

        //Find the chemical names which have been detected.
        var labels = [];
        var nonZeroConcentrations = [];
        //alert(allConcentrations.length);
        for (var i = 0; i < allConcentrations.length; ++i) {
            if (allConcentrations[i] != 0) {
                labels[labels.length] = chemoConcentrationLabels[i];
                nonZeroConcentrations[nonZeroConcentrations.length] = allConcentrations[i];
            }
        }
       // alert(allConcentrations);
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
        var distances = [];
        var numPoints = chemoPCACompressed.length;
        //alert(numPoints);
        //alert(chemoTrainingAbsorbances.length);
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
            result = newInferPls(measuredAbsorbances);
        }
        else {
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
        /*var trainObj = {
        absorbance:    [
[-0.594545,-0.656789,-0.628831,-0.653695,-0.674265,-0.571897,-0.544902,-0.534245,-0.516828,-0.479235,-0.383876,-0.317039,-0.333496,-0.266825,-0.226322,-0.220886,-0.201676,-0.20608,-0.24215,-0.220184,-0.28505,-0.301282,-0.336638,-0.392477,-0.367332,-0.396186,-0.415024,-0.448681,-0.47809,-0.487721,-0.537975,-0.519848,-0.534898,-0.542478,-0.564179,-0.544932,-0.511838,-0.508518,-0.492807,-0.486325,-0.492619,-0.487568,-0.505686,-0.479898,-0.50944,-0.507373,-0.507184,-0.502112,-0.536136,-0.503305,-0.4822,-0.499762,-0.478432,-0.449846,-0.422137,-0.374513,-0.370171,-0.255375,-0.179667,-0.033919,0.04218,0.158572,0.218756,0.237466,0.286915,0.327128,0.240874,0.245516,0.259819,0.205745,0.197473,0.185453,0.126843,0.171887,0.139509,0.152849,0.153387,0.147574,0.087871,0.105273,0.095108,0.105024,0.142477,0.123397,0.163737,0.203913,0.177413,0.176245,0.212555,0.189827,0.183925,0.182858,0.125116,0.139781,0.098434,0.088809,0.093373,0.109957,0.151727,0.134708,0.168347,0.193513,0.207517,0.20633,0.248632,0.311502,0.331211,0.391007,0.365703,0.51654,0.4905,0.544993,0.459565,0.53668,0.545958,0.429426,0.478962,0.4139,0.410701,0.375847,0.339397,0.341974,0.32565,0.256303,0.314868,0.378316,0.271929,0.296459,0.346482,0.308774,0.25939,0.446922,0.421564,0.425993,0.4821,0.521335,0.57155,0.52743,0.481977,0.469609,0.483167,0.404962,0.465553,0.447243,0.487623,0.333089,0.345781,0.312027,0.42241,0.366478,0.426495,0.386349,0.512642,0.343372,0.398207,0.505225,0.595336,0.571761,0.670264,0.581367,0.566548,0.587309,0.680721,0.60679,0.544918,0.548092,0.504758,0.432429,0.442519,0.397042,0.346305,0.513542,0.453766,0.52915,0.432259,0.41295,0.483901,0.531619,0.481814,0.527095,0.414172,0.603355,0.719739,0.89998,0.865401,0.7133,0.830285,0.838828,0.64089,0.549754,0.530704,0.538627,0.359364,0.548792,0.431702,0.324308,0.420093,0.183746,0.353396,0.351257,0.36835,0.527517,0.649301,0.160322,0.959198,0.630503,1.195474,0,1.365344,1.830301,0,0,0,0,0.324982,0.871477,-0.482951,-0.53904,0.101201,0,0,0,0,0,0,0,0,0],
[-0.550645, -0.598889, -0.600843, -0.623555, -0.649926, -0.542114, -0.55518, -0.528976, -0.514686, -0.49251, -0.397435, -0.328857, -0.343438, -0.27352, -0.255654, -0.225313, -0.213583, -0.20397, -0.248227, -0.243699, -0.281571, -0.284839, -0.318117, -0.351364, -0.324563, -0.348902, -0.37457, -0.422145, -0.454507, -0.467353, -0.537259, -0.506707, -0.526982, -0.533003, -0.555172, -0.535588, -0.509056, -0.506851, -0.486183, -0.474961, -0.482995, -0.476151, -0.495193, -0.473222, -0.501958, -0.492311, -0.485594, -0.480041, -0.502443, -0.458861, -0.443685, -0.47163, -0.442469, -0.440027, -0.421086, -0.382452, -0.392663, -0.261075, -0.235548, -0.086212, -0.029765, 0.053321, 0.09666, 0.099626, 0.141413, 0.153186, 0.163383, 0.173192, 0.199239, 0.161077, 0.159396, 0.194342, 0.275487, 0.191192, 0.246237, 0.146767, 0.165391, 0.144533, 0.075093, 0.057169, 0.069184, 0.059924, 0.090105, 0.077566, 0.124263, 0.113567, 0.129142, 0.154537, 0.149048, 0.141015, 0.115535, 0.141082, 0.1237, 0.1003, 0.108163, 0.117621, 0.150003, 0.156937, 0.158218, 0.187417, 0.197761, 0.158201, 0.163452, 0.177184, 0.180668, 0.218121, 0.216291, 0.267798, 0.276188, 0.30376, 0.344395, 0.375159, 0.30996, 0.333477, 0.352411, 0.314173, 0.31096, 0.308635, 0.373717, 0.334404, 0.363932, 0.40697, 0.3879, 0.289906, 0.324747, 0.318884, 0.20806, 0.179953, 0.244376, 0.205083, 0.189342, 0.152444, 0.238517, 0.294417, 0.244963, 0.306289, 0.374891, 0.360821, 0.284414, 0.345539, 0.284509, 0.329668, 0.378661, 0.418855, 0.41728, 0.493703, 0.394755, 0.403119, 0.434852, 0.322016, 0.355745, 0.306842, 0.208819, 0.202644, 0.273698, 0.339658, 0.273628, 0.367184, 0.361721, 0.337568, 0.418612, 0.456513, 0.442117, 0.399099, 0.4285, 0.421164, 0.361869, 0.428679, 0.501823, 0.486372, 0.332568, 0.451906, 0.482837, 0.419853, 0.344428, 0.198956, 0.279701, 0.191081, 0.231494, 0.23749, 0.142909, 0.304526, 0.319452, 0.309469, 0.354531, 0.402374, 0.377577, 0.496926, 0.384201, 0.420431, 0.405457, 0.297893, 0.441602, 0.480215, 0.654996, 0.295942, 0.268693, 0.192313, 0.068089, 0.154408, 0.028308, 0.082656, -0.098887, -0.012661, 0.144251, 0.041193, 0.14985, 0.06109, 0.100889, 0.282399, -0.018549, 0.187471, 0.017273, -0.029875, -0.205442, -0.21896, -0.094556, -0.179508, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.561268, -0.602303, -0.589851, -0.599049, -0.631889, -0.522864, -0.51902, -0.489376, -0.491576, -0.448438, -0.357593, -0.283241, -0.318887, -0.222735, -0.214161, -0.192952, -0.19306, -0.195968, -0.213434, -0.214485, -0.250039, -0.274795, -0.305329, -0.348005, -0.336746, -0.360159, -0.370419, -0.417476, -0.452716, -0.44528, -0.513604, -0.493156, -0.502947, -0.511715, -0.536529, -0.512349, -0.480381, -0.48085, -0.462844, -0.459315, -0.457481, -0.456648, -0.477854, -0.458006, -0.484343, -0.478674, -0.480279, -0.470374, -0.498371, -0.469374, -0.462578, -0.46921, -0.438213, -0.410945, -0.398948, -0.341834, -0.330613, -0.217324, -0.172108, 0.00772, 0.066265, 0.117985, 0.199451, 0.212918, 0.281217, 0.261191, 0.237465, 0.298566, 0.21355, 0.257388, 0.21823, 0.223305, 0.16177, 0.156658, 0.211354, 0.150847, 0.172091, 0.211757, 0.149877, 0.157695, 0.125411, 0.153468, 0.162133, 0.176029, 0.163564, 0.226773, 0.188078, 0.206274, 0.213801, 0.203712, 0.182899, 0.181131, 0.164675, 0.130282, 0.130654, 0.136668, 0.14339, 0.169044, 0.16124, 0.188479, 0.248322, 0.192911, 0.218659, 0.23334, 0.293883, 0.337427, 0.308323, 0.393938, 0.400581, 0.430423, 0.496766, 0.419852, 0.471602, 0.459597, 0.487765, 0.494736, 0.480874, 0.425643, 0.405121, 0.336243, 0.351155, 0.340955, 0.305144, 0.362803, 0.276071, 0.405841, 0.379796, 0.328815, 0.345001, 0.352647, 0.36741, 0.336725, 0.415256, 0.450702, 0.424444, 0.472799, 0.469654, 0.447231, 0.380182, 0.486868, 0.370081, 0.408913, 0.412828, 0.357327, 0.384595, 0.436906, 0.422169, 0.394854, 0.39457, 0.370812, 0.439747, 0.393433, 0.334687, 0.364801, 0.448716, 0.468658, 0.507395, 0.447999, 0.643572, 0.533906, 0.492268, 0.508218, 0.665232, 0.608843, 0.566803, 0.49557, 0.414628, 0.495772, 0.64092, 0.450571, 0.401608, 0.468752, 0.387265, 0.534331, 0.457761, 0.43939, 0.350164, 0.495025, 0.417214, 0.438395, 0.490127, 0.511908, 0.694507, 0.717799, 0.533337, 0.665435, 0.658874, 0.726206, 0.57864, 0.540636, 0.422429, 0.577708, 0.454299, 0.513391, 0.316245, 0.378023, 0.500852, 0.29975, 0.189705, 0.403034, 0.30075, 0.346595, 0.331091, 0.336817, 0.477345, 0.492028, 0.997663, 0.596692, 0.567242, 0.710636, 0.306593, 0.326735, 0.41448, 1.916454, 0.630513, 0.283013, -0.276896, -0.195546, 0.169433, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.564031, -0.626225, -0.620071, -0.615104, -0.651955, -0.538097, -0.535635, -0.526553, -0.502999, -0.462544, -0.380211, -0.293203, -0.332429, -0.26021, -0.256651, -0.219727, -0.218936, -0.228172, -0.242522, -0.230401, -0.278973, -0.286031, -0.317478, -0.363352, -0.336356, -0.368069, -0.38682, -0.423788, -0.46079, -0.460164, -0.517293, -0.506528, -0.509513, -0.518452, -0.546119, -0.521099, -0.500602, -0.483867, -0.485553, -0.476326, -0.476619, -0.476264, -0.500516, -0.472692, -0.50465, -0.486736, -0.487835, -0.481627, -0.501098, -0.478497, -0.458651, -0.472246, -0.447679, -0.433275, -0.404481, -0.353933, -0.336459, -0.219356, -0.187765, -0.032351, 0.020872, 0.116991, 0.179103, 0.179742, 0.196852, 0.234284, 0.183524, 0.18805, 0.217814, 0.172757, 0.15366, 0.18757, 0.167588, 0.20217, 0.156918, 0.158161, 0.226345, 0.195734, 0.139421, 0.143248, 0.129973, 0.130979, 0.175842, 0.16334, 0.161914, 0.174701, 0.172257, 0.148879, 0.157373, 0.149139, 0.124956, 0.127298, 0.130685, 0.115167, 0.139899, 0.122708, 0.115161, 0.142998, 0.151293, 0.222397, 0.218824, 0.168489, 0.210963, 0.234971, 0.299747, 0.335147, 0.278997, 0.377672, 0.358332, 0.404426, 0.442506, 0.374337, 0.405896, 0.38182, 0.405142, 0.357809, 0.35269, 0.358245, 0.474268, 0.362122, 0.326994, 0.336231, 0.378953, 0.320351, 0.330469, 0.387977, 0.279604, 0.339339, 0.38321, 0.309806, 0.349555, 0.382502, 0.265962, 0.379377, 0.343858, 0.339254, 0.391465, 0.351747, 0.414869, 0.335388, 0.358061, 0.331088, 0.407643, 0.466909, 0.356759, 0.427879, 0.430703, 0.399471, 0.427466, 0.330439, 0.381348, 0.377653, 0.3822, 0.373639, 0.408631, 0.46932, 0.404135, 0.388414, 0.427934, 0.383765, 0.426414, 0.409594, 0.467297, 0.444575, 0.495479, 0.492843, 0.443296, 0.408505, 0.463708, 0.546445, 0.384915, 0.487079, 0.553746, 0.458055, 0.422013, 0.364723, 0.566942, 0.274495, 0.455441, 0.472878, 0.459223, 0.464472, 0.496324, 0.438327, 0.468339, 0.513231, 0.51416, 0.416176, 0.507352, 0.507415, 0.591525, 0.468046, 0.543602, 0.871115, 0.636111, 0.527042, 0.29361, 0.455444, 0.5657, 0.369958, 0.458778, 0.248406, 0.218219, 0.614239, 0.234884, 0.421551, 0.406327, 0.2482, 0.274715, 0.305927, 0.241363, 0.677407, 0.234134, 0, -0.030669, 0.092335, -0.36461, -0.130562, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.5499, -0.583059, -0.590021, -0.612486, -0.621448, -0.517298, -0.524005, -0.494259, -0.473289, -0.451667, -0.336261, -0.300983, -0.311149, -0.23186, -0.219323, -0.178772, -0.191715, -0.171131, -0.216033, -0.202303, -0.234502, -0.249756, -0.285698, -0.315434, -0.316508, -0.343211, -0.375036, -0.41709, -0.441166, -0.449251, -0.505552, -0.485119, -0.505923, -0.509513, -0.532101, -0.514669, -0.475678, -0.471455, -0.46417, -0.456493, -0.456285, -0.440542, -0.469291, -0.447231, -0.468657, -0.464345, -0.457578, -0.450918, -0.500666, -0.45426, -0.447448, -0.468222, -0.437075, -0.412331, -0.37918, -0.34317, -0.33218, -0.234251, -0.156062, -0.033844, 0.051745, 0.101182, 0.1731, 0.152533, 0.249895, 0.21959, 0.184274, 0.244815, 0.294919, 0.26602, 0.189391, 0.24752, 0.167932, 0.170253, 0.160228, 0.137802, 0.18133, 0.170727, 0.10967, 0.112494, 0.124184, 0.171746, 0.168244, 0.148134, 0.115845, 0.159774, 0.153987, 0.189494, 0.178412, 0.161912, 0.175936, 0.180682, 0.156744, 0.172037, 0.13612, 0.158944, 0.151189, 0.138568, 0.149561, 0.173608, 0.167585, 0.158996, 0.2014, 0.225934, 0.209188, 0.270326, 0.23085, 0.324877, 0.362189, 0.440263, 0.395066, 0.399966, 0.420902, 0.40825, 0.467514, 0.379349, 0.406866, 0.390295, 0.386804, 0.34968, 0.370201, 0.354218, 0.269453, 0.254865, 0.269802, 0.291474, 0.277202, 0.263241, 0.319357, 0.277473, 0.316258, 0.387087, 0.324917, 0.36915, 0.340285, 0.369206, 0.434069, 0.383932, 0.365631, 0.416196, 0.356561, 0.359992, 0.466864, 0.468779, 0.393935, 0.418857, 0.385989, 0.283762, 0.379376, 0.189771, 0.40055, 0.306842, 0.350566, 0.418006, 0.364635, 0.412074, 0.384237, 0.382966, 0.464292, 0.40191, 0.45971, 0.4929, 0.480561, 0.549567, 0.478326, 0.611707, 0.489951, 0.473047, 0.464156, 0.408822, 0.420426, 0.433792, 0.366757, 0.33832, 0.374375, 0.241304, 0.308023, 0.2292, 0.375326, 0.498021, 0.359627, 0.344197, 0.600474, 0.575595, 0.568411, 0.514988, 0.478569, 0.602371, 0.488602, 0.644765, 0.500138, 0.350407, 0.414149, 0.270695, 0.283928, 0.444389, 0.212541, 0.130387, 0.093855, 0.211595, 0.349187, 0.076766, 0.185067, 0.29191, 0.305307, 0.213275, 0.141214, 0.289832, 0.199013, 0.646295, 0.166331, 0.186374, 0.323845, 0.487105, 0.11724, 0.721963, 0, -0.218543, 0.298597, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.60254, -0.623862, -0.643633, -0.640357, -0.676481, -0.550531, -0.552145, -0.529716, -0.506132, -0.476456, -0.369027, -0.333608, -0.333404, -0.265601, -0.255336, -0.225401, -0.213185, -0.210788, -0.247043, -0.230921, -0.271928, -0.288037, -0.32488, -0.351125, -0.345965, -0.379805, -0.403148, -0.436854, -0.462827, -0.475316, -0.536336, -0.514207, -0.530064, -0.53759, -0.553637, -0.538271, -0.509238, -0.502575, -0.485553, -0.479091, -0.480669, -0.469273, -0.492256, -0.477715, -0.50591, -0.492546, -0.484828, -0.491383, -0.507755, -0.48131, -0.469806, -0.487008, -0.454646, -0.447746, -0.413496, -0.374229, -0.358555, -0.26328, -0.191276, -0.070955, 0.029116, 0.087041, 0.14945, 0.177408, 0.178829, 0.191845, 0.174375, 0.202672, 0.243149, 0.221062, 0.174252, 0.186157, 0.19557, 0.181153, 0.13342, 0.141181, 0.100612, 0.08882, 0.107634, 0.110042, 0.048267, 0.084855, 0.088267, 0.115187, 0.130746, 0.176665, 0.140605, 0.191556, 0.170205, 0.132349, 0.143424, 0.142245, 0.12377, 0.122351, 0.136337, 0.091997, 0.115982, 0.113499, 0.116231, 0.131541, 0.198414, 0.137118, 0.193916, 0.168107, 0.212455, 0.260841, 0.238905, 0.306023, 0.370135, 0.369848, 0.361083, 0.389221, 0.32712, 0.413892, 0.478724, 0.412704, 0.451422, 0.33726, 0.370026, 0.34968, 0.301704, 0.2991, 0.286322, 0.248844, 0.255762, 0.30927, 0.211577, 0.282398, 0.228267, 0.284075, 0.272247, 0.317651, 0.299373, 0.336171, 0.316217, 0.332869, 0.409733, 0.380081, 0.395791, 0.394496, 0.409026, 0.345055, 0.385682, 0.333345, 0.389759, 0.353956, 0.309437, 0.268271, 0.294167, 0.229091, 0.358977, 0.303765, 0.31579, 0.280929, 0.404354, 0.351789, 0.403202, 0.51662, 0.432204, 0.41426, 0.461129, 0.500159, 0.412609, 0.519826, 0.463674, 0.519228, 0.400974, 0.462234, 0.484104, 0.399906, 0.354593, 0.324753, 0.442458, 0.290598, 0.374627, 0.277741, 0.341079, 0.312403, 0.312479, 0.410871, 0.474566, 0.398438, 0.455785, 0.458978, 0.463386, 0.399665, 0.519247, 0.604448, 0.588944, 0.439587, 0.352971, 0.389872, 0.395881, 0.414093, 0.238787, 0.352594, 0.283224, 0.073153, 0.039061, 0.1134, 0.243248, 0.073338, 0.038939, 0.401445, 0.162422, 0.318241, 0.212855, 0.201965, 0.469978, 0.489242, 0.229818, 0.205406, 0.228724, 0.444796, -0.291391, -0.147725, -0.263241, -0.239199, -0.288656, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.548067, -0.586221, -0.591268, -0.606435, -0.634986, -0.500434, -0.490598, -0.477955, -0.480189, -0.418583, -0.325661, -0.277705, -0.29118, -0.208212, -0.20462, -0.18447, -0.167659, -0.168032, -0.220706, -0.197704, -0.24761, -0.254545, -0.278913, -0.343856, -0.311169, -0.342625, -0.36976, -0.400913, -0.432625, -0.440051, -0.506845, -0.483153, -0.490915, -0.503169, -0.524855, -0.501616, -0.466817, -0.462938, -0.446336, -0.460354, -0.44288, -0.447815, -0.466367, -0.446399, -0.46731, -0.452958, -0.467285, -0.465698, -0.494518, -0.449937, -0.448541, -0.453908, -0.43488, -0.408972, -0.37668, -0.333032, -0.327331, -0.189841, -0.131377, -0.007427, 0.080226, 0.187046, 0.242711, 0.240685, 0.235578, 0.27739, 0.240161, 0.273619, 0.236452, 0.251166, 0.225024, 0.210442, 0.186001, 0.20487, 0.222838, 0.150427, 0.213702, 0.288593, 0.216739, 0.178653, 0.165699, 0.161838, 0.148579, 0.176029, 0.196244, 0.184611, 0.231727, 0.201529, 0.236174, 0.208056, 0.200276, 0.216306, 0.149781, 0.156533, 0.139972, 0.131273, 0.158526, 0.175188, 0.209802, 0.184814, 0.204586, 0.208501, 0.245281, 0.249734, 0.266315, 0.333355, 0.348385, 0.414326, 0.418133, 0.473058, 0.428232, 0.482643, 0.438408, 0.462058, 0.545356, 0.435978, 0.46729, 0.40654, 0.433023, 0.397863, 0.358776, 0.305932, 0.38388, 0.359948, 0.360457, 0.334614, 0.27686, 0.366822, 0.360611, 0.318323, 0.335891, 0.339815, 0.335032, 0.445156, 0.388837, 0.415327, 0.432974, 0.518231, 0.429599, 0.489812, 0.467205, 0.448871, 0.459703, 0.434161, 0.434019, 0.430439, 0.359171, 0.331948, 0.488286, 0.337296, 0.448959, 0.386544, 0.413974, 0.467662, 0.486057, 0.577645, 0.672953, 0.481698, 0.563083, 0.513583, 0.453082, 0.536699, 0.517071, 0.517199, 0.540965, 0.473134, 0.473291, 0.480656, 0.460585, 0.494207, 0.405119, 0.480708, 0.456901, 0.388203, 0.542474, 0.481818, 0.526608, 0.395491, 0.399601, 0.473784, 0.520804, 0.551494, 0.616406, 0.570321, 0.661007, 0.546767, 0.8599, 0.524781, 0.732721, 0.44302, 0.468008, 0.341903, 0.453164, 0.545171, 0.44439, 0.463624, 0.393896, 0.370406, 0.113772, 0.307501, 0.409416, 0.462658, 0.454811, 0.417213, 0.660212, 0.398162, 1.09723, 1.063271, 0.570802, 0.736397, 0.758091, 0.889748, 0.594714, 0.085545, 0.035292, 0.191974, -0.544627, -0.371199, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.576699, -0.637345, -0.590759, -0.64031, -0.655761, -0.545517, -0.526704, -0.506909, -0.506092, -0.456138, -0.376029, -0.302756, -0.303023, -0.23127, -0.246898, -0.210164, -0.207894, -0.200743, -0.237327, -0.217344, -0.256452, -0.283792, -0.307226, -0.351364, -0.33564, -0.354583, -0.384367, -0.415003, -0.461768, -0.452717, -0.52995, -0.503809, -0.517651, -0.515196, -0.539399, -0.521339, -0.498655, -0.476978, -0.473179, -0.469223, -0.470402, -0.462517, -0.486367, -0.460409, -0.485879, -0.488918, -0.480254, -0.476727, -0.505548, -0.476866, -0.460221, -0.472862, -0.462409, -0.431924, -0.406794, -0.359803, -0.332875, -0.241584, -0.171162, -0.016748, 0.039447, 0.145006, 0.190886, 0.226124, 0.215912, 0.207396, 0.234083, 0.218066, 0.243929, 0.219493, 0.257695, 0.179742, 0.185642, 0.177047, 0.205962, 0.149064, 0.168471, 0.160059, 0.116212, 0.12545, 0.13439, 0.133941, 0.098159, 0.128765, 0.169165, 0.178473, 0.182057, 0.215669, 0.202384, 0.185348, 0.200604, 0.1977, 0.131836, 0.160022, 0.121461, 0.119008, 0.137308, 0.127547, 0.132196, 0.1555, 0.186963, 0.152128, 0.202355, 0.224337, 0.275803, 0.300975, 0.282881, 0.357176, 0.427618, 0.432968, 0.455297, 0.373654, 0.390215, 0.404683, 0.460198, 0.345612, 0.437153, 0.394602, 0.446341, 0.400768, 0.343501, 0.269476, 0.27372, 0.317025, 0.238051, 0.307407, 0.281155, 0.242429, 0.326025, 0.294583, 0.285661, 0.306659, 0.398521, 0.413292, 0.388476, 0.394019, 0.505177, 0.434009, 0.417581, 0.387796, 0.402503, 0.450324, 0.401765, 0.339334, 0.332569, 0.403937, 0.421776, 0.318009, 0.382483, 0.308512, 0.380969, 0.35893, 0.322974, 0.384995, 0.364811, 0.411687, 0.394894, 0.473077, 0.439234, 0.462608, 0.483416, 0.52621, 0.531273, 0.477194, 0.474089, 0.546551, 0.429358, 0.339258, 0.373294, 0.497535, 0.371442, 0.428853, 0.431932, 0.360096, 0.374879, 0.390261, 0.358722, 0.457237, 0.311723, 0.527437, 0.427979, 0.487085, 0.647641, 0.467167, 0.675872, 0.615612, 0.594692, 0.468308, 0.4567, 0.633932, 0.561373, 0.445328, 0.402558, 0.371663, 0.372869, 0.417283, 0.309887, 0.344136, 0.175806, 0.242421, 0.165456, 0.209342, 0.260913, 0.250716, 0.597382, 0.461422, 0.608714, 0.514321, 0.675375, 0.699413, 1.38818, 0.497936, 0.517386, 0.032793, -0.013557, 0.127345, 0.321047, -0.353324, 0.221036, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.554282, -0.590609, -0.592794, -0.593862, -0.611344, -0.495407, -0.486031, -0.479093, -0.468451, -0.445096, -0.327989, -0.271047, -0.285731, -0.202999, -0.206708, -0.174831, -0.159834, -0.183589, -0.199565, -0.214485, -0.228603, -0.257059, -0.304926, -0.321949, -0.311788, -0.340829, -0.362827, -0.401098, -0.430441, -0.428059, -0.499365, -0.473467, -0.48379, -0.497479, -0.518668, -0.496745, -0.465439, -0.454904, -0.444435, -0.444212, -0.445589, -0.447573, -0.462787, -0.44916, -0.472651, -0.468133, -0.45694, -0.458821, -0.485103, -0.446994, -0.43282, -0.45589, -0.426143, -0.40359, -0.363741, -0.331077, -0.317334, -0.201667, -0.126575, 0.018091, 0.112262, 0.159996, 0.209058, 0.258128, 0.247407, 0.250017, 0.222313, 0.25273, 0.256327, 0.242546, 0.214872, 0.215316, 0.175467, 0.217535, 0.183793, 0.219479, 0.266644, 0.194197, 0.165731, 0.140617, 0.169031, 0.170275, 0.181677, 0.232647, 0.179145, 0.215955, 0.214355, 0.228117, 0.235911, 0.237009, 0.201262, 0.216143, 0.144779, 0.151827, 0.115278, 0.115478, 0.141644, 0.179697, 0.191019, 0.203284, 0.236299, 0.205391, 0.241744, 0.250531, 0.298857, 0.315488, 0.352437, 0.340785, 0.443903, 0.425376, 0.47903, 0.449707, 0.472311, 0.510881, 0.482006, 0.392385, 0.468033, 0.39808, 0.375817, 0.371284, 0.320689, 0.318636, 0.315438, 0.232022, 0.372788, 0.32465, 0.271085, 0.414523, 0.307336, 0.334052, 0.434787, 0.512731, 0.317612, 0.491413, 0.409204, 0.525266, 0.478266, 0.45961, 0.436648, 0.459531, 0.436141, 0.413663, 0.398575, 0.390641, 0.392539, 0.485506, 0.445585, 0.347602, 0.455183, 0.321461, 0.367163, 0.429188, 0.418034, 0.52535, 0.399544, 0.42385, 0.529509, 0.5157, 0.617328, 0.597122, 0.594059, 0.594691, 0.600282, 0.546499, 0.497699, 0.556929, 0.539499, 0.409135, 0.456383, 0.418568, 0.434528, 0.522443, 0.438167, 0.486355, 0.442752, 0.412655, 0.455392, 0.474324, 0.417536, 0.57548, 0.51493, 0.56298, 0.617955, 0.667231, 0.682059, 0.550191, 0.647267, 0.929885, 0.54052, 0.526737, 0.448517, 0.398008, 0.442339, 0.319016, 0.302456, 0.415852, 0.351541, 0.565985, 0.147671, 0.218077, 0.526529, 0.368265, 0.44328, 0.54337, 0.554381, 0.579562, 1.145064, 0.474697, 0.52585, 0, 0.790973, 0.39192, 0.326082, 0, 0.083867, 1.044604, 0, -0.205917, 2.25042, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.559482, -0.602121, -0.624866, -0.613192, -0.631465, -0.519454, -0.500866, -0.469724, -0.476166, -0.463102, -0.361179, -0.287552, -0.3111, -0.228905, -0.238199, -0.204979, -0.193707, -0.202779, -0.236573, -0.21077, -0.260254, -0.27315, -0.301215, -0.341488, -0.328717, -0.343634, -0.376461, -0.417387, -0.441517, -0.439368, -0.503592, -0.486406, -0.496176, -0.507778, -0.530407, -0.511712, -0.484602, -0.470972, -0.471718, -0.460872, -0.466255, -0.464912, -0.474654, -0.454725, -0.481183, -0.472699, -0.470192, -0.46537, -0.489223, -0.456005, -0.431772, -0.443258, -0.434035, -0.414257, -0.38212, -0.333811, -0.325571, -0.205765, -0.177681, -0.031828, 0.03308, 0.100225, 0.1805, 0.162762, 0.151463, 0.197161, 0.158874, 0.192994, 0.218672, 0.19785, 0.165783, 0.168429, 0.189007, 0.172105, 0.196655, 0.23489, 0.20566, 0.149449, 0.152633, 0.149792, 0.149313, 0.108493, 0.16696, 0.12918, 0.151218, 0.17971, 0.187829, 0.193708, 0.160601, 0.177829, 0.126131, 0.163945, 0.125755, 0.124269, 0.105795, 0.103646, 0.117284, 0.115045, 0.191812, 0.171087, 0.204752, 0.22172, 0.256858, 0.25817, 0.276647, 0.281925, 0.293746, 0.376001, 0.345878, 0.358589, 0.514045, 0.364067, 0.326107, 0.380942, 0.416921, 0.371127, 0.358145, 0.293008, 0.363997, 0.299027, 0.38957, 0.279079, 0.365047, 0.294776, 0.284939, 0.35262, 0.268226, 0.257435, 0.263548, 0.330969, 0.303246, 0.388049, 0.321075, 0.351195, 0.350266, 0.397131, 0.356627, 0.314081, 0.356588, 0.358948, 0.406591, 0.284825, 0.372631, 0.39431, 0.349754, 0.37394, 0.434123, 0.349037, 0.318797, 0.291942, 0.345668, 0.369503, 0.348732, 0.442013, 0.427394, 0.481643, 0.406194, 0.393411, 0.441602, 0.452181, 0.421382, 0.410134, 0.455991, 0.419908, 0.455922, 0.410726, 0.398019, 0.382658, 0.452003, 0.406524, 0.448065, 0.489493, 0.3995, 0.458346, 0.337891, 0.421285, 0.378617, 0.421239, 0.348209, 0.50446, 0.458262, 0.512232, 0.503713, 0.351478, 0.425139, 0.343026, 0.418601, 0.665604, 0.337567, 0.394732, 0.335832, 0.411565, 0.419362, 0.482439, 0.390441, 0.344034, 0.374223, 0.266136, 0.164416, 0.263653, 0.292995, 0.390364, 0.14606, 0.140964, 0.433272, 0.45315, 0.367409, 0.089015, 0.363123, 0.425232, 0.166911, 0.244288, 0.129312, 0.042843, -0.080943, 0.049058, -0.512184, -0.357863, 0.034254, 0, 0, 0, 0, 0, 0, 0, 0, 0],

[-0.65099, -0.676578, -0.676391, -0.672129, -0.706334, -0.590103, -0.582595, -0.560832, -0.543864, -0.521743, -0.438357, -0.381153, -0.374126, -0.331879, -0.311291, -0.284937, -0.28709, -0.291305, -0.306163, -0.29413, -0.324953, -0.354517, -0.388941, -0.429035, -0.402038, -0.418507, -0.435314, -0.494234, -0.511274, -0.512984, -0.578351, -0.54893, -0.564145, -0.573571, -0.599449, -0.575134, -0.541064, -0.542337, -0.532102, -0.527954, -0.527959, -0.522385, -0.539983, -0.510553, -0.545928, -0.535611, -0.533612, -0.515498, -0.56326, -0.526362, -0.50769, -0.538476, -0.500853, -0.487905, -0.449768, -0.423632, -0.42097, -0.315281, -0.271281, -0.152819, -0.096958, -0.029634, 0.022669, 0.027457, 0.033879, 0.083262, 0.007516, 0.040048, 0.0743, 0.037824, 0.025354, 0.071293, 0.052726, 0.057751, 0.048566, 0.038329, 0.049, 0.014757, -0.022946, -0.011949, -0.036979, -0.013228, 0.011691, 0.004595, 0.026766, 0.030654, 0.032653, 0.04644, 0.049008, 0.038885, 0.019423, 0.052017, 0.003632, 0.027895, -0.015076, 0.006388, 0.00911, 0.023843, 0.036727, 0.03267, 0.066464, 0.052859, 0.066765, 0.082315, 0.095725, 0.136963, 0.105527, 0.172812, 0.155499, 0.196175, 0.219194, 0.174046, 0.187896, 0.209161, 0.215702, 0.172672, 0.187579, 0.124706, 0.164093, 0.12135, 0.098558, 0.15724, 0.130645, 0.079519, 0.133255, 0.135563, 0.07542, 0.024498, 0.083999, 0.125811, 0.09367, 0.089916, 0.117368, 0.140165, 0.124791, 0.117469, 0.195728, 0.128561, 0.13572, 0.15292, 0.141656, 0.199253, 0.13237, 0.184633, 0.141606, 0.234161, 0.187579, 0.129277, 0.177195, 0.123939, 0.160411, 0.169723, 0.146653, 0.164514, 0.198544, 0.166746, 0.189063, 0.194258, 0.259403, 0.231801, 0.192112, 0.253523, 0.222626, 0.180748, 0.260326, 0.233262, 0.171444, 0.212668, 0.223751, 0.246711, 0.199942, 0.239481, 0.192802, 0.144952, 0.194353, 0.107958, 0.203868, 0.133679, 0.144534, 0.190647, 0.106542, 0.224844, 0.272546, 0.181614, 0.260063, 0.292928, 0.292851, 0.245973, 0.183989, 0.218547, 0.173434, 0.200006, 0.226354, 0.1728, 0.066206, 0.168481, 0.072434, 0.123516, 0.131934, 0.027535, 0.060838, -0.010259, -0.077126, -0.035642, 0.105163, 0.105827, 0.156823, 0.063271, 0.035243, 0.02202, -0.141307, -0.054861, 0.161862, -0.205762, -0.38765, 0.140407, -0.465892, -0.274508, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.540932, -0.592725, -0.604099, -0.618703, -0.650829, -0.520287, -0.524962, -0.516882, -0.521472, -0.484251, -0.415378, -0.366251, -0.384757, -0.305857, -0.31936, -0.262521, -0.261881, -0.258268, -0.288577, -0.259797, -0.309774, -0.313226, -0.340903, -0.373787, -0.347932, -0.36517, -0.391953, -0.434432, -0.462186, -0.458641, -0.52249, -0.513428, -0.520355, -0.535728, -0.567904, -0.556895, -0.518061, -0.510356, -0.49883, -0.497464, -0.493478, -0.496478, -0.510051, -0.487812, -0.507531, -0.502792, -0.49778, -0.493285, -0.522202, -0.479944, -0.465919, -0.486358, -0.467388, -0.436025, -0.400388, -0.378536, -0.38396, -0.261949, -0.260722, -0.119875, -0.092896, -0.051481, -0.040391, -0.022678, 0.008186, 0.036174, 0.006517, 0.023667, 0.084538, 0.042923, 0.037069, 0.044026, 0.078978, 0.098548, 0.079211, 0.093618, 0.081311, 0.104048, 0.021644, 0.048842, 0.011555, 0.031696, 0.030141, 0.00472, -0.008216, 0.019032, 0.015796, 0.032106, 0.034173, 0.016324, 0.029996, 0.041353, 0.014657, 0.021401, 0.016002, -0.003631, 0.028483, 0.046994, 0.08702, 0.05753, 0.120051, 0.086268, 0.091379, 0.078544, 0.131562, 0.102493, 0.108564, 0.11759, 0.139118, 0.169856, 0.136231, 0.117003, 0.127815, 0.128931, 0.132083, 0.128133, 0.126017, 0.119988, 0.182373, 0.102174, 0.13587, 0.162158, 0.137831, 0.110426, 0.140183, 0.133292, 0.084327, 0.05822, 0.09591, 0.090962, 0.057167, 0.044159, 0.042615, 0.089991, 0.080543, 0.046912, 0.151514, 0.095206, 0.118304, 0.129896, 0.12621, 0.157585, 0.126335, 0.139428, 0.181203, 0.192461, 0.186549, 0.114475, 0.202739, 0.145122, 0.20532, 0.236196, 0.191913, 0.183467, 0.146723, 0.130953, 0.146482, 0.124565, 0.1472, 0.127441, 0.184529, 0.219913, 0.207118, 0.165652, 0.232983, 0.246934, 0.21453, 0.194486, 0.265221, 0.23406, 0.203326, 0.25175, 0.28875, 0.225212, 0.237932, 0.211751, 0.221534, 0.171728, 0.089874, 0.111544, 0.085692, 0.146805, 0.216001, 0.16806, 0.201279, 0.142955, 0.182538, 0.291305, 0.194829, 0.307862, 0.293343, 0.210546, 0.357844, 0.26851, 0.361265, 0.30103, 0.323633, 0.269304, 0.283975, 0.498385, 0.079909, 0.204235, 0.064731, 0.113274, 0.179013, 0.062968, 0.045545, 0.036318, 0.010448, 0.080778, 0.094449, 0.098876, 0.102145, 0.073689, -0.266312, 0.058106, -0.102353, -0.249749, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.605769, -0.631594, -0.626122, -0.633771, -0.670618, -0.557342, -0.546131, -0.534861, -0.545645, -0.497177, -0.410747, -0.339849, -0.363444, -0.303866, -0.290688, -0.246879, -0.268701, -0.261328, -0.285182, -0.26077, -0.31181, -0.341939, -0.365204, -0.39347, -0.365998, -0.396762, -0.412071, -0.456111, -0.487423, -0.49256, -0.545126, -0.528708, -0.541143, -0.54482, -0.583444, -0.563409, -0.532336, -0.519647, -0.498503, -0.50472, -0.509559, -0.491163, -0.518585, -0.500804, -0.514604, -0.517213, -0.508773, -0.504406, -0.531872, -0.49359, -0.491194, -0.511, -0.482205, -0.472216, -0.443061, -0.39898, -0.397623, -0.285077, -0.246729, -0.132524, -0.067897, 0.000836, 0.010437, 0.041609, 0.058594, 0.066246, 0.032727, 0.081467, 0.112537, 0.068709, 0.046743, 0.048796, 0.038847, 0.062476, 0.100725, 0.059863, 0.067705, 0.039372, 0.018775, 0.029203, 0.009958, 0.031341, 0.031748, 0.050512, 0.063292, 0.066938, 0.046578, 0.053268, 0.07325, 0.076151, 0.059659, 0.061639, 0.00016, 0.025045, 0.037952, 0.017412, 0.017432, 0.057896, 0.065783, 0.058803, 0.080498, 0.06989, 0.066065, 0.11936, 0.120659, 0.122053, 0.133806, 0.163906, 0.175115, 0.190052, 0.221743, 0.192271, 0.175733, 0.167151, 0.217113, 0.14588, 0.17927, 0.164113, 0.154844, 0.093277, 0.143608, 0.146051, 0.118375, 0.064337, 0.138609, 0.078183, 0.098948, 0.074054, 0.115608, 0.121662, 0.047101, 0.111673, 0.069918, 0.131158, 0.138497, 0.106042, 0.1909, 0.179153, 0.145475, 0.166091, 0.156831, 0.146497, 0.17356, 0.152402, 0.178001, 0.189502, 0.169196, 0.173365, 0.20371, 0.131523, 0.180968, 0.126224, 0.154071, 0.231382, 0.207549, 0.175866, 0.196179, 0.244617, 0.241982, 0.215071, 0.263195, 0.207188, 0.218074, 0.286302, 0.248002, 0.236138, 0.217629, 0.229835, 0.209931, 0.242262, 0.206586, 0.289086, 0.226175, 0.180684, 0.168808, 0.201123, 0.180157, 0.167237, 0.167939, 0.238368, 0.088961, 0.218874, 0.272546, 0.254387, 0.237787, 0.244035, 0.224056, 0.307812, 0.281837, 0.359991, 0.197196, 0.268474, 0.258211, 0.307837, 0.126127, 0.212089, 0.297834, 0.172155, -0.003974, 0.224658, 0.005629, 0.152519, 0.013535, 0.072145, 0.092786, 0.303256, 0.249475, 0.186339, 0.264443, 0.202441, -0.02344, 0.211746, 0.174331, -0.160004, -0.202129, 0.174893, 0, -0.241565, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.61479, -0.664645, -0.655611, -0.664222, -0.690904, -0.576963, -0.56726, -0.556244, -0.550981, -0.532409, -0.440116, -0.373271, -0.398898, -0.308375, -0.305463, -0.278516, -0.25847, -0.275194, -0.296639, -0.270487, -0.324477, -0.33164, -0.37068, -0.389985, -0.368631, -0.403613, -0.422487, -0.47442, -0.505332, -0.49757, -0.561657, -0.549, -0.550749, -0.561609, -0.578512, -0.561161, -0.519148, -0.522041, -0.50863, -0.507944, -0.517475, -0.50396, -0.526322, -0.488368, -0.52711, -0.524705, -0.520223, -0.508318, -0.540335, -0.517713, -0.503865, -0.52183, -0.497343, -0.483093, -0.454753, -0.409507, -0.405875, -0.304918, -0.273182, -0.115205, -0.100346, -0.007749, 0.002315, 0.025402, 0.024539, 0.085774, 0.026764, 0.041799, 0.091897, 0.091141, 0.048406, 0.098367, 0.034177, 0.054407, 0.033418, 0.027119, 0.016743, 0.02555, -0.004231, -0.046137, -0.040026, -0.001519, 0.034508, -0.00473, 0.004559, 0.049089, 0.053285, 0.058621, 0.043913, 0.037103, 0.02465, 0.039998, 0.010388, 0.005552, 0.002972, 0.011675, 0.01045, 0.020147, 0.037561, 0.046246, 0.039065, 0.013904, 0.039867, 0.02964, 0.077653, 0.077183, 0.108129, 0.118511, 0.137476, 0.195436, 0.195819, 0.181174, 0.168455, 0.137945, 0.211311, 0.170053, 0.178027, 0.13278, 0.13832, 0.096351, 0.126062, 0.137047, 0.145577, 0.043349, 0.081586, 0.016987, -0.005657, -0.005961, 0.014082, 0.042034, 0.040611, 0.084045, 0.076005, 0.117989, 0.116693, 0.146393, 0.163792, 0.170677, 0.081117, 0.153234, 0.147786, 0.161951, 0.118711, 0.21816, 0.19337, 0.219698, 0.132084, 0.119212, 0.106751, 0.043331, 0.09626, 0.086883, 0.092079, 0.119296, 0.127079, 0.15706, 0.155449, 0.232007, 0.204954, 0.209143, 0.210187, 0.196695, 0.228269, 0.191299, 0.237973, 0.226339, 0.2175, 0.145588, 0.246767, 0.242834, 0.191095, 0.188732, 0.138394, 0.153252, 0.080204, 0.096568, 0.089563, 0.1058, 0.028553, 0.168543, 0.141518, 0.159546, 0.273071, 0.210388, 0.242988, 0.246875, 0.231907, 0.279717, 0.25581, 0.280293, 0.289078, 0.239969, 0.406953, 0.262288, 0.100709, 0.094131, 0.091808, 0.173428, -0.056349, 0.035772, 0.024445, -0.041498, -0.043222, 0.025893, 0.11967, 0.321953, 0.221991, 0.122067, 0.283849, 0.246594, -0.056905, -0.010567, 0.041816, -0.096383, -0.081821, -0.064541, -0.389246, 0.101566, -0.031749, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.621736, -0.665643, -0.642025, -0.670453, -0.690616, -0.562778, -0.563245, -0.550718, -0.526879, -0.521705, -0.415378, -0.354884, -0.382486, -0.304863, -0.287579, -0.264699, -0.264598, -0.258812, -0.287125, -0.25664, -0.309739, -0.330768, -0.344459, -0.393439, -0.376346, -0.394512, -0.416803, -0.464802, -0.486132, -0.492862, -0.547658, -0.536605, -0.547253, -0.545468, -0.575237, -0.545363, -0.516592, -0.506115, -0.50129, -0.485591, -0.507669, -0.483855, -0.506505, -0.489723, -0.509236, -0.509115, -0.511213, -0.501809, -0.528116, -0.508912, -0.489186, -0.5196, -0.497604, -0.480764, -0.446683, -0.414935, -0.396762, -0.2856, -0.264508, -0.117055, -0.056777, -0.022485, 0.035006, 0.033096, 0.044719, 0.075636, 0.04282, 0.072051, 0.086615, 0.066593, 0.011122, 0.065826, 0.036124, 0.043876, 0.006948, 0.020685, 0.05096, 0.025624, -0.006579, -0.025371, -0.023101, 0.018656, 0.044961, 0.01139, 0.011672, 0.046164, 0.037382, 0.064041, 0.069831, 0.057584, 0.029276, 0.032485, 0.021532, 0.054303, -0.018283, 0.045646, 0.009538, 0.0137, 0.028039, 0.011652, 0.031823, 0.022767, 0.066765, 0.070505, 0.075521, 0.108915, 0.112426, 0.14928, 0.178541, 0.215252, 0.209315, 0.180736, 0.213391, 0.191886, 0.187263, 0.161339, 0.178983, 0.119712, 0.140481, 0.069438, 0.115787, 0.088424, 0.120448, 0.006255, 0.033825, 0.058873, 0.023396, -0.013753, 0.050298, 0.056008, 0.068665, 0.086634, 0.029537, 0.120688, 0.091988, 0.103232, 0.150372, 0.146404, 0.158868, 0.162226, 0.101473, 0.130577, 0.161913, 0.141384, 0.120142, 0.202218, 0.140324, 0.087678, 0.102784, 0.058118, 0.127892, 0.126331, 0.078215, 0.135459, 0.154379, 0.171839, 0.18251, 0.20356, 0.218076, 0.213124, 0.249386, 0.251642, 0.246495, 0.237769, 0.253296, 0.25289, 0.22932, 0.214677, 0.245547, 0.203369, 0.166399, 0.164529, 0.134133, 0.103224, 0.078543, 0.058448, 0.100419, 0.086683, 0.128722, 0.163633, 0.150405, 0.193137, 0.225635, 0.150764, 0.201754, 0.201288, 0.220269, 0.319536, 0.178669, 0.321621, 0.251604, 0.225928, 0.193546, 0.169751, 0.105221, 0.064941, -0.000214, -0.045415, -0.101956, -0.030523, 0.053185, -0.083438, 0.011776, -0.032025, 0.100904, 0.044624, 0.100976, 0.127829, 0.317919, 0.394523, -0.02006, 0.264789, 0.120842, 0.005296, -0.16319, 1.956649, -0.541827, -0.107081, 0.393088, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.628064, -0.661477, -0.677367, -0.668903, -0.678728, -0.59739, -0.573623, -0.555658, -0.528962, -0.504651, -0.432181, -0.369297, -0.378577, -0.299227, -0.285084, -0.264337, -0.25467, -0.262023, -0.265925, -0.279241, -0.308329, -0.333312, -0.362488, -0.39142, -0.380681, -0.40003, -0.443209, -0.469703, -0.509602, -0.508587, -0.562527, -0.536605, -0.554377, -0.5547, -0.58014, -0.567611, -0.527492, -0.527491, -0.506705, -0.500463, -0.48868, -0.500107, -0.514697, -0.503907, -0.52626, -0.517523, -0.50807, -0.516309, -0.548066, -0.510805, -0.506331, -0.512228, -0.497604, -0.481066, -0.453601, -0.412863, -0.405509, -0.300021, -0.269623, -0.128169, -0.075583, 0.017504, 0.050633, 0.105996, 0.046191, 0.068747, 0.051306, 0.043646, 0.096966, 0.038168, 0.052193, 0.057271, 0.024819, 0.039589, -0.000814, 0.016653, 0.0254, 0.034184, -0.015292, -0.041054, -0.044396, 0.00613, 0.01795, 0.010503, 0.00722, 0.064144, 0.047358, 0.07001, 0.069771, 0.066649, 0.034961, 0.047423, 0.034753, 0.025264, 0.023531, 0.009995, -0.003081, 0.021991, 0.029075, 0.02615, 0.04379, 0.026857, 0.045467, 0.076203, 0.100697, 0.111197, 0.139533, 0.14361, 0.181169, 0.25283, 0.241032, 0.198885, 0.218893, 0.186993, 0.214202, 0.16381, 0.197945, 0.146743, 0.184244, 0.158536, 0.113936, 0.048751, 0.088412, 0.025581, 0.095993, 0.045073, 0.057618, 0.007759, 0.06653, 0.094094, 0.097059, 0.11096, 0.041152, 0.171285, 0.138192, 0.122907, 0.159499, 0.167034, 0.152489, 0.166955, 0.164461, 0.197159, 0.144072, 0.16247, 0.175774, 0.167031, 0.129572, 0.077463, 0.125928, 0.113264, 0.127046, 0.137962, 0.107344, 0.121204, 0.161509, 0.2212, 0.187813, 0.194806, 0.242328, 0.225172, 0.244057, 0.297677, 0.249771, 0.29307, 0.281722, 0.285225, 0.235758, 0.195255, 0.21723, 0.179373, 0.164369, 0.194965, 0.161281, 0.113913, 0.143496, 0.104176, 0.197362, 0.134157, 0.110762, 0.194125, 0.184472, 0.205415, 0.253035, 0.248816, 0.228579, 0.273715, 0.228575, 0.236055, 0.220838, 0.273241, 0.274017, 0.100759, 0.182867, 0.154399, 0.057179, 0.02193, -0.075746, 0.022366, -0.105773, 0.012277, -0.144487, -0.040973, -0.109638, -0.058934, 0.112937, 0.145551, 0.078968, 0.033975, 0.177534, 0.319571, -0.01322, 0.173957, 0.363531, 0.083147, -0.068457, 0.677895, -0.509166, -0.121322, -0.08604, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.627781, -0.654372, -0.66008, -0.675374, -0.695322, -0.593965, -0.572805, -0.56983, -0.548633, -0.530209, -0.446105, -0.399041, -0.39666, -0.31499, -0.320065, -0.283167, -0.284285, -0.295892, -0.315063, -0.30799, -0.347336, -0.359669, -0.390357, -0.429491, -0.40759, -0.426802, -0.453689, -0.485737, -0.512318, -0.517742, -0.580767, -0.565315, -0.57831, -0.580125, -0.597528, -0.586036, -0.55712, -0.552361, -0.534823, -0.534344, -0.535709, -0.532822, -0.544828, -0.53041, -0.56206, -0.546395, -0.532776, -0.530775, -0.562223, -0.522772, -0.515055, -0.536934, -0.505463, -0.496231, -0.462038, -0.423157, -0.422172, -0.307904, -0.292566, -0.152592, -0.114874, 0.004119, 0.002779, -0.003467, 0.040505, 0.049209, 0.000164, 0.02291, 0.105012, 0.011976, 0.025354, 0.047257, 0.015011, 0.042253, 0.050227, 0.031329, 0.075618, 0.025847, 0.030288, -0.029208, -0.002964, -0.008777, 0.003632, 0.015916, 0.033803, 0.050559, 0.043948, 0.039998, 0.057752, 0.038327, 0.026132, 0.039457, -0.010093, 0.036894, 0.006287, 0.003395, 0.035365, 0.026032, 0.037172, 0.032841, 0.059287, 0.048087, 0.086357, 0.062032, 0.128397, 0.095681, 0.132424, 0.161004, 0.174385, 0.228069, 0.201588, 0.214311, 0.16225, 0.225411, 0.251098, 0.194728, 0.217981, 0.16759, 0.170908, 0.127935, 0.183597, 0.161933, 0.143491, 0.094918, 0.099979, 0.117943, 0.072099, 0.090256, 0.094766, 0.071241, 0.090098, 0.093321, 0.108647, 0.172809, 0.147638, 0.134993, 0.194885, 0.168424, 0.121731, 0.157865, 0.151194, 0.159816, 0.178262, 0.191178, 0.200703, 0.181571, 0.209777, 0.180619, 0.153937, 0.158525, 0.19929, 0.124618, 0.151972, 0.147706, 0.159193, 0.201087, 0.198965, 0.231529, 0.24014, 0.180026, 0.234194, 0.243705, 0.297889, 0.231928, 0.305083, 0.272219, 0.251862, 0.259303, 0.303887, 0.258109, 0.180599, 0.277544, 0.233325, 0.206522, 0.157954, 0.149146, 0.228593, 0.157549, 0.136724, 0.234867, 0.196215, 0.178636, 0.235327, 0.193084, 0.245086, 0.201802, 0.196103, 0.239276, 0.279607, 0.282236, 0.209387, 0.201527, 0.119207, 0.274822, 0.114157, 0.183837, 0.096322, 0.101908, 0.026454, 0.227568, -0.012949, 0.02401, -0.02101, 0.026486, 0.153401, 0.116437, 0.123026, 0.055223, 0.148198, 0.116608, -0.022691, 0.047425, 0.098147, 0.059121, -0.277078, -0.196658, -0.278959, 0.271204, 1.375359, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.673838, -0.702263, -0.716928, -0.725691, -0.750087, -0.635973, -0.647044, -0.610767, -0.607906, -0.572766, -0.482382, -0.423191, -0.457403, -0.368025, -0.376798, -0.324682, -0.335342, -0.337631, -0.346676, -0.346699, -0.373572, -0.405087, -0.440144, -0.462858, -0.433188, -0.461145, -0.490478, -0.529762, -0.573114, -0.564513, -0.632778, -0.609143, -0.625336, -0.629632, -0.660303, -0.636246, -0.601895, -0.588966, -0.582107, -0.577146, -0.576454, -0.576966, -0.592571, -0.577561, -0.593602, -0.59102, -0.586236, -0.580021, -0.60429, -0.566617, -0.558536, -0.583555, -0.55316, -0.534801, -0.508573, -0.465405, -0.44326, -0.371252, -0.289114, -0.165822, -0.098176, -0.025645, 0.011068, 0.027045, 0.037349, 0.117302, 0.06194, 0.074599, 0.107094, 0.058408, 0.046045, 0.079855, 0.113054, 0.056326, 0.061265, 0.022793, 0.007046, 0.005147, -0.001726, -0.053683, -0.022832, -0.021366, -0.010777, 0, -0.001489, 0.024371, 0.032944, 0.028541, 0.046453, 0.029446, 0.005731, 0.046488, -0.018175, 0.000671, -0.011742, 0.009779, 0.001891, 0.015463, 0.019841, 0.024241, 0.060832, 0.030393, 0.050648, 0.06055, 0.099712, 0.121833, 0.119362, 0.180266, 0.192519, 0.252455, 0.23029, 0.294496, 0.231939, 0.231173, 0.308058, 0.250357, 0.296682, 0.245418, 0.219831, 0.203503, 0.242683, 0.219765, 0.172719, 0.18842, 0.209784, 0.139909, 0.08345, 0.091991, 0.114411, 0.160883, 0.140872, 0.129877, 0.148709, 0.191292, 0.20009, 0.236245, 0.232491, 0.184785, 0.25178, 0.176791, 0.240829, 0.23194, 0.236222, 0.254876, 0.311387, 0.288153, 0.254144, 0.176252, 0.20578, 0.14205, 0.187718, 0.162203, 0.222149, 0.180656, 0.211378, 0.203356, 0.250467, 0.286428, 0.273439, 0.268885, 0.304909, 0.280355, 0.25578, 0.276343, 0.302093, 0.299648, 0.258504, 0.239532, 0.29957, 0.283726, 0.277369, 0.31188, 0.249939, 0.1813, 0.192359, 0.06727, 0.146928, 0.066051, 0.105719, 0.225041, 0.122938, 0.174304, 0.276061, 0.258568, 0.279921, 0.214663, 0.227005, 0.277358, 0.257075, 0.252143, 0.225581, 0.244752, 0.304237, 0.26851, 0.201564, 0.221118, 0.214288, 0.058725, -0.026815, 0.023344, -0.034138, 0.04878, -0.250539, -0.108865, 0.012266, 0.128506, 0.020274, 0.066722, 0.057683, 0.174104, -0.050274, 0.026842, -0.063252, -0.135663, -0.324734, -0.321724, -0.542949, -0.524522, -0.23388, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.65099, -0.676578, -0.676391, -0.672129, -0.706334, -0.590103, -0.582595, -0.560832, -0.543864, -0.521743, -0.438357, -0.381153, -0.374126, -0.331879, -0.311291, -0.284937, -0.28709, -0.291305, -0.306163, -0.29413, -0.324953, -0.354517, -0.388941, -0.429035, -0.402038, -0.418507, -0.435314, -0.494234, -0.511274, -0.512984, -0.578351, -0.54893, -0.564145, -0.573571, -0.599449, -0.575134, -0.541064, -0.542337, -0.532102, -0.527954, -0.527959, -0.522385, -0.539983, -0.510553, -0.545928, -0.535611, -0.533612, -0.515498, -0.56326, -0.526362, -0.50769, -0.538476, -0.500853, -0.487905, -0.449768, -0.423632, -0.42097, -0.315281, -0.271281, -0.152819, -0.096958, -0.029634, 0.022669, 0.027457, 0.033879, 0.083262, 0.007516, 0.040048, 0.0743, 0.037824, 0.025354, 0.071293, 0.052726, 0.057751, 0.048566, 0.038329, 0.049, 0.014757, -0.022946, -0.011949, -0.036979, -0.013228, 0.011691, 0.004595, 0.026766, 0.030654, 0.032653, 0.04644, 0.049008, 0.038885, 0.019423, 0.052017, 0.003632, 0.027895, -0.015076, 0.006388, 0.00911, 0.023843, 0.036727, 0.03267, 0.066464, 0.052859, 0.066765, 0.082315, 0.095725, 0.136963, 0.105527, 0.172812, 0.155499, 0.196175, 0.219194, 0.174046, 0.187896, 0.209161, 0.215702, 0.172672, 0.187579, 0.124706, 0.164093, 0.12135, 0.098558, 0.15724, 0.130645, 0.079519, 0.133255, 0.135563, 0.07542, 0.024498, 0.083999, 0.125811, 0.09367, 0.089916, 0.117368, 0.140165, 0.124791, 0.117469, 0.195728, 0.128561, 0.13572, 0.15292, 0.141656, 0.199253, 0.13237, 0.184633, 0.141606, 0.234161, 0.187579, 0.129277, 0.177195, 0.123939, 0.160411, 0.169723, 0.146653, 0.164514, 0.198544, 0.166746, 0.189063, 0.194258, 0.259403, 0.231801, 0.192112, 0.253523, 0.222626, 0.180748, 0.260326, 0.233262, 0.171444, 0.212668, 0.223751, 0.246711, 0.199942, 0.239481, 0.192802, 0.144952, 0.194353, 0.107958, 0.203868, 0.133679, 0.144534, 0.190647, 0.106542, 0.224844, 0.272546, 0.181614, 0.260063, 0.292928, 0.292851, 0.245973, 0.183989, 0.218547, 0.173434, 0.200006, 0.226354, 0.1728, 0.066206, 0.168481, 0.072434, 0.123516, 0.131934, 0.027535, 0.060838, -0.010259, -0.077126, -0.035642, 0.105163, 0.105827, 0.156823, 0.063271, 0.035243, 0.02202, -0.141307, -0.054861, 0.161862, -0.205762, -0.38765, 0.140407, -0.465892, -0.274508, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.614673, -0.681363, -0.675459, -0.683511, -0.707087, -0.587747, -0.585894, -0.550644, -0.552076, -0.530576, -0.461563, -0.387402, -0.409725, -0.33363, -0.334343, -0.298395, -0.293198, -0.285611, -0.318129, -0.299153, -0.342077, -0.362581, -0.382317, -0.42424, -0.402457, -0.417164, -0.446564, -0.491261, -0.520147, -0.509776, -0.57303, -0.560532, -0.575183, -0.57657, -0.608572, -0.58587, -0.552751, -0.551136, -0.5342, -0.532491, -0.542637, -0.532385, -0.547713, -0.525167, -0.557575, -0.543192, -0.543012, -0.527302, -0.564579, -0.538689, -0.515055, -0.531176, -0.514463, -0.489011, -0.467573, -0.42537, -0.422419, -0.312264, -0.288921, -0.144352, -0.102506, -0.044069, -0.013711, -0.00721, 0.008345, 0.041503, -0.014177, 0.067558, 0.043399, 0.023044, -0.003671, -0.005401, 0.046687, 0.011993, 0.031661, 0.024439, 0.05159, 0.022144, -0.027299, -0.031522, -0.040155, 0.001126, -0.019628, 0.000556, 0.008071, 0.018861, 0.02534, 0.030621, 0.035165, 0.023697, 0.025473, 0.035474, -0.01459, 0.010754, -0.015025, -0.021443, -0.012706, 0.016536, 0.025217, 0.042958, 0.043504, 0.057055, 0.07337, 0.08824, 0.092741, 0.11594, 0.129216, 0.140019, 0.122683, 0.167848, 0.192839, 0.201265, 0.175286, 0.152908, 0.200932, 0.144236, 0.137686, 0.100115, 0.14474, 0.063052, 0.101666, 0.110806, 0.111502, 0.068992, 0.104936, 0.10566, 0.080829, 0.022815, 0.053968, 0.060445, 0.035507, 0.092833, 0.01883, 0.119144, 0.097039, 0.106136, 0.121056, 0.12671, 0.075689, 0.132783, 0.150573, 0.117533, 0.131459, 0.178611, 0.147613, 0.176534, 0.163417, 0.115523, 0.167809, 0.11292, 0.121588, 0.123018, 0.113689, 0.128273, 0.145336, 0.146428, 0.164176, 0.200882, 0.224456, 0.167503, 0.18928, 0.214594, 0.213344, 0.171735, 0.228528, 0.185627, 0.182777, 0.164898, 0.251686, 0.251497, 0.145611, 0.184847, 0.174218, 0.15383, 0.156883, 0.126003, 0.122981, 0.048835, 0.03931, 0.19476, 0.085421, 0.131724, 0.193978, 0.175085, 0.166724, 0.183197, 0.243141, 0.174799, 0.162579, 0.204753, 0.100744, 0.150254, 0.22613, 0.184991, 0.155665, 0.108205, 0.073193, 0.032612, -0.099015, -0.031673, 0.064391, -0.009696, -0.092859, -0.110601, 0.234499, 0.078649, 0.074647, 0.002981, 0.217232, 0.137667, -0.114247, 0.099772, 0.186626, -0.118475, -0.089647, -0.324764, -0.401835, -0.256643, 0.070007, 0, 0, 0, 0, 0, 0, 0, 0, 0],

[-0.525801, -0.589235, -0.58113, -0.590103, -0.622316, -0.510183, -0.497027, -0.468874, -0.462573, -0.449015, -0.34017, -0.267982, -0.295653, -0.216882, -0.220899, -0.179996, -0.187891, -0.180763, -0.206802, -0.203541, -0.234334, -0.255025, -0.29452, -0.323808, -0.315418, -0.32969, -0.358078, -0.405335, -0.426887, -0.433346, -0.496112, -0.464772, -0.489032, -0.489435, -0.509074, -0.485666, -0.457566, -0.446846, -0.439308, -0.427726, -0.439457, -0.431271, -0.452293, -0.434851, -0.450855, -0.457406, -0.451467, -0.447111, -0.465611, -0.447841, -0.438384, -0.450711, -0.417164, -0.414513, -0.368445, -0.328878, -0.327683, -0.203983, -0.161907, -0.015351, 0.053919, 0.17156, 0.206698, 0.155842, 0.195872, 0.264437, 0.22327, 0.269153, 0.258473, 0.215077, 0.230457, 0.201343, 0.199384, 0.188235, 0.194098, 0.171291, 0.225757, 0.199935, 0.143714, 0.111077, 0.148116, 0.130086, 0.209857, 0.190823, 0.194746, 0.206716, 0.196888, 0.252031, 0.217227, 0.200057, 0.202168, 0.195681, 0.164209, 0.167009, 0.110272, 0.13371, 0.136159, 0.162685, 0.17553, 0.210708, 0.238534, 0.197234, 0.204797, 0.265223, 0.300081, 0.306095, 0.338295, 0.404081, 0.41544, 0.425237, 0.414138, 0.473784, 0.443021, 0.44478, 0.467011, 0.397417, 0.458646, 0.381134, 0.36716, 0.314042, 0.281507, 0.42409, 0.306258, 0.285946, 0.271322, 0.315254, 0.291642, 0.204476, 0.359845, 0.297418, 0.311529, 0.476098, 0.369779, 0.341925, 0.42366, 0.498473, 0.543866, 0.482162, 0.408353, 0.400375, 0.460812, 0.405524, 0.419839, 0.364148, 0.329996, 0.39675, 0.40295, 0.296947, 0.390068, 0.273819, 0.416506, 0.405707, 0.461105, 0.395656, 0.392899, 0.447773, 0.505976, 0.501245, 0.476395, 0.515642, 0.548798, 0.537907, 0.437401, 0.570859, 0.600153, 0.509939, 0.382779, 0.454239, 0.389405, 0.341068, 0.400676, 0.500936, 0.428479, 0.314851, 0.314873, 0.302399, 0.388274, 0.348428, 0.338194, 0.53642, 0.534318, 0.544466, 0.619508, 0.49114, 0.64487, 0.503861, 0.538428, 0.519955, 0.452376, 0.515485, 0.471224, 0.430325, 0.368599, 0.343893, 0.391316, 0.397209, 0.250805, 0.371913, 0.189264, 0.432774, 0.072576, 0.268269, 0.292571, 0.500649, 0.541723, 0.516123, 0.58269, 0.996771, 0.355436, 0.71406, 0.452561, 0.741255, 0.162888, 0.448476, -0.126788, -0.065917, -0.509166, -0.303083, 0.390082, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.652223, -0.679232, -0.696889, -0.697768, -0.721349, -0.617285, -0.609204, -0.581279, -0.577064, -0.524285, -0.456006, -0.37858, -0.39686, -0.315637, -0.295228, -0.260251, -0.260416, -0.252122, -0.286528, -0.271327, -0.31146, -0.32885, -0.352437, -0.376115, -0.379682, -0.410581, -0.451951, -0.491537, -0.522919, -0.517314, -0.58197, -0.564398, -0.572691, -0.578758, -0.603032, -0.565624, -0.540643, -0.529526, -0.522844, -0.514634, -0.517142, -0.509143, -0.519809, -0.513461, -0.524357, -0.521732, -0.518897, -0.511241, -0.544953, -0.524033, -0.502301, -0.537561, -0.504642, -0.497423, -0.471139, -0.425622, -0.431637, -0.292421, -0.257421, -0.120547, -0.02894, 0.060592, 0.081264, 0.09982, 0.144882, 0.166957, 0.129769, 0.151082, 0.194804, 0.153947, 0.106185, 0.184867, 0.115492, 0.125257, 0.074787, 0.075572, 0.060415, 0.057552, 0.043864, 0.023927, 0.030358, 0.020178, 0.0777, 0.061758, 0.065299, 0.087484, 0.094453, 0.088613, 0.122622, 0.125347, 0.075009, 0.131021, 0.094378, 0.101993, 0.091848, 0.106405, 0.120939, 0.080309, 0.094695, 0.070422, 0.06544, 0.107862, 0.106804, 0.131006, 0.134216, 0.155875, 0.221246, 0.281715, 0.285725, 0.340678, 0.378058, 0.338147, 0.372117, 0.380503, 0.40268, 0.373438, 0.377496, 0.368885, 0.335781, 0.281698, 0.294867, 0.238784, 0.254486, 0.149548, 0.17548, 0.198262, 0.173568, 0.099002, 0.191988, 0.209023, 0.140754, 0.258514, 0.240823, 0.34064, 0.331162, 0.243535, 0.403558, 0.307101, 0.337753, 0.360464, 0.357894, 0.32575, 0.426567, 0.372745, 0.403659, 0.361871, 0.301774, 0.219496, 0.217036, 0.163257, 0.23233, 0.227444, 0.228486, 0.249271, 0.241022, 0.301705, 0.366237, 0.378589, 0.396357, 0.379722, 0.364016, 0.325845, 0.377724, 0.365259, 0.454307, 0.46904, 0.515946, 0.51759, 0.494552, 0.351774, 0.277719, 0.334994, 0.298473, 0.287045, 0.175134, 0.172913, 0.187863, 0.19491, 0.149878, 0.324601, 0.329579, 0.406734, 0.351622, 0.332449, 0.415951, 0.395365, 0.303307, 0.443755, 0.424492, 0.47084, 0.433137, 0.494576, 0.401214, 0.392541, 0.156941, 0.158626, 0.116538, 0.031003, -0.16463, -0.110433, -0.068183, -0.055679, -0.06641, 0.155501, 0.14114, 0.195851, 0.166402, 0.04402, 0.126783, 0.394523, -0.015893, 0.199157, 0.210016, 0.222947, -0.269171, 0.133827, -0.24804, -0.515196, -0.433077, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.535994, -0.558713, -0.554297, -0.589731, -0.62323, -0.506807, -0.490463, -0.480054, -0.482293, -0.444425, -0.357363, -0.298452, -0.287332, -0.245482, -0.223204, -0.180387, -0.185495, -0.19277, -0.217129, -0.206472, -0.24639, -0.261571, -0.279495, -0.32689, -0.302578, -0.338137, -0.3551, -0.387211, -0.427582, -0.431581, -0.50204, -0.477067, -0.490173, -0.493983, -0.524754, -0.501114, -0.463327, -0.450209, -0.43384, -0.439215, -0.446105, -0.424122, -0.457918, -0.432377, -0.462383, -0.449811, -0.445032, -0.432355, -0.458606, -0.436506, -0.414891, -0.439287, -0.415308, -0.400724, -0.369954, -0.329861, -0.327024, -0.218595, -0.180162, -0.074905, 0.01635, 0.083438, 0.107466, 0.203672, 0.202905, 0.260652, 0.180287, 0.173192, 0.246276, 0.186814, 0.187213, 0.173991, 0.153688, 0.186313, 0.210992, 0.150847, 0.186668, 0.239322, 0.119425, 0.114769, 0.101413, 0.129996, 0.153523, 0.135969, 0.172881, 0.201214, 0.151308, 0.154829, 0.144554, 0.166978, 0.15488, 0.149568, 0.12668, 0.156533, 0.110067, 0.155983, 0.13053, 0.15753, 0.184491, 0.166321, 0.170181, 0.159873, 0.17743, 0.19981, 0.21483, 0.271565, 0.286691, 0.318202, 0.323704, 0.325023, 0.38635, 0.374064, 0.356097, 0.379919, 0.369465, 0.327449, 0.407837, 0.323814, 0.372108, 0.351411, 0.352837, 0.385019, 0.333384, 0.317946, 0.298509, 0.341325, 0.265053, 0.255404, 0.34059, 0.295915, 0.229973, 0.277794, 0.30286, 0.378676, 0.333704, 0.302579, 0.356627, 0.348656, 0.325164, 0.327653, 0.444822, 0.406463, 0.384956, 0.416448, 0.403481, 0.43099, 0.330081, 0.430632, 0.306769, 0.308871, 0.318732, 0.300229, 0.341113, 0.269569, 0.353653, 0.374802, 0.487483, 0.329246, 0.401157, 0.452379, 0.453481, 0.46298, 0.476437, 0.459534, 0.48196, 0.407923, 0.365862, 0.417832, 0.473901, 0.457078, 0.386488, 0.472873, 0.428479, 0.409827, 0.386127, 0.25914, 0.304195, 0.267944, 0.246398, 0.318006, 0.290681, 0.360774, 0.372486, 0.45609, 0.424874, 0.377551, 0.415634, 0.429329, 0.476538, 0.402654, 0.415119, 0.3638, 0.378033, 0.369595, 0.412878, 0.322, 0.189445, 0.201053, 0.039061, 0.045264, 0.07656, 0.045245, -0.043222, 0.196973, 0.30305, 0.210022, 0.323991, 0.223563, 0.271563, 0.397829, 0.066421, 0.30822, 0.092435, -0.192027, -0.191356, 0.242039, 0.285655, 0.473024, 0.468665, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.562191, -0.593036, -0.594877, -0.605307, -0.638294, -0.52055, -0.507579, -0.501918, -0.494001, -0.445499, -0.378939, -0.313149, -0.330893, -0.254286, -0.237395, -0.210665, -0.211192, -0.212044, -0.225631, -0.210308, -0.253458, -0.285957, -0.307262, -0.341033, -0.325664, -0.348999, -0.36356, -0.416524, -0.443646, -0.44113, -0.501928, -0.478842, -0.493185, -0.497402, -0.530532, -0.511197, -0.475139, -0.476763, -0.454632, -0.464507, -0.461097, -0.462633, -0.475652, -0.452918, -0.478585, -0.466642, -0.462698, -0.459949, -0.495085, -0.459127, -0.447284, -0.465385, -0.421816, -0.425886, -0.398511, -0.354973, -0.344218, -0.239024, -0.181952, -0.064616, 0.06171, 0.127349, 0.13577, 0.170481, 0.149038, 0.196463, 0.160885, 0.220575, 0.237988, 0.218319, 0.198958, 0.184281, 0.186001, 0.155816, 0.159586, 0.201278, 0.171572, 0.181132, 0.15161, 0.132422, 0.123713, 0.162799, 0.147177, 0.13068, 0.128013, 0.16175, 0.160252, 0.143791, 0.15207, 0.150868, 0.147185, 0.172013, 0.133135, 0.119762, 0.114245, 0.112593, 0.152304, 0.143788, 0.162574, 0.168658, 0.224687, 0.151893, 0.227783, 0.25655, 0.281747, 0.269605, 0.310628, 0.365233, 0.329576, 0.378144, 0.399291, 0.372291, 0.415272, 0.423785, 0.463342, 0.343877, 0.367787, 0.426015, 0.336224, 0.307879, 0.323673, 0.354218, 0.405966, 0.377787, 0.351755, 0.385339, 0.258939, 0.304136, 0.342423, 0.249774, 0.307713, 0.338439, 0.276816, 0.31058, 0.327377, 0.317307, 0.349802, 0.349305, 0.303264, 0.43182, 0.409965, 0.378798, 0.330215, 0.401922, 0.388376, 0.364384, 0.401448, 0.369454, 0.387277, 0.306898, 0.403734, 0.433083, 0.336284, 0.339491, 0.387097, 0.346097, 0.411101, 0.553844, 0.453832, 0.547016, 0.457087, 0.488343, 0.445926, 0.545228, 0.549659, 0.459914, 0.432535, 0.389629, 0.393004, 0.430735, 0.393982, 0.473132, 0.417085, 0.48233, 0.391862, 0.520455, 0.426389, 0.39404, 0.389246, 0.442593, 0.349295, 0.47031, 0.421907, 0.412323, 0.408739, 0.420976, 0.557377, 0.509123, 0.628301, 0.530553, 0.440425, 0.326538, 0.42855, 0.317793, 0.252894, 0.389523, 0.613983, 0.29089, 0.100993, 0.207194, 0.375594, 0.250455, -0.017742, 0.314935, 0.298128, 0.326167, 0.383075, 0.264278, 0.455349, 0.464684, 0.104879, 0.303892, 0.15274, 0.433938, 0.232573, 1.143735, -0.212356, 0, 0.430876, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.668972, -0.669146, -0.690494, -0.693515, -0.722765, -0.600788, -0.597934, -0.576449, -0.544235, -0.520842, -0.427609, -0.366573, -0.37795, -0.291725, -0.286228, -0.264538, -0.257154, -0.274371, -0.304626, -0.288137, -0.322021, -0.351679, -0.371277, -0.414578, -0.400807, -0.418781, -0.446195, -0.493761, -0.511299, -0.521223, -0.576226, -0.554438, -0.571307, -0.572661, -0.586614, -0.573606, -0.546094, -0.541062, -0.525131, -0.522368, -0.529682, -0.519858, -0.549299, -0.53493, -0.5501, -0.548566, -0.5363, -0.54509, -0.555505, -0.525359, -0.503624, -0.537778, -0.51303, -0.492503, -0.451912, -0.402883, -0.393606, -0.275118, -0.213146, -0.080829, 0.024677, 0.106679, 0.157339, 0.120552, 0.166072, 0.181852, 0.129328, 0.119526, 0.149941, 0.130779, 0.106085, 0.161713, 0.133161, 0.09378, 0.142791, 0.155178, 0.149327, 0.118906, 0.079484, 0.091093, 0.104916, 0.131696, 0.095742, 0.103821, 0.126813, 0.123032, 0.13897, 0.170071, 0.123973, 0.119262, 0.13692, 0.114516, 0.082063, 0.061193, 0.049951, 0.07597, 0.109931, 0.113701, 0.110466, 0.116942, 0.145549, 0.136891, 0.161548, 0.218005, 0.208194, 0.246259, 0.283098, 0.35302, 0.362065, 0.461546, 0.471287, 0.423665, 0.404681, 0.410122, 0.403982, 0.369593, 0.411253, 0.307358, 0.39485, 0.326308, 0.405256, 0.371707, 0.400388, 0.31998, 0.438966, 0.342239, 0.325859, 0.27527, 0.37088, 0.339916, 0.326054, 0.337239, 0.356185, 0.346779, 0.40543, 0.47941, 0.569549, 0.43008, 0.418359, 0.353435, 0.3493, 0.32653, 0.358425, 0.39431, 0.327438, 0.462398, 0.313855, 0.376479, 0.400265, 0.328741, 0.405737, 0.417708, 0.331685, 0.371743, 0.500297, 0.459491, 0.422447, 0.486396, 0.538649, 0.597953, 0.462756, 0.488343, 0.485562, 0.440565, 0.456326, 0.477486, 0.376568, 0.323457, 0.431988, 0.487878, 0.339989, 0.454627, 0.458741, 0.361728, 0.318183, 0.351471, 0.457496, 0.3435, 0.353998, 0.455439, 0.558223, 0.461871, 0.514579, 0.509949, 0.511112, 0.460133, 0.396446, 0.475984, 0.365647, 0.381207, 0.505926, 0.400411, 0.430699, 0.423334, 0.33701, 0.525813, 0.286521, 0.324297, 0.090681, 0.529852, 0.122986, 0.327792, 0.150869, 0.319574, 0.674794, 0.54086, 0.418438, 0.404882, 0.790571, 0.451966, 0.339825, 0.454204, 0.222791, 0.064432, -0.152139, -0.163377, -0.164192, -0.521436, -0.256085, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.640779, -0.679282, -0.660466, -0.695605, -0.700823, -0.604376, -0.595221, -0.564762, -0.557407, -0.532153, -0.447346, -0.365567, -0.408206, -0.325242, -0.317042, -0.269897, -0.28541, -0.291773, -0.314153, -0.28302, -0.323626, -0.354422, -0.377328, -0.416404, -0.398475, -0.424676, -0.442147, -0.491963, -0.520683, -0.506421, -0.581693, -0.55795, -0.566508, -0.587211, -0.600682, -0.587541, -0.550921, -0.550713, -0.537288, -0.535655, -0.534851, -0.531391, -0.546041, -0.53497, -0.556376, -0.549575, -0.541417, -0.544184, -0.565544, -0.523116, -0.510774, -0.546011, -0.508755, -0.49186, -0.465938, -0.417928, -0.403523, -0.290876, -0.259899, -0.086476, -0.026305, 0.046931, 0.083124, 0.09527, 0.104778, 0.177719, 0.148954, 0.118373, 0.174057, 0.102358, 0.123034, 0.130537, 0.110832, 0.152463, 0.154479, 0.126824, 0.139676, 0.121866, 0.098679, 0.056836, 0.078502, 0.115169, 0.080768, 0.116719, 0.074481, 0.091173, 0.080616, 0.11486, 0.10329, 0.101307, 0.098388, 0.081369, 0.061118, 0.084922, 0.050545, 0.042721, 0.083416, 0.085185, 0.106339, 0.114935, 0.15255, 0.162431, 0.157765, 0.207231, 0.203439, 0.262458, 0.287238, 0.280273, 0.289091, 0.357157, 0.364499, 0.374885, 0.328772, 0.319164, 0.403982, 0.384865, 0.375537, 0.347238, 0.421539, 0.312771, 0.321786, 0.318475, 0.351573, 0.334876, 0.305209, 0.455432, 0.284449, 0.228876, 0.236103, 0.286678, 0.265301, 0.364811, 0.259124, 0.291972, 0.306682, 0.279417, 0.346056, 0.321327, 0.348392, 0.354266, 0.400473, 0.303395, 0.365297, 0.355718, 0.377636, 0.38918, 0.356291, 0.365704, 0.381384, 0.282194, 0.407345, 0.382462, 0.326959, 0.40967, 0.350053, 0.382873, 0.35425, 0.378254, 0.433816, 0.390245, 0.433977, 0.458927, 0.427571, 0.492441, 0.365859, 0.449129, 0.360606, 0.417832, 0.513213, 0.475979, 0.384467, 0.392314, 0.475658, 0.392693, 0.37741, 0.479406, 0.4134, 0.336085, 0.278299, 0.3047, 0.281851, 0.430469, 0.47072, 0.488341, 0.416731, 0.406745, 0.415366, 0.480342, 0.308571, 0.372862, 0.463757, 0.355342, 0.465431, 0.398748, 0.33316, 0.270336, 0.393367, 0.479264, 0.223659, 0.282176, 0.14899, 0.128219, 0.069517, 0.165606, 0.156922, 0.250767, 0.311594, 0.13147, 0.283388, 0.244257, 0.436088, 0.115766, 0.284757, 0.020893, -0.097334, 0.012989, -0.21594, 0.171994, -0.164553, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.625908, -0.644842, -0.670015, -0.672041, -0.684734, -0.583337, -0.56412, -0.552863, -0.522684, -0.500537, -0.421277, -0.32947, -0.366891, -0.297205, -0.287537, -0.260576, -0.255553, -0.25401, -0.267683, -0.253916, -0.314324, -0.335875, -0.356908, -0.393222, -0.383926, -0.40466, -0.433663, -0.468939, -0.503105, -0.513729, -0.569573, -0.551704, -0.549062, -0.564824, -0.590847, -0.558351, -0.538252, -0.527258, -0.505567, -0.508155, -0.513692, -0.5058, -0.531821, -0.509029, -0.538715, -0.528414, -0.520003, -0.518395, -0.547564, -0.513511, -0.502253, -0.514801, -0.493911, -0.476122, -0.431482, -0.402351, -0.391072, -0.283637, -0.204576, -0.063991, 0.017017, 0.10032, 0.169106, 0.176362, 0.163792, 0.231884, 0.171206, 0.205477, 0.218795, 0.148592, 0.184926, 0.173306, 0.143901, 0.174185, 0.204417, 0.112253, 0.209946, 0.139189, 0.113209, 0.118779, 0.096432, 0.114221, 0.145866, 0.152939, 0.162782, 0.155925, 0.159707, 0.181651, 0.145122, 0.16976, 0.120767, 0.124199, 0.104745, 0.111953, 0.079986, 0.069411, 0.10892, 0.121217, 0.128681, 0.129394, 0.169569, 0.183464, 0.187481, 0.230953, 0.245573, 0.295368, 0.298214, 0.367491, 0.411502, 0.421077, 0.467545, 0.513547, 0.496915, 0.516039, 0.499338, 0.429602, 0.474595, 0.406184, 0.357118, 0.363725, 0.392884, 0.386336, 0.355482, 0.287663, 0.325782, 0.324826, 0.284101, 0.363344, 0.319183, 0.462035, 0.283043, 0.464696, 0.317957, 0.47275, 0.448876, 0.44629, 0.460044, 0.505019, 0.384301, 0.499231, 0.406218, 0.424693, 0.383148, 0.419784, 0.436904, 0.482395, 0.37545, 0.368513, 0.421206, 0.281349, 0.404334, 0.467918, 0.390986, 0.371743, 0.477503, 0.550982, 0.52628, 0.542216, 0.498942, 0.519557, 0.555559, 0.564084, 0.497462, 0.452093, 0.533408, 0.539432, 0.453884, 0.342308, 0.392624, 0.382999, 0.406531, 0.39339, 0.43342, 0.424415, 0.423139, 0.420684, 0.549462, 0.458916, 0.412744, 0.548814, 0.585661, 0.519739, 0.711966, 0.612351, 0.522912, 0.574543, 0.61505, 0.777634, 0.341652, 0.529405, 0.563142, 0.437387, 0.372348, 0.315055, 0.333927, 0.475479, 0.411735, 0.509964, 0.165249, 0.286933, 0.275772, 0.767892, 0.349033, 0.802564, 0.57241, 0.422137, 0.59258, 0.88614, 0.486587, 0.905309, 0.721246, 0.298896, 0.706443, 0.39794, 0.098236, 0.598079, -0.123469, -0.144065, -0.027189, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.599045, -0.624093, -0.6396, -0.655528, -0.670834, -0.567283, -0.570266, -0.546021, -0.534696, -0.50469, -0.42394, -0.339336, -0.366075, -0.292536, -0.30058, -0.249095, -0.228341, -0.249551, -0.279263, -0.258071, -0.304107, -0.312877, -0.331711, -0.38663, -0.370167, -0.388131, -0.414685, -0.458144, -0.498103, -0.486777, -0.557668, -0.539648, -0.558836, -0.553795, -0.583488, -0.558021, -0.535614, -0.522492, -0.507904, -0.502693, -0.504422, -0.49762, -0.52214, -0.495824, -0.523787, -0.516148, -0.508999, -0.504637, -0.529165, -0.499421, -0.481315, -0.509769, -0.483123, -0.473783, -0.440508, -0.400519, -0.388104, -0.269284, -0.214634, -0.055569, -0.026381, 0.10099, 0.118244, 0.1622, 0.170321, 0.160818, 0.128446, 0.174143, 0.218427, 0.157441, 0.172615, 0.20883, 0.205355, 0.175064, 0.160657, 0.157626, 0.126292, 0.113775, 0.083134, 0.114199, 0.055208, 0.110195, 0.101454, 0.094354, 0.104085, 0.118847, 0.14819, 0.152715, 0.145193, 0.146271, 0.101973, 0.160003, 0.078607, 0.112553, 0.093879, 0.083461, 0.115913, 0.134534, 0.131988, 0.166476, 0.154245, 0.128281, 0.18807, 0.210036, 0.248533, 0.238237, 0.264213, 0.315962, 0.345156, 0.417503, 0.390361, 0.429525, 0.336091, 0.478217, 0.403403, 0.416611, 0.437847, 0.356973, 0.441793, 0.409007, 0.362724, 0.384082, 0.405565, 0.270954, 0.324575, 0.264312, 0.268058, 0.226342, 0.218771, 0.242785, 0.284023, 0.323087, 0.271665, 0.393098, 0.365937, 0.33829, 0.382612, 0.453789, 0.374338, 0.37908, 0.320648, 0.401233, 0.332297, 0.505263, 0.470189, 0.394043, 0.370362, 0.447657, 0.365224, 0.349366, 0.379077, 0.323408, 0.314097, 0.340194, 0.346652, 0.344768, 0.395809, 0.3282, 0.456849, 0.43757, 0.462145, 0.487265, 0.455991, 0.446796, 0.430402, 0.52407, 0.526374, 0.459868, 0.485514, 0.484373, 0.537006, 0.359009, 0.458214, 0.45486, 0.335579, 0.247101, 0.359683, 0.245971, 0.366954, 0.399262, 0.277396, 0.405467, 0.420428, 0.543464, 0.400389, 0.441301, 0.582683, 0.473205, 0.454034, 0.549754, 0.447158, 0.484019, 0.417618, 0.556655, 0.41104, 0.404107, 0.270283, 0.202754, 0.14727, 0.06633, 0.027712, 0.153339, -0.059016, 0.220455, 0.345074, 0.434036, 0.399861, 0.272293, 0.401314, 0.531523, 0.142119, 0.125652, 0.181773, -0.011686, 0.108993, 0.145968, -0.239108, 1.546131, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.637967, -0.669198, -0.693502, -0.68334, -0.712402, -0.602713, -0.5906, -0.573258, -0.55589, -0.52133, -0.423979, -0.350903, -0.389101, -0.303117, -0.300375, -0.240759, -0.258589, -0.264597, -0.300126, -0.285498, -0.30914, -0.337366, -0.358366, -0.407405, -0.399994, -0.412278, -0.441535, -0.493063, -0.520244, -0.514879, -0.58079, -0.560622, -0.573457, -0.578373, -0.60558, -0.573946, -0.549931, -0.531193, -0.537448, -0.520298, -0.522296, -0.510189, -0.547612, -0.514824, -0.543817, -0.52932, -0.534894, -0.525742, -0.558632, -0.526203, -0.513296, -0.532787, -0.520468, -0.489227, -0.459273, -0.425244, -0.399598, -0.280611, -0.237937, -0.085022, -0.016298, 0.057374, 0.128882, 0.151874, 0.1731, 0.251859, 0.17646, 0.194738, 0.208727, 0.179015, 0.217323, 0.215819, 0.12144, 0.14409, 0.094969, 0.111773, 0.10763, 0.085991, 0.088843, 0.048678, 0.073608, 0.107051, 0.111977, 0.099295, 0.105072, 0.113638, 0.103723, 0.139045, 0.131551, 0.147129, 0.113044, 0.13829, 0.098896, 0.121668, 0.075683, 0.109522, 0.127497, 0.102108, 0.101025, 0.081018, 0.147943, 0.120347, 0.191195, 0.168602, 0.190516, 0.244896, 0.304889, 0.313845, 0.318587, 0.377769, 0.416065, 0.405954, 0.376216, 0.396877, 0.467011, 0.335585, 0.374036, 0.359681, 0.484961, 0.31836, 0.423508, 0.360384, 0.288459, 0.264218, 0.301928, 0.278945, 0.235622, 0.243413, 0.246285, 0.267991, 0.337368, 0.300636, 0.34871, 0.356987, 0.414161, 0.367315, 0.393125, 0.392096, 0.357264, 0.388515, 0.362593, 0.459994, 0.363569, 0.412039, 0.357402, 0.352114, 0.294244, 0.310381, 0.310793, 0.304933, 0.342186, 0.383431, 0.286279, 0.352323, 0.408826, 0.342453, 0.417411, 0.424849, 0.51271, 0.515183, 0.481497, 0.494868, 0.452869, 0.507545, 0.534618, 0.545016, 0.442643, 0.501709, 0.51121, 0.395008, 0.316369, 0.303038, 0.361041, 0.264258, 0.310282, 0.221697, 0.40745, 0.302435, 0.268162, 0.423606, 0.469282, 0.545164, 0.476841, 0.529951, 0.469513, 0.424393, 0.474241, 0.456894, 0.435177, 0.455416, 0.571645, 0.474528, 0.452031, 0.333961, 0.309296, 0.161003, 0.182554, 0.144762, 0.060484, 0.120515, 0.152949, 0.067572, 0.160157, 0.135207, 0.277702, 0.427451, 0.35954, 0.353197, 0.162269, 0.531523, 0.251108, 0.433401, 0.401838, 0.012009, 0, 0.02723, -0.308785, -0.082258, 0.479568, 0, 0, 0, 0, 0, 0, 0, 0, 0],
[-0.595095, -0.631537, -0.649812, -0.649263, -0.662661, -0.54918, -0.557152, -0.520076, -0.522918, -0.484087, -0.401793, -0.323787, -0.343755, -0.283306, -0.260303, -0.226061, -0.216794, -0.228921, -0.248268, -0.242415, -0.266364, -0.290807, -0.310887, -0.356185, -0.344883, -0.362127, -0.390369, -0.426939, -0.465851, -0.471895, -0.532443, -0.510321, -0.527396, -0.538271, -0.560049, -0.530944, -0.504013, -0.500048, -0.481823, -0.487168, -0.487187, -0.468146, -0.487408, -0.46761, -0.496197, -0.488681, -0.47897, -0.480578, -0.510549, -0.473664, -0.467253, -0.47958, -0.45617, -0.430229, -0.40109, -0.357597, -0.366374, -0.251674, -0.188676, -0.053081, 0.028944, 0.091329, 0.121082, 0.146205, 0.16311, 0.200429, 0.214863, 0.177368, 0.248372, 0.153498, 0.215774, 0.230924, 0.202608, 0.182382, 0.173947, 0.132127, 0.123683, 0.119091, 0.13833, 0.069753, 0.113017, 0.135656, 0.133227, 0.111418, 0.139296, 0.151413, 0.138896, 0.19299, 0.182265, 0.146128, 0.111301, 0.140536, 0.114188, 0.132935, 0.103103, 0.131201, 0.135156, 0.127825, 0.173014, 0.155804, 0.160414, 0.15622, 0.162658, 0.184139, 0.236813, 0.221517, 0.270171, 0.326133, 0.354878, 0.331487, 0.40102, 0.404633, 0.396271, 0.413261, 0.385547, 0.357809, 0.346598, 0.359361, 0.35526, 0.291256, 0.446306, 0.355269, 0.339707, 0.26373, 0.346289, 0.268465, 0.277031, 0.226184, 0.279773, 0.248577, 0.283696, 0.292218, 0.292319, 0.337124, 0.360312, 0.341996, 0.385706, 0.371966, 0.367704, 0.279291, 0.322798, 0.367657, 0.364432, 0.330761, 0.440004, 0.373779, 0.441251, 0.347602, 0.436718, 0.22596, 0.323855, 0.29911, 0.303249, 0.308651, 0.367291, 0.373737, 0.416449, 0.408935, 0.484386, 0.497455, 0.414763, 0.416673, 0.491471, 0.449436, 0.46553, 0.440208, 0.429358, 0.458454, 0.401262, 0.467503, 0.417756, 0.451659, 0.378858, 0.436449, 0.296582, 0.298531, 0.391368, 0.28451, 0.272971, 0.36548, 0.414751, 0.435322, 0.393015, 0.404075, 0.363416, 0.436571, 0.513486, 0.526866, 0.554531, 0.456061, 0.655095, 0.425923, 0.439399, 0.317183, 0.279163, 0.370666, 0.260825, 0.209626, 0.120871, 0.169837, 0.191606, 0.050072, 0.033, 0.202726, 0.185831, 0.16297, 0.444906, 0.290886, 0.376054, 0.344775, 0.16982, 0.079181, 0.199837, -0.042587, 0.102239, 0.567482, -0.268544, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        ]
        };*/

        var trainObj = {
        absorbance:    [

[-0.594545,-0.656789,-0.628831,-0.653695,-0.674265,-0.571897,-0.544902,-0.534245,-0.516828,-0.479235],
[-0.550645, -0.598889, -0.600843, -0.623555, -0.649926, -0.542114, -0.55518, -0.528976, -0.514686, -0.49251],
[-0.561268, -0.602303, -0.589851, -0.599049, -0.631889, -0.522864, -0.51902, -0.489376, -0.491576, -0.448438],
[-0.564031, -0.626225, -0.620071, -0.615104, -0.651955, -0.538097, -0.535635, -0.526553, -0.502999, -0.462544],
[-0.5499, -0.583059, -0.590021, -0.612486, -0.621448, -0.517298, -0.524005, -0.494259, -0.473289, -0.451667],
[-0.60254, -0.623862, -0.643633, -0.640357, -0.676481, -0.550531, -0.552145, -0.529716, -0.506132, -0.476456],
[-0.548067, -0.586221, -0.591268, -0.606435, -0.634986, -0.500434, -0.490598, -0.477955, -0.480189, -0.418583],
[-0.576699, -0.637345, -0.590759, -0.64031, -0.655761, -0.545517, -0.526704, -0.506909, -0.506092, -0.456138],
[-0.554282, -0.590609, -0.592794, -0.593862, -0.611344, -0.495407, -0.486031, -0.479093, -0.468451, -0.445096],
[-0.559482, -0.602121, -0.624866, -0.613192, -0.631465, -0.519454, -0.500866, -0.469724, -0.476166, -0.463102],

[-0.65099, -0.676578, -0.676391, -0.672129, -0.706334, -0.590103, -0.582595, -0.560832, -0.543864, -0.521743], 
[-0.540932, -0.592725, -0.604099, -0.618703, -0.650829, -0.520287, -0.524962, -0.516882, -0.521472, -0.484251],
[-0.605769, -0.631594, -0.626122, -0.633771, -0.670618, -0.557342, -0.546131, -0.534861, -0.545645, -0.497177],
[-0.61479, -0.664645, -0.655611, -0.664222, -0.690904, -0.576963, -0.56726, -0.556244, -0.550981, -0.532409],
[-0.621736, -0.665643, -0.642025, -0.670453, -0.690616, -0.562778, -0.563245, -0.550718, -0.526879, -0.521705],
[-0.628064, -0.661477, -0.677367, -0.668903, -0.678728, -0.59739, -0.573623, -0.555658, -0.528962, -0.504651],
[-0.627781, -0.654372, -0.66008, -0.675374, -0.695322, -0.593965, -0.572805, -0.56983, -0.548633, -0.530209],
[-0.673838, -0.702263, -0.716928, -0.725691, -0.750087, -0.635973, -0.647044, -0.610767, -0.607906, -0.572766],
[-0.65099, -0.676578, -0.676391, -0.672129, -0.706334, -0.590103, -0.582595, -0.560832, -0.543864, -0.521743],
[-0.614673, -0.681363, -0.675459, -0.683511, -0.707087, -0.587747, -0.585894, -0.550644, -0.552076, -0.530576],

[-0.525801, -0.589235, -0.58113, -0.590103, -0.622316, -0.510183, -0.497027, -0.468874, -0.462573, -0.449015],
[-0.652223, -0.679232, -0.696889, -0.697768, -0.721349, -0.617285, -0.609204, -0.581279, -0.577064, -0.524285],
[-0.535994, -0.558713, -0.554297, -0.589731, -0.62323, -0.506807, -0.490463, -0.480054, -0.482293, -0.444425],
[-0.562191, -0.593036, -0.594877, -0.605307, -0.638294, -0.52055, -0.507579, -0.501918, -0.494001, -0.445499],
[-0.668972, -0.669146, -0.690494, -0.693515, -0.722765, -0.600788, -0.597934, -0.576449, -0.544235, -0.520842],
[-0.640779, -0.679282, -0.660466, -0.695605, -0.700823, -0.604376, -0.595221, -0.564762, -0.557407, -0.532153],
[-0.625908, -0.644842, -0.670015, -0.672041, -0.684734, -0.583337, -0.56412, -0.552863, -0.522684, -0.500537],
[-0.599045, -0.624093, -0.6396, -0.655528, -0.670834, -0.567283, -0.570266, -0.546021, -0.534696, -0.50469],
[-0.637967, -0.669198, -0.693502, -0.68334, -0.712402, -0.602713, -0.5906, -0.573258, -0.55589, -0.52133],
[-0.595095, -0.631537, -0.649812, -0.649263, -0.662661, -0.54918, -0.557152, -0.520076, -0.522918, -0.484087]
        ]
        };

        /*var trainObj = {
            absorbance: [

    [-0.594545, -0.656789, -0.628831],
    [-0.550645, -0.598889, -0.600843],
    [-0.561268, -0.602303, -0.589851],
    [-0.564031, -0.626225, -0.620071],
    [-0.5499, -0.583059, -0.590021],
    [-0.60254, -0.623862, -0.643633],
    [-0.548067, -0.586221, -0.591268],
    [-0.576699, -0.637345, -0.590759],
    [-0.554282, -0.590609, -0.592794],
    [-0.559482, -0.602121, -0.624866],

    [-0.65099, -0.676578, -0.676391],
    [-0.540932, -0.592725, -0.604099],
    [-0.605769, -0.631594, -0.626122],
    [-0.61479, -0.664645, -0.655611],
    [-0.621736, -0.665643, -0.642025],
    [-0.628064, -0.661477, -0.677367],
    [-0.627781, -0.654372, -0.66008],
    [-0.673838, -0.702263, -0.716928],
    [-0.65099, -0.676578, -0.676391],
    [-0.614673, -0.681363, -0.675459],

    [-0.525801, -0.589235, -0.58113],
    [-0.652223, -0.679232, -0.696889],
    [-0.535994, -0.558713, -0.554297],
    [-0.562191, -0.593036, -0.594877],
    [-0.668972, -0.669146, -0.690494],
    [-0.640779, -0.679282, -0.660466],
    [-0.625908, -0.644842, -0.670015],
    [-0.599045, -0.624093, -0.6396],
    [-0.637967, -0.669198, -0.693502],
    [-0.595095, -0.631537, -0.649812]
            ]
        };*/

        //var detectedAbsorbances = [-0.668972, -0.669146, -0.690494, -0.693515, -0.722765, -0.600788, -0.597934, -0.576449, -0.544235, -0.520842, -0.427609, -0.366573, -0.37795, -0.291725, -0.286228, -0.264538, -0.257154, -0.274371, -0.304626, -0.288137, -0.322021, -0.351679, -0.371277, -0.414578, -0.400807, -0.418781, -0.446195, -0.493761, -0.511299, -0.521223, -0.576226, -0.554438, -0.571307, -0.572661, -0.586614, -0.573606, -0.546094, -0.541062, -0.525131, -0.522368, -0.529682, -0.519858, -0.549299, -0.53493, -0.5501, -0.548566, -0.5363, -0.54509, -0.555505, -0.525359, -0.503624, -0.537778, -0.51303, -0.492503, -0.451912, -0.402883, -0.393606, -0.275118, -0.213146, -0.080829, 0.024677, 0.106679, 0.157339, 0.120552, 0.166072, 0.181852, 0.129328, 0.119526, 0.149941, 0.130779, 0.106085, 0.161713, 0.133161, 0.09378, 0.142791, 0.155178, 0.149327, 0.118906, 0.079484, 0.091093, 0.104916, 0.131696, 0.095742, 0.103821, 0.126813, 0.123032, 0.13897, 0.170071, 0.123973, 0.119262, 0.13692, 0.114516, 0.082063, 0.061193, 0.049951, 0.07597, 0.109931, 0.113701, 0.110466, 0.116942, 0.145549, 0.136891, 0.161548, 0.218005, 0.208194, 0.246259, 0.283098, 0.35302, 0.362065, 0.461546, 0.471287, 0.423665, 0.404681, 0.410122, 0.403982, 0.369593, 0.411253, 0.307358, 0.39485, 0.326308, 0.405256, 0.371707, 0.400388, 0.31998, 0.438966, 0.342239, 0.325859, 0.27527, 0.37088, 0.339916, 0.326054, 0.337239, 0.356185, 0.346779, 0.40543, 0.47941, 0.569549, 0.43008, 0.418359, 0.353435, 0.3493, 0.32653, 0.358425, 0.39431, 0.327438, 0.462398, 0.313855, 0.376479, 0.400265, 0.328741, 0.405737, 0.417708, 0.331685, 0.371743, 0.500297, 0.459491, 0.422447, 0.486396, 0.538649, 0.597953, 0.462756, 0.488343, 0.485562, 0.440565, 0.456326, 0.477486, 0.376568, 0.323457, 0.431988, 0.487878, 0.339989, 0.454627, 0.458741, 0.361728, 0.318183, 0.351471, 0.457496, 0.3435, 0.353998, 0.455439, 0.558223, 0.461871, 0.514579, 0.509949, 0.511112, 0.460133, 0.396446, 0.475984, 0.365647, 0.381207, 0.505926, 0.400411, 0.430699, 0.423334, 0.33701, 0.525813, 0.286521, 0.324297, 0.090681, 0.529852, 0.122986, 0.327792, 0.150869, 0.319574, 0.674794, 0.54086, 0.418438, 0.404882, 0.790571, 0.451966, 0.339825, 0.454204, 0.222791, 0.064432, -0.152139, -0.163377, -0.164192, -0.521436, -0.256085, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var detectedAbsorbances = [-0.668972, -0.669146, -0.690494, -0.693515, -0.722765, -0.600788, -0.597934, -0.576449, -0.544235, -0.520842];
        //var detectedAbsorbances = [-0.668972, -0.669146, -0.690494];
        /*var detectedAbsorbances = [-0.525801, -0.589235, -0.58113, -0.590103];
        updateData([-0.525801, -0.589235, -0.58113, -0.590103], [0.75, 0.25], ["A", "B"], "Sample A");
        updateData([-0.65099, -0.676578, -0.676391, -0.672129], [0.25, 0.75], ["A","B"], "Sample B");*/
        /*updateData(trainObj.absorbance[0], [1], ["Dr. Pepper"], "Dr. Pepper");
        updateData(trainObj.absorbance[1], [1], ["Coke"], "Coke");
        updateData(trainObj.absorbance[2], [1], ["Pepsi"], "Pepsi");*/
        for (var i = 0; i < 10; ++i)
        {
            updateData(trainObj.absorbance[i], [1], ["Dr. Pepper"], "Dr. Pepper");
        }
        for (var i = 10; i < 20; ++i) {
            updateData(trainObj.absorbance[i], [1], ["Coke"], "Coke");
        }
        for (var i = 20; i < 30; ++i) {
            updateData(trainObj.absorbance[i], [1], ["Pepsi"], "Pepsi");
        }
        console.log(chemoTrainingAbsorbances);
        console.log(chemoTrainingConcentrations);
        console.log(chemoConcentrationLabels);
        alert("PLS test commence");

        var trainResult = newTrain(true);
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

    return { train: newTrain, infer: newInfer, flags: chemoFlags, getModel: chemoGetModel, loadModel: chemoLoadModel, pcaTest: pcaTest, plsTest: plsTest, updateTest:updateTest, updateData:updateData, getPCA: getPCA, isTrained: isTrained };

});