var util = require('util');
var pjson = require('./package.json');
var couchbase = require('couchbase');
var trilateration = require('./lib/trilateration');
var geoUtil = require('./lib/geo_utility');
var elasticsearch = require('elasticsearch');
var status_code = require('./lib/status_code.js')
var fingerprint = require('./lib/fingerprint');
var config = require('./config');

var queryDataInfo = {};
var recordDataInfo = {};
var queryDataQueueInfo = {};
var recordDataQueueInfo = {};
var cleanQueryDataQueueTaskInfo = {};
var cleanRecordDataQueueTaskInfo = {};

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
//    console.log('Gateway count', nodeGroup.Gateway.length);

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
    var dataArray = object.Gateway;
    var validDataArray = [];

    for (var idx in dataArray) {
        if (dataArray[idx].snr > 0) {
            validDataArray.push(dataArray[idx]);
        }
    }

    if (validDataArray.length == 0) {
        return callback(genError('NODE_INSERT_ERROR', 'Invalid fingerprint data !'));
    }

    var dataID = object.nodeMAC + '-' + Date.parse(object.Gateway[0].time);

    //add data to data information
    if (!recordDataInfo[dataID]) {
        recordDataInfo[dataID] = {};
        recordDataInfo[dataID].time = validDataArray[0].time;
        recordDataInfo[dataID].data = validDataArray;

        setTimeout(function() {
            var dataInfo = recordDataInfo[dataID];
            var dataArray = dataInfo.data;
            var gwidArray = [];
            var validDataArray = [];

            delete recordDataInfo[dataID];

            //discard redundant data
            for (var idx in dataArray) {
                var data = dataArray[idx];
                var extIdx = gwidArray.indexOf(data.gatewayID);

                if (extIdx != -1) {
                    if (data.snr > validDataArray[extIdx].snr) {
                        validDataArray[extIdx] = data;
                    }

                    continue;
                }

                gwidArray.push(data.gatewayID);
                validDataArray.push(data);
            }

            //get map information
            var mapID = null;
            var valGPSN = parseInt(object.nodeGPS_N * 1000000);
            var valGPSE = parseInt(object.nodeGPS_E * 1000000);

            if (valGPSN > 90000000 && valGPSE > 180000000) {
                var strGPSN = valGPSN.toString();
                var strGPSE = valGPSE.toString();
                mapID = strGPSN.substring(0, strGPSN.length - 3) + '-'
                    + strGPSE.substring(0, strGPSE.length - 3) + '-'
                    + strGPSN.substring(strGPSN.length - 3);
            }

            getMapInfo(mapID, function(err, res) {
                var fpDataArray = [];
                var tolerance = 3;

                if (!err) {
                    //filter by map information
                    var gwList = Object.keys(res.gateway);

                    for (var idx in validDataArray) {
                        var gwid = validDataArray[idx].gatewayID;

                        for (var gIdx in gwList) {
                            var idList = res.gateway[gwList[gIdx]].id;

                            if (idList.indexOf(gwid) != -1) {
                                validDataArray[idx].gatewayID = gwList[gIdx];
                                fpDataArray.push(validDataArray[idx]);
                                break;
                            }
                        }
                    }

                    tolerance = res.tolerance;
                } else {
                    fpDataArray = validDataArray;
                }

                dataInfo.data = fpDataArray;

                //add data to data queue
                var queueID = object.nodeMAC + '_' + object.nodeGPS_N + '-' + object.nodeGPS_E;

                if (recordDataQueueInfo[queueID]) {
                    recordDataQueueInfo[queueID].push(dataInfo);
                    recordDataQueueInfo[queueID].sort(function(a, b) {
                        return Date.parse(a.time) - Date.parse(b.time);
                    });
                } else {
                    recordDataQueueInfo[queueID] = [dataInfo];
                }

                //set task to clean old data
                if (cleanRecordDataQueueTaskInfo[queueID]) {
                    clearTimeout(cleanRecordDataQueueTaskInfo[queueID]);
                }

                cleanRecordDataQueueTaskInfo[queueID] = setTimeout(function() {
                    delete recordDataQueueInfo[queueID];
                }, 10000);

                if (recordDataQueueInfo[queueID].length < 3) {
                    return;
                }

                //check signal jitter
                var dataQueue = recordDataQueueInfo[queueID];
                var dataIdx = dataQueue.length - 1;
                var sigInfo = {};
                var sigInfoArray = [];
                var sigArray = dataInfo.data;

                for (var sIdx in sigArray) {
                    sigInfo[sigArray[sIdx].gatewayID] = sigArray[sIdx].rssi;
                }

                sigInfoArray.push(sigInfo);

                for (var preIdx = 0; preIdx < dataIdx; preIdx++) {
                    var preSigInfo = {};
                    var preSigArray = dataQueue[preIdx].data;

                    if (sigArray.length != preSigArray.length) {
                        return;
                    }

                    for (var sIdx in preSigArray) {
                        var gwid = preSigArray[sIdx].gatewayID;
                        var sigVal = sigInfo[gwid];
                        var preSigVal = preSigArray[sIdx].rssi;

                        if (!sigVal || Math.abs(sigVal - preSigVal) > tolerance) {
                            return;
                        }

                        preSigInfo[gwid] = preSigVal;
                    }

                    sigInfoArray.push(preSigInfo);
                }

                //update fingerprint data
                if (sigInfoArray.length > 1) {
                    for (var dIdx in fpDataArray) {
                        var gwid = fpDataArray[dIdx].gatewayID;
                        var val = 0;

                        for (var sIdx in sigInfoArray) {
                            val += sigInfoArray[sIdx][gwid];
                        }

                        fpDataArray[dIdx].rssi = Math.round(parseFloat(val) / sigInfoArray.length);
                    }
                }

                //record fingerprint data
                recordFingerprint(mapID, {GPS_N: object.nodeGPS_N, GPS_E: object.nodeGPS_E},
                    fpDataArray, tolerance, function(err, res) {
                });
            });
        }, config.dataCollectionTime);
    } else {
        recordDataInfo[dataID].data = recordDataInfo[dataID].data.concat(validDataArray);
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
    var dataArray = object.Gateway;
    var validDataArray = [];

    for (var idx in dataArray) {
        if (dataArray[idx].snr > 0) {
            validDataArray.push(dataArray[idx]);
        }
    }

    if (validDataArray.length == 0) {
        return callback(genError('COORDINATE_TRANSFER_ERROR', 'Invalid signal data !'));
    }

    var dataID = object.nodeMAC + '-' + Date.parse(object.Gateway[0].time);

    //add data to data information
    if (!queryDataInfo[dataID]) {
        queryDataInfo[dataID] = {};
        queryDataInfo[dataID].time = validDataArray[0].time;
        queryDataInfo[dataID].data = validDataArray;
        queryDataInfo[dataID].callbacks = [callback];

        setTimeout(function() {
            var dataInfo = queryDataInfo[dataID];
            var dataArray = dataInfo.data;
            var cbArray = dataInfo.callbacks;
            var gwidArray = [];
            var validDataArray = [];

            delete queryDataInfo[dataID];

            //discard redundant data
            for (var idx in dataArray) {
                var data = dataArray[idx];
                var extIdx = gwidArray.indexOf(data.gatewayID);

                if (extIdx != -1) {
                    if (data.snr > validDataArray[extIdx].snr) {
                        validDataArray[extIdx] = data;
                    }

                    continue;
                }

                gwidArray.push(data.gatewayID);
                validDataArray.push(data);
            }

            //get map information
            findMapInfo(validDataArray, function(err, res) {
                var mapID = null;
                var gwDataArray = [];
                var tolerance = 3;

                if (!err) {
                    var mapInfo = res.info;

                    //filter by map information
                    var gwList = Object.keys(mapInfo.gateway);

                    for (var idx in validDataArray) {
                        var gwid = validDataArray[idx].gatewayID;

                        for (var gIdx in gwList) {
                            var idList = mapInfo.gateway[gwList[gIdx]].id;

                            if (idList.indexOf(gwid) != -1) {
                                //check very strong signal
                                if (validDataArray[idx].rssi > 0) {
                                    for (var cIdx in queryDataInfo[dataID].callbacks) {
                                        cbArray[cIdx](null, {GpsX: res.GPS_E + mapInfo.gateway[gwid].position, GpsY: mapInfo.GPS_N, Type: 0});
                                    }

                                    return;
                                }

                                validDataArray[idx].gatewayID = gwList[gIdx];
                                gwDataArray.push(validDataArray[idx]);
                                break;
                            }
                        }
                    }

                    mapID = res.id.substring(4);
                    tolerance = mapInfo.tolerance;
                } else {
                    gwDataArray = validDataArray;
                }

                dataInfo.data = gwDataArray;

                //add data to data queue
                var queueID = object.nodeMAC;

                if (queryDataQueueInfo[queueID]) {
                    queryDataQueueInfo[queueID].push(dataInfo);
                    queryDataQueueInfo[queueID].sort(function(a, b) {
                        return Date.parse(a.time) - Date.parse(b.time);
                    });
                } else {
                    queryDataQueueInfo[queueID] = [dataInfo];
                }

                //set task to clean old data
                if (cleanQueryDataQueueTaskInfo[queueID]) {
                    clearTimeout(cleanQueryDataQueueTaskInfo[queueID]);
                }

                cleanQueryDataQueueTaskInfo[queueID] = setTimeout(function() {
                    delete queryDataQueueInfo[queueID];
                }, 10000);

                //try to reduce signal jitter
                var sigInfoArray = [];
                var sigInfo = {};
                var dataQueue = queryDataQueueInfo[queueID];
                var dataIdx = dataQueue.indexOf(dataInfo);
                var sigArray = dataInfo.data;

                for (var sIdx in sigArray) {
                    sigInfo[sigArray[sIdx].gatewayID] = sigArray[sIdx].rssi;
                }

                sigInfoArray.push(sigInfo);

                for (var preIdx = 0; preIdx < dataIdx; preIdx++) {
                    var isValid = true;
                    var preSigInfo = {};
                    var preSigArray = dataQueue[preIdx].data;

                    if (sigArray.length != preSigArray.length) {
                        continue;
                    }

                    for (var sIdx in preSigArray) {
                        var gwid = preSigArray[sIdx].gatewayID;
                        var sigVal = sigInfo[gwid];
                        var preSigVal = preSigArray[sIdx].rssi;

                        if (!sigVal || Math.abs(sigVal - preSigVal) > tolerance) {
                            isValid = false;
                            break;
                        }

                        preSigInfo[gwid] = preSigVal;
                    }

                    if (isValid) {
                        sigInfoArray.push(preSigInfo);
                    }
                }

                //update fingerprint data
                if (sigInfoArray.length > 1) {
                    for (var dIdx in gwDataArray) {
                        var gwid = gwDataArray[dIdx].gatewayID;
                        var val = 0;

                        for (var sIdx in sigInfoArray) {
                            val += sigInfoArray[sIdx][gwid];
                        }

                        gwDataArray[dIdx].rssi = Math.round(parseFloat(val) / sigInfoArray.length);
                    }
                }

                //remove too old data
                if (dataIdx > 1) {
                    queryDataQueueInfo[queueID].splice(0, dataIdx - 1);
                }

                //find fingerprint data
                findFingerprint(mapID, gwDataArray, tolerance, function(err, res) {
                    if (!err) {
                        for (var cIdx in cbArray) {
                            cbArray[cIdx](null, {GpsX: res.GPS_E, GpsY: res.GPS_N, Type: 0});
                        }

                        return;
                    }

                    //only support fingerprint query for indoor positioning
                    if (mapID) {
                        for (var cIdx in cbArray) {
                            cbArray[cIdx](genError('COORDINATE_TRANSFER_ERROR', 'Cannot find location fingerprint !'));
                        }

                        return;
                    }

                    //get station information for location estimation
                    getStationInfo(gwidArray, function(err, res) {
                        if (err) {
                            for (var cIdx in cbArray) {
                                cbArray[cIdx](genError('COORDINATE_TRANSFER_ERROR', err.message));
                            }

                            return;
                        }

                        //convert data for trilateration calculation
                        var base;
                        var circles = [];

                        for (var i = 0; i < gwDataArray.length; i++) {
                            var circle = {x: 0, y: 0};
                            var data = gwDataArray[i];
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

                        for (var cIdx in cbArray) {
                            cbArray[cIdx](null, result);
                        }
                    });
                });
            });
        }, config.dataCollectionTime);
    }
    else {
        queryDataInfo[dataID].data = queryDataInfo[dataID].data.concat(validDataArray);
        queryDataInfo[dataID].callbacks.push(callback);
    }
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
