var pjson = require('./package.json'),
    couchbase = require('couchbase');


//db object
var buckets = {
    Base: function () { },
    LF: function () { }
};

exports.getVersion = function () {
    console.log(pjson.version);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(station, callback) {
    console.log('coordinate-adapt ver. ', pjson.version);

    for (var i = 0; i < station.length; i++) {
        console.log(station[i]);
    }


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

//initial Location LFPrint db
exports.InitLF_db = function InitLF_db(dbURL, [args]) {
    console.log('Start initial FL db');
    var cluster = new couchbase.Cluster(dbURL);
    buckets.LF = cluster.openBucket(args.bucketname, args.pw);
}

exports.disconnectBase_db = function disconnectBase_db() {
    console.log('Disconnect Base db');
    buckets.Base.disconnect();
}

exports.disconnectLF_db = function disconnectLF_db() {
    console.log('Disconnect FL db');
    buckets.LF.disconnect();
}