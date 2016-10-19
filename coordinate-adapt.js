var util = require('util');
var pjson = require('./package.json');
var couchbase = require('couchbase');
var trilateration = require('./lib/trilateration');
var geoUtil = require('./lib/geo_utility');
var elasticsearch = require('elasticsearch');
var status_code = require('./lib/status_code.js')
var fingerprint = require('./lib/fingerprint');

//db object
var buckets = {
    Base: function () { },
    LF: function () { }
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
            return;
        }

        console.log('Elasticsearch cluster is OK !');

        fingerprint.setupDB(elasticObj.client, configs.index);

        //for indoor fingerprint demo
        var info = {tolerance: 5};

        var gwList = [
            '00001c497b48dcdd', '00001c497b48dce6',
            '00001c497b48dbcf', '00001c497b48dbd5',
            '00001c497b48dbc0', '00001c497b48dbc1',
            '00001c497b48dbf7', '00001c497b48dbfc',
            '00001c497b48dc3e', '00001c497b48db93',
            '00001c497b48dbed', '00001c497b48dbdd'
        ];

        info.validList = gwList;

        setGatewayInfo('gemtek_8F', info, function(err, res) {
        });
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
//            status_code.DB_INITIAL_ERROR.message = status_code.DB_INITIAL_ERROR.message + err;
//            callback(status_code.DB_INITIAL_ERROR);
            callback(genError('DB_INITIAL_ERROR', err.message));
            return;
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
    var time = Date.now().toString();
    logDataToDB('log-data-gps', time, object);

    //discard redundant data
    var dataArray = object.Gateway;
    var idArray = [];
    var validDataArray = [];

    for (var idx in dataArray) {
        var extIdx = idArray.indexOf(dataArray[idx].gatewayID);

        if (extIdx != -1) {
            if (dataArray[idx].time > dataArray[extIdx].time) {
                validDataArray[extIdx] = dataArray[idx];
            }

            continue;
        }

        idArray.push(dataArray[idx].gatewayID);
        validDataArray.push(dataArray[idx]);
    }

    var mapID = null;

    //for indoor fingerprint demo
    if (getNodeST(object.nodeDATA, 6) == 1) {
        mapID = 'gemtek_8F';
    }

    //record fingerprint data
    recordFingerprint(mapID, {GPS_N: object.nodeGPS_N, GPS_E: object.nodeGPS_E}, validDataArray, function(err, res) {
        if (!callback) {
            return;
        }

        if (err) {
            return callback(genError('NODE_INSERT_ERROR', err.message));
        }

        callback(null);
    });
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(object, callback) {
//    console.log('coordinate-adapt ver. ', pjson.version);

    var dataArray = object.Gateway;

//     for (var i = 0; i < dataArray.length; i++) {
//         console.log(dataArray[i]);
//     }

    //for develop & debug
    var time = Date.now().toString();
    logDataToDB('log-data-query', time, object);

    //discard redundant data
    var idArray = [];
    var staData = [];

    for (var idx in dataArray) {
        var extIdx = idArray.indexOf(dataArray[idx].gatewayID);

        if (extIdx != -1) {
            if (dataArray[idx].time > dataArray[extIdx].time) {
                staData[extIdx] = dataArray[idx];
            }

            continue;
        }

        idArray.push(dataArray[idx].gatewayID);
        staData.push(dataArray[idx]);
    }

    //try to find fingerprint
    var mapID = null;

    //for indoor fingerprint demo
    if (getNodeST(object.nodeDATA, 6) == 1) {
        mapID = 'gemtek_8F';
    }

    findFingerprint(mapID, staData, function(err, result) {
        if (!err) {
            return callback(null, {GpsX: result.GPS_E, GpsY: result.GPS_N, Type: 0});
        }

        //console.log('Find fingerprint failed:\n' + err);

        if (getNodeST(object.nodeDATA, 6) == 1) {
            return callback(genError('COORDINATE_TRANSFER_ERROR'));
        }

        //filter invalid data by signal
        var validDataArray = [];

        for (var idx in staData) {
            if (staData[idx].snr < 0) {
                idArray.splice(idx, 1);
                continue;
            }

            validDataArray.push(staData[idx]);
        }

        if (validDataArray.length == 0) {
            return callback(genError('COORDINATE_TRANSFER_ERROR', 'Invalid signal data !'));
        }

        //get station information for location estimation
        getStationInfo(idArray, function(err, res) {
            if (err && !res) {
                return callback(genError('COORDINATE_TRANSFER_ERROR', err.message));
            }

            //convert data for trilateration calculation
            var base;
            var circles = [];

            for (var i = 0; i < staData.length; i++) {
                var circle = {x: 0, y: 0};
                var data = staData[i];
                var info = res[data.gatewayID];

                if (info) {
                    var coordinate = {GpsX: parseFloat(info.GpsX), GpsY: parseFloat(info.GpsY)};

                    if (!base) {
                        base = coordinate
                    } else {
                        circle = geoUtil.convertGPSToCartesian(coordinate, base);
                    }

                    var signal = Math.round(data.rssi + data.snr / 10);
                    circle.r = trilateration.countDistanceByRSSI(signal);
                    circles.push(circle);
                }
            }

            var point = trilateration.intersect(circles);
            var gps = geoUtil.convertCartesianToGPS(point, base);
            var result = {GpsX: gps.GpsX.toString(), GpsY: gps.GpsY.toString(), Type: 1};

            return callback(null, result);
        });
    });
}

