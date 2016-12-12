var util = require('util');
var pjson = require('./package.json');
var couchbase = require('couchbase');
var trilateration = require('./lib/trilateration');
var geoUtil = require('./lib/geo_utility');
var elasticsearch = require('elasticsearch');
var status_code = require('./lib/status_code.js')
var fingerprint = require('./lib/fingerprint');
var config = require('./config');

var queryTaskInfo = {};
var queryDataQueueInfo = {};
var queryDataQueueCleanerInfo = {};

var recordTaskInfo = {};
var recordDataQueueInfo = {};
var recordDataQueueCleanerInfo = {};

//db object
var buckets = {
//    Base: function () { },
//    LF: function () { }
};

//elasticsearch object
var elasticObj = {
    client: function () {}
};

exports.getVersion = function () {
    console.log(pjson.version);
}

//initial Location LFPrint db
exports.InitLF_db = function InitLF_db(configs) {
    console.log('Start initial FL db');
    // var cluster = new couchbase.Cluster(dbURL);
    // buckets.LF = cluster.openBucket(args.bucketname, args.pw);
    console.log(configs);
    elasticObj.client = elasticsearch.Client(configs);
    elasticObj.index = configs.index;

    elasticObj.client.ping({
        requestTimeout: 3000,
        hello: 'elasticsearch!'
    }, function (err) {
        if (err) {
            elasticObj.client = null;
            return;
        }

        //for develop & debug
        loadConfig();

        console.log('Elasticsearch cluster is OK !');

        fingerprint.setupDB(elasticObj.client, configs.index);
    });
}

//initial station Info db
exports.InitBase_db = function InitBase_db(dbURL, args, callback) {
    console.log('Start initial Base db');
    var cluster = new couchbase.Cluster(dbURL);
    buckets.Base = cluster.openBucket(args.bucketname, args.pw, function(err){
        if (!callback) {
            return;
        }

        if(err){
            buckets.Base = null;
            return callback(genError('DB_INITIAL_ERROR', err.message));
        }

        callback(null);
    });
}

//Initial Local Fingerprint elasticsearch
// exports.InitLF_search = function InitLF_search(configs) {
//     console.log(configs);
//     console.log('Start initial LF elasticsearch ');
//     elasticObj.client = elasticsearch.Client(configs);
// }

exports.disconnectBase_db = function disconnectBase_db() {
    console.log('Disconnect Base db');
    buckets.Base.disconnect();
}

// exports.disconnectLF_db = function disconnectLF_db() {
//     console.log('Disconnect FL db');
//     buckets.LF.disconnect();
// }

