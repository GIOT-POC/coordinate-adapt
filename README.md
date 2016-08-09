# coordinate-adapt
coordinate-adapt is design for node, according to stations info and RSSI to calculation node's coordinate.

<a name="install"></a>
## Installation
    npm install coordinate-adapt --save

<a name="example"></a>
## Example

<a name="api"></a>
## API
  * <a href="#InitStation_db"><corde><b>InitStation_db()</b></code></a>
  * <a href="#InitLF_db"><corde><b>InitLF_db()</b></code></a>
  * <a href="#CoorTrans"><corde><b>CoorTrans()</b></code></a>
  

-------------------------------------------------------
<a name="InitStation_db"></a>
### InitStation_db(dbUrl)
Initialize station database 
 * `dbUrl` is station list db URL

<a name="InitLF_db"></a>
### InitLF_db(dbUrl)
Initialize database 
 * `dbUrl` is LF db URL

<a name="CoorTrans"></a>
### CoorTrans([station], callback)
To make a assessment of the Node's coordinate.
 * `station` is a array content station INFO object `GWID` and `RSSI`
 
 * The callback is called when the coordinate has been Calculated.

		CoorTrans([{"GWID": "111ABC12345", "RSSI":"-13db"},
        			{"GWID": "222ABC12345", "RSSI":"-43db"},
                    {"GWID": "333ABC12345", "RSSI":"-23db"}], callback)



-------------------------------------------------------

