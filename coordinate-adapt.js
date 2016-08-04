var pjson = require('./package.json');

exports.getVersion = function() {
    console.log(pjson.version);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(station, callback) {
   for(var i =0; i < station.length;  i++){
    console.log(station[i]);
   }


}

//initial station Info db  
exports.InitStation_db = function InitStation_db(dbURL) {
    
}

//initial finger print db  
exports.InitFinger_db = function InitFinger_db(dbURL) {
    
}