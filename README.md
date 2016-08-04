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
  * <a href="#InitFinger_db"><corde><b>InitFinger_db()</b></code></a>
  * <a href="#CoorTrans"><corde><b>CoorTrans()</b></code></a>
  

-------------------------------------------------------
<a name="InitStation_db"></a>
### InitStation_db(dbUrl)
Initialize station database 
 * `dbUrl` is station list db URL

<a name="InitFinger_db"></a>
### InitFinger_db(dbUrl)
Initialize database 
 * `dbUrl` is finger db URL

<a name="CoorTrans"></a>
### CoorTrans([station], callback)
To make a assessment of the Node's coordinate.
 * `station` is a array content station INFO object `MAC` and `RSSI` 
 
 * The callback is called when the coordinate has been Calculated.

		CoorTrans([{"MAC": "xx:xx:xx:xx:xx", "RSSI":"-13db"}, 
        			{"MAC": "xx:xx:xx:xx:xx", "RSSI":"-43db"}, 
                    {"MAC": "xx:xx:xx:xx:xx", "RSSI":"-23db"}], callback)



-------------------------------------------------------

