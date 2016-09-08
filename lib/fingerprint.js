var util = require('util');
var elasticsearch = require('elasticsearch');
var trilateration = require('./trilateration');
var client;
var dbIndex;
var tolerance = 1;

function setupDB(url, index) {
    client = new elasticsearch.Client({
        host: url
    });

    dbIndex = index;

    client.ping({
        requestTimeout: 3000,
        hello: 'elasticsearch!'
    }, function (error) {
        if (error) {
            console.log('Elasticsearch cluster is down !');
            return;
        }

        console.log('Elasticsearch cluster is OK !');

        // Create mapping
//        var mapping = {
//            'gps-history': {
//                properties: {
//                }
//            }
//        }
//
//        client.indices.putMapping({
//            index: dbIndex,
//            type: 'gps-history',
//            body: mapping
//        }, function(err, res) {
//            if (err) {
//                console.log(err);
//                return;
//            }
//        });
    });
}

function find(dataArray, callback) {
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
    client.search({
        index: dbIndex,
        type: 'gps-history',
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
            var refArray = dataArray.map(function(item) {
                return doc['signal_' + idx];
            });

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

function record(position, sigDataArray, callback) {
    // Generate document
    var docID = position.GPS_N + '-' + position.GPS_E;
    var chaValue = countCharacteristicValue(sigDataArray);
    var doc = {
        characteristic: chaValue,
        GPS_N: position.GPS_N,
        GPS_E: position.GPS_E
    }

    for (var idx in sigDataArray) {
        doc['signal_' + idx] = sigDataArray[idx].signal;
    }

    // Index document
    client.index({
        index: dbIndex,
        type: 'gps-history',
        id: docID,
        body: doc
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        var result = {created: res.created};
        callback(null, result);
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
            var refDist = trilateration.countDistanceBySignal(refVal);
            var dataDist = trilateration.countDistanceBySignal(dataVal);
            value += Math.abs(refDist - dataDist);
        }
    }

    return value;
}

exports.setupDB = setupDB;
exports.find = find;
exports.record = record;