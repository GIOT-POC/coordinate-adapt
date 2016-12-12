// Log level: 0 Debug, 1 Info, 2 Warn, 3 Error, 4 Fatal
var logLevel = 3;

// Time duration for data collecting
var dataCollectionTime = 1000;

// Minimum number of signal data for location fingerprint
var minLFSignalNum = 3;

// Time duation for keeping continuous data
var dataQueueTimeout = 60000;

// Minimum number of data for record task
var minRecordDataNum = 5;

exports.logLevel = logLevel;
exports.dataCollectionTime = dataCollectionTime;
exports.minLFSignalNum = minLFSignalNum;
exports.dataQueueTimeout = dataQueueTimeout;
exports.minRecordDataNum = minRecordDataNum;
