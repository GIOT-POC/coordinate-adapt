//Log level: 0 Debug, 1 Info, 2 Warn, 3 Error, 4 Fatal
var logLevel = 3;

//Time duration for data collecting
var dataCollectionTime = 90000;

//Minumum number of signal data for location fingerprint
var minLFSignalNum = 2;

exports.logLevel = logLevel;
exports.dataCollectionTime = dataCollectionTime;
exports.minLFSignalNum = minLFSignalNum;