// Saves effect GPS coordinate of NODE
exports.NodeGPSInsert = function NodeGPSInsert(object, callback) {
    if (!object || !object.nodeGPS_N || !object.nodeGPS_E || !object.Gateway || object.Gateway.length == 0) {
        return callback(genError('NODE_INSERT_ERROR', 'Invalid fingerprint data !'));
    }

    //for develop & debug
    loadConfig();

    //log input data
    if (config.logLevel < 1) {
        logDataToDB('log-data-gps', object);
    }

    //filter weak signal data
    var dataArray = object.Gateway.filter(function(item) {
        return item.snr > 0;
    });

    if (dataArray.length == 0) {
        return callback(genError('NODE_INSERT_ERROR', 'Invalid fingerprint data !'));
    }

    //find data queue
    var queueID = object.nodeMAC + '_' + object.nodeGPS_N + '-' + object.nodeGPS_E;
    var queueInfo = recordDataQueueInfo[queueID];

    if (!queueInfo) {
        queueInfo = {updated: false, queue: []};
        recordDataQueueInfo[queueID] = queueInfo;
    }

    var dataQueue = queueInfo.queue;

    //add data to data queue
    var dataIdx = -1;
    var timeoutCount = 0;
    var dataTime = (new Date(dataArray[0].time)).getTime();

    for (var idx in dataQueue) {
        var qDataArray = dataQueue[idx];
        var qDataTime = (new Date(qDataArray[0].time)).getTime();

        if (qDataTime < dataTime - config.dataQueueTimeout) {
            timeoutCount++;
        }
        else if (qDataTime > dataTime) {
            dataQueue.splice(idx, 0, dataArray);
            dataIdx = idx;
            break;
        } else if (qDataTime == dataTime) {
            dataQueue[idx] = qDataArray.concat(dataArray);
            dataArray = dataQueue[idx];
            dataIdx = idx;
            break;
        }
    }

    if (dataIdx == -1) {
        dataQueue.push(dataArray);
        dataIdx = dataQueue.length - 1;
    }

    //discard redundant data
    var gwidArray = [];
    var uniDataArray = [];

    for (var idx in dataArray) {
        var data = dataArray[idx];
        var idIdx = gwidArray.indexOf(data.gatewayID);

        if (idIdx != -1) {
            if (data.snr > uniDataArray[idIdx].snr) {
                uniDataArray[idIdx] = data;
            }

            continue;
        }

        gwidArray.push(data.gatewayID);
        uniDataArray.push(data);
    }

    dataArray = uniDataArray;
    dataQueue[dataIdx] = dataArray;

    //remove too old data
    if (timeoutCount > 0) {
        dataQueue.splice(0, timeoutCount);
        dataIdx -= timeoutCount;
    }

    //set task to clean old data
    if (recordDataQueueCleanerInfo[queueID]) {
        clearTimeout(recordDataQueueCleanerInfo[queueID]);
    }

    recordDataQueueCleanerInfo[queueID] = setTimeout(function() {
        delete recordDataQueueInfo[queueID];
    }, config.dataQueueTimeout);

    queueInfo.updated = true;

    //run record task
    var taskID = queueID;

    if (!recordTaskInfo[taskID]) {
        recordTaskInfo[taskID] = {taskID: taskID};
        triggerRecordTask(object.nodeGPS_N, object.nodeGPS_E, queueID);
    }

    callback(null);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(object, callback) {
    if (!object || !object.Gateway || object.Gateway.length == 0) {
        return callback(genError('COORDINATE_TRANSFER_ERROR', 'Invalid signal data !'));
    }

    //log input data
    if (config.logLevel < 1) {
        logDataToDB('log-data-query', object);
    }

    //filter weak signal data
    var dataArray = object.Gateway.filter(function(item) {
        return item.snr > 0;
    });

    if (dataArray.length == 0) {
        return callback(genError('COORDINATE_TRANSFER_ERROR', 'Invalid signal data !'));
    }

    //find data queue
    var queueID = object.nodeMAC;
    var queueInfo = queryDataQueueInfo[queueID];

    if (!queueInfo) {
        queueInfo = {updated: false, queue: []};
        queryDataQueueInfo[queueID] = queueInfo;
    }

    var dataQueue = queueInfo.queue;

    //add data to data queue
    var dataIdx = -1;
    var timeoutCount = 0;
    var dataTime = (new Date(dataArray[0].time)).getTime();

    for (var idx in dataQueue) {
        var qDataArray = dataQueue[idx];
        var qDataTime = (new Date(qDataArray[0].time)).getTime();

        if (qDataTime < dataTime - config.dataQueueTimeout) {
            timeoutCount++;
        }
        else if (qDataTime > dataTime) {
            dataQueue.splice(idx, 0, dataArray);
            dataIdx = idx;
            break;
        } else if (qDataTime == dataTime) {
            dataQueue[idx] = qDataArray.concat(dataArray);
            dataArray = dataQueue[idx];
            dataIdx = idx;
            break;
        }
    }

    if (dataIdx == -1) {
        dataQueue.push(dataArray);
        dataIdx = dataQueue.length - 1;
    }

    //discard redundant data
    var gwidArray = [];
    var uniDataArray = [];

    for (var idx in dataArray) {
        var data = dataArray[idx];
        var idIdx = gwidArray.indexOf(data.gatewayID);

        if (idIdx != -1) {
            if (data.snr > uniDataArray[idIdx].snr) {
                uniDataArray[idIdx] = data;
            }

            continue;
        }

        gwidArray.push(data.gatewayID);
        uniDataArray.push(data);
    }

    dataArray = uniDataArray;
    dataQueue[dataIdx] = dataArray;

    //remove too old data
    if (timeoutCount > 0) {
        dataQueue.splice(0, timeoutCount);
        dataIdx -= timeoutCount;
    }

    //set task to clean old data
    if (queryDataQueueCleanerInfo[queueID]) {
        clearTimeout(queryDataQueueCleanerInfo[queueID]);
    }

    queryDataQueueCleanerInfo[queueID] = setTimeout(function() {
        delete queryDataQueueInfo[queueID];
    }, config.dataQueueTimeout);

    queueInfo.updated = true;

    //run query task
    var taskID = queueID;

    queryTaskInfo[taskID] = { taskID: taskID, queueID: queueID};
    triggerQueryTask(taskID, callback);
}

//set map information with mapID, info, output callback(err, res)
exports.setMapInfo = function setMapInfo(mapID, info, callback) {
    if (!mapID || mapID == '') {
        return callback(new Error('Set map information failed: empty map ID !'));
    }

    // Index document
    elasticObj.client.index({
        index: elasticObj.index,
        type: 'map-info',
        id: 'map_' + mapID,
        body: info
    }, function (err, res) {
        if (!callback) {
            return;
        }

        if (err) {
            return callback(err);
        }

        callback(null, res);
    });
}

//cean all logs with type
exports.cleanLog = function cleanLog(type, callback) {
    cleanESData(type, null, function(err, res) {
        if (callback) {
            return callback(err, res);
        }
    });
}

//clean map data (fingerprint data) for specific mapID with condition
exports.cleanMapData = function cleanMapData(mapID, condition, callback) {
    var table = 'gps-history';

    if (mapID != null) {
        table += '_' + mapID;
    }

    if (!condition) {
        cleanESData(table, null, function(err, res) {
            if (callback) {
                return callback(err, res);
            }
        });
    } else {
        if (condition.position) {
            fingerprint.remove(table, condition.position, function(err, res) {
                return callback(err, res);
            });
        }
    }
}

function triggerRecordTask(GpsN, GpsE, queueID) {
    //decide to run record task
    if (!recordDataQueueInfo[queueID] || !recordDataQueueInfo[queueID].updated || recordDataQueueInfo[queueID].queue.length < config.minRecordDataNum) {
        delete recordTaskInfo[queueID];
        recordDataQueueInfo[queueID].updated = false;
        return;
    }
    
    recordDataQueueInfo[queueID].updated = false;
    
    var dataQueue = recordDataQueueInfo[queueID].queue.slice();
    var position = {GPS_N: GpsN, GPS_E: GpsE};

    //get map information
    var mapID = null;
    var valN = parseInt(GpsN * 1000000);
    var valE = parseInt(GpsE * 1000000);
    
    if (valN > 90000000 && valE > 180000000) {
        var strN = valN.toString();
        var strE = valE.toString();
        
        mapID = strN.substring(0, strN.length - 3) + '-'
        + strE.substring(0, strE.length - 3) + '-'
        + strN.substring(strN.length - 3);
        
        //modify GPS value
        var pointIdx = strN.length - 6;
        position.GPS_N = strN.substring(0, pointIdx) + '.' + strN.substring(pointIdx);
        pointIdx = strE.length - 6;
        position.GPS_E = strE.substring(0, pointIdx) + '.' + strE.substring(pointIdx);
    }

    getMapInfo(mapID, function(err, res) {
        var validGWInfo = null;
        var tolerance = 3;

        if (!err) {
            if (res.isLocked) {
                return;
            }

            validGWInfo = res.gateway;
            tolerance = res.tolerance;
        } else {
            mapID = null;

            //don't record data without map information defined
            triggerRecordTask(GpsN, GpsE, queueID);
            return;
        }

        //filter & convert queue data
        if (validGWInfo) {
            for (var qIdx in dataQueue) {
                var dataArray = dataQueue[qIdx];
                var validDataArray = [];

                for (var dIdx in dataArray) {
                    var data = dataArray[dIdx];
                    var gwid = data.gatewayID;
                    var mappedID = null;

                    for (var key in validGWInfo) {
                        var validList = validGWInfo[key].id;

                        if (validList.indexOf(gwid) != -1) {
                            mappedID = key;
                            break;
                        }
                    }

                    if (!mappedID) {
                        continue;
                    }

                    data.gatewayID = mappedID;
                    validDataArray.push(data);
                }

                dataQueue[qIdx] = validDataArray;
            }
        }

        //gather signal value
        var sigArray = [];
        var fpDataArray = dataQueue[dataQueue.length - 1];

        if (fpDataArray.length < config.minLFSignalNum) {
            triggerRecordTask(GpsN, GpsE, queueID);
            return;
        }

        for (var qIdx in dataQueue) {
            var dataArray = dataQueue[qIdx];
            var sigInfo = {};

            for (var dIdx in dataArray) {
                var data = dataArray[dIdx];
                sigInfo[data.gatewayID] = data.rssi;
            }

            var sigData = [];

            for (var fIdx in fpDataArray) {
                var data = fpDataArray[fIdx];
                var signal = sigInfo[data.gatewayID];

                if (!signal || Math.abs(data.rssi - signal) > tolerance) {
                    break;
                }

                sigData.push(signal);
            }

            if (sigData.length < fpDataArray.length) {
                continue;
            }

            sigArray.push(sigData);
        }

        if (sigArray.length < config.minRecordDataNum - 1) {
            triggerRecordTask(GpsN, GpsE, queueID);
            return;
        }

        //update fingerprint data
        for (var idx in fpDataArray) {
            var data = fpDataArray[idx];
            var sigTotal = 0;

            for (var sIdx in sigArray) {
                sigTotal += parseInt(sigArray[sIdx][idx]);
            }

            data.rssi = Math.round(sigTotal / sigArray.length);
            fpDataArray[idx] = data;
        }

        //record fingerprint data
        recordFingerprint(mapID, position, fpDataArray, tolerance, function(err, res) {
            triggerRecordTask(GpsN, GpsE, queueID);
        });
    });
}

function triggerQueryTask(taskID, callback) {
    var taskInfo = queryTaskInfo[taskID];
    var queueID = taskInfo.queueID;
    
    //decide to run query task
    if (!queryDataQueueInfo[queueID] || !queryDataQueueInfo[queueID].updated) {
        delete queryTaskInfo[queueID];
        queryDataQueueInfo[queueID].updated = false;
        return;
    }
    
    queryDataQueueInfo[queueID].updated = false;
    
    var dataQueue = queryDataQueueInfo[queueID].queue.slice();
    var fpDataArray = dataQueue[dataQueue.length - 1];
    
    //get map information
    findMapInfo(dataQueue[dataQueue.length - 1], function(err, res) {
        var mapID = null;
        var mapInfo = null;
        var tolerance = 3;

        if (!err) {
            mapID = res.id.substring(4);
            mapInfo = res.info;
            tolerance = mapInfo.tolerance;
        }

        //filter & convert queue data
        if (mapInfo) {
            var validGWInfo = mapInfo.gateway;

            for (var qIdx in dataQueue) {
                var dataArray = dataQueue[qIdx];
                var validDataArray = [];

                for (var dIdx in dataArray) {
                    var data = dataArray[dIdx];
                    var gwid = data.gatewayID;
                    var mappedID = null;

                    for (var key in validGWInfo) {
                        var validList = validGWInfo[key].id;

                        if (validList.indexOf(gwid) != -1) {
                            mappedID = key;
                            break;
                        }
                    }

                    if (!mappedID) {
                        continue;
                    }

                    data.gatewayID = mappedID;
                    validDataArray.push(data);
                }

                dataQueue[qIdx] = validDataArray;
            }

            fpDataArray = dataQueue[dataQueue.length - 1];

            //check very strong signal
            for (var idx in fpDataArray) {
                var data = fpDataArray[idx];

                if (data.rssi > 0){
                    var position = validGWInfo[data.gatewayID].position;
                    return callback(null, {GpsX: mapInfo.GPS_E + position, GpsY: mapInfo.GPS_N, Type: 0});
                }
            }
        }

        //gather signal value
        var sigArray = [];

        if (fpDataArray.length < config.minLFSignalNum) {
            return callback(genError('COORDINATE_TRANSFER_ERROR', 'Invalid signal data !'));
        }

        for (var qIdx in dataQueue) {
            var dataArray = dataQueue[qIdx];
            var sigInfo = {};

            for (var dIdx in dataArray) {
                var data = dataArray[dIdx];
                sigInfo[data.gatewayID] = parseInt(data.rssi);
            }

            var sigData = [];

            for (var fIdx in fpDataArray) {
                var data = fpDataArray[fIdx];
                var signal = sigInfo[data.gatewayID];

                if (!signal || Math.abs(data.rssi - signal) > tolerance) {
                    break;
                }

                sigData.push(signal);
            }

            if (sigData.length < fpDataArray.length) {
                continue;
            }

            sigArray.push(sigData);
        }

        //update fingerprint data
        for (var idx in fpDataArray) {
            var data = fpDataArray[idx];
            var sigTotal = 0;

            for (var sIdx in sigArray) {
                sigTotal += parseInt(sigArray[sIdx][idx]);
            }

            data.rssi = Math.round(parseInt(sigTotal) / sigArray.length);
            fpDataArray[idx] = data;
        }

        //find fingerprint data
        findFingerprint(mapID, fpDataArray, tolerance, function(err, res) {
            if (!err) {
                return callback(null, {GpsX: res.GPS_E, GpsY: res.GPS_N, Type: 0});
            }

            //only support fingerprint query for indoor positioning
            if (mapID) {
                return callback(genError('COORDINATE_TRANSFER_ERROR', 'Cannot find location fingerprint !'));
            }

            //get station information for location estimation
            var gwidArray = fpDataArray.map(function(item) {
                return item.gatewayID;
            });

            getStationInfo(gwidArray, function(err, res) {
                if (err) {
                    return callback(genError('COORDINATE_TRANSFER_ERROR', err.message));
                }
                           
                //convert data for trilateration calculation
                var base;
                var circles = [];

                for (var i = 0; i < fpDataArray.length; i++) {
                    var circle = {x: 0, y: 0};
                    var data = fpDataArray[i];
                    var info = res[data.gatewayID];

                    if (info) {
                        var coordinate = {GpsX: parseFloat(info.GpsX), GpsY: parseFloat(info.GpsY)};

                        //check very strong signal
                        if (data.rssi > 0) {
                            base = coordinate;
                            circle.r = 1;
                            circles = [circle];
                            break;
                        }

                        if (!base) {
                            base = coordinate
                        } else {
                            circle = geoUtil.convertGPSToCartesian(coordinate, base);
                        }

                        var signal = data.rssi;
                        circle.r = trilateration.countDistanceByRSSI(signal);
                        circles.push(circle);
                    }
                }

                var point = trilateration.intersect(circles);
                var gps = geoUtil.convertCartesianToGPS(point, base);
                var result = {GpsX: gps.GpsX.toString(), GpsY: gps.GpsY.toString(), Type: 1};

                callback(null, result);
            });
        });
    });
}

//find map by signal data array
function findMapInfo(dataArray, callback) {
    var body = [];

    for (var idx in dataArray) {
        body.push({});
        body.push({
            query: {
                filtered: {
                    filter: {
                        exists: {
                            field: 'gateway.' + dataArray[idx].gatewayID
                        }
                    }
                }
            }
        });
    }

    elasticObj.client.msearch({
        index: elasticObj.index,
        type: 'map-info',
        body: body
    }, function(err, res) {
        if (err) {
            return callback(err);
        }

        var tmpResult = {};
        var result = null;

        for (var rIdx in res.responses) {
            var hits = res.responses[rIdx].hits.hits;

            for (var hIdx in hits) {
                var mapID = hits[hIdx]._id;

                if (!tmpResult[mapID]) {
                    tmpResult[mapID] = 1;
                } else {
                    tmpResult[mapID] += 1;
                }

                if (!result || tmpResult[mapID] > result.count) {
                    result = { id: mapID, count: tmpResult[mapID], source: hits[hIdx]._source };
                }
            }
        }

        if (!result || result.count < config.minLFSignalNum) {
            return callback(new Error('Can\'t find map !'));
        }

        callback(null, { id: result.id, info: result.source });
    });
}

//get map information with mapID, output callback(err, res)
function getMapInfo(mapID, callback) {
    if (!mapID || mapID == '') {
        return callback(new Error('Get map information failed: empty map ID !'));
    }

    elasticObj.client.get({
        index: elasticObj.index,
        type: 'map-info',
        id: 'map_' + mapID
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        callback(null, res._source);
    });
}

//find fingerprint with input mapID, dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function findFingerprint(mapID, dataArray, tolerance, callback) {
    if (!dataArray || dataArray.length < config.minLFSignalNum) {
        return callback(new Error('Invalid fingerprint data !'));
    }

    //sort data array
    var sortedDataArray = dataArray.slice().sort(function(a, b) {
//        if (a.time == b.time) {
//            if (a.gatewayID > b.gatewayID) {
//                return 1;
//            }
//
//            return -1;
//        }
//
//        return a.time - b.time;
        if (a.gatewayID > b.gatewayID) {
            return 1;
        }

        return -1;
    })

    var sigArray = sortedDataArray.map(function(item) {
        var signal = item.rssi;
        return {GWID: item.gatewayID, signal: signal};
    });

    //find fingerprint data
    var table = 'gps-history';

    if (mapID) {
        table += '_' + mapID;
    }

    fingerprint.find(table, tolerance, sigArray, function(err, res) {
        //log find data
        if (config.logLevel < 1) {
            var logObj = { table: table, signal: sigArray};

            if (err) {
                logObj.result = { error: err.message };
            } else {
                logObj.result = res;
            }

            logDataToDB('log-data-find', logObj);
        }

        if (err) {
            return callback(err);
        }

        callback(null, res);
    });
}

