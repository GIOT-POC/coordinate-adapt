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
        var gwList = [
            '00001c497b48dcdd', '00001c497b48dce6',
            '00001c497b48dbcf', '00001c497b48dbd5',
            '00001c497b48dbc0', '00001c497b48dbc1',
            '00001c497b48dbf7', '00001c497b48dbfc',
            '00001c497b48dc3e', '00001c497b48db93',
            '00001c497b48dbed', '00001c497b48dbdd'
        ];

        setFingerprintFilter('gps-history_gemtek_8F', gwList, function(err, res) {
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
        return callback(new Error('Invalid fingerprint data !'));
    }

    //discard redundant data
    var dataArray = object.Gateway;
    var idArray = [];
    var validDataArray = [];

    for (var idx in dataArray) {
        if (idArray.indexOf(dataArray[idx].gatewayID) != -1) {
            continue;
        }

        idArray.push(dataArray[idx].gatewayID);
        validDataArray.push(dataArray[idx]);
    }

    var tbID = null;

    //for indoor fingerprint demo
    if (getNodeST(object.nodeDATA, 6) == 1) {
        tbID = 'gps-history_gemtek_8F';
    }

    //record fingerprint data
    recordFingerprint(tbID, {GPS_N: object.nodeGPS_N, GPS_E: object.nodeGPS_E}, validDataArray, function(err, res) {
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
exports.CoorTrans = function CoorTrans(object, callback) {
//    console.log('coordinate-adapt ver. ', pjson.version);

    var dataArray = object.Gateway;

//     for (var i = 0; i < dataArray.length; i++) {
//         console.log(dataArray[i]);
//     }

    //discard redundant data
    var idArray = [];
    var staData = [];

    for (var idx in dataArray) {
        if (idArray.indexOf(dataArray[idx].gatewayID) != -1) {
            continue;
        }

        idArray.push(dataArray[idx].gatewayID);
        staData.push(dataArray[idx]);
    }

    //try to find fingerprint
    var tbID = null;

    //for indoor fingerprint demo
    if (getNodeST(object.nodeDATA, 6) == 1) {
        tbID = 'gps-history_gemtek_8F';
    }

    findFingerprint(tbID, staData, function(err, result) {

        if (err) {
            //console.log('Find fingerprint failed:\n' + err);

            if (getNodeST(object.nodeDATA, 6) == 1) {
                return callback(new Error('Query coordinate failed !'));
            }

            //get station information for location estimation
            getStationInfo(idArray, function(err, res) {
                if (err && (!res || res == {})) {
                    return callback(err);
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

//set fingerprint filter with tbID, gwidList: [GWID], output callback(err, res)
function setFingerprintFilter(tbID, gwidList, callback) {
    var docID = tbID? tbID: 'gps-history';

    // Index document
    elasticObj.client.index({
        index: elasticObj.index,
        type: 'gateway-filter',
        id: docID,
        body: {
            validList: gwidList
        }
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        var result = {created: res.created};
        callback(null, result);
    });
}

//get fingerprint filter with tbID, output callback(err, res)
function getFingerprintFilter(tbID, callback) {
    var docID = tbID? tbID: 'gps-history';

    elasticObj.client.get({
        index: elasticObj.index,
        type: 'gateway-filter',
        id: docID
    }, function (err, res) {
        if (err) {
            return callback(err);
        }

        var result = {validList: res._source.validList};
        callback(null, result);
    });
}

//find fingerprint with input dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function findFingerprint(tbID, dataArray, callback) {
    var table = tbID? tbID: 'gps-history';

    getFingerprintFilter(table, function(err, res) {
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

        var sigArray = validDataArray.map(function(item) {
            var signal = Math.round(item.rssi + item.snr / 10);
            return {GWID: item.gatewayID, signal: signal};
        });

        fingerprint.find(table, sigArray, function(err, res) {
            if (err) {
                return callback(err);
            }

            callback(null, res);
        });
    });
}

//record fingerprint with input tbID, position: {GPS_N, GPS_E}, dataArray: [{gatewayID, rssi, snr, time, mac}], output callback(err, result)
function recordFingerprint(tbID, position, dataArray, callback) {
    var table = tbID? tbID: 'gps-history';

    getFingerprintFilter(table, function(err, res) {
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

        var sigData = validDataArray.map(function(item) {
            var signal = Math.round(item.rssi + item.snr / 10);
            return {GWID: item.gatewayID, signal: signal, time: item.time};
        });

        //record fingerprint data
        fingerprint.record(table, position, sigData, function(err, res) {
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

        if (failCase != '') {
            callback(new Error('Get station information for' + failCase + ' failed !'), tmpResult);
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

//getNodeST( 'Hex String', integer)
//raw: hex string, addr bit addr between 0 to 7, return integer 1 or 0
function getNodeST (raw, addr) {

    if((typeof(addr) != 'number') || (addr < 0 && add > 7)){
        console.log('getNodeST: addr must a number and between 0 to 7');
        return;
    }
    if (raw.length < 2) {
        console.log('getNodeST: input hex string length must long than two words');
        return;
    }

    var bit = Math.pow(2, addr);
    var dataHex = new Buffer(raw, 'hex')[0]; // translate string to hex encoding

    if (!dataHex) {
        console.log('getNodeST: input string not hex');
        return;
    }

    if(dataHex & bit){
        return 1;
    } else {
        return 0;
    }
}
