var EARTH_EQUATORIAL_RADIUS = 6378137.0;
var EARTH_POLAR_RADIUS = 6356755.0;
var EARTH_FLATTENING = (EARTH_EQUATORIAL_RADIUS - EARTH_POLAR_RADIUS) / EARTH_EQUATORIAL_RADIUS;
var distOfCoordinates = distOfCoordinates_GreatCircle;

// Convert circle degree to radian
function degreeToRadian(degree) {
    return degree * Math.PI / 180.0;
}

// Count the distance (meters) of two points with GPS coordinate: p1 {GpsX, GpsY}, p2 {GpsX, GpsY}
// Evaluate by the distance of 1 degree of longitude and latitude
function distOfCoordinates_evaluate(p1, p2) {
    var radLat1 = degreeToRadian(p1.GpsY);
    var radLat2 = degreeToRadian(p2.GpsY);
    var distLat = Math.abs(p1.GpsY - p2.GpsY) * 110574.0;
    var distLng = Math.abs(p1.GpsX - p2.GpsX) * (111320.0 * Math.cos(radLat2));
    var dist = Math.sqrt(Math.pow(distLat, 2) + Math.pow(distLng, 2));
    return dist;
}

// Count the distance (meters) of two points with coordinate: p1 {GpsX, GpsY}, p2 {GpsX, GpsY}
// Reference: Great-circle distance formula
function distOfCoordinates_GreatCircle(p1, p2) {
    var radLng1 = degreeToRadian(p1.GpsX);
    var radLat1 = degreeToRadian(p1.GpsY);
    var radLng2 = degreeToRadian(p2.GpsX);
    var radLat2 = degreeToRadian(p2.GpsY);
    var diffRadLng = radLng2 - radLng1;
    var dist = EARTH_EQUATORIAL_RADIUS * Math.acos(Math.sin(radLat1) * Math.sin(radLat2) + Math.cos(radLat1) * Math.cos(radLat2) * Math.cos(diffRadLng));
    return dist;
}

// Count the distance (meters) of two points with coordinate: p1 {GpsX, GpsY}, p2 {GpsX, GpsY}
// Reference: Haversine's formula
function distOfCoordinates_Haversine(p1, p2) {
    var radLng1 = degreeToRadian(p1.GpsX);
    var radLat1 = degreeToRadian(p1.GpsY);
    var radLng2 = degreeToRadian(p2.GpsX);
    var radLat2 = degreeToRadian(p2.GpsY);
    var diffRadLng = radLng2 - radLng1;
    var diffRadLat = radLat2 - radLat1;
    var dist = 2 * EARTH_EQUATORIAL_RADIUS * Math.asin(Math.sqrt(Math.pow(Math.sin(diffRadLat / 2), 2) + Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(diffRadLng / 2), 2)));
    return dist;
}

// Count the distance (meters) of two points with coordinate: p1 {GpsX, GpsY}, p2 {GpsX, GpsY}
// Reference: Andoyer's formula
function distOfCoordinates_Andoyer(p1, p2) {
    if (p1.GpsX == p2.GpsX && p1.GpsY == p2.GpsY) {
        return 0;
    }
    
    var radLng1 = degreeToRadian(p1.GpsX);
    var radLat1 = degreeToRadian(p1.GpsY);
    var radLng2 = degreeToRadian(p2.GpsX);
    var radLat2 = degreeToRadian(p2.GpsY);
    var sumRadLat = radLat1 + radLat2;
    var diffRadLng = radLng1 - radLng2;
    var diffRadLat = radLat1 - radLat2;
    var valF = (sumRadLat) / 2;
    var valG = (diffRadLng) / 2.0;
    var valL = (diffRadLat) / 2.0;
    var valS = Math.pow(Math.sin(valG), 2) * Math.pow(Math.cos(valL), 2) + Math.pow(Math.cos(valF), 2) * Math.pow(Math.sin(valL), 2);
    var valC = Math.pow(Math.cos(valG), 2) * Math.pow(Math.cos(valL), 2) + Math.pow(Math.sin(valF), 2) * Math.pow(Math.sin(valL), 2);
    var valW = Math.atan(Math.sqrt(valS / valC));
    var valR = Math.sqrt(valS * valC) / valW;
    var valD = 2 * valW * EARTH_EQUATORIAL_RADIUS;
    var valH1 = (3 * valR - 1) / (2 * valC);
    var valH2 = (3 * valR + 1) / (2 * valS);
    
    var dist = valD * (1 + EARTH_FLATTENING * valH1 * Math.pow(Math.sin(valF), 2) * Math.pow(Math.cos(valG), 2) - EARTH_FLATTENING * valH2 * Math.pow(Math.cos(valF), 2) * Math.pow(Math.sin(valG), 2));
    return dist;
}

// Convert the GPS coordinate to Cartesian coordinate (relative to base): coordinate {GpsX, GpsY}, base {GpsX, GpsY}
function convertGPSToCartesian(coordinate, base) {
    var posX = distOfCoordinates({GpsX: coordinate.GpsX, GpsY: base.GpsY}, base);
    
    if (coordinate.GpsX < base.GpsX) {
        posX = -1 * posX;
    }
    
    var posY = distOfCoordinates({GpsX: base.GpsX, GpsY: coordinate.GpsY}, base);

    if (coordinate.GpsY < base.GpsY) {
        posY = -1 * posY;
    }
    
    return {x: posX, y: posY};
}

// Convert the Cartesian coordinate (relative to base) to GPS coordinate: coordinate {x, y}, base {GpsX, GpsY}
function convertCartesianToGPS(coordinate, base) {
    var gpsY = base.GpsY + coordinate.y * 180 / (Math.PI * EARTH_POLAR_RADIUS);
    var gpsX = base.GpsX + coordinate.x * 180 / (Math.PI * EARTH_EQUATORIAL_RADIUS * Math.cos(gpsY * Math.PI / 180.0));
    return {GpsX: gpsX, GpsY: gpsY};
}

exports.distOfCoordinates = distOfCoordinates;
exports.convertGPSToCartesian = convertGPSToCartesian;
exports.convertCartesianToGPS = convertCartesianToGPS;