//record fingerprint with input mapID, position: {GPS_N, GPS_E}, dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function recordFingerprint(mapID, position, dataArray, tolerance, callback) {
    if (!position || !dataArray || dataArray.length < config.minLFSignalNum) {
        return callback(new Error('Invalid fingerprint data !'));
    }

    //sort data array
    var sortedDataArray = dataArray.slice().sort(function(a, b) {
//        if (a.time == b.time) {
//            if (a.gatewayID > b.gatewayID) {
//                return 1;
//            }
//
//            return -1;
//        }
//
//        return a.time - b.time;
        if (a.gatewayID > b.gatewayID) {
            return 1;
        }

        return -1;
    })

    var sigDataArray = sortedDataArray.map(function(item) {
        var signal = item.rssi;
        return {GWID: item.gatewayID, signal: signal, time: item.time};
    });

    //record fingerprint data
    var table = 'gps-history';

    if (mapID) {
        table += '_' + mapID;
    }

    //log record data
    if (config.logLevel < 1) {
        var logObj = { table: table, position: position, signal: sigDataArray};
        logDataToDB('log-data-record', logObj);
    }

    fingerprint.record(table, position, tolerance, sigDataArray, function(err, res) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, res);
    });
}

//get station information with input dataArray: [GWID], output callback(err, result)
function getStationInfo(dataArray, callback) {
    if (!buckets.Base) {
        return callback(new Error('Database is not set !'));
    }

    buckets.Base.get('TRACKER-gxcJqqvNOD_gwid_geoinfo_mapping', function(err, result) {
        if (err) {
            callback(err);
            return;
        }

        var infoList = result.value.mapping_list;
        var tmpResult = {};

        for (var i = 0; i < dataArray.length; i++) {
            var gwid = dataArray[i].substring(4).toUpperCase();
            var info = infoList[gwid];

            if (!info) {
                continue;
            }

            tmpResult[dataArray[i]] = info;
        }

        if (Object.keys(tmpResult).length == 0) {
            return callback(new Error('Get station information failed !'));
        }

        callback(null, tmpResult);
    });
}

