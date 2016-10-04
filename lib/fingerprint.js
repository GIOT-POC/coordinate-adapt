var util = require('util');
var elasticsearch = require('elasticsearch');
var trilateration = require('./trilateration');
var dbClient;
var dbIndex;
var tolerance = 3;

function setupDB(client, index) {
    dbClient = client;
    dbIndex = index;
}

function find(tbID, dataArray, callback) {
    var type = tbID? tbID: 'gps-history';
    var chaValue = countCharacteristicValue(dataArray);

    // Generate filters
    var filters = [ { term: { characteristic: chaValue }}];

    for (var idx in dataArray) {
        var gwID = dataArray[idx].GWID.toLowerCase();
        var signal = dataArray[idx].signal;
        var range = {};
        range['signal_' + idx] = { gte: signal - tolerance, lte: signal + tolerance };

        var rule = { range: range};

        filters.push(rule);
    }

    // Search target
    dbClient.search({
        index: dbIndex,
        type: type,
        body: {
            query: {
                filtered: {
                    query: {
                        match_all: {}
                    },
                    filter: {
                        bool: {
                            must: filters
                        }
                    }
                }
            }
        }
    }).then(function (resp) {
        var hits = resp.hits.hits;

        if (hits.length == 0) {
            return callback(new Error('No similar fingerprint !'));
        }
        else if (hits.length == 1) {
            return callback(null, {GPS_E: hits[0]._source.GPS_E, GPS_N: hits[0]._source.GPS_N});
        }

        // Find best result
        var diffVal = -1;
        var resIdx = 0;
        var sigArray = dataArray.map(function(item) {
            return item.signal;
        });

        for (var idx in hits) {
            var doc = hits[idx]._source;

            var refArray = [];

            for (var i in dataArray) {
                refArray.push(doc['signal_' + i]);
            }

            var tmpDiff = countDifferentValue(refArray, sigArray);

            if (diffVal == -1 || tmpDiff < diffVal) {
                diffVal = tmpDiff;
                resIdx = idx;
            }
        }

        return callback(null, {GPS_E: hits[resIdx]._source.GPS_E, GPS_N: hits[resIdx]._source.GPS_N});
    }, function (err) {
        return callback(err);
    });
}

function record(tbID, position, sigDataArray, callback) {
    var docID = position.GPS_N + '-' + position.GPS_E;

    // Find existing data
    dbClient.get({
        index: dbIndex,
        type: tbID,
        id: docID
    }, function (err, res) {
        if (err && err.status != 404) {
            return callback(err);
        }

        // Set data update timestamp
        var updateTime = sigDataArray[sigDataArray.length - 1].time;

        // Generate document
        var chaValue = countCharacteristicValue(sigDataArray);
        var doc = {
            characteristic: chaValue,
            GPS_N: position.GPS_N,
            GPS_E: position.GPS_E,
            time: updateTime
        }

        // Check valid existing data
        var extData = null;

        if (res && res.found) {
            extData = res._source;
        }

        if (extData && extData.time && (updateTime - extData.time < 30000) && extData.characteristic == chaValue) {
            if (updateTime < extData.time) {
                return callback(new Error('Invalid fingerprint data !'));
            }

            var count = extData.avgCount;

            for (var idx in sigDataArray) {
                var avgVal = (sigDataArray[idx].signal * 1.0 + extData['signal_' + idx] * count) / (count + 1);
                doc['signal_' + idx] = Math.round(avgVal);
            }

            doc.avgCount = count + 1;
        } else {
            for (var idx in sigDataArray) {
                doc['signal_' + idx] = sigDataArray[idx].signal;
            }

            doc.avgCount = 1;
        }

        // Index document
        dbClient.index({
            index: dbIndex,
            type: tbID,
            id: docID,
            body: doc
        }, function (err, res) {
            if (err) {
                return callback(err);
            }

            var result = {created: res.created};
            callback(null, result);
        });
    });
}

function countCharacteristicValue(dataArray) {
    var value = '';

    for (var idx in dataArray) {
        if (idx > 0) {
            value += '_';
        }

        value += dataArray[idx].GWID.toLowerCase();
    }

    return value;
}

function countDifferentValue(refArray, dataArray) {
    var value = 0;

    for (var idx in refArray) {
        var refVal = refArray[idx];
        var dataVal = dataArray[idx];

        if (refVal != dataVal) {
            var refDist = trilateration.countDistanceByRSSI(refVal);
            var dataDist = trilateration.countDistanceByRSSI(dataVal);
            value += Math.abs(refDist - dataDist);
        }
    }

    return value;
}

exports.setupDB = setupDB;
exports.find = find;
exports.record = record;
