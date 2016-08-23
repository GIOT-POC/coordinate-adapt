var util = require('util');
var pjson = require('./package.json');
var couchbase = require('couchbase');
var trilateration = require('./lib/trilateration');
var geoUtil = require('./lib/geo_utility');
var elasticsearch = require('elasticsearch');
var status_code = require('./lib/status_code.js')

var RSSI_REF_VALUE = -73;
var RSSI_LOSS_CONSTANT = 1.1097481333265906;

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
exports.InitLF_db = function InitLF_db(dbURL, [args]) {
    console.log('Start initial FL db');
    var cluster = new couchbase.Cluster(dbURL);
    buckets.LF = cluster.openBucket(args.bucketname, args.pw);
}

//initial station Info db
exports.InitBase_db = function InitBase_db(dbURL, [args]) {
    console.log('Start initial Base db');
    var cluster = new couchbase.Cluster(dbURL);
    buckets.Base = cluster.openBucket(args.bucketname, args.pw);
    // var bucket = cluster.openBucket('System_Config');
    // bucket.get('TRACKER-gxcJqqvNOD_gwid_geoinfo_mapping', function (err, result) {
    //     if (err) throw err;
    //     console.log(result.value);
    // });
}

//Initial Local Fingerprint elasticsearch
exports.InitLF_search = function InitLF_search(configs) {
    console.log(configs);
    console.log('Start initial LF elasticsearch ');
    elasticObj.client = elasticsearch.Client(configs);
}

exports.disconnectBase_db = function disconnectBase_db() {
    console.log('Disconnect Base db');
    buckets.Base.disconnect();
}

exports.disconnectLF_db = function disconnectLF_db() {
    console.log('Disconnect FL db');
    buckets.LF.disconnect();
}

// Saves effect GPS coordinate of NODE
exports.NodeGPSInsert = function NodeGPSInsert(nodeGroup) {
    console.log('Gateway count', nodeGroup.Gateway.length);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(station, callback) {
    console.log('coordinate-adapt ver. ', pjson.version);

    // for (var i = 0; i < station.length; i++) {
    //     console.log(station[i]);
    // }

    //try to find finger print
    findFingerprint(station, function(err, result) {
        if (err) {
            console.log('Find fingerprint failed:\n' + err);

            //get station information for location estimation
            var idArray = station.map(function(item) {
                return item.GWID;
            });

            getStationInfo(idArray, function(err, result) {
                if (err) {
                    console.log('Get station information failed:');
                    console.log(err);
                    return callback(err);
                }

                //convert data for trilateration calculation
                var base;
                var circles = [];

                for (i = 0; i < station.length; i++) {
                    var circle = {x: 0, y: 0};
                    var data = station[i];
                    var info = result[data.GWID];
                    var coordinate = {GpsX: parseFloat(info.GpsX), GpsY: parseFloat(info.GpsY)};

                    if (!base) {
                        base = coordinate
                    } else {
                        circle = geoUtil.convertGPSToCartesian(coordinate, base);
                    }

                    circle.r = countDistanceBySignal(parseFloat(data.RSSI), parseFloat(data.SNR));
                    circles.push(circle);
                }

                var point = trilateration.intersect(...circles);
                var gps = geoUtil.convertCartesianToGPS(point, base);
                callback(gps.GpsX.toString(), gps.GpsY.toString(), 1);
            });
        }

        //todo: return result
    });
}

//find finger print with input dataArray: [{GWID, RSSI}], output callback(err, result)
function findFingerprint(dataArray, callback) {
    //todo: implement find fingerprint
    return callback(new Error('Function unimplemented !'));
}

//get station information with input dataArray: [GWID], output callback(err, result)
function getStationInfo(dataArray, callback) {
    if (!buckets.Base) {
        return callback(new Error('Database is not set !'));
    }

    buckets.Base.get('TRACKER-gxcJqqvNOD_gwid_geoinfo_mapping', function(err, result) {
        if (err) {
            return callback(err);
        }

        var infoList = result.value.mapping_list;
        var tmpResult = {};
        var failCase = '';

        for (i = 0; i < dataArray.length; i++) {
            var gwid = dataArray[i];
            var info = infoList[gwid];

            if (!info) {
                failCase += (' ' +  gwid);
                continue;
            }

            tmpResult[gwid] = info;
        }

        if (Object.keys(tmpResult).length < dataArray.length) {
            return callback(new Error('Get station information for' + failCase + ' failed !'));
        }

        callback(null, tmpResult);
    });
}

//count distance by signal
//formula: RSSI = A - 10 * n * lg d
function countDistanceBySignal(rssi, snr, refValue, lossConst) {
    //set variables
    var signal = snr ? rssi + snr / 10 : rssi;
    var ref = refValue;
    var loss = lossConst;

    if (!ref) {
        ref = RSSI_REF_VALUE;
    }

    if (!loss) {
        loss = RSSI_LOSS_CONSTANT;
    }

    var power = (ref - signal) / (10 * loss);
    return Math.pow(10, power);
}