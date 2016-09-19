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
    fingerprint.setupDB(configs.host, configs.index);
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
exports.NodeGPSInsert = function NodeGPSInsert(nodeGroup, callback) {
    console.log('Gateway count', nodeGroup.Gateway.length);
    recordFingerprint(nodeGroup, function(err, res) {
        if (!callback) {
            return;
        }

        if (err) {
            return callback(status_code.NODE_INSERT_ERROR);
        }

        callback(null);
    });
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(station, callback) {
    console.log('coordinate-adapt ver. ', pjson.version);

//     for (var i = 0; i < station.length; i++) {
//         console.log(station[i]);
//     }

    //discard redundant data
    var idArray = [];
    var staData = [];

    for (var idx in station) {
        if (idArray.indexOf(station[idx].GWID) != -1) {
            continue;
        }

        idArray.push(station[idx].GWID);
        staData.push(station[idx]);
    }

    //try to find finger print
    findFingerprint(staData, function(err, result) {
        if (err) {
            //console.log('Find fingerprint failed:\n' + err);

            //get station information for location estimation
            getStationInfo(idArray, function(err, res) {
                if (err) {
                    console.log('Get station information failed:');
                    console.log(err);
                    return callback(err);
                }

                //convert data for trilateration calculation
                var base;
                var circles = [];

                for (var i = 0; i < staData.length; i++) {
                    var circle = {x: 0, y: 0};
                    var data = staData[i];
                    var info = res[data.GWID];

                    if (info) {
                        var coordinate = {GpsX: parseFloat(info.GpsX), GpsY: parseFloat(info.GpsY)};

                        if (!base) {
                            base = coordinate
                        } else {
                            circle = geoUtil.convertGPSToCartesian(coordinate, base);
                        }

                        var signal = Math.round(parseFloat(data.RSSI) + parseFloat(data.SNR) / 10);
                        circle.r = trilateration.countDistanceByRSSI(signal);
                        circles.push(circle);
                    }
                }

                var point = trilateration.intersect(circles);
                var gps = geoUtil.convertCartesianToGPS(point, base);
                var result = {GpsX: gps.GpsX.toString(), GpsY: gps.GpsY.toString(), Type: 1};
                return callback(null, result);
            });
        }

        return callback(null, {GpsX: result.GPS_E, GpsY: result.GPS_N, Type: 0});
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

//find fingerprint with input dataArray: [{GWID, RSSI, SNR}], output callback(err, result)
function findFingerprint(dataArray, callback) {
    var sigArray = dataArray.map(function(item) {
        var signal = Math.round(parseInt(item.RSSI) + parseFloat(item.SNR) / 10);
        return {GWID: item.GWID, signal: signal};
    });

    fingerprint.find(sigArray, function(err, res) {
        if (err) {
            return callback(err);
        }

        callback(null, res);
    });
}

//record fingerprint with input fpData: {nodeGPS_N, nodeGPS_E, Gateway}, output callback(err, result)
//Gateway: [{rssi, snr, time, gatewayID, mac}]
function recordFingerprint(fpData, callback) {
    if (!fpData || !fpData.nodeGPS_N || !fpData.nodeGPS_E || !fpData.Gateway || fpData.Gateway.length == 0) {
        callback(new Error('Invalid fingerprint data !'));
        return;
    }

    var pos = {GPS_N: fpData.nodeGPS_N, GPS_E: fpData.nodeGPS_E};
    var sigData = fpData.Gateway.map(function(item) {
        var signal = Math.round(item.rssi + item.snr / 10);
        return {GWID: item.gatewayID, signal: signal, time: item.time};
    });

    fingerprint.record(pos, sigData, function(err, res) {
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
        var failCase = '';

        for (var i = 0; i < dataArray.length; i++) {
            var gwid = dataArray[i];
            var info = infoList[gwid];

            if (!info) {
                failCase += (' ' +  gwid);
                continue;
            }

            tmpResult[gwid] = info;
        }

        if (Object.keys(tmpResult).length < dataArray.length && failCase != '') {
            callback(new Error('Get station information for' + failCase + ' failed !'));
            return;
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
