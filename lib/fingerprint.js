var util = require('util');
var elasticsearch = require('elasticsearch');
var client;
var dbIndex;

function setupDB(url, index) {
    client = new elasticsearch.Client({
        host: url
    });

    dbIndex = index;

    client.ping({
        requestTimeout: 3000,
        hello: "elasticsearch!"
    }, function (error) {
        if (error) {
            console.log('Elasticsearch cluster is down !');
        } else {
            console.log('Elasticsearch cluster is OK !');
        }
    });
}

function find(dataArray, callback) {
    var chaValue = countCharacteristicValue(dataArray);
    console.log('Check cha value: ' + chaValue);

    client.search({
        index: dbIndex,
        type: "gps-history",
        body: {
            query: {
                filtered: {
                    query: {
                        match_all: {}
                    },
                    filter: {
                        bool: {
                            must: {
                                term: {
                                    characteristic: chaValue
                                },
                  term: {
                      signal: -20
                  }
//                                range: {
//                                    "1c497b3b8027": {
//                                        gte: -21,
//                                        lte: -19
//                                    }
//                                }
                            }
                        }
                    }
//                    filter: {
//                        term: {
//                  
//                        }
//                    }
                }
            }
        }
    }).then(function (resp) {
        var hits = resp.hits.hits;
        console.log('Fingerprint find result: ' + hits.length);
        console.log(util.inspect(hits));
    }, function (err) {
        console.log('Fingerprint find failed: ' + err.message);
    });
}

function countCharacteristicValue(dataArray) {
    var value = '';

    for (i = 0; i < dataArray.length; i++) {
        if (i > 0) {
            value += '_';
        }

        value += dataArray[i].GWID.toLowerCase();
    }

    return value;
}

exports.setupDB = setupDB;
exports.find = find;