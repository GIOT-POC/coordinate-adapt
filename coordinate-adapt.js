var pjson = require('./package.json');

exports.getVersion = function() {
    console.log(pjson.version);
}

//coordinate position transfer
exports.CoorTrans = function CoorTrans(callback, ...params) {
   for(var i in arguments){
    console.log('i:\t', i, '\t', arguments[i]);
   }


}

// statsionsURL is station Info db , fingerURL is finger print db  
exports.init_db = function init_db(statsionsURL, fingerURL) {
    
}