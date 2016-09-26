# coordinate-adapt
coordinate-adapt is design for missed GPS node, according to Bases info and RSSI to calculation node's coordinate.

<a name="install"></a>
## Installation
    npm install coordinate-adapt --save

<a name="example"></a>
## Example
	var adapt = require('./coordinate-adapt/coordinate-adapt');

	console.log('Hello SmartLocation test ...');
	
	adapt.InitBase_db('couchbase://127.0.0.1', {bucketname: 'System_Config'});
	
	adapt.InitLF_db({
	    host: 'http://127.0.0.1:9200',
	    index: 'fingerprint-test'
	});
	
	var data = {
        "nodeMAC": "040006e5"
        "nodeDATA": "015cbb017161ef043ac214"
        "Gateway": [
            {
                "rssi": 6,
                "snr": 15,
                "time": "1471248279124",
                "gatewayID": "0000000c437620b1",
                "mac": "abcdef300012",
            },
            {
                "rssi": 1,
                "snr": 12,
                "time": "1471248279124",
                "gatewayID": "00001c497b30b7ee",
                "mac": "abcdef300012",
            }]
        };

	adapt.CoorTrans(data, function(err, result) {
	
	    if (err) {
	        console.log('Check coordinate failed:');
	        console.log(err);
	        return;
	    }
	
	    console.log('Check coordinate result: ' + result.GpsX + ' ' + result.GpsY + ' ' + result.Type);
	
	});

<a name="api"></a>
## API
  * <a href="#InitBase_db"><corde><b>InitBase_db()</b></code></a>
  * <a href="#InitLF_db"><corde><b>InitLF_db()</b></code></a>
  * <a href="#disconnectBase_db"><corde><b>disconnectBase_db()</b></code></a>
  * <a href="#CoorTrans"><corde><b>CoorTrans()</b></code></a>
  * <a href="#NodeGPSInsert"><corde><b>NodeGPSInsert()</b></code></a>

## Status Code

-------------------------------------------------------
<a name="InitBase_db"></a>
### InitBase_db(dbUrl, args, callback)
Initialize Gateway List database
 `dbUrl` is Base list db URL
 `args` is bucket info, name and password (if needed)
    * `bucketname` : Base db's bucket name, string
    * `pw` : access bucket password, fill if needed otherwise empty string, string

			coordinate.InitBase_db('couchbase://127.0.0.1', {bucketname: "base", pw: ''});

 `callback` (err) The callback is passed a argument
    
    Return code: 2001 if initial failed
    
<a name="InitLF_db"></a>
### InitLF_db(configs)
Initialize Location Fingerprint elasticsearch database

`configs` is an object to configure elasticsearch

[Reference elasticsearch Configuration](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options)

	InitLF_db({
        ... config options ...
    });

    ----------------------------------

    InitLF_db({
        host: 'localhost:9200'
    });

<a name="disconnectBase_db"></a>
### disconnectBase_db()
Disconnect base datebase

<a name="CoorTrans"></a>
### CoorTrans(object, callback(err, result))
`object`: content node MAC Data and Those GWs receives data of node

	Following object data format

        CoorTrans({
        "nodeMAC": "040006e5"
        "nodeDATA": ""
        "Gateway": [
            {
                "rssi": 6,
                "snr": 15,
                "time": "1471248279124",
                "gatewayID": "0000000c437620b1",
                "mac": "abcdef300012",
            },
            {
                "rssi": 1,
                "snr": 12,
                "time": "1471248279124",
                "gatewayID": "00001c497b30b7ee",
                "mac": "abcdef300012",
            }]
        }, callback)

 The callback is passed two arguments (err, result), where result is the coordinate.

`err` :

`result`: (object)

 The `result` object with following content:
 * `GpsX` : East Longitude （string）
 * `GpsY` :	North Latitude （string）
 * `Type` : What kind of method to generates the coordinate (int)
    * FingerPrint type is 0
    * Triangulation typs is 1

<a name="NodeGPSInsert"></a>
### NodeGPSInsert(object, callback callback(err))
`object`: content node GPS coordinate and Those GWs receives data of node

	Following object data format

        NodeGPSInsert({
        "nodeGPS_N": "24.871675",
        "nodeGPS_E": "121.009478",
        "nodeMAC": "040006e5"
        "nodeDATA": ""
        "Gateway": [
            {
                "rssi": 6,
                "snr": 15,
                "time": "1471248279124",
                "gatewayID": "0000000c437620b1",
                "mac": "abcdef300012",
            },
            {
                "rssi": 1,
                "snr": 12,
                "time": "1471248279124",
                "gatewayID": "00001c497b30b7ee",
                "mac": "abcdef300012",
            }]
        }, callback)

`callback`(err) The callback is passed a argument

Return code: 2002 if insert failed

-------------------------------------------------------