//generate error object, append extra message after original error message
function genError(type, extraMsg) {
    var err = status_code[type];
    var newErr = {code: err.code, message: err.message};

    if (extraMsg) {
        newErr.message += ' - ' + extraMsg;
    }

    return newErr;
}

//getNodeST( 'Hex String', integer)
//raw: hex string, addr bit addr between 0 to 7, return integer 1 or 0
function getNodeST (raw, addr) {

    if((typeof(addr) != 'number') || (addr < 0 && add > 7)){
        console.log('getNodeST: addr must a number and between 0 to 7');
        return 'undefined';
    }
    if (raw.length < 2) {
        console.log('getNodeST: input hex string length must long than two words');
        return 'undefined';
    }

    // avoid crash for raw of odd length
    var rawStr = raw;

    if (raw.length % 2 == 1) {
        rawStr = raw + '0';
    }

    var bit = Math.pow(2, addr);
    var dataHex = new Buffer(rawStr, 'hex')[0]; // translate string to hex encoding

    if (typeof dataHex == 'undefined' && dataHex == null) {
        console.log('getNodeST: input string not hex');
        return 'undefined';
    }

    if(dataHex & bit){
        return 1;
    } else {
        return 0;
    }
}

//log data to database, for debug or develop
function logDataToDB(type, data, callback) {
    var time = new Date();
    var log = {timestamp: Date.parse(time), date: time.toString(), data: data};

    // Index document
    elasticObj.client.index({
        index: elasticObj.index,
        type: type,
        body: log
    }, function (err, res) {
        if (!callback) {
            return;
        }

        if (err) {
            return callback(err);
        }

        callback(null, res);
    });
}

