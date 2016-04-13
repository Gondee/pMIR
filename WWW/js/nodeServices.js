var lib_cordova = require('ng-cordova');

//This file includes services which rely on node public modules.
angular.module('app.nodeServices', ['ionic', 'ngCordova','chemo','database'])

.service('chemo', function(database){

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

    function databaseGetFile(fileID) {
        var data = database.ouputDataFile(fileID);
        if (data.success == 0)
        {
            return { absorbances: data.absorbances, concentrationLabels: data.concentrationLabels, concentrations: data.concentrations };
        }
        return { absorbances: [], concentrationLabels: [], concentrations: [] };
    };

    function chemoGetFile(fileID) {
        return databaseGetFile(fileID);
    };

    function databaseAddFile(absorbances, concentrationLabels, concentrations, fileName) {
        var result = database.inputDataFile(absorbances, concentrationLabels, concentrations, fileName);
        return result;
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

    function chemoTrain(isQuantify, fileIDArr) {
        consoleOutput(0, "isQuantify", isQuantify);
        chemoIsPls = isQuantify;
        var numFiles = fileIDArr.length;
        consoleOutput(0, "numFiles", numFiles);
        for (var i = 0; i < numFiles; ++i) {
            var file = chemoGetFile(fileIDArr[i]);
            consoleOutput(0, "file", file);
            if (file == null) {
                return chemoFlags.failFileID;
            }
            else {
                //Add new chemical labels if there are any new ones in this file and associate labels with concentration indices
                var locationArr = chemoAddLabels(file.concentrationLabels);
                var numChemicals = locationArr.length;
                //Add absorbances as next row of matrix training-Y
                chemoTrainingAbsorbances[i] = file.absorbances;
                //Add chem concentration in correct part of training matrix X.
                for (var j = 0; j < numChemicals; ++j) {
                    //Each chem conc goes in ith row (as represents ith scan) at the index representing the appropriate label
                    chemoAddConcentration(file.concentrations[j], i, locationArr[j]);
                }
            }
        }
        if (chemoTrainingAbsorbances.length == 0) {
            //No training data means no success (also sometimes we use 0th row to find num of col)
            return chemoFlags.failNoTrainingData;
        }
        if (chemoTrainingAbsorbances.length != chemoTrainingConcentrations.length) {
            //There should be an array of concentrations for every array of absorbances
            return chemoFlags.failTrainingRowMismatch;
        }
        if (chemoConcentrationLabels.length != chemoTrainingConcentrations[0].length) {
            //We don't have a name for each material (Cry)
            return chemoFlags.failNotEnoughLabels;
        }
        if (chemoIsPls) {
            var numColAbsorbances = chemoTrainingAbsorbances[0].length;
            var numColConcentrations = chemoTrainingConcentrations[0].length;
            //Take 10% of data (probably of Y).
            var maxVectors = min(numColAbsorbances, numColConcentrations);
            var numLatentVectors = floor(maxVectors * 0.1);
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
                    var absorbancesTranspose = new lib_matrix(chemoTrainingAbsorbances);
                    absorbancesTranspose = absorbancesTranspose.transpose();
                    var concentrationsTranspose = new lib_matrix(chemoTrainingConcentrations);
                    concentrationsTranspose = concentrationsTranspose.transpose();
                    chemoAlgo.train(absorbancesTranspose, concentrationsTranspose, options);
                }
                catch (err) {
                    return chemoFlags.failUnknownTrainError;
                }
                explainedVariances = chemoAlgo.getExplainedVariance();
                if (explainedVariances < 0.85) {
                    numLatentVectors++;
                }
            }
        }
        else {
            //Get principle components associated with training set absorbances X.
            try {
                //It is very clean to reprsent all absorbances as a row, but- each one considered
                //a variable in PLS, thus each one has its own row (columns differentiate sample)
                var absorbancesTranspose = new lib_matrix(chemoTrainingAbsorbances);
                absorbancesTranspose = absorbancesTranspose.transpose();
                chemoAlgo = new lib_pca(absorbancesTranspose);
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
                //It is very clean to reprsent all absorbances as a row, but- each one considered
                //a variable in PLS, thus each one has its own row (columns differentiate sample)
                var absorbancesTranspose = new lib_matrix(chemoTrainingAbsorbances);
                absorbancesTranspose = absorbancesTranspose.transpose();
                //Check parameter requirements
                chemoPCACompressed = chemoAlgo.project(absorbancesTranspose, chemoNumLatentVectors).transpose();
            }
            catch (err) {
                return chemoFlags.failUnknownTrainError;
            }
            var numPoints = chemoPCACompressed.length;
            var tempstring = "projected";
            for (var i = 0; i < numPoints; ++i)
            {
                consoleOutput(0, tempstring.concat(i), chemoPCACompressed[i]);
            }
        }
        chemoIsTrained = true;
        consoleOutput(0, "isTrained", chemoIsTrained);
        return chemoFlags.success;
    };

    //Expect a 1D array containing absorbances, flag telling to save, (if save, provide a file name)
    function chemoInfer(measuredAbsorbances, doSave, fileName) {
        if (!chemoIsTrained) {
            return { compounds: [], concentrations: [], status: chemoFlags.failNoTrainingData };
        }
        if (measuredAbsorbances.length != chemoTrainingAbsorbances[0].length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failAbsorbanceMismatch };
        }
        if (chemoIsPls) {
            var inferred = [];
            try {
                var measuredTranspose = new lib_matrix(measuredAbsorbances);
                measuredTranspose = measuredTranspose.transpose();
                inferred = chemoAlgo.predict(measuredTranspose);
            }
            catch (err) {
                return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
            }
            if (inferred.length == 0) {
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

            if (doSave) {
                var databaseResult = databaseAddFile(measuredAbsorbances, labels, nonZeroConcentrations, fileName);
                if (databaseResult.status != chemoFlags.success) {
                    //This fail is a mixed bag- we succeed at getting our data, but we don't manage to save it to the file system.
                    return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.failFileNotSaved };
                }
            }

            return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
        }
        else {
            var measured = [];
            try {
                var measuredTranspose = new lib_matrix(measuredAbsorbances);
                measuredTranspose = measuredTranspose.transpose();
                measured = chemoAlgo.project(measuredTranspose, chemoNumLatentVectors).transpose();
            }
            catch (err) {
                return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
            }
            consoleOutput(1, "Recent Point", measured);
            var distances = [];
            var numPoints = chemoPCACompressed.length;
            consoleOutput(1, "num points", numPoints);
            if (numPoints != chemoTrainingAbsorbances.length) {
                return { compounds: [], concentrations: [], status: chemoFlags.failInferenceRowMismatch };
            }
            if (chemoNumLatentVectors != chemoPCACompressed[0].length) {
                return { compounds: [], concentrations: [], status: chemoFlags.failInferenceColumnMismatch };
            }
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
                sum = sqrt(sum);
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
            if (doSave) {
                var databaseResult = databaseAddFile(measuredAbsorbances, labels, nonZeroConcentrations, fileName);
                if (databaseResult.status != chemoFlags.success) {
                    //This fail is a mixed bag- we succeed at getting our data, but we don't manage to save it to the file system.
                    return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.failFileNotSaved };
                }
            }

            //New version returns a matrix with the 2D coordinates for every point (trainingPoints)
            //And the last point (which was just inferred) is recentPoint.
            //return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
            return {
                trainingPoints: chemoPCACompressed, recentPoint: measured,
                compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success
            };
        }
    };

    function chemoGetModel() {
        if (chemoIsTrained) {
            var model = chemoAlgo.export();
            model.concentrationLabels = chemoConcentrationLabels;
            if (!chemoIsPls)
            {
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

    function pcaTest() {
        //Results of train?
        var retTrain = chemoTrain(false, ["x", "y"]);
        console.log("Training Status: ");
        console.log(flagToString(retTrain));
        console.log("\n");
        if (retTrain == chemoFlags.success) {
            //Infer, no save
            var detectedAbsorbances = [1, 0, 0];
            var retInfer = chemoInfer(detectedAbsorbances, false, null);
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
            }
        }
    };


    return { train: chemoTrain, infer: chemoInfer, flags: chemoFlags, getModel:chemoGetModel, loadModel:chemoLoadModel, pcaTest: pcaTest };

});

