# coordinate-adapt
coordinate-adapt is design for node, according to Bases info and RSSI to calculation node's coordinate.

<a name="install"></a>
## Installation
    npm install coordinate-adapt --save

<a name="example"></a>
## Example

<a name="api"></a>
## API
  * <a href="#InitBase_db"><corde><b>InitBase_db()</b></code></a>
  * <a href="#InitLF_db"><corde><b>InitLF_db()</b></code></a>
  * <a href="#disconnectBase_db"><corde><b>disconnectBase_db()</b></code></a>
  * <a href="#disconnectLF_db"><corde><b>disconnectLF_db()</b></code></a>
  * <a href="#CoorTrans"><corde><b>CoorTrans()</b></code></a>
  
## Status Code

-------------------------------------------------------
<a name="InitBase_db"></a>
### InitBase_db(dbUrl, [args])
Initialize GateWay Base List database
 * `dbUrl` is Base list db URL
 * `args` is bucket info, name and password (if needed)
    * `bucketname` : Base db's bucket name, string
    * `pw` : access bucket password, fill if needed otherwise empty string, string

			coordinate.InitBase_db('couchbase://127.0.0.1', [{bucketname: "base", pw: ''}]);

<a name="InitLF_db"></a>
### InitLF_db(dbUrl, [args])
Initialize Location Fingerprint database
 * `dbUrl` is LF db URL
 * `args` is bucket info, name and password (if needed)
    * `bucketname` : LF db's bucket name, string
    * `pw` : access bucket password, fill if needed otherwise empty string, string

			coordinate.InitLF_db('couchbase://127.0.0.1', [{bucketname: "finger", pw: ''}]);

<a name="disconnectBase_db"></a>
### disconnectBase_db()
Disconnect base datebase

<a name="disconnectLF_db"></a>
### disconnectLF_db()
Disconnect Localtion Fingerprint database

<a name="CoorTrans"></a>
### CoorTrans([option], callback)
To make a assessment of the Node's coordinate.

`options` is an object content `GWID`, `RSSI` and `SNR` with the following defaults:
 * `GWID` : the gateway ID, string
 * `RSSI` : Received Signal Strength Indicator, string
 * `SNR` : Signal-to-noise ratio, string

		CoorTrans([{GWID: "111ABC12345", RSSI:"-13", SNR: ""},
                    {GWID: "222ABC12345", RSSI:"-43", SNR: ""},
                    {GWID: "333ABC12345", RSSI:"-23", SNR: ""}], callback)
 The callback is called when the coordinate has been Calculated.

 The callback with following format:
 * `GpsX` : East Longitude （string）
 * `GpsY` :	North Latitude （string）
 * `Type` : What kind of method to generates the coordinate (int)
    * FingerPrint type is 0
    * Triangulation typs is 1

        	callback({GpsX: "",
                        GpsY: "",
                        Type: ,
                      })

-------------------------------------------------------