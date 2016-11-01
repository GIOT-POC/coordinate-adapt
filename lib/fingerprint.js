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
    var chaValue = countCharacteristicValue(dataArray);

    // Generate filters
    var filters = [ { term: { characteristic: chaValue }}];

    for (var idx in dataArray) {
        var signal = dataArray[idx].signal;
        var range = {};
        range['signal_' + idx] = { gte: signal - tolerance, lte: signal + tolerance };
        filters.push({ range: range });
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
        var hitDoc = null;

        if (hits.length == 0) {
            return callback(new Error('No similar fingerprint !'));
        } else if(hits.length == 1) {
            hitDoc = hits[0]._source;
        } else {
            var hitDocs = [];
            var minDiff = +Infinity;

            for (var idx in hits) {
                var diff = 0;
                var doc = hits[idx]._source;
                var refArray = [];
                var sigArray = dataArray.map(function(item) {
                    return item.signal;
                });

                for (var sIdx in sigArray) {
                    refArray.push(doc['signal_' + sIdx]);
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
                hitDoc = hitDocs[0];
            } else {
                var ranIdx = Math.floor(Math.random() * hitDocs.length);
                hitDoc = hitDocs[ranIdx];
            }
        }

        // Find position information
        var posArray = hitDoc.position;

        if (posArray.length == 1) {
            return callback(null, {GPS_E: posArray[0].GPS_E, GPS_N: posArray[0].GPS_N});
        }

        var ranIdx = Math.floor(Math.random() * posArray.length);
        return callback(null, {GPS_E: posArray[ranIdx].GPS_E, GPS_N: posArray[ranIdx].GPS_N});
    }, function (err) {
        return callback(err);
    });
}

function record(tbID, position, tolerance, sigDataArray, callback) {
    for (var len = sigDataArray.length; len >= config.minLFSignalNum; len--) {
        var combinations = selectFromArray(sigDataArray, len);

        combinations.forEach(function(combDataArray) {
            // Generate filters
            var charVal = countCharacteristicValue(combDataArray)
            var filters = [ { term: { characteristic: charVal }}];

            for (var cIdx in combDataArray) {
                var signal = combDataArray[cIdx].signal;
                var range = {};
                range['signal_' + cIdx] = { gte: signal - tolerance, lte: signal + tolerance };
                filters.push({ range: range });
            }

            // Find existing data
            dbClient.search({
                index: dbIndex,
                type: tbID,
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
                var posInfo = null;
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

                    // Find position information
                    var posArray = body.position;

                    for (var posIdx in posArray) {
                        if (position.GPS_N == posArray[posIdx].GPS_N &&
                            position.GPS_E == posArray[posIdx].GPS_E) {
                            posInfo = posArray[posIdx];
                            break;
                        }
                    }
                }
                // Generate new document
                else {
                    var sigStr = '';

                    for (var i in combDataArray) {
                        var data = combDataArray[i];
                        sigStr += data.GWID + ':' + data.signal.toString() + '&';
                    }

                    docID = hashString(sigStr);
                    body.characteristic = countCharacteristicValue(combDataArray);
                    body.time = updateTime

                    for (var idx in combDataArray) {
                        body['signal_' + idx] = combDataArray[idx].signal;
                    }

                    body.position = [];
                }

                // Set position information
                if (posInfo) {
                    posInfo.signalDiff = (posInfo.signalDiff * posInfo.hits + sigDiff) / ++posInfo.hits;

                    if (updateTime > posInfo.time) {
                        posInfo.time = updateTime;
                    }
                } else {
                    posInfo = position;
                    posInfo.time = updateTime;
                    posInfo.hits = 1;
                    posInfo.signalDiff = sigDiff;
                    body.position.push(posInfo);
                }

                // Index document
                dbClient.index({
                    index: dbIndex,
                    type: tbID,
                    id: docID,
                    body: body
                }, function (err, res) {
                    if (err) {
                        return callback(err);
                    }

                    callback(null, res);
                });
            });
        });
    }
}

function remove(tbID, position, callback) {
    var filters = [ { term: { 'position.GPS_E': position.GPS_E }}];

    // Search documents
    dbClient.search({
        index: dbIndex,
        type: tbID,
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
            var docBody = hits[idx]._source;
            console.log(hits[idx]);
            if (docBody.position.length > 1) {
                var posArray = docBody.position;

                for (var pIdx in posArray) {
                    if (posArray[pIdx].GPS_E == position.GPS_E) {
                        posArray.splice(pIdx, 1);
                        break;
                    }
                }

                docBody.position = posArray;
                body.push({ index: { _index: dbIndex, _type: tbID, _id: docID }});
                body.push(docBody);
            } else {
                body.push({ delete: { _index: dbIndex, _type: tbID, _id: docID }});
            }
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
            value += Math.abs(refVal - dataVal);
        }
    }

    return value;
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