//calculate the RSSI reference value and path loss exponent for the station
//exports.CalculateRSSIConstants = function CalculateRSSIConstants(GWID, dataArray, callback) {
//    getStationInfo([GWID], function(err, res) {
//        if (err) {
//            callback(err);
//            return;
//        }
//
//        var station = {GpsX: parseFloat(res[GWID].GpsX), GpsY: parseFloat(res[GWID].GpsY)};
//
//        if (dataArray == null || dataArray.length <= 1) {
//            return;
//        }
//
//        var inputArray = [];
//
//        for (var idx in dataArray) {
//            var item = dataArray[idx];
//            var dist = geoUtil.distOfCoordinates(station,
//                {GpsX: parseFloat(item.nodeGPS_E), GpsY: parseFloat(item.nodeGPS_N)});
//
//            if (dist == 0) {
//                continue;
//            }
//
//            var sig = Math.round(parseInt(item.rssi) + parseFloat(item.snr) / 10);
//
//            inputArray.push({dist: dist, rssi: sig});
//        }
//
//        var result = trilateration.calculateRSSIConstants(inputArray);
//        callback(result);
//    })
//}

//set fingerprint filter with mapID, gwidList: [GWID], output callback(err, res)
function setGatewayInfo(mapID, info, callback) {
    if (!mapID || mapID == '') {
        return callback(new Error('Set gateway information failed: invalid map ID !'));
    }

    // Index document
    elasticObj.client.index({
        index: elasticObj.index,
        type: 'gateway-info',
        id: mapID,
        body: info
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        var result = {created: res.created};
        callback(null, result);
    });
}

//get fingerprint filter with mapID, output callback(err, res)
function getGatewayInfo(mapID, callback) {
    if (!mapID || mapID == '') {
        return callback(new Error('Get gateway information failed: invalid map ID !'));
    }

    elasticObj.client.get({
        index: elasticObj.index,
        type: 'gateway-info',
        id: mapID
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        callback(null, res._source);
    });
}

//find fingerprint with input mapID, dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function findFingerprint(mapID, dataArray, callback) {
    var map = mapID? mapID: '';

    getGatewayInfo(map, function(err, res) {
        //filter invalid data
        var tolerance = 5;
        var validDataArray = [];

        if (!err) {
            tolerance = res.tolerance;
            var validList = res.validList;

            for (var idx in dataArray) {
                var gwid = dataArray[idx].gatewayID;

                if (validList.indexOf(gwid) != -1) {
                    validDataArray.push(dataArray[idx]);
                }
            }
        } else {
            validDataArray = dataArray;
        }

        if (validDataArray.length == 0) {
            return callback(new Error('Invalid fingerprint data !'));
        }

        //check signal data
        for (var idx in validDataArray) {
            if (validDataArray[idx].snr < 0) {
                return callback(new Error('Invalid fingerprint data !'));
            }
        }

        //sort valid data array
        validDataArray.sort(function(a, b) {
            if (a.time == b.time) {
                if (a.gatewayID > b.gatewayID) {
                    return 1;
                }

                return -1;
            }

            return a.time - b.time;
        })

        var sigArray = validDataArray.map(function(item) {
            var signal = Math.round(item.rssi + item.snr / 10);
            return {GWID: item.gatewayID, signal: signal};
        });

        var table = 'gps-history';

        if (map != '') {
            table += '_' + map;
        }

        fingerprint.find(table, tolerance, sigArray, function(err, res) {
            if (err) {
                return callback(err);
            }

            callback(null, res);
        });
    });
}

//record fingerprint with input mapID, position: {GPS_N, GPS_E}, dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function recordFingerprint(mapID, position, dataArray, callback) {
    var map = mapID? mapID: '';

    getGatewayInfo(map, function(err, res) {
        //filter invalid data
        var validDataArray = [];

        if (!err) {
            var validList = res.validList;

            for (var idx in dataArray) {
                var gwid = dataArray[idx].gatewayID;

                if (validList.indexOf(gwid) != -1) {
                    validDataArray.push(dataArray[idx]);
                }
            }
        } else {
            validDataArray = dataArray;
        }

        if (validDataArray.length == 0) {
            return callback(new Error('Invalid fingerprint data !'));
        }

        //check signal data
        for (var idx in validDataArray) {
            if (validDataArray[idx].snr < 0) {
                return callback(new Error('Invalid fingerprint data !'));
            }
        }

        //sort valid data array
        validDataArray.sort(function(a, b) {
            if (a.time == b.time) {
                if (a.gatewayID > b.gatewayID) {
                    return 1;
                }

                return -1;
            }

            return a.time - b.time;
        })

        var sigDataArray = validDataArray.map(function(item) {
            var signal = Math.round(item.rssi + item.snr / 10);
            return {GWID: item.gatewayID, signal: signal, time: item.time};
        });

        //record fingerprint data
        var table = 'gps-history';

        if (map != '') {
            table += '_' + map;
        }

        fingerprint.record(table, position, sigDataArray, function(err, res) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, res);
        });
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
        var failCase = '';

        for (var i = 0; i < dataArray.length; i++) {
            var gwid = dataArray[i].substring(4).toUpperCase();
            var info = infoList[gwid];

            if (!info) {
                failCase += (' ' +  dataArray[i]);
                continue;
            }

            tmpResult[dataArray[i]] = info;
        }

        if (Object.keys(tmpResult).length == 0) {
            tmpResult = null;
        }

        if (failCase != '') {
            return callback(new Error('Get station information for' + failCase + ' failed !'), tmpResult);
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

    var bit = Math.pow(2, addr);
    var dataHex = new Buffer(raw, 'hex')[0]; // translate string to hex encoding

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
function logDataToDB(type, id, data, callback) {
    // Index document
    elasticObj.client.index({
        index: elasticObj.index,
        type: type,
        id: id,
        body: data
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
