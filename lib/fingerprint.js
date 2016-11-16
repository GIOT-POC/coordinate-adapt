var util = require('util');
var elasticsearch = require('elasticsearch');
var trilateration = require('./trilateration');
var config = require('../config');

var dbClient;
var dbIndex;

function setupDB(client, index) {
    dbClient = client;
    dbIndex = index;
}

function find(tbID, tolerance, dataArray, callback) {
    var type = tbID? tbID: 'gps-history';

    // Generate task array
    var combinations = [];
    var combNum = [];

    for (var len = dataArray.length; len >= config.minLFSignalNum; len--) {
        var combArray = selectFromArray(dataArray, len);
        combNum.push(combArray.length);
        combinations = combinations.concat(combArray);
    }

    // Run query task
    var results = [];
    var tmpResults = {};
    var taskNum = combinations.length;

    combinations.forEach(function(array) {
        var chaValue = countCharacteristicValue(array);

        // Generate filters
        var filters = [ { term: { characteristic: chaValue }}];

        for (var idx in array) {
            var signal = array[idx].signal;
            var range = {};
            range['signal_' + idx] = { gte: signal - tolerance, lte: signal + tolerance };
            filters.push({ range: range });
        }

        // Search target
        dbClient.search({
            index: dbIndex,
            type: type,
            size: 10000,
            body: {
                query: {
                    filtered: {
                        filter: {
                            bool: {
                                must: filters
                            }
                        }
                    }
                }
            }
        }, function(err, res) {
            if (!err) {
                var hits = res.hits.hits;

                // Get position information
                if (hits.length != 0) {
                    var sigArray = array.map(function(item) {
                        return item.signal;
                    });

                    var maxDiff = Math.sqrt(sigArray.length * Math.pow(tolerance, 2), 2);

                    for (var hIdx in hits) {
                        var src = hits[hIdx]._source;
                        var refArray = [];

                        for (var rIdx in array) {
                            refArray.push(src['signal_' + rIdx]);
                        }

                        var diffVal = countDifferentValue(sigArray, refArray);
                        var point = array.length + (1 - parseFloat(diffVal) / maxDiff);
                        var key = src.GPS_N + '-' + src.GPS_E;

                        if (!tmpResults[key]) {
                            tmpResults[key] = point;
                        } else if (point > tmpResults[key]) {
                            tmpResults[key] = point;
                        }

                        var posInfo = {GPS_N: src.GPS_N, GPS_E: src.GPS_E, point: tmpResults[key] };

                        if (results.length == 0) {
                            results.push(posInfo);
                        } else {
                            var curRes = results[0];

                            if (posInfo.point > curRes.point) {
                                results = [posInfo];
                            } else if (posInfo.point == curRes.point) {
                                var keyArray = results.map(function(item) {
                                    return item.GPS_N + '-' + item.GPS_E;
                                });

                                if (keyArray.indexOf(key) == -1) {
                                    results.push(posInfo);
                                }
                            }
                        }
                    }
                }
            }

            taskNum--;

            // Choose final result
            if (taskNum == 0) {
                if (results.length == 0) {
                    return callback(new Error('No similar fingerprint !'));
                }

                var resIdx = Math.floor(Math.random() * results.length);
                callback(null, {GPS_N: results[resIdx].GPS_N, GPS_E: results[resIdx].GPS_E});
            }
        });
    });
}