//Service allows calling inputModel, inputDataFile, outputDataFile, and outputModel.
angular.module('app.nodeServices')

.service('database', function ($cordovaFile) {

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

    function linearSearch(arr, find) {
        var len = arr.length;
        for (var i = 0; i < len; ++i) {
            if (arr[i] == find)
                return i;
        }
        return null;
    };

    function listEntries(isAlgorithm, isPls) {
        var managementFileName = getManagementName(isAlgorithm, isPls);
        var mngmntArr = { entries: [] };
        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
            },
                function (error) { });

        }, function (error) {
            //If no management file, return no files.
        });
        return mngmntArr.entries;
    };

    /*Module level function
    Input: string fileName- the name of the file to write to.
           pca algorithm OR pls algorithm- the model we want to save.
    Success: New file added pcafileName.pmir OR plsfileName.pmir 
    */
    function inputModel(fileName, algorithm) {
        var output = angular.toJson(algorithm);
        var mngmntArr = { entries: [fileName] };

        var isPls = algorithm.modelName == "PLS";
        var fullFileName = getFullName(fileName, true, isPls);
        var managementFileName = getManagementName(true, isPls);

        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
                var numEntries = mngmntArr.entries.length;
                mngmntArr.entries[numEntries] = fileName;
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
                var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
            },
                function (error) { });

        }, function (error) {
            //If no management file, create new one and output JSON
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
        });

        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        //Add conditionals at later time, account for memory at another time.
        var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output);
    };

    function outputModel(fileName, isPls) {
        var fullFileName = getFullName(fileName, true, isPls);
        var model = null;
        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(function (success) {
                model = angular.fromJson(success);
            },
                 function (error) { });
        },
        function (error) {
        });
        return model;
    };

    function inputDataFile(absorbances, concentrationLabels, concentrations, fileName) {
        var fullFileName = getFullName(fileName, false);
        var managementFileName = getManagementName(false);
        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        var mngmntArr = { entries: [fileName] };

        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
                var numEntries = mngmntArr.entries.length;
                mngmntArr.entries[numEntries] = fileName;
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
                var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
            },
                function (error) { });
        }, function (error) {
            //If no management file, create new one and output JSON
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
        });

        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true);
        var output = { absorbances: absorbances, concentrations: concentrations, concentrationLabels: concentrationLabels }
        output = angular.toJson(output);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output);
    };

    function outputDataFile(fileName) {
        var fullFileName = getFullName(fileName, false);
        var data = { absorbances: [], concentrations: [], concentrationLabels: [], status: 0 };
        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(function (success) {
                data = angular.fromJson(success);
            },
                 function (error) { });
        },
        function (error) {
        });
        return data;
    };

    return {inputModel: inputModel, outputModel: outputModel, inputDataFile: inputDataFile, outputDataFile: outputDataFile, listEntries:listEntries};
});