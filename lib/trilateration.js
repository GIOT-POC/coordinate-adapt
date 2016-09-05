// Count the distance of two points with Cartesian coordinate: p1 {x, y}, p2 {x, y}
function countDistanceOfPoints(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Get intersection point(s) of two circles: c1 {x, y, r}, c2 {x, y, r}
function intersectionOfTwoCircles(c1, c2) {
    var result = []
    var p1 = {};
    var p2 = {};

    if (c1.x == c2.x && c1.y == c2.y) {
        return {x: c1.x, y: c1.y};
    }

    var dist = countDistanceOfPoints(c1, c2);
    var r1 = c1.r;
    var r2 = c2.r;

    // Tune radius
    if (dist > r1 + r2) {
        var offset = (dist - r1 -r2) / 2;
        r1 += offset;
        r2 += offset;
    } else if (r1 > r2 && r1 > dist + r2) {
        var offset = (r1 - dist - r2) / 2;
        r1 -= offset;
        r2 += offset;
    } else if (r2 > dist + r1) {
        var offset = (r2 - dist - r1) / 2;
        r1 += offset;
        r2 -= offset;
    }

    if (c1.y != c2.y) {
        // y = m * x + k
        var m = (c1.x - c2.x) / (c2.y - c1.y);
        var k = (Math.pow(r1, 2) - Math.pow(r2, 2) + Math.pow(c2.x, 2) - Math.pow(c1.x , 2) + Math.pow(c2.y, 2) - Math.pow(c1.y, 2)) / (2 * (c2.y - c1.y));

        // a * x^2 + b * x + c
        var a = 1 + Math.pow(m, 2);
        var b = 2 * (m * k - m * c2.y - c2.x);
        var c = Math.pow(c2.x, 2) + Math.pow(c2.y, 2) + Math.pow(k, 2) - 2 * k * c2.y - Math.pow(r2, 2);
        var diff = Math.pow(b, 2) - 4 * a * c;

        if (diff <= 0) {
            diff = 0;
        } else {
            diff = Math.sqrt(diff);
        }

        if (diff == 0) {
            p1.x = -1 * b / (2 * a);
            p1.y = m * p1.x + k;
            result.push(p1);
        } else {
            p1.x = (-1 * b + diff) / (2 * a);
            p1.y = m * p1.x + k;
            p2.x = (-1 * b - diff) / (2 * a);
            p2.y = m * p2.x + k;
            result.push(p1);
            result.push(p2);
        }
    } else {
        p1.x = (-1 * Math.pow(c1.x, 2) + Math.pow(c2.x, 2) + Math.pow(r1, 2) - Math.pow(r2, 2))
        / (2 * (c2.x - c1.x));
        p2.x = p1.x;

        // y^2 + b * y + c = 0
        var b = -2 * c1.y;
        var c = Math.pow(p1.x, 2) + Math.pow(c1.x, 2) - 2 * c1.x * p1.x + Math.pow(c1.y, 2) - Math.pow(r1, 2);
        var diff = Math.pow(b, 2) - 4 * c;

        if (diff <= 0) {
            diff = 0;
        } else {
            diff = Math.sqrt(diff);
        }

        if (diff == 0) {
            p1.y = -1 * b / 2;
            result.push(p1);
        } else {
            p1.y = (-1 * b + diff) / 2;
            p2.y = (-1 * b - diff) / 2;
            result.push(p1);
            result.push(p2);
        }
    }

    return result
}

// Get intersection point of circle(s): circle {x, y, r}
function intersect([circles]) {
    var result = {x: 0.0, y: 0.0};

    if (circles.length == 1) {
        result.x = circles[0].x;
        result.y = circles[0].y;
    } else if (circles.length == 2) {
        var points = intersectionOfTwoCircles(circles[0], circles[1]);

        if (points.length == 2) {
            result.x = (points[0].x + points[1].x) / 2
            result.y = (points[0].y + points[1].y) / 2
        } else {
            result.x = points[0].x;
            result.y = points[0].y;
        }
    } else if (circles.length >= 3) {
        var tmpResults = [];

        for (var i = 0; i < circles.length; i++) {
            for (var j = i + 1; j < circles.length; j++) {
                var points = intersectionOfTwoCircles(circles[i], circles[j]);

                if (points.length == 1) {
                    tmpResults.push(points[0]);
                } else {
                    var distTotal1 = 0;
                    var distTotal2 = 0;

                    for (var k = 0; k < circles.length; k++) {
                        distTotal1 += countDistanceOfPoints(points[0], circles[k]);
                        distTotal2 += countDistanceOfPoints(points[1], circles[k]);
                    }

                    if (distTotal1 > distTotal2) {
                        tmpResults.push(points[1]);
                    } else {
                        tmpResults.push(points[0]);
                    }
                }
            }
        }

        var xTotal = 0;
        var yTotal = 0;

        for (var i = 0; i < tmpResults.length; i++) {
            xTotal += tmpResults[i].x;
            yTotal += tmpResults[i].y;
        }

        result.x = xTotal / tmpResults.length;
        result.y = yTotal / tmpResults.length;
    }

    return result;
}

exports.intersect = intersect