//load configuration
function loadConfig(cfg, callback) {
    if (!elasticObj.client) {
        return;
    }

    elasticObj.client.get({
        index: elasticObj.index,
        type: 'config',
        id: 'config'
    }, function (err, res) {
        if (err) {
            return ;
        }

        var cfg = res._source;
        setConfig(cfg);
    });
}

//set configuration with object
function setConfig(cfg) {
    if (cfg.logLevel != undefined) {
        config.logLevel = cfg.logLevel;
    }

    if (cfg.dataCollectionTime != undefined) {
        config.dataCollectionTime = cfg.dataCollectionTime;
    }

    if (cfg.minLFSignalNum != undefined) {
        config.minLFSignalNum = cfg.minLFSignalNum;
    }

    if (cfg.dataQueueTimeout != undefined) {
        config.dataQueueTimeout = cfg.dataQueueTimeout;
    }

    if (cfg.minRecordDataNum != undefined) {
        config.minRecordDataNum = cfg.minRecordDataNum;
    }
}

//cean elasticsearch data for specific type with filters
function cleanESData(type, filters, callback) {
    if (!elasticObj.client) {
        return;
    }

    var clnSize = 1000;

    //search documents
    elasticObj.client.search({
        index: elasticObj.index,
        type: type,
        _source: false,
        size: clnSize,
        timeout: '120s',
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
        if (err) {
            if (callback) {
                callback(err);
            }

            return;
        }

        var hits = res.hits.hits;

        if (hits.length == 0) {
            if (callback) {
                callback(null, {delete: 0});
            }

            return;
        }
                             
        //delete documents
        var body = [];

        for (var idx in hits) {
            body.push({ delete: { _id: hits[idx]._id }});
        }

        elasticObj.client.bulk({
            index: elasticObj.index,
            type: type,
            body : body
        }, function (err, res) {
            //handle error case
            if (err) {
                if (callback) {
                    callback(err);
                }

                return;
            }

            //update deleted count
            var clnCount = 0;

            for (var cIdx in res.items) {
                if (res.items[cIdx].delete.found) {
                    clnCount++;
                }
            }

            if (hits.length < clnSize) {
                if (callback) {
                    callback(null, {delete: clnCount})
                }

                return;
            }

            setTimeout(function() {
                cleanESData(type, filters, function(err, res) {
                    if (!err) {
                        clnCount += res.delete;
                    }

                    if (callback) {
                        callback(null, {delete: clnCount});
                    }
                });
            }, 1000);
        });
    });
}
