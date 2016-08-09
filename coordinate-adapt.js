var pjson = require('./package.json');

//db object
var buckets = {
    StationInfo: function () { },
    Finger: function () { }
};

exports.getVersion = function () {
    console.log(pjson.version);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(station, callback) {
    for (var i = 0; i < station.length; i++) {
        console.log(station[i]);
    }


}

//initial station Info db
exports.InitStation_db = function InitStation_db(dbURL) {
    console.log('Start initial StationInfo db');
    var couchbase = require('couchbase')
    var cluster = new couchbase.Cluster(dbURL);
    buckets.StationInfo = cluster.openBucket('System_Config');
    // var bucket = cluster.openBucket('System_Config');
    // bucket.get('TRACKER-gxcJqqvNOD_gwid_geoinfo_mapping', function (err, result) {
    //     if (err) throw err;
    //     console.log(result.value);
    // });
}

//initial Location FingerPrint db
exports.InitLF_db = function InitLF_db(dbURL) {

}