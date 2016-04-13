(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var lib_cordova = require('ng-cordova');
//This file includes services which rely on node public modules.
angular.module('app.nodeServices', ['ionic', 'ngCordova'])

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

    //A function to test if pca works properly
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


    var getPCA = function () {
        return chemoPCACompressed;

    };


    return { train: chemoTrain, infer: chemoInfer, flags: chemoFlags, getModel:chemoGetModel, loadModel:chemoLoadModel, pcaTest: pcaTest , getPCA };

});

//Service allows calling inputModel, inputDataFile, outputDataFile, and outputModel.
angular.module('app.nodeServices')

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
        var managementExists = $cordovaFile.checkFile(cordova.file.dataDirectory, managementFileName);
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

        var managementExists = $cordovaFile.checkFile(cordova.file.dataDirectory, managementFileName);
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

        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        //Add conditionals at later time, account for memory at another time.
        var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output);
    };

    function outputModel(fileName, isPls) {
        var fullFileName = getFullName(fileName, true, isPls);
        var model = null;
        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
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

    function inputDataFile(absorbances, concentrationLabels, concentrations, wavelength, fileName, callback) {
        var fullFileName = getFullName(fileName, false);
        var managementFileName = getManagementName(false);
        var managementExists = $cordovaFile.checkFile(cordova.file.dataDirectory, managementFileName);
        var mngmntArr = { entries: [fileName] };

        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
                var numEntries = mngmntArr.entries.length;
                mngmntArr.entries[numEntries] = fileName;
                var fileDeleted = $cordovaFile.removeFile(cordova.file.dataDirectory, managementFileName);
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
                var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
            },
                function (error) {
                    debugger;
                });
        }, function (error) {
            //If no management file, create new one and output JSON
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
        });

        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileDeleted = $cordovaFile.removeFile(cordova.file.dataDirectory, fullFileName).then(
                function () {
                    var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true).then(
                        function () {
                            var output = { absorbances: absorbances, concentrations: concentrations, concentrationLabels: concentrationLabels, wavelength: wavelength };
                            output = angular.toJson(output);
                            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output).then(function () {
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
                    debugger;
                }
            );
        },
        function (failure) {
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true).then(
                function () {
                    var output = { absorbances: absorbances, concentrations: concentrations, concentrationLabels: concentrationLabels, wavelength: wavelength };
                    output = angular.toJson(output);
                    var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output).then(function () {
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

    function outputDataFile(fileName, callback) {
        var fullFileName = getFullName(fileName, false);
        var data = { absorbances: [], concentrations: [], concentrationLabels: [], status: 0 };
        var outputExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(
                function (success) {
                    data = angular.fromJson(success);
                    callback(data);
                },
                function (error) {
                }
            );
        },
        function (error) {
        });
    };

    function inputNVD(wavelengths, absorbances)
    {
        var outputObj = [];
        var numWavelengths = wavelengths.length;
        var numAbsorbances = absorbances.length;
        if(numWavelengths!=numAbsorbances)
        {
            return false;
        }
        for (var i = 0; i < numWavelengths;++i)
        {
            var newObj = {
                "key":{},
                "value":{"x":wavelengths[i], "y":absorbances[i]}
            };
            outputObj[i]=newObj;
        }
        var fullFileName = "nvdDump.pmir";
        var dumpExists = $cordovaFile.checkFile(cordova.file.dataDirectory, fullFileName);
        var dumpFileCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, outputObj);
    }

    function databaseTest() {
        var absorb = [1, -3, 2, 6, 8, 3, -2];
        var conc = [1, 1, 1, 0, -1];
        var lables = ["a", "b", "c", "d", "e"];
        var wave = [2, 4, 6, 8, 10, 12, 14];
        inputDataFile(absorb, conc, lables, wave, "test");
        var output = outputDataFile("test");
    };

    return {inputModel: inputModel, outputModel: outputModel, inputDataFile: inputDataFile, outputDataFile: outputDataFile, listEntries:listEntries, inputNVD:inputNVD};
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJXV1cvanMvbm9kZVNlcnZpY2VzLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvY2hvbGVza3kuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9ldmQuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9sdS5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RjL3FyLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvc3ZkLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RlY29tcG9zaXRpb25zLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9tYXRyaXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL25vZGVfbW9kdWxlcy9tbC1zdGF0L2FycmF5LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9ub2RlX21vZHVsZXMvbWwtc3RhdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wY2Evbm9kZV9tb2R1bGVzL21sLXN0YXQvbWF0cml4LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9zcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL3NyYy9wY2EuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL29wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy9wbHMuanMiLCJub2RlX21vZHVsZXMvbWwtcGxzL3NyYy91dGlscy5qcyIsIm5vZGVfbW9kdWxlcy9uZy1jb3Jkb3ZhL2Rpc3QvbmctY29yZG92YS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzcUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbndCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDamdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzkwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Z0JBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGxpYl9jb3Jkb3ZhID0gcmVxdWlyZSgnbmctY29yZG92YScpO1xyXG4vL1RoaXMgZmlsZSBpbmNsdWRlcyBzZXJ2aWNlcyB3aGljaCByZWx5IG9uIG5vZGUgcHVibGljIG1vZHVsZXMuXHJcbmFuZ3VsYXIubW9kdWxlKCdhcHAubm9kZVNlcnZpY2VzJywgWydpb25pYycsICduZ0NvcmRvdmEnXSlcclxuXHJcbi5zZXJ2aWNlKCdjaGVtbycsIGZ1bmN0aW9uKGRhdGFiYXNlKXtcclxuXHJcbiAgICB2YXIgbGliX3BscyA9IHJlcXVpcmUoJ21sLXBscycpO1xyXG4gICAgdmFyIGxpYl9wY2EgPSByZXF1aXJlKCdtbC1wY2EnKTtcclxuICAgIHZhciBsaWJfbWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XHJcblxyXG4gICAgdmFyIGNoZW1vSXNQbHM7XHJcbiAgICB2YXIgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzID0gW107XHJcbiAgICB2YXIgY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzID0gW107XHJcbiAgICB2YXIgY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICB2YXIgY2hlbW9QQ0FDb21wcmVzc2VkID0gW107XHJcbiAgICB2YXIgY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gMDtcclxuICAgIHZhciBjaGVtb0lzVHJhaW5lZCA9IGZhbHNlO1xyXG4gICAgLy9yZXByZXNlbnRzIGEgUGxzIG9yIFBDQSBtb2R1bGUuXHJcbiAgICB2YXIgY2hlbW9BbGdvO1xyXG5cclxuICAgIHZhciBjaGVtb0ZsYWdzID0ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IDAsXHJcbiAgICAgICAgZmFpbEZpbGVJRDogMSxcclxuICAgICAgICBmYWlsVHJhaW5pbmdSb3dNaXNtYXRjaDogMixcclxuICAgICAgICBmYWlsTm90RW5vdWdoTGFiZWxzOiAzLFxyXG4gICAgICAgIGZhaWxOb1RyYWluaW5nRGF0YTogNCxcclxuICAgICAgICBmYWlsVW5rbm93blRyYWluRXJyb3I6IDUsXHJcbiAgICAgICAgZmFpbFVua25vd25JbmZlcmVuY2VFcnJvcjogNixcclxuICAgICAgICBmYWlsQWJzb3JiYW5jZU1pc21hdGNoOiA3LFxyXG4gICAgICAgIGZhaWxDb25jZW50cmF0aW9uTWlzbWF0Y2g6IDgsXHJcbiAgICAgICAgZmFpbEZpbGVOb3RTYXZlZDogOSxcclxuICAgICAgICBmYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2g6IDEwLFxyXG4gICAgICAgIGZhaWxJbmZlcmVuY2VDb2x1bW5NaXNtYXRjaDogMTFcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY29uc29sZU91dHB1dCh3aG8sIGlkZW50aWZpZXIsIG1lc3NhZ2UpIHtcclxuICAgICAgICB2YXIgbmFtZSA9IFwiXCI7XHJcbiAgICAgICAgc3dpdGNoICh3aG8pIHtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgbmFtZSA9IG5hbWUuY29uY2F0KFwiY2hlbW9UcmFpbjogXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgICAgIG5hbWUgPSBuYW1lLmNvbmNhdChcIkNoZW1vSW5mZXI6IFwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBuYW1lID0gbmFtZS5jb25jYXQoaWRlbnRpZmllcik7XHJcbiAgICAgICAgcmV0dXJuIG5hbWUuY29uY2F0KG1lc3NhZ2UpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBkYXRhYmFzZUdldEZpbGUoZmlsZUlEKSB7XHJcbiAgICAgICAgdmFyIGRhdGEgPSBkYXRhYmFzZS5vdXB1dERhdGFGaWxlKGZpbGVJRCk7XHJcbiAgICAgICAgaWYgKGRhdGEuc3VjY2VzcyA9PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgYWJzb3JiYW5jZXM6IGRhdGEuYWJzb3JiYW5jZXMsIGNvbmNlbnRyYXRpb25MYWJlbHM6IGRhdGEuY29uY2VudHJhdGlvbkxhYmVscywgY29uY2VudHJhdGlvbnM6IGRhdGEuY29uY2VudHJhdGlvbnMgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgYWJzb3JiYW5jZXM6IFtdLCBjb25jZW50cmF0aW9uTGFiZWxzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdIH07XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNoZW1vR2V0RmlsZShmaWxlSUQpIHtcclxuICAgICAgICByZXR1cm4gZGF0YWJhc2VHZXRGaWxlKGZpbGVJRCk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGRhdGFiYXNlQWRkRmlsZShhYnNvcmJhbmNlcywgY29uY2VudHJhdGlvbkxhYmVscywgY29uY2VudHJhdGlvbnMsIGZpbGVOYW1lKSB7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGRhdGFiYXNlLmlucHV0RGF0YUZpbGUoYWJzb3JiYW5jZXMsIGNvbmNlbnRyYXRpb25MYWJlbHMsIGNvbmNlbnRyYXRpb25zLCBmaWxlTmFtZSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlbW9BZGRMYWJlbHMobGFiZWxzKSB7XHJcblxyXG4gICAgICAgIHZhciBuZXdMYWJlbHNMZW5ndGggPSBsYWJlbHMubGVuZ3RoO1xyXG4gICAgICAgIHZhciBvbGRMYWJlbHNMZW5ndGggPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMubGVuZ3RoO1xyXG4gICAgICAgIC8vbG9jYXRpb25BcnIgKFtpbnRdKSBob2xkcyB0aGUgbnVtYmVyIG9mIHRoZSBjb2x1bW4gb2YgYSBjb25jZW50cmF0aW9uIG1hdHJpeCB0aGlzIGxhYmVsIGlzIGxpbmtlZCB0b1xyXG4gICAgICAgIHZhciBsb2NhdGlvbkFyciA9IFtdO1xyXG4gICAgICAgIC8vTG9vayB0byBzZWUgaWYgd2UgaGF2ZSBzZWVuIHRoaXMgbGFiZWwgYmVmb3JlXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdMYWJlbHNMZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgbm90Rm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG9sZExhYmVsc0xlbmd0aDsgKytqKSB7XHJcbiAgICAgICAgICAgICAgICAvL0lmIHdlIGhhdmUgc2VlbiBiZWZvcmUsIG1ha2UgYSBub3RlIG9mIHdoYXQgY29sdW1uIHRoZSBjb25jZW50cmF0aW9uIHdpbGwgZ28gaW5cclxuICAgICAgICAgICAgICAgIC8vaW5zaWRlIG9mIHRyYWluaW5nLVkgbWF0cml4LlxyXG4gICAgICAgICAgICAgICAgaWYgKGxhYmVsc1tpXSA9PSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbal0pIHtcclxuICAgICAgICAgICAgICAgICAgICBub3RGb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvY2F0aW9uQXJyW2xvY2F0aW9uQXJyLmxlbmd0aF0gPSBqO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vSWYgbmV2ZXIgc2VlbiBiZWZvcmUsIHdlIGFkZCB0aGUgbGFiZWwgdG8gYSBsaXN0aW5nIG9mIGxhYmVscy5cclxuICAgICAgICAgICAgaWYgKG5vdEZvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHNbb2xkTGFiZWxzTGVuZ3RoXSA9IGxhYmVsc1tpXTtcclxuICAgICAgICAgICAgICAgIGxvY2F0aW9uQXJyW2xvY2F0aW9uQXJyLmxlbmd0aF0gPSBvbGRMYWJlbHNMZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGxvY2F0aW9uQXJyO1xyXG4gICAgfTtcclxuXHJcbiAgICAvL0FkZHMgYSBmaWxlIHdpdGggdGhlIG1lYXN1cmVkIGFic29ycHRpb25zIGFuZCBlc3RpbWF0ZWQgY29uY2VudHJhdGlvbnMuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0FkZEZpbGUoYWJzb3JiYW5jZXMsIGNvbmNlbnRyYXRpb25MYWJlbHMsIGNvbmNlbnRyYXRpb25zKSB7XHJcbiAgICAgICAgZGF0YWJhc2VBZGRGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFiZWxzLCBjb25jZW50cmF0aW9ucyk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNoZW1vQWRkQ29uY2VudHJhdGlvbihuZXdDb25jZW50cmF0aW9uLCBjdXJyUm93LCBjdXJyQ29sKSB7XHJcbiAgICAgICAgLy9hZGQgaW5kZXhcclxuICAgICAgICB2YXIgbnVtUm93ID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zLmxlbmd0aDtcclxuICAgICAgICB2YXIgbnVtQ29sID0gMDtcclxuICAgICAgICBpZiAobnVtUm93ID4gMCkge1xyXG4gICAgICAgICAgICBudW1Db2wgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0ubGVuZ3RoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy9JZiBwYXN0IGxhc3Qgcm93IGJ5IDEsIG1ha2UgYSBuZXcgcm93IChmdWxsIG9mIG5vdC1pbml0KVxyXG4gICAgICAgIGlmIChjdXJyUm93ID09IG51bVJvdykge1xyXG4gICAgICAgICAgICBudW1Sb3cgKz0gMTtcclxuICAgICAgICAgICAgY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2N1cnJSb3ddID0gW107XHJcbiAgICAgICAgICAgIHZhciBjdXJyUm93QXJyID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2N1cnJSb3ddO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bUNvbDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyUm93QXJyW2ldID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL1dlIHBhc3MgdGhlIGxhc3QgY29sdW1uLSBhZGQgbmV3IGNvbHVtbiB3aXRoIDAgc3RhdGVzLlxyXG4gICAgICAgIGlmIChjdXJyQ29sID09IG51bUNvbCkge1xyXG4gICAgICAgICAgICBudW1Db2wgKz0gMTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Sb3c7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGN1cnJSb3dBcnIgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAoaSA9PSBjdXJyUm93KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3VyclJvd0FycltjdXJyQ29sXSA9IG5ld0NvbmNlbnRyYXRpb247XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvL1doZW4gd2UgYWRkIGEgY29sdW1uLCB3ZSBsZWF2ZSBpbmRpY2VzIDBcclxuICAgICAgICAgICAgICAgICAgICBjdXJyUm93QXJyW2N1cnJDb2xdID0gMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgLy9JbiB0aGlzIHNpdHVhdGlvbiB3ZSBhcmUgb3ZlcndyaXRpbmcgYSAwXHJcbiAgICAgICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XVtjdXJyQ29sXSA9IG5ld0NvbmNlbnRyYXRpb247XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjaGVtb1RyYWluKGlzUXVhbnRpZnksIGZpbGVJREFycikge1xyXG4gICAgICAgIGNvbnNvbGVPdXRwdXQoMCwgXCJpc1F1YW50aWZ5XCIsIGlzUXVhbnRpZnkpO1xyXG4gICAgICAgIGNoZW1vSXNQbHMgPSBpc1F1YW50aWZ5O1xyXG4gICAgICAgIHZhciBudW1GaWxlcyA9IGZpbGVJREFyci5sZW5ndGg7XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgwLCBcIm51bUZpbGVzXCIsIG51bUZpbGVzKTtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bUZpbGVzOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBjaGVtb0dldEZpbGUoZmlsZUlEQXJyW2ldKTtcclxuICAgICAgICAgICAgY29uc29sZU91dHB1dCgwLCBcImZpbGVcIiwgZmlsZSk7XHJcbiAgICAgICAgICAgIGlmIChmaWxlID09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxGaWxlSUQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvL0FkZCBuZXcgY2hlbWljYWwgbGFiZWxzIGlmIHRoZXJlIGFyZSBhbnkgbmV3IG9uZXMgaW4gdGhpcyBmaWxlIGFuZCBhc3NvY2lhdGUgbGFiZWxzIHdpdGggY29uY2VudHJhdGlvbiBpbmRpY2VzXHJcbiAgICAgICAgICAgICAgICB2YXIgbG9jYXRpb25BcnIgPSBjaGVtb0FkZExhYmVscyhmaWxlLmNvbmNlbnRyYXRpb25MYWJlbHMpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bUNoZW1pY2FscyA9IGxvY2F0aW9uQXJyLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIC8vQWRkIGFic29yYmFuY2VzIGFzIG5leHQgcm93IG9mIG1hdHJpeCB0cmFpbmluZy1ZXHJcbiAgICAgICAgICAgICAgICBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXNbaV0gPSBmaWxlLmFic29yYmFuY2VzO1xyXG4gICAgICAgICAgICAgICAgLy9BZGQgY2hlbSBjb25jZW50cmF0aW9uIGluIGNvcnJlY3QgcGFydCBvZiB0cmFpbmluZyBtYXRyaXggWC5cclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnVtQ2hlbWljYWxzOyArK2opIHtcclxuICAgICAgICAgICAgICAgICAgICAvL0VhY2ggY2hlbSBjb25jIGdvZXMgaW4gaXRoIHJvdyAoYXMgcmVwcmVzZW50cyBpdGggc2NhbikgYXQgdGhlIGluZGV4IHJlcHJlc2VudGluZyB0aGUgYXBwcm9wcmlhdGUgbGFiZWxcclxuICAgICAgICAgICAgICAgICAgICBjaGVtb0FkZENvbmNlbnRyYXRpb24oZmlsZS5jb25jZW50cmF0aW9uc1tqXSwgaSwgbG9jYXRpb25BcnJbal0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoID09IDApIHtcclxuICAgICAgICAgICAgLy9ObyB0cmFpbmluZyBkYXRhIG1lYW5zIG5vIHN1Y2Nlc3MgKGFsc28gc29tZXRpbWVzIHdlIHVzZSAwdGggcm93IHRvIGZpbmQgbnVtIG9mIGNvbClcclxuICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbE5vVHJhaW5pbmdEYXRhO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzLmxlbmd0aCAhPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIC8vVGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIGNvbmNlbnRyYXRpb25zIGZvciBldmVyeSBhcnJheSBvZiBhYnNvcmJhbmNlc1xyXG4gICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsVHJhaW5pbmdSb3dNaXNtYXRjaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscy5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zWzBdLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAvL1dlIGRvbid0IGhhdmUgYSBuYW1lIGZvciBlYWNoIG1hdGVyaWFsIChDcnkpXHJcbiAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxOb3RFbm91Z2hMYWJlbHM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb0lzUGxzKSB7XHJcbiAgICAgICAgICAgIHZhciBudW1Db2xBYnNvcmJhbmNlcyA9IGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlc1swXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIHZhciBudW1Db2xDb25jZW50cmF0aW9ucyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIC8vVGFrZSAxMCUgb2YgZGF0YSAocHJvYmFibHkgb2YgWSkuXHJcbiAgICAgICAgICAgIHZhciBtYXhWZWN0b3JzID0gbWluKG51bUNvbEFic29yYmFuY2VzLCBudW1Db2xDb25jZW50cmF0aW9ucyk7XHJcbiAgICAgICAgICAgIHZhciBudW1MYXRlbnRWZWN0b3JzID0gZmxvb3IobWF4VmVjdG9ycyAqIDAuMSk7XHJcbiAgICAgICAgICAgIGlmIChudW1MYXRlbnRWZWN0b3JzID09IDApIHtcclxuICAgICAgICAgICAgICAgIG51bUxhdGVudFZlY3RvcnMgKz0gMTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gMDtcclxuICAgICAgICAgICAgd2hpbGUgKG51bUxhdGVudFZlY3RvcnMgPD0gbWF4VmVjdG9ycyAmJiBleHBsYWluZWRWYXJpYW5jZXMgPCAwLjg1KSB7XHJcbiAgICAgICAgICAgICAgICBjaGVtb0FsZ28gPSBuZXcgbGliX3BscygpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGF0ZW50VmVjdG9yczogbnVtTGF0ZW50VmVjdG9ycyxcclxuICAgICAgICAgICAgICAgICAgICB0b2xlcmFuY2U6IDFlLTVcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vSXQgaXMgdmVyeSBjbGVhbiB0byByZXByc2VudCBhbGwgYWJzb3JiYW5jZXMgYXMgYSByb3csIGJ1dC0gZWFjaCBvbmUgY29uc2lkZXJlZFxyXG4gICAgICAgICAgICAgICAgICAgIC8vYSB2YXJpYWJsZSBpbiBQTFMsIHRodXMgZWFjaCBvbmUgaGFzIGl0cyBvd24gcm93IChjb2x1bW5zIGRpZmZlcmVudGlhdGUgc2FtcGxlKVxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhYnNvcmJhbmNlc1RyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYWJzb3JiYW5jZXNUcmFuc3Bvc2UgPSBhYnNvcmJhbmNlc1RyYW5zcG9zZS50cmFuc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgY29uY2VudHJhdGlvbnNUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmNlbnRyYXRpb25zVHJhbnNwb3NlID0gY29uY2VudHJhdGlvbnNUcmFuc3Bvc2UudHJhbnNwb3NlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY2hlbW9BbGdvLnRyYWluKGFic29yYmFuY2VzVHJhbnNwb3NlLCBjb25jZW50cmF0aW9uc1RyYW5zcG9zZSwgb3B0aW9ucyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbFVua25vd25UcmFpbkVycm9yO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZXhwbGFpbmVkVmFyaWFuY2VzID0gY2hlbW9BbGdvLmdldEV4cGxhaW5lZFZhcmlhbmNlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXhwbGFpbmVkVmFyaWFuY2VzIDwgMC44NSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG51bUxhdGVudFZlY3RvcnMrKztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgLy9HZXQgcHJpbmNpcGxlIGNvbXBvbmVudHMgYXNzb2NpYXRlZCB3aXRoIHRyYWluaW5nIHNldCBhYnNvcmJhbmNlcyBYLlxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgLy9JdCBpcyB2ZXJ5IGNsZWFuIHRvIHJlcHJzZW50IGFsbCBhYnNvcmJhbmNlcyBhcyBhIHJvdywgYnV0LSBlYWNoIG9uZSBjb25zaWRlcmVkXHJcbiAgICAgICAgICAgICAgICAvL2EgdmFyaWFibGUgaW4gUExTLCB0aHVzIGVhY2ggb25lIGhhcyBpdHMgb3duIHJvdyAoY29sdW1ucyBkaWZmZXJlbnRpYXRlIHNhbXBsZSlcclxuICAgICAgICAgICAgICAgIHZhciBhYnNvcmJhbmNlc1RyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgICAgICBhYnNvcmJhbmNlc1RyYW5zcG9zZSA9IGFic29yYmFuY2VzVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wY2EoYWJzb3JiYW5jZXNUcmFuc3Bvc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duVHJhaW5FcnJvcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjaGVtb051bUxhdGVudFZlY3RvcnMgPSAyOyAvL1RlbXBvcmFyeS0gMiBjb21wb25lbnRzIHNvIHRoYXQgd2UgY2FuIGhhdmUgdGhlIHgteSBvZiBhIGdyYXBoXHJcbiAgICAgICAgICAgIC8vY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IobnVtQ29sQWJzb3JiYW5jZXMgKiAwLjEpO1xyXG4gICAgICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gY2hlbW9BbGdvLmdldEV4cGxhaW5lZFZhcmlhbmNlKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGVPdXRwdXQoMCwgXCJMYXRlbnQgVmVjdG9yc1wiLCBjaGVtb051bUxhdGVudFZlY3RvcnMpO1xyXG4gICAgICAgICAgICAvL0hvdyBtYW55IHZlY3RvcnMgdG8gZ2V0IH44NSUgb2YgdmFyaWFuY2U/XHJcbiAgICAgICAgICAgIC8qY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IoMC44NSAvIGV4cGxhaW5lZFZhcmlhbmNlcyk7XHJcbiAgICAgICAgICAgIGlmIChjaGVtb051bUxhdGVudFZlY3RvcnMgPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9OdW1MYXRlbnRWZWN0b3JzICs9IDE7XHJcbiAgICAgICAgICAgIH0qL1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgLy9JdCBpcyB2ZXJ5IGNsZWFuIHRvIHJlcHJzZW50IGFsbCBhYnNvcmJhbmNlcyBhcyBhIHJvdywgYnV0LSBlYWNoIG9uZSBjb25zaWRlcmVkXHJcbiAgICAgICAgICAgICAgICAvL2EgdmFyaWFibGUgaW4gUExTLCB0aHVzIGVhY2ggb25lIGhhcyBpdHMgb3duIHJvdyAoY29sdW1ucyBkaWZmZXJlbnRpYXRlIHNhbXBsZSlcclxuICAgICAgICAgICAgICAgIHZhciBhYnNvcmJhbmNlc1RyYW5zcG9zZSA9IG5ldyBsaWJfbWF0cml4KGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgICAgICBhYnNvcmJhbmNlc1RyYW5zcG9zZSA9IGFic29yYmFuY2VzVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgLy9DaGVjayBwYXJhbWV0ZXIgcmVxdWlyZW1lbnRzXHJcbiAgICAgICAgICAgICAgICBjaGVtb1BDQUNvbXByZXNzZWQgPSBjaGVtb0FsZ28ucHJvamVjdChhYnNvcmJhbmNlc1RyYW5zcG9zZSwgY2hlbW9OdW1MYXRlbnRWZWN0b3JzKS50cmFuc3Bvc2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsVW5rbm93blRyYWluRXJyb3I7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIG51bVBvaW50cyA9IGNoZW1vUENBQ29tcHJlc3NlZC5sZW5ndGg7XHJcbiAgICAgICAgICAgIHZhciB0ZW1wc3RyaW5nID0gXCJwcm9qZWN0ZWRcIjtcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Qb2ludHM7ICsraSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZU91dHB1dCgwLCB0ZW1wc3RyaW5nLmNvbmNhdChpKSwgY2hlbW9QQ0FDb21wcmVzc2VkW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgY29uc29sZU91dHB1dCgwLCBcImlzVHJhaW5lZFwiLCBjaGVtb0lzVHJhaW5lZCk7XHJcbiAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3Muc3VjY2VzcztcclxuICAgIH07XHJcblxyXG4gICAgLy9FeHBlY3QgYSAxRCBhcnJheSBjb250YWluaW5nIGFic29yYmFuY2VzLCBmbGFnIHRlbGxpbmcgdG8gc2F2ZSwgKGlmIHNhdmUsIHByb3ZpZGUgYSBmaWxlIG5hbWUpXHJcbiAgICBmdW5jdGlvbiBjaGVtb0luZmVyKG1lYXN1cmVkQWJzb3JiYW5jZXMsIGRvU2F2ZSwgZmlsZU5hbWUpIHtcclxuICAgICAgICBpZiAoIWNoZW1vSXNUcmFpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVhc3VyZWRBYnNvcmJhbmNlcy5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzWzBdLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsQWJzb3JiYW5jZU1pc21hdGNoIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb0lzUGxzKSB7XHJcbiAgICAgICAgICAgIHZhciBpbmZlcnJlZCA9IFtdO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmVkVHJhbnNwb3NlID0gbmV3IGxpYl9tYXRyaXgobWVhc3VyZWRBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgICAgICBtZWFzdXJlZFRyYW5zcG9zZSA9IG1lYXN1cmVkVHJhbnNwb3NlLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgaW5mZXJyZWQgPSBjaGVtb0FsZ28ucHJlZGljdChtZWFzdXJlZFRyYW5zcG9zZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbFVua25vd25JbmZlcmVuY2VFcnJvciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmZlcnJlZC5sZW5ndGggPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbFVua25vd25JbmZlcmVuY2VFcnJvciB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbmZlcnJlZFswXS5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zWzBdLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vVGhlIGltcGxlbWVudGF0aW9uIHByb3ZpZGVzIHRoZSBiZXN0IGFuc3dlciBmaXJzdFxyXG4gICAgICAgICAgICB2YXIgaW5mZXJyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChpbmZlcnJlZCk7XHJcbiAgICAgICAgICAgIGluZmVycmVkVHJhbnNwb3NlID0gaW5mZXJyZWRUcmFuc3Bvc2UudHJhbnNwb3NlKCk7XHJcbiAgICAgICAgICAgIHZhciBhbGxDb25jZW50cmF0aW9ucyA9IGluZmVycmVkVHJhbnNwb3NlWzBdO1xyXG5cclxuICAgICAgICAgICAgLy9GaW5kIHRoZSBjaGVtaWNhbCBuYW1lcyB3aGljaCBoYXZlIGJlZW4gZGV0ZWN0ZWQuXHJcbiAgICAgICAgICAgIHZhciBsYWJlbHMgPSBbXTtcclxuICAgICAgICAgICAgdmFyIG5vblplcm9Db25jZW50cmF0aW9ucyA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFsbENvbmNlbnRyYXRpb25zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYWxsQ29uY2VudHJhdGlvbnNbaV0gIT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsc1tsYWJlbHMubGVuZ3RoXSA9IGNoZW1vQ29uY2VudHJhdGlvbkxhYmVsc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICBub25aZXJvQ29uY2VudHJhdGlvbnNbbm9uWmVyb0NvbmNlbnRyYXRpb25zLmxlbmd0aF0gPSBhbGxDb25jZW50cmF0aW9uc1tpXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGRvU2F2ZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGRhdGFiYXNlUmVzdWx0ID0gZGF0YWJhc2VBZGRGaWxlKG1lYXN1cmVkQWJzb3JiYW5jZXMsIGxhYmVscywgbm9uWmVyb0NvbmNlbnRyYXRpb25zLCBmaWxlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YWJhc2VSZXN1bHQuc3RhdHVzICE9IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vVGhpcyBmYWlsIGlzIGEgbWl4ZWQgYmFnLSB3ZSBzdWNjZWVkIGF0IGdldHRpbmcgb3VyIGRhdGEsIGJ1dCB3ZSBkb24ndCBtYW5hZ2UgdG8gc2F2ZSBpdCB0byB0aGUgZmlsZSBzeXN0ZW0uXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5mYWlsRmlsZU5vdFNhdmVkIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogbGFiZWxzLCBjb25jZW50cmF0aW9uczogbm9uWmVyb0NvbmNlbnRyYXRpb25zLCBzdGF0dXM6IGNoZW1vRmxhZ3Muc3VjY2VzcyB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdmFyIG1lYXN1cmVkID0gW107XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZWRUcmFuc3Bvc2UgPSBuZXcgbGliX21hdHJpeChtZWFzdXJlZEFic29yYmFuY2VzKTtcclxuICAgICAgICAgICAgICAgIG1lYXN1cmVkVHJhbnNwb3NlID0gbWVhc3VyZWRUcmFuc3Bvc2UudHJhbnNwb3NlKCk7XHJcbiAgICAgICAgICAgICAgICBtZWFzdXJlZCA9IGNoZW1vQWxnby5wcm9qZWN0KG1lYXN1cmVkVHJhbnNwb3NlLCBjaGVtb051bUxhdGVudFZlY3RvcnMpLnRyYW5zcG9zZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duSW5mZXJlbmNlRXJyb3IgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zb2xlT3V0cHV0KDEsIFwiUmVjZW50IFBvaW50XCIsIG1lYXN1cmVkKTtcclxuICAgICAgICAgICAgdmFyIGRpc3RhbmNlcyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgbnVtUG9pbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkLmxlbmd0aDtcclxuICAgICAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIm51bSBwb2ludHNcIiwgbnVtUG9pbnRzKTtcclxuICAgICAgICAgICAgaWYgKG51bVBvaW50cyAhPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2ggfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY2hlbW9OdW1MYXRlbnRWZWN0b3JzICE9IGNoZW1vUENBQ29tcHJlc3NlZFswXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxJbmZlcmVuY2VDb2x1bW5NaXNtYXRjaCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdW0gPSAwO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBjaGVtb1BDQUNvbXByZXNzZWRbaV0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZU91dHB1dCgxLCBcIm51bSBjb21wb25lbnRzXCIsIG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBudW1Db21wb25lbnRzOyArK2opIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyh4MS14MileMlxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnQgPSBtZWFzdXJlZFtqXSAtIGNoZW1vUENBQ29tcHJlc3NlZFtpXVtqXTtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQgPSBjb21wb25lbnQgKiBjb21wb25lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IGNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vU3F1YXJlIHJvb3Qgb2YgZGlzdGFuY2VzIHNxdWFyZWQgaXMgdGhlIGV1Y2xpZGVhbiBkaXN0YW5jZSBmb3JtdWxhXHJcbiAgICAgICAgICAgICAgICBzdW0gPSBzcXJ0KHN1bSk7XHJcbiAgICAgICAgICAgICAgICBkaXN0YW5jZVtpXSA9IHN1bTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0xpbmVhciBzZWFyY2ggdG8gZmluZCBwb2ludCB3aXRoIG1pbmltdW0gZGlzdGFuY2UgZnJvbSBuZXcgb2JzZXJ2YXRpb25cclxuICAgICAgICAgICAgdmFyIG1pbmltdW1EaXN0YW5jZSA9IGRpc3RhbmNlc1swXTtcclxuICAgICAgICAgICAgdmFyIG1pbmltdW1JbmRleCA9IDA7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZXNbaV0gPCBtaW5pbXVtRGlzdGFuY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBtaW5pbXVtRGlzdGFuY2UgPSBkaXN0YW5jZXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bUluZGV4ID0gaTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgYWxsQ29uY2VudHJhdGlvbnMgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbbWluaW11bUluZGV4XTtcclxuICAgICAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgbm9uWmVyb0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWxsQ29uY2VudHJhdGlvbnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWxzW2xhYmVscy5sZW5ndGhdID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG5vblplcm9Db25jZW50cmF0aW9uc1tub25aZXJvQ29uY2VudHJhdGlvbnMubGVuZ3RoXSA9IGFsbENvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGVPdXRwdXQoMSwgXCJsYWJlbHNcIiwgbGFiZWxzKTtcclxuICAgICAgICAgICAgaWYgKGRvU2F2ZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGRhdGFiYXNlUmVzdWx0ID0gZGF0YWJhc2VBZGRGaWxlKG1lYXN1cmVkQWJzb3JiYW5jZXMsIGxhYmVscywgbm9uWmVyb0NvbmNlbnRyYXRpb25zLCBmaWxlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YWJhc2VSZXN1bHQuc3RhdHVzICE9IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vVGhpcyBmYWlsIGlzIGEgbWl4ZWQgYmFnLSB3ZSBzdWNjZWVkIGF0IGdldHRpbmcgb3VyIGRhdGEsIGJ1dCB3ZSBkb24ndCBtYW5hZ2UgdG8gc2F2ZSBpdCB0byB0aGUgZmlsZSBzeXN0ZW0uXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5mYWlsRmlsZU5vdFNhdmVkIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vTmV3IHZlcnNpb24gcmV0dXJucyBhIG1hdHJpeCB3aXRoIHRoZSAyRCBjb29yZGluYXRlcyBmb3IgZXZlcnkgcG9pbnQgKHRyYWluaW5nUG9pbnRzKVxyXG4gICAgICAgICAgICAvL0FuZCB0aGUgbGFzdCBwb2ludCAod2hpY2ggd2FzIGp1c3QgaW5mZXJyZWQpIGlzIHJlY2VudFBvaW50LlxyXG4gICAgICAgICAgICAvL3JldHVybiB7IGNvbXBvdW5kczogbGFiZWxzLCBjb25jZW50cmF0aW9uczogbm9uWmVyb0NvbmNlbnRyYXRpb25zLCBzdGF0dXM6IGNoZW1vRmxhZ3Muc3VjY2VzcyB9O1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgdHJhaW5pbmdQb2ludHM6IGNoZW1vUENBQ29tcHJlc3NlZCwgcmVjZW50UG9pbnQ6IG1lYXN1cmVkLFxyXG4gICAgICAgICAgICAgICAgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0dldE1vZGVsKCkge1xyXG4gICAgICAgIGlmIChjaGVtb0lzVHJhaW5lZCkge1xyXG4gICAgICAgICAgICB2YXIgbW9kZWwgPSBjaGVtb0FsZ28uZXhwb3J0KCk7XHJcbiAgICAgICAgICAgIG1vZGVsLmNvbmNlbnRyYXRpb25MYWJlbHMgPSBjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHM7XHJcbiAgICAgICAgICAgIGlmICghY2hlbW9Jc1BscylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbW9kZWwuUENBQ29tcHJlc3NlZCA9IGNoZW1vUENBQ29tcHJlc3NlZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4geyBtb2RlbDogbW9kZWwsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB7IG1vZGVsOiBudWxsLCBzdGF0dXM6IGNoZW1vRmxhZ3MuZmFpbE5vVHJhaW5pbmdEYXRhIH07XHJcbiAgICB9O1xyXG5cclxuICAgIC8vQWRkIGJldHRlciBlcnJvciBoYW5kbGluZy5cclxuICAgIGZ1bmN0aW9uIGNoZW1vTG9hZE1vZGVsKG1vZGVsLCBpc1Bscykge1xyXG4gICAgICAgIGNoZW1vQ29uY2VudHJhdGlvbkxhYmVscyA9IG1vZGVsLmNvbmNlbnRyYXRpb25MYWJlbHM7XHJcbiAgICAgICAgaWYgKGlzUGxzKSB7XHJcbiAgICAgICAgICAgIGNoZW1vSXNQbHMgPSB0cnVlO1xyXG4gICAgICAgICAgICBjaGVtb0FsZ28gPSBuZXcgbGliX3Bscyh0cnVlLCBtb2RlbCk7XHJcbiAgICAgICAgICAgIGNoZW1vSXNUcmFpbmVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGNoZW1vSXNQbHMgPSBmYWxzZTtcclxuICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wY2EobnVsbCwgbnVsbCwgdHJ1ZSwgbW9kZWwpO1xyXG4gICAgICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBmbGFnVG9TdHJpbmcoZmxhZykge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBcIk5PIFNVQ0ggRkxBR1wiO1xyXG4gICAgICAgIHN3aXRjaCAoZmxhZykge1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcInN1Y2Nlc3NcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxGaWxlSURcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxUcmFpbmluZ1Jvd01pc21hdGNoXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsTm90RW5vdWdoTGFiZWxzXCI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSA0OlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gXCJmYWlsTm9UcmFpbmluZ0RhdGFcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDU6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxVbmtub3duVHJhaW5FcnJvclwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgNjpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbFVua25vd25JbmZlcmVuY2VFcnJvclwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgNzpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbEFic29yYmFuY2VNaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgODpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbENvbmNlbnRyYXRpb25NaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgOTpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IFwiZmFpbEZpbGVOb3RTYXZlZFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTA6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxJbmZlcmVuY2VSb3dNaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTE6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBcImZhaWxJbmZlcmVuY2VDb2x1bW5NaXNtYXRjaFwiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vQSBmdW5jdGlvbiB0byB0ZXN0IGlmIHBjYSB3b3JrcyBwcm9wZXJseVxyXG4gICAgZnVuY3Rpb24gcGNhVGVzdCgpIHtcclxuICAgICAgICAvL1Jlc3VsdHMgb2YgdHJhaW4/XHJcbiAgICAgICAgdmFyIHJldFRyYWluID0gY2hlbW9UcmFpbihmYWxzZSwgW1wieFwiLCBcInlcIl0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiVHJhaW5pbmcgU3RhdHVzOiBcIik7XHJcbiAgICAgICAgY29uc29sZS5sb2coZmxhZ1RvU3RyaW5nKHJldFRyYWluKSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJcXG5cIik7XHJcbiAgICAgICAgaWYgKHJldFRyYWluID09IGNoZW1vRmxhZ3Muc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAvL0luZmVyLCBubyBzYXZlXHJcbiAgICAgICAgICAgIHZhciBkZXRlY3RlZEFic29yYmFuY2VzID0gWzEsIDAsIDBdO1xyXG4gICAgICAgICAgICB2YXIgcmV0SW5mZXIgPSBjaGVtb0luZmVyKGRldGVjdGVkQWJzb3JiYW5jZXMsIGZhbHNlLCBudWxsKTtcclxuICAgICAgICAgICAgLy9yZXN1bHRzIG9mIGluZmVyP1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkluZmVyIFN0YXR1czogXCIpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhmbGFnVG9TdHJpbmcocmV0SW5mZXIuc3RhdHVzKSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAvL0lmIHdlIGRpZG4ndCBmYWlsLCBwcmludCBhbGwgcmVzdWx0cy5cclxuICAgICAgICAgICAgaWYgKHJldEluZmVyLnN0YXR1cyA9PSBjaGVtb0ZsYWdzLnN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTGFiZWxzIG9mIGNsb3Nlc3QgcG9pbnQ6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmV0SW5mZXIuY29tcG91bmRzKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJDb25jZW50cmF0aW9ucyBvbiBjbG9zZXN0IHBvaW50OlxcblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLmNvbmNlbnRyYXRpb25zKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJQb2ludHM6XFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bVBvaW50cyA9IHJldEluZmVyLnRyYWluaW5nUG9pbnRzLmxlbmd0aDsgXHJcbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPTA7aTxudW1Qb2ludHM7KytpKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLnRyYWluaW5nUG9pbnRzW2ldKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlxcblwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTY2FubmVkIFBvaW50OlxcblwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJldEluZmVyLnJlY2VudFBvaW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiXFxuXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcblxyXG4gICAgcmV0dXJuIHsgdHJhaW46IGNoZW1vVHJhaW4sIGluZmVyOiBjaGVtb0luZmVyLCBmbGFnczogY2hlbW9GbGFncywgZ2V0TW9kZWw6Y2hlbW9HZXRNb2RlbCwgbG9hZE1vZGVsOmNoZW1vTG9hZE1vZGVsLCBwY2FUZXN0OiBwY2FUZXN0IH07XHJcblxyXG59KTtcclxuXHJcbi8vU2VydmljZSBhbGxvd3MgY2FsbGluZyBpbnB1dE1vZGVsLCBpbnB1dERhdGFGaWxlLCBvdXRwdXREYXRhRmlsZSwgYW5kIG91dHB1dE1vZGVsLlxyXG5hbmd1bGFyLm1vZHVsZSgnYXBwLm5vZGVTZXJ2aWNlcycpXHJcblxyXG4uc2VydmljZSgnZGF0YWJhc2UnLCBmdW5jdGlvbiAoJGNvcmRvdmFGaWxlKSB7XHJcblxyXG4gICAgLy9UYWtlcyBhIHN0cmluZyBmaWxlbmFtZSwgYXR0YWNoZXMgXHJcbiAgICBmdW5jdGlvbiBnZXRGdWxsTmFtZShmaWxlTmFtZSwgaXNBbGdvcml0aG0sIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIGZ1bGxOYW1lO1xyXG4gICAgICAgIGlmIChpc0FsZ29yaXRobSkge1xyXG4gICAgICAgICAgICBpZiAoaXNQbHMpIHtcclxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lID0gXCJQTFNcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lID0gXCJQQ0FcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZnVsbE5hbWUgPSBcIkRBVFwiO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmdWxsTmFtZSA9IGZ1bGxOYW1lLmNvbmNhdChmaWxlTmFtZSk7XHJcbiAgICAgICAgZnVsbE5hbWUgPSBmdWxsTmFtZS5jb25jYXQoXCIucG1pclwiKTtcclxuICAgICAgICByZXR1cm4gZnVsbE5hbWVcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0TWFuYWdlbWVudE5hbWUoaXNBbGdvcml0aG0sIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIGZpbGVOYW1lO1xyXG4gICAgICAgIGlmIChpc0FsZ29yaXRobSkge1xyXG4gICAgICAgICAgICBpZiAoaXNQbHMpIHtcclxuICAgICAgICAgICAgICAgIGZpbGVOYW1lID0gXCJtbmdtbnRQbHMucG1pclwiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZmlsZU5hbWUgPSBcIm1uZ21udFBjYS5wbWlyXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGZpbGVOYW1lID0gXCJtbmdtbnREYXQucG1pclwiO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmlsZU5hbWU7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGxpbmVhclNlYXJjaChhcnIsIGZpbmQpIHtcclxuICAgICAgICB2YXIgbGVuID0gYXJyLmxlbmd0aDtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChhcnJbaV0gPT0gZmluZClcclxuICAgICAgICAgICAgICAgIHJldHVybiBpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gbGlzdEVudHJpZXMoaXNBbGdvcml0aG0sIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIG1hbmFnZW1lbnRGaWxlTmFtZSA9IGdldE1hbmFnZW1lbnROYW1lKGlzQWxnb3JpdGhtLCBpc1Bscyk7XHJcbiAgICAgICAgdmFyIG1uZ21udEFyciA9IHsgZW50cmllczogW10gfTtcclxuICAgICAgICB2YXIgbWFuYWdlbWVudEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSk7XHJcbiAgICAgICAgbWFuYWdlbWVudEV4aXN0cy50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIC8vSWYgZXhpc3RzIHJlYWQgaW4gSnNvbiBzdHJpbmcgYW5kIGNvbnZlcnQgdG8gb2JqZWN0LCBhZGQgZWxlbWVudHMgYW5kIHB1c2ggYmFjayB0byBmaWxlLlxyXG4gICAgICAgICAgICB2YXIgbW5nbW50UmVhZCA9ICRjb3Jkb3ZhRmlsZS5yZWFkQXNUZXh0KGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgICAgICBtbmdtbnRSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyciA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcblxyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICAvL0lmIG5vIG1hbmFnZW1lbnQgZmlsZSwgcmV0dXJuIG5vIGZpbGVzLlxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtbmdtbnRBcnIuZW50cmllcztcclxuICAgIH07XHJcblxyXG4gICAgLypNb2R1bGUgbGV2ZWwgZnVuY3Rpb25cclxuICAgIElucHV0OiBzdHJpbmcgZmlsZU5hbWUtIHRoZSBuYW1lIG9mIHRoZSBmaWxlIHRvIHdyaXRlIHRvLlxyXG4gICAgICAgICAgIHBjYSBhbGdvcml0aG0gT1IgcGxzIGFsZ29yaXRobS0gdGhlIG1vZGVsIHdlIHdhbnQgdG8gc2F2ZS5cclxuICAgIFN1Y2Nlc3M6IE5ldyBmaWxlIGFkZGVkIHBjYWZpbGVOYW1lLnBtaXIgT1IgcGxzZmlsZU5hbWUucG1pciBcclxuICAgICovXHJcbiAgICBmdW5jdGlvbiBpbnB1dE1vZGVsKGZpbGVOYW1lLCBhbGdvcml0aG0pIHtcclxuICAgICAgICB2YXIgb3V0cHV0ID0gYW5ndWxhci50b0pzb24oYWxnb3JpdGhtKTtcclxuICAgICAgICB2YXIgbW5nbW50QXJyID0geyBlbnRyaWVzOiBbZmlsZU5hbWVdIH07XHJcblxyXG4gICAgICAgIHZhciBpc1BscyA9IGFsZ29yaXRobS5tb2RlbE5hbWUgPT0gXCJQTFNcIjtcclxuICAgICAgICB2YXIgZnVsbEZpbGVOYW1lID0gZ2V0RnVsbE5hbWUoZmlsZU5hbWUsIHRydWUsIGlzUGxzKTtcclxuICAgICAgICB2YXIgbWFuYWdlbWVudEZpbGVOYW1lID0gZ2V0TWFuYWdlbWVudE5hbWUodHJ1ZSwgaXNQbHMpO1xyXG5cclxuICAgICAgICB2YXIgbWFuYWdlbWVudEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSk7XHJcbiAgICAgICAgbWFuYWdlbWVudEV4aXN0cy50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIC8vSWYgZXhpc3RzIHJlYWQgaW4gSnNvbiBzdHJpbmcgYW5kIGNvbnZlcnQgdG8gb2JqZWN0LCBhZGQgZWxlbWVudHMgYW5kIHB1c2ggYmFjayB0byBmaWxlLlxyXG4gICAgICAgICAgICB2YXIgbW5nbW50UmVhZCA9ICRjb3Jkb3ZhRmlsZS5yZWFkQXNUZXh0KGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgICAgICBtbmdtbnRSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyciA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbnVtRW50cmllcyA9IG1uZ21udEFyci5lbnRyaWVzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyci5lbnRyaWVzW251bUVudHJpZXNdID0gZmlsZU5hbWU7XHJcbiAgICAgICAgICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dFdyaXR0ZW4gPSAkY29yZG92YUZpbGUud3JpdGVFeGlzdGluZ0ZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgYW5ndWxhci50b0pzb24obW5nbW50QXJyKSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcblxyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICAvL0lmIG5vIG1hbmFnZW1lbnQgZmlsZSwgY3JlYXRlIG5ldyBvbmUgYW5kIG91dHB1dCBKU09OXHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRDcmVhdGVkID0gJGNvcmRvdmFGaWxlLmNyZWF0ZUZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIGFuZ3VsYXIudG9Kc29uKG1uZ21udEFycikpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB2YXIgb3V0cHV0RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICAvL0FkZCBjb25kaXRpb25hbHMgYXQgbGF0ZXIgdGltZSwgYWNjb3VudCBmb3IgbWVtb3J5IGF0IGFub3RoZXIgdGltZS5cclxuICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIG91dHB1dCk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIG91dHB1dE1vZGVsKGZpbGVOYW1lLCBpc1Bscykge1xyXG4gICAgICAgIHZhciBmdWxsRmlsZU5hbWUgPSBnZXRGdWxsTmFtZShmaWxlTmFtZSwgdHJ1ZSwgaXNQbHMpO1xyXG4gICAgICAgIHZhciBtb2RlbCA9IG51bGw7XHJcbiAgICAgICAgdmFyIG91dHB1dEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSk7XHJcbiAgICAgICAgb3V0cHV0RXhpc3RzLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgdmFyIGZpbGVSZWFkID0gJGNvcmRvdmFGaWxlLnJlYWRBc1RleHQoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSk7XHJcbiAgICAgICAgICAgIGZpbGVSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1vZGVsID0gYW5ndWxhci5mcm9tSnNvbihzdWNjZXNzKTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gbW9kZWw7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGlucHV0RGF0YUZpbGUoYWJzb3JiYW5jZXMsIGNvbmNlbnRyYXRpb25MYWJlbHMsIGNvbmNlbnRyYXRpb25zLCB3YXZlbGVuZ3RoLCBmaWxlTmFtZSkge1xyXG4gICAgICAgIHZhciBmdWxsRmlsZU5hbWUgPSBnZXRGdWxsTmFtZShmaWxlTmFtZSwgZmFsc2UpO1xyXG4gICAgICAgIHZhciBtYW5hZ2VtZW50RmlsZU5hbWUgPSBnZXRNYW5hZ2VtZW50TmFtZShmYWxzZSk7XHJcbiAgICAgICAgdmFyIG1hbmFnZW1lbnRFeGlzdHMgPSAkY29yZG92YUZpbGUuY2hlY2tOYW1lKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgIHZhciBtbmdtbnRBcnIgPSB7IGVudHJpZXM6IFtmaWxlTmFtZV0gfTtcclxuXHJcbiAgICAgICAgbWFuYWdlbWVudEV4aXN0cy50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIC8vSWYgZXhpc3RzIHJlYWQgaW4gSnNvbiBzdHJpbmcgYW5kIGNvbnZlcnQgdG8gb2JqZWN0LCBhZGQgZWxlbWVudHMgYW5kIHB1c2ggYmFjayB0byBmaWxlLlxyXG4gICAgICAgICAgICB2YXIgbW5nbW50UmVhZCA9ICRjb3Jkb3ZhRmlsZS5yZWFkQXNUZXh0KGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgICAgICBtbmdtbnRSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyciA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbnVtRW50cmllcyA9IG1uZ21udEFyci5lbnRyaWVzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyci5lbnRyaWVzW251bUVudHJpZXNdID0gZmlsZU5hbWU7XHJcbiAgICAgICAgICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dFdyaXR0ZW4gPSAkY29yZG92YUZpbGUud3JpdGVFeGlzdGluZ0ZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgYW5ndWxhci50b0pzb24obW5nbW50QXJyKSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XHJcbiAgICAgICAgICAgIC8vSWYgbm8gbWFuYWdlbWVudCBmaWxlLCBjcmVhdGUgbmV3IG9uZSBhbmQgb3V0cHV0IEpTT05cclxuICAgICAgICAgICAgdmFyIG91dHB1dENyZWF0ZWQgPSAkY29yZG92YUZpbGUuY3JlYXRlRmlsZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgbWFuYWdlbWVudEZpbGVOYW1lLCB0cnVlKTtcclxuICAgICAgICAgICAgdmFyIG91dHB1dFdyaXR0ZW4gPSAkY29yZG92YUZpbGUud3JpdGVFeGlzdGluZ0ZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgYW5ndWxhci50b0pzb24obW5nbW50QXJyKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHZhciBvdXRwdXRFeGlzdHMgPSAkY29yZG92YUZpbGUuY2hlY2tOYW1lKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUpO1xyXG4gICAgICAgIHZhciBvdXRwdXRDcmVhdGVkID0gJGNvcmRvdmFGaWxlLmNyZWF0ZUZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSwgdHJ1ZSk7XHJcbiAgICAgICAgdmFyIG91dHB1dCA9IHsgYWJzb3JiYW5jZXM6IGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uczogY29uY2VudHJhdGlvbnMsIGNvbmNlbnRyYXRpb25MYWJlbHM6IGNvbmNlbnRyYXRpb25MYWJlbHMsIHdhdmVsZW5ndGg6IHdhdmVsZW5ndGggfVxyXG4gICAgICAgIG91dHB1dCA9IGFuZ3VsYXIudG9Kc29uKG91dHB1dCk7XHJcbiAgICAgICAgdmFyIG91dHB1dFdyaXR0ZW4gPSAkY29yZG92YUZpbGUud3JpdGVFeGlzdGluZ0ZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSwgb3V0cHV0KTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gb3V0cHV0RGF0YUZpbGUoZmlsZU5hbWUpIHtcclxuICAgICAgICB2YXIgZnVsbEZpbGVOYW1lID0gZ2V0RnVsbE5hbWUoZmlsZU5hbWUsIGZhbHNlKTtcclxuICAgICAgICB2YXIgZGF0YSA9IHsgYWJzb3JiYW5jZXM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIGNvbmNlbnRyYXRpb25MYWJlbHM6IFtdLCBzdGF0dXM6IDAgfTtcclxuICAgICAgICB2YXIgb3V0cHV0RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICBvdXRwdXRFeGlzdHMudGhlbihmdW5jdGlvbiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICB2YXIgZmlsZVJlYWQgPSAkY29yZG92YUZpbGUucmVhZEFzVGV4dChjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICAgICAgZmlsZVJlYWQudGhlbihmdW5jdGlvbiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgZGF0YSA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7IH0pO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGlucHV0TlZEKHdhdmVsZW5ndGhzLCBhYnNvcmJhbmNlcylcclxuICAgIHtcclxuICAgICAgICB2YXIgb3V0cHV0T2JqID0gW107XHJcbiAgICAgICAgdmFyIG51bVdhdmVsZW5ndGhzID0gd2F2ZWxlbmd0aHMubGVuZ3RoO1xyXG4gICAgICAgIHZhciBudW1BYnNvcmJhbmNlcyA9IGFic29yYmFuY2VzLmxlbmd0aDtcclxuICAgICAgICBpZihudW1XYXZlbGVuZ3RocyE9bnVtQWJzb3JiYW5jZXMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtV2F2ZWxlbmd0aHM7KytpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdmFyIG5ld09iaiA9IHtcclxuICAgICAgICAgICAgICAgIFwia2V5XCI6e30sXHJcbiAgICAgICAgICAgICAgICBcInZhbHVlXCI6e1wieFwiOndhdmVsZW5ndGhzW2ldLCBcInlcIjphYnNvcmJhbmNlc1tpXX1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgb3V0cHV0T2JqW2ldPW5ld09iajtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIGZ1bGxGaWxlTmFtZSA9IFwibnZkRHVtcC5wbWlyXCI7XHJcbiAgICAgICAgdmFyIGR1bXBFeGlzdHMgPSAkY29yZG92YUZpbGUuY2hlY2tOYW1lKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUpO1xyXG4gICAgICAgIHZhciBkdW1wRmlsZUNyZWF0ZWQgPSAkY29yZG92YUZpbGUuY3JlYXRlRmlsZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgbWFuYWdlbWVudEZpbGVOYW1lLCB0cnVlKTtcclxuICAgICAgICB2YXIgb3V0cHV0V3JpdHRlbiA9ICRjb3Jkb3ZhRmlsZS53cml0ZUV4aXN0aW5nRmlsZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lLCBvdXRwdXRPYmopO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRhdGFiYXNlVGVzdCgpIHtcclxuICAgICAgICB2YXIgYWJzb3JiID0gWzEsIC0zLCAyLCA2LCA4LCAzLCAtMl07XHJcbiAgICAgICAgdmFyIGNvbmMgPSBbMSwgMSwgMSwgMCwgLTFdO1xyXG4gICAgICAgIHZhciBsYWJsZXMgPSBbXCJhXCIsIFwiYlwiLCBcImNcIiwgXCJkXCIsIFwiZVwiXTtcclxuICAgICAgICB2YXIgd2F2ZSA9IFsyLCA0LCA2LCA4LCAxMCwgMTIsIDE0XTtcclxuICAgICAgICBpbnB1dERhdGFGaWxlKGFic29yYiwgY29uYywgbGFibGVzLCB3YXZlLCBcInRlc3RcIik7XHJcbiAgICAgICAgdmFyIG91dHB1dCA9IG91dHB1dERhdGFGaWxlKFwidGVzdFwiKTtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHtpbnB1dE1vZGVsOiBpbnB1dE1vZGVsLCBvdXRwdXRNb2RlbDogb3V0cHV0TW9kZWwsIGlucHV0RGF0YUZpbGU6IGlucHV0RGF0YUZpbGUsIG91dHB1dERhdGFGaWxlOiBvdXRwdXREYXRhRmlsZSwgbGlzdEVudHJpZXM6bGlzdEVudHJpZXMsIGlucHV0TlZEOmlucHV0TlZEfTtcclxufSk7IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvQ2hvbGVza3lEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBDaG9sZXNreURlY29tcG9zaXRpb24odmFsdWUpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQ2hvbGVza3lEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IENob2xlc2t5RGVjb21wb3NpdGlvbih2YWx1ZSk7XG4gICAgfVxuICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcbiAgICBpZiAoIXZhbHVlLmlzU3ltbWV0cmljKCkpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGlzIG5vdCBzeW1tZXRyaWMnKTtcblxuICAgIHZhciBhID0gdmFsdWUsXG4gICAgICAgIGRpbWVuc2lvbiA9IGEucm93cyxcbiAgICAgICAgbCA9IG5ldyBNYXRyaXgoZGltZW5zaW9uLCBkaW1lbnNpb24pLFxuICAgICAgICBwb3NpdGl2ZURlZmluaXRlID0gdHJ1ZSxcbiAgICAgICAgaSwgaiwgaztcblxuICAgIGZvciAoaiA9IDA7IGogPCBkaW1lbnNpb247IGorKykge1xuICAgICAgICB2YXIgTHJvd2ogPSBsW2pdO1xuICAgICAgICB2YXIgZCA9IDA7XG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBqOyBrKyspIHtcbiAgICAgICAgICAgIHZhciBMcm93ayA9IGxba107XG4gICAgICAgICAgICB2YXIgcyA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgazsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcyArPSBMcm93a1tpXSAqIExyb3dqW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgTHJvd2pba10gPSBzID0gKGFbal1ba10gLSBzKSAvIGxba11ba107XG4gICAgICAgICAgICBkID0gZCArIHMgKiBzO1xuICAgICAgICB9XG5cbiAgICAgICAgZCA9IGFbal1bal0gLSBkO1xuXG4gICAgICAgIHBvc2l0aXZlRGVmaW5pdGUgJj0gKGQgPiAwKTtcbiAgICAgICAgbFtqXVtqXSA9IE1hdGguc3FydChNYXRoLm1heChkLCAwKSk7XG4gICAgICAgIGZvciAoayA9IGogKyAxOyBrIDwgZGltZW5zaW9uOyBrKyspIHtcbiAgICAgICAgICAgIGxbal1ba10gPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFwb3NpdGl2ZURlZmluaXRlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGlzIG5vdCBwb3NpdGl2ZSBkZWZpbml0ZScpO1xuICAgIH1cblxuICAgIHRoaXMuTCA9IGw7XG59XG5cbkNob2xlc2t5RGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgZ2V0IGxvd2VyVHJpYW5ndWxhck1hdHJpeCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTDtcbiAgICB9LFxuICAgIHNvbHZlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgICAgIHZhciBsID0gdGhpcy5MLFxuICAgICAgICAgICAgZGltZW5zaW9uID0gbC5yb3dzO1xuXG4gICAgICAgIGlmICh2YWx1ZS5yb3dzICE9PSBkaW1lbnNpb24pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGRpbWVuc2lvbnMgZG8gbm90IG1hdGNoJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY291bnQgPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICAgICAgQiA9IHZhbHVlLmNsb25lKCksXG4gICAgICAgICAgICBpLCBqLCBrO1xuXG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBkaW1lbnNpb247IGsrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgazsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEJba11bal0gLT0gQltpXVtqXSAqIGxba11baV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIEJba11bal0gLz0gbFtrXVtrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoayA9IGRpbWVuc2lvbiAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgZGltZW5zaW9uOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgQltrXVtqXSAtPSBCW2ldW2pdICogbFtpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgQltrXVtqXSAvPSBsW2tdW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIEI7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDaG9sZXNreURlY29tcG9zaXRpb247XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG52YXIgaHlwb3RlbnVzZSA9IHV0aWwuaHlwb3RlbnVzZTtcbnZhciBnZXRGaWxsZWQyREFycmF5ID0gdXRpbC5nZXRGaWxsZWQyREFycmF5O1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbHV0enJvZWRlci9NYXBhY2svYmxvYi9tYXN0ZXIvU291cmNlL0VpZ2VudmFsdWVEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbihtYXRyaXgpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRWlnZW52YWx1ZURlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgRWlnZW52YWx1ZURlY29tcG9zaXRpb24obWF0cml4KTtcbiAgICB9XG4gICAgbWF0cml4ID0gTWF0cml4LmNoZWNrTWF0cml4KG1hdHJpeCk7XG4gICAgaWYgKCFtYXRyaXguaXNTcXVhcmUoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBpcyBub3QgYSBzcXVhcmUgbWF0cml4Jyk7XG4gICAgfVxuXG4gICAgdmFyIG4gPSBtYXRyaXguY29sdW1ucyxcbiAgICAgICAgViA9IGdldEZpbGxlZDJEQXJyYXkobiwgbiwgMCksXG4gICAgICAgIGQgPSBuZXcgQXJyYXkobiksXG4gICAgICAgIGUgPSBuZXcgQXJyYXkobiksXG4gICAgICAgIHZhbHVlID0gbWF0cml4LFxuICAgICAgICBpLCBqO1xuXG4gICAgaWYgKG1hdHJpeC5pc1N5bW1ldHJpYygpKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gdmFsdWVbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdHJlZDIobiwgZSwgZCwgVik7XG4gICAgICAgIHRxbDIobiwgZSwgZCwgVik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgSCA9IGdldEZpbGxlZDJEQXJyYXkobiwgbiwgMCksXG4gICAgICAgICAgICBvcnQgPSBuZXcgQXJyYXkobik7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBIW2ldW2pdID0gdmFsdWVbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgb3J0aGVzKG4sIEgsIG9ydCwgVik7XG4gICAgICAgIGhxcjIobiwgZSwgZCwgViwgSCk7XG4gICAgfVxuXG4gICAgdGhpcy5uID0gbjtcbiAgICB0aGlzLmUgPSBlO1xuICAgIHRoaXMuZCA9IGQ7XG4gICAgdGhpcy5WID0gVjtcbn1cblxuRWlnZW52YWx1ZURlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIGdldCByZWFsRWlnZW52YWx1ZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmQ7XG4gICAgfSxcbiAgICBnZXQgaW1hZ2luYXJ5RWlnZW52YWx1ZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmU7XG4gICAgfSxcbiAgICBnZXQgZWlnZW52ZWN0b3JNYXRyaXgoKSB7XG4gICAgICAgIGlmICghTWF0cml4LmlzTWF0cml4KHRoaXMuVikpIHtcbiAgICAgICAgICAgIHRoaXMuViA9IG5ldyBNYXRyaXgodGhpcy5WKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5WO1xuICAgIH0sXG4gICAgZ2V0IGRpYWdvbmFsTWF0cml4KCkge1xuICAgICAgICB2YXIgbiA9IHRoaXMubixcbiAgICAgICAgICAgIGUgPSB0aGlzLmUsXG4gICAgICAgICAgICBkID0gdGhpcy5kLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgobiwgbiksXG4gICAgICAgICAgICBpLCBqO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBYW2ldW2ldID0gZFtpXTtcbiAgICAgICAgICAgIGlmIChlW2ldID4gMCkge1xuICAgICAgICAgICAgICAgIFhbaV1baSArIDFdID0gZVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGVbaV0gPCAwKSB7XG4gICAgICAgICAgICAgICAgWFtpXVtpIC0gMV0gPSBlW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIHRyZWQyKG4sIGUsIGQsIFYpIHtcblxuICAgIHZhciBmLCBnLCBoLCBpLCBqLCBrLFxuICAgICAgICBoaCwgc2NhbGU7XG5cbiAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgIGRbal0gPSBWW24gLSAxXVtqXTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSBuIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgICBzY2FsZSA9IDA7XG4gICAgICAgIGggPSAwO1xuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgaTsgaysrKSB7XG4gICAgICAgICAgICBzY2FsZSA9IHNjYWxlICsgTWF0aC5hYnMoZFtrXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2NhbGUgPT09IDApIHtcbiAgICAgICAgICAgIGVbaV0gPSBkW2kgLSAxXTtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBkW2pdID0gVltpIC0gMV1bal07XG4gICAgICAgICAgICAgICAgVltpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgVltqXVtpXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgaTsgaysrKSB7XG4gICAgICAgICAgICAgICAgZFtrXSAvPSBzY2FsZTtcbiAgICAgICAgICAgICAgICBoICs9IGRba10gKiBkW2tdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmID0gZFtpIC0gMV07XG4gICAgICAgICAgICBnID0gTWF0aC5zcXJ0KGgpO1xuICAgICAgICAgICAgaWYgKGYgPiAwKSB7XG4gICAgICAgICAgICAgICAgZyA9IC1nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlW2ldID0gc2NhbGUgKiBnO1xuICAgICAgICAgICAgaCA9IGggLSBmICogZztcbiAgICAgICAgICAgIGRbaSAtIDFdID0gZiAtIGc7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZVtqXSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmID0gZFtqXTtcbiAgICAgICAgICAgICAgICBWW2pdW2ldID0gZjtcbiAgICAgICAgICAgICAgICBnID0gZVtqXSArIFZbal1bal0gKiBmO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IGogKyAxOyBrIDw9IGkgLSAxOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZyArPSBWW2tdW2pdICogZFtrXTtcbiAgICAgICAgICAgICAgICAgICAgZVtrXSArPSBWW2tdW2pdICogZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZVtqXSA9IGc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGYgPSAwO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGVbal0gLz0gaDtcbiAgICAgICAgICAgICAgICBmICs9IGVbal0gKiBkW2pdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBoaCA9IGYgLyAoaCArIGgpO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGVbal0gLT0gaGggKiBkW2pdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZiA9IGRbal07XG4gICAgICAgICAgICAgICAgZyA9IGVbal07XG4gICAgICAgICAgICAgICAgZm9yIChrID0gajsgayA8PSBpIC0gMTsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZba11bal0gLT0gKGYgKiBlW2tdICsgZyAqIGRba10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkW2pdID0gVltpIC0gMV1bal07XG4gICAgICAgICAgICAgICAgVltpXVtqXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZFtpXSA9IGg7XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG4gLSAxOyBpKyspIHtcbiAgICAgICAgVltuIC0gMV1baV0gPSBWW2ldW2ldO1xuICAgICAgICBWW2ldW2ldID0gMTtcbiAgICAgICAgaCA9IGRbaSArIDFdO1xuICAgICAgICBpZiAoaCAhPT0gMCkge1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICBkW2tdID0gVltrXVtpICsgMV0gLyBoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDw9IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGcgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPD0gaTsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIGcgKz0gVltrXVtpICsgMV0gKiBWW2tdW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDw9IGk7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBWW2tdW2pdIC09IGcgKiBkW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoayA9IDA7IGsgPD0gaTsgaysrKSB7XG4gICAgICAgICAgICBWW2tdW2kgKyAxXSA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgIGRbal0gPSBWW24gLSAxXVtqXTtcbiAgICAgICAgVltuIC0gMV1bal0gPSAwO1xuICAgIH1cblxuICAgIFZbbiAtIDFdW24gLSAxXSA9IDE7XG4gICAgZVswXSA9IDA7XG59XG5cbmZ1bmN0aW9uIHRxbDIobiwgZSwgZCwgVikge1xuXG4gICAgdmFyIGcsIGgsIGksIGosIGssIGwsIG0sIHAsIHIsXG4gICAgICAgIGRsMSwgYywgYzIsIGMzLCBlbDEsIHMsIHMyLFxuICAgICAgICBpdGVyO1xuXG4gICAgZm9yIChpID0gMTsgaSA8IG47IGkrKykge1xuICAgICAgICBlW2kgLSAxXSA9IGVbaV07XG4gICAgfVxuXG4gICAgZVtuIC0gMV0gPSAwO1xuXG4gICAgdmFyIGYgPSAwLFxuICAgICAgICB0c3QxID0gMCxcbiAgICAgICAgZXBzID0gTWF0aC5wb3coMiwgLTUyKTtcblxuICAgIGZvciAobCA9IDA7IGwgPCBuOyBsKyspIHtcbiAgICAgICAgdHN0MSA9IE1hdGgubWF4KHRzdDEsIE1hdGguYWJzKGRbbF0pICsgTWF0aC5hYnMoZVtsXSkpO1xuICAgICAgICBtID0gbDtcbiAgICAgICAgd2hpbGUgKG0gPCBuKSB7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoZVttXSkgPD0gZXBzICogdHN0MSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbSsrO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gPiBsKSB7XG4gICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBpdGVyID0gaXRlciArIDE7XG5cbiAgICAgICAgICAgICAgICBnID0gZFtsXTtcbiAgICAgICAgICAgICAgICBwID0gKGRbbCArIDFdIC0gZykgLyAoMiAqIGVbbF0pO1xuICAgICAgICAgICAgICAgIHIgPSBoeXBvdGVudXNlKHAsIDEpO1xuICAgICAgICAgICAgICAgIGlmIChwIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICByID0gLXI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZFtsXSA9IGVbbF0gLyAocCArIHIpO1xuICAgICAgICAgICAgICAgIGRbbCArIDFdID0gZVtsXSAqIChwICsgcik7XG4gICAgICAgICAgICAgICAgZGwxID0gZFtsICsgMV07XG4gICAgICAgICAgICAgICAgaCA9IGcgLSBkW2xdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGwgKyAyOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGRbaV0gLT0gaDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmID0gZiArIGg7XG5cbiAgICAgICAgICAgICAgICBwID0gZFttXTtcbiAgICAgICAgICAgICAgICBjID0gMTtcbiAgICAgICAgICAgICAgICBjMiA9IGM7XG4gICAgICAgICAgICAgICAgYzMgPSBjO1xuICAgICAgICAgICAgICAgIGVsMSA9IGVbbCArIDFdO1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIHMyID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBtIC0gMTsgaSA+PSBsOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgYzMgPSBjMjtcbiAgICAgICAgICAgICAgICAgICAgYzIgPSBjO1xuICAgICAgICAgICAgICAgICAgICBzMiA9IHM7XG4gICAgICAgICAgICAgICAgICAgIGcgPSBjICogZVtpXTtcbiAgICAgICAgICAgICAgICAgICAgaCA9IGMgKiBwO1xuICAgICAgICAgICAgICAgICAgICByID0gaHlwb3RlbnVzZShwLCBlW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgZVtpICsgMV0gPSBzICogcjtcbiAgICAgICAgICAgICAgICAgICAgcyA9IGVbaV0gLyByO1xuICAgICAgICAgICAgICAgICAgICBjID0gcCAvIHI7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBjICogZFtpXSAtIHMgKiBnO1xuICAgICAgICAgICAgICAgICAgICBkW2kgKyAxXSA9IGggKyBzICogKGMgKiBnICsgcyAqIGRbaV0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBuOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGggPSBWW2tdW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZba11baSArIDFdID0gcyAqIFZba11baV0gKyBjICogaDtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZba11baV0gPSBjICogVltrXVtpXSAtIHMgKiBoO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcCA9IC1zICogczIgKiBjMyAqIGVsMSAqIGVbbF0gLyBkbDE7XG4gICAgICAgICAgICAgICAgZVtsXSA9IHMgKiBwO1xuICAgICAgICAgICAgICAgIGRbbF0gPSBjICogcDtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKE1hdGguYWJzKGVbbF0pID4gZXBzICogdHN0MSk7XG4gICAgICAgIH1cbiAgICAgICAgZFtsXSA9IGRbbF0gKyBmO1xuICAgICAgICBlW2xdID0gMDtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgICBrID0gaTtcbiAgICAgICAgcCA9IGRbaV07XG4gICAgICAgIGZvciAoaiA9IGkgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBpZiAoZFtqXSA8IHApIHtcbiAgICAgICAgICAgICAgICBrID0gajtcbiAgICAgICAgICAgICAgICBwID0gZFtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChrICE9PSBpKSB7XG4gICAgICAgICAgICBkW2tdID0gZFtpXTtcbiAgICAgICAgICAgIGRbaV0gPSBwO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIHAgPSBWW2pdW2ldO1xuICAgICAgICAgICAgICAgIFZbal1baV0gPSBWW2pdW2tdO1xuICAgICAgICAgICAgICAgIFZbal1ba10gPSBwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBvcnRoZXMobiwgSCwgb3J0LCBWKSB7XG5cbiAgICB2YXIgbG93ID0gMCxcbiAgICAgICAgaGlnaCA9IG4gLSAxLFxuICAgICAgICBmLCBnLCBoLCBpLCBqLCBtLFxuICAgICAgICBzY2FsZTtcblxuICAgIGZvciAobSA9IGxvdyArIDE7IG0gPD0gaGlnaCAtIDE7IG0rKykge1xuICAgICAgICBzY2FsZSA9IDA7XG4gICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICBzY2FsZSA9IHNjYWxlICsgTWF0aC5hYnMoSFtpXVttIC0gMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNjYWxlICE9PSAwKSB7XG4gICAgICAgICAgICBoID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IGhpZ2g7IGkgPj0gbTsgaS0tKSB7XG4gICAgICAgICAgICAgICAgb3J0W2ldID0gSFtpXVttIC0gMV0gLyBzY2FsZTtcbiAgICAgICAgICAgICAgICBoICs9IG9ydFtpXSAqIG9ydFtpXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZyA9IE1hdGguc3FydChoKTtcbiAgICAgICAgICAgIGlmIChvcnRbbV0gPiAwKSB7XG4gICAgICAgICAgICAgICAgZyA9IC1nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBoID0gaCAtIG9ydFttXSAqIGc7XG4gICAgICAgICAgICBvcnRbbV0gPSBvcnRbbV0gLSBnO1xuXG4gICAgICAgICAgICBmb3IgKGogPSBtOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgZiA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gaGlnaDsgaSA+PSBtOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgZiArPSBvcnRbaV0gKiBIW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGYgPSBmIC8gaDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBtOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2pdIC09IGYgKiBvcnRbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgIGYgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGhpZ2g7IGogPj0gbTsgai0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGYgKz0gb3J0W2pdICogSFtpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmID0gZiAvIGg7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gbTsgaiA8PSBoaWdoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtqXSAtPSBmICogb3J0W2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb3J0W21dID0gc2NhbGUgKiBvcnRbbV07XG4gICAgICAgICAgICBIW21dW20gLSAxXSA9IHNjYWxlICogZztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgVltpXVtqXSA9IChpID09PSBqID8gMSA6IDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChtID0gaGlnaCAtIDE7IG0gPj0gbG93ICsgMTsgbS0tKSB7XG4gICAgICAgIGlmIChIW21dW20gLSAxXSAhPT0gMCkge1xuICAgICAgICAgICAgZm9yIChpID0gbSArIDE7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgb3J0W2ldID0gSFtpXVttIC0gMV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IG07IGogPD0gaGlnaDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZyArPSBvcnRbaV0gKiBWW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGcgPSAoZyAvIG9ydFttXSkgLyBIW21dW20gLSAxXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBtOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBWW2ldW2pdICs9IGcgKiBvcnRbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBocXIyKG5uLCBlLCBkLCBWLCBIKSB7XG4gICAgdmFyIG4gPSBubiAtIDEsXG4gICAgICAgIGxvdyA9IDAsXG4gICAgICAgIGhpZ2ggPSBubiAtIDEsXG4gICAgICAgIGVwcyA9IE1hdGgucG93KDIsIC01MiksXG4gICAgICAgIGV4c2hpZnQgPSAwLFxuICAgICAgICBub3JtID0gMCxcbiAgICAgICAgcCA9IDAsXG4gICAgICAgIHEgPSAwLFxuICAgICAgICByID0gMCxcbiAgICAgICAgcyA9IDAsXG4gICAgICAgIHogPSAwLFxuICAgICAgICBpdGVyID0gMCxcbiAgICAgICAgaSwgaiwgaywgbCwgbSwgdCwgdywgeCwgeSxcbiAgICAgICAgcmEsIHNhLCB2ciwgdmksXG4gICAgICAgIG5vdGxhc3QsIGNkaXZyZXM7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbm47IGkrKykge1xuICAgICAgICBpZiAoaSA8IGxvdyB8fCBpID4gaGlnaCkge1xuICAgICAgICAgICAgZFtpXSA9IEhbaV1baV07XG4gICAgICAgICAgICBlW2ldID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaiA9IE1hdGgubWF4KGkgLSAxLCAwKTsgaiA8IG5uOyBqKyspIHtcbiAgICAgICAgICAgIG5vcm0gPSBub3JtICsgTWF0aC5hYnMoSFtpXVtqXSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB3aGlsZSAobiA+PSBsb3cpIHtcbiAgICAgICAgbCA9IG47XG4gICAgICAgIHdoaWxlIChsID4gbG93KSB7XG4gICAgICAgICAgICBzID0gTWF0aC5hYnMoSFtsIC0gMV1bbCAtIDFdKSArIE1hdGguYWJzKEhbbF1bbF0pO1xuICAgICAgICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgICAgICAgICBzID0gbm9ybTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhIW2xdW2wgLSAxXSkgPCBlcHMgKiBzKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsLS07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobCA9PT0gbikge1xuICAgICAgICAgICAgSFtuXVtuXSA9IEhbbl1bbl0gKyBleHNoaWZ0O1xuICAgICAgICAgICAgZFtuXSA9IEhbbl1bbl07XG4gICAgICAgICAgICBlW25dID0gMDtcbiAgICAgICAgICAgIG4tLTtcbiAgICAgICAgICAgIGl0ZXIgPSAwO1xuICAgICAgICB9IGVsc2UgaWYgKGwgPT09IG4gLSAxKSB7XG4gICAgICAgICAgICB3ID0gSFtuXVtuIC0gMV0gKiBIW24gLSAxXVtuXTtcbiAgICAgICAgICAgIHAgPSAoSFtuIC0gMV1bbiAtIDFdIC0gSFtuXVtuXSkgLyAyO1xuICAgICAgICAgICAgcSA9IHAgKiBwICsgdztcbiAgICAgICAgICAgIHogPSBNYXRoLnNxcnQoTWF0aC5hYnMocSkpO1xuICAgICAgICAgICAgSFtuXVtuXSA9IEhbbl1bbl0gKyBleHNoaWZ0O1xuICAgICAgICAgICAgSFtuIC0gMV1bbiAtIDFdID0gSFtuIC0gMV1bbiAtIDFdICsgZXhzaGlmdDtcbiAgICAgICAgICAgIHggPSBIW25dW25dO1xuXG4gICAgICAgICAgICBpZiAocSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeiA9IChwID49IDApID8gKHAgKyB6KSA6IChwIC0geik7XG4gICAgICAgICAgICAgICAgZFtuIC0gMV0gPSB4ICsgejtcbiAgICAgICAgICAgICAgICBkW25dID0gZFtuIC0gMV07XG4gICAgICAgICAgICAgICAgaWYgKHogIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZFtuXSA9IHggLSB3IC8gejtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZVtuIC0gMV0gPSAwO1xuICAgICAgICAgICAgICAgIGVbbl0gPSAwO1xuICAgICAgICAgICAgICAgIHggPSBIW25dW24gLSAxXTtcbiAgICAgICAgICAgICAgICBzID0gTWF0aC5hYnMoeCkgKyBNYXRoLmFicyh6KTtcbiAgICAgICAgICAgICAgICBwID0geCAvIHM7XG4gICAgICAgICAgICAgICAgcSA9IHogLyBzO1xuICAgICAgICAgICAgICAgIHIgPSBNYXRoLnNxcnQocCAqIHAgKyBxICogcSk7XG4gICAgICAgICAgICAgICAgcCA9IHAgLyByO1xuICAgICAgICAgICAgICAgIHEgPSBxIC8gcjtcblxuICAgICAgICAgICAgICAgIGZvciAoaiA9IG4gLSAxOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgICAgICAgICB6ID0gSFtuIC0gMV1bal07XG4gICAgICAgICAgICAgICAgICAgIEhbbiAtIDFdW2pdID0gcSAqIHogKyBwICogSFtuXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgSFtuXVtqXSA9IHEgKiBIW25dW2pdIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IEhbaV1bbiAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBIW2ldW24gLSAxXSA9IHEgKiB6ICsgcCAqIEhbaV1bbl07XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSBxICogSFtpXVtuXSAtIHAgKiB6O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IFZbaV1bbiAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBWW2ldW24gLSAxXSA9IHEgKiB6ICsgcCAqIFZbaV1bbl07XG4gICAgICAgICAgICAgICAgICAgIFZbaV1bbl0gPSBxICogVltpXVtuXSAtIHAgKiB6O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZFtuIC0gMV0gPSB4ICsgcDtcbiAgICAgICAgICAgICAgICBkW25dID0geCArIHA7XG4gICAgICAgICAgICAgICAgZVtuIC0gMV0gPSB6O1xuICAgICAgICAgICAgICAgIGVbbl0gPSAtejtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbiA9IG4gLSAyO1xuICAgICAgICAgICAgaXRlciA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB4ID0gSFtuXVtuXTtcbiAgICAgICAgICAgIHkgPSAwO1xuICAgICAgICAgICAgdyA9IDA7XG4gICAgICAgICAgICBpZiAobCA8IG4pIHtcbiAgICAgICAgICAgICAgICB5ID0gSFtuIC0gMV1bbiAtIDFdO1xuICAgICAgICAgICAgICAgIHcgPSBIW25dW24gLSAxXSAqIEhbbiAtIDFdW25dO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlciA9PT0gMTApIHtcbiAgICAgICAgICAgICAgICBleHNoaWZ0ICs9IHg7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2ldIC09IHg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgPSBNYXRoLmFicyhIW25dW24gLSAxXSkgKyBNYXRoLmFicyhIW24gLSAxXVtuIC0gMl0pO1xuICAgICAgICAgICAgICAgIHggPSB5ID0gMC43NSAqIHM7XG4gICAgICAgICAgICAgICAgdyA9IC0wLjQzNzUgKiBzICogcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGl0ZXIgPT09IDMwKSB7XG4gICAgICAgICAgICAgICAgcyA9ICh5IC0geCkgLyAyO1xuICAgICAgICAgICAgICAgIHMgPSBzICogcyArIHc7XG4gICAgICAgICAgICAgICAgaWYgKHMgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgPSBNYXRoLnNxcnQocyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh5IDwgeCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcyA9IC1zO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHMgPSB4IC0gdyAvICgoeSAtIHgpIC8gMiArIHMpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2ldIC09IHM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZXhzaGlmdCArPSBzO1xuICAgICAgICAgICAgICAgICAgICB4ID0geSA9IHcgPSAwLjk2NDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGl0ZXIgPSBpdGVyICsgMTtcblxuICAgICAgICAgICAgbSA9IG4gLSAyO1xuICAgICAgICAgICAgd2hpbGUgKG0gPj0gbCkge1xuICAgICAgICAgICAgICAgIHogPSBIW21dW21dO1xuICAgICAgICAgICAgICAgIHIgPSB4IC0gejtcbiAgICAgICAgICAgICAgICBzID0geSAtIHo7XG4gICAgICAgICAgICAgICAgcCA9IChyICogcyAtIHcpIC8gSFttICsgMV1bbV0gKyBIW21dW20gKyAxXTtcbiAgICAgICAgICAgICAgICBxID0gSFttICsgMV1bbSArIDFdIC0geiAtIHIgLSBzO1xuICAgICAgICAgICAgICAgIHIgPSBIW20gKyAyXVttICsgMV07XG4gICAgICAgICAgICAgICAgcyA9IE1hdGguYWJzKHApICsgTWF0aC5hYnMocSkgKyBNYXRoLmFicyhyKTtcbiAgICAgICAgICAgICAgICBwID0gcCAvIHM7XG4gICAgICAgICAgICAgICAgcSA9IHEgLyBzO1xuICAgICAgICAgICAgICAgIHIgPSByIC8gcztcbiAgICAgICAgICAgICAgICBpZiAobSA9PT0gbCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKEhbbV1bbSAtIDFdKSAqIChNYXRoLmFicyhxKSArIE1hdGguYWJzKHIpKSA8IGVwcyAqIChNYXRoLmFicyhwKSAqIChNYXRoLmFicyhIW20gLSAxXVttIC0gMV0pICsgTWF0aC5hYnMoeikgKyBNYXRoLmFicyhIW20gKyAxXVttICsgMV0pKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG0tLTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChpID0gbSArIDI7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgSFtpXVtpIC0gMl0gPSAwO1xuICAgICAgICAgICAgICAgIGlmIChpID4gbSArIDIpIHtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtpIC0gM10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChrID0gbTsgayA8PSBuIC0gMTsgaysrKSB7XG4gICAgICAgICAgICAgICAgbm90bGFzdCA9IChrICE9PSBuIC0gMSk7XG4gICAgICAgICAgICAgICAgaWYgKGsgIT09IG0pIHtcbiAgICAgICAgICAgICAgICAgICAgcCA9IEhba11bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBxID0gSFtrICsgMV1bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICByID0gKG5vdGxhc3QgPyBIW2sgKyAyXVtrIC0gMV0gOiAwKTtcbiAgICAgICAgICAgICAgICAgICAgeCA9IE1hdGguYWJzKHApICsgTWF0aC5hYnMocSkgKyBNYXRoLmFicyhyKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHggIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwIC8geDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEgPSBxIC8geDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHIgPSByIC8geDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHMgPSBNYXRoLnNxcnQocCAqIHAgKyBxICogcSArIHIgKiByKTtcbiAgICAgICAgICAgICAgICBpZiAocCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcyA9IC1zO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChrICE9PSBtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2tdW2sgLSAxXSA9IC1zICogeDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChsICE9PSBtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2tdW2sgLSAxXSA9IC1IW2tdW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHAgPSBwICsgcztcbiAgICAgICAgICAgICAgICAgICAgeCA9IHAgLyBzO1xuICAgICAgICAgICAgICAgICAgICB5ID0gcSAvIHM7XG4gICAgICAgICAgICAgICAgICAgIHogPSByIC8gcztcbiAgICAgICAgICAgICAgICAgICAgcSA9IHEgLyBwO1xuICAgICAgICAgICAgICAgICAgICByID0gciAvIHA7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IG5uOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBIW2tdW2pdICsgcSAqIEhbayArIDFdW2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vdGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwID0gcCArIHIgKiBIW2sgKyAyXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2sgKyAyXVtqXSA9IEhbayArIDJdW2pdIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIEhba11bal0gPSBIW2tdW2pdIC0gcCAqIHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2sgKyAxXVtqXSA9IEhbayArIDFdW2pdIC0gcCAqIHk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IE1hdGgubWluKG4sIGsgKyAzKTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwID0geCAqIEhbaV1ba10gKyB5ICogSFtpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm90bGFzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwICsgeiAqIEhbaV1bayArIDJdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bayArIDJdID0gSFtpXVtrICsgMl0gLSBwICogcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtrXSA9IEhbaV1ba10gLSBwO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtrICsgMV0gPSBIW2ldW2sgKyAxXSAtIHAgKiBxO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHggKiBWW2ldW2tdICsgeSAqIFZbaV1bayArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vdGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwID0gcCArIHogKiBWW2ldW2sgKyAyXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2sgKyAyXSA9IFZbaV1bayArIDJdIC0gcCAqIHI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1ba10gPSBWW2ldW2tdIC0gcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bayArIDFdID0gVltpXVtrICsgMV0gLSBwICogcTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChub3JtID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKG4gPSBubiAtIDE7IG4gPj0gMDsgbi0tKSB7XG4gICAgICAgIHAgPSBkW25dO1xuICAgICAgICBxID0gZVtuXTtcblxuICAgICAgICBpZiAocSA9PT0gMCkge1xuICAgICAgICAgICAgbCA9IG47XG4gICAgICAgICAgICBIW25dW25dID0gMTtcbiAgICAgICAgICAgIGZvciAoaSA9IG4gLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHcgPSBIW2ldW2ldIC0gcDtcbiAgICAgICAgICAgICAgICByID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBsOyBqIDw9IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICByID0gciArIEhbaV1bal0gKiBIW2pdW25dO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChlW2ldIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB6ID0gdztcbiAgICAgICAgICAgICAgICAgICAgcyA9IHI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlW2ldID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW25dID0gKHcgIT09IDApID8gKC1yIC8gdykgOiAoLXIgLyAoZXBzICogbm9ybSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgeCA9IEhbaV1baSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgeSA9IEhbaSArIDFdW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgcSA9IChkW2ldIC0gcCkgKiAoZFtpXSAtIHApICsgZVtpXSAqIGVbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICB0ID0gKHggKiBzIC0geiAqIHIpIC8gcTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbl0gPSAoTWF0aC5hYnMoeCkgPiBNYXRoLmFicyh6KSkgPyAoKC1yIC0gdyAqIHQpIC8geCkgOiAoKC1zIC0geSAqIHQpIC8geik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0ID0gTWF0aC5hYnMoSFtpXVtuXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoZXBzICogdCkgKiB0ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8PSBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2pdW25dID0gSFtqXVtuXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocSA8IDApIHtcbiAgICAgICAgICAgIGwgPSBuIC0gMTtcblxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKEhbbl1bbiAtIDFdKSA+IE1hdGguYWJzKEhbbiAtIDFdW25dKSkge1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW24gLSAxXSA9IHEgLyBIW25dW24gLSAxXTtcbiAgICAgICAgICAgICAgICBIW24gLSAxXVtuXSA9IC0oSFtuXVtuXSAtIHApIC8gSFtuXVtuIC0gMV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNkaXZyZXMgPSBjZGl2KDAsIC1IW24gLSAxXVtuXSwgSFtuIC0gMV1bbiAtIDFdIC0gcCwgcSk7XG4gICAgICAgICAgICAgICAgSFtuIC0gMV1bbiAtIDFdID0gY2RpdnJlc1swXTtcbiAgICAgICAgICAgICAgICBIW24gLSAxXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEhbbl1bbiAtIDFdID0gMDtcbiAgICAgICAgICAgIEhbbl1bbl0gPSAxO1xuICAgICAgICAgICAgZm9yIChpID0gbiAtIDI7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgcmEgPSAwO1xuICAgICAgICAgICAgICAgIHNhID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBsOyBqIDw9IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICByYSA9IHJhICsgSFtpXVtqXSAqIEhbal1bbiAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBzYSA9IHNhICsgSFtpXVtqXSAqIEhbal1bbl07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdyA9IEhbaV1baV0gLSBwO1xuXG4gICAgICAgICAgICAgICAgaWYgKGVbaV0gPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSB3O1xuICAgICAgICAgICAgICAgICAgICByID0gcmE7XG4gICAgICAgICAgICAgICAgICAgIHMgPSBzYTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNkaXZyZXMgPSBjZGl2KC1yYSwgLXNhLCB3LCBxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbiAtIDFdID0gY2RpdnJlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSBjZGl2cmVzWzFdO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgeCA9IEhbaV1baSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgeSA9IEhbaSArIDFdW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgdnIgPSAoZFtpXSAtIHApICogKGRbaV0gLSBwKSArIGVbaV0gKiBlW2ldIC0gcSAqIHE7XG4gICAgICAgICAgICAgICAgICAgICAgICB2aSA9IChkW2ldIC0gcCkgKiAyICogcTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ciA9PT0gMCAmJiB2aSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZyID0gZXBzICogbm9ybSAqIChNYXRoLmFicyh3KSArIE1hdGguYWJzKHEpICsgTWF0aC5hYnMoeCkgKyBNYXRoLmFicyh5KSArIE1hdGguYWJzKHopKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNkaXZyZXMgPSBjZGl2KHggKiByIC0geiAqIHJhICsgcSAqIHNhLCB4ICogcyAtIHogKiBzYSAtIHEgKiByYSwgdnIsIHZpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbiAtIDFdID0gY2RpdnJlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSBjZGl2cmVzWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKHgpID4gKE1hdGguYWJzKHopICsgTWF0aC5hYnMocSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbiAtIDFdID0gKC1yYSAtIHcgKiBIW2ldW24gLSAxXSArIHEgKiBIW2ldW25dKSAvIHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbl0gPSAoLXNhIC0gdyAqIEhbaV1bbl0gLSBxICogSFtpXVtuIC0gMV0pIC8geDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoLXIgLSB5ICogSFtpXVtuIC0gMV0sIC1zIC0geSAqIEhbaV1bbl0sIHosIHEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbaSArIDFdW24gLSAxXSA9IGNkaXZyZXNbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbl0gPSBjZGl2cmVzWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdCA9IE1hdGgubWF4KE1hdGguYWJzKEhbaV1bbiAtIDFdKSwgTWF0aC5hYnMoSFtpXVtuXSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGVwcyAqIHQpICogdCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtqXVtuIC0gMV0gPSBIW2pdW24gLSAxXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtqXVtuXSA9IEhbal1bbl0gLyB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG5uOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPCBsb3cgfHwgaSA+IGhpZ2gpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCBubjsgaisrKSB7XG4gICAgICAgICAgICAgICAgVltpXVtqXSA9IEhbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGogPSBubiAtIDE7IGogPj0gbG93OyBqLS0pIHtcbiAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgeiA9IDA7XG4gICAgICAgICAgICBmb3IgKGsgPSBsb3c7IGsgPD0gTWF0aC5taW4oaiwgaGlnaCk7IGsrKykge1xuICAgICAgICAgICAgICAgIHogPSB6ICsgVltpXVtrXSAqIEhba11bal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBWW2ldW2pdID0gejtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY2Rpdih4ciwgeGksIHlyLCB5aSkge1xuICAgIHZhciByLCBkO1xuICAgIGlmIChNYXRoLmFicyh5cikgPiBNYXRoLmFicyh5aSkpIHtcbiAgICAgICAgciA9IHlpIC8geXI7XG4gICAgICAgIGQgPSB5ciArIHIgKiB5aTtcbiAgICAgICAgcmV0dXJuIFsoeHIgKyByICogeGkpIC8gZCwgKHhpIC0gciAqIHhyKSAvIGRdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgciA9IHlyIC8geWk7XG4gICAgICAgIGQgPSB5aSArIHIgKiB5cjtcbiAgICAgICAgcmV0dXJuIFsociAqIHhyICsgeGkpIC8gZCwgKHIgKiB4aSAtIHhyKSAvIGRdO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbHV0enJvZWRlci9NYXBhY2svYmxvYi9tYXN0ZXIvU291cmNlL0x1RGVjb21wb3NpdGlvbi5jc1xuZnVuY3Rpb24gTHVEZWNvbXBvc2l0aW9uKG1hdHJpeCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBMdURlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgTHVEZWNvbXBvc2l0aW9uKG1hdHJpeCk7XG4gICAgfVxuICAgIG1hdHJpeCA9IE1hdHJpeC5jaGVja01hdHJpeChtYXRyaXgpO1xuXG4gICAgdmFyIGx1ID0gbWF0cml4LmNsb25lKCksXG4gICAgICAgIHJvd3MgPSBsdS5yb3dzLFxuICAgICAgICBjb2x1bW5zID0gbHUuY29sdW1ucyxcbiAgICAgICAgcGl2b3RWZWN0b3IgPSBuZXcgQXJyYXkocm93cyksXG4gICAgICAgIHBpdm90U2lnbiA9IDEsXG4gICAgICAgIGksIGosIGssIHAsIHMsIHQsIHYsXG4gICAgICAgIExVcm93aSwgTFVjb2xqLCBrbWF4O1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICBwaXZvdFZlY3RvcltpXSA9IGk7XG4gICAgfVxuXG4gICAgTFVjb2xqID0gbmV3IEFycmF5KHJvd3MpO1xuXG4gICAgZm9yIChqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIExVY29saltpXSA9IGx1W2ldW2pdO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgTFVyb3dpID0gbHVbaV07XG4gICAgICAgICAgICBrbWF4ID0gTWF0aC5taW4oaSwgaik7XG4gICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBrbWF4OyBrKyspIHtcbiAgICAgICAgICAgICAgICBzICs9IExVcm93aVtrXSAqIExVY29saltrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIExVcm93aVtqXSA9IExVY29saltpXSAtPSBzO1xuICAgICAgICB9XG5cbiAgICAgICAgcCA9IGo7XG4gICAgICAgIGZvciAoaSA9IGogKyAxOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoTFVjb2xqW2ldKSA+IE1hdGguYWJzKExVY29saltwXSkpIHtcbiAgICAgICAgICAgICAgICBwID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwICE9PSBqKSB7XG4gICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sdW1uczsgaysrKSB7XG4gICAgICAgICAgICAgICAgdCA9IGx1W3BdW2tdO1xuICAgICAgICAgICAgICAgIGx1W3BdW2tdID0gbHVbal1ba107XG4gICAgICAgICAgICAgICAgbHVbal1ba10gPSB0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2ID0gcGl2b3RWZWN0b3JbcF07XG4gICAgICAgICAgICBwaXZvdFZlY3RvcltwXSA9IHBpdm90VmVjdG9yW2pdO1xuICAgICAgICAgICAgcGl2b3RWZWN0b3Jbal0gPSB2O1xuXG4gICAgICAgICAgICBwaXZvdFNpZ24gPSAtcGl2b3RTaWduO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGogPCByb3dzICYmIGx1W2pdW2pdICE9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBqICsgMTsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGx1W2ldW2pdIC89IGx1W2pdW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5MVSA9IGx1O1xuICAgIHRoaXMucGl2b3RWZWN0b3IgPSBwaXZvdFZlY3RvcjtcbiAgICB0aGlzLnBpdm90U2lnbiA9IHBpdm90U2lnbjtcbn1cblxuTHVEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBpc1Npbmd1bGFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5MVSxcbiAgICAgICAgICAgIGNvbCA9IGRhdGEuY29sdW1ucztcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2w7IGorKykge1xuICAgICAgICAgICAgaWYgKGRhdGFbal1bal0gPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcbiAgICBnZXQgZGV0ZXJtaW5hbnQoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5MVTtcbiAgICAgICAgaWYgKCFkYXRhLmlzU3F1YXJlKCkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01hdHJpeCBtdXN0IGJlIHNxdWFyZScpO1xuICAgICAgICB2YXIgZGV0ZXJtaW5hbnQgPSB0aGlzLnBpdm90U2lnbiwgY29sID0gZGF0YS5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbDsgaisrKVxuICAgICAgICAgICAgZGV0ZXJtaW5hbnQgKj0gZGF0YVtqXVtqXTtcbiAgICAgICAgcmV0dXJuIGRldGVybWluYW50O1xuICAgIH0sXG4gICAgZ2V0IGxvd2VyVHJpYW5ndWxhck1hdHJpeCgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVLFxuICAgICAgICAgICAgcm93cyA9IGRhdGEucm93cyxcbiAgICAgICAgICAgIGNvbHVtbnMgPSBkYXRhLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSBkYXRhW2ldW2pdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfSxcbiAgICBnZXQgdXBwZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuTFUsXG4gICAgICAgICAgICByb3dzID0gZGF0YS5yb3dzLFxuICAgICAgICAgICAgY29sdW1ucyA9IGRhdGEuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8PSBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSBkYXRhW2ldW2pdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9LFxuICAgIGdldCBwaXZvdFBlcm11dGF0aW9uVmVjdG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5waXZvdFZlY3Rvci5zbGljZSgpO1xuICAgIH0sXG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICAgICAgdmFyIGx1ID0gdGhpcy5MVSxcbiAgICAgICAgICAgIHJvd3MgPSBsdS5yb3dzO1xuXG4gICAgICAgIGlmIChyb3dzICE9PSB2YWx1ZS5yb3dzKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG1hdHJpeCBkaW1lbnNpb25zJyk7XG4gICAgICAgIGlmICh0aGlzLmlzU2luZ3VsYXIoKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTFUgbWF0cml4IGlzIHNpbmd1bGFyJyk7XG5cbiAgICAgICAgdmFyIGNvdW50ID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSB2YWx1ZS5zdWJNYXRyaXhSb3codGhpcy5waXZvdFZlY3RvciwgMCwgY291bnQgLSAxKSxcbiAgICAgICAgICAgIGNvbHVtbnMgPSBsdS5jb2x1bW5zLFxuICAgICAgICAgICAgaSwgaiwgaztcblxuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sdW1uczsgaysrKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IGNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gLT0gWFtrXVtqXSAqIGx1W2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGsgPSBjb2x1bW5zIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgWFtrXVtqXSAvPSBsdVtrXVtrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdIC09IFhba11bal0gKiBsdVtpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBMdURlY29tcG9zaXRpb247XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcbnZhciBoeXBvdGVudXNlID0gcmVxdWlyZSgnLi91dGlsJykuaHlwb3RlbnVzZTtcblxuLy9odHRwczovL2dpdGh1Yi5jb20vbHV0enJvZWRlci9NYXBhY2svYmxvYi9tYXN0ZXIvU291cmNlL1FyRGVjb21wb3NpdGlvbi5jc1xuZnVuY3Rpb24gUXJEZWNvbXBvc2l0aW9uKHZhbHVlKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFFyRGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBRckRlY29tcG9zaXRpb24odmFsdWUpO1xuICAgIH1cbiAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICB2YXIgcXIgPSB2YWx1ZS5jbG9uZSgpLFxuICAgICAgICBtID0gdmFsdWUucm93cyxcbiAgICAgICAgbiA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgIHJkaWFnID0gbmV3IEFycmF5KG4pLFxuICAgICAgICBpLCBqLCBrLCBzO1xuXG4gICAgZm9yIChrID0gMDsgayA8IG47IGsrKykge1xuICAgICAgICB2YXIgbnJtID0gMDtcbiAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgbnJtID0gaHlwb3RlbnVzZShucm0sIHFyW2ldW2tdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobnJtICE9PSAwKSB7XG4gICAgICAgICAgICBpZiAocXJba11ba10gPCAwKSB7XG4gICAgICAgICAgICAgICAgbnJtID0gLW5ybTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBxcltpXVtrXSAvPSBucm07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBxcltrXVtrXSArPSAxO1xuICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gcXJbaV1ba10gKiBxcltpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyA9IC1zIC8gcXJba11ba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBxcltpXVtqXSArPSBzICogcXJbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJkaWFnW2tdID0gLW5ybTtcbiAgICB9XG5cbiAgICB0aGlzLlFSID0gcXI7XG4gICAgdGhpcy5SZGlhZyA9IHJkaWFnO1xufVxuXG5RckRlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIHNvbHZlOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgICAgIHZhciBxciA9IHRoaXMuUVIsXG4gICAgICAgICAgICBtID0gcXIucm93cztcblxuICAgICAgICBpZiAodmFsdWUucm93cyAhPT0gbSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IHJvdyBkaW1lbnNpb25zIG11c3QgYWdyZWUnKTtcbiAgICAgICAgaWYgKCF0aGlzLmlzRnVsbFJhbmsoKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGlzIHJhbmsgZGVmaWNpZW50Jyk7XG5cbiAgICAgICAgdmFyIGNvdW50ID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSB2YWx1ZS5jbG9uZSgpLFxuICAgICAgICAgICAgbiA9IHFyLmNvbHVtbnMsXG4gICAgICAgICAgICBpLCBqLCBrLCBzO1xuXG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBuOyBrKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IHFyW2ldW2tdICogWFtpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyA9IC1zIC8gcXJba11ba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdICs9IHMgKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChrID0gbiAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIFhba11bal0gLz0gdGhpcy5SZGlhZ1trXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdIC09IFhba11bal0gKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gWC5zdWJNYXRyaXgoMCwgbiAtIDEsIDAsIGNvdW50IC0gMSk7XG4gICAgfSxcbiAgICBpc0Z1bGxSYW5rOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjb2x1bW5zID0gdGhpcy5RUi5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMuUmRpYWdbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcbiAgICBnZXQgdXBwZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICB2YXIgcXIgPSB0aGlzLlFSLFxuICAgICAgICAgICAgbiA9IHFyLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChuLCBuKSxcbiAgICAgICAgICAgIGksIGo7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IHFyW2ldW2pdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA9PT0gaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gdGhpcy5SZGlhZ1tpXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfSxcbiAgICBnZXQgb3J0aG9nb25hbE1hdHJpeCgpIHtcbiAgICAgICAgdmFyIHFyID0gdGhpcy5RUixcbiAgICAgICAgICAgIHJvd3MgPSBxci5yb3dzLFxuICAgICAgICAgICAgY29sdW1ucyA9IHFyLmNvbHVtbnMsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKSxcbiAgICAgICAgICAgIGksIGosIGssIHM7XG5cbiAgICAgICAgZm9yIChrID0gY29sdW1ucyAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgWFtpXVtrXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBYW2tdW2tdID0gMTtcbiAgICAgICAgICAgIGZvciAoaiA9IGs7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAocXJba11ba10gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHMgKz0gcXJbaV1ba10gKiBYW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcyA9IC1zIC8gcXJba11ba107XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSArPSBzICogcXJbaV1ba107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBRckRlY29tcG9zaXRpb247XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG52YXIgaHlwb3RlbnVzZSA9IHV0aWwuaHlwb3RlbnVzZTtcbnZhciBnZXRGaWxsZWQyREFycmF5ID0gdXRpbC5nZXRGaWxsZWQyREFycmF5O1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbHV0enJvZWRlci9NYXBhY2svYmxvYi9tYXN0ZXIvU291cmNlL1Npbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbih2YWx1ZSwgb3B0aW9ucykge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbih2YWx1ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgdmFyIG0gPSB2YWx1ZS5yb3dzLFxuICAgICAgICBuID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgbnUgPSBNYXRoLm1pbihtLCBuKTtcblxuICAgIHZhciB3YW50dSA9IHRydWUsIHdhbnR2ID0gdHJ1ZTtcbiAgICBpZiAob3B0aW9ucy5jb21wdXRlTGVmdFNpbmd1bGFyVmVjdG9ycyA9PT0gZmFsc2UpXG4gICAgICAgIHdhbnR1ID0gZmFsc2U7XG4gICAgaWYgKG9wdGlvbnMuY29tcHV0ZVJpZ2h0U2luZ3VsYXJWZWN0b3JzID09PSBmYWxzZSlcbiAgICAgICAgd2FudHYgPSBmYWxzZTtcbiAgICB2YXIgYXV0b1RyYW5zcG9zZSA9IG9wdGlvbnMuYXV0b1RyYW5zcG9zZSA9PT0gdHJ1ZTtcblxuICAgIHZhciBzd2FwcGVkID0gZmFsc2U7XG4gICAgdmFyIGE7XG4gICAgaWYgKG0gPCBuKSB7XG4gICAgICAgIGlmICghYXV0b1RyYW5zcG9zZSkge1xuICAgICAgICAgICAgYSA9IHZhbHVlLmNsb25lKCk7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ0NvbXB1dGluZyBTVkQgb24gYSBtYXRyaXggd2l0aCBtb3JlIGNvbHVtbnMgdGhhbiByb3dzLiBDb25zaWRlciBlbmFibGluZyBhdXRvVHJhbnNwb3NlJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhID0gdmFsdWUudHJhbnNwb3NlKCk7XG4gICAgICAgICAgICBtID0gYS5yb3dzO1xuICAgICAgICAgICAgbiA9IGEuY29sdW1ucztcbiAgICAgICAgICAgIHN3YXBwZWQgPSB0cnVlO1xuICAgICAgICAgICAgdmFyIGF1eCA9IHdhbnR1O1xuICAgICAgICAgICAgd2FudHUgPSB3YW50djtcbiAgICAgICAgICAgIHdhbnR2ID0gYXV4O1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYSA9IHZhbHVlLmNsb25lKCk7XG4gICAgfVxuXG4gICAgdmFyIHMgPSBuZXcgQXJyYXkoTWF0aC5taW4obSArIDEsIG4pKSxcbiAgICAgICAgVSA9IGdldEZpbGxlZDJEQXJyYXkobSwgbnUsIDApLFxuICAgICAgICBWID0gZ2V0RmlsbGVkMkRBcnJheShuLCBuLCAwKSxcbiAgICAgICAgZSA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgd29yayA9IG5ldyBBcnJheShtKTtcblxuICAgIHZhciBuY3QgPSBNYXRoLm1pbihtIC0gMSwgbik7XG4gICAgdmFyIG5ydCA9IE1hdGgubWF4KDAsIE1hdGgubWluKG4gLSAyLCBtKSk7XG5cbiAgICB2YXIgaSwgaiwgaywgcCwgdCwga3MsIGYsIGNzLCBzbiwgbWF4LCBrYXNlLFxuICAgICAgICBzY2FsZSwgc3AsIHNwbTEsIGVwbTEsIHNrLCBlaywgYiwgYywgc2hpZnQsIGc7XG5cbiAgICBmb3IgKGsgPSAwLCBtYXggPSBNYXRoLm1heChuY3QsIG5ydCk7IGsgPCBtYXg7IGsrKykge1xuICAgICAgICBpZiAoayA8IG5jdCkge1xuICAgICAgICAgICAgc1trXSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgc1trXSA9IGh5cG90ZW51c2Uoc1trXSwgYVtpXVtrXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc1trXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGlmIChhW2tdW2tdIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzW2tdID0gLXNba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYVtpXVtrXSAvPSBzW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhW2tdW2tdICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzW2tdID0gLXNba107XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgaWYgKChrIDwgbmN0KSAmJiAoc1trXSAhPT0gMCkpIHtcbiAgICAgICAgICAgICAgICB0ID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgKz0gYVtpXVtrXSAqIGFbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHQgPSAtdCAvIGFba11ba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhW2ldW2pdICs9IHQgKiBhW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVbal0gPSBhW2tdW2pdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHdhbnR1ICYmIChrIDwgbmN0KSkge1xuICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIFVbaV1ba10gPSBhW2ldW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGsgPCBucnQpIHtcbiAgICAgICAgICAgIGVba10gPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBlW2tdID0gaHlwb3RlbnVzZShlW2tdLCBlW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlW2tdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVbayArIDFdIDwgMClcbiAgICAgICAgICAgICAgICAgICAgZVtrXSA9IC1lW2tdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGVbaV0gLz0gZVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZVtrICsgMV0gKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVba10gPSAtZVtrXTtcbiAgICAgICAgICAgIGlmICgoayArIDEgPCBtKSAmJiAoZVtrXSAhPT0gMCkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB3b3JrW2ldID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtbaV0gKz0gZVtqXSAqIGFbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IC1lW2pdIC8gZVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhW2ldW2pdICs9IHQgKiB3b3JrW2ldO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdhbnR2KSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVltpXVtrXSA9IGVbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcCA9IE1hdGgubWluKG4sIG0gKyAxKTtcbiAgICBpZiAobmN0IDwgbikge1xuICAgICAgICBzW25jdF0gPSBhW25jdF1bbmN0XTtcbiAgICB9XG4gICAgaWYgKG0gPCBwKSB7XG4gICAgICAgIHNbcCAtIDFdID0gMDtcbiAgICB9XG4gICAgaWYgKG5ydCArIDEgPCBwKSB7XG4gICAgICAgIGVbbnJ0XSA9IGFbbnJ0XVtwIC0gMV07XG4gICAgfVxuICAgIGVbcCAtIDFdID0gMDtcblxuICAgIGlmICh3YW50dSkge1xuICAgICAgICBmb3IgKGogPSBuY3Q7IGogPCBudTsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgVVtpXVtqXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBVW2pdW2pdID0gMTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGsgPSBuY3QgLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgaWYgKHNba10gIT09IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG51OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgKz0gVVtpXVtrXSAqIFVbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IC10IC8gVVtrXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtqXSArPSB0ICogVVtpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFVbaV1ba10gPSAtVVtpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgVVtrXVtrXSA9IDEgKyBVW2tdW2tdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFVbaV1ba10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBVW2ldW2tdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgVVtrXVtrXSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAod2FudHYpIHtcbiAgICAgICAgZm9yIChrID0gbiAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBpZiAoKGsgPCBucnQpICYmIChlW2tdICE9PSAwKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSAwO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdCArPSBWW2ldW2tdICogVltpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0ID0gLXQgLyBWW2sgKyAxXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bal0gKz0gdCAqIFZbaV1ba107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgVltpXVtrXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBWW2tdW2tdID0gMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBwcCA9IHAgLSAxLFxuICAgICAgICBpdGVyID0gMCxcbiAgICAgICAgZXBzID0gTWF0aC5wb3coMiwgLTUyKTtcbiAgICB3aGlsZSAocCA+IDApIHtcbiAgICAgICAgZm9yIChrID0gcCAtIDI7IGsgPj0gLTE7IGstLSkge1xuICAgICAgICAgICAgaWYgKGsgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoZVtrXSkgPD0gZXBzICogKE1hdGguYWJzKHNba10pICsgTWF0aC5hYnMoc1trICsgMV0pKSkge1xuICAgICAgICAgICAgICAgIGVba10gPSAwO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChrID09PSBwIC0gMikge1xuICAgICAgICAgICAga2FzZSA9IDQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGtzID0gcCAtIDE7IGtzID49IGs7IGtzLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAoa3MgPT09IGspIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHQgPSAoa3MgIT09IHAgPyBNYXRoLmFicyhlW2tzXSkgOiAwKSArIChrcyAhPT0gayArIDEgPyBNYXRoLmFicyhlW2tzIC0gMV0pIDogMCk7XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKHNba3NdKSA8PSBlcHMgKiB0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNba3NdID0gMDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGtzID09PSBrKSB7XG4gICAgICAgICAgICAgICAga2FzZSA9IDM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtzID09PSBwIC0gMSkge1xuICAgICAgICAgICAgICAgIGthc2UgPSAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBrYXNlID0gMjtcbiAgICAgICAgICAgICAgICBrID0ga3M7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBrKys7XG5cbiAgICAgICAgc3dpdGNoIChrYXNlKSB7XG4gICAgICAgICAgICBjYXNlIDE6IHtcbiAgICAgICAgICAgICAgICBmID0gZVtwIC0gMl07XG4gICAgICAgICAgICAgICAgZVtwIC0gMl0gPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IHAgLSAyOyBqID49IGs7IGotLSkge1xuICAgICAgICAgICAgICAgICAgICB0ID0gaHlwb3RlbnVzZShzW2pdLCBmKTtcbiAgICAgICAgICAgICAgICAgICAgY3MgPSBzW2pdIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc24gPSBmIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc1tqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChqICE9PSBrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmID0gLXNuICogZVtqIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBlW2ogLSAxXSA9IGNzICogZVtqIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IGNzICogVltpXVtqXSArIHNuICogVltpXVtwIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtwIC0gMV0gPSAtc24gKiBWW2ldW2pdICsgY3MgKiBWW2ldW3AgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgMiA6IHtcbiAgICAgICAgICAgICAgICBmID0gZVtrIC0gMV07XG4gICAgICAgICAgICAgICAgZVtrIC0gMV0gPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGs7IGogPCBwOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IGh5cG90ZW51c2Uoc1tqXSwgZik7XG4gICAgICAgICAgICAgICAgICAgIGNzID0gc1tqXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNuID0gZiAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNbal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBmID0gLXNuICogZVtqXTtcbiAgICAgICAgICAgICAgICAgICAgZVtqXSA9IGNzICogZVtqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IGNzICogVVtpXVtqXSArIHNuICogVVtpXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtrIC0gMV0gPSAtc24gKiBVW2ldW2pdICsgY3MgKiBVW2ldW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgMyA6IHtcbiAgICAgICAgICAgICAgICBzY2FsZSA9IE1hdGgubWF4KE1hdGgubWF4KE1hdGgubWF4KE1hdGgubWF4KE1hdGguYWJzKHNbcCAtIDFdKSwgTWF0aC5hYnMoc1twIC0gMl0pKSwgTWF0aC5hYnMoZVtwIC0gMl0pKSwgTWF0aC5hYnMoc1trXSkpLCBNYXRoLmFicyhlW2tdKSk7XG4gICAgICAgICAgICAgICAgc3AgPSBzW3AgLSAxXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIHNwbTEgPSBzW3AgLSAyXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIGVwbTEgPSBlW3AgLSAyXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIHNrID0gc1trXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIGVrID0gZVtrXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIGIgPSAoKHNwbTEgKyBzcCkgKiAoc3BtMSAtIHNwKSArIGVwbTEgKiBlcG0xKSAvIDI7XG4gICAgICAgICAgICAgICAgYyA9IChzcCAqIGVwbTEpICogKHNwICogZXBtMSk7XG4gICAgICAgICAgICAgICAgc2hpZnQgPSAwO1xuICAgICAgICAgICAgICAgIGlmICgoYiAhPT0gMCkgfHwgKGMgIT09IDApKSB7XG4gICAgICAgICAgICAgICAgICAgIHNoaWZ0ID0gTWF0aC5zcXJ0KGIgKiBiICsgYyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChiIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hpZnQgPSAtc2hpZnQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2hpZnQgPSBjIC8gKGIgKyBzaGlmdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGYgPSAoc2sgKyBzcCkgKiAoc2sgLSBzcCkgKyBzaGlmdDtcbiAgICAgICAgICAgICAgICBnID0gc2sgKiBlaztcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrOyBqIDwgcCAtIDE7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gaHlwb3RlbnVzZShmLCBnKTtcbiAgICAgICAgICAgICAgICAgICAgY3MgPSBmIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc24gPSBnIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGogIT09IGspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVbaiAtIDFdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBmID0gY3MgKiBzW2pdICsgc24gKiBlW2pdO1xuICAgICAgICAgICAgICAgICAgICBlW2pdID0gY3MgKiBlW2pdIC0gc24gKiBzW2pdO1xuICAgICAgICAgICAgICAgICAgICBnID0gc24gKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgc1tqICsgMV0gPSBjcyAqIHNbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBWW2ldW2pdICsgc24gKiBWW2ldW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2ogKyAxXSA9IC1zbiAqIFZbaV1bal0gKyBjcyAqIFZbaV1baiArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKGYsIGcpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGcgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgZiA9IGNzICogZVtqXSArIHNuICogc1tqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIHNbaiArIDFdID0gLXNuICogZVtqXSArIGNzICogc1tqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGcgPSBzbiAqIGVbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBlW2ogKyAxXSA9IGNzICogZVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dSAmJiAoaiA8IG0gLSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBjcyAqIFVbaV1bal0gKyBzbiAqIFVbaV1baiArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1baiArIDFdID0gLXNuICogVVtpXVtqXSArIGNzICogVVtpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZVtwIC0gMl0gPSBmO1xuICAgICAgICAgICAgICAgIGl0ZXIgPSBpdGVyICsgMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgNDoge1xuICAgICAgICAgICAgICAgIGlmIChzW2tdIDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc1trXSA9IChzW2tdIDwgMCA/IC1zW2tdIDogMCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8PSBwcDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrXSA9IC1WW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdoaWxlIChrIDwgcHApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNba10gPj0gc1trICsgMV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQgPSBzW2tdO1xuICAgICAgICAgICAgICAgICAgICBzW2tdID0gc1trICsgMV07XG4gICAgICAgICAgICAgICAgICAgIHNbayArIDFdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR2ICYmIChrIDwgbiAtIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IFZbaV1bayArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bayArIDFdID0gVltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHUgJiYgKGsgPCBtIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gVVtpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtrICsgMV0gPSBVW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1ba10gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGsrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaXRlciA9IDA7XG4gICAgICAgICAgICAgICAgcC0tO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN3YXBwZWQpIHtcbiAgICAgICAgdmFyIHRtcCA9IFY7XG4gICAgICAgIFYgPSBVO1xuICAgICAgICBVID0gdG1wO1xuICAgIH1cblxuICAgIHRoaXMubSA9IG07XG4gICAgdGhpcy5uID0gbjtcbiAgICB0aGlzLnMgPSBzO1xuICAgIHRoaXMuVSA9IFU7XG4gICAgdGhpcy5WID0gVjtcbn1cblxuU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIGdldCBjb25kaXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNbMF0gLyB0aGlzLnNbTWF0aC5taW4odGhpcy5tLCB0aGlzLm4pIC0gMV07XG4gICAgfSxcbiAgICBnZXQgbm9ybTIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNbMF07XG4gICAgfSxcbiAgICBnZXQgcmFuaygpIHtcbiAgICAgICAgdmFyIGVwcyA9IE1hdGgucG93KDIsIC01MiksXG4gICAgICAgICAgICB0b2wgPSBNYXRoLm1heCh0aGlzLm0sIHRoaXMubikgKiB0aGlzLnNbMF0gKiBlcHMsXG4gICAgICAgICAgICByID0gMCxcbiAgICAgICAgICAgIHMgPSB0aGlzLnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IHMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNbaV0gPiB0b2wpIHtcbiAgICAgICAgICAgICAgICByKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHI7XG4gICAgfSxcbiAgICBnZXQgZGlhZ29uYWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnM7XG4gICAgfSxcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYWNjb3JkLW5ldC9mcmFtZXdvcmsvYmxvYi9kZXZlbG9wbWVudC9Tb3VyY2VzL0FjY29yZC5NYXRoL0RlY29tcG9zaXRpb25zL1Npbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLmNzXG4gICAgZ2V0IHRocmVzaG9sZCgpIHtcbiAgICAgICAgcmV0dXJuIChNYXRoLnBvdygyLCAtNTIpIC8gMikgKiBNYXRoLm1heCh0aGlzLm0sIHRoaXMubikgKiB0aGlzLnNbMF07XG4gICAgfSxcbiAgICBnZXQgbGVmdFNpbmd1bGFyVmVjdG9ycygpIHtcbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgodGhpcy5VKSkge1xuICAgICAgICAgICAgdGhpcy5VID0gbmV3IE1hdHJpeCh0aGlzLlUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLlU7XG4gICAgfSxcbiAgICBnZXQgcmlnaHRTaW5ndWxhclZlY3RvcnMoKSB7XG4gICAgICAgIGlmICghTWF0cml4LmlzTWF0cml4KHRoaXMuVikpIHtcbiAgICAgICAgICAgIHRoaXMuViA9IG5ldyBNYXRyaXgodGhpcy5WKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5WO1xuICAgIH0sXG4gICAgZ2V0IGRpYWdvbmFsTWF0cml4KCkge1xuICAgICAgICByZXR1cm4gTWF0cml4LmRpYWcodGhpcy5zKTtcbiAgICB9LFxuICAgIHNvbHZlOiBmdW5jdGlvbiAodmFsdWUpIHtcblxuICAgICAgICB2YXIgWSA9IHZhbHVlLFxuICAgICAgICAgICAgZSA9IHRoaXMudGhyZXNob2xkLFxuICAgICAgICAgICAgc2NvbHMgPSB0aGlzLnMubGVuZ3RoLFxuICAgICAgICAgICAgTHMgPSBNYXRyaXguemVyb3Moc2NvbHMsIHNjb2xzKSxcbiAgICAgICAgICAgIGk7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHNjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyh0aGlzLnNbaV0pIDw9IGUpIHtcbiAgICAgICAgICAgICAgICBMc1tpXVtpXSA9IDA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIExzW2ldW2ldID0gMSAvIHRoaXMuc1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBVID0gdGhpcy5VO1xuICAgICAgICB2YXIgViA9IHRoaXMucmlnaHRTaW5ndWxhclZlY3RvcnM7XG5cbiAgICAgICAgdmFyIFZMID0gVi5tbXVsKExzKSxcbiAgICAgICAgICAgIHZyb3dzID0gVi5yb3dzLFxuICAgICAgICAgICAgdXJvd3MgPSBVLmxlbmd0aCxcbiAgICAgICAgICAgIFZMVSA9IE1hdHJpeC56ZXJvcyh2cm93cywgdXJvd3MpLFxuICAgICAgICAgICAgaiwgaywgc3VtO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCB2cm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXJvd3M7IGorKykge1xuICAgICAgICAgICAgICAgIHN1bSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IHNjb2xzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IFZMW2ldW2tdICogVVtqXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgVkxVW2ldW2pdID0gc3VtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFZMVS5tbXVsKFkpO1xuICAgIH0sXG4gICAgc29sdmVGb3JEaWFnb25hbDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNvbHZlKE1hdHJpeC5kaWFnKHZhbHVlKSk7XG4gICAgfSxcbiAgICBpbnZlcnNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBWID0gdGhpcy5WO1xuICAgICAgICB2YXIgZSA9IHRoaXMudGhyZXNob2xkLFxuICAgICAgICAgICAgdnJvd3MgPSBWLmxlbmd0aCxcbiAgICAgICAgICAgIHZjb2xzID0gVlswXS5sZW5ndGgsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeCh2cm93cywgdGhpcy5zLmxlbmd0aCksXG4gICAgICAgICAgICBpLCBqO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCB2cm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdmNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyh0aGlzLnNbal0pID4gZSkge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gVltpXVtqXSAvIHRoaXMuc1tqXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgVSA9IHRoaXMuVTtcblxuICAgICAgICB2YXIgdXJvd3MgPSBVLmxlbmd0aCxcbiAgICAgICAgICAgIHVjb2xzID0gVVswXS5sZW5ndGgsXG4gICAgICAgICAgICBZID0gbmV3IE1hdHJpeCh2cm93cywgdXJvd3MpLFxuICAgICAgICAgICAgaywgc3VtO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCB2cm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXJvd3M7IGorKykge1xuICAgICAgICAgICAgICAgIHN1bSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IHVjb2xzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IFhbaV1ba10gKiBVW2pdW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBZW2ldW2pdID0gc3VtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFk7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5oeXBvdGVudXNlID0gZnVuY3Rpb24gaHlwb3RlbnVzZShhLCBiKSB7XG4gICAgaWYgKE1hdGguYWJzKGEpID4gTWF0aC5hYnMoYikpIHtcbiAgICAgICAgdmFyIHIgPSBiIC8gYTtcbiAgICAgICAgcmV0dXJuIE1hdGguYWJzKGEpICogTWF0aC5zcXJ0KDEgKyByICogcik7XG4gICAgfVxuICAgIGlmIChiICE9PSAwKSB7XG4gICAgICAgIHZhciByID0gYSAvIGI7XG4gICAgICAgIHJldHVybiBNYXRoLmFicyhiKSAqIE1hdGguc3FydCgxICsgciAqIHIpO1xuICAgIH1cbiAgICByZXR1cm4gMDtcbn07XG5cbi8vIEZvciB1c2UgaW4gdGhlIGRlY29tcG9zaXRpb24gYWxnb3JpdGhtcy4gV2l0aCBiaWcgbWF0cmljZXMsIGFjY2VzcyB0aW1lIGlzXG4vLyB0b28gbG9uZyBvbiBlbGVtZW50cyBmcm9tIGFycmF5IHN1YmNsYXNzXG4vLyB0b2RvIGNoZWNrIHdoZW4gaXQgaXMgZml4ZWQgaW4gdjhcbi8vIGh0dHA6Ly9qc3BlcmYuY29tL2FjY2Vzcy1hbmQtd3JpdGUtYXJyYXktc3ViY2xhc3NcbmV4cG9ydHMuZ2V0RW1wdHkyREFycmF5ID0gZnVuY3Rpb24gKHJvd3MsIGNvbHVtbnMpIHtcbiAgICB2YXIgYXJyYXkgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSBuZXcgQXJyYXkoY29sdW1ucyk7XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbn07XG5cbmV4cG9ydHMuZ2V0RmlsbGVkMkRBcnJheSA9IGZ1bmN0aW9uIChyb3dzLCBjb2x1bW5zLCB2YWx1ZSkge1xuICAgIHZhciBhcnJheSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IG5ldyBBcnJheShjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgIGFycmF5W2ldW2pdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4vbWF0cml4Jyk7XG5cbnZhciBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvc3ZkJyk7XG52YXIgRWlnZW52YWx1ZURlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL2V2ZCcpO1xudmFyIEx1RGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvbHUnKTtcbnZhciBRckRlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL3FyJyk7XG52YXIgQ2hvbGVza3lEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9jaG9sZXNreScpO1xuXG5mdW5jdGlvbiBpbnZlcnNlKG1hdHJpeCkge1xuICAgIG1hdHJpeCA9IE1hdHJpeC5jaGVja01hdHJpeChtYXRyaXgpO1xuICAgIHJldHVybiBzb2x2ZShtYXRyaXgsIE1hdHJpeC5leWUobWF0cml4LnJvd3MpKTtcbn1cblxuTWF0cml4LmludmVyc2UgPSBNYXRyaXguaW52ID0gaW52ZXJzZTtcbk1hdHJpeC5wcm90b3R5cGUuaW52ZXJzZSA9IE1hdHJpeC5wcm90b3R5cGUuaW52ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xufTtcblxuZnVuY3Rpb24gc29sdmUobGVmdEhhbmRTaWRlLCByaWdodEhhbmRTaWRlKSB7XG4gICAgbGVmdEhhbmRTaWRlID0gTWF0cml4LmNoZWNrTWF0cml4KGxlZnRIYW5kU2lkZSk7XG4gICAgcmlnaHRIYW5kU2lkZSA9IE1hdHJpeC5jaGVja01hdHJpeChyaWdodEhhbmRTaWRlKTtcbiAgICByZXR1cm4gbGVmdEhhbmRTaWRlLmlzU3F1YXJlKCkgPyBuZXcgTHVEZWNvbXBvc2l0aW9uKGxlZnRIYW5kU2lkZSkuc29sdmUocmlnaHRIYW5kU2lkZSkgOiBuZXcgUXJEZWNvbXBvc2l0aW9uKGxlZnRIYW5kU2lkZSkuc29sdmUocmlnaHRIYW5kU2lkZSk7XG59XG5cbk1hdHJpeC5zb2x2ZSA9IHNvbHZlO1xuTWF0cml4LnByb3RvdHlwZS5zb2x2ZSA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiBzb2x2ZSh0aGlzLCBvdGhlcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbjogU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24sXG4gICAgU1ZEOiBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbjogRWlnZW52YWx1ZURlY29tcG9zaXRpb24sXG4gICAgRVZEOiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBMdURlY29tcG9zaXRpb246IEx1RGVjb21wb3NpdGlvbixcbiAgICBMVTogTHVEZWNvbXBvc2l0aW9uLFxuICAgIFFyRGVjb21wb3NpdGlvbjogUXJEZWNvbXBvc2l0aW9uLFxuICAgIFFSOiBRckRlY29tcG9zaXRpb24sXG4gICAgQ2hvbGVza3lEZWNvbXBvc2l0aW9uOiBDaG9sZXNreURlY29tcG9zaXRpb24sXG4gICAgQ0hPOiBDaG9sZXNreURlY29tcG9zaXRpb24sXG4gICAgaW52ZXJzZTogaW52ZXJzZSxcbiAgICBzb2x2ZTogc29sdmVcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9tYXRyaXgnKTtcbm1vZHVsZS5leHBvcnRzLkRlY29tcG9zaXRpb25zID0gbW9kdWxlLmV4cG9ydHMuREMgPSByZXF1aXJlKCcuL2RlY29tcG9zaXRpb25zJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogUmVhbCBtYXRyaXhcbiAqL1xuY2xhc3MgTWF0cml4IGV4dGVuZHMgQXJyYXkge1xuICAgIC8qKlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfEFycmF5fE1hdHJpeH0gblJvd3MgLSBOdW1iZXIgb2Ygcm93cyBvZiB0aGUgbmV3IG1hdHJpeCxcbiAgICAgKiAyRCBhcnJheSBjb250YWluaW5nIHRoZSBkYXRhIG9yIE1hdHJpeCBpbnN0YW5jZSB0byBjbG9uZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbbkNvbHVtbnNdIC0gTnVtYmVyIG9mIGNvbHVtbnMgb2YgdGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihuUm93cywgbkNvbHVtbnMpIHtcbiAgICAgICAgaWYgKE1hdHJpeC5pc01hdHJpeChuUm93cykpIHtcbiAgICAgICAgICAgIHJldHVybiBuUm93cy5jbG9uZSgpO1xuICAgICAgICB9IGVsc2UgaWYgKE51bWJlci5pc0ludGVnZXIoblJvd3MpICYmIG5Sb3dzID4gMCkgeyAvLyBDcmVhdGUgYW4gZW1wdHkgbWF0cml4XG4gICAgICAgICAgICBzdXBlcihuUm93cyk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzSW50ZWdlcihuQ29sdW1ucykgJiYgbkNvbHVtbnMgPiAwKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuUm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbaV0gPSBuZXcgQXJyYXkobkNvbHVtbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbkNvbHVtbnMgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KG5Sb3dzKSkgeyAvLyBDb3B5IHRoZSB2YWx1ZXMgZnJvbSB0aGUgMkQgYXJyYXlcbiAgICAgICAgICAgIHZhciBtYXRyaXggPSBuUm93cztcbiAgICAgICAgICAgIG5Sb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICAgICAgICAgIG5Db2x1bW5zID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbkNvbHVtbnMgIT09ICdudW1iZXInIHx8IG5Db2x1bW5zID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRGF0YSBtdXN0IGJlIGEgMkQgYXJyYXkgd2l0aCBhdCBsZWFzdCBvbmUgZWxlbWVudCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3VwZXIoblJvd3MpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuUm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1hdHJpeFtpXS5sZW5ndGggIT09IG5Db2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbmNvbnNpc3RlbnQgYXJyYXkgZGltZW5zaW9ucycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzW2ldID0gW10uY29uY2F0KG1hdHJpeFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyIG9yIGFuIGFycmF5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yb3dzID0gblJvd3M7XG4gICAgICAgIHRoaXMuY29sdW1ucyA9IG5Db2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBNYXRyaXggd2l0aCB0aGUgY2hvc2VuIGRpbWVuc2lvbnMgZnJvbSBhIDFEIGFycmF5XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG5ld1Jvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBuZXdDb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBuZXdEYXRhIC0gQSAxRCBhcnJheSBjb250YWluaW5nIGRhdGEgZm9yIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGZyb20xREFycmF5KG5ld1Jvd3MsIG5ld0NvbHVtbnMsIG5ld0RhdGEpIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IG5ld1Jvd3MgKiBuZXdDb2x1bW5zO1xuICAgICAgICBpZiAobGVuZ3RoICE9PSBuZXdEYXRhLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0RhdGEgbGVuZ3RoIGRvZXMgbm90IG1hdGNoIGdpdmVuIGRpbWVuc2lvbnMnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChuZXdSb3dzLCBuZXdDb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gMDsgcm93IDwgbmV3Um93czsgcm93KyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGNvbHVtbiA9IDA7IGNvbHVtbiA8IG5ld0NvbHVtbnM7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W3Jvd11bY29sdW1uXSA9IG5ld0RhdGFbcm93ICogbmV3Q29sdW1ucyArIGNvbHVtbl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld01hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgcm93IHZlY3RvciwgYSBtYXRyaXggd2l0aCBvbmx5IG9uZSByb3cuXG4gICAgICogQHBhcmFtIHtBcnJheX0gbmV3RGF0YSAtIEEgMUQgYXJyYXkgY29udGFpbmluZyBkYXRhIGZvciB0aGUgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyByb3dWZWN0b3IobmV3RGF0YSkge1xuICAgICAgICB2YXIgdmVjdG9yID0gbmV3IE1hdHJpeCgxLCBuZXdEYXRhLmxlbmd0aCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3RGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmVjdG9yWzBdW2ldID0gbmV3RGF0YVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmVjdG9yO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBjb2x1bW4gdmVjdG9yLCBhIG1hdHJpeCB3aXRoIG9ubHkgb25lIGNvbHVtbi5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBuZXdEYXRhIC0gQSAxRCBhcnJheSBjb250YWluaW5nIGRhdGEgZm9yIHRoZSB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGNvbHVtblZlY3RvcihuZXdEYXRhKSB7XG4gICAgICAgIHZhciB2ZWN0b3IgPSBuZXcgTWF0cml4KG5ld0RhdGEubGVuZ3RoLCAxKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2ZWN0b3JbaV1bMF0gPSBuZXdEYXRhW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2ZWN0b3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBlbXB0eSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZGltZW5zaW9ucy4gVmFsdWVzIHdpbGwgYmUgdW5kZWZpbmVkLiBTYW1lIGFzIHVzaW5nIG5ldyBNYXRyaXgocm93cywgY29sdW1ucykuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGVtcHR5KHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSBzZXQgdG8gemVyby5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgemVyb3Mocm93cywgY29sdW1ucykge1xuICAgICAgICByZXR1cm4gTWF0cml4LmVtcHR5KHJvd3MsIGNvbHVtbnMpLmZpbGwoMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSBzZXQgdG8gb25lLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBvbmVzKHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5lbXB0eShyb3dzLCBjb2x1bW5zKS5maWxsKDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZGltZW5zaW9ucy4gVmFsdWVzIHdpbGwgYmUgcmFuZG9tbHkgc2V0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gW3JuZ10gLSBSYW5kb20gbnVtYmVyIGdlbmVyYXRvciAoZGVmYXVsdDogTWF0aC5yYW5kb20pXG4gICAgICogQHJldHVybnMge01hdHJpeH0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgcmFuZChyb3dzLCBjb2x1bW5zLCBybmcpIHtcbiAgICAgICAgaWYgKHJuZyA9PT0gdW5kZWZpbmVkKSBybmcgPSBNYXRoLnJhbmRvbTtcbiAgICAgICAgdmFyIG1hdHJpeCA9IE1hdHJpeC5lbXB0eShyb3dzLCBjb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgbWF0cml4W2ldW2pdID0gcm5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGlkZW50aXR5IG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb24uIFZhbHVlcyBvZiB0aGUgZGlhZ29uYWwgd2lsbCBiZSAxIGFuZCBvdGhlcnMgd2lsbCBiZSAwLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2NvbHVtbnNdIC0gTnVtYmVyIG9mIGNvbHVtbnMgKERlZmF1bHQ6IHJvd3MpXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IGlkZW50aXR5IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBleWUocm93cywgY29sdW1ucykge1xuICAgICAgICBpZiAoY29sdW1ucyA9PT0gdW5kZWZpbmVkKSBjb2x1bW5zID0gcm93cztcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICB2YXIgbWF0cml4ID0gTWF0cml4Lnplcm9zKHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pbjsgaSsrKSB7XG4gICAgICAgICAgICBtYXRyaXhbaV1baV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIGRpYWdvbmFsIG1hdHJpeCBiYXNlZCBvbiB0aGUgZ2l2ZW4gYXJyYXkuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGF0YSAtIEFycmF5IGNvbnRhaW5pbmcgdGhlIGRhdGEgZm9yIHRoZSBkaWFnb25hbFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbcm93c10gLSBOdW1iZXIgb2Ygcm93cyAoRGVmYXVsdDogZGF0YS5sZW5ndGgpXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtjb2x1bW5zXSAtIE51bWJlciBvZiBjb2x1bW5zIChEZWZhdWx0OiByb3dzKVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBkaWFnb25hbCBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZGlhZyhkYXRhLCByb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIHZhciBsID0gZGF0YS5sZW5ndGg7XG4gICAgICAgIGlmIChyb3dzID09PSB1bmRlZmluZWQpIHJvd3MgPSBsO1xuICAgICAgICBpZiAoY29sdW1ucyA9PT0gdW5kZWZpbmVkKSBjb2x1bW5zID0gcm93cztcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKGwsIHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICB2YXIgbWF0cml4ID0gTWF0cml4Lnplcm9zKHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pbjsgaSsrKSB7XG4gICAgICAgICAgICBtYXRyaXhbaV1baV0gPSBkYXRhW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG1hdHJpeCB3aG9zZSBlbGVtZW50cyBhcmUgdGhlIG1pbmltdW0gYmV0d2VlbiBtYXRyaXgxIGFuZCBtYXRyaXgyXG4gICAgICogQHBhcmFtIG1hdHJpeDFcbiAgICAgKiBAcGFyYW0gbWF0cml4MlxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3RhdGljIG1pbihtYXRyaXgxLCBtYXRyaXgyKSB7XG4gICAgICAgIHZhciByb3dzID0gbWF0cml4MS5sZW5ndGg7XG4gICAgICAgIHZhciBjb2x1bW5zID0gbWF0cml4MVswXS5sZW5ndGg7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHJlc3VsdFtpXVtqXSA9IE1hdGgubWluKG1hdHJpeDFbaV1bal0sIG1hdHJpeDJbaV1bal0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG1hdHJpeCB3aG9zZSBlbGVtZW50cyBhcmUgdGhlIG1heGltdW0gYmV0d2VlbiBtYXRyaXgxIGFuZCBtYXRyaXgyXG4gICAgICogQHBhcmFtIG1hdHJpeDFcbiAgICAgKiBAcGFyYW0gbWF0cml4MlxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3RhdGljIG1heChtYXRyaXgxLCBtYXRyaXgyKSB7XG4gICAgICAgIHZhciByb3dzID0gbWF0cml4MS5sZW5ndGg7XG4gICAgICAgIHZhciBjb2x1bW5zID0gbWF0cml4MVswXS5sZW5ndGg7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHJlc3VsdFtpXVtqXSA9IE1hdGgubWF4KG1hdHJpeDFbaV1bal0sIG1hdHJpeDJbaV1bal0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgdGhhdCB0aGUgcHJvdmlkZWQgdmFsdWUgaXMgYSBNYXRyaXggYW5kIHRyaWVzIHRvIGluc3RhbnRpYXRlIG9uZSBpZiBub3RcbiAgICAgKiBAcGFyYW0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN0YXRpYyBjaGVja01hdHJpeCh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gTWF0cml4LmlzTWF0cml4KHZhbHVlKSA/IHZhbHVlIDogbmV3IE1hdHJpeCh2YWx1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBhcmd1bWVudCBpcyBhIE1hdHJpeCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICogQHBhcmFtIHZhbHVlIC0gVGhlIHZhbHVlIHRvIGNoZWNrXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBzdGF0aWMgaXNNYXRyaXgodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuICh2YWx1ZSAhPSBudWxsKSAmJiAodmFsdWUua2xhc3MgPT09ICdNYXRyaXgnKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkge251bWJlcn0gLSBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIHRoZSBtYXRyaXguXG4gICAgICovXG4gICAgZ2V0IHNpemUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJvd3MgKiB0aGlzLmNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwbGllcyBhIGNhbGxiYWNrIGZvciBlYWNoIGVsZW1lbnQgb2YgdGhlIG1hdHJpeC4gVGhlIGZ1bmN0aW9uIGlzIGNhbGxlZCBpbiB0aGUgbWF0cml4ICh0aGlzKSBjb250ZXh0LlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gRnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aXRoIHR3byBwYXJhbWV0ZXJzIDogaSAocm93KSBhbmQgaiAoY29sdW1uKVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhcHBseShjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgaWkgPSB0aGlzLnJvd3M7XG4gICAgICAgIHZhciBqaiA9IHRoaXMuY29sdW1ucztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGpqOyBqKyspIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIGksIGopO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYW4gZXhhY3QgYW5kIGluZGVwZW5kZW50IGNvcHkgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgY2xvbmUoKSB7XG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KHRoaXMucm93cywgdGhpcy5jb2x1bW5zKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gMDsgcm93IDwgdGhpcy5yb3dzOyByb3crKykge1xuICAgICAgICAgICAgZm9yICh2YXIgY29sdW1uID0gMDsgY29sdW1uIDwgdGhpcy5jb2x1bW5zOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtyb3ddW2NvbHVtbl0gPSB0aGlzW3Jvd11bY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgMUQgYXJyYXkgZmlsbGVkIHJvdyBieSByb3cgd2l0aCB0aGUgbWF0cml4IHZhbHVlc1xuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICB0bzFEQXJyYXkoKSB7XG4gICAgICAgIHZhciBhcnJheSA9IG5ldyBBcnJheSh0aGlzLnNpemUpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgYXJyYXlbaSAqIHRoaXMuY29sdW1ucyArIGpdID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXJyYXk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIDJEIGFycmF5IGNvbnRhaW5pbmcgYSBjb3B5IG9mIHRoZSBkYXRhXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIHRvMkRBcnJheSgpIHtcbiAgICAgICAgdmFyIGNvcHkgPSBuZXcgQXJyYXkodGhpcy5yb3dzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgY29weVtpXSA9IFtdLmNvbmNhdCh0aGlzW2ldKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29weTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyBvbmUgcm93XG4gICAgICovXG4gICAgaXNSb3dWZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJvd3MgPT09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBoYXMgb25lIGNvbHVtblxuICAgICAqL1xuICAgIGlzQ29sdW1uVmVjdG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2x1bW5zID09PSAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaGFzIG9uZSByb3cgb3Igb25lIGNvbHVtblxuICAgICAqL1xuICAgIGlzVmVjdG9yKCkge1xuICAgICAgICByZXR1cm4gKHRoaXMucm93cyA9PT0gMSkgfHwgKHRoaXMuY29sdW1ucyA9PT0gMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBoYXMgdGhlIHNhbWUgbnVtYmVyIG9mIHJvd3MgYW5kIGNvbHVtbnNcbiAgICAgKi9cbiAgICBpc1NxdWFyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucm93cyA9PT0gdGhpcy5jb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaXMgc3F1YXJlIGFuZCBoYXMgdGhlIHNhbWUgdmFsdWVzIG9uIGJvdGggc2lkZXMgb2YgdGhlIGRpYWdvbmFsXG4gICAgICovXG4gICAgaXNTeW1tZXRyaWMoKSB7XG4gICAgICAgIGlmICh0aGlzLmlzU3F1YXJlKCkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8PSBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXNbaV1bal0gIT09IHRoaXNbal1baV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgZ2l2ZW4gZWxlbWVudCBvZiB0aGUgbWF0cml4LiBtYXQuc2V0KDMsNCwxKSBpcyBlcXVpdmFsZW50IHRvIG1hdFszXVs0XT0xXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd0luZGV4IC0gSW5kZXggb2YgdGhlIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5JbmRleCAtIEluZGV4IG9mIHRoZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgLSBUaGUgbmV3IHZhbHVlIGZvciB0aGUgZWxlbWVudFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzZXQocm93SW5kZXgsIGNvbHVtbkluZGV4LCB2YWx1ZSkge1xuICAgICAgICB0aGlzW3Jvd0luZGV4XVtjb2x1bW5JbmRleF0gPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgZ2l2ZW4gZWxlbWVudCBvZiB0aGUgbWF0cml4LiBtYXQuZ2V0KDMsNCkgaXMgZXF1aXZhbGVudCB0byBtYXRyaXhbM11bNF1cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93SW5kZXggLSBJbmRleCBvZiB0aGUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbkluZGV4IC0gSW5kZXggb2YgdGhlIGNvbHVtblxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgZ2V0KHJvd0luZGV4LCBjb2x1bW5JbmRleCkge1xuICAgICAgICByZXR1cm4gdGhpc1tyb3dJbmRleF1bY29sdW1uSW5kZXhdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbGxzIHRoZSBtYXRyaXggd2l0aCBhIGdpdmVuIHZhbHVlLiBBbGwgZWxlbWVudHMgd2lsbCBiZSBzZXQgdG8gdGhpcyB2YWx1ZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgLSBOZXcgdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgZmlsbCh2YWx1ZSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE5lZ2F0ZXMgdGhlIG1hdHJpeC4gQWxsIGVsZW1lbnRzIHdpbGwgYmUgbXVsdGlwbGllZCBieSAoLTEpXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG5lZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubXVsUygtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyBhcnJheSBmcm9tIHRoZSBnaXZlbiByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgZ2V0Um93KGluZGV4KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICByZXR1cm4gW10uY29uY2F0KHRoaXNbaW5kZXhdKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IHJvdyB2ZWN0b3IgZnJvbSB0aGUgZ2l2ZW4gcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBnZXRSb3dWZWN0b3IoaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5yb3dWZWN0b3IodGhpcy5nZXRSb3coaW5kZXgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgcm93IGF0IHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSBhcnJheSAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzZXRSb3coaW5kZXgsIGFycmF5KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBhcnJheSA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIGFycmF5LCB0cnVlKTtcbiAgICAgICAgdGhpc1tpbmRleF0gPSBhcnJheTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIHJvdyBmcm9tIHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICByZW1vdmVSb3coaW5kZXgpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGlmICh0aGlzLnJvd3MgPT09IDEpXG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQSBtYXRyaXggY2Fubm90IGhhdmUgbGVzcyB0aGFuIG9uZSByb3cnKTtcbiAgICAgICAgdGhpcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB0aGlzLnJvd3MgLT0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJvdyBhdCB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2luZGV4ID0gdGhpcy5yb3dzXSAtIFJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSBhcnJheSAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRSb3coaW5kZXgsIGFycmF5KSB7XG4gICAgICAgIGlmIChhcnJheSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBhcnJheSA9IGluZGV4O1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLnJvd3M7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCwgdHJ1ZSk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tSb3dWZWN0b3IodGhpcywgYXJyYXksIHRydWUpO1xuICAgICAgICB0aGlzLnNwbGljZShpbmRleCwgMCwgYXJyYXkpO1xuICAgICAgICB0aGlzLnJvd3MgKz0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3dhcHMgdHdvIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93MSAtIEZpcnN0IHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cyIC0gU2Vjb25kIHJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzd2FwUm93cyhyb3cxLCByb3cyKSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93MSk7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93Mik7XG4gICAgICAgIHZhciB0ZW1wID0gdGhpc1tyb3cxXTtcbiAgICAgICAgdGhpc1tyb3cxXSA9IHRoaXNbcm93Ml07XG4gICAgICAgIHRoaXNbcm93Ml0gPSB0ZW1wO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IGFycmF5IGZyb20gdGhlIGdpdmVuIGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBnZXRDb2x1bW4oaW5kZXgpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBuZXcgQXJyYXkodGhpcy5yb3dzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgY29sdW1uW2ldID0gdGhpc1tpXVtpbmRleF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IGNvbHVtbiB2ZWN0b3IgZnJvbSB0aGUgZ2l2ZW4gY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBnZXRDb2x1bW5WZWN0b3IoaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIE1hdHJpeC5jb2x1bW5WZWN0b3IodGhpcy5nZXRDb2x1bW4oaW5kZXgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgY29sdW1uIGF0IHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSBhcnJheSAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzZXRDb2x1bW4oaW5kZXgsIGFycmF5KSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBhcnJheSA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIGFycmF5KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXVtpbmRleF0gPSBhcnJheVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgY29sdW1uIGZyb20gdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHJlbW92ZUNvbHVtbihpbmRleCkge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgaWYgKHRoaXMuY29sdW1ucyA9PT0gMSlcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBIG1hdHJpeCBjYW5ub3QgaGF2ZSBsZXNzIHRoYW4gb25lIGNvbHVtbicpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb2x1bW5zIC09IDE7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBjb2x1bW4gYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtpbmRleCA9IHRoaXMuY29sdW1uc10gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gYXJyYXkgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYWRkQ29sdW1uKGluZGV4LCBhcnJheSkge1xuICAgICAgICBpZiAodHlwZW9mIGFycmF5ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgYXJyYXkgPSBpbmRleDtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5jb2x1bW5zO1xuICAgICAgICB9XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgsIHRydWUpO1xuICAgICAgICBhcnJheSA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIGFycmF5KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXS5zcGxpY2UoaW5kZXgsIDAsIGFycmF5W2ldKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbHVtbnMgKz0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3dhcHMgdHdvIGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uMSAtIEZpcnN0IGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4yIC0gU2Vjb25kIGNvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzd2FwQ29sdW1ucyhjb2x1bW4xLCBjb2x1bW4yKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uMSk7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uMik7XG4gICAgICAgIHZhciB0ZW1wLCByb3c7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHJvdyA9IHRoaXNbaV07XG4gICAgICAgICAgICB0ZW1wID0gcm93W2NvbHVtbjFdO1xuICAgICAgICAgICAgcm93W2NvbHVtbjFdID0gcm93W2NvbHVtbjJdO1xuICAgICAgICAgICAgcm93W2NvbHVtbjJdID0gdGVtcDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3IgdG8gZWFjaCByb3dcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFkZFJvd1ZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tSb3dWZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gKz0gdmVjdG9yW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1YnRyYWN0cyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIGZyb20gZWFjaCByb3dcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN1YlJvd1ZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tSb3dWZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gLT0gdmVjdG9yW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE11bHRpcGxpZXMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciB3aXRoIGVhY2ggcm93XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxSb3dWZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrUm93VmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdICo9IHZlY3RvcltqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEaXZpZGVzIHRoZSB2YWx1ZXMgb2YgZWFjaCByb3cgYnkgdGhvc2Ugb2YgYSB2ZWN0b3JcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGRpdlJvd1ZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tSb3dWZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gLz0gdmVjdG9yW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciB0byBlYWNoIGNvbHVtblxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYWRkQ29sdW1uVmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSArPSB2ZWN0b3JbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3IgZnJvbSBlYWNoIGNvbHVtblxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc3ViQ29sdW1uVmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAtPSB2ZWN0b3JbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHdpdGggZWFjaCBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG11bENvbHVtblZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gKj0gdmVjdG9yW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERpdmlkZXMgdGhlIHZhbHVlcyBvZiBlYWNoIGNvbHVtbiBieSB0aG9zZSBvZiBhIHZlY3RvclxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgZGl2Q29sdW1uVmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAvPSB2ZWN0b3JbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgdmFsdWVzIG9mIGEgcm93IHdpdGggYSBzY2FsYXJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbXVsUm93KGluZGV4LCB2YWx1ZSkge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpbmRleF1baV0gKj0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgdmFsdWVzIG9mIGEgY29sdW1uIHdpdGggYSBzY2FsYXJcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbXVsQ29sdW1uKGluZGV4LCB2YWx1ZSkge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXVtpbmRleF0gKj0gdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXhpbXVtIHZhbHVlIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1heCgpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdWzBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXNbaV1bal0gPiB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF4aW11bSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtYXhJbmRleCgpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdWzBdO1xuICAgICAgICB2YXIgaWR4ID0gWzAsIDBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXNbaV1bal0gPiB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZHhbMF0gPSBpO1xuICAgICAgICAgICAgICAgICAgICBpZHhbMV0gPSBqO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWluKCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA8IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtaW5pbXVtIHZhbHVlXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1pbkluZGV4KCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIHZhciBpZHggPSBbMCwgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA8IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGlkeFsxXSA9IGo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWF4Um93KHJvdykge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdyk7XG4gICAgICAgIHZhciB2ID0gdGhpc1tyb3ddWzBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tyb3ddW2ldID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW3Jvd11baV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWF4Um93SW5kZXgocm93KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93KTtcbiAgICAgICAgdmFyIHYgPSB0aGlzW3Jvd11bMF07XG4gICAgICAgIHZhciBpZHggPSBbcm93LCAwXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbcm93XVtpXSA+IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tyb3ddW2ldO1xuICAgICAgICAgICAgICAgIGlkeFsxXSA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtaW5pbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtaW5Sb3cocm93KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93KTtcbiAgICAgICAgdmFyIHYgPSB0aGlzW3Jvd11bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtaW5Sb3dJbmRleChyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFtyb3csIDBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tyb3ddW2ldIDwgdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW3Jvd11baV07XG4gICAgICAgICAgICAgICAgaWR4WzFdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1heENvbHVtbihjb2x1bW4pIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4pO1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bY29sdW1uXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV1bY29sdW1uXSA+IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtjb2x1bW5dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1heENvbHVtbkluZGV4KGNvbHVtbikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbik7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVtjb2x1bW5dO1xuICAgICAgICB2YXIgaWR4ID0gWzAsIGNvbHVtbl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW2ldW2NvbHVtbl0gPiB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bY29sdW1uXTtcbiAgICAgICAgICAgICAgICBpZHhbMF0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWluaW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWluQ29sdW1uKGNvbHVtbikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbik7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVtjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dIDwgdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1pbmltdW0gdmFsdWUgb2Ygb25lIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWluQ29sdW1uSW5kZXgoY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIHZhciBpZHggPSBbMCwgY29sdW1uXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV1bY29sdW1uXSA8IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtjb2x1bW5dO1xuICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIGRpYWdvbmFsIHZhbHVlcyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIGRpYWcoKSB7XG4gICAgICAgIHZhciBtaW4gPSBNYXRoLm1pbih0aGlzLnJvd3MsIHRoaXMuY29sdW1ucyk7XG4gICAgICAgIHZhciBkaWFnID0gbmV3IEFycmF5KG1pbik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIGRpYWdbaV0gPSB0aGlzW2ldW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkaWFnO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN1bSBvZiBhbGwgZWxlbWVudHMgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgc3VtKCkge1xuICAgICAgICB2YXIgdiA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2ICs9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWVhbiBvZiBhbGwgZWxlbWVudHMgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWVhbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VtKCkgLyB0aGlzLnNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcHJvZHVjdCBvZiBhbGwgZWxlbWVudHMgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHJvZCgpIHtcbiAgICAgICAgdmFyIHByb2QgPSAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcHJvZCAqPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm9kO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbXB1dGVzIHRoZSBjdW11bGF0aXZlIHN1bSBvZiB0aGUgbWF0cml4IGVsZW1lbnRzIChpbiBwbGFjZSwgcm93IGJ5IHJvdylcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgY3VtdWxhdGl2ZVN1bSgpIHtcbiAgICAgICAgdmFyIHN1bSA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzdW0gKz0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdID0gc3VtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbXB1dGVzIHRoZSBkb3QgKHNjYWxhcikgcHJvZHVjdCBiZXR3ZWVuIHRoZSBtYXRyaXggYW5kIGFub3RoZXJcbiAgICAgKiBAcGFyYW0ge01hdHJpeH0gdmVjdG9yMiB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIGRvdCh2ZWN0b3IyKSB7XG4gICAgICAgIGlmIChNYXRyaXguaXNNYXRyaXgodmVjdG9yMikpIHZlY3RvcjIgPSB2ZWN0b3IyLnRvMURBcnJheSgpO1xuICAgICAgICB2YXIgdmVjdG9yMSA9IHRoaXMudG8xREFycmF5KCk7XG4gICAgICAgIGlmICh2ZWN0b3IxLmxlbmd0aCAhPT0gdmVjdG9yMi5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd2ZWN0b3JzIGRvIG5vdCBoYXZlIHRoZSBzYW1lIHNpemUnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZG90ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2ZWN0b3IxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBkb3QgKz0gdmVjdG9yMVtpXSAqIHZlY3RvcjJbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRvdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXRyaXggcHJvZHVjdCBiZXR3ZWVuIHRoaXMgYW5kIG90aGVyXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBtbXVsKG90aGVyKSB7XG4gICAgICAgIG90aGVyID0gTWF0cml4LmNoZWNrTWF0cml4KG90aGVyKTtcbiAgICAgICAgaWYgKHRoaXMuY29sdW1ucyAhPT0gb3RoZXIucm93cylcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignTnVtYmVyIG9mIGNvbHVtbnMgb2YgbGVmdCBtYXRyaXggYXJlIG5vdCBlcXVhbCB0byBudW1iZXIgb2Ygcm93cyBvZiByaWdodCBtYXRyaXguJyk7XG5cbiAgICAgICAgdmFyIG0gPSB0aGlzLnJvd3M7XG4gICAgICAgIHZhciBuID0gdGhpcy5jb2x1bW5zO1xuICAgICAgICB2YXIgcCA9IG90aGVyLmNvbHVtbnM7XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgobSwgcCk7XG5cbiAgICAgICAgdmFyIEJjb2xqID0gbmV3IEFycmF5KG4pO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHA7IGorKykge1xuICAgICAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBuOyBrKyspXG4gICAgICAgICAgICAgICAgQmNvbGpba10gPSBvdGhlcltrXVtqXTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgQXJvd2kgPSB0aGlzW2ldO1xuXG4gICAgICAgICAgICAgICAgdmFyIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBuOyBrKyspXG4gICAgICAgICAgICAgICAgICAgIHMgKz0gQXJvd2lba10gKiBCY29saltrXTtcblxuICAgICAgICAgICAgICAgIHJlc3VsdFtpXVtqXSA9IHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc3Bvc2VzIHRoZSBtYXRyaXggYW5kIHJldHVybnMgYSBuZXcgb25lIGNvbnRhaW5pbmcgdGhlIHJlc3VsdFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgdHJhbnNwb3NlKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeCh0aGlzLmNvbHVtbnMsIHRoaXMucm93cyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICByZXN1bHRbal1baV0gPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU29ydHMgdGhlIHJvd3MgKGluIHBsYWNlKVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNvbXBhcmVGdW5jdGlvbiAtIHVzdWFsIEFycmF5LnByb3RvdHlwZS5zb3J0IGNvbXBhcmlzb24gZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc29ydFJvd3MoY29tcGFyZUZ1bmN0aW9uKSB7XG4gICAgICAgIGlmIChjb21wYXJlRnVuY3Rpb24gPT09IHVuZGVmaW5lZCkgY29tcGFyZUZ1bmN0aW9uID0gY29tcGFyZU51bWJlcnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV0uc29ydChjb21wYXJlRnVuY3Rpb24pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNvcnRzIHRoZSBjb2x1bW5zIChpbiBwbGFjZSlcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjb21wYXJlRnVuY3Rpb24gLSB1c3VhbCBBcnJheS5wcm90b3R5cGUuc29ydCBjb21wYXJpc29uIGZ1bmN0aW9uXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNvcnRDb2x1bW5zKGNvbXBhcmVGdW5jdGlvbikge1xuICAgICAgICBpZiAoY29tcGFyZUZ1bmN0aW9uID09PSB1bmRlZmluZWQpIGNvbXBhcmVGdW5jdGlvbiA9IGNvbXBhcmVOdW1iZXJzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLnNldENvbHVtbihpLCB0aGlzLmdldENvbHVtbihpKS5zb3J0KGNvbXBhcmVGdW5jdGlvbikpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdWJzZXQgb2YgdGhlIG1hdHJpeFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydFJvdyAtIEZpcnN0IHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBlbmRSb3cgLSBMYXN0IHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydENvbHVtbiAtIEZpcnN0IGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBlbmRDb2x1bW4gLSBMYXN0IGNvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3ViTWF0cml4KHN0YXJ0Um93LCBlbmRSb3csIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4pIHtcbiAgICAgICAgaWYgKChzdGFydFJvdyA+IGVuZFJvdykgfHwgKHN0YXJ0Q29sdW1uID4gZW5kQ29sdW1uKSB8fCAoc3RhcnRSb3cgPCAwKSB8fCAoc3RhcnRSb3cgPj0gdGhpcy5yb3dzKSB8fCAoZW5kUm93IDwgMCkgfHwgKGVuZFJvdyA+PSB0aGlzLnJvd3MpIHx8IChzdGFydENvbHVtbiA8IDApIHx8IChzdGFydENvbHVtbiA+PSB0aGlzLmNvbHVtbnMpIHx8IChlbmRDb2x1bW4gPCAwKSB8fCAoZW5kQ29sdW1uID49IHRoaXMuY29sdW1ucykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBcmd1bWVudCBvdXQgb2YgcmFuZ2UnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChlbmRSb3cgLSBzdGFydFJvdyArIDEsIGVuZENvbHVtbiAtIHN0YXJ0Q29sdW1uICsgMSk7XG4gICAgICAgIGZvciAodmFyIGkgPSBzdGFydFJvdzsgaSA8PSBlbmRSb3c7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0Q29sdW1uOyBqIDw9IGVuZENvbHVtbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W2kgLSBzdGFydFJvd11baiAtIHN0YXJ0Q29sdW1uXSA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld01hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgc3Vic2V0IG9mIHRoZSBtYXRyaXggYmFzZWQgb24gYW4gYXJyYXkgb2Ygcm93IGluZGljZXNcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBpbmRpY2VzIC0gQXJyYXkgY29udGFpbmluZyB0aGUgcm93IGluZGljZXNcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3N0YXJ0Q29sdW1uID0gMF0gLSBGaXJzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2VuZENvbHVtbiA9IHRoaXMuY29sdW1ucy0xXSAtIExhc3QgY29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdWJNYXRyaXhSb3coaW5kaWNlcywgc3RhcnRDb2x1bW4sIGVuZENvbHVtbikge1xuICAgICAgICBpZiAoc3RhcnRDb2x1bW4gPT09IHVuZGVmaW5lZCkgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09PSB1bmRlZmluZWQpIGVuZENvbHVtbiA9IHRoaXMuY29sdW1ucyAtIDE7XG4gICAgICAgIGlmICgoc3RhcnRDb2x1bW4gPiBlbmRDb2x1bW4pIHx8IChzdGFydENvbHVtbiA8IDApIHx8IChzdGFydENvbHVtbiA+PSB0aGlzLmNvbHVtbnMpIHx8IChlbmRDb2x1bW4gPCAwKSB8fCAoZW5kQ29sdW1uID49IHRoaXMuY29sdW1ucykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBcmd1bWVudCBvdXQgb2YgcmFuZ2UnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KGluZGljZXMubGVuZ3RoLCBlbmRDb2x1bW4gLSBzdGFydENvbHVtbiArIDEpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluZGljZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydENvbHVtbjsgaiA8PSBlbmRDb2x1bW47IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpbmRpY2VzW2ldIDwgMCB8fCBpbmRpY2VzW2ldID49IHRoaXMucm93cykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignUm93IGluZGV4IG91dCBvZiByYW5nZTogJyArIGluZGljZXNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbaV1baiAtIHN0YXJ0Q29sdW1uXSA9IHRoaXNbaW5kaWNlc1tpXV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld01hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgc3Vic2V0IG9mIHRoZSBtYXRyaXggYmFzZWQgb24gYW4gYXJyYXkgb2YgY29sdW1uIGluZGljZXNcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBpbmRpY2VzIC0gQXJyYXkgY29udGFpbmluZyB0aGUgY29sdW1uIGluZGljZXNcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW3N0YXJ0Um93ID0gMF0gLSBGaXJzdCByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2VuZFJvdyA9IHRoaXMucm93cy0xXSAtIExhc3Qgcm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdWJNYXRyaXhDb2x1bW4oaW5kaWNlcywgc3RhcnRSb3csIGVuZFJvdykge1xuICAgICAgICBpZiAoc3RhcnRSb3cgPT09IHVuZGVmaW5lZCkgc3RhcnRSb3cgPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09PSB1bmRlZmluZWQpIGVuZFJvdyA9IHRoaXMucm93cyAtIDE7XG4gICAgICAgIGlmICgoc3RhcnRSb3cgPiBlbmRSb3cpIHx8IChzdGFydFJvdyA8IDApIHx8IChzdGFydFJvdyA+PSB0aGlzLnJvd3MpIHx8IChlbmRSb3cgPCAwKSB8fCAoZW5kUm93ID49IHRoaXMucm93cykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBcmd1bWVudCBvdXQgb2YgcmFuZ2UnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KGVuZFJvdyAtIHN0YXJ0Um93ICsgMSwgaW5kaWNlcy5sZW5ndGgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluZGljZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydFJvdzsgaiA8PSBlbmRSb3c7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpbmRpY2VzW2ldIDwgMCB8fCBpbmRpY2VzW2ldID49IHRoaXMuY29sdW1ucykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQ29sdW1uIGluZGV4IG91dCBvZiByYW5nZTogJyArIGluZGljZXNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbaiAtIHN0YXJ0Um93XVtpXSA9IHRoaXNbal1baW5kaWNlc1tpXV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld01hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB0cmFjZSBvZiB0aGUgbWF0cml4IChzdW0gb2YgdGhlIGRpYWdvbmFsIGVsZW1lbnRzKVxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgdHJhY2UoKSB7XG4gICAgICAgIHZhciBtaW4gPSBNYXRoLm1pbih0aGlzLnJvd3MsIHRoaXMuY29sdW1ucyk7XG4gICAgICAgIHZhciB0cmFjZSA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIHRyYWNlICs9IHRoaXNbaV1baV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRyYWNlO1xuICAgIH1cbn1cblxuTWF0cml4LnByb3RvdHlwZS5rbGFzcyA9ICdNYXRyaXgnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1hdHJpeDtcblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCBhIHJvdyBpbmRleCBpcyBub3Qgb3V0IG9mIGJvdW5kc1xuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IGluZGV4XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvdXRlcl1cbiAqL1xuZnVuY3Rpb24gY2hlY2tSb3dJbmRleChtYXRyaXgsIGluZGV4LCBvdXRlcikge1xuICAgIHZhciBtYXggPSBvdXRlciA/IG1hdHJpeC5yb3dzIDogbWF0cml4LnJvd3MgLSAxO1xuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiBtYXgpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdSb3cgaW5kZXggb3V0IG9mIHJhbmdlJyk7XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgdGhlIHByb3ZpZGVkIHZlY3RvciBpcyBhbiBhcnJheSB3aXRoIHRoZSByaWdodCBsZW5ndGhcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY29weVxuICogQHJldHVybnMge0FycmF5fVxuICogQHRocm93cyB7UmFuZ2VFcnJvcn1cbiAqL1xuZnVuY3Rpb24gY2hlY2tSb3dWZWN0b3IobWF0cml4LCB2ZWN0b3IsIGNvcHkpIHtcbiAgICBpZiAoTWF0cml4LmlzTWF0cml4KHZlY3RvcikpIHtcbiAgICAgICAgdmVjdG9yID0gdmVjdG9yLnRvMURBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoY29weSkge1xuICAgICAgICB2ZWN0b3IgPSBbXS5jb25jYXQodmVjdG9yKTtcbiAgICB9XG4gICAgaWYgKHZlY3Rvci5sZW5ndGggIT09IG1hdHJpeC5jb2x1bW5zKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmVjdG9yIHNpemUgbXVzdCBiZSB0aGUgc2FtZSBhcyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMnKTtcbiAgICByZXR1cm4gdmVjdG9yO1xufVxuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IHRoZSBwcm92aWRlZCB2ZWN0b3IgaXMgYW4gYXJyYXkgd2l0aCB0aGUgcmlnaHQgbGVuZ3RoXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNvcHlcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqIEB0aHJvd3Mge1JhbmdlRXJyb3J9XG4gKi9cbmZ1bmN0aW9uIGNoZWNrQ29sdW1uVmVjdG9yKG1hdHJpeCwgdmVjdG9yLCBjb3B5KSB7XG4gICAgaWYgKE1hdHJpeC5pc01hdHJpeCh2ZWN0b3IpKSB7XG4gICAgICAgIHZlY3RvciA9IHZlY3Rvci50bzFEQXJyYXkoKTtcbiAgICB9IGVsc2UgaWYgKGNvcHkpIHtcbiAgICAgICAgdmVjdG9yID0gW10uY29uY2F0KHZlY3Rvcik7XG4gICAgfVxuICAgIGlmICh2ZWN0b3IubGVuZ3RoICE9PSBtYXRyaXgucm93cylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZlY3RvciBzaXplIG11c3QgYmUgdGhlIHNhbWUgYXMgdGhlIG51bWJlciBvZiByb3dzJyk7XG4gICAgcmV0dXJuIHZlY3Rvcjtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCBhIGNvbHVtbiBpbmRleCBpcyBub3Qgb3V0IG9mIGJvdW5kc1xuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtudW1iZXJ9IGluZGV4XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvdXRlcl1cbiAqL1xuZnVuY3Rpb24gY2hlY2tDb2x1bW5JbmRleChtYXRyaXgsIGluZGV4LCBvdXRlcikge1xuICAgIHZhciBtYXggPSBvdXRlciA/IG1hdHJpeC5jb2x1bW5zIDogbWF0cml4LmNvbHVtbnMgLSAxO1xuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiBtYXgpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdDb2x1bW4gaW5kZXggb3V0IG9mIHJhbmdlJyk7XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgdHdvIG1hdHJpY2VzIGhhdmUgdGhlIHNhbWUgZGltZW5zaW9uc1xuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtNYXRyaXh9IG90aGVyTWF0cml4XG4gKi9cbmZ1bmN0aW9uIGNoZWNrRGltZW5zaW9ucyhtYXRyaXgsIG90aGVyTWF0cml4KSB7XG4gICAgaWYgKG1hdHJpeC5yb3dzICE9PSBvdGhlck1hdHJpeC5sZW5ndGggfHxcbiAgICAgICAgbWF0cml4LmNvbHVtbnMgIT09IG90aGVyTWF0cml4WzBdLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTWF0cmljZXMgZGltZW5zaW9ucyBtdXN0IGJlIGVxdWFsJyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjb21wYXJlTnVtYmVycyhhLCBiKSB7XG4gICAgcmV0dXJuIGEgLSBiO1xufVxuXG4vKlxuU3lub255bXNcbiAqL1xuXG5NYXRyaXgucmFuZG9tID0gTWF0cml4LnJhbmQ7XG5NYXRyaXguZGlhZ29uYWwgPSBNYXRyaXguZGlhZztcbk1hdHJpeC5wcm90b3R5cGUuZGlhZ29uYWwgPSBNYXRyaXgucHJvdG90eXBlLmRpYWc7XG5NYXRyaXguaWRlbnRpdHkgPSBNYXRyaXguZXllO1xuTWF0cml4LnByb3RvdHlwZS5uZWdhdGUgPSBNYXRyaXgucHJvdG90eXBlLm5lZztcblxuLypcbkFkZCBkeW5hbWljYWxseSBpbnN0YW5jZSBhbmQgc3RhdGljIG1ldGhvZHMgZm9yIG1hdGhlbWF0aWNhbCBvcGVyYXRpb25zXG4gKi9cblxudmFyIGlucGxhY2VPcGVyYXRvciA9IGBcbihmdW5jdGlvbiAlbmFtZSUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIHRoaXMuJW5hbWUlUyh2YWx1ZSk7XG4gICAgcmV0dXJuIHRoaXMuJW5hbWUlTSh2YWx1ZSk7XG59KVxuYDtcblxudmFyIGlucGxhY2VPcGVyYXRvclNjYWxhciA9IGBcbihmdW5jdGlvbiAlbmFtZSVTKHZhbHVlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2pdID0gdGhpc1tpXVtqXSAlb3AlIHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufSlcbmA7XG5cbnZhciBpbnBsYWNlT3BlcmF0b3JNYXRyaXggPSBgXG4oZnVuY3Rpb24gJW5hbWUlTShtYXRyaXgpIHtcbiAgICBjaGVja0RpbWVuc2lvbnModGhpcywgbWF0cml4KTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1bal0gPSB0aGlzW2ldW2pdICVvcCUgbWF0cml4W2ldW2pdO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufSlcbmA7XG5cbnZhciBzdGF0aWNPcGVyYXRvciA9IGBcbihmdW5jdGlvbiAlbmFtZSUobWF0cml4LCB2YWx1ZSkge1xuICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KG1hdHJpeCk7XG4gICAgcmV0dXJuIG5ld01hdHJpeC4lbmFtZSUodmFsdWUpO1xufSlcbmA7XG5cbnZhciBpbnBsYWNlTWV0aG9kID0gYFxuKGZ1bmN0aW9uICVuYW1lJSgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1bal0gPSAlbWV0aG9kJSh0aGlzW2ldW2pdKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbn0pXG5gO1xuXG52YXIgc3RhdGljTWV0aG9kID0gYFxuKGZ1bmN0aW9uICVuYW1lJShtYXRyaXgpIHtcbiAgICB2YXIgbmV3TWF0cml4ID0gbmV3IE1hdHJpeChtYXRyaXgpO1xuICAgIHJldHVybiBuZXdNYXRyaXguJW5hbWUlKCk7XG59KVxuYDtcblxudmFyIG9wZXJhdG9ycyA9IFtcbiAgICAvLyBBcml0aG1ldGljIG9wZXJhdG9yc1xuICAgIFsnKycsICdhZGQnXSxcbiAgICBbJy0nLCAnc3ViJywgJ3N1YnRyYWN0J10sXG4gICAgWycqJywgJ211bCcsICdtdWx0aXBseSddLFxuICAgIFsnLycsICdkaXYnLCAnZGl2aWRlJ10sXG4gICAgWyclJywgJ21vZCcsICdtb2R1bHVzJ10sXG4gICAgLy8gQml0d2lzZSBvcGVyYXRvcnNcbiAgICBbJyYnLCAnYW5kJ10sXG4gICAgWyd8JywgJ29yJ10sXG4gICAgWydeJywgJ3hvciddLFxuICAgIFsnPDwnLCAnbGVmdFNoaWZ0J10sXG4gICAgWyc+PicsICdzaWduUHJvcGFnYXRpbmdSaWdodFNoaWZ0J10sXG4gICAgWyc+Pj4nLCAncmlnaHRTaGlmdCcsICd6ZXJvRmlsbFJpZ2h0U2hpZnQnXVxuXTtcblxuZm9yICh2YXIgb3BlcmF0b3Igb2Ygb3BlcmF0b3JzKSB7XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBvcGVyYXRvci5sZW5ndGg7IGkrKykge1xuICAgICAgICBNYXRyaXgucHJvdG90eXBlW29wZXJhdG9yW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU9wZXJhdG9yLCB7bmFtZTogb3BlcmF0b3JbaV0sIG9wOiBvcGVyYXRvclswXX0pKTtcbiAgICAgICAgTWF0cml4LnByb3RvdHlwZVtvcGVyYXRvcltpXSArICdTJ10gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKGlucGxhY2VPcGVyYXRvclNjYWxhciwge25hbWU6IG9wZXJhdG9yW2ldICsgJ1MnLCBvcDogb3BlcmF0b3JbMF19KSk7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbb3BlcmF0b3JbaV0gKyAnTSddID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihpbnBsYWNlT3BlcmF0b3JNYXRyaXgsIHtuYW1lOiBvcGVyYXRvcltpXSArICdNJywgb3A6IG9wZXJhdG9yWzBdfSkpO1xuXG4gICAgICAgIE1hdHJpeFtvcGVyYXRvcltpXV0gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKHN0YXRpY09wZXJhdG9yLCB7bmFtZTogb3BlcmF0b3JbaV19KSk7XG4gICAgfVxufVxuXG52YXIgbWV0aG9kcyA9IFtcbiAgICBbJ34nLCAnbm90J11cbl07XG5cbltcbiAgICAnYWJzJywgJ2Fjb3MnLCAnYWNvc2gnLCAnYXNpbicsICdhc2luaCcsICdhdGFuJywgJ2F0YW5oJywgJ2NicnQnLCAnY2VpbCcsXG4gICAgJ2NsejMyJywgJ2NvcycsICdjb3NoJywgJ2V4cCcsICdleHBtMScsICdmbG9vcicsICdmcm91bmQnLCAnbG9nJywgJ2xvZzFwJyxcbiAgICAnbG9nMTAnLCAnbG9nMicsICdyb3VuZCcsICdzaWduJywgJ3NpbicsICdzaW5oJywgJ3NxcnQnLCAndGFuJywgJ3RhbmgnLCAndHJ1bmMnXG5dLmZvckVhY2goZnVuY3Rpb24gKG1hdGhNZXRob2QpIHtcbiAgICBtZXRob2RzLnB1c2goWydNYXRoLicgKyBtYXRoTWV0aG9kLCBtYXRoTWV0aG9kXSk7XG59KTtcblxuZm9yICh2YXIgbWV0aG9kIG9mIG1ldGhvZHMpIHtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IG1ldGhvZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBNYXRyaXgucHJvdG90eXBlW21ldGhvZFtpXV0gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKGlucGxhY2VNZXRob2QsIHtuYW1lOiBtZXRob2RbaV0sIG1ldGhvZDogbWV0aG9kWzBdfSkpO1xuICAgICAgICBNYXRyaXhbbWV0aG9kW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oc3RhdGljTWV0aG9kLCB7bmFtZTogbWV0aG9kW2ldfSkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZmlsbFRlbXBsYXRlRnVuY3Rpb24odGVtcGxhdGUsIHZhbHVlcykge1xuICAgIGZvciAodmFyIGkgaW4gdmFsdWVzKSB7XG4gICAgICAgIHRlbXBsYXRlID0gdGVtcGxhdGUucmVwbGFjZShuZXcgUmVnRXhwKCclJyArIGkgKyAnJScsICdnJyksIHZhbHVlc1tpXSk7XG4gICAgfVxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gY29tcGFyZU51bWJlcnMoYSwgYikge1xuICAgIHJldHVybiBhIC0gYjtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgc3VtIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5zdW0gPSBmdW5jdGlvbiBzdW0odmFsdWVzKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1heGltdW0gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLm1heCA9IGZ1bmN0aW9uIG1heCh2YWx1ZXMpIHtcbiAgICB2YXIgbWF4ID0gLUluZmluaXR5O1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAodmFsdWVzW2ldID4gbWF4KSBtYXggPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBtYXg7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtaW5pbXVtIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5taW4gPSBmdW5jdGlvbiBtaW4odmFsdWVzKSB7XG4gICAgdmFyIG1pbiA9IEluZmluaXR5O1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAodmFsdWVzW2ldIDwgbWluKSBtaW4gPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBtaW47XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtaW4gYW5kIG1heCBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHt7bWluOiBudW1iZXIsIG1heDogbnVtYmVyfX1cbiAqL1xuZXhwb3J0cy5taW5NYXggPSBmdW5jdGlvbiBtaW5NYXgodmFsdWVzKSB7XG4gICAgdmFyIG1pbiA9IEluZmluaXR5O1xuICAgIHZhciBtYXggPSAtSW5maW5pdHk7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPCBtaW4pIG1pbiA9IHZhbHVlc1tpXTtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA+IG1heCkgbWF4ID0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBtaW46IG1pbixcbiAgICAgICAgbWF4OiBtYXhcbiAgICB9O1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgYXJpdGhtZXRpYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5hcml0aG1ldGljTWVhbiA9IGZ1bmN0aW9uIGFyaXRobWV0aWNNZWFuKHZhbHVlcykge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gbDtcbn07XG5cbi8qKlxuICoge0BsaW5rIGFyaXRobWV0aWNNZWFufVxuICovXG5leHBvcnRzLm1lYW4gPSBleHBvcnRzLmFyaXRobWV0aWNNZWFuO1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBnZW9tZXRyaWMgbWVhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuZ2VvbWV0cmljTWVhbiA9IGZ1bmN0aW9uIGdlb21ldHJpY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIG11bCA9IDE7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIG11bCAqPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBNYXRoLnBvdyhtdWwsIDEgLyBsKTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1lYW4gb2YgdGhlIGxvZyBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBJZiB0aGUgcmV0dXJuIHZhbHVlIGlzIGV4cG9uZW50aWF0ZWQsIGl0IGdpdmVzIHRoZSBzYW1lIHJlc3VsdCBhcyB0aGVcbiAqIGdlb21ldHJpYyBtZWFuLlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmxvZ01lYW4gPSBmdW5jdGlvbiBsb2dNZWFuKHZhbHVlcykge1xuICAgIHZhciBsbnN1bSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGxuc3VtICs9IE1hdGgubG9nKHZhbHVlc1tpXSk7XG4gICAgfVxuICAgIHJldHVybiBsbnN1bSAvIGw7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSB3ZWlnaHRlZCBncmFuZCBtZWFuIGZvciBhIGxpc3Qgb2YgbWVhbnMgYW5kIHNhbXBsZSBzaXplc1xuICogQHBhcmFtIHtBcnJheX0gbWVhbnMgLSBNZWFuIHZhbHVlcyBmb3IgZWFjaCBzZXQgb2Ygc2FtcGxlc1xuICogQHBhcmFtIHtBcnJheX0gc2FtcGxlcyAtIE51bWJlciBvZiBvcmlnaW5hbCB2YWx1ZXMgZm9yIGVhY2ggc2V0IG9mIHNhbXBsZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuZ3JhbmRNZWFuID0gZnVuY3Rpb24gZ3JhbmRNZWFuKG1lYW5zLCBzYW1wbGVzKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgdmFyIG4gPSAwO1xuICAgIHZhciBsID0gbWVhbnMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHN1bSArPSBzYW1wbGVzW2ldICogbWVhbnNbaV07XG4gICAgICAgIG4gKz0gc2FtcGxlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHN1bSAvIG47XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSB0cnVuY2F0ZWQgbWVhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzIHVzaW5nIGEgZ2l2ZW4gcGVyY2VudGFnZVxuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcGFyYW0ge251bWJlcn0gcGVyY2VudCAtIFRoZSBwZXJjZW50YWdlIG9mIHZhbHVlcyB0byBrZWVwIChyYW5nZTogWzAsMV0pXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFthbHJlYWR5U29ydGVkPWZhbHNlXVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy50cnVuY2F0ZWRNZWFuID0gZnVuY3Rpb24gdHJ1bmNhdGVkTWVhbih2YWx1ZXMsIHBlcmNlbnQsIGFscmVhZHlTb3J0ZWQpIHtcbiAgICBpZiAoYWxyZWFkeVNvcnRlZCA9PT0gdW5kZWZpbmVkKSBhbHJlYWR5U29ydGVkID0gZmFsc2U7XG4gICAgaWYgKCFhbHJlYWR5U29ydGVkKSB7XG4gICAgICAgIHZhbHVlcyA9IHZhbHVlcy5zbGljZSgpLnNvcnQoY29tcGFyZU51bWJlcnMpO1xuICAgIH1cbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgdmFyIGsgPSBNYXRoLmZsb29yKGwgKiBwZXJjZW50KTtcbiAgICB2YXIgc3VtID0gMDtcbiAgICBmb3IgKHZhciBpID0gazsgaSA8IChsIC0gayk7IGkrKykge1xuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gKGwgLSAyICogayk7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBoYXJtb25pYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5oYXJtb25pY01lYW4gPSBmdW5jdGlvbiBoYXJtb25pY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd2YWx1ZSBhdCBpbmRleCAnICsgaSArICdpcyB6ZXJvJyk7XG4gICAgICAgIH1cbiAgICAgICAgc3VtICs9IDEgLyB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBsIC8gc3VtO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgY29udHJhaGFybW9uaWMgbWVhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMuY29udHJhSGFybW9uaWNNZWFuID0gZnVuY3Rpb24gY29udHJhSGFybW9uaWNNZWFuKHZhbHVlcykge1xuICAgIHZhciByMSA9IDA7XG4gICAgdmFyIHIyID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgcjEgKz0gdmFsdWVzW2ldICogdmFsdWVzW2ldO1xuICAgICAgICByMiArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIGlmIChyMiA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3N1bSBvZiB2YWx1ZXMgaXMgbmVnYXRpdmUnKTtcbiAgICB9XG4gICAgcmV0dXJuIHIxIC8gcjI7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBtZWRpYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFthbHJlYWR5U29ydGVkPWZhbHNlXVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5tZWRpYW4gPSBmdW5jdGlvbiBtZWRpYW4odmFsdWVzLCBhbHJlYWR5U29ydGVkKSB7XG4gICAgaWYgKGFscmVhZHlTb3J0ZWQgPT09IHVuZGVmaW5lZCkgYWxyZWFkeVNvcnRlZCA9IGZhbHNlO1xuICAgIGlmICghYWxyZWFkeVNvcnRlZCkge1xuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKS5zb3J0KGNvbXBhcmVOdW1iZXJzKTtcbiAgICB9XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIHZhciBoYWxmID0gTWF0aC5mbG9vcihsIC8gMik7XG4gICAgaWYgKGwgJSAyID09PSAwKSB7XG4gICAgICAgIHJldHVybiAodmFsdWVzW2hhbGYgLSAxXSArIHZhbHVlc1toYWxmXSkgKiAwLjU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlc1toYWxmXTtcbiAgICB9XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSB2YXJpYW5jZSBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3VuYmlhc2VkPXRydWVdIC0gaWYgdHJ1ZSwgZGl2aWRlIGJ5IChuLTEpOyBpZiBmYWxzZSwgZGl2aWRlIGJ5IG4uXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnZhcmlhbmNlID0gZnVuY3Rpb24gdmFyaWFuY2UodmFsdWVzLCB1bmJpYXNlZCkge1xuICAgIGlmICh1bmJpYXNlZCA9PT0gdW5kZWZpbmVkKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4odmFsdWVzKTtcbiAgICB2YXIgdGhlVmFyaWFuY2UgPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciB4ID0gdmFsdWVzW2ldIC0gdGhlTWVhbjtcbiAgICAgICAgdGhlVmFyaWFuY2UgKz0geCAqIHg7XG4gICAgfVxuXG4gICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgIHJldHVybiB0aGVWYXJpYW5jZSAvIChsIC0gMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoZVZhcmlhbmNlIC8gbDtcbiAgICB9XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBzdGFuZGFyZCBkZXZpYXRpb24gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFt1bmJpYXNlZD10cnVlXSAtIGlmIHRydWUsIGRpdmlkZSBieSAobi0xKTsgaWYgZmFsc2UsIGRpdmlkZSBieSBuLlxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5zdGFuZGFyZERldmlhdGlvbiA9IGZ1bmN0aW9uIHN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcywgdW5iaWFzZWQpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGV4cG9ydHMudmFyaWFuY2UodmFsdWVzLCB1bmJpYXNlZCkpO1xufTtcblxuZXhwb3J0cy5zdGFuZGFyZEVycm9yID0gZnVuY3Rpb24gc3RhbmRhcmRFcnJvcih2YWx1ZXMpIHtcbiAgICByZXR1cm4gZXhwb3J0cy5zdGFuZGFyZERldmlhdGlvbih2YWx1ZXMpIC8gTWF0aC5zcXJ0KHZhbHVlcy5sZW5ndGgpO1xufTtcblxuZXhwb3J0cy5xdWFydGlsZXMgPSBmdW5jdGlvbiBxdWFydGlsZXModmFsdWVzLCBhbHJlYWR5U29ydGVkKSB7XG4gICAgaWYgKHR5cGVvZihhbHJlYWR5U29ydGVkKSA9PT0gJ3VuZGVmaW5lZCcpIGFscmVhZHlTb3J0ZWQgPSBmYWxzZTtcbiAgICBpZiAoIWFscmVhZHlTb3J0ZWQpIHtcbiAgICAgICAgdmFsdWVzID0gdmFsdWVzLnNsaWNlKCk7XG4gICAgICAgIHZhbHVlcy5zb3J0KGNvbXBhcmVOdW1iZXJzKTtcbiAgICB9XG5cbiAgICB2YXIgcXVhcnQgPSB2YWx1ZXMubGVuZ3RoIC8gNDtcbiAgICB2YXIgcTEgPSB2YWx1ZXNbTWF0aC5jZWlsKHF1YXJ0KSAtIDFdO1xuICAgIHZhciBxMiA9IGV4cG9ydHMubWVkaWFuKHZhbHVlcywgdHJ1ZSk7XG4gICAgdmFyIHEzID0gdmFsdWVzW01hdGguY2VpbChxdWFydCAqIDMpIC0gMV07XG5cbiAgICByZXR1cm4ge3ExOiBxMSwgcTI6IHEyLCBxMzogcTN9O1xufTtcblxuZXhwb3J0cy5wb29sZWRTdGFuZGFyZERldmlhdGlvbiA9IGZ1bmN0aW9uIHBvb2xlZFN0YW5kYXJkRGV2aWF0aW9uKHNhbXBsZXMsIHVuYmlhc2VkKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChleHBvcnRzLnBvb2xlZFZhcmlhbmNlKHNhbXBsZXMsIHVuYmlhc2VkKSk7XG59O1xuXG5leHBvcnRzLnBvb2xlZFZhcmlhbmNlID0gZnVuY3Rpb24gcG9vbGVkVmFyaWFuY2Uoc2FtcGxlcywgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbGVuZ3RoID0gMCwgbCA9IHNhbXBsZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciB2YWx1ZXMgPSBzYW1wbGVzW2ldO1xuICAgICAgICB2YXIgdmFyaSA9IGV4cG9ydHMudmFyaWFuY2UodmFsdWVzKTtcblxuICAgICAgICBzdW0gKz0gKHZhbHVlcy5sZW5ndGggLSAxKSAqIHZhcmk7XG5cbiAgICAgICAgaWYgKHVuYmlhc2VkKVxuICAgICAgICAgICAgbGVuZ3RoICs9IHZhbHVlcy5sZW5ndGggLSAxO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBsZW5ndGggKz0gdmFsdWVzLmxlbmd0aDtcbiAgICB9XG4gICAgcmV0dXJuIHN1bSAvIGxlbmd0aDtcbn07XG5cbmV4cG9ydHMubW9kZSA9IGZ1bmN0aW9uIG1vZGUodmFsdWVzKSB7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoLFxuICAgICAgICBpdGVtQ291bnQgPSBuZXcgQXJyYXkobCksXG4gICAgICAgIGk7XG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpdGVtQ291bnRbaV0gPSAwO1xuICAgIH1cbiAgICB2YXIgaXRlbUFycmF5ID0gbmV3IEFycmF5KGwpO1xuICAgIHZhciBjb3VudCA9IDA7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGl0ZW1BcnJheS5pbmRleE9mKHZhbHVlc1tpXSk7XG4gICAgICAgIGlmIChpbmRleCA+PSAwKVxuICAgICAgICAgICAgaXRlbUNvdW50W2luZGV4XSsrO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGl0ZW1BcnJheVtjb3VudF0gPSB2YWx1ZXNbaV07XG4gICAgICAgICAgICBpdGVtQ291bnRbY291bnRdID0gMTtcbiAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWF4VmFsdWUgPSAwLCBtYXhJbmRleCA9IDA7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICAgICAgaWYgKGl0ZW1Db3VudFtpXSA+IG1heFZhbHVlKSB7XG4gICAgICAgICAgICBtYXhWYWx1ZSA9IGl0ZW1Db3VudFtpXTtcbiAgICAgICAgICAgIG1heEluZGV4ID0gaTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpdGVtQXJyYXlbbWF4SW5kZXhdO1xufTtcblxuZXhwb3J0cy5jb3ZhcmlhbmNlID0gZnVuY3Rpb24gY292YXJpYW5jZSh2ZWN0b3IxLCB2ZWN0b3IyLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciBtZWFuMSA9IGV4cG9ydHMubWVhbih2ZWN0b3IxKTtcbiAgICB2YXIgbWVhbjIgPSBleHBvcnRzLm1lYW4odmVjdG9yMik7XG5cbiAgICBpZiAodmVjdG9yMS5sZW5ndGggIT09IHZlY3RvcjIubGVuZ3RoKVxuICAgICAgICB0aHJvdyBcIlZlY3RvcnMgZG8gbm90IGhhdmUgdGhlIHNhbWUgZGltZW5zaW9uc1wiO1xuXG4gICAgdmFyIGNvdiA9IDAsIGwgPSB2ZWN0b3IxLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgeCA9IHZlY3RvcjFbaV0gLSBtZWFuMTtcbiAgICAgICAgdmFyIHkgPSB2ZWN0b3IyW2ldIC0gbWVhbjI7XG4gICAgICAgIGNvdiArPSB4ICogeTtcbiAgICB9XG5cbiAgICBpZiAodW5iaWFzZWQpXG4gICAgICAgIHJldHVybiBjb3YgLyAobCAtIDEpO1xuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIGNvdiAvIGw7XG59O1xuXG5leHBvcnRzLnNrZXduZXNzID0gZnVuY3Rpb24gc2tld25lc3ModmFsdWVzLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciB0aGVNZWFuID0gZXhwb3J0cy5tZWFuKHZhbHVlcyk7XG5cbiAgICB2YXIgczIgPSAwLCBzMyA9IDAsIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciBkZXYgPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICBzMiArPSBkZXYgKiBkZXY7XG4gICAgICAgIHMzICs9IGRldiAqIGRldiAqIGRldjtcbiAgICB9XG4gICAgdmFyIG0yID0gczIgLyBsO1xuICAgIHZhciBtMyA9IHMzIC8gbDtcblxuICAgIHZhciBnID0gbTMgLyAoTWF0aC5wb3cobTIsIDMgLyAyLjApKTtcbiAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgdmFyIGEgPSBNYXRoLnNxcnQobCAqIChsIC0gMSkpO1xuICAgICAgICB2YXIgYiA9IGwgLSAyO1xuICAgICAgICByZXR1cm4gKGEgLyBiKSAqIGc7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gZztcbiAgICB9XG59O1xuXG5leHBvcnRzLmt1cnRvc2lzID0gZnVuY3Rpb24ga3VydG9zaXModmFsdWVzLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciB0aGVNZWFuID0gZXhwb3J0cy5tZWFuKHZhbHVlcyk7XG4gICAgdmFyIG4gPSB2YWx1ZXMubGVuZ3RoLCBzMiA9IDAsIHM0ID0gMDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHZhciBkZXYgPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICBzMiArPSBkZXYgKiBkZXY7XG4gICAgICAgIHM0ICs9IGRldiAqIGRldiAqIGRldiAqIGRldjtcbiAgICB9XG4gICAgdmFyIG0yID0gczIgLyBuO1xuICAgIHZhciBtNCA9IHM0IC8gbjtcblxuICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICB2YXIgdiA9IHMyIC8gKG4gLSAxKTtcbiAgICAgICAgdmFyIGEgPSAobiAqIChuICsgMSkpIC8gKChuIC0gMSkgKiAobiAtIDIpICogKG4gLSAzKSk7XG4gICAgICAgIHZhciBiID0gczQgLyAodiAqIHYpO1xuICAgICAgICB2YXIgYyA9ICgobiAtIDEpICogKG4gLSAxKSkgLyAoKG4gLSAyKSAqIChuIC0gMykpO1xuXG4gICAgICAgIHJldHVybiBhICogYiAtIDMgKiBjO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG00IC8gKG0yICogbTIpIC0gMztcbiAgICB9XG59O1xuXG5leHBvcnRzLmVudHJvcHkgPSBmdW5jdGlvbiBlbnRyb3B5KHZhbHVlcywgZXBzKSB7XG4gICAgaWYgKHR5cGVvZihlcHMpID09PSAndW5kZWZpbmVkJykgZXBzID0gMDtcbiAgICB2YXIgc3VtID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV0gKiBNYXRoLmxvZyh2YWx1ZXNbaV0gKyBlcHMpO1xuICAgIHJldHVybiAtc3VtO1xufTtcblxuZXhwb3J0cy53ZWlnaHRlZE1lYW4gPSBmdW5jdGlvbiB3ZWlnaHRlZE1lYW4odmFsdWVzLCB3ZWlnaHRzKSB7XG4gICAgdmFyIHN1bSA9IDAsIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKVxuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldICogd2VpZ2h0c1tpXTtcbiAgICByZXR1cm4gc3VtO1xufTtcblxuZXhwb3J0cy53ZWlnaHRlZFN0YW5kYXJkRGV2aWF0aW9uID0gZnVuY3Rpb24gd2VpZ2h0ZWRTdGFuZGFyZERldmlhdGlvbih2YWx1ZXMsIHdlaWdodHMpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGV4cG9ydHMud2VpZ2h0ZWRWYXJpYW5jZSh2YWx1ZXMsIHdlaWdodHMpKTtcbn07XG5cbmV4cG9ydHMud2VpZ2h0ZWRWYXJpYW5jZSA9IGZ1bmN0aW9uIHdlaWdodGVkVmFyaWFuY2UodmFsdWVzLCB3ZWlnaHRzKSB7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLndlaWdodGVkTWVhbih2YWx1ZXMsIHdlaWdodHMpO1xuICAgIHZhciB2YXJpID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgdmFyIGEgPSAwLCBiID0gMDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciB6ID0gdmFsdWVzW2ldIC0gdGhlTWVhbjtcbiAgICAgICAgdmFyIHcgPSB3ZWlnaHRzW2ldO1xuXG4gICAgICAgIHZhcmkgKz0gdyAqICh6ICogeik7XG4gICAgICAgIGIgKz0gdztcbiAgICAgICAgYSArPSB3ICogdztcbiAgICB9XG5cbiAgICByZXR1cm4gdmFyaSAqIChiIC8gKGIgKiBiIC0gYSkpO1xufTtcblxuZXhwb3J0cy5jZW50ZXIgPSBmdW5jdGlvbiBjZW50ZXIodmFsdWVzLCBpblBsYWNlKSB7XG4gICAgaWYgKHR5cGVvZihpblBsYWNlKSA9PT0gJ3VuZGVmaW5lZCcpIGluUGxhY2UgPSBmYWxzZTtcblxuICAgIHZhciByZXN1bHQgPSB2YWx1ZXM7XG4gICAgaWYgKCFpblBsYWNlKVxuICAgICAgICByZXN1bHQgPSB2YWx1ZXMuc2xpY2UoKTtcblxuICAgIHZhciB0aGVNZWFuID0gZXhwb3J0cy5tZWFuKHJlc3VsdCksIGwgPSByZXN1bHQubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKVxuICAgICAgICByZXN1bHRbaV0gLT0gdGhlTWVhbjtcbn07XG5cbmV4cG9ydHMuc3RhbmRhcmRpemUgPSBmdW5jdGlvbiBzdGFuZGFyZGl6ZSh2YWx1ZXMsIHN0YW5kYXJkRGV2LCBpblBsYWNlKSB7XG4gICAgaWYgKHR5cGVvZihzdGFuZGFyZERldikgPT09ICd1bmRlZmluZWQnKSBzdGFuZGFyZERldiA9IGV4cG9ydHMuc3RhbmRhcmREZXZpYXRpb24odmFsdWVzKTtcbiAgICBpZiAodHlwZW9mKGluUGxhY2UpID09PSAndW5kZWZpbmVkJykgaW5QbGFjZSA9IGZhbHNlO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgcmVzdWx0ID0gaW5QbGFjZSA/IHZhbHVlcyA6IG5ldyBBcnJheShsKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKylcbiAgICAgICAgcmVzdWx0W2ldID0gdmFsdWVzW2ldIC8gc3RhbmRhcmREZXY7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmV4cG9ydHMuY3VtdWxhdGl2ZVN1bSA9IGZ1bmN0aW9uIGN1bXVsYXRpdmVTdW0oYXJyYXkpIHtcbiAgICB2YXIgbCA9IGFycmF5Lmxlbmd0aDtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KGwpO1xuICAgIHJlc3VsdFswXSA9IGFycmF5WzBdO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbDsgaSsrKVxuICAgICAgICByZXN1bHRbaV0gPSByZXN1bHRbaSAtIDFdICsgYXJyYXlbaV07XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuYXJyYXkgPSByZXF1aXJlKCcuL2FycmF5Jyk7XG5leHBvcnRzLm1hdHJpeCA9IHJlcXVpcmUoJy4vbWF0cml4Jyk7XG4iLCIndXNlIHN0cmljdCc7XG52YXIgYXJyYXlTdGF0ID0gcmVxdWlyZSgnLi9hcnJheScpO1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vYWNjb3JkLW5ldC9mcmFtZXdvcmsvYmxvYi9kZXZlbG9wbWVudC9Tb3VyY2VzL0FjY29yZC5TdGF0aXN0aWNzL1Rvb2xzLmNzXG5cbmZ1bmN0aW9uIGVudHJvcHkobWF0cml4LCBlcHMpIHtcbiAgICBpZiAodHlwZW9mKGVwcykgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGVwcyA9IDA7XG4gICAgfVxuICAgIHZhciBzdW0gPSAwLFxuICAgICAgICBsMSA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGwyID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGwxOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsMjsgaisrKSB7XG4gICAgICAgICAgICBzdW0gKz0gbWF0cml4W2ldW2pdICogTWF0aC5sb2cobWF0cml4W2ldW2pdICsgZXBzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gLXN1bTtcbn1cblxuZnVuY3Rpb24gbWVhbihtYXRyaXgsIGRpbWVuc2lvbikge1xuICAgIGlmICh0eXBlb2YoZGltZW5zaW9uKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGltZW5zaW9uID0gMDtcbiAgICB9XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgdGhlTWVhbiwgTiwgaSwgajtcblxuICAgIGlmIChkaW1lbnNpb24gPT09IC0xKSB7XG4gICAgICAgIHRoZU1lYW4gPSBbMF07XG4gICAgICAgIE4gPSByb3dzICogY29scztcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoZU1lYW5bMF0gKz0gbWF0cml4W2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoZU1lYW5bMF0gLz0gTjtcbiAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMCkge1xuICAgICAgICB0aGVNZWFuID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBOID0gcm93cztcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgdGhlTWVhbltqXSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGhlTWVhbltqXSArPSBtYXRyaXhbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGVNZWFuW2pdIC89IE47XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMSkge1xuICAgICAgICB0aGVNZWFuID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBOID0gY29scztcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgdGhlTWVhbltqXSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGhlTWVhbltqXSArPSBtYXRyaXhbal1baV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGVNZWFuW2pdIC89IE47XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuICAgIHJldHVybiB0aGVNZWFuO1xufVxuXG5mdW5jdGlvbiBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgsIG1lYW5zLCB1bmJpYXNlZCkge1xuICAgIHZhciB2YXJpID0gdmFyaWFuY2UobWF0cml4LCBtZWFucywgdW5iaWFzZWQpLCBsID0gdmFyaS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyaVtpXSA9IE1hdGguc3FydCh2YXJpW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhcmk7XG59XG5cbmZ1bmN0aW9uIHZhcmlhbmNlKG1hdHJpeCwgbWVhbnMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgbWVhbnMgPSBtZWFucyB8fCBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSByZXR1cm4gW107XG4gICAgdmFyIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIHZhciB2YXJpID0gbmV3IEFycmF5KGNvbHMpO1xuXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgdmFyIHN1bTEgPSAwLCBzdW0yID0gMCwgeCA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICB4ID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgICAgICBzdW0xICs9IHg7XG4gICAgICAgICAgICBzdW0yICs9IHggKiB4O1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICAgICAgdmFyaVtqXSA9IChzdW0yIC0gKChzdW0xICogc3VtMSkgLyByb3dzKSkgLyAocm93cyAtIDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyaVtqXSA9IChzdW0yIC0gKChzdW0xICogc3VtMSkgLyByb3dzKSkgLyByb3dzO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YXJpO1xufVxuXG5mdW5jdGlvbiBtZWRpYW4obWF0cml4KSB7XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoLCBjb2xzID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICB2YXIgbWVkaWFucyA9IG5ldyBBcnJheShjb2xzKTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgIHZhciBkYXRhID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgZGF0YVtqXSA9IG1hdHJpeFtqXVtpXTtcbiAgICAgICAgfVxuICAgICAgICBkYXRhLnNvcnQoKTtcbiAgICAgICAgdmFyIE4gPSBkYXRhLmxlbmd0aDtcbiAgICAgICAgaWYgKE4gJSAyID09PSAwKSB7XG4gICAgICAgICAgICBtZWRpYW5zW2ldID0gKGRhdGFbTiAvIDJdICsgZGF0YVsoTiAvIDIpIC0gMV0pICogMC41O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbWVkaWFuc1tpXSA9IGRhdGFbTWF0aC5mbG9vcihOIC8gMildO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtZWRpYW5zO1xufVxuXG5mdW5jdGlvbiBtb2RlKG1hdHJpeCkge1xuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIG1vZGVzID0gbmV3IEFycmF5KGNvbHMpLFxuICAgICAgICBpLCBqO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgdmFyIGl0ZW1Db3VudCA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCByb3dzOyBrKyspIHtcbiAgICAgICAgICAgIGl0ZW1Db3VudFtrXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGl0ZW1BcnJheSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgdmFyIGNvdW50ID0gMDtcblxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSBpdGVtQXJyYXkuaW5kZXhPZihtYXRyaXhbal1baV0pO1xuICAgICAgICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICBpdGVtQ291bnRbaW5kZXhdKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGl0ZW1BcnJheVtjb3VudF0gPSBtYXRyaXhbal1baV07XG4gICAgICAgICAgICAgICAgaXRlbUNvdW50W2NvdW50XSA9IDE7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYXhWYWx1ZSA9IDAsIG1heEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgIGlmIChpdGVtQ291bnRbal0gPiBtYXhWYWx1ZSkge1xuICAgICAgICAgICAgICAgIG1heFZhbHVlID0gaXRlbUNvdW50W2pdO1xuICAgICAgICAgICAgICAgIG1heEluZGV4ID0gajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG1vZGVzW2ldID0gaXRlbUFycmF5W21heEluZGV4XTtcbiAgICB9XG4gICAgcmV0dXJuIG1vZGVzO1xufVxuXG5mdW5jdGlvbiBza2V3bmVzcyhtYXRyaXgsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpO1xuICAgIHZhciBuID0gbWF0cml4Lmxlbmd0aCwgbCA9IG1lYW5zLmxlbmd0aDtcbiAgICB2YXIgc2tldyA9IG5ldyBBcnJheShsKTtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbDsgaisrKSB7XG4gICAgICAgIHZhciBzMiA9IDAsIHMzID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkZXYgPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgICAgIHMzICs9IGRldiAqIGRldiAqIGRldjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtMiA9IHMyIC8gbjtcbiAgICAgICAgdmFyIG0zID0gczMgLyBuO1xuICAgICAgICB2YXIgZyA9IG0zIC8gTWF0aC5wb3cobTIsIDMgLyAyKTtcblxuICAgICAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgICAgIHZhciBhID0gTWF0aC5zcXJ0KG4gKiAobiAtIDEpKTtcbiAgICAgICAgICAgIHZhciBiID0gbiAtIDI7XG4gICAgICAgICAgICBza2V3W2pdID0gKGEgLyBiKSAqIGc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBza2V3W2pdID0gZztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2tldztcbn1cblxuZnVuY3Rpb24ga3VydG9zaXMobWF0cml4LCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciBtZWFucyA9IG1lYW4obWF0cml4KTtcbiAgICB2YXIgbiA9IG1hdHJpeC5sZW5ndGgsIG0gPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIHZhciBrdXJ0ID0gbmV3IEFycmF5KG0pO1xuXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBtOyBqKyspIHtcbiAgICAgICAgdmFyIHMyID0gMCwgczQgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgdmFyIGRldiA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgczIgKz0gZGV2ICogZGV2O1xuICAgICAgICAgICAgczQgKz0gZGV2ICogZGV2ICogZGV2ICogZGV2O1xuICAgICAgICB9XG4gICAgICAgIHZhciBtMiA9IHMyIC8gbjtcbiAgICAgICAgdmFyIG00ID0gczQgLyBuO1xuXG4gICAgICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICAgICAgdmFyIHYgPSBzMiAvIChuIC0gMSk7XG4gICAgICAgICAgICB2YXIgYSA9IChuICogKG4gKyAxKSkgLyAoKG4gLSAxKSAqIChuIC0gMikgKiAobiAtIDMpKTtcbiAgICAgICAgICAgIHZhciBiID0gczQgLyAodiAqIHYpO1xuICAgICAgICAgICAgdmFyIGMgPSAoKG4gLSAxKSAqIChuIC0gMSkpIC8gKChuIC0gMikgKiAobiAtIDMpKTtcbiAgICAgICAgICAgIGt1cnRbal0gPSBhICogYiAtIDMgKiBjO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga3VydFtqXSA9IG00IC8gKG0yICogbTIpIC0gMztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga3VydDtcbn1cblxuZnVuY3Rpb24gc3RhbmRhcmRFcnJvcihtYXRyaXgpIHtcbiAgICB2YXIgc2FtcGxlcyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgdmFyIHN0YW5kYXJkRGV2aWF0aW9ucyA9IHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCksIGwgPSBzdGFuZGFyZERldmlhdGlvbnMubGVuZ3RoO1xuICAgIHZhciBzdGFuZGFyZEVycm9ycyA9IG5ldyBBcnJheShsKTtcbiAgICB2YXIgc3FydE4gPSBNYXRoLnNxcnQoc2FtcGxlcyk7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICBzdGFuZGFyZEVycm9yc1tpXSA9IHN0YW5kYXJkRGV2aWF0aW9uc1tpXSAvIHNxcnROO1xuICAgIH1cbiAgICByZXR1cm4gc3RhbmRhcmRFcnJvcnM7XG59XG5cbmZ1bmN0aW9uIGNvdmFyaWFuY2UobWF0cml4LCBkaW1lbnNpb24pIHtcbiAgICByZXR1cm4gc2NhdHRlcihtYXRyaXgsIHVuZGVmaW5lZCwgZGltZW5zaW9uKTtcbn1cblxuZnVuY3Rpb24gc2NhdHRlcihtYXRyaXgsIGRpdmlzb3IsIGRpbWVuc2lvbikge1xuICAgIGlmICh0eXBlb2YoZGltZW5zaW9uKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGltZW5zaW9uID0gMDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZihkaXZpc29yKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMCkge1xuICAgICAgICAgICAgZGl2aXNvciA9IG1hdHJpeC5sZW5ndGggLSAxO1xuICAgICAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMSkge1xuICAgICAgICAgICAgZGl2aXNvciA9IG1hdHJpeFswXS5sZW5ndGggLSAxO1xuICAgICAgICB9XG4gICAgfVxuICAgIHZhciBtZWFucyA9IG1lYW4obWF0cml4LCBkaW1lbnNpb24pLFxuICAgICAgICByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gW1tdXTtcbiAgICB9XG4gICAgdmFyIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICBjb3YsIGksIGosIHMsIGs7XG5cbiAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgcm93czsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gKG1hdHJpeFtrXVtqXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhba11baV0gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgLz0gZGl2aXNvcjtcbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMSkge1xuICAgICAgICBjb3YgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGNvdltpXSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGNvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IChtYXRyaXhbal1ba10gLSBtZWFuc1tqXSkgKiAobWF0cml4W2ldW2tdIC0gbWVhbnNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzIC89IGRpdmlzb3I7XG4gICAgICAgICAgICAgICAgY292W2ldW2pdID0gcztcbiAgICAgICAgICAgICAgICBjb3Zbal1baV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRpbWVuc2lvbicpO1xuICAgIH1cblxuICAgIHJldHVybiBjb3Y7XG59XG5cbmZ1bmN0aW9uIGNvcnJlbGF0aW9uKG1hdHJpeCkge1xuICAgIHZhciBtZWFucyA9IG1lYW4obWF0cml4KSxcbiAgICAgICAgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4LCB0cnVlLCBtZWFucyksXG4gICAgICAgIHNjb3JlcyA9IHpTY29yZXMobWF0cml4LCBtZWFucywgc3RhbmRhcmREZXZpYXRpb25zKSxcbiAgICAgICAgcm93cyA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICBpLCBqO1xuXG4gICAgdmFyIGNvciA9IG5ldyBBcnJheShjb2xzKTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgIGNvcltpXSA9IG5ldyBBcnJheShjb2xzKTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICBmb3IgKGogPSBpOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgICAgICBmb3IgKHZhciBrID0gMCwgbCA9IHNjb3Jlcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcbiAgICAgICAgICAgICAgICBjICs9IHNjb3Jlc1trXVtqXSAqIHNjb3Jlc1trXVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGMgLz0gcm93cyAtIDE7XG4gICAgICAgICAgICBjb3JbaV1bal0gPSBjO1xuICAgICAgICAgICAgY29yW2pdW2ldID0gYztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29yO1xufVxuXG5mdW5jdGlvbiB6U2NvcmVzKG1hdHJpeCwgbWVhbnMsIHN0YW5kYXJkRGV2aWF0aW9ucykge1xuICAgIG1lYW5zID0gbWVhbnMgfHwgbWVhbihtYXRyaXgpO1xuICAgIGlmICh0eXBlb2Yoc3RhbmRhcmREZXZpYXRpb25zKSA9PT0gJ3VuZGVmaW5lZCcpIHN0YW5kYXJkRGV2aWF0aW9ucyA9IHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCwgdHJ1ZSwgbWVhbnMpO1xuICAgIHJldHVybiBzdGFuZGFyZGl6ZShjZW50ZXIobWF0cml4LCBtZWFucywgZmFsc2UpLCBzdGFuZGFyZERldmlhdGlvbnMsIHRydWUpO1xufVxuXG5mdW5jdGlvbiBjZW50ZXIobWF0cml4LCBtZWFucywgaW5QbGFjZSkge1xuICAgIG1lYW5zID0gbWVhbnMgfHwgbWVhbihtYXRyaXgpO1xuICAgIHZhciByZXN1bHQgPSBtYXRyaXgsXG4gICAgICAgIGwgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBpLCBqLCBqajtcblxuICAgIGlmICghaW5QbGFjZSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgQXJyYXkobCk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IG5ldyBBcnJheShtYXRyaXhbaV0ubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHJvdyA9IHJlc3VsdFtpXTtcbiAgICAgICAgZm9yIChqID0gMCwgamogPSByb3cubGVuZ3RoOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgcm93W2pdID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gc3RhbmRhcmRpemUobWF0cml4LCBzdGFuZGFyZERldmlhdGlvbnMsIGluUGxhY2UpIHtcbiAgICBpZiAodHlwZW9mKHN0YW5kYXJkRGV2aWF0aW9ucykgPT09ICd1bmRlZmluZWQnKSBzdGFuZGFyZERldmlhdGlvbnMgPSBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgpO1xuICAgIHZhciByZXN1bHQgPSBtYXRyaXgsXG4gICAgICAgIGwgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBpLCBqLCBqajtcblxuICAgIGlmICghaW5QbGFjZSkge1xuICAgICAgICByZXN1bHQgPSBuZXcgQXJyYXkobCk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IG5ldyBBcnJheShtYXRyaXhbaV0ubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHJlc3VsdFJvdyA9IHJlc3VsdFtpXTtcbiAgICAgICAgdmFyIHNvdXJjZVJvdyA9IG1hdHJpeFtpXTtcbiAgICAgICAgZm9yIChqID0gMCwgamogPSByZXN1bHRSb3cubGVuZ3RoOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgaWYgKHN0YW5kYXJkRGV2aWF0aW9uc1tqXSAhPT0gMCAmJiAhaXNOYU4oc3RhbmRhcmREZXZpYXRpb25zW2pdKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdFJvd1tqXSA9IHNvdXJjZVJvd1tqXSAvIHN0YW5kYXJkRGV2aWF0aW9uc1tqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiB3ZWlnaHRlZFZhcmlhbmNlKG1hdHJpeCwgd2VpZ2h0cykge1xuICAgIHZhciBtZWFucyA9IG1lYW4obWF0cml4KTtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHJldHVybiBbXTtcbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIHZhcmkgPSBuZXcgQXJyYXkoY29scyk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICB2YXIgc3VtID0gMDtcbiAgICAgICAgdmFyIGEgPSAwLCBiID0gMDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgdmFyIHogPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgICAgIHZhciB3ID0gd2VpZ2h0c1tpXTtcblxuICAgICAgICAgICAgc3VtICs9IHcgKiAoeiAqIHopO1xuICAgICAgICAgICAgYiArPSB3O1xuICAgICAgICAgICAgYSArPSB3ICogdztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhcmlbal0gPSBzdW0gKiAoYiAvIChiICogYiAtIGEpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFyaTtcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRNZWFuKG1hdHJpeCwgd2VpZ2h0cywgZGltZW5zaW9uKSB7XG4gICAgaWYgKHR5cGVvZihkaW1lbnNpb24pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkaW1lbnNpb24gPSAwO1xuICAgIH1cbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHJldHVybiBbXTtcbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIG1lYW5zLCBpLCBpaSwgaiwgdywgcm93O1xuXG4gICAgaWYgKGRpbWVuc2lvbiA9PT0gMCkge1xuICAgICAgICBtZWFucyA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgbWVhbnNbaV0gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHJvdyA9IG1hdHJpeFtpXTtcbiAgICAgICAgICAgIHcgPSB3ZWlnaHRzW2ldO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIG1lYW5zW2pdICs9IHJvd1tqXSAqIHc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMSkge1xuICAgICAgICBtZWFucyA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgbWVhbnNbaV0gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgIHJvdyA9IG1hdHJpeFtqXTtcbiAgICAgICAgICAgIHcgPSB3ZWlnaHRzW2pdO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgICAgIG1lYW5zW2pdICs9IHJvd1tpXSAqIHc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuXG4gICAgdmFyIHdlaWdodFN1bSA9IGFycmF5U3RhdC5zdW0od2VpZ2h0cyk7XG4gICAgaWYgKHdlaWdodFN1bSAhPT0gMCkge1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IG1lYW5zLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIG1lYW5zW2ldIC89IHdlaWdodFN1bTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWVhbnM7XG59XG5cbmZ1bmN0aW9uIHdlaWdodGVkQ292YXJpYW5jZShtYXRyaXgsIHdlaWdodHMsIG1lYW5zLCBkaW1lbnNpb24pIHtcbiAgICBkaW1lbnNpb24gPSBkaW1lbnNpb24gfHwgMDtcbiAgICBtZWFucyA9IG1lYW5zIHx8IHdlaWdodGVkTWVhbihtYXRyaXgsIHdlaWdodHMsIGRpbWVuc2lvbik7XG4gICAgdmFyIHMxID0gMCwgczIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IHdlaWdodHMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICBzMSArPSB3ZWlnaHRzW2ldO1xuICAgICAgICBzMiArPSB3ZWlnaHRzW2ldICogd2VpZ2h0c1tpXTtcbiAgICB9XG4gICAgdmFyIGZhY3RvciA9IHMxIC8gKHMxICogczEgLSBzMik7XG4gICAgcmV0dXJuIHdlaWdodGVkU2NhdHRlcihtYXRyaXgsIHdlaWdodHMsIG1lYW5zLCBmYWN0b3IsIGRpbWVuc2lvbik7XG59XG5cbmZ1bmN0aW9uIHdlaWdodGVkU2NhdHRlcihtYXRyaXgsIHdlaWdodHMsIG1lYW5zLCBmYWN0b3IsIGRpbWVuc2lvbikge1xuICAgIGRpbWVuc2lvbiA9IGRpbWVuc2lvbiB8fCAwO1xuICAgIG1lYW5zID0gbWVhbnMgfHwgd2VpZ2h0ZWRNZWFuKG1hdHJpeCwgd2VpZ2h0cywgZGltZW5zaW9uKTtcbiAgICBpZiAodHlwZW9mKGZhY3RvcikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGZhY3RvciA9IDE7XG4gICAgfVxuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gW1tdXTtcbiAgICB9XG4gICAgdmFyIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICBjb3YsIGksIGosIGssIHM7XG5cbiAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShjb2xzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgcm93czsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gd2VpZ2h0c1trXSAqIChtYXRyaXhba11bal0gLSBtZWFuc1tqXSkgKiAobWF0cml4W2tdW2ldIC0gbWVhbnNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzICogZmFjdG9yO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGRpbWVuc2lvbiA9PT0gMSkge1xuICAgICAgICBjb3YgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGNvdltpXSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSBpOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGNvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzICs9IHdlaWdodHNba10gKiAobWF0cml4W2pdW2tdIC0gbWVhbnNbal0pICogKG1hdHJpeFtpXVtrXSAtIG1lYW5zW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY292W2ldW2pdID0gcyAqIGZhY3RvcjtcbiAgICAgICAgICAgICAgICBjb3Zbal1baV0gPSBzICogZmFjdG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRpbWVuc2lvbicpO1xuICAgIH1cblxuICAgIHJldHVybiBjb3Y7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGVudHJvcHk6IGVudHJvcHksXG4gICAgbWVhbjogbWVhbixcbiAgICBzdGFuZGFyZERldmlhdGlvbjogc3RhbmRhcmREZXZpYXRpb24sXG4gICAgdmFyaWFuY2U6IHZhcmlhbmNlLFxuICAgIG1lZGlhbjogbWVkaWFuLFxuICAgIG1vZGU6IG1vZGUsXG4gICAgc2tld25lc3M6IHNrZXduZXNzLFxuICAgIGt1cnRvc2lzOiBrdXJ0b3NpcyxcbiAgICBzdGFuZGFyZEVycm9yOiBzdGFuZGFyZEVycm9yLFxuICAgIGNvdmFyaWFuY2U6IGNvdmFyaWFuY2UsXG4gICAgc2NhdHRlcjogc2NhdHRlcixcbiAgICBjb3JyZWxhdGlvbjogY29ycmVsYXRpb24sXG4gICAgelNjb3JlczogelNjb3JlcyxcbiAgICBjZW50ZXI6IGNlbnRlcixcbiAgICBzdGFuZGFyZGl6ZTogc3RhbmRhcmRpemUsXG4gICAgd2VpZ2h0ZWRWYXJpYW5jZTogd2VpZ2h0ZWRWYXJpYW5jZSxcbiAgICB3ZWlnaHRlZE1lYW46IHdlaWdodGVkTWVhbixcbiAgICB3ZWlnaHRlZENvdmFyaWFuY2U6IHdlaWdodGVkQ292YXJpYW5jZSxcbiAgICB3ZWlnaHRlZFNjYXR0ZXI6IHdlaWdodGVkU2NhdHRlclxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9wY2EnKTtcbiIsIid1c2Ugc3RyaWN0JztcbnZhciBNYXRyaXggPSByZXF1aXJlKCdtbC1tYXRyaXgnKTtcbnZhciBTdGF0ID0gcmVxdWlyZSgnbWwtc3RhdCcpO1xudmFyIFNWRCA9IE1hdHJpeC5EQy5TVkQ7XG5cbm1vZHVsZS5leHBvcnRzID0gUENBO1xuXG4vKipcbiogQ3JlYXRlcyBuZXcgUENBIChQcmluY2lwYWwgQ29tcG9uZW50IEFuYWx5c2lzKSBmcm9tIHRoZSBkYXRhc2V0XG4qIEBwYXJhbSB7TWF0cml4fSBkYXRhc2V0XG4qIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gb3B0aW9ucyBmb3IgdGhlIFBDQSBhbGdvcml0aG1cbiogQHBhcmFtIHtib29sZWFufSByZWxvYWQgLSBmb3IgbG9hZCBwdXJwb3Nlc1xuKiBAcGFyYW0ge09iamVjdH0gbW9kZWwgLSBmb3IgbG9hZCBwdXJwb3Nlc1xuKiBAY29uc3RydWN0b3JcbiogKi9cbmZ1bmN0aW9uIFBDQShkYXRhc2V0LCBvcHRpb25zLCByZWxvYWQsIG1vZGVsKSB7XG5cbiAgICBpZiAocmVsb2FkKSB7XG4gICAgICAgIHRoaXMuVSA9IG1vZGVsLlU7XG4gICAgICAgIHRoaXMuUyA9IG1vZGVsLlM7XG4gICAgICAgIHRoaXMubWVhbnMgPSBtb2RlbC5tZWFucztcbiAgICAgICAgdGhpcy5zdGQgPSBtb2RlbC5zdGQ7XG4gICAgICAgIHRoaXMuc3RhbmRhcmRpemUgPSBtb2RlbC5zdGFuZGFyZGl6ZVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmKG9wdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBzdGFuZGFyZGl6ZTogZmFsc2VcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN0YW5kYXJkaXplID0gb3B0aW9ucy5zdGFuZGFyZGl6ZTtcblxuICAgICAgICBpZiAoIU1hdHJpeC5pc01hdHJpeChkYXRhc2V0KSkge1xuICAgICAgICAgICAgZGF0YXNldCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkYXRhc2V0ID0gZGF0YXNldC5jbG9uZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5vcm1hbGl6YXRpb24gPSBhZGp1c3QoZGF0YXNldCwgdGhpcy5zdGFuZGFyZGl6ZSk7XG4gICAgICAgIHZhciBub3JtYWxpemVkRGF0YXNldCA9IG5vcm1hbGl6YXRpb24ucmVzdWx0O1xuXG4gICAgICAgIHZhciBjb3ZhcmlhbmNlTWF0cml4ID0gbm9ybWFsaXplZERhdGFzZXQudHJhbnNwb3NlKCkubW11bChub3JtYWxpemVkRGF0YXNldCkuZGl2UyhkYXRhc2V0LnJvd3MpO1xuXG4gICAgICAgIHZhciB0YXJnZXQgPSBuZXcgU1ZEKGNvdmFyaWFuY2VNYXRyaXgsIHtcbiAgICAgICAgICAgIGNvbXB1dGVMZWZ0U2luZ3VsYXJWZWN0b3JzOiB0cnVlLFxuICAgICAgICAgICAgY29tcHV0ZVJpZ2h0U2luZ3VsYXJWZWN0b3JzOiB0cnVlLFxuICAgICAgICAgICAgYXV0b1RyYW5zcG9zZTogZmFsc2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5VID0gdGFyZ2V0LmxlZnRTaW5ndWxhclZlY3RvcnM7XG4gICAgICAgIHRoaXMuUyA9IHRhcmdldC5kaWFnb25hbDtcbiAgICAgICAgdGhpcy5tZWFucyA9IG5vcm1hbGl6YXRpb24ubWVhbnM7XG4gICAgICAgIHRoaXMuc3RkID0gbm9ybWFsaXphdGlvbi5zdGQ7XG4gICAgfVxufVxuXG4vKipcbiogTG9hZCBhIFBDQSBtb2RlbCBmcm9tIEpTT05cbiogQG9hcmFtIHtPYmplY3R9IG1vZGVsXG4qIEByZXR1cm4ge1BDQX1cbiogKi9cblBDQS5sb2FkID0gZnVuY3Rpb24gKG1vZGVsKSB7XG4gICAgaWYobW9kZWwubW9kZWxOYW1lICE9PSAnUENBJylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUaGUgY3VycmVudCBtb2RlbCBpcyBpbnZhbGlkIVwiKTtcblxuICAgIHJldHVybiBuZXcgUENBKG51bGwsIG51bGwsIHRydWUsIG1vZGVsKTtcbn07XG5cbi8qKlxuKiBFeHBvcnRzIHRoZSBjdXJyZW50IG1vZGVsIHRvIGFuIE9iamVjdFxuKiBAcmV0dXJuIHtPYmplY3R9IG1vZGVsXG4qICovXG5QQ0EucHJvdG90eXBlLmV4cG9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlbE5hbWU6IFwiUENBXCIsXG4gICAgICAgIFU6IHRoaXMuVSxcbiAgICAgICAgUzogdGhpcy5TLFxuICAgICAgICBtZWFuczogdGhpcy5tZWFucyxcbiAgICAgICAgc3RkOiB0aGlzLnN0ZCxcbiAgICAgICAgc3RhbmRhcmRpemU6IHRoaXMuc3RhbmRhcmRpemVcbiAgICB9O1xufTtcblxuLyoqXG4qIEZ1bmN0aW9uIHRoYXQgcHJvamVjdCB0aGUgZGF0YXNldCBpbnRvIG5ldyBzcGFjZSBvZiBrIGRpbWVuc2lvbnMsXG4qIHRoaXMgbWV0aG9kIGRvZXNuJ3QgbW9kaWZ5IHlvdXIgZGF0YXNldC5cbiogQHBhcmFtIHtNYXRyaXh9IGRhdGFzZXQuXG4qIEBwYXJhbSB7TnVtYmVyfSBrIC0gZGltZW5zaW9ucyB0byBwcm9qZWN0LlxuKiBAcmV0dXJuIHtNYXRyaXh9IGRhdGFzZXQgcHJvamVjdGVkIGluIGsgZGltZW5zaW9ucy5cbiogQHRocm93cyB7UmFuZ2VFcnJvcn0gaWYgayBpcyBsYXJnZXIgdGhhbiB0aGUgbnVtYmVyIG9mIGVpZ2VudmVjdG9yXG4qICAgICAgICAgICAgICAgICAgICAgIG9mIHRoZSBtb2RlbC5cbiogKi9cblBDQS5wcm90b3R5cGUucHJvamVjdCA9IGZ1bmN0aW9uIChkYXRhc2V0LCBrKSB7XG4gICAgdmFyIGRpbWVuc2lvbnMgPSBrIC0gMTtcbiAgICBpZihrID4gdGhpcy5VLmNvbHVtbnMpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwidGhlIG51bWJlciBvZiBkaW1lbnNpb25zIG11c3Qgbm90IGJlIGxhcmdlciB0aGFuIFwiICsgdGhpcy5VLmNvbHVtbnMpO1xuXG4gICAgaWYgKCFNYXRyaXguaXNNYXRyaXgoZGF0YXNldCkpIHtcbiAgICAgICAgZGF0YXNldCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZGF0YXNldCA9IGRhdGFzZXQuY2xvbmUoKTtcbiAgICB9XG5cbiAgICB2YXIgWCA9IGFkanVzdChkYXRhc2V0LCB0aGlzLnN0YW5kYXJkaXplKS5yZXN1bHQ7XG4gICAgcmV0dXJuIFgubW11bCh0aGlzLlUuc3ViTWF0cml4KDAsIHRoaXMuVS5yb3dzIC0gMSwgMCwgZGltZW5zaW9ucykpO1xufTtcblxuLyoqXG4qIFRoaXMgbWV0aG9kIHJldHVybnMgdGhlIHBlcmNlbnRhZ2UgdmFyaWFuY2Ugb2YgZWFjaCBlaWdlbnZlY3Rvci5cbiogQHJldHVybiB7TnVtYmVyfSBwZXJjZW50YWdlIHZhcmlhbmNlIG9mIGVhY2ggZWlnZW52ZWN0b3IuXG4qICovXG5QQ0EucHJvdG90eXBlLmdldEV4cGxhaW5lZFZhcmlhbmNlID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzdW0gPSB0aGlzLlMucmVkdWNlKGZ1bmN0aW9uIChwcmV2aW91cywgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHByZXZpb3VzICsgdmFsdWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuUy5tYXAoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAvIHN1bTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBFaWdlbnZlY3RvcnMgb2YgdGhlIGNvdmFyaWFuY2UgbWF0cml4LlxuICogQHJldHVybnMge01hdHJpeH1cbiAqL1xuUENBLnByb3RvdHlwZS5nZXRFaWdlbnZlY3RvcnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuVTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBFaWdlbnZhbHVlcyAob24gdGhlIGRpYWdvbmFsKS5cbiAqIEByZXR1cm5zIHsqfVxuICovXG5QQ0EucHJvdG90eXBlLmdldEVpZ2VudmFsdWVzID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLlM7XG59O1xuXG4vKipcbiogVGhpcyBtZXRob2QgcmV0dXJucyBhIGRhdGFzZXQgbm9ybWFsaXplZCBpbiB0aGUgZm9sbG93aW5nIGZvcm06XG4qIFggPSAoWCAtIG1lYW4pIC8gc3RkXG4qIEBwYXJhbSBkYXRhc2V0LlxuKiBAcGFyYW0ge0Jvb2xlYW59IHN0YW5kYXJpemUgLSBkbyBzdGFuZGFyZGl6YXRpb25cbiogQHJldHVybiBBIGRhdGFzZXQgbm9ybWFsaXplZC5cbiogKi9cbmZ1bmN0aW9uIGFkanVzdChkYXRhc2V0LCBzdGFuZGFyaXplKSB7XG4gICAgdmFyIG1lYW5zID0gU3RhdC5tYXRyaXgubWVhbihkYXRhc2V0KTtcbiAgICB2YXIgc3RkID0gc3RhbmRhcml6ZSA/IFN0YXQubWF0cml4LnN0YW5kYXJkRGV2aWF0aW9uKGRhdGFzZXQsIG1lYW5zLCB0cnVlKSA6IHVuZGVmaW5lZDtcblxuICAgIHZhciByZXN1bHQgPSBkYXRhc2V0LnN1YlJvd1ZlY3RvcihtZWFucyk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdWx0OiBzdGFuZGFyaXplID8gcmVzdWx0LmRpdlJvd1ZlY3RvcihzdGQpIDogcmVzdWx0LFxuICAgICAgICBtZWFuczogbWVhbnMsXG4gICAgICAgIHN0ZDogc3RkXG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gcmVxdWlyZSgnLi9wbHMnKTtcbmV4cG9ydHMuVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5leHBvcnRzLk9QTFMgPSByZXF1aXJlKCcuL29wbHMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE9QTFM7XG5cbmZ1bmN0aW9uIE9QTFMoZGF0YXNldCwgcHJlZGljdGlvbnMsIG51bWJlck9TQykge1xuICAgIHZhciBYID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICB2YXIgeSA9IG5ldyBNYXRyaXgocHJlZGljdGlvbnMpO1xuXG4gICAgWCA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUoWCkucmVzdWx0O1xuICAgIHkgPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKHkpLnJlc3VsdDtcblxuICAgIHZhciByb3dzID0gWC5yb3dzO1xuICAgIHZhciBjb2x1bW5zID0gWC5jb2x1bW5zO1xuXG4gICAgdmFyIHN1bU9mU3F1YXJlc1ggPSBYLmNsb25lKCkubXVsKFgpLnN1bSgpO1xuICAgIHZhciB3ID0gWC50cmFuc3Bvc2UoKS5tbXVsKHkpO1xuICAgIHcuZGl2KFV0aWxzLm5vcm0odykpO1xuXG4gICAgdmFyIG9ydGhvVyA9IG5ldyBBcnJheShudW1iZXJPU0MpO1xuICAgIHZhciBvcnRob1QgPSBuZXcgQXJyYXkobnVtYmVyT1NDKTtcbiAgICB2YXIgb3J0aG9QID0gbmV3IEFycmF5KG51bWJlck9TQyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1iZXJPU0M7IGkrKykge1xuICAgICAgICB2YXIgdCA9IFgubW11bCh3KTtcblxuICAgICAgICB2YXIgbnVtZXJhdG9yID0gWC50cmFuc3Bvc2UoKS5tbXVsKHQpO1xuICAgICAgICB2YXIgZGVub21pbmF0b3IgPSB0LnRyYW5zcG9zZSgpLm1tdWwodClbMF1bMF07XG4gICAgICAgIHZhciBwID0gIG51bWVyYXRvci5kaXYoZGVub21pbmF0b3IpO1xuXG4gICAgICAgIG51bWVyYXRvciA9IHcudHJhbnNwb3NlKCkubW11bChwKVswXVswXTtcbiAgICAgICAgZGVub21pbmF0b3IgPSB3LnRyYW5zcG9zZSgpLm1tdWwodylbMF1bMF07XG4gICAgICAgIHZhciB3T3NjID0gcC5zdWIody5jbG9uZSgpLm11bChudW1lcmF0b3IgLyBkZW5vbWluYXRvcikpO1xuICAgICAgICB3T3NjLmRpdihVdGlscy5ub3JtKHdPc2MpKTtcblxuICAgICAgICB2YXIgdE9zYyA9IFgubW11bCh3T3NjKTtcblxuICAgICAgICBudW1lcmF0b3IgPSBYLnRyYW5zcG9zZSgpLm1tdWwodE9zYyk7XG4gICAgICAgIGRlbm9taW5hdG9yID0gdE9zYy50cmFuc3Bvc2UoKS5tbXVsKHRPc2MpWzBdWzBdO1xuICAgICAgICB2YXIgcE9zYyA9IG51bWVyYXRvci5kaXYoZGVub21pbmF0b3IpO1xuXG4gICAgICAgIFguc3ViKHRPc2MubW11bChwT3NjLnRyYW5zcG9zZSgpKSk7XG4gICAgICAgIG9ydGhvV1tpXSA9IHdPc2MuZ2V0Q29sdW1uKDApO1xuICAgICAgICBvcnRob1RbaV0gPSB0T3NjLmdldENvbHVtbigwKTtcbiAgICAgICAgb3J0aG9QW2ldID0gcE9zYy5nZXRDb2x1bW4oMCk7XG4gICAgfVxuXG4gICAgdGhpcy5Yb3NjID0gWDtcblxuICAgIHZhciBzdW1PZlNxdWFyZXNYb3N4ID0gdGhpcy5Yb3NjLmNsb25lKCkubXVsKHRoaXMuWG9zYykuc3VtKCk7XG4gICAgdGhpcy5SMlggPSAxIC0gc3VtT2ZTcXVhcmVzWG9zeC9zdW1PZlNxdWFyZXNYO1xuXG4gICAgdGhpcy5XID0gb3J0aG9XO1xuICAgIHRoaXMuVCA9IG9ydGhvVDtcbiAgICB0aGlzLlAgPSBvcnRob1A7XG4gICAgdGhpcy5udW1iZXJPU0MgPSBudW1iZXJPU0M7XG59XG5cbk9QTFMucHJvdG90eXBlLmNvcnJlY3REYXRhc2V0ID0gZnVuY3Rpb24gKGRhdGFzZXQpIHtcbiAgICB2YXIgWCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG5cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm51bWJlck9TQzsgaSsrKSB7XG4gICAgICAgIHZhciBjdXJyZW50VyA9IHRoaXMuVy5nZXRDb2x1bW5WZWN0b3IoaSk7XG4gICAgICAgIHZhciBjdXJyZW50UCA9IHRoaXMuUC5nZXRDb2x1bW5WZWN0b3IoaSk7XG5cbiAgICAgICAgdmFyIHQgPSBYLm1tdWwoY3VycmVudFcpO1xuICAgICAgICBYLnN1Yih0Lm1tdWwoY3VycmVudFApKTtcbiAgICB9XG4gICAgdmFyIHN1bU9mU3F1YXJlc1hvc3ggPSBYLmNsb25lKCkubXVsKFgpLnN1bSgpO1xuXG4gICAgdmFyIFIyWCA9IDEgLSBzdW1PZlNxdWFyZXNYb3N4IC8gc3VtT2ZTcXVhcmVzWDtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGRhdGFzZXRPc2M6IFgsXG4gICAgICAgIFIyRGF0YXNldDogUjJYXG4gICAgfTtcbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBMUztcbnZhciBNYXRyaXggPSByZXF1aXJlKCdtbC1tYXRyaXgnKTtcbnZhciBVdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIHN1bSBhdCB0aGUgY29sdW1uIG9mIHRoZSBnaXZlbiBtYXRyaXguXG4gKiBAcGFyYW0gbWF0cml4XG4gKiBAcGFyYW0gY29sdW1uXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBnZXRDb2xTdW0obWF0cml4LCBjb2x1bW4pIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hdHJpeC5yb3dzOyBpKyspIHtcbiAgICAgICAgc3VtICs9IG1hdHJpeFtpXVtjb2x1bW5dO1xuICAgIH1cbiAgICByZXR1cm4gc3VtO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgaW5kZXggd2hlcmUgdGhlIHN1bSBvZiBlYWNoXG4gKiBjb2x1bW4gdmVjdG9yIGlzIG1heGltdW0uXG4gKiBAcGFyYW0ge01hdHJpeH0gZGF0YVxuICogQHJldHVybnMge251bWJlcn0gaW5kZXggb2YgdGhlIG1heGltdW1cbiAqL1xuZnVuY3Rpb24gbWF4U3VtQ29sSW5kZXgoZGF0YSkge1xuICAgIHZhciBtYXhJbmRleCA9IDA7XG4gICAgdmFyIG1heFN1bSA9IC1JbmZpbml0eTtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZGF0YS5jb2x1bW5zOyArK2kpIHtcbiAgICAgICAgdmFyIGN1cnJlbnRTdW0gPSBnZXRDb2xTdW0oZGF0YSwgaSk7XG4gICAgICAgIGlmKGN1cnJlbnRTdW0gPiBtYXhTdW0pIHtcbiAgICAgICAgICAgIG1heFN1bSA9IGN1cnJlbnRTdW07XG4gICAgICAgICAgICBtYXhJbmRleCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1heEluZGV4O1xufVxuXG4vKipcbiAqIENvbnN0cnVjdG9yIG9mIHRoZSBQTFMgbW9kZWwuXG4gKiBAcGFyYW0gcmVsb2FkIC0gdXNlZCBmb3IgbG9hZCBwdXJwb3Nlcy5cbiAqIEBwYXJhbSBtb2RlbCAtIHVzZWQgZm9yIGxvYWQgcHVycG9zZXMuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gUExTKHJlbG9hZCwgbW9kZWwpIHtcbiAgICBpZihyZWxvYWQpIHtcbiAgICAgICAgdGhpcy5FID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLkUpO1xuICAgICAgICB0aGlzLkYgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuRik7XG4gICAgICAgIHRoaXMuc3NxWWNhbCA9IG1vZGVsLnNzcVljYWw7XG4gICAgICAgIHRoaXMuUjJYID0gbW9kZWwuUjJYO1xuICAgICAgICB0aGlzLnltZWFuID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLnltZWFuKTtcbiAgICAgICAgdGhpcy55c3RkID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLnlzdGQpO1xuICAgICAgICB0aGlzLlBCUSA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5QQlEpO1xuICAgICAgICB0aGlzLlQgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuVCk7XG4gICAgICAgIHRoaXMuUCA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5QKTtcbiAgICAgICAgdGhpcy5VID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlUpO1xuICAgICAgICB0aGlzLlEgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuUSk7XG4gICAgICAgIHRoaXMuVyA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5XKTtcbiAgICAgICAgdGhpcy5CID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLkIpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IGZpdCB0aGUgbW9kZWwgd2l0aCB0aGUgZ2l2ZW4gZGF0YSBhbmQgcHJlZGljdGlvbnMsIGluIHRoaXMgZnVuY3Rpb24gaXMgY2FsY3VsYXRlZCB0aGVcbiAqIGZvbGxvd2luZyBvdXRwdXRzOlxuICpcbiAqIFQgLSBTY29yZSBtYXRyaXggb2YgWFxuICogUCAtIExvYWRpbmcgbWF0cml4IG9mIFhcbiAqIFUgLSBTY29yZSBtYXRyaXggb2YgWVxuICogUSAtIExvYWRpbmcgbWF0cml4IG9mIFlcbiAqIEIgLSBNYXRyaXggb2YgcmVncmVzc2lvbiBjb2VmZmljaWVudFxuICogVyAtIFdlaWdodCBtYXRyaXggb2YgWFxuICpcbiAqIEBwYXJhbSB7TWF0cml4fSB0cmFpbmluZ1NldCAtIERhdGFzZXQgdG8gYmUgYXBwbHkgdGhlIG1vZGVsXG4gKiBAcGFyYW0ge01hdHJpeH0gcHJlZGljdGlvbnMgLSBQcmVkaWN0aW9ucyBvdmVyIGVhY2ggY2FzZSBvZiB0aGUgZGF0YXNldFxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMgLSByZWNpZXZlcyB0aGUgbGF0ZW50VmVjdG9ycyBhbmQgdGhlIHRvbGVyYW5jZSBvZiBlYWNoIHN0ZXAgb2YgdGhlIFBMU1xuICovXG5QTFMucHJvdG90eXBlLnRyYWluID0gZnVuY3Rpb24gKHRyYWluaW5nU2V0LCBwcmVkaWN0aW9ucywgb3B0aW9ucykge1xuXG4gICAgaWYob3B0aW9ucyA9PT0gdW5kZWZpbmVkKSBvcHRpb25zID0ge307XG5cbiAgICB2YXIgbGF0ZW50VmVjdG9ycyA9IG9wdGlvbnMubGF0ZW50VmVjdG9ycztcbiAgICBpZihsYXRlbnRWZWN0b3JzID09PSB1bmRlZmluZWQgfHwgaXNOYU4obGF0ZW50VmVjdG9ycykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJMYXRlbnQgdmVjdG9yIG11c3QgYmUgYSBudW1iZXIuXCIpO1xuICAgIH1cblxuICAgIHZhciB0b2xlcmFuY2UgPSBvcHRpb25zLnRvbGVyYW5jZTtcbiAgICBpZih0b2xlcmFuY2UgPT09IHVuZGVmaW5lZCB8fCBpc05hTih0b2xlcmFuY2UpKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiVG9sZXJhbmNlIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgfVxuXG4gICAgaWYodHJhaW5pbmdTZXQubGVuZ3RoICE9PSBwcmVkaWN0aW9ucy5sZW5ndGgpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiVGhlIG51bWJlciBvZiBwcmVkaWN0aW9ucyBhbmQgZWxlbWVudHMgaW4gdGhlIGRhdGFzZXQgbXVzdCBiZSB0aGUgc2FtZVwiKTtcblxuICAgIC8vdmFyIHRvbGVyYW5jZSA9IDFlLTk7XG4gICAgdmFyIFggPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKG5ldyBNYXRyaXgodHJhaW5pbmdTZXQpKS5yZXN1bHQ7XG4gICAgdmFyIHJlc3VsdFkgPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKG5ldyBNYXRyaXgocHJlZGljdGlvbnMpKTtcbiAgICB0aGlzLnltZWFuID0gcmVzdWx0WS5tZWFucy5uZWcoKTtcbiAgICB0aGlzLnlzdGQgPSByZXN1bHRZLnN0ZDtcbiAgICB2YXIgWSA9IHJlc3VsdFkucmVzdWx0O1xuXG4gICAgdmFyIHJ4ID0gWC5yb3dzO1xuICAgIHZhciBjeCA9IFguY29sdW1ucztcbiAgICB2YXIgcnkgPSBZLnJvd3M7XG4gICAgdmFyIGN5ID0gWS5jb2x1bW5zO1xuXG4gICAgaWYocnggIT0gcnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJkYXRhc2V0IGNhc2VzIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJlZGljdGlvbnNcIik7XG4gICAgfVxuXG4gICAgdmFyIHNzcVhjYWwgPSBYLmNsb25lKCkubXVsKFgpLnN1bSgpOyAvLyBmb3IgdGhlIHLCslxuICAgIHZhciBzdW1PZlNxdWFyZXNZID0gWS5jbG9uZSgpLm11bChZKS5zdW0oKTtcblxuICAgIHZhciBuID0gbGF0ZW50VmVjdG9yczsgLy9NYXRoLm1heChjeCwgY3kpOyAvLyBjb21wb25lbnRzIG9mIHRoZSBwbHNcbiAgICB2YXIgVCA9IE1hdHJpeC56ZXJvcyhyeCwgbik7XG4gICAgdmFyIFAgPSBNYXRyaXguemVyb3MoY3gsIG4pO1xuICAgIHZhciBVID0gTWF0cml4Lnplcm9zKHJ5LCBuKTtcbiAgICB2YXIgUSA9IE1hdHJpeC56ZXJvcyhjeSwgbik7XG4gICAgdmFyIEIgPSBNYXRyaXguemVyb3Mobiwgbik7XG4gICAgdmFyIFcgPSBQLmNsb25lKCk7XG4gICAgdmFyIGsgPSAwO1xuICAgIHZhciBSMlggPSBuZXcgQXJyYXkobik7XG5cbiAgICB3aGlsZShVdGlscy5ub3JtKFkpID4gdG9sZXJhbmNlICYmIGsgPCBuKSB7XG4gICAgICAgIHZhciB0cmFuc3Bvc2VYID0gWC50cmFuc3Bvc2UoKTtcbiAgICAgICAgdmFyIHRyYW5zcG9zZVkgPSBZLnRyYW5zcG9zZSgpO1xuXG4gICAgICAgIHZhciB0SW5kZXggPSBtYXhTdW1Db2xJbmRleChYLmNsb25lKCkubXVsTShYKSk7XG4gICAgICAgIHZhciB1SW5kZXggPSBtYXhTdW1Db2xJbmRleChZLmNsb25lKCkubXVsTShZKSk7XG5cbiAgICAgICAgdmFyIHQxID0gWC5nZXRDb2x1bW5WZWN0b3IodEluZGV4KTtcbiAgICAgICAgdmFyIHUgPSBZLmdldENvbHVtblZlY3Rvcih1SW5kZXgpO1xuICAgICAgICB2YXIgdCA9IE1hdHJpeC56ZXJvcyhyeCwgMSk7XG5cbiAgICAgICAgd2hpbGUoVXRpbHMubm9ybSh0MS5jbG9uZSgpLnN1Yih0KSkgPiB0b2xlcmFuY2UpIHtcbiAgICAgICAgICAgIHZhciB3ID0gdHJhbnNwb3NlWC5tbXVsKHUpO1xuICAgICAgICAgICAgdy5kaXYoVXRpbHMubm9ybSh3KSk7XG4gICAgICAgICAgICB0ID0gdDE7XG4gICAgICAgICAgICB0MSA9IFgubW11bCh3KTtcbiAgICAgICAgICAgIHZhciBxID0gdHJhbnNwb3NlWS5tbXVsKHQxKTtcbiAgICAgICAgICAgIHEuZGl2KFV0aWxzLm5vcm0ocSkpO1xuICAgICAgICAgICAgdSA9IFkubW11bChxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHQgPSB0MTtcbiAgICAgICAgdmFyIG51bSA9IHRyYW5zcG9zZVgubW11bCh0KTtcbiAgICAgICAgdmFyIGRlbiA9ICh0LnRyYW5zcG9zZSgpLm1tdWwodCkpWzBdWzBdO1xuICAgICAgICB2YXIgcCA9IG51bS5kaXYoZGVuKTtcbiAgICAgICAgdmFyIHBub3JtID0gVXRpbHMubm9ybShwKTtcbiAgICAgICAgcC5kaXYocG5vcm0pO1xuICAgICAgICB0Lm11bChwbm9ybSk7XG4gICAgICAgIHcubXVsKHBub3JtKTtcblxuICAgICAgICBudW0gPSB1LnRyYW5zcG9zZSgpLm1tdWwodCk7XG4gICAgICAgIGRlbiA9ICh0LnRyYW5zcG9zZSgpLm1tdWwodCkpWzBdWzBdO1xuICAgICAgICB2YXIgYiA9IChudW0uZGl2KGRlbikpWzBdWzBdO1xuICAgICAgICBYLnN1Yih0Lm1tdWwocC50cmFuc3Bvc2UoKSkpO1xuICAgICAgICBZLnN1Yih0LmNsb25lKCkubXVsKGIpLm1tdWwocS50cmFuc3Bvc2UoKSkpO1xuXG4gICAgICAgIFQuc2V0Q29sdW1uKGssIHQpO1xuICAgICAgICBQLnNldENvbHVtbihrLCBwKTtcbiAgICAgICAgVS5zZXRDb2x1bW4oaywgdSk7XG4gICAgICAgIFEuc2V0Q29sdW1uKGssIHEpO1xuICAgICAgICBXLnNldENvbHVtbihrLCB3KTtcblxuICAgICAgICBCW2tdW2tdID0gYjtcbiAgICAgICAgaysrO1xuICAgIH1cblxuICAgIGstLTtcbiAgICBUID0gVC5zdWJNYXRyaXgoMCwgVC5yb3dzIC0gMSwgMCwgayk7XG4gICAgUCA9IFAuc3ViTWF0cml4KDAsIFAucm93cyAtIDEsIDAsIGspO1xuICAgIFUgPSBVLnN1Yk1hdHJpeCgwLCBVLnJvd3MgLSAxLCAwLCBrKTtcbiAgICBRID0gUS5zdWJNYXRyaXgoMCwgUS5yb3dzIC0gMSwgMCwgayk7XG4gICAgVyA9IFcuc3ViTWF0cml4KDAsIFcucm93cyAtIDEsIDAsIGspO1xuICAgIEIgPSBCLnN1Yk1hdHJpeCgwLCBrLCAwLCBrKTtcblxuICAgIHRoaXMuUjJYID0gdC50cmFuc3Bvc2UoKS5tbXVsKHQpLm1tdWwocC50cmFuc3Bvc2UoKS5tbXVsKHApKS5kaXZTKHNzcVhjYWwpWzBdWzBdO1xuXG4gICAgLy8gVE9ETzogcmV2aWV3IG9mIFIyWVxuICAgIC8vdGhpcy5SMlkgPSB0LnRyYW5zcG9zZSgpLm1tdWwodCkubXVsKHFba11bMF0qcVtrXVswXSkuZGl2Uyhzc3FZY2FsKVswXVswXTtcblxuICAgIHRoaXMuc3NxWWNhbCA9IHN1bU9mU3F1YXJlc1k7XG4gICAgdGhpcy5FID0gWDtcbiAgICB0aGlzLkYgPSBZO1xuICAgIHRoaXMuVCA9IFQ7XG4gICAgdGhpcy5QID0gUDtcbiAgICB0aGlzLlUgPSBVO1xuICAgIHRoaXMuUSA9IFE7XG4gICAgdGhpcy5XID0gVztcbiAgICB0aGlzLkIgPSBCO1xuICAgIHRoaXMuUEJRID0gUC5tbXVsKEIpLm1tdWwoUS50cmFuc3Bvc2UoKSk7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcHJlZGljdCB0aGUgYmVoYXZpb3Igb2YgdGhlIGdpdmVuIGRhdGFzZXQuXG4gKiBAcGFyYW0gZGF0YXNldCAtIGRhdGEgdG8gYmUgcHJlZGljdGVkLlxuICogQHJldHVybnMge01hdHJpeH0gLSBwcmVkaWN0aW9ucyBvZiBlYWNoIGVsZW1lbnQgb2YgdGhlIGRhdGFzZXQuXG4gKi9cblBMUy5wcm90b3R5cGUucHJlZGljdCA9IGZ1bmN0aW9uIChkYXRhc2V0KSB7XG4gICAgdmFyIFggPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuICAgIHZhciBub3JtYWxpemF0aW9uID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZShYKTtcbiAgICBYID0gbm9ybWFsaXphdGlvbi5yZXN1bHQ7XG4gICAgdmFyIFkgPSBYLm1tdWwodGhpcy5QQlEpO1xuICAgIFkubXVsUm93VmVjdG9yKHRoaXMueXN0ZCk7XG4gICAgWS5hZGRSb3dWZWN0b3IodGhpcy55bWVhbik7XG4gICAgcmV0dXJuIFk7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgZXhwbGFpbmVkIHZhcmlhbmNlIG9uIHRyYWluaW5nIG9mIHRoZSBQTFMgbW9kZWwuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5QTFMucHJvdG90eXBlLmdldEV4cGxhaW5lZFZhcmlhbmNlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLlIyWDtcbn07XG5cbi8qKlxuICogTG9hZCBhIFBMUyBtb2RlbCBmcm9tIGFuIE9iamVjdFxuICogQHBhcmFtIG1vZGVsXG4gKiBAcmV0dXJucyB7UExTfSAtIFBMUyBvYmplY3QgZnJvbSB0aGUgZ2l2ZW4gbW9kZWxcbiAqL1xuUExTLmxvYWQgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICBpZihtb2RlbC5tb2RlbE5hbWUgIT09ICdQTFMnKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIlRoZSBjdXJyZW50IG1vZGVsIGlzIGludmFsaWQhXCIpO1xuXG4gICAgcmV0dXJuIG5ldyBQTFModHJ1ZSwgbW9kZWwpO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IGV4cG9ydHMgYSBQTFMgbW9kZWwgdG8gYW4gT2JqZWN0LlxuICogQHJldHVybnMge3ttb2RlbE5hbWU6IHN0cmluZywgeW1lYW46ICosIHlzdGQ6ICosIFBCUTogKn19IG1vZGVsLlxuICovXG5QTFMucHJvdG90eXBlLmV4cG9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlbE5hbWU6IFwiUExTXCIsXG4gICAgICAgIEU6IHRoaXMuRSxcbiAgICAgICAgRjogdGhpcy5GLFxuICAgICAgICBSMlg6IHRoaXMuUjJYLFxuICAgICAgICBzc3FZY2FsOiB0aGlzLnNzcVljYWwsXG4gICAgICAgIHltZWFuOiB0aGlzLnltZWFuLFxuICAgICAgICB5c3RkOiB0aGlzLnlzdGQsXG4gICAgICAgIFBCUTogdGhpcy5QQlEsXG4gICAgICAgIFQ6IHRoaXMuVCxcbiAgICAgICAgUDogdGhpcy5QLFxuICAgICAgICBVOiB0aGlzLlUsXG4gICAgICAgIFE6IHRoaXMuUSxcbiAgICAgICAgVzogdGhpcy5XLFxuICAgICAgICBCOiB0aGlzLkJcbiAgICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFN0YXQgPSByZXF1aXJlKCdtbC1zdGF0Jyk7XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBnaXZlbiB2ZWN0b3IsIHJldHVybnMgaGlzIG5vcm1cbiAqIEBwYXJhbSB7VmVjdG9yfSBYXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBOb3JtIG9mIHRoZSB2ZWN0b3JcbiAqL1xuZnVuY3Rpb24gbm9ybShYKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChYLmNsb25lKCkuYXBwbHkocG93MmFycmF5KS5zdW0oKSk7XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBwb3cgMiBlYWNoIGVsZW1lbnQgb2YgYSBNYXRyaXggb3IgYSBWZWN0b3IsXG4gKiB1c2VkIGluIHRoZSBhcHBseSBtZXRob2Qgb2YgdGhlIE1hdHJpeCBvYmplY3RcbiAqIEBwYXJhbSBpIC0gaW5kZXggaS5cbiAqIEBwYXJhbSBqIC0gaW5kZXggai5cbiAqIEByZXR1cm4gVGhlIE1hdHJpeCBvYmplY3QgbW9kaWZpZWQgYXQgdGhlIGluZGV4IGksIGouXG4gKiAqL1xuZnVuY3Rpb24gcG93MmFycmF5KGksIGopIHtcbiAgICB0aGlzW2ldW2pdID0gdGhpc1tpXVtqXSAqIHRoaXNbaV1bal07XG4gICAgcmV0dXJuIHRoaXM7XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBub3JtYWxpemUgdGhlIGRhdGFzZXQgYW5kIHJldHVybiB0aGUgbWVhbnMgYW5kXG4gKiBzdGFuZGFyZCBkZXZpYXRpb24gb2YgZWFjaCBmZWF0dXJlLlxuICogQHBhcmFtIGRhdGFzZXRcbiAqIEByZXR1cm5zIHt7cmVzdWx0OiBNYXRyaXgsIG1lYW5zOiAoKnxudW1iZXIpLCBzdGQ6IE1hdHJpeH19IGRhdGFzZXQgbm9ybWFsaXplZCwgbWVhbnNcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFuZCBzdGFuZGFyZCBkZXZpYXRpb25zXG4gKi9cbmZ1bmN0aW9uIGZlYXR1cmVOb3JtYWxpemUoZGF0YXNldCkge1xuICAgIHZhciBtZWFucyA9IFN0YXQubWF0cml4Lm1lYW4oZGF0YXNldCk7XG4gICAgdmFyIHN0ZCA9IE1hdHJpeC5yb3dWZWN0b3IoU3RhdC5tYXRyaXguc3RhbmRhcmREZXZpYXRpb24oZGF0YXNldCwgbWVhbnMsIHRydWUpKTtcbiAgICBtZWFucyA9IE1hdHJpeC5yb3dWZWN0b3IobWVhbnMpO1xuXG4gICAgdmFyIHJlc3VsdCA9IGRhdGFzZXQuYWRkUm93VmVjdG9yKG1lYW5zLm5lZygpKTtcbiAgICByZXR1cm4ge3Jlc3VsdDogcmVzdWx0LmRpdlJvd1ZlY3RvcihzdGQpLCBtZWFuczogbWVhbnMsIHN0ZDogc3RkfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbm9ybTogbm9ybSxcbiAgICBwb3cyYXJyYXk6IHBvdzJhcnJheSxcbiAgICBmZWF0dXJlTm9ybWFsaXplOiBmZWF0dXJlTm9ybWFsaXplXG59O1xuXG4iLCIvKiFcbiAqIG5nQ29yZG92YVxuICogdjAuMS4yMy1hbHBoYVxuICogQ29weXJpZ2h0IDIwMTUgRHJpZnR5IENvLiBodHRwOi8vZHJpZnR5LmNvbS9cbiAqIFNlZSBMSUNFTlNFIGluIHRoaXMgcmVwb3NpdG9yeSBmb3IgbGljZW5zZSBpbmZvcm1hdGlvblxuICovXG4oZnVuY3Rpb24oKXtcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YScsIFtcbiAgJ25nQ29yZG92YS5wbHVnaW5zJ1xuXSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vY29yZG92YS1wbHVnaW4tYWN0aW9uc2hlZXQuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vY29yZG92YS1wbHVnaW4tYWN0aW9uc2hlZXRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmFjdGlvblNoZWV0JywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQWN0aW9uU2hlZXQnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzaG93OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmFjdGlvbnNoZWV0LnNob3cob3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW5zLmFjdGlvbnNoZWV0LmhpZGUoKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tYWRtb2IuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tYWRtb2JcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmFkTW9iJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQWRNb2InLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjcmVhdGVCYW5uZXJWaWV3OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLkFkTW9iLmNyZWF0ZUJhbm5lclZpZXcob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUludGVyc3RpdGlhbFZpZXc6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuQWRNb2IuY3JlYXRlSW50ZXJzdGl0aWFsVmlldyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVxdWVzdEFkOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLkFkTW9iLnJlcXVlc3RBZChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0FkOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLkFkTW9iLnNob3dBZChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVxdWVzdEludGVyc3RpdGlhbEFkOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLkFkTW9iLnJlcXVlc3RJbnRlcnN0aXRpYWxBZChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9vaGgyYWhoL0FwcEF2YWlsYWJpbGl0eS5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9vaGgyYWhoL0FwcEF2YWlsYWJpbGl0eVxuXG4vKiBnbG9iYWxzIGFwcEF2YWlsYWJpbGl0eTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmFwcEF2YWlsYWJpbGl0eScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUFwcEF2YWlsYWJpbGl0eScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjaGVjazogZnVuY3Rpb24gKHVybFNjaGVtZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgYXBwQXZhaWxhYmlsaXR5LmNoZWNrKHVybFNjaGVtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcHVzaGFuZHBsYXkvY29yZG92YS1wbHVnaW4tYXBwcmF0ZS5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9wdXNoYW5kcGxheS9jb3Jkb3ZhLXBsdWdpbi1hcHByYXRlXG5cbi8qIGdsb2JhbHMgQXBwUmF0ZTogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmFwcFJhdGUnLCBbXSlcblxuICAucHJvdmlkZXIoJyRjb3Jkb3ZhQXBwUmF0ZScsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICAvKipcbiAgICAgICogU2V0IGRlZmF1bHRzIHNldHRpbmdzIHRvIEFwcFJhdGVcbiAgICAgICpcbiAgICAgICogQHBhcmFtIHtPYmplY3R9IGRlZmF1bHRzIC0gQXBwUmF0ZSBkZWZhdWx0IHNldHRpbmdzXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy5sYW5ndWFnZVxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMuYXBwTmFtZVxuICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGRlZmF1bHRzLnByb21wdEZvck5ld1ZlcnNpb25cbiAgICAgICogQHBhcmFtIHtib29sZWFufSBkZWZhdWx0cy5vcGVuU3RvcmVJbkFwcFxuICAgICAgKiBAcGFyYW0ge251bWJlcn0gZGVmYXVsdHMudXNlc1VudGlsUHJvbXB0XG4gICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZGVmYXVsdHMudXNlQ3VzdG9tUmF0ZURpYWxvZ1xuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gZGVmYXVsdHMuaW9zVVJMXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy5hbmRyb2lkVVJMXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy5ibGFja2JlcnJ5VVJMXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBkZWZhdWx0cy53aW5kb3dzVVJMXG4gICAgICAqL1xuICAgIHRoaXMuc2V0UHJlZmVyZW5jZXMgPSBmdW5jdGlvbiAoZGVmYXVsdHMpIHtcbiAgICAgIGlmICghZGVmYXVsdHMgfHwgIWFuZ3VsYXIuaXNPYmplY3QoZGVmYXVsdHMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy51c2VMYW5ndWFnZSA9IGRlZmF1bHRzLmxhbmd1YWdlIHx8IG51bGw7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLmRpc3BsYXlBcHBOYW1lID0gZGVmYXVsdHMuYXBwTmFtZSB8fCAnJztcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMucHJvbXB0QWdhaW5Gb3JFYWNoTmV3VmVyc2lvbiA9IGRlZmF1bHRzLnByb21wdEZvck5ld1ZlcnNpb24gfHwgdHJ1ZTtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMub3BlblN0b3JlSW5BcHAgPSBkZWZhdWx0cy5vcGVuU3RvcmVJbkFwcCB8fCBmYWxzZTtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMudXNlc1VudGlsUHJvbXB0ID0gZGVmYXVsdHMudXNlc1VudGlsUHJvbXB0IHx8IDM7XG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLnVzZUN1c3RvbVJhdGVEaWFsb2cgPSBkZWZhdWx0cy51c2VDdXN0b21SYXRlRGlhbG9nIHx8IGZhbHNlO1xuICAgICAgQXBwUmF0ZS5wcmVmZXJlbmNlcy5zdG9yZUFwcFVSTC5pb3MgPSBkZWZhdWx0cy5pb3NVUkwgfHwgbnVsbDtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuc3RvcmVBcHBVUkwuYW5kcm9pZCA9IGRlZmF1bHRzLmFuZHJvaWRVUkwgfHwgbnVsbDtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuc3RvcmVBcHBVUkwuYmxhY2tiZXJyeSA9IGRlZmF1bHRzLmJsYWNrYmVycnlVUkwgfHwgbnVsbDtcbiAgICAgIEFwcFJhdGUucHJlZmVyZW5jZXMuc3RvcmVBcHBVUkwud2luZG93czggPSBkZWZhdWx0cy53aW5kb3dzVVJMIHx8IG51bGw7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAgKiBTZXQgY3VzdG9tIGxvY2FsZVxuICAgICAgKlxuICAgICAgKiBAcGFyYW0ge09iamVjdH0gY3VzdG9tT2JqXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjdXN0b21PYmoudGl0bGVcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGN1c3RvbU9iai5jYW5jZWxCdXR0b25MYWJlbFxuICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY3VzdG9tT2JqLmxhdGVyQnV0dG9uTGFiZWxcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IGN1c3RvbU9iai5yYXRlQnV0dG9uTGFiZWxcbiAgICAgICovXG4gICAgdGhpcy5zZXRDdXN0b21Mb2NhbGUgPSBmdW5jdGlvbiAoY3VzdG9tT2JqKSB7XG4gICAgICB2YXIgc3RyaW5ncyA9IHtcbiAgICAgICAgdGl0bGU6ICdSYXRlICVAJyxcbiAgICAgICAgbWVzc2FnZTogJ0lmIHlvdSBlbmpveSB1c2luZyAlQCwgd291bGQgeW91IG1pbmQgdGFraW5nIGEgbW9tZW50IHRvIHJhdGUgaXQ/IEl0IHdvbuKAmXQgdGFrZSBtb3JlIHRoYW4gYSBtaW51dGUuIFRoYW5rcyBmb3IgeW91ciBzdXBwb3J0IScsXG4gICAgICAgIGNhbmNlbEJ1dHRvbkxhYmVsOiAnTm8sIFRoYW5rcycsXG4gICAgICAgIGxhdGVyQnV0dG9uTGFiZWw6ICdSZW1pbmQgTWUgTGF0ZXInLFxuICAgICAgICByYXRlQnV0dG9uTGFiZWw6ICdSYXRlIEl0IE5vdydcbiAgICAgIH07XG5cbiAgICAgIHN0cmluZ3MgPSBhbmd1bGFyLmV4dGVuZChzdHJpbmdzLCBjdXN0b21PYmopO1xuXG4gICAgICBBcHBSYXRlLnByZWZlcmVuY2VzLmN1c3RvbUxvY2FsZSA9IHN0cmluZ3M7XG4gICAgfTtcblxuICAgIHRoaXMuJGdldCA9IFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHByb21wdEZvclJhdGluZzogZnVuY3Rpb24gKGltbWVkaWF0ZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICB2YXIgcHJvbXB0ID0gQXBwUmF0ZS5wcm9tcHRGb3JSYXRpbmcoaW1tZWRpYXRlKTtcbiAgICAgICAgICBxLnJlc29sdmUocHJvbXB0KTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbmF2aWdhdGVUb0FwcFN0b3JlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIHZhciBuYXZpZ2F0ZSA9IEFwcFJhdGUubmF2aWdhdGVUb0FwcFN0b3JlKCk7XG4gICAgICAgICAgcS5yZXNvbHZlKG5hdmlnYXRlKTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgb25CdXR0b25DbGlja2VkOiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgICAgICBBcHBSYXRlLm9uQnV0dG9uQ2xpY2tlZCA9IGZ1bmN0aW9uIChidXR0b25JbmRleCkge1xuICAgICAgICAgICAgY2IuY2FsbCh0aGlzLCBidXR0b25JbmRleCk7XG4gICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICBvblJhdGVEaWFsb2dTaG93OiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgICAgICBBcHBSYXRlLm9uUmF0ZURpYWxvZ1Nob3cgPSBjYigpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3doaXRlb2N0b2Jlci9jb3Jkb3ZhLXBsdWdpbi1hcHAtdmVyc2lvbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vd2hpdGVvY3RvYmVyL2NvcmRvdmEtcGx1Z2luLWFwcC12ZXJzaW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5hcHBWZXJzaW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQXBwVmVyc2lvbicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRBcHBOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5nZXRBcHBWZXJzaW9uLmdldEFwcE5hbWUoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICBxLnJlc29sdmUobmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRQYWNrYWdlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGNvcmRvdmEuZ2V0QXBwVmVyc2lvbi5nZXRQYWNrYWdlTmFtZShmdW5jdGlvbiAocGFja2FnZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShwYWNrYWdlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFZlcnNpb25OdW1iZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLmdldEFwcFZlcnNpb24uZ2V0VmVyc2lvbk51bWJlcihmdW5jdGlvbiAodmVyc2lvbikge1xuICAgICAgICAgIHEucmVzb2x2ZSh2ZXJzaW9uKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFZlcnNpb25Db2RlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5nZXRBcHBWZXJzaW9uLmdldFZlcnNpb25Db2RlKGZ1bmN0aW9uIChjb2RlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGNvZGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vY2hyaXN0b2NyYWN5L2NvcmRvdmEtcGx1Z2luLWJhY2tncm91bmQtZ2VvbG9jYXRpb24uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2NocmlzdG9jcmFjeS9jb3Jkb3ZhLXBsdWdpbi1iYWNrZ3JvdW5kLWdlb2xvY2F0aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5iYWNrZ3JvdW5kR2VvbG9jYXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCYWNrZ3JvdW5kR2VvbG9jYXRpb24nLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG5cbiAgICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHdpbmRvdy5uYXZpZ2F0b3IuZ2VvbG9jYXRpb24uZ2V0Q3VycmVudFBvc2l0aW9uKGZ1bmN0aW9uIChsb2NhdGlvbikge1xuICAgICAgICAgIHJldHVybiBsb2NhdGlvbjtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICBjb25maWd1cmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuYmFja2dyb3VuZEdlb0xvY2F0aW9uLmNvbmZpZ3VyZShcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmJhY2tncm91bmRHZW9Mb2NhdGlvbi5maW5pc2goKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgdGhpcy5zdGFydCgpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdGFydDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmJhY2tncm91bmRHZW9Mb2NhdGlvbi5zdGFydChcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5iYWNrZ3JvdW5kR2VvTG9jYXRpb24uc3RvcChcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgXSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20va2F0emVyL2NvcmRvdmEtcGx1Z2luLWJhZGdlLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1iYWRnZVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFkZ2UnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCYWRnZScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBoYXNQZXJtaXNzaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5oYXNQZXJtaXNzaW9uKGZ1bmN0aW9uIChwZXJtaXNzaW9uKSB7XG4gICAgICAgICAgaWYgKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJvbXB0Rm9yUGVybWlzc2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5wcm9tcHRGb3JQZXJtaXNzaW9uKCk7XG4gICAgICB9LFxuXG4gICAgICBzZXQ6IGZ1bmN0aW9uIChiYWRnZSwgY2FsbGJhY2ssIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmhhc1Blcm1pc3Npb24oZnVuY3Rpb24gKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICBpZiAocGVybWlzc2lvbikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKFxuICAgICAgICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLnNldChiYWRnZSwgY2FsbGJhY2ssIHNjb3BlKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHNldCBCYWRnZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmhhc1Blcm1pc3Npb24oZnVuY3Rpb24gKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICBpZiAocGVybWlzc2lvbikge1xuICAgICAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5nZXQoZnVuY3Rpb24gKGJhZGdlKSB7XG4gICAgICAgICAgICAgIHEucmVzb2x2ZShiYWRnZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGdldCBCYWRnZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyOiBmdW5jdGlvbiAoY2FsbGJhY2ssIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmhhc1Blcm1pc3Npb24oZnVuY3Rpb24gKHBlcm1pc3Npb24pIHtcbiAgICAgICAgICBpZiAocGVybWlzc2lvbikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24uYmFkZ2UuY2xlYXIoY2FsbGJhY2ssIHNjb3BlKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byBjbGVhciBCYWRnZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpbmNyZWFzZTogZnVuY3Rpb24gKGNvdW50LCBjYWxsYmFjaywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHRoaXMuaGFzUGVybWlzc2lvbigpLnRoZW4oZnVuY3Rpb24gKCl7XG4gICAgICAgICAgcS5yZXNvbHZlKFxuICAgICAgICAgICAgY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5iYWRnZS5pbmNyZWFzZShjb3VudCwgY2FsbGJhY2ssIHNjb3BlKVxuICAgICAgICAgICk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpe1xuICAgICAgICAgIHEucmVqZWN0KCdZb3UgZG8gbm90IGhhdmUgcGVybWlzc2lvbiB0byBpbmNyZWFzZSBCYWRnZScpO1xuICAgICAgICB9KSA7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGRlY3JlYXNlOiBmdW5jdGlvbiAoY291bnQsIGNhbGxiYWNrLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgdGhpcy5oYXNQZXJtaXNzaW9uKCkudGhlbihmdW5jdGlvbiAoKXtcbiAgICAgICAgICBxLnJlc29sdmUoXG4gICAgICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmRlY3JlYXNlKGNvdW50LCBjYWxsYmFjaywgc2NvcGUpXG4gICAgICAgICAgKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCl7XG4gICAgICAgICAgcS5yZWplY3QoJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGRlY3JlYXNlIEJhZGdlJyk7XG4gICAgICAgIH0pIDtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY29uZmlndXJlOiBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmJhZGdlLmNvbmZpZ3VyZShjb25maWcpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1iYXJjb2Rlc2Nhbm5lci5naXRcbi8vIGxpbmsgICAgIDogICAgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1iYXJjb2Rlc2Nhbm5lclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuYmFyY29kZVNjYW5uZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCYXJjb2RlU2Nhbm5lcicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzY2FuOiBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuYmFyY29kZVNjYW5uZXIuc2NhbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBjb25maWcpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBlbmNvZGU6IGZ1bmN0aW9uICh0eXBlLCBkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdHlwZSA9IHR5cGUgfHwgJ1RFWFRfVFlQRSc7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmJhcmNvZGVTY2FubmVyLmVuY29kZSh0eXBlLCBkYXRhLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gIGluc3RhbGwgICA6ICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWJhdHRlcnktc3RhdHVzXG4vLyAgbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWJhdHRlcnktc3RhdHVzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5iYXR0ZXJ5U3RhdHVzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQmF0dGVyeVN0YXR1cycsIFsnJHJvb3RTY29wZScsICckd2luZG93JywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRyb290U2NvcGUsICR3aW5kb3csICR0aW1lb3V0KSB7XG5cbiAgICAvKipcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IHN0YXR1c1xuICAgICAgKi9cbiAgICB2YXIgYmF0dGVyeVN0YXR1cyA9IGZ1bmN0aW9uIChzdGF0dXMpIHtcbiAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJhdHRlcnlTdGF0dXM6c3RhdHVzJywgc3RhdHVzKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgICogQHBhcmFtIHtzdHJpbmd9IHN0YXR1c1xuICAgICAgKi9cbiAgICB2YXIgYmF0dGVyeUNyaXRpY2FsID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmF0dGVyeVN0YXR1czpjcml0aWNhbCcsIHN0YXR1cyk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXNcbiAgICAgICovXG4gICAgdmFyIGJhdHRlcnlMb3cgPSBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCYXR0ZXJ5U3RhdHVzOmxvdycsIHN0YXR1cyk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAobmF2aWdhdG9yLmJhdHRlcnkpIHtcbiAgICAgICAgJHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiYXR0ZXJ5c3RhdHVzJywgYmF0dGVyeVN0YXR1cywgZmFsc2UpO1xuICAgICAgICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JhdHRlcnljcml0aWNhbCcsIGJhdHRlcnlDcml0aWNhbCwgZmFsc2UpO1xuICAgICAgICAkd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JhdHRlcnlsb3cnLCBiYXR0ZXJ5TG93LCBmYWxzZSk7XG5cbiAgICAgIH1cbiAgICB9LCBmYWxzZSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1dKVxuICAucnVuKFsnJGluamVjdG9yJywgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICRpbmplY3Rvci5nZXQoJyRjb3Jkb3ZhQmF0dGVyeVN0YXR1cycpOyAvL2Vuc3VyZSB0aGUgZmFjdG9yeSBhbmQgc3Vic2VxdWVudCBldmVudCBsaXN0ZW5lcnMgZ2V0IGluaXRpYWxpc2VkXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcGV0ZXJtZXR6L2NvcmRvdmEtcGx1Z2luLWliZWFjb24uZ2l0XG4vLyBsaW5rICAgICAgOiAgaHR0cHM6Ly9naXRodWIuY29tL3BldGVybWV0ei9jb3Jkb3ZhLXBsdWdpbi1pYmVhY29uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5iZWFjb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCZWFjb24nLCBbJyR3aW5kb3cnLCAnJHJvb3RTY29wZScsICckdGltZW91dCcsICckcScsIGZ1bmN0aW9uICgkd2luZG93LCAkcm9vdFNjb3BlLCAkdGltZW91dCwgJHEpIHtcbiAgICB2YXIgY2FsbGJhY2tEaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbiA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrRGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tEaWRFeGl0UmVnaW9uID0gbnVsbDtcbiAgICB2YXIgY2FsbGJhY2tEaWRFbnRlclJlZ2lvbiA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrRGlkUmFuZ2VCZWFjb25zSW5SZWdpb24gPSBudWxsO1xuICAgIHZhciBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZyA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZSA9IG51bGw7XG4gICAgdmFyIGNhbGxiYWNrRGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cyA9IG51bGw7XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICgkd2luZG93LmNvcmRvdmEgJiZcbiAgICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucyAmJlxuICAgICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlcikge1xuICAgICAgICB2YXIgZGVsZWdhdGUgPSBuZXcgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLkRlbGVnYXRlKCk7XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24gPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbicsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbikge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbihwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24gPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWRTdGFydE1vbml0b3JpbmdGb3JSZWdpb24nLCBwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrRGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbihwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWRFeGl0UmVnaW9uID0gZnVuY3Rpb24gKHBsdWdpblJlc3VsdCkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkRXhpdFJlZ2lvbicsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWRFeGl0UmVnaW9uKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZEV4aXRSZWdpb24ocGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZGVsZWdhdGUuZGlkRW50ZXJSZWdpb24gPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpkaWRFbnRlclJlZ2lvbicsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWRFbnRlclJlZ2lvbikge1xuICAgICAgICAgICAgY2FsbGJhY2tEaWRFbnRlclJlZ2lvbihwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWRSYW5nZUJlYWNvbnNJblJlZ2lvbiA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOmRpZFJhbmdlQmVhY29uc0luUmVnaW9uJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja0RpZFJhbmdlQmVhY29uc0luUmVnaW9uKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZFJhbmdlQmVhY29uc0luUmVnaW9uKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLnBlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZyA9IGZ1bmN0aW9uIChwbHVnaW5SZXN1bHQpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhQmVhY29uOnBlcmlwaGVyYWxNYW5hZ2VyRGlkU3RhcnRBZHZlcnRpc2luZycsIHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nKHBsdWdpblJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGRlbGVnYXRlLnBlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUgPSBmdW5jdGlvbiAocGx1Z2luUmVzdWx0KSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUJlYWNvbjpwZXJpcGhlcmFsTWFuYWdlckRpZFVwZGF0ZVN0YXRlJywgcGx1Z2luUmVzdWx0KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRVcGRhdGVTdGF0ZShwbHVnaW5SZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBkZWxlZ2F0ZS5kaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFCZWFjb246ZGlkQ2hhbmdlQXV0aG9yaXphdGlvblN0YXR1cycsIHN0YXR1cyk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tEaWRDaGFuZ2VBdXRob3JpemF0aW9uU3RhdHVzKSB7XG4gICAgICAgICAgICBjYWxsYmFja0RpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMoc3RhdHVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnNldERlbGVnYXRlKGRlbGVnYXRlKTtcbiAgICAgIH1cbiAgICB9LCBmYWxzZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0Q2FsbGJhY2tEaWREZXRlcm1pbmVTdGF0ZUZvclJlZ2lvbjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkRGV0ZXJtaW5lU3RhdGVGb3JSZWdpb24gPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja0RpZFN0YXJ0TW9uaXRvcmluZ0ZvclJlZ2lvbjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkU3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tEaWRFeGl0UmVnaW9uOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWRFeGl0UmVnaW9uID0gY2FsbGJhY2s7XG4gICAgICB9LFxuICAgICAgc2V0Q2FsbGJhY2tEaWRFbnRlclJlZ2lvbjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrRGlkRW50ZXJSZWdpb24gPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja0RpZFJhbmdlQmVhY29uc0luUmVnaW9uOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tEaWRSYW5nZUJlYWNvbnNJblJlZ2lvbiA9IGNhbGxiYWNrO1xuICAgICAgfSxcbiAgICAgIHNldENhbGxiYWNrUGVyaXBoZXJhbE1hbmFnZXJEaWRTdGFydEFkdmVydGlzaW5nOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2tQZXJpcGhlcmFsTWFuYWdlckRpZFN0YXJ0QWR2ZXJ0aXNpbmcgPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGU6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja1BlcmlwaGVyYWxNYW5hZ2VyRGlkVXBkYXRlU3RhdGUgPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBzZXRDYWxsYmFja0RpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXM6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFja0RpZENoYW5nZUF1dGhvcml6YXRpb25TdGF0dXMgPSBjYWxsYmFjaztcbiAgICAgIH0sXG4gICAgICBjcmVhdGVCZWFjb25SZWdpb246IGZ1bmN0aW9uIChpZGVudGlmaWVyLCB1dWlkLCBtYWpvciwgbWlub3IsIG5vdGlmeUVudHJ5U3RhdGVPbkRpc3BsYXkpIHtcbiAgICAgICAgbWFqb3IgPSBtYWpvciB8fCB1bmRlZmluZWQ7XG4gICAgICAgIG1pbm9yID0gbWlub3IgfHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIHJldHVybiBuZXcgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLkJlYWNvblJlZ2lvbihcbiAgICAgICAgICBpZGVudGlmaWVyLFxuICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgbWFqb3IsXG4gICAgICAgICAgbWlub3IsXG4gICAgICAgICAgbm90aWZ5RW50cnlTdGF0ZU9uRGlzcGxheVxuICAgICAgICApO1xuICAgICAgfSxcbiAgICAgIGlzQmx1ZXRvb3RoRW5hYmxlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuaXNCbHVldG9vdGhFbmFibGVkKCkpO1xuICAgICAgfSxcbiAgICAgIGVuYWJsZUJsdWV0b290aDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZW5hYmxlQmx1ZXRvb3RoKCkpO1xuICAgICAgfSxcbiAgICAgIGRpc2FibGVCbHVldG9vdGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmRpc2FibGVCbHVldG9vdGgoKSk7XG4gICAgICB9LFxuICAgICAgc3RhcnRNb25pdG9yaW5nRm9yUmVnaW9uOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdGFydE1vbml0b3JpbmdGb3JSZWdpb24ocmVnaW9uKSk7XG4gICAgICB9LFxuICAgICAgc3RvcE1vbml0b3JpbmdGb3JSZWdpb246IGZ1bmN0aW9uIChyZWdpb24pIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLnN0b3BNb25pdG9yaW5nRm9yUmVnaW9uKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIHJlcXVlc3RTdGF0ZUZvclJlZ2lvbjogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIucmVxdWVzdFN0YXRlRm9yUmVnaW9uKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIHN0YXJ0UmFuZ2luZ0JlYWNvbnNJblJlZ2lvbjogZnVuY3Rpb24gKHJlZ2lvbikge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RhcnRSYW5naW5nQmVhY29uc0luUmVnaW9uKHJlZ2lvbikpO1xuICAgICAgfSxcbiAgICAgIHN0b3BSYW5naW5nQmVhY29uc0luUmVnaW9uOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdG9wUmFuZ2luZ0JlYWNvbnNJblJlZ2lvbihyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICBnZXRBdXRob3JpemF0aW9uU3RhdHVzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5nZXRBdXRob3JpemF0aW9uU3RhdHVzKCkpO1xuICAgICAgfSxcbiAgICAgIHJlcXVlc3RXaGVuSW5Vc2VBdXRob3JpemF0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5yZXF1ZXN0V2hlbkluVXNlQXV0aG9yaXphdGlvbigpKTtcbiAgICAgIH0sXG4gICAgICByZXF1ZXN0QWx3YXlzQXV0aG9yaXphdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIucmVxdWVzdEFsd2F5c0F1dGhvcml6YXRpb24oKSk7XG4gICAgICB9LFxuICAgICAgZ2V0TW9uaXRvcmVkUmVnaW9uczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZ2V0TW9uaXRvcmVkUmVnaW9ucygpKTtcbiAgICAgIH0sXG4gICAgICBnZXRSYW5nZWRSZWdpb25zOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5nZXRSYW5nZWRSZWdpb25zKCkpO1xuICAgICAgfSxcbiAgICAgIGlzUmFuZ2luZ0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuaXNSYW5naW5nQXZhaWxhYmxlKCkpO1xuICAgICAgfSxcbiAgICAgIGlzTW9uaXRvcmluZ0F2YWlsYWJsZUZvckNsYXNzOiBmdW5jdGlvbiAocmVnaW9uKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5pc01vbml0b3JpbmdBdmFpbGFibGVGb3JDbGFzcyhyZWdpb24pKTtcbiAgICAgIH0sXG4gICAgICBzdGFydEFkdmVydGlzaW5nOiBmdW5jdGlvbiAocmVnaW9uLCBtZWFzdXJlZFBvd2VyKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5zdGFydEFkdmVydGlzaW5nKHJlZ2lvbiwgbWVhc3VyZWRQb3dlcikpO1xuICAgICAgfSxcbiAgICAgIHN0b3BBZHZlcnRpc2luZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuc3RvcEFkdmVydGlzaW5nKCkpO1xuICAgICAgfSxcbiAgICAgIGlzQWR2ZXJ0aXNpbmdBdmFpbGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmlzQWR2ZXJ0aXNpbmdBdmFpbGFibGUoKSk7XG4gICAgICB9LFxuICAgICAgaXNBZHZlcnRpc2luZzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuaXNBZHZlcnRpc2luZygpKTtcbiAgICAgIH0sXG4gICAgICBkaXNhYmxlRGVidWdMb2dzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5kaXNhYmxlRGVidWdMb2dzKCkpO1xuICAgICAgfSxcbiAgICAgIGVuYWJsZURlYnVnTm90aWZpY2F0aW9uczogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHEud2hlbigkd2luZG93LmNvcmRvdmEucGx1Z2lucy5sb2NhdGlvbk1hbmFnZXIuZW5hYmxlRGVidWdOb3RpZmljYXRpb25zKCkpO1xuICAgICAgfSxcbiAgICAgIGRpc2FibGVEZWJ1Z05vdGlmaWNhdGlvbnM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRxLndoZW4oJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubG9jYXRpb25NYW5hZ2VyLmRpc2FibGVEZWJ1Z05vdGlmaWNhdGlvbnMoKSk7XG4gICAgICB9LFxuICAgICAgZW5hYmxlRGVidWdMb2dzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5lbmFibGVEZWJ1Z0xvZ3MoKSk7XG4gICAgICB9LFxuICAgICAgYXBwZW5kVG9EZXZpY2VMb2c6IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiAkcS53aGVuKCR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmxvY2F0aW9uTWFuYWdlci5hcHBlbmRUb0RldmljZUxvZyhtZXNzYWdlKSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyAgaW5zdGFsbCAgIDogICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Rvbi9jb3Jkb3ZhLXBsdWdpbi1ibGUtY2VudHJhbC5naXRcbi8vICBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9kb24vY29yZG92YS1wbHVnaW4tYmxlLWNlbnRyYWxcblxuLyogZ2xvYmFscyBibGU6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5ibGUnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCTEUnLCBbJyRxJywgJyR0aW1lb3V0JywgJyRsb2cnLCBmdW5jdGlvbiAoJHEsICR0aW1lb3V0LCAkbG9nKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2NhbjogZnVuY3Rpb24gKHNlcnZpY2VzLCBzZWNvbmRzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBibGUuc3RhcnRTY2FuKHNlcnZpY2VzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBibGUuc3RvcFNjYW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgc2Vjb25kcyoxMDAwKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RhcnRTY2FuOiBmdW5jdGlvbiAoc2VydmljZXMsIGNhbGxiYWNrLCBlcnJvckNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBibGUuc3RhcnRTY2FuKHNlcnZpY2VzLCBjYWxsYmFjaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICB9LFxuXG4gICAgICBzdG9wU2NhbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5zdG9wU2NhbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjb25uZWN0OiBmdW5jdGlvbiAoZGV2aWNlSUQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuY29ubmVjdChkZXZpY2VJRCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGlzY29ubmVjdDogZnVuY3Rpb24gKGRldmljZUlEKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLmRpc2Nvbm5lY3QoZGV2aWNlSUQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWQ6IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5yZWFkKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3cml0ZTogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLndyaXRlKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3cml0ZVdpdGhvdXRSZXNwb25zZTogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLndyaXRlV2l0aG91dFJlc3BvbnNlKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlELCBkYXRhLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3cml0ZUNvbW1hbmQ6IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgZGF0YSkge1xuICAgICAgICAkbG9nLndhcm5pbmcoJ3dyaXRlQ29tbWFuZCBpcyBkZXByZWNhdGVkLCB1c2Ugd3JpdGVXaXRob3V0UmVzcG9uc2UnKTtcbiAgICAgICAgcmV0dXJuIHRoaXMud3JpdGVXaXRob3V0UmVzcG9uc2UoZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGRhdGEpO1xuICAgICAgfSxcblxuICAgICAgc3RhcnROb3RpZmljYXRpb246IGZ1bmN0aW9uIChkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgY2FsbGJhY2ssIGVycm9yQ2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGJsZS5zdGFydE5vdGlmaWNhdGlvbihkZXZpY2VJRCwgc2VydmljZVVVSUQsIGNoYXJhY3RlcmlzdGljVVVJRCwgY2FsbGJhY2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgfSxcblxuICAgICAgc3RvcE5vdGlmaWNhdGlvbjogZnVuY3Rpb24gKGRldmljZUlELCBzZXJ2aWNlVVVJRCwgY2hhcmFjdGVyaXN0aWNVVUlEKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLnN0b3BOb3RpZmljYXRpb24oZGV2aWNlSUQsIHNlcnZpY2VVVUlELCBjaGFyYWN0ZXJpc3RpY1VVSUQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzQ29ubmVjdGVkOiBmdW5jdGlvbiAoZGV2aWNlSUQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBibGUuaXNDb25uZWN0ZWQoZGV2aWNlSUQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGVuYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGJsZS5lbmFibGUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNFbmFibGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgYmxlLmlzRW5hYmxlZChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9kb24vQmx1ZXRvb3RoU2VyaWFsLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9kb24vQmx1ZXRvb3RoU2VyaWFsXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5ibHVldG9vdGhTZXJpYWwnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCbHVldG9vdGhTZXJpYWwnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjb25uZWN0OiBmdW5jdGlvbiAoYWRkcmVzcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBkaXNjb25uZWN0aW9uUHJvbWlzZSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBpc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5jb25uZWN0KGFkZHJlc3MsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpc0Nvbm5lY3RlZCA9IHRydWU7XG4gICAgICAgICAgcS5yZXNvbHZlKGRpc2Nvbm5lY3Rpb25Qcm9taXNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgaWYoaXNDb25uZWN0ZWQgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBkaXNjb25uZWN0aW9uUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLy8gbm90IHN1cHBvcnRlZCBvbiBpT1NcbiAgICAgIGNvbm5lY3RJbnNlY3VyZTogZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5jb25uZWN0SW5zZWN1cmUoYWRkcmVzcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGlzY29ubmVjdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmRpc2Nvbm5lY3QoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbGlzdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmxpc3QoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkaXNjb3ZlclVucGFpcmVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuZGlzY292ZXJVbnBhaXJlZChmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldERldmljZURpc2NvdmVyZWRMaXN0ZW5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnNldERldmljZURpc2NvdmVyZWRMaXN0ZW5lcihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEubm90aWZ5KGRhdGEpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyRGV2aWNlRGlzY292ZXJlZExpc3RlbmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmNsZWFyRGV2aWNlRGlzY292ZXJlZExpc3RlbmVyKCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93Qmx1ZXRvb3RoU2V0dGluZ3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5zaG93Qmx1ZXRvb3RoU2V0dGluZ3MoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNFbmFibGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuaXNFbmFibGVkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZW5hYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuZW5hYmxlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNDb25uZWN0ZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5pc0Nvbm5lY3RlZChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGF2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLmF2YWlsYWJsZShmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlYWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5yZWFkKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZFVudGlsOiBmdW5jdGlvbiAoZGVsaW1pdGVyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwucmVhZFVudGlsKGRlbGltaXRlciwgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3cml0ZTogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC53cml0ZShkYXRhLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdWJzY3JpYmU6IGZ1bmN0aW9uIChkZWxpbWl0ZXIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5zdWJzY3JpYmUoZGVsaW1pdGVyLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEubm90aWZ5KGRhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3Vic2NyaWJlUmF3RGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cuYmx1ZXRvb3RoU2VyaWFsLnN1YnNjcmliZVJhd0RhdGEoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICBxLm5vdGlmeShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVuc3Vic2NyaWJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwudW5zdWJzY3JpYmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5zdWJzY3JpYmVSYXdEYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwudW5zdWJzY3JpYmVSYXdEYXRhKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5ibHVldG9vdGhTZXJpYWwuY2xlYXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVhZFJTU0k6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LmJsdWV0b290aFNlcmlhbC5yZWFkUlNTSShmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9maXNjYWwtY2xpZmYvcGhvbmVnYXAtcGx1Z2luLWJyaWdodG5lc3MuZ2l0XG4vLyBsaW5rICAgICA6ICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9maXNjYWwtY2xpZmYvcGhvbmVnYXAtcGx1Z2luLWJyaWdodG5lc3NcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmJyaWdodG5lc3MnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFCcmlnaHRuZXNzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cuY29yZG92YSkge1xuICAgICAgICAgIHEucmVqZWN0KCdOb3Qgc3VwcG9ydGVkIHdpdGhvdXQgY29yZG92YS5qcycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLmJyaWdodG5lc3MuZ2V0QnJpZ2h0bmVzcyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldDogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghJHdpbmRvdy5jb3Jkb3ZhKSB7XG4gICAgICAgICAgcS5yZWplY3QoJ05vdCBzdXBwb3J0ZWQgd2l0aG91dCBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMuYnJpZ2h0bmVzcy5zZXRCcmlnaHRuZXNzKGRhdGEsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2V0S2VlcFNjcmVlbk9uOiBmdW5jdGlvbiAoYm9vbCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93LmNvcmRvdmEpIHtcbiAgICAgICAgICBxLnJlamVjdCgnTm90IHN1cHBvcnRlZCB3aXRob3V0IGNvcmRvdmEuanMnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5icmlnaHRuZXNzLnNldEtlZXBTY3JlZW5Pbihib29sLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9DYWxlbmRhci1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vQ2FsZW5kYXItUGhvbmVHYXAtUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jYWxlbmRhcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUNhbGVuZGFyJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIGNyZWF0ZUNhbGVuZGFyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgY3JlYXRlQ2FsT3B0aW9ucyA9ICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5nZXRDcmVhdGVDYWxlbmRhck9wdGlvbnMoKTtcblxuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgY3JlYXRlQ2FsT3B0aW9ucy5jYWxlbmRhck5hbWUgPSBvcHRpb25zO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNyZWF0ZUNhbE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChjcmVhdGVDYWxPcHRpb25zLCBvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5jcmVhdGVDYWxlbmRhcihjcmVhdGVDYWxPcHRpb25zLCBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZGVsZXRlQ2FsZW5kYXI6IGZ1bmN0aW9uIChjYWxlbmRhck5hbWUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5kZWxldGVDYWxlbmRhcihjYWxlbmRhck5hbWUsIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKG1lc3NhZ2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVFdmVudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmNyZWF0ZUV2ZW50KFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUV2ZW50V2l0aE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9uS2V5cyA9IFtdLFxuICAgICAgICAgIGNhbE9wdGlvbnMgPSB3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5nZXRDYWxlbmRhck9wdGlvbnMoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25LZXlzID0gT2JqZWN0LmtleXMoZGVmYXVsdE9wdGlvbnMpO1xuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgaWYgKGRlZmF1bHRPcHRpb25LZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGNhbE9wdGlvbnNba2V5XSA9IG9wdGlvbnNba2V5XTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVmYXVsdE9wdGlvbnNba2V5XSA9IG9wdGlvbnNba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuY3JlYXRlRXZlbnRXaXRoT3B0aW9ucyhcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGNhbE9wdGlvbnMsXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUV2ZW50SW50ZXJhY3RpdmVseTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmNyZWF0ZUV2ZW50SW50ZXJhY3RpdmVseShcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy50aXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5sb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5ub3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5zdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLmVuZERhdGUpLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVFdmVudEluTmFtZWRDYWxlbmRhcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgdGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGNhbGVuZGFyTmFtZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmNyZWF0ZUV2ZW50SW5OYW1lZENhbGVuZGFyKFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLnRpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMuY2FsZW5kYXJOYW1lLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBmaW5kRXZlbnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGRlZmF1bHRPcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5maW5kRXZlbnQoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBmdW5jdGlvbiAoZm91bmRFdmVudCkge1xuICAgICAgICAgICAgZC5yZXNvbHZlKGZvdW5kRXZlbnQpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbGlzdEV2ZW50c0luUmFuZ2U6IGZ1bmN0aW9uIChzdGFydERhdGUsIGVuZERhdGUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5jYWxlbmRhci5saXN0RXZlbnRzSW5SYW5nZShzdGFydERhdGUsIGVuZERhdGUsIGZ1bmN0aW9uIChldmVudHMpIHtcbiAgICAgICAgICBkLnJlc29sdmUoZXZlbnRzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbGlzdENhbGVuZGFyczogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmxpc3RDYWxlbmRhcnMoZnVuY3Rpb24gKGNhbGVuZGFycykge1xuICAgICAgICAgIGQucmVzb2x2ZShjYWxlbmRhcnMpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBmaW5kQWxsRXZlbnRzSW5OYW1lZENhbGVuZGFyOiBmdW5jdGlvbiAoY2FsZW5kYXJOYW1lKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIuZmluZEFsbEV2ZW50c0luTmFtZWRDYWxlbmRhcihjYWxlbmRhck5hbWUsIGZ1bmN0aW9uIChldmVudHMpIHtcbiAgICAgICAgICBkLnJlc29sdmUoZXZlbnRzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbW9kaWZ5RXZlbnQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHRpdGxlOiBudWxsLFxuICAgICAgICAgICAgbG9jYXRpb246IG51bGwsXG4gICAgICAgICAgICBub3RlczogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0RGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGVuZERhdGU6IG51bGwsXG4gICAgICAgICAgICBuZXdUaXRsZTogbnVsbCxcbiAgICAgICAgICAgIG5ld0xvY2F0aW9uOiBudWxsLFxuICAgICAgICAgICAgbmV3Tm90ZXM6IG51bGwsXG4gICAgICAgICAgICBuZXdTdGFydERhdGU6IG51bGwsXG4gICAgICAgICAgICBuZXdFbmREYXRlOiBudWxsXG4gICAgICAgICAgfTtcblxuICAgICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuY2FsZW5kYXIubW9kaWZ5RXZlbnQoXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMudGl0bGUsXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubG9jYXRpb24sXG4gICAgICAgICAgZGVmYXVsdE9wdGlvbnMubm90ZXMsXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuc3RhcnREYXRlKSxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5lbmREYXRlKSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5uZXdUaXRsZSxcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5uZXdMb2NhdGlvbixcbiAgICAgICAgICBkZWZhdWx0T3B0aW9ucy5uZXdOb3RlcyxcbiAgICAgICAgICBuZXcgRGF0ZShkZWZhdWx0T3B0aW9ucy5uZXdTdGFydERhdGUpLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLm5ld0VuZERhdGUpLFxuICAgICAgICAgIGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgICAgICBkLnJlc29sdmUobWVzc2FnZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkZWxldGVFdmVudDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgbmV3VGl0bGU6IG51bGwsXG4gICAgICAgICAgICBsb2NhdGlvbjogbnVsbCxcbiAgICAgICAgICAgIG5vdGVzOiBudWxsLFxuICAgICAgICAgICAgc3RhcnREYXRlOiBudWxsLFxuICAgICAgICAgICAgZW5kRGF0ZTogbnVsbFxuICAgICAgICAgIH07XG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZChkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmNhbGVuZGFyLmRlbGV0ZUV2ZW50KFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5ld1RpdGxlLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLmxvY2F0aW9uLFxuICAgICAgICAgIGRlZmF1bHRPcHRpb25zLm5vdGVzLFxuICAgICAgICAgIG5ldyBEYXRlKGRlZmF1bHRPcHRpb25zLnN0YXJ0RGF0ZSksXG4gICAgICAgICAgbmV3IERhdGUoZGVmYXVsdE9wdGlvbnMuZW5kRGF0ZSksXG4gICAgICAgICAgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGQucmVzb2x2ZShtZXNzYWdlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWNhbWVyYVxuLy8gbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWNhbWVyYVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FtZXJhJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQ2FtZXJhJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldFBpY3R1cmU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoIW5hdmlnYXRvci5jYW1lcmEpIHtcbiAgICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5jYW1lcmEuZ2V0UGljdHVyZShmdW5jdGlvbiAoaW1hZ2VEYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGltYWdlRGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYW51cDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmNhbWVyYS5jbGVhbnVwKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tbWVkaWEtY2FwdHVyZVxuLy8gbGluayAgICAgIDogICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1tZWRpYS1jYXB0dXJlXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jYXB0dXJlJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhQ2FwdHVyZScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjYXB0dXJlQXVkaW86IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoIW5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlLmNhcHR1cmVBdWRpbyhmdW5jdGlvbiAoYXVkaW9EYXRhKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKGF1ZGlvRGF0YSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIGNhcHR1cmVJbWFnZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmICghbmF2aWdhdG9yLmRldmljZS5jYXB0dXJlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUuY2FwdHVyZUltYWdlKGZ1bmN0aW9uIChpbWFnZURhdGEpIHtcbiAgICAgICAgICBxLnJlc29sdmUoaW1hZ2VEYXRhKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgY2FwdHVyZVZpZGVvOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCFuYXZpZ2F0b3IuZGV2aWNlLmNhcHR1cmUpIHtcbiAgICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5hdmlnYXRvci5kZXZpY2UuY2FwdHVyZS5jYXB0dXJlVmlkZW8oZnVuY3Rpb24gKHZpZGVvRGF0YSkge1xuICAgICAgICAgIHEucmVzb2x2ZSh2aWRlb0RhdGEpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSwgb3B0aW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgOiBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3ZrZWVwZS9jYXJkLmlvLmdpdFxuLy8gbGluayAgICA6IGh0dHBzOi8vZ2l0aHViLmNvbS92a2VlcGUvY2FyZC5pby5naXRcblxuLyogZ2xvYmFscyBDYXJkSU86IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jYXJkSU8nLCBbXSlcblxuICAucHJvdmlkZXIoXG4gICckY29yZG92YU5nQ2FyZElPJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIC8qKlxuICAgICAqIERlZmF1bHQgYXJyYXkgb2YgcmVzcG9uc2UgZGF0YSBmcm9tIGNhcmRJTyBzY2FuIGNhcmRcbiAgICAgKi9cbiAgICB2YXIgZGVmYXVsdFJlc3BGaWVsZHMgPSBbXG4gICAgICAnY2FyZF90eXBlJyxcbiAgICAgICdyZWRhY3RlZF9jYXJkX251bWJlcicsXG4gICAgICAnY2FyZF9udW1iZXInLFxuICAgICAgJ2V4cGlyeV9tb250aCcsXG4gICAgICAnZXhwaXJ5X3llYXInLFxuICAgICAgJ3Nob3J0X2V4cGlyeV95ZWFyJyxcbiAgICAgICdjdnYnLFxuICAgICAgJ3ppcCdcbiAgICBdO1xuXG4gICAgLyoqXG4gICAgICogRGVmYXVsdCBjb25maWcgZm9yIGNhcmRJTyBzY2FuIGZ1bmN0aW9uXG4gICAgICovXG4gICAgdmFyIGRlZmF1bHRTY2FuQ29uZmlnID0ge1xuICAgICAgJ2V4cGlyeSc6IHRydWUsXG4gICAgICAnY3Z2JzogdHJ1ZSxcbiAgICAgICd6aXAnOiBmYWxzZSxcbiAgICAgICdzdXBwcmVzc01hbnVhbCc6IGZhbHNlLFxuICAgICAgJ3N1cHByZXNzQ29uZmlybSc6IGZhbHNlLFxuICAgICAgJ2hpZGVMb2dvJzogdHJ1ZVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBDb25maWd1cmluZyBkZWZhdWx0UmVzcEZpZWxkcyB1c2luZyAkY29yZG92YU5nQ2FyZElPUHJvdmlkZXJcbiAgICAgKlxuICAgICAqL1xuICAgIHRoaXMuc2V0Q2FyZElPUmVzcG9uc2VGaWVsZHMgPSBmdW5jdGlvbiAoZmllbGRzKSB7XG4gICAgICBpZiAoIWZpZWxkcyB8fCAhYW5ndWxhci5pc0FycmF5KGZpZWxkcykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZGVmYXVsdFJlc3BGaWVsZHMgPSBmaWVsZHM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQ29uZmlndXJpbmcgZGVmYXVsdFNjYW5Db25maWcgdXNpbmcgJGNvcmRvdmFOZ0NhcmRJT1Byb3ZpZGVyXG4gICAgICovXG4gICAgdGhpcy5zZXRTY2FuZXJDb25maWcgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICBpZiAoIWNvbmZpZyB8fCAhYW5ndWxhci5pc09iamVjdChjb25maWcpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGVmYXVsdFNjYW5Db25maWcuZXhwaXJ5ID0gY29uZmlnLmV4cGlyeSB8fCB0cnVlO1xuICAgICAgZGVmYXVsdFNjYW5Db25maWcuY3Z2ID0gY29uZmlnLmN2diB8fCB0cnVlO1xuICAgICAgZGVmYXVsdFNjYW5Db25maWcuemlwID0gY29uZmlnLnppcCB8fCBmYWxzZTtcbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLnN1cHByZXNzTWFudWFsID0gY29uZmlnLnN1cHByZXNzTWFudWFsIHx8IGZhbHNlO1xuICAgICAgZGVmYXVsdFNjYW5Db25maWcuc3VwcHJlc3NDb25maXJtID0gY29uZmlnLnN1cHByZXNzQ29uZmlybSB8fCBmYWxzZTtcbiAgICAgIGRlZmF1bHRTY2FuQ29uZmlnLmhpZGVMb2dvID0gY29uZmlnLmhpZGVMb2dvIHx8IHRydWU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEZ1bmN0aW9uIHNjYW5DYXJkIGZvciAkY29yZG92YU5nQ2FyZElPIHNlcnZpY2UgdG8gbWFrZSBzY2FuIG9mIGNhcmRcbiAgICAgKlxuICAgICAqL1xuICAgIHRoaXMuJGdldCA9IFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNjYW5DYXJkOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICB2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIENhcmRJTy5zY2FuKFxuICAgICAgICAgICAgZGVmYXVsdFNjYW5Db25maWcsXG4gICAgICAgICAgICBmdW5jdGlvbiAocmVzcG9uc2UpIHtcblxuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobnVsbCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVzcERhdGEgPSB7fTtcbiAgICAgICAgICAgICAgICBmb3IgKFxuICAgICAgICAgICAgICAgICAgdmFyIGkgPSAwLCBsZW4gPSBkZWZhdWx0UmVzcEZpZWxkcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgdmFyIGZpZWxkID0gZGVmYXVsdFJlc3BGaWVsZHNbaV07XG5cbiAgICAgICAgICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ3Nob3J0X2V4cGlyeV95ZWFyJykge1xuICAgICAgICAgICAgICAgICAgICByZXNwRGF0YVtmaWVsZF0gPSBTdHJpbmcocmVzcG9uc2UuZXhwaXJ5X3llYXIpLnN1YnN0ciggLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gICAgICAgICAgICAgICAgICAgICAgMiwgMlxuICAgICAgICAgICAgICAgICAgICApIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzcERhdGFbZmllbGRdID0gcmVzcG9uc2VbZmllbGRdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3BEYXRhKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dXG4pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9WZXJzb1NvbHV0aW9ucy9Db3Jkb3ZhQ2xpcGJvYXJkLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9WZXJzb1NvbHV0aW9ucy9Db3Jkb3ZhQ2xpcGJvYXJkXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jbGlwYm9hcmQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFDbGlwYm9hcmQnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBjb3B5OiBmdW5jdGlvbiAodGV4dCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMuY2xpcGJvYXJkLmNvcHkodGV4dCxcbiAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwYXN0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMuY2xpcGJvYXJkLnBhc3RlKGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRleHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tY29udGFjdHNcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWNvbnRhY3RzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5jb250YWN0cycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUNvbnRhY3RzJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNhdmU6IGZ1bmN0aW9uIChjb250YWN0KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGRldmljZUNvbnRhY3QgPSBuYXZpZ2F0b3IuY29udGFjdHMuY3JlYXRlKGNvbnRhY3QpO1xuXG4gICAgICAgIGRldmljZUNvbnRhY3Quc2F2ZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZTogZnVuY3Rpb24gKGNvbnRhY3QpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZGV2aWNlQ29udGFjdCA9IG5hdmlnYXRvci5jb250YWN0cy5jcmVhdGUoY29udGFjdCk7XG5cbiAgICAgICAgZGV2aWNlQ29udGFjdC5yZW1vdmUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbG9uZTogZnVuY3Rpb24gKGNvbnRhY3QpIHtcbiAgICAgICAgdmFyIGRldmljZUNvbnRhY3QgPSBuYXZpZ2F0b3IuY29udGFjdHMuY3JlYXRlKGNvbnRhY3QpO1xuICAgICAgICByZXR1cm4gZGV2aWNlQ29udGFjdC5jbG9uZShjb250YWN0KTtcbiAgICAgIH0sXG5cbiAgICAgIGZpbmQ6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGZpZWxkcyA9IG9wdGlvbnMuZmllbGRzIHx8IFsnaWQnLCAnZGlzcGxheU5hbWUnXTtcbiAgICAgICAgZGVsZXRlIG9wdGlvbnMuZmllbGRzO1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMob3B0aW9ucykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmNvbnRhY3RzLmZpbmQoZmllbGRzLCBmdW5jdGlvbiAocmVzdWx0cykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgICAgICAgIH0sZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuY29udGFjdHMuZmluZChmaWVsZHMsIGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0cyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LCBvcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcGlja0NvbnRhY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5jb250YWN0cy5waWNrQ29udGFjdChmdW5jdGlvbiAoY29udGFjdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShjb250YWN0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IG1ldGhvZCB0byBzZXQgLyBnZXQgQ29udGFjdEFkZHJlc3NcbiAgICAgIC8vIFRPRE86IG1ldGhvZCB0byBzZXQgLyBnZXQgQ29udGFjdEVycm9yXG4gICAgICAvLyBUT0RPOiBtZXRob2QgdG8gc2V0IC8gZ2V0IENvbnRhY3RGaWVsZFxuICAgICAgLy8gVE9ETzogbWV0aG9kIHRvIHNldCAvIGdldCBDb250YWN0TmFtZVxuICAgICAgLy8gVE9ETzogbWV0aG9kIHRvIHNldCAvIGdldCBDb250YWN0T3JnYW5pemF0aW9uXG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vVml0YWxpaUJsYWdvZGlyL2NvcmRvdmEtcGx1Z2luLWRhdGVwaWNrZXIuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9WaXRhbGlpQmxhZ29kaXIvY29yZG92YS1wbHVnaW4tZGF0ZXBpY2tlclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZGF0ZVBpY2tlcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YURhdGVQaWNrZXInLCBbJyR3aW5kb3cnLCAnJHEnLCBmdW5jdGlvbiAoJHdpbmRvdywgJHEpIHtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc2hvdzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7ZGF0ZTogbmV3IERhdGUoKSwgbW9kZTogJ2RhdGUnfTtcbiAgICAgICAgJHdpbmRvdy5kYXRlUGlja2VyLnNob3cob3B0aW9ucywgZnVuY3Rpb24gKGRhdGUpIHtcbiAgICAgICAgICBxLnJlc29sdmUoZGF0ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKGVycm9yKXtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZGV2aWNlXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2VcblxuLyogZ2xvYmFscyBkZXZpY2U6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2UnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFEZXZpY2UnLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgd2hvbGUgZGV2aWNlIG9iamVjdC5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2VcbiAgICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBkZXZpY2Ugb2JqZWN0LlxuICAgICAgICovXG4gICAgICBnZXREZXZpY2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgQ29yZG92YSB2ZXJzaW9uLlxuICAgICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRldmljZSNkZXZpY2Vjb3Jkb3ZhXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgQ29yZG92YSB2ZXJzaW9uLlxuICAgICAgICovXG4gICAgICBnZXRDb3Jkb3ZhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UuY29yZG92YTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0aGUgbmFtZSBvZiB0aGUgZGV2aWNlJ3MgbW9kZWwgb3IgcHJvZHVjdC5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UjZGV2aWNlbW9kZWxcbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuYW1lIG9mIHRoZSBkZXZpY2UncyBtb2RlbCBvciBwcm9kdWN0LlxuICAgICAgICovXG4gICAgICBnZXRNb2RlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLm1vZGVsO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBAZGVwcmVjYXRlZCBkZXZpY2UubmFtZSBpcyBkZXByZWNhdGVkIGFzIG9mIHZlcnNpb24gMi4zLjAuIFVzZSBkZXZpY2UubW9kZWwgaW5zdGVhZC5cbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICAgKi9cbiAgICAgIGdldE5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS5uYW1lO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBkZXZpY2UncyBvcGVyYXRpbmcgc3lzdGVtIG5hbWUuXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlI2RldmljZXBsYXRmb3JtXG4gICAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgZGV2aWNlJ3Mgb3BlcmF0aW5nIHN5c3RlbSBuYW1lLlxuICAgICAgICovXG4gICAgICBnZXRQbGF0Zm9ybTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGV2aWNlLnBsYXRmb3JtO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBkZXZpY2UncyBVbml2ZXJzYWxseSBVbmlxdWUgSWRlbnRpZmllci5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UjZGV2aWNldXVpZFxuICAgICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGRldmljZSdzIFVuaXZlcnNhbGx5IFVuaXF1ZSBJZGVudGlmaWVyXG4gICAgICAgKi9cbiAgICAgIGdldFVVSUQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS51dWlkO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBvcGVyYXRpbmcgc3lzdGVtIHZlcnNpb24uXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlI2RldmljZXZlcnNpb25cbiAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICAgKi9cbiAgICAgIGdldFZlcnNpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRldmljZS52ZXJzaW9uO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBSZXR1cm5zIHRoZSBkZXZpY2UgbWFudWZhY3R1cmVyLlxuICAgICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgICAqL1xuICAgICAgZ2V0TWFudWZhY3R1cmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkZXZpY2UubWFudWZhY3R1cmVyO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1kZXZpY2UtbW90aW9uXG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1kZXZpY2UtbW90aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2VNb3Rpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFEZXZpY2VNb3Rpb24nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0Q3VycmVudEFjY2VsZXJhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKGFuZ3VsYXIuaXNVbmRlZmluZWQobmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIpIHx8XG4gICAgICAgICFhbmd1bGFyLmlzRnVuY3Rpb24obmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIuZ2V0Q3VycmVudEFjY2VsZXJhdGlvbikpIHtcbiAgICAgICAgICBxLnJlamVjdCgnRGV2aWNlIGRvIG5vdCBzdXBwb3J0IHdhdGNoQWNjZWxlcmF0aW9uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci5nZXRDdXJyZW50QWNjZWxlcmF0aW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB3YXRjaEFjY2VsZXJhdGlvbjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKG5hdmlnYXRvci5hY2NlbGVyb21ldGVyKSB8fFxuICAgICAgICAhYW5ndWxhci5pc0Z1bmN0aW9uKG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLndhdGNoQWNjZWxlcmF0aW9uKSkge1xuICAgICAgICAgIHEucmVqZWN0KCdEZXZpY2UgZG8gbm90IHN1cHBvcnQgd2F0Y2hBY2NlbGVyYXRpb24nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB3YXRjaElEID0gbmF2aWdhdG9yLmFjY2VsZXJvbWV0ZXIud2F0Y2hBY2NlbGVyYXRpb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICBxLnByb21pc2UuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLmNsZWFyV2F0Y2ggPSBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuYWNjZWxlcm9tZXRlci5jbGVhcldhdGNoKGlkIHx8IHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS53YXRjaElEID0gd2F0Y2hJRDtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJXYXRjaDogZnVuY3Rpb24gKHdhdGNoSUQpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5hY2NlbGVyb21ldGVyLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWRldmljZS1vcmllbnRhdGlvblxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZGV2aWNlLW9yaWVudGF0aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2VPcmllbnRhdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YURldmljZU9yaWVudGF0aW9uJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgdmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgZnJlcXVlbmN5OiAzMDAwIC8vIGV2ZXJ5IDNzXG4gICAgfTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgZ2V0Q3VycmVudEhlYWRpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmKCFuYXZpZ2F0b3IuY29tcGFzcykge1xuICAgICAgICAgICAgcS5yZWplY3QoJ05vIGNvbXBhc3Mgb24gRGV2aWNlJyk7XG4gICAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLmNvbXBhc3MuZ2V0Q3VycmVudEhlYWRpbmcoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHdhdGNoSGVhZGluZzogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmKCFuYXZpZ2F0b3IuY29tcGFzcykge1xuICAgICAgICAgICAgcS5yZWplY3QoJ05vIGNvbXBhc3Mgb24gRGV2aWNlJyk7XG4gICAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9vcHRpb25zID0gYW5ndWxhci5leHRlbmQoZGVmYXVsdE9wdGlvbnMsIG9wdGlvbnMpO1xuICAgICAgICB2YXIgd2F0Y2hJRCA9IG5hdmlnYXRvci5jb21wYXNzLndhdGNoSGVhZGluZyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0sIF9vcHRpb25zKTtcblxuICAgICAgICBxLnByb21pc2UuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIG5hdmlnYXRvci5jb21wYXNzLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLmNsZWFyV2F0Y2ggPSBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICBuYXZpZ2F0b3IuY29tcGFzcy5jbGVhcldhdGNoKGlkIHx8IHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS53YXRjaElEID0gd2F0Y2hJRDtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJXYXRjaDogZnVuY3Rpb24gKHdhdGNoSUQpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5jb21wYXNzLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWRpYWxvZ3Ncbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWRpYWxvZ3NcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmRpYWxvZ3MnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFEaWFsb2dzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYWxlcnQ6IGZ1bmN0aW9uIChtZXNzYWdlLCB0aXRsZSwgYnV0dG9uTmFtZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCEkd2luZG93Lm5hdmlnYXRvci5ub3RpZmljYXRpb24pIHtcbiAgICAgICAgICAkd2luZG93LmFsZXJ0KG1lc3NhZ2UpO1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5hdmlnYXRvci5ub3RpZmljYXRpb24uYWxlcnQobWVzc2FnZSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSwgdGl0bGUsIGJ1dHRvbk5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNvbmZpcm06IGZ1bmN0aW9uIChtZXNzYWdlLCB0aXRsZSwgYnV0dG9uTGFiZWxzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cubmF2aWdhdG9yLm5vdGlmaWNhdGlvbikge1xuICAgICAgICAgIGlmICgkd2luZG93LmNvbmZpcm0obWVzc2FnZSkpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgxKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZXNvbHZlKDIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLmNvbmZpcm0obWVzc2FnZSwgZnVuY3Rpb24gKGJ1dHRvbkluZGV4KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoYnV0dG9uSW5kZXgpO1xuICAgICAgICAgIH0sIHRpdGxlLCBidXR0b25MYWJlbHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByb21wdDogZnVuY3Rpb24gKG1lc3NhZ2UsIHRpdGxlLCBidXR0b25MYWJlbHMsIGRlZmF1bHRUZXh0KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cubmF2aWdhdG9yLm5vdGlmaWNhdGlvbikge1xuICAgICAgICAgIHZhciByZXMgPSAkd2luZG93LnByb21wdChtZXNzYWdlLCBkZWZhdWx0VGV4dCk7XG4gICAgICAgICAgaWYgKHJlcyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHtpbnB1dDE6IHJlcywgYnV0dG9uSW5kZXg6IDF9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHtpbnB1dDE6IHJlcywgYnV0dG9uSW5kZXg6IDJ9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi5wcm9tcHQobWVzc2FnZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSwgdGl0bGUsIGJ1dHRvbkxhYmVscywgZGVmYXVsdFRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBiZWVwOiBmdW5jdGlvbiAodGltZXMpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5ub3RpZmljYXRpb24uYmVlcCh0aW1lcyk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1lbWFpbC1jb21wb3Nlci5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tZW1haWwtY29tcG9zZXJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmVtYWlsQ29tcG9zZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFFbWFpbENvbXBvc2VyJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlzQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZW1haWwuaXNBdmFpbGFibGUoZnVuY3Rpb24gKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgaWYgKGlzQXZhaWxhYmxlKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBvcGVuOiBmdW5jdGlvbiAocHJvcGVydGllcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmVtYWlsLm9wZW4ocHJvcGVydGllcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KCk7IC8vIHVzZXIgY2xvc2VkIGVtYWlsIGNvbXBvc2VyXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhZGRBbGlhczogZnVuY3Rpb24gKGFwcCwgc2NoZW1hKSB7XG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5lbWFpbC5hZGRBbGlhcyhhcHAsIHNjaGVtYSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgIGNvcmRvdmEgLWQgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vV2l6Y29ycC9waG9uZWdhcC1mYWNlYm9vay1wbHVnaW4uZ2l0IC0tdmFyaWFibGUgQVBQX0lEPVwiMTIzNDU2Nzg5XCIgLS12YXJpYWJsZSBBUFBfTkFNRT1cIm15QXBwbGljYXRpb25cIlxuLy8gbGluayAgICAgIDogICBodHRwczovL2dpdGh1Yi5jb20vV2l6Y29ycC9waG9uZWdhcC1mYWNlYm9vay1wbHVnaW5cblxuLyogZ2xvYmFscyBmYWNlYm9va0Nvbm5lY3RQbHVnaW46IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5mYWNlYm9vaycsIFtdKVxuXG4gIC5wcm92aWRlcignJGNvcmRvdmFGYWNlYm9vaycsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICAvKipcbiAgICAgICogSW5pdCBicm93c2VyIHNldHRpbmdzIGZvciBGYWNlYm9vayBwbHVnaW5cbiAgICAgICpcbiAgICAgICogQHBhcmFtIHtudW1iZXJ9IGlkXG4gICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uXG4gICAgICAqL1xuICAgIHRoaXMuYnJvd3NlckluaXQgPSBmdW5jdGlvbiAoaWQsIHZlcnNpb24pIHtcbiAgICAgIHRoaXMuYXBwSUQgPSBpZDtcbiAgICAgIHRoaXMuYXBwVmVyc2lvbiA9IHZlcnNpb24gfHwgJ3YyLjAnO1xuICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmJyb3dzZXJJbml0KHRoaXMuYXBwSUQsIHRoaXMuYXBwVmVyc2lvbik7XG4gICAgfTtcblxuICAgIHRoaXMuJGdldCA9IFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxvZ2luOiBmdW5jdGlvbiAocGVybWlzc2lvbnMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmxvZ2luKHBlcm1pc3Npb25zLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlamVjdChyZXMpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBzaG93RGlhbG9nOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgICBmYWNlYm9va0Nvbm5lY3RQbHVnaW4uc2hvd0RpYWxvZyhvcHRpb25zLCBmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXBpOiBmdW5jdGlvbiAocGF0aCwgcGVybWlzc2lvbnMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmFwaShwYXRoLCBwZXJtaXNzaW9ucywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldEFjY2Vzc1Rva2VuOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAgIGZhY2Vib29rQ29ubmVjdFBsdWdpbi5nZXRBY2Nlc3NUb2tlbihmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0TG9naW5TdGF0dXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmdldExvZ2luU3RhdHVzKGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBsb2dvdXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgZmFjZWJvb2tDb25uZWN0UGx1Z2luLmxvZ291dChmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1mYWNlYm9va2Fkcy5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1mYWNlYm9va2Fkc1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmFjZWJvb2tBZHMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFGYWNlYm9va0FkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmFjZWJvb2tBZHMuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GYWNlYm9va0Fkcy5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZhY2Vib29rQWRzLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tZmlsZVxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZmlsZVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZScsIFtdKVxuXG4gIC5jb25zdGFudCgnJGNvcmRvdmFGaWxlRXJyb3InLCB7XG4gICAgMTogJ05PVF9GT1VORF9FUlInLFxuICAgIDI6ICdTRUNVUklUWV9FUlInLFxuICAgIDM6ICdBQk9SVF9FUlInLFxuICAgIDQ6ICdOT1RfUkVBREFCTEVfRVJSJyxcbiAgICA1OiAnRU5DT0RJTkdfRVJSJyxcbiAgICA2OiAnTk9fTU9ESUZJQ0FUSU9OX0FMTE9XRURfRVJSJyxcbiAgICA3OiAnSU5WQUxJRF9TVEFURV9FUlInLFxuICAgIDg6ICdTWU5UQVhfRVJSJyxcbiAgICA5OiAnSU5WQUxJRF9NT0RJRklDQVRJT05fRVJSJyxcbiAgICAxMDogJ1FVT1RBX0VYQ0VFREVEX0VSUicsXG4gICAgMTE6ICdUWVBFX01JU01BVENIX0VSUicsXG4gICAgMTI6ICdQQVRIX0VYSVNUU19FUlInXG4gIH0pXG5cbiAgLnByb3ZpZGVyKCckY29yZG92YUZpbGUnLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgdGhpcy4kZ2V0ID0gWyckcScsICckd2luZG93JywgJyRjb3Jkb3ZhRmlsZUVycm9yJywgZnVuY3Rpb24gKCRxLCAkd2luZG93LCAkY29yZG92YUZpbGVFcnJvcikge1xuXG4gICAgICByZXR1cm4ge1xuXG4gICAgICAgIGdldEZyZWVEaXNrU3BhY2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICAgY29yZG92YS5leGVjKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sICdGaWxlJywgJ2dldEZyZWVEaXNrU3BhY2UnLCBbXSk7XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjaGVja0RpcjogZnVuY3Rpb24gKHBhdGgsIGRpcikge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZGlyKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdkaXJlY3RvcnkgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHZhciBkaXJlY3RvcnkgPSBwYXRoICsgZGlyO1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKGRpcmVjdG9yeSwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgaWYgKGZpbGVTeXN0ZW0uaXNEaXJlY3RvcnkgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBxLnJlc29sdmUoZmlsZVN5c3RlbSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IDEzLCBtZXNzYWdlOiAnaW5wdXQgaXMgbm90IGEgZGlyZWN0b3J5J30pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNoZWNrRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2RpcmVjdG9yeSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGRpcmVjdG9yeSA9IHBhdGggKyBmaWxlO1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKGRpcmVjdG9yeSwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgaWYgKGZpbGVTeXN0ZW0uaXNGaWxlID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcS5yZXNvbHZlKGZpbGVTeXN0ZW0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiAxMywgbWVzc2FnZTogJ2lucHV0IGlzIG5vdCBhIGZpbGUnfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY3JlYXRlRGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSwgcmVwbGFjZUJvb2wpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGRpck5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2RpcmVjdG9yeSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXBsYWNlQm9vbCA9IHJlcGxhY2VCb29sID8gZmFsc2UgOiB0cnVlO1xuXG4gICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgICBleGNsdXNpdmU6IHJlcGxhY2VCb29sXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwgb3B0aW9ucywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjcmVhdGVGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUsIHJlcGxhY2VCb29sKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcGxhY2VCb29sID0gcmVwbGFjZUJvb2wgPyBmYWxzZSA6IHRydWU7XG5cbiAgICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICAgIGV4Y2x1c2l2ZTogcmVwbGFjZUJvb2xcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZURpcjogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGRpck5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGRpckVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZGlyRW50cnkucmVtb3ZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZSh7c3VjY2VzczogdHJ1ZSwgZmlsZVJlbW92ZWQ6IGRpckVudHJ5fSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBlci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5yZW1vdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHtzdWNjZXNzOiB0cnVlLCBmaWxlUmVtb3ZlZDogZmlsZUVudHJ5fSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBlci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVSZWN1cnNpdmVseTogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGRpck5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGRpckVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZGlyRW50cnkucmVtb3ZlUmVjdXJzaXZlbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHtzdWNjZXNzOiB0cnVlLCBmaWxlUmVtb3ZlZDogZGlyRW50cnl9KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIGVyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHdyaXRlRmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lLCB0ZXh0LCByZXBsYWNlQm9vbCkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZU5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXBsYWNlQm9vbCA9IHJlcGxhY2VCb29sID8gZmFsc2UgOiB0cnVlO1xuXG4gICAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgICBleGNsdXNpdmU6IHJlcGxhY2VCb29sXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCBvcHRpb25zLCBmdW5jdGlvbiAoZmlsZUVudHJ5KSB7XG4gICAgICAgICAgICAgICAgZmlsZUVudHJ5LmNyZWF0ZVdyaXRlcihmdW5jdGlvbiAod3JpdGVyKSB7XG4gICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5hcHBlbmQgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVyLnNlZWsod3JpdGVyLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnRydW5jYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlci50cnVuY2F0ZShvcHRpb25zLnRydW5jYXRlKTtcbiAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgd3JpdGVyLm9ud3JpdGVlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QodGhpcy5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgIHdyaXRlci53cml0ZSh0ZXh0KTtcblxuICAgICAgICAgICAgICAgICAgcS5wcm9taXNlLmFib3J0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXIuYWJvcnQoKTtcbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHdyaXRlRXhpc3RpbmdGaWxlOiBmdW5jdGlvbiAocGF0aCwgZmlsZU5hbWUsIHRleHQpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5jcmVhdGVXcml0ZXIoZnVuY3Rpb24gKHdyaXRlcikge1xuICAgICAgICAgICAgICAgICAgd3JpdGVyLnNlZWsod3JpdGVyLmxlbmd0aCk7XG5cbiAgICAgICAgICAgICAgICAgIHdyaXRlci5vbndyaXRlZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICB3cml0ZXIud3JpdGUodGV4dCk7XG5cbiAgICAgICAgICAgICAgICAgIHEucHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVyLmFib3J0KCk7XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgZXJyLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlLmNvZGVdO1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWFkQXNUZXh0OiBmdW5jdGlvbiAocGF0aCwgZmlsZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5maWxlKGZ1bmN0aW9uIChmaWxlRGF0YSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cbiAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWRlbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChldnQudGFyZ2V0LnJlc3VsdCAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQucmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKGV2dC50YXJnZXQucmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChldnQudGFyZ2V0LmVycm9yICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5lcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGV2dC50YXJnZXQuZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KHtjb2RlOiBudWxsLCBtZXNzYWdlOiAnUkVBREVSX09OTE9BREVORF9FUlInfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGZpbGVEYXRhKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVhZEFzRGF0YVVSTDogZnVuY3Rpb24gKHBhdGgsIGZpbGUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RmlsZShmaWxlLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICBmaWxlRW50cnkuZmlsZShmdW5jdGlvbiAoZmlsZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLm9ubG9hZGVuZCA9IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2dC50YXJnZXQucmVzdWx0ICE9PSB1bmRlZmluZWQgfHwgZXZ0LnRhcmdldC5yZXN1bHQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUoZXZ0LnRhcmdldC5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGV2dC50YXJnZXQuZXJyb3IgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LmVycm9yICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXZ0LnRhcmdldC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcS5yZWplY3Qoe2NvZGU6IG51bGwsIG1lc3NhZ2U6ICdSRUFERVJfT05MT0FERU5EX0VSUid9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgIHJlYWRlci5yZWFkQXNEYXRhVVJMKGZpbGVEYXRhKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVhZEFzQmluYXJ5U3RyaW5nOiBmdW5jdGlvbiAocGF0aCwgZmlsZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5maWxlKGZ1bmN0aW9uIChmaWxlRGF0YSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gICAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZ0LnRhcmdldC5yZXN1bHQgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LnJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQudGFyZ2V0LnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZ0LnRhcmdldC5lcnJvciAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQuZXJyb3IgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChldnQudGFyZ2V0LmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogbnVsbCwgbWVzc2FnZTogJ1JFQURFUl9PTkxPQURFTkRfRVJSJ30pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc0JpbmFyeVN0cmluZyhmaWxlRGF0YSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlYWRBc0FycmF5QnVmZmVyOiBmdW5jdGlvbiAocGF0aCwgZmlsZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIGlmICgoL15cXC8vLnRlc3QoZmlsZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5maWxlKGZ1bmN0aW9uIChmaWxlRGF0YSkge1xuICAgICAgICAgICAgICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gICAgICAgICAgICAgICAgICByZWFkZXIub25sb2FkZW5kID0gZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZ0LnRhcmdldC5yZXN1bHQgIT09IHVuZGVmaW5lZCB8fCBldnQudGFyZ2V0LnJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShldnQudGFyZ2V0LnJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZ0LnRhcmdldC5lcnJvciAhPT0gdW5kZWZpbmVkIHx8IGV2dC50YXJnZXQuZXJyb3IgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdChldnQudGFyZ2V0LmVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICBxLnJlamVjdCh7Y29kZTogbnVsbCwgbWVzc2FnZTogJ1JFQURFUl9PTkxPQURFTkRfRVJSJ30pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgcmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGZpbGVEYXRhKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vycm9yLmNvZGVdO1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbW92ZUZpbGU6IGZ1bmN0aW9uIChwYXRoLCBmaWxlTmFtZSwgbmV3UGF0aCwgbmV3RmlsZU5hbWUpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBuZXdGaWxlTmFtZSA9IG5ld0ZpbGVOYW1lIHx8IGZpbGVOYW1lO1xuXG4gICAgICAgICAgaWYgKCgvXlxcLy8udGVzdChmaWxlTmFtZSkpIHx8ICgvXlxcLy8udGVzdChuZXdGaWxlTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXRGaWxlKGZpbGVOYW1lLCB7Y3JlYXRlOiBmYWxzZX0sIGZ1bmN0aW9uIChmaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwobmV3UGF0aCwgZnVuY3Rpb24gKG5ld0ZpbGVFbnRyeSkge1xuICAgICAgICAgICAgICAgICAgZmlsZUVudHJ5Lm1vdmVUbyhuZXdGaWxlRW50cnksIG5ld0ZpbGVOYW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBxLnJlamVjdChlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBtb3ZlRGlyOiBmdW5jdGlvbiAocGF0aCwgZGlyTmFtZSwgbmV3UGF0aCwgbmV3RGlyTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIG5ld0Rpck5hbWUgPSBuZXdEaXJOYW1lIHx8IGRpck5hbWU7XG5cbiAgICAgICAgICBpZiAoL15cXC8vLnRlc3QoZGlyTmFtZSkgfHwgKC9eXFwvLy50ZXN0KG5ld0Rpck5hbWUpKSkge1xuICAgICAgICAgICAgcS5yZWplY3QoJ2ZpbGUtbmFtZSBjYW5ub3Qgc3RhcnQgd2l0aCBcXC8nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKHBhdGgsIGZ1bmN0aW9uIChmaWxlU3lzdGVtKSB7XG4gICAgICAgICAgICAgIGZpbGVTeXN0ZW0uZ2V0RGlyZWN0b3J5KGRpck5hbWUsIHtjcmVhdGU6IGZhbHNlfSwgZnVuY3Rpb24gKGRpckVudHJ5KSB7XG4gICAgICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKG5ld1BhdGgsIGZ1bmN0aW9uIChuZXdEaXJFbnRyeSkge1xuICAgICAgICAgICAgICAgICAgZGlyRW50cnkubW92ZVRvKG5ld0RpckVudHJ5LCBuZXdEaXJOYW1lLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvKSB7XG4gICAgICAgICAgICAgICAgICBxLnJlamVjdChlcnJvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyKSB7XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvcHlEaXI6IGZ1bmN0aW9uIChwYXRoLCBkaXJOYW1lLCBuZXdQYXRoLCBuZXdEaXJOYW1lKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgbmV3RGlyTmFtZSA9IG5ld0Rpck5hbWUgfHwgZGlyTmFtZTtcblxuICAgICAgICAgIGlmICgvXlxcLy8udGVzdChkaXJOYW1lKSB8fCAoL15cXC8vLnRlc3QobmV3RGlyTmFtZSkpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnZmlsZS1uYW1lIGNhbm5vdCBzdGFydCB3aXRoIFxcLycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAkd2luZG93LnJlc29sdmVMb2NhbEZpbGVTeXN0ZW1VUkwocGF0aCwgZnVuY3Rpb24gKGZpbGVTeXN0ZW0pIHtcbiAgICAgICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwge2NyZWF0ZTogZmFsc2UsIGV4Y2x1c2l2ZTogZmFsc2V9LCBmdW5jdGlvbiAoZGlyRW50cnkpIHtcblxuICAgICAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChuZXdQYXRoLCBmdW5jdGlvbiAobmV3RGlyRW50cnkpIHtcbiAgICAgICAgICAgICAgICAgIGRpckVudHJ5LmNvcHlUbyhuZXdEaXJFbnRyeSwgbmV3RGlyTmFtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJybyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBlci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb3B5RmlsZTogZnVuY3Rpb24gKHBhdGgsIGZpbGVOYW1lLCBuZXdQYXRoLCBuZXdGaWxlTmFtZSkge1xuICAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgIG5ld0ZpbGVOYW1lID0gbmV3RmlsZU5hbWUgfHwgZmlsZU5hbWU7XG5cbiAgICAgICAgICBpZiAoKC9eXFwvLy50ZXN0KGZpbGVOYW1lKSkpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KCdmaWxlLW5hbWUgY2Fubm90IHN0YXJ0IHdpdGggXFwvJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgICAgICBmaWxlU3lzdGVtLmdldEZpbGUoZmlsZU5hbWUsIHtjcmVhdGU6IGZhbHNlLCBleGNsdXNpdmU6IGZhbHNlfSwgZnVuY3Rpb24gKGZpbGVFbnRyeSkge1xuXG4gICAgICAgICAgICAgICAgJHdpbmRvdy5yZXNvbHZlTG9jYWxGaWxlU3lzdGVtVVJMKG5ld1BhdGgsIGZ1bmN0aW9uIChuZXdGaWxlRW50cnkpIHtcbiAgICAgICAgICAgICAgICAgIGZpbGVFbnRyeS5jb3B5VG8obmV3RmlsZUVudHJ5LCBuZXdGaWxlTmFtZSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvLm1lc3NhZ2UgPSAkY29yZG92YUZpbGVFcnJvcltlcnJvLmNvZGVdO1xuICAgICAgICAgICAgICAgICAgcS5yZWplY3QoZXJybyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBlcnIubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2Vyci5jb2RlXTtcbiAgICAgICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcikge1xuICAgICAgICAgICAgICBlci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXIuY29kZV07XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGUubWVzc2FnZSA9ICRjb3Jkb3ZhRmlsZUVycm9yW2UuY29kZV07XG4gICAgICAgICAgICBxLnJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qXG4gICAgICAgICBsaXN0RmlsZXM6IGZ1bmN0aW9uIChwYXRoLCBkaXIpIHtcblxuICAgICAgICAgfSxcblxuICAgICAgICAgbGlzdERpcjogZnVuY3Rpb24gKHBhdGgsIGRpck5hbWUpIHtcbiAgICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICR3aW5kb3cucmVzb2x2ZUxvY2FsRmlsZVN5c3RlbVVSTChwYXRoLCBmdW5jdGlvbiAoZmlsZVN5c3RlbSkge1xuICAgICAgICAgZmlsZVN5c3RlbS5nZXREaXJlY3RvcnkoZGlyTmFtZSwgb3B0aW9ucywgZnVuY3Rpb24gKHBhcmVudCkge1xuICAgICAgICAgdmFyIHJlYWRlciA9IHBhcmVudC5jcmVhdGVSZWFkZXIoKTtcbiAgICAgICAgIHJlYWRlci5yZWFkRW50cmllcyhmdW5jdGlvbiAoZW50cmllcykge1xuICAgICAgICAgcS5yZXNvbHZlKGVudHJpZXMpO1xuICAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgcS5yZWplY3QoJ0RJUl9SRUFEX0VSUk9SIDogJyArIHBhdGggKyBkaXJOYW1lKTtcbiAgICAgICAgIH0pO1xuICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICBlcnJvci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyb3IuY29kZV07XG4gICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICB9KTtcbiAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgIGVyci5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZXJyLmNvZGVdO1xuICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgZS5tZXNzYWdlID0gJGNvcmRvdmFGaWxlRXJyb3JbZS5jb2RlXTtcbiAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICAgfSxcblxuICAgICAgICAgcmVhZEZpbGVNZXRhZGF0YTogZnVuY3Rpb24gKGZpbGVQYXRoKSB7XG4gICAgICAgICAvL3JldHVybiBnZXRGaWxlKGZpbGVQYXRoLCB7Y3JlYXRlOiBmYWxzZX0pO1xuICAgICAgICAgfVxuICAgICAgICAgKi9cbiAgICAgIH07XG5cbiAgICB9XTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcHdsaW4vY29yZG92YS1wbHVnaW4tZmlsZS1vcGVuZXIyLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vcHdsaW4vY29yZG92YS1wbHVnaW4tZmlsZS1vcGVuZXIyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5maWxlT3BlbmVyMicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUZpbGVPcGVuZXIyJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG9wZW46IGZ1bmN0aW9uIChmaWxlLCB0eXBlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgY29yZG92YS5wbHVnaW5zLmZpbGVPcGVuZXIyLm9wZW4oZmlsZSwgdHlwZSwge1xuICAgICAgICAgIGVycm9yOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgcS5yZWplY3QoZSk7XG4gICAgICAgICAgfSwgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVuaW5zdGFsbDogZnVuY3Rpb24gKHBhY2spIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZmlsZU9wZW5lcjIudW5pbnN0YWxsKHBhY2ssIHtcbiAgICAgICAgICBlcnJvcjogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGUpO1xuICAgICAgICAgIH0sIHN1Y2Nlc3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhcHBJc0luc3RhbGxlZDogZnVuY3Rpb24gKHBhY2spIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuZmlsZU9wZW5lcjIuYXBwSXNJbnN0YWxsZWQocGFjaywge1xuICAgICAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXMpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWZpbGUtdHJhbnNmZXJcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWZpbGUtdHJhbnNmZXJcblxuLyogZ2xvYmFscyBGaWxlVHJhbnNmZXI6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5maWxlVHJhbnNmZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFGaWxlVHJhbnNmZXInLCBbJyRxJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRxLCAkdGltZW91dCkge1xuICAgIHJldHVybiB7XG4gICAgICBkb3dubG9hZDogZnVuY3Rpb24gKHNvdXJjZSwgZmlsZVBhdGgsIG9wdGlvbnMsIHRydXN0QWxsSG9zdHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgZnQgPSBuZXcgRmlsZVRyYW5zZmVyKCk7XG4gICAgICAgIHZhciB1cmkgPSAob3B0aW9ucyAmJiBvcHRpb25zLmVuY29kZVVSSSA9PT0gZmFsc2UpID8gc291cmNlIDogZW5jb2RlVVJJKHNvdXJjZSk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy50aW1lb3V0ICE9PSB1bmRlZmluZWQgJiYgb3B0aW9ucy50aW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZnQuYWJvcnQoKTtcbiAgICAgICAgICB9LCBvcHRpb25zLnRpbWVvdXQpO1xuICAgICAgICAgIG9wdGlvbnMudGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBmdC5vbnByb2dyZXNzID0gZnVuY3Rpb24gKHByb2dyZXNzKSB7XG4gICAgICAgICAgcS5ub3RpZnkocHJvZ3Jlc3MpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBmdC5hYm9ydCgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ0LmRvd25sb2FkKHVyaSwgZmlsZVBhdGgsIHEucmVzb2x2ZSwgcS5yZWplY3QsIHRydXN0QWxsSG9zdHMsIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdXBsb2FkOiBmdW5jdGlvbiAoc2VydmVyLCBmaWxlUGF0aCwgb3B0aW9ucywgdHJ1c3RBbGxIb3N0cykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHZhciBmdCA9IG5ldyBGaWxlVHJhbnNmZXIoKTtcbiAgICAgICAgdmFyIHVyaSA9IChvcHRpb25zICYmIG9wdGlvbnMuZW5jb2RlVVJJID09PSBmYWxzZSkgPyBzZXJ2ZXIgOiBlbmNvZGVVUkkoc2VydmVyKTtcblxuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnRpbWVvdXQgIT09IHVuZGVmaW5lZCAmJiBvcHRpb25zLnRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBmdC5hYm9ydCgpO1xuICAgICAgICAgIH0sIG9wdGlvbnMudGltZW91dCk7XG4gICAgICAgICAgb3B0aW9ucy50aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ0Lm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcbiAgICAgICAgICBxLm5vdGlmeShwcm9ncmVzcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLmFib3J0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGZ0LmFib3J0KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZnQudXBsb2FkKGZpbGVQYXRoLCB1cmksIHEucmVzb2x2ZSwgcS5yZWplY3QsIG9wdGlvbnMsIHRydXN0QWxsSG9zdHMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vRmxhc2hsaWdodC1QaG9uZUdhcC1QbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0ZsYXNobGlnaHQtUGhvbmVHYXAtUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5mbGFzaGxpZ2h0JywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhRmxhc2hsaWdodCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGF2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5mbGFzaGxpZ2h0LmF2YWlsYWJsZShmdW5jdGlvbiAoaXNBdmFpbGFibGUpIHtcbiAgICAgICAgICBxLnJlc29sdmUoaXNBdmFpbGFibGUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN3aXRjaE9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmZsYXNobGlnaHQuc3dpdGNoT24oZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN3aXRjaE9mZjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5mbGFzaGxpZ2h0LnN3aXRjaE9mZihmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdG9nZ2xlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmZsYXNobGlnaHQudG9nZ2xlKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWZsdXJyeS5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1mbHVycnlcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmZsdXJyeUFkcycsIFtdKVxuICAuZmFjdG9yeSgnJGNvcmRvdmFGbHVycnlBZHMnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnJlbW92ZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lcjogZnVuY3Rpb24gKHBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkZsdXJyeUFkcy5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5GbHVycnlBZHMuaGlkZUJhbm5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJlcGFyZUludGVyc3RpdGlhbDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuRmx1cnJ5QWRzLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwLWJ1aWxkL0dBUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC1idWlsZC9HQVBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2EnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHQScsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGluaXQ6IGZ1bmN0aW9uIChpZCwgbWluZ2FwKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbWluZ2FwID0gKG1pbmdhcCA+PSAwKSA/IG1pbmdhcCA6IDEwO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ2FQbHVnaW4uaW5pdChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgaWQsIG1pbmdhcCk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja0V2ZW50OiBmdW5jdGlvbiAoc3VjY2VzcywgZmFpbCwgY2F0ZWdvcnksIGV2ZW50QWN0aW9uLCBldmVudExhYmVsLCBldmVudFZhbHVlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdhUGx1Z2luLnRyYWNrRXZlbnQoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNhdGVnb3J5LCBldmVudEFjdGlvbiwgZXZlbnRMYWJlbCwgZXZlbnRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja1BhZ2U6IGZ1bmN0aW9uIChzdWNjZXNzLCBmYWlsLCBwYWdlVVJMKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdhUGx1Z2luLnRyYWNrUGFnZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgcGFnZVVSTCk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXRWYXJpYWJsZTogZnVuY3Rpb24gKHN1Y2Nlc3MsIGZhaWwsIGluZGV4LCB2YWx1ZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nYVBsdWdpbi5zZXRWYXJpYWJsZShmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgaW5kZXgsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGV4aXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuZ2FQbHVnaW4uZXhpdChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1nZW9sb2NhdGlvblxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZ2VvbG9jYXRpb25cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdlb2xvY2F0aW9uJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR2VvbG9jYXRpb24nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0Q3VycmVudFBvc2l0aW9uOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmdldEN1cnJlbnRQb3NpdGlvbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgd2F0Y2hQb3NpdGlvbjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIHZhciB3YXRjaElEID0gbmF2aWdhdG9yLmdlb2xvY2F0aW9uLndhdGNoUG9zaXRpb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICBxLnByb21pc2UuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIG5hdmlnYXRvci5nZW9sb2NhdGlvbi5jbGVhcldhdGNoKHdhdGNoSUQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHEucHJvbWlzZS5jbGVhcldhdGNoID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmNsZWFyV2F0Y2goaWQgfHwgd2F0Y2hJRCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcS5wcm9taXNlLndhdGNoSUQgPSB3YXRjaElEO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcldhdGNoOiBmdW5jdGlvbiAod2F0Y2hJRCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmNsZWFyV2F0Y2god2F0Y2hJRCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1nbG9iYWxpemF0aW9uXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tZ2xvYmFsaXphdGlvblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2xvYmFsaXphdGlvbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdsb2JhbGl6YXRpb24nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0UHJlZmVycmVkTGFuZ3VhZ2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldFByZWZlcnJlZExhbmd1YWdlKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldExvY2FsZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldExvY2FsZU5hbWUoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0Rmlyc3REYXlPZldlZWs6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldEZpcnN0RGF5T2ZXZWVrKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIFwiZGF0ZVwiIHBhcmFtZXRlciBtdXN0IGJlIGEgSmF2YVNjcmlwdCBEYXRlIE9iamVjdC5cbiAgICAgIGRhdGVUb1N0cmluZzogZnVuY3Rpb24gKGRhdGUsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmRhdGVUb1N0cmluZyhcbiAgICAgICAgICBkYXRlLFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc3RyaW5nVG9EYXRlOiBmdW5jdGlvbiAoZGF0ZVN0cmluZywgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uc3RyaW5nVG9EYXRlKFxuICAgICAgICAgIGRhdGVTdHJpbmcsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXREYXRlUGF0dGVybjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLmdldERhdGVQYXR0ZXJuKFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0RGF0ZU5hbWVzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0RGF0ZU5hbWVzKFxuICAgICAgICAgIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLy8gXCJkYXRlXCIgcGFyYW1ldGVyIG11c3QgYmUgYSBKYXZhU2NyaXB0IERhdGUgT2JqZWN0LlxuICAgICAgaXNEYXlMaWdodFNhdmluZ3NUaW1lOiBmdW5jdGlvbiAoZGF0ZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uaXNEYXlMaWdodFNhdmluZ3NUaW1lKFxuICAgICAgICAgIGRhdGUsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbnVtYmVyVG9TdHJpbmc6IGZ1bmN0aW9uIChudW1iZXIsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIG5hdmlnYXRvci5nbG9iYWxpemF0aW9uLm51bWJlclRvU3RyaW5nKFxuICAgICAgICAgIG51bWJlcixcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0cmluZ1RvTnVtYmVyOiBmdW5jdGlvbiAobnVtYmVyU3RyaW5nLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBuYXZpZ2F0b3IuZ2xvYmFsaXphdGlvbi5zdHJpbmdUb051bWJlcihcbiAgICAgICAgICBudW1iZXJTdHJpbmcsXG4gICAgICAgICAgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXROdW1iZXJQYXR0ZXJuOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0TnVtYmVyUGF0dGVybihcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEN1cnJlbmN5UGF0dGVybjogZnVuY3Rpb24gKGN1cnJlbmN5Q29kZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgbmF2aWdhdG9yLmdsb2JhbGl6YXRpb24uZ2V0Q3VycmVuY3lQYXR0ZXJuKFxuICAgICAgICAgIGN1cnJlbmN5Q29kZSxcbiAgICAgICAgICBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG5cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1hZG1vYi1wcm8uZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1hZG1vYi1wcm9cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZUFkcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdvb2dsZUFkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2IuY3JlYXRlQmFubmVyKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZW1vdmVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2IucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuQWRNb2Iuc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5zaG93QmFubmVyQXRYWSh4LCB5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaGlkZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5BZE1vYi5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LkFkTW9iLnNob3dJbnRlcnN0aXRpYWwoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2RhbndpbHNvbi9nb29nbGUtYW5hbHl0aWNzLXBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZGFud2lsc29uL2dvb2dsZS1hbmFseXRpY3MtcGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVBbmFseXRpY3MnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHb29nbGVBbmFseXRpY3MnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGFydFRyYWNrZXJXaXRoSWQ6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3Muc3RhcnRUcmFja2VyV2l0aElkKGlkLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzZXRVc2VySWQ6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3Muc2V0VXNlcklkKGlkLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkZWJ1Z01vZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLmRlYnVnTW9kZShmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHRyYWNrVmlldzogZnVuY3Rpb24gKHNjcmVlbk5hbWUpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnRyYWNrVmlldyhzY3JlZW5OYW1lLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhZGRDdXN0b21EaW1lbnNpb246IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5hZGRDdXN0b21EaW1lbnNpb24oa2V5LCB2YWx1ZSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB0cmFja0V2ZW50OiBmdW5jdGlvbiAoY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy50cmFja0V2ZW50KGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tFeGNlcHRpb246IGZ1bmN0aW9uIChkZXNjcmlwdGlvbiwgZmF0YWwpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnRyYWNrRXhjZXB0aW9uKGRlc2NyaXB0aW9uLCBmYXRhbCwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdHJhY2tUaW1pbmc6IGZ1bmN0aW9uIChjYXRlZ29yeSwgbWlsbGlzZWNvbmRzLCB2YXJpYWJsZSwgbGFiZWwpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuYW5hbHl0aWNzLnRyYWNrVGltaW5nKGNhdGVnb3J5LCBtaWxsaXNlY29uZHMsIHZhcmlhYmxlLCBsYWJlbCwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYWRkVHJhbnNhY3Rpb246IGZ1bmN0aW9uICh0cmFuc2FjdGlvbklkLCBhZmZpbGlhdGlvbiwgcmV2ZW51ZSwgdGF4LCBzaGlwcGluZywgY3VycmVuY3lDb2RlKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmFuYWx5dGljcy5hZGRUcmFuc2FjdGlvbih0cmFuc2FjdGlvbklkLCBhZmZpbGlhdGlvbiwgcmV2ZW51ZSwgdGF4LCBzaGlwcGluZywgY3VycmVuY3lDb2RlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBhZGRUcmFuc2FjdGlvbkl0ZW06IGZ1bmN0aW9uICh0cmFuc2FjdGlvbklkLCBuYW1lLCBza3UsIGNhdGVnb3J5LCBwcmljZSwgcXVhbnRpdHksIGN1cnJlbmN5Q29kZSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5hbmFseXRpY3MuYWRkVHJhbnNhY3Rpb25JdGVtKHRyYW5zYWN0aW9uSWQsIG5hbWUsIHNrdSwgY2F0ZWdvcnksIHByaWNlLCBxdWFudGl0eSwgY3VycmVuY3lDb2RlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBkLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOlxuLy8gbGluayAgICAgIDpcblxuLy8gR29vZ2xlIE1hcHMgbmVlZHMgQUxPVCBvZiB3b3JrIVxuLy8gTm90IGZvciBwcm9kdWN0aW9uIHVzZVxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlTWFwJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhR29vZ2xlTWFwJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICB2YXIgbWFwID0gbnVsbDtcblxuICAgIHJldHVybiB7XG4gICAgICBnZXRNYXA6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBpZiAoISR3aW5kb3cucGx1Z2luLmdvb2dsZS5tYXBzKSB7XG4gICAgICAgICAgcS5yZWplY3QobnVsbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGRpdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYXBfY2FudmFzJyk7XG4gICAgICAgICAgbWFwID0gJHdpbmRvdy5wbHVnaW4uZ29vZ2xlLm1hcHMuTWFwLmdldE1hcChvcHRpb25zKTtcbiAgICAgICAgICBtYXAuc2V0RGl2KGRpdik7XG4gICAgICAgICAgcS5yZXNvbHZlKG1hcCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzTWFwTG9hZGVkOiBmdW5jdGlvbiAoKSB7IC8vIGNoZWNrIGlmIGFuIGluc3RhbmNlIG9mIHRoZSBtYXAgZXhpc3RzXG4gICAgICAgIHJldHVybiAhIW1hcDtcbiAgICAgIH0sXG4gICAgICBhZGRNYXJrZXI6IGZ1bmN0aW9uIChtYXJrZXJPcHRpb25zKSB7IC8vIGFkZCBhIG1hcmtlciB0byB0aGUgbWFwIHdpdGggZ2l2ZW4gbWFya2VyT3B0aW9uc1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG1hcC5hZGRNYXJrZXIobWFya2VyT3B0aW9ucywgZnVuY3Rpb24gKG1hcmtlcikge1xuICAgICAgICAgIHEucmVzb2x2ZShtYXJrZXIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIGdldE1hcFR5cGVJZHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2luLmdvb2dsZS5tYXBzLm1hcFR5cGVJZDtcbiAgICAgIH0sXG4gICAgICBzZXRWaXNpYmxlOiBmdW5jdGlvbiAoaXNWaXNpYmxlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgbWFwLnNldFZpc2libGUoaXNWaXNpYmxlKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICAvLyBJIGRvbid0IGtub3cgaG93IHRvIGRlYWxsb2NhdGUgdGUgbWFwIGFuZCB0aGUgZ29vZ2xlIG1hcCBwbHVnaW4uXG4gICAgICBjbGVhbnVwOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIG1hcCA9IG51bGw7XG4gICAgICAgIC8vIGRlbGV0ZSBtYXA7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vcHRnYW1yL2NvcmRvdmEtZ29vZ2xlLXBsYXktZ2FtZS5naXQgLS12YXJpYWJsZSBBUFBfSUQ9MTIzNDU2Nzg5XG4vLyBsaW5rICAgICAgOiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9wdGdhbXIvY29yZG92YS1nb29nbGUtcGxheS1nYW1lXG5cbi8qIGdsb2JhbHMgZ29vZ2xlcGxheWdhbWU6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVQbGF5R2FtZScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUdvb2dsZVBsYXlHYW1lJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGF1dGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLmF1dGgoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2lnbm91dDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc2lnbm91dChmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBpc1NpZ25lZEluOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5pc1NpZ25lZEluKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNob3dQbGF5ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnNob3dQbGF5ZXIoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc3VibWl0U2NvcmU6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zdWJtaXRTY29yZShkYXRhLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBzaG93QWxsTGVhZGVyYm9hcmRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBnb29nbGVwbGF5Z2FtZS5zaG93QWxsTGVhZGVyYm9hcmRzKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHNob3dMZWFkZXJib2FyZDogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnNob3dMZWFkZXJib2FyZChkYXRhLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICB1bmxvY2tBY2hpZXZlbWVudDogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGdvb2dsZXBsYXlnYW1lLnVubG9ja0FjaGlldmVtZW50KGRhdGEsIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJldHVybiBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIGluY3JlbWVudEFjaGlldmVtZW50OiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuaW5jcmVtZW50QWNoaWV2ZW1lbnQoZGF0YSwgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2hvd0FjaGlldmVtZW50czogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgZ29vZ2xlcGxheWdhbWUuc2hvd0FjaGlldmVtZW50cyhmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHJldHVybiBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9jb3Jkb3ZhLXBsdWdpbi1nb29nbGVwbHVzLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL2NvcmRvdmEtcGx1Z2luLWdvb2dsZXBsdXNcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZVBsdXMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFHb29nbGVQbHVzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9naW46IGZ1bmN0aW9uIChpb3NLZXkpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmIChpb3NLZXkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlvc0tleSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nb29nbGVwbHVzLmxvZ2luKHsnaU9TQXBpS2V5JzogaW9zS2V5fSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2lsZW50TG9naW46IGZ1bmN0aW9uIChpb3NLZXkpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGlmIChpb3NLZXkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlvc0tleSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nb29nbGVwbHVzLnRyeVNpbGVudExvZ2luKHsnaU9TQXBpS2V5JzogaW9zS2V5fSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgbG9nb3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmdvb2dsZXBsdXMubG9nb3V0KGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgZGlzY29ubmVjdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nb29nbGVwbHVzLmRpc2Nvbm5lY3QoZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICBpc0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5nb29nbGVwbHVzLmlzQXZhaWxhYmxlKGZ1bmN0aW9uIChhdmFpbGFibGUpIHtcbiAgICAgICAgICBpZiAoYXZhaWxhYmxlKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoYXZhaWxhYmxlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoYXZhaWxhYmxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1RlbGVyaWstVmVyaWZpZWQtUGx1Z2lucy9IZWFsdGhLaXQuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9UZWxlcmlrLVZlcmlmaWVkLVBsdWdpbnMvSGVhbHRoS2l0XG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5oZWFsdGhLaXQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFIZWFsdGhLaXQnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBpc0F2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5hdmFpbGFibGUoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBDaGVjayB3aGV0aGVyIG9yIG5vdCB0aGUgdXNlciBncmFudGVkIHlvdXIgYXBwIGFjY2VzcyB0byBhIHNwZWNpZmljIEhlYWx0aEtpdCB0eXBlLlxuICAgICAgICogUmVmZXJlbmNlIGZvciBwb3NzaWJsZSB0eXBlczpcbiAgICAgICAqIGh0dHBzOi8vZGV2ZWxvcGVyLmFwcGxlLmNvbS9saWJyYXJ5L2lvcy9kb2N1bWVudGF0aW9uL0hlYWx0aEtpdC9SZWZlcmVuY2UvSGVhbHRoS2l0X0NvbnN0YW50cy9cbiAgICAgICAqL1xuICAgICAgY2hlY2tBdXRoU3RhdHVzOiBmdW5jdGlvbiAodHlwZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgdHlwZSA9IHR5cGUgfHwgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckhlaWdodCc7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5jaGVja0F1dGhTdGF0dXMoe1xuICAgICAgICAgICd0eXBlJzogdHlwZVxuICAgICAgICB9LCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIFJlcXVlc3QgYXV0aG9yaXphdGlvbiB0byBhY2Nlc3MgSGVhbHRoS2l0IGRhdGEuIFNlZSB0aGUgZnVsbCBIZWFsdGhLaXQgY29uc3RhbnRzXG4gICAgICAgKiByZWZlcmVuY2UgZm9yIHBvc3NpYmxlIHJlYWQgYW5kIHdyaXRlIHR5cGVzOlxuICAgICAgICogaHR0cHM6Ly9kZXZlbG9wZXIuYXBwbGUuY29tL2xpYnJhcnkvaW9zL2RvY3VtZW50YXRpb24vSGVhbHRoS2l0L1JlZmVyZW5jZS9IZWFsdGhLaXRfQ29uc3RhbnRzL1xuICAgICAgICovXG4gICAgICByZXF1ZXN0QXV0aG9yaXphdGlvbjogZnVuY3Rpb24gKHJlYWRUeXBlcywgd3JpdGVUeXBlcykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgcmVhZFR5cGVzID0gcmVhZFR5cGVzIHx8IFtcbiAgICAgICAgICAnSEtDaGFyYWN0ZXJpc3RpY1R5cGVJZGVudGlmaWVyRGF0ZU9mQmlydGgnLCAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVyQWN0aXZlRW5lcmd5QnVybmVkJywgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckhlaWdodCdcbiAgICAgICAgXTtcbiAgICAgICAgd3JpdGVUeXBlcyA9IHdyaXRlVHlwZXMgfHwgW1xuICAgICAgICAgICdIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJBY3RpdmVFbmVyZ3lCdXJuZWQnLCAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVySGVpZ2h0JywgJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckRpc3RhbmNlQ3ljbGluZydcbiAgICAgICAgXTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnJlcXVlc3RBdXRob3JpemF0aW9uKHtcbiAgICAgICAgICAncmVhZFR5cGVzJzogcmVhZFR5cGVzLFxuICAgICAgICAgICd3cml0ZVR5cGVzJzogd3JpdGVUeXBlc1xuICAgICAgICB9LCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkRGF0ZU9mQmlydGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnJlYWREYXRlT2ZCaXJ0aChcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkR2VuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmhlYWx0aGtpdC5yZWFkR2VuZGVyKFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNhdmVXZWlnaHQ6IGZ1bmN0aW9uICh2YWx1ZSwgdW5pdHMsIGRhdGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnNhdmVXZWlnaHQoe1xuICAgICAgICAgICAgJ3VuaXQnOiB1bml0cyB8fCAnbGInLFxuICAgICAgICAgICAgJ2Ftb3VudCc6IHZhbHVlLFxuICAgICAgICAgICAgJ2RhdGUnOiBkYXRlIHx8IG5ldyBEYXRlKClcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWFkV2VpZ2h0OiBmdW5jdGlvbiAodW5pdHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnJlYWRXZWlnaHQoe1xuICAgICAgICAgICAgJ3VuaXQnOiB1bml0cyB8fCAnbGInXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2F2ZUhlaWdodDogZnVuY3Rpb24gKHZhbHVlLCB1bml0cywgZGF0ZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5oZWFsdGhraXQuc2F2ZUhlaWdodCh7XG4gICAgICAgICAgICAndW5pdCc6IHVuaXRzIHx8ICdpbicsXG4gICAgICAgICAgICAnYW1vdW50JzogdmFsdWUsXG4gICAgICAgICAgICAnZGF0ZSc6IGRhdGUgfHwgbmV3IERhdGUoKVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICByZWFkSGVpZ2h0OiBmdW5jdGlvbiAodW5pdHMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnJlYWRIZWlnaHQoe1xuICAgICAgICAgICAgJ3VuaXQnOiB1bml0cyB8fCAnaW4nXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBmaW5kV29ya291dHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LmZpbmRXb3Jrb3V0cyh7fSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLyoqXG4gICAgICAgKiBTYXZlIGEgd29ya291dC5cbiAgICAgICAqXG4gICAgICAgKiBXb3Jrb3V0IHBhcmFtIHNob3VsZCBiZSBvZiB0aGUgZm9ybWF0OlxuICAgICAgIHtcbiAgICAgICAgICdhY3Rpdml0eVR5cGUnOiAnSEtXb3Jrb3V0QWN0aXZpdHlUeXBlQ3ljbGluZycsIC8vIEhLV29ya291dEFjdGl2aXR5VHlwZSBjb25zdGFudCAoaHR0cHM6Ly9kZXZlbG9wZXIuYXBwbGUuY29tL2xpYnJhcnkvaW9zL2RvY3VtZW50YXRpb24vSGVhbHRoS2l0L1JlZmVyZW5jZS9IS1dvcmtvdXRfQ2xhc3MvIy8vYXBwbGVfcmVmL2MvdGRlZi9IS1dvcmtvdXRBY3Rpdml0eVR5cGUpXG4gICAgICAgICAncXVhbnRpdHlUeXBlJzogJ0hLUXVhbnRpdHlUeXBlSWRlbnRpZmllckRpc3RhbmNlQ3ljbGluZycsXG4gICAgICAgICAnc3RhcnREYXRlJzogbmV3IERhdGUoKSwgLy8gbWFuZGF0b3J5XG4gICAgICAgICAnZW5kRGF0ZSc6IG51bGwsIC8vIG9wdGlvbmFsLCB1c2UgZWl0aGVyIHRoaXMgb3IgZHVyYXRpb25cbiAgICAgICAgICdkdXJhdGlvbic6IDM2MDAsIC8vIGluIHNlY29uZHMsIG9wdGlvbmFsLCB1c2UgZWl0aGVyIHRoaXMgb3IgZW5kRGF0ZVxuICAgICAgICAgJ2VuZXJneSc6IDMwMCwgLy9cbiAgICAgICAgICdlbmVyZ3lVbml0JzogJ2tjYWwnLCAvLyBKfGNhbHxrY2FsXG4gICAgICAgICAnZGlzdGFuY2UnOiAxMSwgLy8gb3B0aW9uYWxcbiAgICAgICAgICdkaXN0YW5jZVVuaXQnOiAna20nIC8vIHByb2JhYmx5IHVzZWZ1bCB3aXRoIHRoZSBmb3JtZXIgcGFyYW1cbiAgICAgICAgIC8vICdleHRyYURhdGEnOiBcIlwiLCAvLyBOb3Qgc3VyZSBob3cgbmVjZXNzYXJ5IHRoaXMgaXNcbiAgICAgICB9LFxuICAgICAgICovXG4gICAgICBzYXZlV29ya291dDogZnVuY3Rpb24gKHdvcmtvdXQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnNhdmVXb3Jrb3V0KHdvcmtvdXQsXG4gICAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIC8qKlxuICAgICAgICogU2FtcGxlIGFueSBraW5kIG9mIGhlYWx0aCBkYXRhIHRocm91Z2ggYSBnaXZlbiBkYXRlIHJhbmdlLlxuICAgICAgICogc2FtcGxlUXVlcnkgb2YgdGhlIGZvcm1hdDpcbiAgICAgICB7XG5cdFx0XHRcdFx0XHRcdFx0XHQnc3RhcnREYXRlJzogeWVzdGVyZGF5LCAvLyBtYW5kYXRvcnlcblx0XHRcdFx0XHRcdFx0XHRcdCdlbmREYXRlJzogdG9tb3Jyb3csIC8vIG1hbmRhdG9yeVxuXHRcdFx0XHRcdFx0XHRcdFx0J3NhbXBsZVR5cGUnOiAnSEtRdWFudGl0eVR5cGVJZGVudGlmaWVySGVpZ2h0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdCd1bml0JyA6ICdjbSdcblx0XHRcdFx0XHRcdFx0fSxcbiAgICAgICAqL1xuICAgICAgcXVlcnlTYW1wbGVUeXBlOiBmdW5jdGlvbiAoc2FtcGxlUXVlcnkpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuaGVhbHRoa2l0LnF1ZXJ5U2FtcGxlVHlwZShzYW1wbGVRdWVyeSxcbiAgICAgICAgICBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgcS5yZXNvbHZlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLWh0dHBkLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtaHR0cGRcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmh0dHBkJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhSHR0cGQnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhcnRTZXJ2ZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICBjb3Jkb3ZhLnBsdWdpbnMuQ29ySHR0cGQuc3RhcnRTZXJ2ZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHN0b3BTZXJ2ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5Db3JIdHRwZC5zdG9wU2VydmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRVUkw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGNvcmRvdmEucGx1Z2lucy5Db3JIdHRwZC5nZXRVUkwoZnVuY3Rpb24gKHVybCkge1xuICAgICAgICAgIGQucmVzb2x2ZSh1cmwpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldExvY2FsUGF0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgY29yZG92YS5wbHVnaW5zLkNvckh0dHBkLmdldExvY2FsUGF0aChmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgIGQucmVzb2x2ZShwYXRoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG5cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4taWFkLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLWlhZFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaUFkJywgW10pXG4gIC5mYWN0b3J5KCckY29yZG92YWlBZCcsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuaUFkLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LmlBZC5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pQWQuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgOiAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS93eW1zZWUvY29yZG92YS1pbWFnZVBpY2tlci5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS93eW1zZWUvY29yZG92YS1pbWFnZVBpY2tlclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaW1hZ2VQaWNrZXInLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFJbWFnZVBpY2tlcicsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldFBpY3R1cmVzOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5pbWFnZVBpY2tlci5nZXRQaWN0dXJlcyhmdW5jdGlvbiAocmVzdWx0cykge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHRzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1pbmFwcGJyb3dzZXJcbi8vIGxpbmsgICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2NvcmRvdmEtcGx1Z2luLWluYXBwYnJvd3NlclxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5BcHBCcm93c2VyJywgW10pXG5cbiAgLnByb3ZpZGVyKCckY29yZG92YUluQXBwQnJvd3NlcicsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgcmVmO1xuICAgIHZhciBkZWZhdWx0T3B0aW9ucyA9IHRoaXMuZGVmYXVsdE9wdGlvbnMgPSB7fTtcblxuICAgIHRoaXMuc2V0RGVmYXVsdE9wdGlvbnMgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKGRlZmF1bHRPcHRpb25zLCBjb25maWcpO1xuICAgIH07XG5cbiAgICB0aGlzLiRnZXQgPSBbJyRyb290U2NvcGUnLCAnJHEnLCAnJHdpbmRvdycsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkcSwgJHdpbmRvdywgJHRpbWVvdXQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9wZW46IGZ1bmN0aW9uICh1cmwsIHRhcmdldCwgcmVxdWVzdE9wdGlvbnMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICBpZiAocmVxdWVzdE9wdGlvbnMgJiYgIWFuZ3VsYXIuaXNPYmplY3QocmVxdWVzdE9wdGlvbnMpKSB7XG4gICAgICAgICAgICBxLnJlamVjdCgnb3B0aW9ucyBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgb3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucywgcmVxdWVzdE9wdGlvbnMpO1xuXG4gICAgICAgICAgdmFyIG9wdCA9IFtdO1xuICAgICAgICAgIGFuZ3VsYXIuZm9yRWFjaChvcHRpb25zLCBmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgICAgICAgb3B0LnB1c2goa2V5ICsgJz0nICsgdmFsdWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHZhciBvcHRpb25zU3RyaW5nID0gb3B0LmpvaW4oKTtcblxuICAgICAgICAgIHJlZiA9ICR3aW5kb3cub3Blbih1cmwsIHRhcmdldCwgb3B0aW9uc1N0cmluZyk7XG5cbiAgICAgICAgICByZWYuYWRkRXZlbnRMaXN0ZW5lcignbG9hZHN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFJbkFwcEJyb3dzZXI6bG9hZHN0YXJ0JywgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgICAgcmVmLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRzdG9wJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoZXZlbnQpO1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhSW5BcHBCcm93c2VyOmxvYWRzdG9wJywgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgICAgcmVmLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRlcnJvcicsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgcS5yZWplY3QoZXZlbnQpO1xuICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhSW5BcHBCcm93c2VyOmxvYWRlcnJvcicsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAgIHJlZi5hZGRFdmVudExpc3RlbmVyKCdleGl0JywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFJbkFwcEJyb3dzZXI6ZXhpdCcsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2xvc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZWYuY2xvc2UoKTtcbiAgICAgICAgICByZWYgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNob3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZWYuc2hvdygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGV4ZWN1dGVTY3JpcHQ6IGZ1bmN0aW9uIChkZXRhaWxzKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgcmVmLmV4ZWN1dGVTY3JpcHQoZGV0YWlscywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGluc2VydENTUzogZnVuY3Rpb24gKGRldGFpbHMpIHtcbiAgICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgICByZWYuaW5zZXJ0Q1NTKGRldGFpbHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL0luc29tbmlhLVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9JbnNvbW5pYS1QaG9uZUdhcC1QbHVnaW5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5pbnNvbW5pYScsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUluc29tbmlhJywgWyckd2luZG93JywgZnVuY3Rpb24gKCR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBrZWVwQXdha2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2lucy5pbnNvbW5pYS5rZWVwQXdha2UoKTtcbiAgICAgIH0sXG4gICAgICBhbGxvd1NsZWVwQWdhaW46IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cucGx1Z2lucy5pbnNvbW5pYS5hbGxvd1NsZWVwQWdhaW4oKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICBjb3Jkb3ZhIHBsdWdpbnMgYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS92c3RpcmJ1L0luc3RhZ3JhbVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgaHR0cHM6Ly9naXRodWIuY29tL3ZzdGlyYnUvSW5zdGFncmFtUGx1Z2luXG5cbi8qIGdsb2JhbHMgSW5zdGFncmFtOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5zdGFncmFtJywgW10pXG5cbi5mYWN0b3J5KCckY29yZG92YUluc3RhZ3JhbScsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICByZXR1cm4ge1xuICAgIHNoYXJlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICBpZiAoIXdpbmRvdy5JbnN0YWdyYW0pIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignVHJpZWQgdG8gY2FsbCBJbnN0YWdyYW0uc2hhcmUgYnV0IHRoZSBJbnN0YWdyYW0gcGx1Z2luIGlzblxcJ3QgaW5zdGFsbGVkIScpO1xuICAgICAgICBxLnJlc29sdmUobnVsbCk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIEluc3RhZ3JhbS5zaGFyZShvcHRpb25zLmltYWdlLCBvcHRpb25zLmNhcHRpb24sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgaWYoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICB9LFxuICAgIGlzSW5zdGFsbGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgIGlmICghd2luZG93Lkluc3RhZ3JhbSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdUcmllZCB0byBjYWxsIEluc3RhZ3JhbS5pc0luc3RhbGxlZCBidXQgdGhlIEluc3RhZ3JhbSBwbHVnaW4gaXNuXFwndCBpbnN0YWxsZWQhJyk7XG4gICAgICAgIHEucmVzb2x2ZShudWxsKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cblxuICAgICAgSW5zdGFncmFtLmlzSW5zdGFsbGVkKGZ1bmN0aW9uIChlcnIsIGluc3RhbGxlZCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBxLnJlc29sdmUoaW5zdGFsbGVkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgIH1cbiAgfTtcbn1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2RyaWZ0eWNvL2lvbmljLXBsdWdpbnMta2V5Ym9hcmQuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9kcmlmdHljby9pb25pYy1wbHVnaW5zLWtleWJvYXJkXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5rZXlib2FyZCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUtleWJvYXJkJywgWyckcm9vdFNjb3BlJywgZnVuY3Rpb24gKCRyb290U2NvcGUpIHtcblxuICAgIHZhciBrZXlib2FyZFNob3dFdmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICRyb290U2NvcGUuJGV2YWxBc3luYyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFLZXlib2FyZDpzaG93Jyk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgdmFyIGtleWJvYXJkSGlkZUV2ZW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgJHJvb3RTY29wZS4kZXZhbEFzeW5jKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUtleWJvYXJkOmhpZGUnKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQpIHtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ25hdGl2ZS5rZXlib2FyZHNob3cnLCBrZXlib2FyZFNob3dFdmVudCwgZmFsc2UpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbmF0aXZlLmtleWJvYXJkaGlkZScsIGtleWJvYXJkSGlkZUV2ZW50LCBmYWxzZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaGlkZUFjY2Vzc29yeUJhcjogZnVuY3Rpb24gKGJvb2wpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZC5oaWRlS2V5Ym9hcmRBY2Nlc3NvcnlCYXIoYm9vbCk7XG4gICAgICB9LFxuXG4gICAgICBjbG9zZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY29yZG92YS5wbHVnaW5zLktleWJvYXJkLmNsb3NlKCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQuc2hvdygpO1xuICAgICAgfSxcblxuICAgICAgZGlzYWJsZVNjcm9sbDogZnVuY3Rpb24gKGJvb2wpIHtcbiAgICAgICAgcmV0dXJuIGNvcmRvdmEucGx1Z2lucy5LZXlib2FyZC5kaXNhYmxlU2Nyb2xsKGJvb2wpO1xuICAgICAgfSxcblxuICAgICAgaXNWaXNpYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjb3Jkb3ZhLnBsdWdpbnMuS2V5Ym9hcmQuaXNWaXNpYmxlO1xuICAgICAgfSxcblxuICAgICAgY2xlYXJTaG93V2F0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbmF0aXZlLmtleWJvYXJkc2hvdycsIGtleWJvYXJkU2hvd0V2ZW50KTtcbiAgICAgICAgJHJvb3RTY29wZS4kJGxpc3RlbmVyc1snJGNvcmRvdmFLZXlib2FyZDpzaG93J10gPSBbXTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFySGlkZVdhdGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ25hdGl2ZS5rZXlib2FyZGhpZGUnLCBrZXlib2FyZEhpZGVFdmVudCk7XG4gICAgICAgICRyb290U2NvcGUuJCRsaXN0ZW5lcnNbJyRjb3Jkb3ZhS2V5Ym9hcmQ6aGlkZSddID0gW107XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vc2hhenJvbi9LZXljaGFpblBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL3NoYXpyb24vS2V5Y2hhaW5QbHVnaW5cblxuLyogZ2xvYmFscyBLZXljaGFpbjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmtleWNoYWluJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhS2V5Y2hhaW4nLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0Rm9yS2V5OiBmdW5jdGlvbiAoa2V5LCBzZXJ2aWNlTmFtZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpLFxuICAgICAgICAgICAga2MgPSBuZXcgS2V5Y2hhaW4oKTtcblxuICAgICAgICBrYy5nZXRGb3JLZXkoZGVmZXIucmVzb2x2ZSwgZGVmZXIucmVqZWN0LCBrZXksIHNlcnZpY2VOYW1lKTtcblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldEZvcktleTogZnVuY3Rpb24gKGtleSwgc2VydmljZU5hbWUsIHZhbHVlKSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCksXG4gICAgICAgICAgICBrYyA9IG5ldyBLZXljaGFpbigpO1xuXG4gICAgICAgIGtjLnNldEZvcktleShkZWZlci5yZXNvbHZlLCBkZWZlci5yZWplY3QsIGtleSwgc2VydmljZU5hbWUsIHZhbHVlKTtcblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUZvcktleTogZnVuY3Rpb24gKGtleSwgc2VydmljZU5hbWUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKSxcbiAgICAgICAgICAgIGtjID0gbmV3IEtleWNoYWluKCk7XG5cbiAgICAgICAga2MucmVtb3ZlRm9yS2V5KGRlZmVyLnJlc29sdmUsIGRlZmVyLnJlamVjdCwga2V5LCBzZXJ2aWNlTmFtZSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCB1ay5jby53b3JraW5nZWRnZS5waG9uZWdhcC5wbHVnaW4ubGF1bmNobmF2aWdhdG9yXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9kcGE5OWMvcGhvbmVnYXAtbGF1bmNoLW5hdmlnYXRvclxuXG4vKiBnbG9iYWxzIGxhdW5jaG5hdmlnYXRvcjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLmxhdW5jaE5hdmlnYXRvcicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YUxhdW5jaE5hdmlnYXRvcicsIFsnJHEnLCBmdW5jdGlvbiAoJHEpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBuYXZpZ2F0ZTogZnVuY3Rpb24gKGRlc3RpbmF0aW9uLCBzdGFydCwgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGxhdW5jaG5hdmlnYXRvci5uYXZpZ2F0ZShcbiAgICAgICAgICBkZXN0aW5hdGlvbixcbiAgICAgICAgICBzdGFydCxcbiAgICAgICAgICBmdW5jdGlvbiAoKXtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKGVycm9yKXtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9LFxuXHRcdCAgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1sb2NhbC1ub3RpZmljYXRpb25zLmdpdFxuLy8gbGluayAgICAgIDogIGh0dHBzOi8vZ2l0aHViLmNvbS9rYXR6ZXIvY29yZG92YS1wbHVnaW4tbG9jYWwtbm90aWZpY2F0aW9uc1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubG9jYWxOb3RpZmljYXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbicsIFsnJHEnLCAnJHdpbmRvdycsICckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRxLCAkd2luZG93LCAkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKCR3aW5kb3cuY29yZG92YSAmJlxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucyAmJlxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24gJiZcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsKSB7XG4gICAgICAgIC8vIC0tLS0tIFwiU2NoZWR1bGluZ1wiIGV2ZW50c1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyBzY2hlZHVsZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdzY2hlZHVsZScsIGZ1bmN0aW9uIChub3RpZmljYXRpb24sIHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOnNjaGVkdWxlJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyB0cmlnZ2VyZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCd0cmlnZ2VyJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246dHJpZ2dlcicsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0tLSBcIlVwZGF0ZVwiIGV2ZW50c1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyB1cGRhdGVkXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbigndXBkYXRlJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246dXBkYXRlJywgbm90aWZpY2F0aW9uLCBzdGF0ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLS0tIFwiQ2xlYXJcIiBldmVudHNcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgY2xlYXJlZCBmcm9tIHRoZSBub3RpZmljYXRpb24gY2VudGVyXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5vbignY2xlYXInLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpjbGVhcicsIG5vdGlmaWNhdGlvbiwgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBbGwgbG9jYWwgbm90aWZpY2F0aW9ucyB3ZXJlIGNsZWFyZWQgZnJvbSB0aGUgbm90aWZpY2F0aW9uIGNlbnRlclxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ2NsZWFyYWxsJywgZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YUxvY2FsTm90aWZpY2F0aW9uOmNsZWFyYWxsJywgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0tLSBcIkNhbmNlbFwiIGV2ZW50c1xuXG4gICAgICAgIC8vIEEgbG9jYWwgbm90aWZpY2F0aW9uIHdhcyBjYW5jZWxsZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdjYW5jZWwnLCBmdW5jdGlvbiAobm90aWZpY2F0aW9uLCBzdGF0ZSkge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFMb2NhbE5vdGlmaWNhdGlvbjpjYW5jZWwnLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWxsIGxvY2FsIG5vdGlmaWNhdGlvbnMgd2VyZSBjYW5jZWxsZWRcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLm9uKCdjYW5jZWxhbGwnLCBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246Y2FuY2VsYWxsJywgc3RhdGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0tLSBPdGhlciBldmVudHNcblxuICAgICAgICAvLyBBIGxvY2FsIG5vdGlmaWNhdGlvbiB3YXMgY2xpY2tlZFxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwub24oJ2NsaWNrJywgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbiwgc3RhdGUpIHtcbiAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhTG9jYWxOb3RpZmljYXRpb246Y2xpY2snLCBub3RpZmljYXRpb24sIHN0YXRlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSwgZmFsc2UpO1xuICAgIHJldHVybiB7XG4gICAgICBzY2hlZHVsZTogZnVuY3Rpb24gKG9wdGlvbnMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5zY2hlZHVsZShvcHRpb25zLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgYWRkOiBmdW5jdGlvbiAob3B0aW9ucywgc2NvcGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdEZXByZWNhdGVkOiB1c2UgXCJzY2hlZHVsZVwiIGluc3RlYWQuJyk7XG5cbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnNjaGVkdWxlKG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICB1cGRhdGU6IGZ1bmN0aW9uIChvcHRpb25zLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwudXBkYXRlKG9wdGlvbnMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjbGVhcjogZnVuY3Rpb24gKGlkcywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmNsZWFyKGlkcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyQWxsOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmNsZWFyQWxsKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjYW5jZWw6IGZ1bmN0aW9uIChpZHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5jYW5jZWwoaWRzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY2FuY2VsQWxsOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmNhbmNlbEFsbChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgaXNQcmVzZW50OiBmdW5jdGlvbiAoaWQsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5pc1ByZXNlbnQoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc1NjaGVkdWxlZDogZnVuY3Rpb24gKGlkLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuaXNTY2hlZHVsZWQoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBpc1RyaWdnZXJlZDogZnVuY3Rpb24gKGlkLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuaXNUcmlnZ2VyZWQoaWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoYXNQZXJtaXNzaW9uOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmhhc1Blcm1pc3Npb24oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdChyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICByZWdpc3RlclBlcm1pc3Npb246IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwucmVnaXN0ZXJQZXJtaXNzaW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcHJvbXB0Rm9yUGVybWlzc2lvbjogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignRGVwcmVjYXRlZDogdXNlIFwicmVnaXN0ZXJQZXJtaXNzaW9uXCIgaW5zdGVhZC4nKTtcblxuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwucmVnaXN0ZXJQZXJtaXNzaW9uKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0QWxsSWRzOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldEFsbElkcyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0SWRzOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldElkcyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0U2NoZWR1bGVkSWRzOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldFNjaGVkdWxlZElkcyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0VHJpZ2dlcmVkSWRzOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldFRyaWdnZXJlZElkcyhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0OiBmdW5jdGlvbiAoaWRzLCBzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0KGlkcywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldEFsbDogZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRBbGwoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBzY29wZSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGdldFNjaGVkdWxlZDogZnVuY3Rpb24gKGlkcywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldFNjaGVkdWxlZChpZHMsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRBbGxTY2hlZHVsZWQ6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNjb3BlID0gc2NvcGUgfHwgbnVsbDtcblxuICAgICAgICAkd2luZG93LmNvcmRvdmEucGx1Z2lucy5ub3RpZmljYXRpb24ubG9jYWwuZ2V0QWxsU2NoZWR1bGVkKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgc2NvcGUpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBnZXRUcmlnZ2VyZWQ6IGZ1bmN0aW9uIChpZHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgc2NvcGUgPSBzY29wZSB8fCBudWxsO1xuXG4gICAgICAgICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXRUcmlnZ2VyZWQoaWRzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0QWxsVHJpZ2dlcmVkOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzY29wZSA9IHNjb3BlIHx8IG51bGw7XG5cbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLmdldEFsbFRyaWdnZXJlZChmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIHNjb3BlKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgZ2V0RGVmYXVsdHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICR3aW5kb3cuY29yZG92YS5wbHVnaW5zLm5vdGlmaWNhdGlvbi5sb2NhbC5nZXREZWZhdWx0cygpO1xuICAgICAgfSxcblxuICAgICAgc2V0RGVmYXVsdHM6IGZ1bmN0aW9uIChPYmplY3QpIHtcbiAgICAgICAgJHdpbmRvdy5jb3Jkb3ZhLnBsdWdpbnMubm90aWZpY2F0aW9uLmxvY2FsLnNldERlZmF1bHRzKE9iamVjdCk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtcGx1Z2luLW1tZWRpYS5naXRcbi8vIGxpbmsgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9mbG9hdGluZ2hvdHBvdC9jb3Jkb3ZhLXBsdWdpbi1tbWVkaWFcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm1NZWRpYUFkcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YU1NZWRpYUFkcycsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldE9wdGlvbnM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5zZXRPcHRpb25zKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVCYW5uZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEucmVtb3ZlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyOiBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnNob3dCYW5uZXIocG9zaXRpb24sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93QmFubmVyQXRYWTogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cubU1lZGlhLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lm1NZWRpYS5oaWRlQmFubmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVwYXJlSW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEucHJlcGFyZUludGVyc3RpdGlhbChvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0ludGVyc3RpdGlhbDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5tTWVkaWEuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tbWVkaWFcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1tZWRpYVxuXG4vKiBnbG9iYWxzIE1lZGlhOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubWVkaWEnLCBbXSlcblxuLnNlcnZpY2UoJ05ld01lZGlhJywgWyckcScsICckaW50ZXJ2YWwnLCBmdW5jdGlvbiAoJHEsICRpbnRlcnZhbCkge1xuICB2YXIgcSwgcTIsIHEzLCBtZWRpYVN0YXR1cyA9IG51bGwsIG1lZGlhUG9zaXRpb24gPSAtMSwgbWVkaWFUaW1lciwgbWVkaWFEdXJhdGlvbiA9IC0xO1xuXG4gIGZ1bmN0aW9uIHNldFRpbWVyKG1lZGlhKSB7XG4gICAgICBpZiAoYW5ndWxhci5pc0RlZmluZWQobWVkaWFUaW1lcikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBtZWRpYVRpbWVyID0gJGludGVydmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpZiAobWVkaWFEdXJhdGlvbiA8IDApIHtcbiAgICAgICAgICAgICAgbWVkaWFEdXJhdGlvbiA9IG1lZGlhLmdldER1cmF0aW9uKCk7XG4gICAgICAgICAgICAgIGlmIChxICYmIG1lZGlhRHVyYXRpb24gPiAwKSB7XG4gICAgICAgICAgICAgICAgcS5ub3RpZnkoe2R1cmF0aW9uOiBtZWRpYUR1cmF0aW9ufSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBtZWRpYS5nZXRDdXJyZW50UG9zaXRpb24oXG4gICAgICAgICAgICAvLyBzdWNjZXNzIGNhbGxiYWNrXG4gICAgICAgICAgICBmdW5jdGlvbiAocG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gPiAtMSkge1xuICAgICAgICAgICAgICAgICAgICBtZWRpYVBvc2l0aW9uID0gcG9zaXRpb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIGVycm9yIGNhbGxiYWNrXG4gICAgICAgICAgICBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdFcnJvciBnZXR0aW5nIHBvcz0nICsgZSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChxKSB7XG4gICAgICAgICAgICBxLm5vdGlmeSh7cG9zaXRpb246IG1lZGlhUG9zaXRpb259KTtcbiAgICAgICAgICB9XG5cbiAgICAgIH0sIDEwMDApO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJUaW1lcigpIHtcbiAgICAgIGlmIChhbmd1bGFyLmlzRGVmaW5lZChtZWRpYVRpbWVyKSkge1xuICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwobWVkaWFUaW1lcik7XG4gICAgICAgICAgbWVkaWFUaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2V0VmFsdWVzKCkge1xuICAgICAgbWVkaWFQb3NpdGlvbiA9IC0xO1xuICAgICAgbWVkaWFEdXJhdGlvbiA9IC0xO1xuICB9XG5cbiAgZnVuY3Rpb24gTmV3TWVkaWEoc3JjKSB7XG4gICAgICB0aGlzLm1lZGlhID0gbmV3IE1lZGlhKHNyYyxcbiAgICAgICAgZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZXIoKTtcbiAgICAgICAgICAgIHJlc2V0VmFsdWVzKCk7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lcigpO1xuICAgICAgICAgICAgcmVzZXRWYWx1ZXMoKTtcbiAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKHN0YXR1cykge1xuICAgICAgICAgICAgbWVkaWFTdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgICAgICBxLm5vdGlmeSh7c3RhdHVzOiBtZWRpYVN0YXR1c30pO1xuICAgICAgICB9KTtcbiAgfVxuXG4gIC8vIGlPUyBxdWlya3MgOlxuICAvLyAtICBteU1lZGlhLnBsYXkoeyBudW1iZXJPZkxvb3BzOiAyIH0pIC0+IGxvb3BpbmdcbiAgLy8gLSAgbXlNZWRpYS5wbGF5KHsgcGxheUF1ZGlvV2hlblNjcmVlbklzTG9ja2VkIDogZmFsc2UgfSlcbiAgTmV3TWVkaWEucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICB9XG5cbiAgICAgIHRoaXMubWVkaWEucGxheShvcHRpb25zKTtcblxuICAgICAgc2V0VGltZXIodGhpcy5tZWRpYSk7XG5cbiAgICAgIHJldHVybiBxLnByb21pc2U7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgY2xlYXJUaW1lcigpO1xuICAgICAgdGhpcy5tZWRpYS5wYXVzZSgpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5zdG9wICA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMubWVkaWEuc3RvcCgpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5yZWxlYXNlICA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMubWVkaWEucmVsZWFzZSgpO1xuICAgICAgdGhpcy5tZWRpYSA9IHVuZGVmaW5lZDtcbiAgfTtcblxuICBOZXdNZWRpYS5wcm90b3R5cGUuc2Vla1RvICA9IGZ1bmN0aW9uICh0aW1pbmcpIHtcbiAgICAgIHRoaXMubWVkaWEuc2Vla1RvKHRpbWluZyk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnNldFZvbHVtZSA9IGZ1bmN0aW9uICh2b2x1bWUpIHtcbiAgICAgIHRoaXMubWVkaWEuc2V0Vm9sdW1lKHZvbHVtZSk7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLnN0YXJ0UmVjb3JkID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5tZWRpYS5zdGFydFJlY29yZCgpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5zdG9wUmVjb3JkICA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMubWVkaWEuc3RvcFJlY29yZCgpO1xuICB9O1xuXG4gIE5ld01lZGlhLnByb3RvdHlwZS5jdXJyZW50VGltZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHEyID0gJHEuZGVmZXIoKTtcbiAgICAgIHRoaXMubWVkaWEuZ2V0Q3VycmVudFBvc2l0aW9uKGZ1bmN0aW9uIChwb3NpdGlvbil7XG4gICAgICBxMi5yZXNvbHZlKHBvc2l0aW9uKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHEyLnByb21pc2U7XG4gIH07XG5cbiAgTmV3TWVkaWEucHJvdG90eXBlLmdldER1cmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICAgIHEzID0gJHEuZGVmZXIoKTtcbiAgICB0aGlzLm1lZGlhLmdldER1cmF0aW9uKGZ1bmN0aW9uIChkdXJhdGlvbil7XG4gICAgcTMucmVzb2x2ZShkdXJhdGlvbik7XG4gICAgfSk7XG4gICAgcmV0dXJuIHEzLnByb21pc2U7XG4gIH07XG5cbiAgcmV0dXJuIE5ld01lZGlhO1xuXG59XSlcbi5mYWN0b3J5KCckY29yZG92YU1lZGlhJywgWydOZXdNZWRpYScsIGZ1bmN0aW9uIChOZXdNZWRpYSkge1xuICByZXR1cm4ge1xuICAgICAgbmV3TWVkaWE6IGZ1bmN0aW9uIChzcmMpIHtcbiAgICAgICAgICByZXR1cm4gbmV3IE5ld01lZGlhKHNyYyk7XG4gICAgICB9XG4gIH07XG59XSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1tb2Jmb3gtcHJvLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL2Zsb2F0aW5naG90cG90L2NvcmRvdmEtbW9iZm94LXByb1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMubW9iZm94QWRzJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTW9iRm94QWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LnNldE9wdGlvbnMob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZUJhbm5lcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LmNyZWF0ZUJhbm5lcihvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcmVtb3ZlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guc2hvd0Jhbm5lcihwb3NpdGlvbiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXJBdFhZOiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb2JGb3guc2hvd0Jhbm5lckF0WFkoeCwgeSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGVCYW5uZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9iRm94LmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5wcmVwYXJlSW50ZXJzdGl0aWFsKG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93SW50ZXJzdGl0aWFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vYkZveC5zaG93SW50ZXJzdGl0aWFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMnLCBbXG4gICduZ0NvcmRvdmEucGx1Z2lucy5hY3Rpb25TaGVldCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5hZE1vYicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5hcHBBdmFpbGFiaWxpdHknLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYXBwUmF0ZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5hcHBWZXJzaW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJhY2tncm91bmRHZW9sb2NhdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5iYWRnZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5iYXJjb2RlU2Nhbm5lcicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5iYXR0ZXJ5U3RhdHVzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJlYWNvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5ibGUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuYmx1ZXRvb3RoU2VyaWFsJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmJyaWdodG5lc3MnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FsZW5kYXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuY2FtZXJhJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmNhcHR1cmUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuY2xpcGJvYXJkJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmNvbnRhY3RzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmRhdGVQaWNrZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZGV2aWNlJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmRldmljZU1vdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5kZXZpY2VPcmllbnRhdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5kaWFsb2dzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmVtYWlsQ29tcG9zZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmFjZWJvb2snLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmFjZWJvb2tBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5maWxlVHJhbnNmZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmlsZU9wZW5lcjInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZmxhc2hsaWdodCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5mbHVycnlBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2EnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2VvbG9jYXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ2xvYmFsaXphdGlvbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVBZHMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuZ29vZ2xlQW5hbHl0aWNzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmdvb2dsZU1hcCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVQbGF5R2FtZScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5nb29nbGVQbHVzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmhlYWx0aEtpdCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5odHRwZCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5pQWQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaW1hZ2VQaWNrZXInLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuaW5BcHBCcm93c2VyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmluc3RhZ3JhbScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5rZXlib2FyZCcsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5rZXljaGFpbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5sYXVuY2hOYXZpZ2F0b3InLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubG9jYWxOb3RpZmljYXRpb24nLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubWVkaWEnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMubU1lZGlhQWRzJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLm1vYmZveEFkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5tb3B1YkFkcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5uYXRpdmVBdWRpbycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5uZXR3b3JrJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnBpbkRpYWxvZycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5wcmVmZXJlbmNlcycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5wcmludGVyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnByb2dyZXNzSW5kaWNhdG9yJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnB1c2gnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMucHVzaF92NScsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zbXMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc29jaWFsU2hhcmluZycsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zcGlubmVyRGlhbG9nJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnNwbGFzaHNjcmVlbicsXG4gICduZ0NvcmRvdmEucGx1Z2lucy5zcWxpdGUnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuc3RhdHVzYmFyJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnRvYXN0JyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnRvdWNoaWQnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMudmlicmF0aW9uJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLnZpZGVvQ2FwdHVyZVBsdXMnLFxuICAnbmdDb3Jkb3ZhLnBsdWdpbnMuemlwJyxcbiAgJ25nQ29yZG92YS5wbHVnaW5zLmluc29tbmlhJ1xuXSk7XG5cbi8vIGluc3RhbGwgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tbW9wdWIuZ2l0XG4vLyBsaW5rICAgICA6ICAgICBodHRwczovL2dpdGh1Yi5jb20vZmxvYXRpbmdob3Rwb3QvY29yZG92YS1wbHVnaW4tbW9wdWJcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm1vcHViQWRzJywgW10pXG4gIC5mYWN0b3J5KCckY29yZG92YU1vUHViQWRzJywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuc2V0T3B0aW9ucyhvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgY3JlYXRlQmFubmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5jcmVhdGVCYW5uZXIob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUJhbm5lcjogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5yZW1vdmVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYW5uZXI6IGZ1bmN0aW9uIChwb3NpdGlvbikge1xuICAgICAgICB2YXIgZCA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5Nb1B1Yi5zaG93QmFubmVyKHBvc2l0aW9uLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0Jhbm5lckF0WFk6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnNob3dCYW5uZXJBdFhZKHgsIHksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlc29sdmUoKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVqZWN0KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBoaWRlQmFubmVyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLmhpZGVCYW5uZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHByZXBhcmVJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93Lk1vUHViLnByZXBhcmVJbnRlcnN0aXRpYWwob3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGQucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZWplY3QoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dJbnRlcnN0aXRpYWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGQgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuTW9QdWIuc2hvd0ludGVyc3RpdGlhbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgZC5yZXNvbHZlKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBkLnJlamVjdCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9zaWRuZXlzL2NvcmRvdmEtcGx1Z2luLW5hdGl2ZWF1ZGlvLmdpdFxuLy8gbGluayAgICAgIDogaHR0cHM6Ly9naXRodWIuY29tL3NpZG5leXMvY29yZG92YS1wbHVnaW4tbmF0aXZlYXVkaW9cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLm5hdGl2ZUF1ZGlvJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTmF0aXZlQXVkaW8nLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBwcmVsb2FkU2ltcGxlOiBmdW5jdGlvbiAoaWQsIGFzc2V0UGF0aCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5OYXRpdmVBdWRpby5wcmVsb2FkU2ltcGxlKGlkLCBhc3NldFBhdGgsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmVsb2FkQ29tcGxleDogZnVuY3Rpb24gKGlkLCBhc3NldFBhdGgsIHZvbHVtZSwgdm9pY2VzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnByZWxvYWRDb21wbGV4KGlkLCBhc3NldFBhdGgsIHZvbHVtZSwgdm9pY2VzLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgcGxheTogZnVuY3Rpb24gKGlkLCBjb21wbGV0ZUNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnBsYXkoaWQsIGNvbXBsZXRlQ2FsbGJhY2ssIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnIpO1xuICAgICAgICB9LCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzdG9wOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8uc3RvcChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBsb29wOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8ubG9vcChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVubG9hZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLk5hdGl2ZUF1ZGlvLnVubG9hZChpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNldFZvbHVtZUZvckNvbXBsZXhBc3NldDogZnVuY3Rpb24gKGlkLCB2b2x1bWUpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuTmF0aXZlQXVkaW8uc2V0Vm9sdW1lRm9yQ29tcGxleEFzc2V0KGlkLCB2b2x1bWUsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHEucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1uZXR3b3JrLWluZm9ybWF0aW9uXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tbmV0d29yay1pbmZvcm1hdGlvblxuXG4vKiBnbG9iYWxzIENvbm5lY3Rpb246IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5uZXR3b3JrJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhTmV0d29yaycsIFsnJHJvb3RTY29wZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuXG4gICAgLyoqXG4gICAgICAqIEZpcmVzIG9mZmxpbmUgYSBldmVudFxuICAgICAgKi9cbiAgICB2YXIgb2ZmbGluZUV2ZW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG5ldHdvcmtTdGF0ZSA9IG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGU7XG4gICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFOZXR3b3JrOm9mZmxpbmUnLCBuZXR3b3JrU3RhdGUpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAgKiBGaXJlcyBvbmxpbmUgYSBldmVudFxuICAgICAgKi9cbiAgICB2YXIgb25saW5lRXZlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbmV0d29ya1N0YXRlID0gbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZTtcbiAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KCckY29yZG92YU5ldHdvcms6b25saW5lJywgbmV0d29ya1N0YXRlKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChuYXZpZ2F0b3IuY29ubmVjdGlvbikge1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdvZmZsaW5lJywgb2ZmbGluZUV2ZW50LCBmYWxzZSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ29ubGluZScsIG9ubGluZUV2ZW50LCBmYWxzZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0TmV0d29yazogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZTtcbiAgICAgIH0sXG5cbiAgICAgIGlzT25saW5lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBuZXR3b3JrU3RhdGUgPSBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlO1xuICAgICAgICByZXR1cm4gbmV0d29ya1N0YXRlICE9PSBDb25uZWN0aW9uLlVOS05PV04gJiYgbmV0d29ya1N0YXRlICE9PSBDb25uZWN0aW9uLk5PTkU7XG4gICAgICB9LFxuXG4gICAgICBpc09mZmxpbmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG5ldHdvcmtTdGF0ZSA9IG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGU7XG4gICAgICAgIHJldHVybiBuZXR3b3JrU3RhdGUgPT09IENvbm5lY3Rpb24uVU5LTk9XTiB8fCBuZXR3b3JrU3RhdGUgPT09IENvbm5lY3Rpb24uTk9ORTtcbiAgICAgIH0sXG5cbiAgICAgIGNsZWFyT2ZmbGluZVdhdGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCBvZmZsaW5lRXZlbnQpO1xuICAgICAgICAkcm9vdFNjb3BlLiQkbGlzdGVuZXJzWyckY29yZG92YU5ldHdvcms6b2ZmbGluZSddID0gW107XG4gICAgICB9LFxuXG4gICAgICBjbGVhck9ubGluZVdhdGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ29ubGluZScsIG9ubGluZUV2ZW50KTtcbiAgICAgICAgJHJvb3RTY29wZS4kJGxpc3RlbmVyc1snJGNvcmRvdmFOZXR3b3JrOm9ubGluZSddID0gW107XG4gICAgICB9XG4gICAgfTtcbiAgfV0pXG4gIC5ydW4oWyckaW5qZWN0b3InLCBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgJGluamVjdG9yLmdldCgnJGNvcmRvdmFOZXR3b3JrJyk7IC8vZW5zdXJlIHRoZSBmYWN0b3J5IGFsd2F5cyBnZXRzIGluaXRpYWxpc2VkXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL1BhbGRvbS9QaW5EaWFsb2cuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9QYWxkb20vUGluRGlhbG9nXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5waW5EaWFsb2cnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFQaW5EaWFsb2cnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBwcm9tcHQ6IGZ1bmN0aW9uIChtZXNzYWdlLCB0aXRsZSwgYnV0dG9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnBpbkRpYWxvZy5wcm9tcHQobWVzc2FnZSwgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICB9LCB0aXRsZSwgYnV0dG9ucyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGNvcmRvdmEtcGx1Z2luLWFwcC1wcmVmZXJlbmNlc1xuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vYXBsYS9tZS5hcGxhLmNvcmRvdmEuYXBwLXByZWZlcmVuY2VzXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5wcmVmZXJlbmNlcycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVByZWZlcmVuY2VzJywgWyckd2luZG93JywgJyRxJywgZnVuY3Rpb24gKCR3aW5kb3csICRxKSB7XG5cbiAgICAgcmV0dXJuIHtcbiAgICAgICAgIFxuICAgICAgICAgcGx1Z2luTm90RW5hYmxlZE1lc3NhZ2U6ICdQbHVnaW4gbm90IGVuYWJsZWQnLFxuICAgIFx0XG4gICAgXHQvKipcbiAgICBcdCAqIERlY29yYXRlIHRoZSBwcm9taXNlIG9iamVjdC5cbiAgICBcdCAqIEBwYXJhbSBwcm9taXNlIFRoZSBwcm9taXNlIG9iamVjdC5cbiAgICBcdCAqL1xuICAgIFx0ZGVjb3JhdGVQcm9taXNlOiBmdW5jdGlvbihwcm9taXNlKXtcbiAgICBcdFx0cHJvbWlzZS5zdWNjZXNzID0gZnVuY3Rpb24oZm4pIHtcblx0ICAgICAgICAgICAgcHJvbWlzZS50aGVuKGZuKTtcblx0ICAgICAgICAgICAgcmV0dXJuIHByb21pc2U7XG5cdCAgICAgICAgfTtcblxuXHQgICAgICAgIHByb21pc2UuZXJyb3IgPSBmdW5jdGlvbihmbikge1xuXHQgICAgICAgICAgICBwcm9taXNlLnRoZW4obnVsbCwgZm4pO1xuXHQgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcblx0ICAgICAgICB9O1xuICAgIFx0fSxcbiAgICBcdFxuICAgIFx0LyoqXG4gICAgXHQgKiBTdG9yZSB0aGUgdmFsdWUgb2YgdGhlIGdpdmVuIGRpY3Rpb25hcnkgYW5kIGtleS5cbiAgICBcdCAqIEBwYXJhbSBrZXkgVGhlIGtleSBvZiB0aGUgcHJlZmVyZW5jZS5cbiAgICBcdCAqIEBwYXJhbSB2YWx1ZSBUaGUgdmFsdWUgdG8gc2V0LlxuICAgICAgICAgKiBAcGFyYW0gZGljdCBUaGUgZGljdGlvbmFyeS4gSXQncyBvcHRpb25hbC5cbiAgICAgICAgICogQHJldHVybnMgUmV0dXJucyBhIHByb21pc2UuXG4gICAgXHQgKi9cblx0ICAgIHN0b3JlOiBmdW5jdGlvbihrZXksIHZhbHVlLCBkaWN0KSB7XG5cdCAgICBcdHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG5cdCAgICBcdHZhciBwcm9taXNlID0gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gb2sodmFsdWUpe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBlcnJvckNhbGxiYWNrKGVycm9yKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKGVycm9yKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKCR3aW5kb3cucGx1Z2lucyl7XG4gICAgICAgICAgICAgICAgdmFyIHN0b3JlUmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDMpe1xuICAgICAgICAgICAgICAgICAgICBzdG9yZVJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5zdG9yZShkaWN0LCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdG9yZVJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5zdG9yZShrZXksIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgc3RvcmVSZXN1bHQudGhlbihvaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IodGhpcy5wbHVnaW5Ob3RFbmFibGVkTWVzc2FnZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG5cdCAgICBcdHRoaXMuZGVjb3JhdGVQcm9taXNlKHByb21pc2UpO1xuXHQgICAgXHRyZXR1cm4gcHJvbWlzZTtcblx0ICAgIH0sXG5cdCAgICBcblx0ICAgIC8qKlxuXHQgICAgICogRmV0Y2ggdGhlIHZhbHVlIGJ5IHRoZSBnaXZlbiBkaWN0aW9uYXJ5IGFuZCBrZXkuXG5cdCAgICAgKiBAcGFyYW0ga2V5IFRoZSBrZXkgb2YgdGhlIHByZWZlcmVuY2UgdG8gcmV0cmlldmUuXG4gICAgICAgICAqIEBwYXJhbSBkaWN0IFRoZSBkaWN0aW9uYXJ5LiBJdCdzIG9wdGlvbmFsLlxuICAgICAgICAgKiBAcmV0dXJucyBSZXR1cm5zIGEgcHJvbWlzZS5cblx0ICAgICAqL1xuXHQgICAgZmV0Y2g6IGZ1bmN0aW9uKGtleSwgZGljdCkge1xuXHQgICAgXHR2YXIgZGVmZXJyZWQgPSAkcS5kZWZlcigpO1xuXHQgICAgXHR2YXIgcHJvbWlzZSA9IGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZ1bmN0aW9uIG9rKHZhbHVlKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gZXJyb3JDYWxsYmFjayhlcnJvcil7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihlcnJvcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZigkd2luZG93LnBsdWdpbnMpe1xuICAgICAgICAgICAgICAgIHZhciBmZXRjaFJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAyKXtcbiAgICAgICAgICAgICAgICAgICAgZmV0Y2hSZXN1bHQgPSAkd2luZG93LnBsdWdpbnMuYXBwUHJlZmVyZW5jZXMuZmV0Y2goZGljdCwga2V5KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmZXRjaFJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5mZXRjaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmZXRjaFJlc3VsdC50aGVuKG9rLCBlcnJvckNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcih0aGlzLnBsdWdpbk5vdEVuYWJsZWRNZXNzYWdlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcblx0ICAgIFx0dGhpcy5kZWNvcmF0ZVByb21pc2UocHJvbWlzZSk7XG5cdCAgICBcdHJldHVybiBwcm9taXNlO1xuXHQgICAgfSxcbiAgICAgICAgXG4gICAgICAgIC8qKlxuXHQgICAgICogUmVtb3ZlIHRoZSB2YWx1ZSBieSB0aGUgZ2l2ZW4ga2V5LlxuXHQgICAgICogQHBhcmFtIGtleSBUaGUga2V5IG9mIHRoZSBwcmVmZXJlbmNlIHRvIHJldHJpZXZlLlxuICAgICAgICAgKiBAcGFyYW0gZGljdCBUaGUgZGljdGlvbmFyeS4gSXQncyBvcHRpb25hbC5cbiAgICAgICAgICogQHJldHVybnMgUmV0dXJucyBhIHByb21pc2UuXG5cdCAgICAgKi9cblx0ICAgIHJlbW92ZTogZnVuY3Rpb24oa2V5LCBkaWN0KSB7XG5cdCAgICBcdHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG5cdCAgICBcdHZhciBwcm9taXNlID0gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gb2sodmFsdWUpe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBlcnJvckNhbGxiYWNrKGVycm9yKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKGVycm9yKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKCR3aW5kb3cucGx1Z2lucyl7XG4gICAgICAgICAgICAgICAgdmFyIHJlbW92ZVJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAyKXtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVzdWx0ID0gJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLnJlbW92ZShkaWN0LCBrZXkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlc3VsdCA9ICR3aW5kb3cucGx1Z2lucy5hcHBQcmVmZXJlbmNlcy5yZW1vdmUoa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVzdWx0LnRoZW4ob2ssIGVycm9yQ2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKHRoaXMucGx1Z2luTm90RW5hYmxlZE1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH1cblx0ICAgIFx0XG5cdCAgICBcdHRoaXMuZGVjb3JhdGVQcm9taXNlKHByb21pc2UpO1xuXHQgICAgXHRyZXR1cm4gcHJvbWlzZTtcblx0ICAgIH0sXG4gICAgICAgIFxuICAgICAgICAvKipcblx0ICAgICAqIFNob3cgdGhlIGFwcGxpY2F0aW9uIHByZWZlcmVuY2VzLlxuICAgICAgICAgKiBAcmV0dXJucyBSZXR1cm5zIGEgcHJvbWlzZS5cblx0ICAgICAqL1xuXHQgICAgc2hvdzogZnVuY3Rpb24oKSB7XG5cdCAgICBcdHZhciBkZWZlcnJlZCA9ICRxLmRlZmVyKCk7XG5cdCAgICBcdHZhciBwcm9taXNlID0gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnVuY3Rpb24gb2sodmFsdWUpe1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmdW5jdGlvbiBlcnJvckNhbGxiYWNrKGVycm9yKXtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEVycm9yKGVycm9yKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKCR3aW5kb3cucGx1Z2lucyl7XG4gICAgICAgICAgICAgICAgJHdpbmRvdy5wbHVnaW5zLmFwcFByZWZlcmVuY2VzLnNob3coKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihvaywgZXJyb3JDYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IodGhpcy5wbHVnaW5Ob3RFbmFibGVkTWVzc2FnZSkpO1xuICAgICAgICAgICAgfVxuXHQgICAgXHRcblx0ICAgIFx0dGhpcy5kZWNvcmF0ZVByb21pc2UocHJvbWlzZSk7XG5cdCAgICBcdHJldHVybiBwcm9taXNlO1xuXHQgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1wcmludGVyLmdpdFxuLy8gbGluayAgICAgIDogaHR0cHM6Ly9naXRodWIuY29tL2thdHplci9jb3Jkb3ZhLXBsdWdpbi1wcmludGVyXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5wcmludGVyJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUHJpbnRlcicsIFsnJHEnLCAnJHdpbmRvdycsIGZ1bmN0aW9uICgkcSwgJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlzQXZhaWxhYmxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnBsdWdpbi5wcmludGVyLmlzQXZhaWxhYmxlKGZ1bmN0aW9uIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShpc0F2YWlsYWJsZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBwcmludDogZnVuY3Rpb24gKGRvYywgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2luLnByaW50ZXIucHJpbnQoZG9jLCBvcHRpb25zLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3BiZXJuYXNjb25pL2NvcmRvdmEtcHJvZ3Jlc3NJbmRpY2F0b3IuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHA6Ly9wYmVybmFzY29uaS5naXRodWIuaW8vY29yZG92YS1wcm9ncmVzc0luZGljYXRvci9cblxuLyogZ2xvYmFscyBQcm9ncmVzc0luZGljYXRvcjogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnByb2dyZXNzSW5kaWNhdG9yJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUHJvZ3Jlc3MnLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNob3c6IGZ1bmN0aW9uIChfbWVzc2FnZSkge1xuICAgICAgICB2YXIgbWVzc2FnZSA9IF9tZXNzYWdlIHx8ICdQbGVhc2Ugd2FpdC4uLic7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93KG1lc3NhZ2UpO1xuICAgICAgfSxcblxuICAgICAgc2hvd1NpbXBsZTogZnVuY3Rpb24gKF9kaW0pIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93U2ltcGxlKGRpbSk7XG4gICAgICB9LFxuXG4gICAgICBzaG93U2ltcGxlV2l0aExhYmVsOiBmdW5jdGlvbiAoX2RpbSwgX2xhYmVsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ0xvYWRpbmcuLi4nO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1NpbXBsZVdpdGhMYWJlbChkaW0sIGxhYmVsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTaW1wbGVXaXRoTGFiZWxEZXRhaWw6IGZ1bmN0aW9uIChfZGltLCBfbGFiZWwsIF9kZXRhaWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnTG9hZGluZy4uLic7XG4gICAgICAgIHZhciBkZXRhaWwgPSBfZGV0YWlsIHx8ICdQbGVhc2Ugd2FpdCc7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93U2ltcGxlV2l0aExhYmVsRGV0YWlsKGRpbSwgbGFiZWwsIGRldGFpbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93RGV0ZXJtaW5hdGU6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dEZXRlcm1pbmF0ZShkaW0sIHRpbWVvdXQpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0RldGVybWluYXRlV2l0aExhYmVsOiBmdW5jdGlvbiAoX2RpbSwgX3RpbWVvdXQsIF9sYWJlbCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgdmFyIGxhYmVsID0gX2xhYmVsIHx8ICdMb2FkaW5nLi4uJztcblxuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0RldGVybWluYXRlV2l0aExhYmVsKGRpbSwgdGltZW91dCwgbGFiZWwpO1xuICAgICAgfSxcblxuICAgICAgc2hvd0FubnVsYXI6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dBbm51bGFyKGRpbSwgdGltZW91dCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93QW5udWxhcldpdGhMYWJlbDogZnVuY3Rpb24gKF9kaW0sIF90aW1lb3V0LCBfbGFiZWwpIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0aW1lb3V0ID0gX3RpbWVvdXQgfHwgNTAwMDA7XG4gICAgICAgIHZhciBsYWJlbCA9IF9sYWJlbCB8fCAnTG9hZGluZy4uLic7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93QW5udWxhcldpdGhMYWJlbChkaW0sIHRpbWVvdXQsIGxhYmVsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYXI6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCkge1xuICAgICAgICB2YXIgZGltID0gX2RpbSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHRpbWVvdXQgPSBfdGltZW91dCB8fCA1MDAwMDtcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLnNob3dCYXIoZGltLCB0aW1lb3V0KTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dCYXJXaXRoTGFiZWw6IGZ1bmN0aW9uIChfZGltLCBfdGltZW91dCwgX2xhYmVsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgdGltZW91dCA9IF90aW1lb3V0IHx8IDUwMDAwO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ0xvYWRpbmcuLi4nO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd0JhcldpdGhMYWJlbChkaW0sIHRpbWVvdXQsIGxhYmVsKTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTdWNjZXNzOiBmdW5jdGlvbiAoX2RpbSwgX2xhYmVsKSB7XG4gICAgICAgIHZhciBkaW0gPSBfZGltIHx8IGZhbHNlO1xuICAgICAgICB2YXIgbGFiZWwgPSBfbGFiZWwgfHwgJ1N1Y2Nlc3MnO1xuICAgICAgICByZXR1cm4gUHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1N1Y2Nlc3MoZGltLCBsYWJlbCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93VGV4dDogZnVuY3Rpb24gKF9kaW0sIF90ZXh0LCBfcG9zaXRpb24pIHtcbiAgICAgICAgdmFyIGRpbSA9IF9kaW0gfHwgZmFsc2U7XG4gICAgICAgIHZhciB0ZXh0ID0gX3RleHQgfHwgJ1dhcm5pbmcnO1xuICAgICAgICB2YXIgcG9zaXRpb24gPSBfcG9zaXRpb24gfHwgJ2NlbnRlcic7XG4gICAgICAgIHJldHVybiBQcm9ncmVzc0luZGljYXRvci5zaG93VGV4dChkaW0sIHRleHQsIHBvc2l0aW9uKTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFByb2dyZXNzSW5kaWNhdG9yLmhpZGUoKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwLWJ1aWxkL1B1c2hQbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC1idWlsZC9QdXNoUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5wdXNoJywgW10pXG5cbiAgLmZhY3RvcnkoJyRjb3Jkb3ZhUHVzaCcsIFsnJHEnLCAnJHdpbmRvdycsICckcm9vdFNjb3BlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRxLCAkd2luZG93LCAkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG9uTm90aWZpY2F0aW9uOiBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoJyRjb3Jkb3ZhUHVzaDpub3RpZmljYXRpb25SZWNlaXZlZCcsIG5vdGlmaWNhdGlvbik7XG4gICAgICAgIH0pO1xuICAgICAgfSxcblxuICAgICAgcmVnaXN0ZXI6IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB2YXIgaW5qZWN0b3I7XG4gICAgICAgIGlmIChjb25maWcgIT09IHVuZGVmaW5lZCAmJiBjb25maWcuZWNiID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW25nLWFwcF0nKSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgaW5qZWN0b3IgPSAnZG9jdW1lbnQuYm9keSc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaW5qZWN0b3IgPSAnZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcXCdbbmctYXBwXVxcJyknO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25maWcuZWNiID0gJ2FuZ3VsYXIuZWxlbWVudCgnICsgaW5qZWN0b3IgKyAnKS5pbmplY3RvcigpLmdldChcXCckY29yZG92YVB1c2hcXCcpLm9uTm90aWZpY2F0aW9uJztcbiAgICAgICAgfVxuXG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5wdXNoTm90aWZpY2F0aW9uLnJlZ2lzdGVyKGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICAgIHEucmVzb2x2ZSh0b2tlbik7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSwgY29uZmlnKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgdW5yZWdpc3RlcjogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMucHVzaE5vdGlmaWNhdGlvbi51bnJlZ2lzdGVyKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9LCBvcHRpb25zKTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgLy8gaU9TIG9ubHlcbiAgICAgIHNldEJhZGdlTnVtYmVyOiBmdW5jdGlvbiAobnVtYmVyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnB1c2hOb3RpZmljYXRpb24uc2V0QXBwbGljYXRpb25JY29uQmFkZ2VOdW1iZXIoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIG51bWJlcik7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuXG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIHBob25lZ2FwLXBsdWdpbi1wdXNoXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC9waG9uZWdhcC1wbHVnaW4tcHVzaFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMucHVzaF92NScsIFtdKVxuICAuZmFjdG9yeSgnJGNvcmRvdmFQdXNoVjUnLFsnJHEnLCAnJHJvb3RTY29wZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkcSwgJHJvb3RTY29wZSwgJHRpbWVvdXQpIHtcbiAgIC8qZ2xvYmFsIFB1c2hOb3RpZmljYXRpb24qL1xuXG4gICAgdmFyIHB1c2g7XG4gICAgcmV0dXJuIHtcbiAgICAgIGluaXRpYWxpemUgOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHB1c2ggPSBQdXNoTm90aWZpY2F0aW9uLmluaXQob3B0aW9ucyk7XG4gICAgICAgIHEucmVzb2x2ZShwdXNoKTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG4gICAgICBvbk5vdGlmaWNhdGlvbiA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHB1c2gub24oJ25vdGlmaWNhdGlvbicsIGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGVtaXQoJyRjb3Jkb3ZhUHVzaFY1Om5vdGlmaWNhdGlvblJlY2VpdmVkJywgbm90aWZpY2F0aW9uKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgb25FcnJvciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHB1c2gub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycm9yKSB7ICRyb290U2NvcGUuJGVtaXQoJyRjb3Jkb3ZhUHVzaFY1OmVycm9yT2NjdXJyZWQnLCBlcnJvcik7fSk7XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIHJlZ2lzdGVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGlmIChwdXNoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBxLnJlamVjdChuZXcgRXJyb3IoJ2luaXQgbXVzdCBiZSBjYWxsZWQgYmVmb3JlIGFueSBvdGhlciBvcGVyYXRpb24nKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaC5vbigncmVnaXN0cmF0aW9uJywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcbiAgICAgIHVucmVnaXN0ZXIgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgaWYgKHB1c2ggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHEucmVqZWN0KG5ldyBFcnJvcignaW5pdCBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgYW55IG90aGVyIG9wZXJhdGlvbicpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoLnVucmVnaXN0ZXIoZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICB9LGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuICAgICAgc2V0QmFkZ2VOdW1iZXIgOiBmdW5jdGlvbiAobnVtYmVyKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgaWYgKHB1c2ggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHEucmVqZWN0KG5ldyBFcnJvcignaW5pdCBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgYW55IG90aGVyIG9wZXJhdGlvbicpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoLnNldEFwcGxpY2F0aW9uSWNvbkJhZGdlTnVtYmVyKGZ1bmN0aW9uIChzdWNjZXNzKSB7XG4gICAgICAgICAgICBxLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSwgbnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vZ2l0YXdlZ28vY29yZG92YS1zY3JlZW5zaG90LmdpdFxuLy8gbGluayAgICAgIDogICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9naXRhd2Vnby9jb3Jkb3ZhLXNjcmVlbnNob3RcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNjcmVlbnNob3QnLCBbXSlcbi5mYWN0b3J5KCckY29yZG92YVNjcmVlbnNob3QnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG4gIHJldHVybiB7XG4gICAgY2FwdHVyZVRvRmlsZTogZnVuY3Rpb24gKG9wdHMpIHtcblxuICAgICAgdmFyIG9wdGlvbnMgPSBvcHRzIHx8IHt9O1xuXG4gICAgICB2YXIgZXh0ZW5zaW9uID0gb3B0aW9ucy5leHRlbnNpb24gfHwgJ2pwZyc7XG4gICAgICB2YXIgcXVhbGl0eSA9IG9wdGlvbnMucXVhbGl0eSB8fCAnMTAwJztcblxuICAgICAgdmFyIGRlZmVyID0gJHEuZGVmZXIoKTtcblxuICAgICAgaWYgKCFuYXZpZ2F0b3Iuc2NyZWVuc2hvdCkge1xuICAgICAgICBkZWZlci5yZXNvbHZlKG51bGwpO1xuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH1cblxuICAgICAgbmF2aWdhdG9yLnNjcmVlbnNob3Quc2F2ZShmdW5jdGlvbiAoZXJyb3IsIHJlcykge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICBkZWZlci5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzLmZpbGVQYXRoKTtcbiAgICAgICAgfVxuICAgICAgfSwgZXh0ZW5zaW9uLCBxdWFsaXR5LCBvcHRpb25zLmZpbGVuYW1lKTtcblxuICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgfSxcbiAgICBjYXB0dXJlVG9Vcmk6IGZ1bmN0aW9uIChvcHRzKSB7XG5cbiAgICAgIHZhciBvcHRpb25zID0gb3B0cyB8fCB7fTtcblxuICAgICAgdmFyIGV4dGVuc2lvbiA9IG9wdGlvbnMuZXh0ZW5zaW9uIHx8ICdqcGcnO1xuICAgICAgdmFyIHF1YWxpdHkgPSBvcHRpb25zLnF1YWxpdHkgfHwgJzEwMCc7XG5cbiAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCk7XG5cbiAgICAgIGlmICghbmF2aWdhdG9yLnNjcmVlbnNob3QpIHtcbiAgICAgICAgZGVmZXIucmVzb2x2ZShudWxsKTtcbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIG5hdmlnYXRvci5zY3JlZW5zaG90LlVSSShmdW5jdGlvbiAoZXJyb3IsIHJlcykge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICBkZWZlci5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzLlVSSSk7XG4gICAgICAgIH1cbiAgICAgIH0sIGV4dGVuc2lvbiwgcXVhbGl0eSwgb3B0aW9ucy5maWxlbmFtZSk7XG5cbiAgICAgIHJldHVybiBkZWZlci5wcm9taXNlO1xuICAgIH1cbiAgfTtcbn1dKTtcbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9jb3Jkb3ZhLXNtcy9jb3Jkb3ZhLXNtcy1wbHVnaW4uZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9jb3Jkb3ZhLXNtcy9jb3Jkb3ZhLXNtcy1wbHVnaW5cblxuLyogZ2xvYmFscyBzbXM6IHRydWUgKi9cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zbXMnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFTbXMnLCBbJyRxJywgZnVuY3Rpb24gKCRxKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2VuZDogZnVuY3Rpb24gKG51bWJlciwgbWVzc2FnZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHNtcy5zZW5kKG51bWJlciwgbWVzc2FnZSwgb3B0aW9ucywgZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9XG4gICAgfTtcblxuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9Tb2NpYWxTaGFyaW5nLVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL0VkZHlWZXJicnVnZ2VuL1NvY2lhbFNoYXJpbmctUGhvbmVHYXAtUGx1Z2luXG5cbi8vIE5PVEU6IHNoYXJlVmlhRW1haWwgLT4gaWYgdXNlciBjYW5jZWxzIHNoYXJpbmcgZW1haWwsIHN1Y2Nlc3MgaXMgc3RpbGwgY2FsbGVkXG4vLyBUT0RPOiBhZGQgc3VwcG9ydCBmb3IgaVBhZFxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc29jaWFsU2hhcmluZycsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVNvY2lhbFNoYXJpbmcnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzaGFyZTogZnVuY3Rpb24gKG1lc3NhZ2UsIHN1YmplY3QsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBzdWJqZWN0ID0gc3ViamVjdCB8fCBudWxsO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZShtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhVHdpdHRlcjogZnVuY3Rpb24gKG1lc3NhZ2UsIGZpbGUsIGxpbmspIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBmaWxlID0gZmlsZSB8fCBudWxsO1xuICAgICAgICBsaW5rID0gbGluayB8fCBudWxsO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMuc29jaWFsc2hhcmluZy5zaGFyZVZpYVR3aXR0ZXIobWVzc2FnZSwgZmlsZSwgbGluaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYVdoYXRzQXBwOiBmdW5jdGlvbiAobWVzc2FnZSwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhV2hhdHNBcHAobWVzc2FnZSwgZmlsZSwgbGluaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYUZhY2Vib29rOiBmdW5jdGlvbiAobWVzc2FnZSwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG1lc3NhZ2UgPSBtZXNzYWdlIHx8IG51bGw7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhRmFjZWJvb2sobWVzc2FnZSwgZmlsZSwgbGluaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYUZhY2Vib29rV2l0aFBhc3RlTWVzc2FnZUhpbnQ6IGZ1bmN0aW9uIChtZXNzYWdlLCBmaWxlLCBsaW5rLCBwYXN0ZU1lc3NhZ2VIaW50KSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgZmlsZSA9IGZpbGUgfHwgbnVsbDtcbiAgICAgICAgbGluayA9IGxpbmsgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFGYWNlYm9va1dpdGhQYXN0ZU1lc3NhZ2VIaW50KG1lc3NhZ2UsIGZpbGUsIGxpbmssIHBhc3RlTWVzc2FnZUhpbnQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBxLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hhcmVWaWFTTVM6IGZ1bmN0aW9uIChtZXNzYWdlLCBjb21tYVNlcGFyYXRlZFBob25lTnVtYmVycykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhU01TKG1lc3NhZ2UsIGNvbW1hU2VwYXJhdGVkUGhvbmVOdW1iZXJzLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNoYXJlVmlhRW1haWw6IGZ1bmN0aW9uIChtZXNzYWdlLCBzdWJqZWN0LCB0b0FyciwgY2NBcnIsIGJjY0FyciwgZmlsZUFycikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHRvQXJyID0gdG9BcnIgfHwgbnVsbDtcbiAgICAgICAgY2NBcnIgPSBjY0FyciB8fCBudWxsO1xuICAgICAgICBiY2NBcnIgPSBiY2NBcnIgfHwgbnVsbDtcbiAgICAgICAgZmlsZUFyciA9IGZpbGVBcnIgfHwgbnVsbDtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuc2hhcmVWaWFFbWFpbChtZXNzYWdlLCBzdWJqZWN0LCB0b0FyciwgY2NBcnIsIGJjY0FyciwgZmlsZUFyciwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaGFyZVZpYTogZnVuY3Rpb24gKHZpYSwgbWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaykge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIG1lc3NhZ2UgPSBtZXNzYWdlIHx8IG51bGw7XG4gICAgICAgIHN1YmplY3QgPSBzdWJqZWN0IHx8IG51bGw7XG4gICAgICAgIGZpbGUgPSBmaWxlIHx8IG51bGw7XG4gICAgICAgIGxpbmsgPSBsaW5rIHx8IG51bGw7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy5zb2NpYWxzaGFyaW5nLnNoYXJlVmlhKHZpYSwgbWVzc2FnZSwgc3ViamVjdCwgZmlsZSwgbGluaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBjYW5TaGFyZVZpYUVtYWlsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuY2FuU2hhcmVWaWFFbWFpbChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcS5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGNhblNoYXJlVmlhOiBmdW5jdGlvbiAodmlhLCBtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuY2FuU2hhcmVWaWEodmlhLCBtZXNzYWdlLCBzdWJqZWN0LCBmaWxlLCBsaW5rLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGF2YWlsYWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgIHdpbmRvdy5wbHVnaW5zLnNvY2lhbHNoYXJpbmcuYXZhaWxhYmxlKGZ1bmN0aW9uIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgIGlmIChpc0F2YWlsYWJsZSkge1xuICAgICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcS5yZWplY3QoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vUGFsZG9tL1NwaW5uZXJEaWFsb2cuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgICBodHRwczovL2dpdGh1Yi5jb20vUGFsZG9tL1NwaW5uZXJEaWFsb2dcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNwaW5uZXJEaWFsb2cnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFTcGlubmVyRGlhbG9nJywgWyckd2luZG93JywgZnVuY3Rpb24gKCR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBzaG93OiBmdW5jdGlvbiAodGl0bGUsIG1lc3NhZ2UsIGZpeGVkKSB7XG4gICAgICAgIGZpeGVkID0gZml4ZWQgfHwgZmFsc2U7XG4gICAgICAgIHJldHVybiAkd2luZG93LnBsdWdpbnMuc3Bpbm5lckRpYWxvZy5zaG93KHRpdGxlLCBtZXNzYWdlLCBmaXhlZCk7XG4gICAgICB9LFxuICAgICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJHdpbmRvdy5wbHVnaW5zLnNwaW5uZXJEaWFsb2cuaGlkZSgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgfV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBjb3Jkb3ZhLXBsdWdpbi1zcGxhc2hzY3JlZW5cbi8vIGxpbmsgICAgICA6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FwYWNoZS9jb3Jkb3ZhLXBsdWdpbi1zcGxhc2hzY3JlZW5cblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnNwbGFzaHNjcmVlbicsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVNwbGFzaHNjcmVlbicsIFtmdW5jdGlvbiAoKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaGlkZTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLnNwbGFzaHNjcmVlbi5oaWRlKCk7XG4gICAgICB9LFxuXG4gICAgICBzaG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iuc3BsYXNoc2NyZWVuLnNob3coKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2xpdGVoZWxwZXJzL0NvcmRvdmEtc3FsaXRlLXN0b3JhZ2UuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9saXRlaGVscGVycy9Db3Jkb3ZhLXNxbGl0ZS1zdG9yYWdlXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy5zcWxpdGUnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFTUUxpdGUnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICBvcGVuREI6IGZ1bmN0aW9uIChvcHRpb25zLCBiYWNrZ3JvdW5kKSB7XG5cbiAgICAgICAgaWYgKGFuZ3VsYXIuaXNPYmplY3Qob3B0aW9ucykgJiYgIWFuZ3VsYXIuaXNTdHJpbmcob3B0aW9ucykpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGJhY2tncm91bmQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBvcHRpb25zLmJnVHlwZSA9IGJhY2tncm91bmQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiAkd2luZG93LnNxbGl0ZVBsdWdpbi5vcGVuRGF0YWJhc2Uob3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gJHdpbmRvdy5zcWxpdGVQbHVnaW4ub3BlbkRhdGFiYXNlKHtcbiAgICAgICAgICBuYW1lOiBvcHRpb25zLFxuICAgICAgICAgIGJnVHlwZTogYmFja2dyb3VuZFxuICAgICAgICB9KTtcbiAgICAgIH0sXG5cbiAgICAgIGV4ZWN1dGU6IGZ1bmN0aW9uIChkYiwgcXVlcnksIGJpbmRpbmcpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICBkYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodHgpIHtcbiAgICAgICAgICB0eC5leGVjdXRlU3FsKHF1ZXJ5LCBiaW5kaW5nLCBmdW5jdGlvbiAodHgsIHJlc3VsdCkge1xuICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAodHJhbnNhY3Rpb24sIGVycm9yKSB7XG4gICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGluc2VydENvbGxlY3Rpb246IGZ1bmN0aW9uIChkYiwgcXVlcnksIGJpbmRpbmdzKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgdmFyIGNvbGwgPSBiaW5kaW5ncy5zbGljZSgwKTsgLy8gY2xvbmUgY29sbGVjdGlvblxuXG4gICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0eCkge1xuICAgICAgICAgIChmdW5jdGlvbiBpbnNlcnRPbmUoKSB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkID0gY29sbC5zcGxpY2UoMCwgMSlbMF07IC8vIGdldCB0aGUgZmlyc3QgcmVjb3JkIG9mIGNvbGwgYW5kIHJlZHVjZSBjb2xsIGJ5IG9uZVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgdHguZXhlY3V0ZVNxbChxdWVyeSwgcmVjb3JkLCBmdW5jdGlvbiAodHgsIHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIGlmIChjb2xsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgcS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGluc2VydE9uZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKHRyYW5zYWN0aW9uLCBlcnJvcikge1xuICAgICAgICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICAgIHEucmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBuZXN0ZWRFeGVjdXRlOiBmdW5jdGlvbiAoZGIsIHF1ZXJ5MSwgcXVlcnkyLCBiaW5kaW5nMSwgYmluZGluZzIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0eCkge1xuICAgICAgICAgICAgdHguZXhlY3V0ZVNxbChxdWVyeTEsIGJpbmRpbmcxLCBmdW5jdGlvbiAodHgsIHJlc3VsdCkge1xuICAgICAgICAgICAgICBxLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgdHguZXhlY3V0ZVNxbChxdWVyeTIsIGJpbmRpbmcyLCBmdW5jdGlvbiAodHgsIHJlcykge1xuICAgICAgICAgICAgICAgIHEucmVzb2x2ZShyZXMpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24gKHRyYW5zYWN0aW9uLCBlcnJvcikge1xuICAgICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBkZWxldGVEQjogZnVuY3Rpb24gKGRiTmFtZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG5cbiAgICAgICAgJHdpbmRvdy5zcWxpdGVQbHVnaW4uZGVsZXRlRGF0YWJhc2UoZGJOYW1lLCBmdW5jdGlvbiAoc3VjY2Vzcykge1xuICAgICAgICAgIHEucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tc3RhdHVzYmFyXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tc3RhdHVzYmFyXG5cbi8qIGdsb2JhbHMgU3RhdHVzQmFyOiB0cnVlICovXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMuc3RhdHVzYmFyJywgW10pXG5cbi5mYWN0b3J5KCckY29yZG92YVN0YXR1c2JhcicsIFtmdW5jdGlvbiAoKSB7XG5cbiAgcmV0dXJuIHtcblxuICAgIC8qKlxuICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGJvb2xcbiAgICAgICovXG4gICAgb3ZlcmxheXNXZWJWaWV3OiBmdW5jdGlvbiAoYm9vbCkge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5vdmVybGF5c1dlYlZpZXcoISFib29sKTtcbiAgICB9LFxuXG4gICAgU1RZTEVTOiB7XG4gICAgICBERUZBVUxUOiAwLFxuICAgICAgTElHSFRfQ09OVEVOVDogMSxcbiAgICAgIEJMQUNLX1RSQU5TTFVDRU5UOiAyLFxuICAgICAgQkxBQ0tfT1BBUVVFOiAzXG4gICAgfSxcblxuICAgIC8qKlxuICAgICAgKiBAcGFyYW0ge251bWJlcn0gc3R5bGVcbiAgICAgICovXG4gICAgc3R5bGU6IGZ1bmN0aW9uIChzdHlsZSkge1xuICAgICAgc3dpdGNoIChzdHlsZSkge1xuICAgICAgICAvLyBEZWZhdWx0XG4gICAgICAgIGNhc2UgMDpcbiAgICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zdHlsZURlZmF1bHQoKTtcblxuICAgICAgICAvLyBMaWdodENvbnRlbnRcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICByZXR1cm4gU3RhdHVzQmFyLnN0eWxlTGlnaHRDb250ZW50KCk7XG5cbiAgICAgICAgLy8gQmxhY2tUcmFuc2x1Y2VudFxuICAgICAgICBjYXNlIDI6XG4gICAgICAgIHJldHVybiBTdGF0dXNCYXIuc3R5bGVCbGFja1RyYW5zbHVjZW50KCk7XG5cbiAgICAgICAgLy8gQmxhY2tPcGFxdWVcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICByZXR1cm4gU3RhdHVzQmFyLnN0eWxlQmxhY2tPcGFxdWUoKTtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gU3RhdHVzQmFyLnN0eWxlRGVmYXVsdCgpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBzdXBwb3J0ZWQgbmFtZXM6XG4gICAgLy8gYmxhY2ssIGRhcmtHcmF5LCBsaWdodEdyYXksIHdoaXRlLCBncmF5LCByZWQsIGdyZWVuLFxuICAgIC8vIGJsdWUsIGN5YW4sIHllbGxvdywgbWFnZW50YSwgb3JhbmdlLCBwdXJwbGUsIGJyb3duXG4gICAgc3R5bGVDb2xvcjogZnVuY3Rpb24gKGNvbG9yKSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLmJhY2tncm91bmRDb2xvckJ5TmFtZShjb2xvcik7XG4gICAgfSxcblxuICAgIHN0eWxlSGV4OiBmdW5jdGlvbiAoY29sb3JIZXgpIHtcbiAgICAgIHJldHVybiBTdGF0dXNCYXIuYmFja2dyb3VuZENvbG9yQnlIZXhTdHJpbmcoY29sb3JIZXgpO1xuICAgIH0sXG5cbiAgICBoaWRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gU3RhdHVzQmFyLmhpZGUoKTtcbiAgICB9LFxuXG4gICAgc2hvdzogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5zaG93KCk7XG4gICAgfSxcblxuICAgIGlzVmlzaWJsZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFN0YXR1c0Jhci5pc1Zpc2libGU7XG4gICAgfVxuICB9O1xufV0pO1xuXG4vLyBpbnN0YWxsICAgOiAgICAgIGNvcmRvdmEgcGx1Z2luIGFkZCBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vVG9hc3QtUGhvbmVHYXAtUGx1Z2luLmdpdFxuLy8gbGluayAgICAgIDogICAgICBodHRwczovL2dpdGh1Yi5jb20vRWRkeVZlcmJydWdnZW4vVG9hc3QtUGhvbmVHYXAtUGx1Z2luXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy50b2FzdCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckY29yZG92YVRvYXN0JywgWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hvd1Nob3J0VG9wOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93U2hvcnRUb3AobWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dTaG9ydENlbnRlcjogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd1Nob3J0Q2VudGVyKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93U2hvcnRCb3R0b206IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dTaG9ydEJvdHRvbShtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvd0xvbmdUb3A6IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wbHVnaW5zLnRvYXN0LnNob3dMb25nVG9wKG1lc3NhZ2UsIGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgIHEucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgIHEucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICBzaG93TG9uZ0NlbnRlcjogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnBsdWdpbnMudG9hc3Quc2hvd0xvbmdDZW50ZXIobWVzc2FnZSwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHNob3dMb25nQm90dG9tOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93TG9uZ0JvdHRvbShtZXNzYWdlLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICBxLnJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfSxcblxuICAgICAgc2hvdzogZnVuY3Rpb24gKG1lc3NhZ2UsIGR1cmF0aW9uLCBwb3NpdGlvbikge1xuICAgICAgICB2YXIgcSA9ICRxLmRlZmVyKCk7XG4gICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5zaG93KG1lc3NhZ2UsIGR1cmF0aW9uLCBwb3NpdGlvbiwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgcS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGhpZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICR3aW5kb3cucGx1Z2lucy50b2FzdC5oaWRlKCk7XG4gICAgICAgICAgcS5yZXNvbHZlKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgcS5yZWplY3QoZXJyb3IgJiYgZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL2xlZWNyb3NzbGV5L2NvcmRvdmEtcGx1Z2luLXRvdWNoaWQuZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9sZWVjcm9zc2xleS9jb3Jkb3ZhLXBsdWdpbi10b3VjaGlkXG5cbi8qIGdsb2JhbHMgdG91Y2hpZDogdHJ1ZSAqL1xuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnRvdWNoaWQnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFUb3VjaElEJywgWyckcScsIGZ1bmN0aW9uICgkcSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNoZWNrU3VwcG9ydDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGVmZXIgPSAkcS5kZWZlcigpO1xuICAgICAgICBpZiAoIXdpbmRvdy5jb3Jkb3ZhKSB7XG4gICAgICAgICAgZGVmZXIucmVqZWN0KCdOb3Qgc3VwcG9ydGVkIHdpdGhvdXQgY29yZG92YS5qcycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRvdWNoaWQuY2hlY2tTdXBwb3J0KGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXIucmVqZWN0KGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIGF1dGhlbnRpY2F0ZTogZnVuY3Rpb24gKGF1dGhSZWFzb25UZXh0KSB7XG4gICAgICAgIHZhciBkZWZlciA9ICRxLmRlZmVyKCk7XG4gICAgICAgIGlmICghd2luZG93LmNvcmRvdmEpIHtcbiAgICAgICAgICBkZWZlci5yZWplY3QoJ05vdCBzdXBwb3J0ZWQgd2l0aG91dCBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdG91Y2hpZC5hdXRoZW50aWNhdGUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBkZWZlci5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9LCBhdXRoUmVhc29uVGV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbi8vIGluc3RhbGwgICA6ICAgICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9hZXJvZ2Vhci9hZXJvZ2Vhci1jb3Jkb3ZhLXB1c2guZ2l0XG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hZXJvZ2Vhci9hZXJvZ2Vhci1jb3Jkb3ZhLXB1c2hcblxuYW5ndWxhci5tb2R1bGUoJ25nQ29yZG92YS5wbHVnaW5zLnVwc1B1c2gnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFVcHNQdXNoJywgWyckcScsICckd2luZG93JywgJyRyb290U2NvcGUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3csICRyb290U2NvcGUsICR0aW1lb3V0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlZ2lzdGVyOiBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcblxuICAgICAgICAkd2luZG93LnB1c2gucmVnaXN0ZXIoZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdCgnJGNvcmRvdmFVcHNQdXNoOm5vdGlmaWNhdGlvblJlY2VpdmVkJywgbm90aWZpY2F0aW9uKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIGNvbmZpZyk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH0sXG5cbiAgICAgIHVucmVnaXN0ZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBxID0gJHEuZGVmZXIoKTtcbiAgICAgICAgJHdpbmRvdy5wdXNoLnVucmVnaXN0ZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICBxLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgIHJldHVybiBxLnByb21pc2U7XG4gICAgICB9LFxuXG4gICAgICAvLyBpT1Mgb25seVxuICAgICAgc2V0QmFkZ2VOdW1iZXI6IGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuICAgICAgICAkd2luZG93LnB1c2guc2V0QXBwbGljYXRpb25JY29uQmFkZ2VOdW1iZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICB9LCBudW1iZXIpO1xuICAgICAgICByZXR1cm4gcS5wcm9taXNlO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgY29yZG92YS1wbHVnaW4tdmlicmF0aW9uXG4vLyBsaW5rICAgICAgOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hcGFjaGUvY29yZG92YS1wbHVnaW4tdmlicmF0aW9uXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy52aWJyYXRpb24nLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFWaWJyYXRpb24nLCBbZnVuY3Rpb24gKCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpYnJhdGU6IGZ1bmN0aW9uICh0aW1lcykge1xuICAgICAgICByZXR1cm4gbmF2aWdhdG9yLm5vdGlmaWNhdGlvbi52aWJyYXRlKHRpbWVzKTtcbiAgICAgIH0sXG4gICAgICB2aWJyYXRlV2l0aFBhdHRlcm46IGZ1bmN0aW9uIChwYXR0ZXJuLCByZXBlYXQpIHtcbiAgICAgICAgcmV0dXJuIG5hdmlnYXRvci5ub3RpZmljYXRpb24udmlicmF0ZVdpdGhQYXR0ZXJuKHBhdHRlcm4sIHJlcGVhdCk7XG4gICAgICB9LFxuICAgICAgY2FuY2VsVmlicmF0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuYXZpZ2F0b3Iubm90aWZpY2F0aW9uLmNhbmNlbFZpYnJhdGlvbigpO1xuICAgICAgfVxuICAgIH07XG4gIH1dKTtcblxuLy8gaW5zdGFsbCAgIDogICAgY29yZG92YSBwbHVnaW4gYWRkIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9WaWRlb0NhcHR1cmVQbHVzLVBob25lR2FwLVBsdWdpbi5naXRcbi8vIGxpbmsgICAgICA6ICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9FZGR5VmVyYnJ1Z2dlbi9WaWRlb0NhcHR1cmVQbHVzLVBob25lR2FwLVBsdWdpblxuXG5hbmd1bGFyLm1vZHVsZSgnbmdDb3Jkb3ZhLnBsdWdpbnMudmlkZW9DYXB0dXJlUGx1cycsIFtdKVxuXG4gIC5wcm92aWRlcignJGNvcmRvdmFWaWRlb0NhcHR1cmVQbHVzJywgW2Z1bmN0aW9uICgpIHtcblxuICAgIHZhciBkZWZhdWx0T3B0aW9ucyA9IHt9O1xuXG5cbiAgICAvKipcbiAgICAgKiB0aGUgbnIgb2YgdmlkZW9zIHRvIHJlY29yZCwgZGVmYXVsdCAxIChvbiBpT1MgYWx3YXlzIDEpXG4gICAgICpcbiAgICAgKiBAcGFyYW0gbGltaXRcbiAgICAgKi9cbiAgICB0aGlzLnNldExpbWl0ID0gZnVuY3Rpb24gc2V0TGltaXQobGltaXQpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogbWF4IGR1cmF0aW9uIGluIHNlY29uZHMsIGRlZmF1bHQgMCwgd2hpY2ggaXMgJ2ZvcmV2ZXInXG4gICAgICpcbiAgICAgKiBAcGFyYW0gc2Vjb25kc1xuICAgICAqL1xuICAgIHRoaXMuc2V0TWF4RHVyYXRpb24gPSBmdW5jdGlvbiBzZXRNYXhEdXJhdGlvbihzZWNvbmRzKSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5kdXJhdGlvbiA9IHNlY29uZHM7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogc2V0IHRvIHRydWUgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgbG93IHF1YWxpdHkgc2V0dGluZ1xuICAgICAqXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBoaWdocXVhbGl0eVxuICAgICAqL1xuICAgIHRoaXMuc2V0SGlnaFF1YWxpdHkgPSBmdW5jdGlvbiBzZXRIaWdoUXVhbGl0eShoaWdocXVhbGl0eSkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMuaGlnaHF1YWxpdHkgPSBoaWdocXVhbGl0eTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogeW91J2xsIHdhbnQgdG8gc25pZmYgdGhlIHVzZXItQWdlbnQvZGV2aWNlIGFuZCBwYXNzIHRoZSBiZXN0IG92ZXJsYXkgYmFzZWQgb24gdGhhdC4uXG4gICAgICogc2V0IHRvIHRydWUgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgYmFja2ZhY2luZyBjYW1lcmEgc2V0dGluZy4gaU9TOiB3b3JrcyBmaW5lLCBBbmRyb2lkOiBZTU1WICgjMTgpXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZyb250Y2FtZXJhXG4gICAgICovXG4gICAgdGhpcy51c2VGcm9udENhbWVyYSA9IGZ1bmN0aW9uIHVzZUZyb250Q2FtZXJhKGZyb250Y2FtZXJhKSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5mcm9udGNhbWVyYSA9IGZyb250Y2FtZXJhO1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqIHB1dCB0aGUgcG5nIGluIHlvdXIgd3d3IGZvbGRlclxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGltYWdlVXJsXG4gICAgICovXG4gICAgdGhpcy5zZXRQb3J0cmFpdE92ZXJsYXkgPSBmdW5jdGlvbiBzZXRQb3J0cmFpdE92ZXJsYXkoaW1hZ2VVcmwpIHtcbiAgICAgIGRlZmF1bHRPcHRpb25zLnBvcnRyYWl0T3ZlcmxheSA9IGltYWdlVXJsO1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGltYWdlVXJsXG4gICAgICovXG4gICAgdGhpcy5zZXRMYW5kc2NhcGVPdmVybGF5ID0gZnVuY3Rpb24gc2V0TGFuZHNjYXBlT3ZlcmxheShpbWFnZVVybCkge1xuICAgICAgZGVmYXVsdE9wdGlvbnMubGFuZHNjYXBlT3ZlcmxheSA9IGltYWdlVXJsO1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqIGlPUyBvbmx5XG4gICAgICpcbiAgICAgKiBAcGFyYW0gdGV4dFxuICAgICAqL1xuICAgIHRoaXMuc2V0T3ZlcmxheVRleHQgPSBmdW5jdGlvbiBzZXRPdmVybGF5VGV4dCh0ZXh0KSB7XG4gICAgICBkZWZhdWx0T3B0aW9ucy5vdmVybGF5VGV4dCA9IHRleHQ7XG4gICAgfTtcblxuXG4gICAgdGhpcy4kZ2V0ID0gWyckcScsICckd2luZG93JywgZnVuY3Rpb24gKCRxLCAkd2luZG93KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjYXB0dXJlVmlkZW86IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICAgaWYgKCEkd2luZG93LnBsdWdpbnMudmlkZW9jYXB0dXJlcGx1cykge1xuICAgICAgICAgICAgcS5yZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAkd2luZG93LnBsdWdpbnMudmlkZW9jYXB0dXJlcGx1cy5jYXB0dXJlVmlkZW8ocS5yZXNvbHZlLCBxLnJlamVjdCxcbiAgICAgICAgICAgIGFuZ3VsYXIuZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0aW9ucykpO1xuXG4gICAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pO1xuXG4vLyBpbnN0YWxsICA6ICAgICBjb3Jkb3ZhIHBsdWdpbiBhZGQgaHR0cHM6Ly9naXRodWIuY29tL01vYmlsZUNocm9tZUFwcHMvemlwLmdpdFxuLy8gbGluayAgICAgOiAgICAgaHR0cHM6Ly9naXRodWIuY29tL01vYmlsZUNocm9tZUFwcHMvemlwXG5cbmFuZ3VsYXIubW9kdWxlKCduZ0NvcmRvdmEucGx1Z2lucy56aXAnLCBbXSlcblxuICAuZmFjdG9yeSgnJGNvcmRvdmFaaXAnLCBbJyRxJywgJyR3aW5kb3cnLCBmdW5jdGlvbiAoJHEsICR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG4gICAgICB1bnppcDogZnVuY3Rpb24gKHNvdXJjZSwgZGVzdGluYXRpb24pIHtcbiAgICAgICAgdmFyIHEgPSAkcS5kZWZlcigpO1xuXG4gICAgICAgICR3aW5kb3cuemlwLnVuemlwKHNvdXJjZSwgZGVzdGluYXRpb24sIGZ1bmN0aW9uIChpc0Vycm9yKSB7XG4gICAgICAgICAgaWYgKGlzRXJyb3IgPT09IDApIHtcbiAgICAgICAgICAgIHEucmVzb2x2ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxLnJlamVjdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgZnVuY3Rpb24gKHByb2dyZXNzRXZlbnQpIHtcbiAgICAgICAgICBxLm5vdGlmeShwcm9ncmVzc0V2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHEucHJvbWlzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG5cbn0pKCk7Il19