function record(tbID, position, tolerance, sigDataArray, callback) {
    // Generate task array
    var combinations = [];

    for (var len = sigDataArray.length; len >= config.minLFSignalNum; len--) {
        combinations = combinations.concat(selectFromArray(sigDataArray, len));
    }

    // Run record task
    var taskNum = combinations.length;

    combinations.forEach(function(combDataArray) {
        // Generate filters
        var charVal = countCharacteristicValue(combDataArray)
        var filters = [ { term: { characteristic: charVal }}, { term: { GPS_N: position.GPS_N }},
            { term: { GPS_E: position.GPS_E }}];

        for (var cIdx in combDataArray) {
            var signal = combDataArray[cIdx].signal;
            var range = {};
            range['signal_' + cIdx] = { gte: signal - tolerance / 2, lte: signal + tolerance / 2 };
            filters.push({ range: range });
        }

        // Find existing data
        dbClient.search({
            index: dbIndex,
            type: tbID,
            size: 10000,
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
        }, function (err, res) {
            var docID = null;
            var body = {};
            var sigDiff = 0;

            // Set data update timestamp
            var updateTime = combDataArray[combDataArray.length - 1].time;

            // Update existing document
            if (res && res.hits.hits.length > 0) {
                var hits = res.hits.hits;
                var sigArray = combDataArray.map(function(item) {
                    return item.signal;
                });

                if (hits.length == 1) {
                    body = res.hits.hits[0]._source;
                    docID = res.hits.hits[0]._id;

                    // Count different value
                    var refArray = [];

                    for (var sIdx in sigArray) {
                        refArray.push(body['signal_' + sIdx]);
                    }

                    sigDiff = countDifferentValue(refArray, sigArray);
                } else {
                    var hitDocs = [];
                    var minDiff = +Infinity;

                    for (var hIdx in hits) {
                        var diff = 0;
                        var doc = hits[hIdx];
                        var refArray = [];

                        for (var sIdx in sigArray) {
                            refArray.push(doc._source['signal_' + sIdx]);
                        }

                        diff = countDifferentValue(refArray, sigArray);

                        if (diff < minDiff) {
                            minDiff = diff;
                            hitDocs = [doc];
                        } else if(diff == minDiff) {
                            hitDocs.push(doc);
                        }
                    }

                    if(hitDocs.length == 1) {
                        body = hitDocs[0]._source;
                        docID = hitDocs[0]._id
                    } else {
                        var ranIdx = Math.floor(Math.random() * hitDocs.length);
                        body = hitDocs[ranIdx]._source;
                        docID = hitDocs[ranIdx]._id;
                    }

                    sigDiff = minDiff;
                }

                body.avgDiff = (sigDiff + body.avgDiff * body.hits) / (++body.hits);
            }
            // Generate new document
            else {
                var sigStr = '';

                for (var i in combDataArray) {
                    var data = combDataArray[i];
                    sigStr += data.GWID + ':' + data.signal.toString() + '&';
                }

//                docID = hashString(sigStr + '&' + position.GPS_N + '&' + position.GPS_E);
                body.characteristic = countCharacteristicValue(combDataArray);
                body.time = updateTime

                for (var idx in combDataArray) {
                    body['signal_' + idx] = combDataArray[idx].signal;
                }

                body.GPS_N = position.GPS_N;
                body.GPS_E = position.GPS_E;
                body.hits = 1;
                body.avgDiff = 0;
            }

            // Index document
            dbClient.index({
                index: dbIndex,
                type: tbID,
                id: docID,
                body: body
            }, function (err, res) {
                taskNum--;

                if (taskNum == 0 && callback) {
                    callback(err, res);
                }
            });
        });
    });
}

function remove(tbID, position, callback) {
    var filters = [ { term: { 'GPS_N': position.GPS_N, 'GPS_E': position.GPS_E }}];

    // Search documents
    dbClient.search({
        index: dbIndex,
        type: tbID,
        size: 10000,
        _source: false,
        body: {
            query: {
                filtered: {
                    filter: {
                        bool: {
                            must: filters
                        }
                    }
                }
            }
        }
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        var hits = res.hits.hits;

        if (hits.length == 0) {
            return callback(new Error('Nothing to remove !'));
        }

        var body = [];

        for (var idx in hits) {
            var docID = hits[idx]._id;
            body.push({ delete: { _index: dbIndex, _type: tbID, _id: docID }});
        }

        dbClient.bulk({
            body : body
        }, function (err, res) {
            if (!callback) {
                return;
            }

            callback(err, res);
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
            value += Math.pow(refVal - dataVal, 2);
        }
    }

    return Math.sqrt(value, 2);
}

function hashString(input) {
    var hash = 0;
    
    if (Array.prototype.reduce) {
        hash = input.split('').reduce(function(a, b) {a=((a << 5) - a) + b.charCodeAt(0); return a & a}, 0);
    } else {
        for (var i = 0; i < input.length; i++) {
            var character = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + character;
            hash = hash & hash;
        }
    }
    
    var hashStr = hash.toString(16);
    
    return ('00000000' + hashStr).substring(hashStr.length);
}

// Select all combinations of num items from array
function selectFromArray(array, num) {
    if (!array || array.length < num || num < 1) {
        return null;
    }

    var result = [];
    
    if (array.length == num) {
        return [array];
    }
    else if(num == 1) {
        for (var idx in array) {
            result.push([array[idx]]);
        }
        
        return result;
    }
    
    // Choose 1st item, and num - 1 items from others
    var newArray = array.slice();
    newArray.splice(0, 1);
    var tmpResult = selectFromArray(newArray, num - 1);
    
    for (var idx in tmpResult) {
        var tmpArray = [array[0]];
        tmpArray = tmpArray.concat(tmpResult[idx]);
        result.push(tmpArray);
    }
    
    // Choose num items from others (don't choose 1st item)
    tmpResult = selectFromArray(newArray, num);
    
    for (var idx in tmpResult) {
        result.push(tmpResult[idx]);
    }
    
    return result;
}

exports.setupDB = setupDB;
exports.find = find;
exports.record = record;
exports.remove = remove;
