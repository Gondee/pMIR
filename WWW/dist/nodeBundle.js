(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');

// https://github.com/lutzroeder/Mapack/blob/master/Source/CholeskyDecomposition.cs
function CholeskyDecomposition(value) {
    if (!(this instanceof CholeskyDecomposition)) {
        return new CholeskyDecomposition(value);
    }
    value = Matrix.checkMatrix(value);
    if (!value.isSymmetric())
        throw new Error('Matrix is not symmetric');

    var a = value,
        dimension = a.rows,
        l = new Matrix(dimension, dimension),
        positiveDefinite = true,
        i, j, k;

    for (j = 0; j < dimension; j++) {
        var Lrowj = l[j];
        var d = 0;
        for (k = 0; k < j; k++) {
            var Lrowk = l[k];
            var s = 0;
            for (i = 0; i < k; i++) {
                s += Lrowk[i] * Lrowj[i];
            }
            Lrowj[k] = s = (a[j][k] - s) / l[k][k];
            d = d + s * s;
        }

        d = a[j][j] - d;

        positiveDefinite &= (d > 0);
        l[j][j] = Math.sqrt(Math.max(d, 0));
        for (k = j + 1; k < dimension; k++) {
            l[j][k] = 0;
        }
    }

    if (!positiveDefinite) {
        throw new Error('Matrix is not positive definite');
    }

    this.L = l;
}

CholeskyDecomposition.prototype = {
    get lowerTriangularMatrix() {
        return this.L;
    },
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var l = this.L,
            dimension = l.rows;

        if (value.rows !== dimension) {
            throw new Error('Matrix dimensions do not match');
        }

        var count = value.columns,
            B = value.clone(),
            i, j, k;

        for (k = 0; k < dimension; k++) {
            for (j = 0; j < count; j++) {
                for (i = 0; i < k; i++) {
                    B[k][j] -= B[i][j] * l[k][i];
                }
                B[k][j] /= l[k][k];
            }
        }

        for (k = dimension - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                for (i = k + 1; i < dimension; i++) {
                    B[k][j] -= B[i][j] * l[i][k];
                }
                B[k][j] /= l[k][k];
            }
        }

        return B;
    }
};

module.exports = CholeskyDecomposition;

},{"../matrix":9}],2:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var util = require('./util');
var hypotenuse = util.hypotenuse;
var getFilled2DArray = util.getFilled2DArray;

// https://github.com/lutzroeder/Mapack/blob/master/Source/EigenvalueDecomposition.cs
function EigenvalueDecomposition(matrix) {
    if (!(this instanceof EigenvalueDecomposition)) {
        return new EigenvalueDecomposition(matrix);
    }
    matrix = Matrix.checkMatrix(matrix);
    if (!matrix.isSquare()) {
        throw new Error('Matrix is not a square matrix');
    }

    var n = matrix.columns,
        V = getFilled2DArray(n, n, 0),
        d = new Array(n),
        e = new Array(n),
        value = matrix,
        i, j;

    if (matrix.isSymmetric()) {
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                V[i][j] = value[i][j];
            }
        }
        tred2(n, e, d, V);
        tql2(n, e, d, V);
    }
    else {
        var H = getFilled2DArray(n, n, 0),
            ort = new Array(n);
        for (j = 0; j < n; j++) {
            for (i = 0; i < n; i++) {
                H[i][j] = value[i][j];
            }
        }
        orthes(n, H, ort, V);
        hqr2(n, e, d, V, H);
    }

    this.n = n;
    this.e = e;
    this.d = d;
    this.V = V;
}

EigenvalueDecomposition.prototype = {
    get realEigenvalues() {
        return this.d;
    },
    get imaginaryEigenvalues() {
        return this.e;
    },
    get eigenvectorMatrix() {
        if (!Matrix.isMatrix(this.V)) {
            this.V = new Matrix(this.V);
        }
        return this.V;
    },
    get diagonalMatrix() {
        var n = this.n,
            e = this.e,
            d = this.d,
            X = new Matrix(n, n),
            i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                X[i][j] = 0;
            }
            X[i][i] = d[i];
            if (e[i] > 0) {
                X[i][i + 1] = e[i];
            }
            else if (e[i] < 0) {
                X[i][i - 1] = e[i];
            }
        }
        return X;
    }
};

function tred2(n, e, d, V) {

    var f, g, h, i, j, k,
        hh, scale;

    for (j = 0; j < n; j++) {
        d[j] = V[n - 1][j];
    }

    for (i = n - 1; i > 0; i--) {
        scale = 0;
        h = 0;
        for (k = 0; k < i; k++) {
            scale = scale + Math.abs(d[k]);
        }

        if (scale === 0) {
            e[i] = d[i - 1];
            for (j = 0; j < i; j++) {
                d[j] = V[i - 1][j];
                V[i][j] = 0;
                V[j][i] = 0;
            }
        } else {
            for (k = 0; k < i; k++) {
                d[k] /= scale;
                h += d[k] * d[k];
            }

            f = d[i - 1];
            g = Math.sqrt(h);
            if (f > 0) {
                g = -g;
            }

            e[i] = scale * g;
            h = h - f * g;
            d[i - 1] = f - g;
            for (j = 0; j < i; j++) {
                e[j] = 0;
            }

            for (j = 0; j < i; j++) {
                f = d[j];
                V[j][i] = f;
                g = e[j] + V[j][j] * f;
                for (k = j + 1; k <= i - 1; k++) {
                    g += V[k][j] * d[k];
                    e[k] += V[k][j] * f;
                }
                e[j] = g;
            }

            f = 0;
            for (j = 0; j < i; j++) {
                e[j] /= h;
                f += e[j] * d[j];
            }

            hh = f / (h + h);
            for (j = 0; j < i; j++) {
                e[j] -= hh * d[j];
            }

            for (j = 0; j < i; j++) {
                f = d[j];
                g = e[j];
                for (k = j; k <= i - 1; k++) {
                    V[k][j] -= (f * e[k] + g * d[k]);
                }
                d[j] = V[i - 1][j];
                V[i][j] = 0;
            }
        }
        d[i] = h;
    }

    for (i = 0; i < n - 1; i++) {
        V[n - 1][i] = V[i][i];
        V[i][i] = 1;
        h = d[i + 1];
        if (h !== 0) {
            for (k = 0; k <= i; k++) {
                d[k] = V[k][i + 1] / h;
            }

            for (j = 0; j <= i; j++) {
                g = 0;
                for (k = 0; k <= i; k++) {
                    g += V[k][i + 1] * V[k][j];
                }
                for (k = 0; k <= i; k++) {
                    V[k][j] -= g * d[k];
                }
            }
        }

        for (k = 0; k <= i; k++) {
            V[k][i + 1] = 0;
        }
    }

    for (j = 0; j < n; j++) {
        d[j] = V[n - 1][j];
        V[n - 1][j] = 0;
    }

    V[n - 1][n - 1] = 1;
    e[0] = 0;
}

function tql2(n, e, d, V) {

    var g, h, i, j, k, l, m, p, r,
        dl1, c, c2, c3, el1, s, s2,
        iter;

    for (i = 1; i < n; i++) {
        e[i - 1] = e[i];
    }

    e[n - 1] = 0;

    var f = 0,
        tst1 = 0,
        eps = Math.pow(2, -52);

    for (l = 0; l < n; l++) {
        tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
        m = l;
        while (m < n) {
            if (Math.abs(e[m]) <= eps * tst1) {
                break;
            }
            m++;
        }

        if (m > l) {
            iter = 0;
            do {
                iter = iter + 1;

                g = d[l];
                p = (d[l + 1] - g) / (2 * e[l]);
                r = hypotenuse(p, 1);
                if (p < 0) {
                    r = -r;
                }

                d[l] = e[l] / (p + r);
                d[l + 1] = e[l] * (p + r);
                dl1 = d[l + 1];
                h = g - d[l];
                for (i = l + 2; i < n; i++) {
                    d[i] -= h;
                }

                f = f + h;

                p = d[m];
                c = 1;
                c2 = c;
                c3 = c;
                el1 = e[l + 1];
                s = 0;
                s2 = 0;
                for (i = m - 1; i >= l; i--) {
                    c3 = c2;
                    c2 = c;
                    s2 = s;
                    g = c * e[i];
                    h = c * p;
                    r = hypotenuse(p, e[i]);
                    e[i + 1] = s * r;
                    s = e[i] / r;
                    c = p / r;
                    p = c * d[i] - s * g;
                    d[i + 1] = h + s * (c * g + s * d[i]);

                    for (k = 0; k < n; k++) {
                        h = V[k][i + 1];
                        V[k][i + 1] = s * V[k][i] + c * h;
                        V[k][i] = c * V[k][i] - s * h;
                    }
                }

                p = -s * s2 * c3 * el1 * e[l] / dl1;
                e[l] = s * p;
                d[l] = c * p;

            }
            while (Math.abs(e[l]) > eps * tst1);
        }
        d[l] = d[l] + f;
        e[l] = 0;
    }

    for (i = 0; i < n - 1; i++) {
        k = i;
        p = d[i];
        for (j = i + 1; j < n; j++) {
            if (d[j] < p) {
                k = j;
                p = d[j];
            }
        }

        if (k !== i) {
            d[k] = d[i];
            d[i] = p;
            for (j = 0; j < n; j++) {
                p = V[j][i];
                V[j][i] = V[j][k];
                V[j][k] = p;
            }
        }
    }
}

function orthes(n, H, ort, V) {

    var low = 0,
        high = n - 1,
        f, g, h, i, j, m,
        scale;

    for (m = low + 1; m <= high - 1; m++) {
        scale = 0;
        for (i = m; i <= high; i++) {
            scale = scale + Math.abs(H[i][m - 1]);
        }

        if (scale !== 0) {
            h = 0;
            for (i = high; i >= m; i--) {
                ort[i] = H[i][m - 1] / scale;
                h += ort[i] * ort[i];
            }

            g = Math.sqrt(h);
            if (ort[m] > 0) {
                g = -g;
            }

            h = h - ort[m] * g;
            ort[m] = ort[m] - g;

            for (j = m; j < n; j++) {
                f = 0;
                for (i = high; i >= m; i--) {
                    f += ort[i] * H[i][j];
                }

                f = f / h;
                for (i = m; i <= high; i++) {
                    H[i][j] -= f * ort[i];
                }
            }

            for (i = 0; i <= high; i++) {
                f = 0;
                for (j = high; j >= m; j--) {
                    f += ort[j] * H[i][j];
                }

                f = f / h;
                for (j = m; j <= high; j++) {
                    H[i][j] -= f * ort[j];
                }
            }

            ort[m] = scale * ort[m];
            H[m][m - 1] = scale * g;
        }
    }

    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
            V[i][j] = (i === j ? 1 : 0);
        }
    }

    for (m = high - 1; m >= low + 1; m--) {
        if (H[m][m - 1] !== 0) {
            for (i = m + 1; i <= high; i++) {
                ort[i] = H[i][m - 1];
            }

            for (j = m; j <= high; j++) {
                g = 0;
                for (i = m; i <= high; i++) {
                    g += ort[i] * V[i][j];
                }

                g = (g / ort[m]) / H[m][m - 1];
                for (i = m; i <= high; i++) {
                    V[i][j] += g * ort[i];
                }
            }
        }
    }
}

function hqr2(nn, e, d, V, H) {
    var n = nn - 1,
        low = 0,
        high = nn - 1,
        eps = Math.pow(2, -52),
        exshift = 0,
        norm = 0,
        p = 0,
        q = 0,
        r = 0,
        s = 0,
        z = 0,
        iter = 0,
        i, j, k, l, m, t, w, x, y,
        ra, sa, vr, vi,
        notlast, cdivres;

    for (i = 0; i < nn; i++) {
        if (i < low || i > high) {
            d[i] = H[i][i];
            e[i] = 0;
        }

        for (j = Math.max(i - 1, 0); j < nn; j++) {
            norm = norm + Math.abs(H[i][j]);
        }
    }

    while (n >= low) {
        l = n;
        while (l > low) {
            s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
            if (s === 0) {
                s = norm;
            }
            if (Math.abs(H[l][l - 1]) < eps * s) {
                break;
            }
            l--;
        }

        if (l === n) {
            H[n][n] = H[n][n] + exshift;
            d[n] = H[n][n];
            e[n] = 0;
            n--;
            iter = 0;
        } else if (l === n - 1) {
            w = H[n][n - 1] * H[n - 1][n];
            p = (H[n - 1][n - 1] - H[n][n]) / 2;
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            H[n][n] = H[n][n] + exshift;
            H[n - 1][n - 1] = H[n - 1][n - 1] + exshift;
            x = H[n][n];

            if (q >= 0) {
                z = (p >= 0) ? (p + z) : (p - z);
                d[n - 1] = x + z;
                d[n] = d[n - 1];
                if (z !== 0) {
                    d[n] = x - w / z;
                }
                e[n - 1] = 0;
                e[n] = 0;
                x = H[n][n - 1];
                s = Math.abs(x) + Math.abs(z);
                p = x / s;
                q = z / s;
                r = Math.sqrt(p * p + q * q);
                p = p / r;
                q = q / r;

                for (j = n - 1; j < nn; j++) {
                    z = H[n - 1][j];
                    H[n - 1][j] = q * z + p * H[n][j];
                    H[n][j] = q * H[n][j] - p * z;
                }

                for (i = 0; i <= n; i++) {
                    z = H[i][n - 1];
                    H[i][n - 1] = q * z + p * H[i][n];
                    H[i][n] = q * H[i][n] - p * z;
                }

                for (i = low; i <= high; i++) {
                    z = V[i][n - 1];
                    V[i][n - 1] = q * z + p * V[i][n];
                    V[i][n] = q * V[i][n] - p * z;
                }
            } else {
                d[n - 1] = x + p;
                d[n] = x + p;
                e[n - 1] = z;
                e[n] = -z;
            }

            n = n - 2;
            iter = 0;
        } else {
            x = H[n][n];
            y = 0;
            w = 0;
            if (l < n) {
                y = H[n - 1][n - 1];
                w = H[n][n - 1] * H[n - 1][n];
            }

            if (iter === 10) {
                exshift += x;
                for (i = low; i <= n; i++) {
                    H[i][i] -= x;
                }
                s = Math.abs(H[n][n - 1]) + Math.abs(H[n - 1][n - 2]);
                x = y = 0.75 * s;
                w = -0.4375 * s * s;
            }

            if (iter === 30) {
                s = (y - x) / 2;
                s = s * s + w;
                if (s > 0) {
                    s = Math.sqrt(s);
                    if (y < x) {
                        s = -s;
                    }
                    s = x - w / ((y - x) / 2 + s);
                    for (i = low; i <= n; i++) {
                        H[i][i] -= s;
                    }
                    exshift += s;
                    x = y = w = 0.964;
                }
            }

            iter = iter + 1;

            m = n - 2;
            while (m >= l) {
                z = H[m][m];
                r = x - z;
                s = y - z;
                p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
                q = H[m + 1][m + 1] - z - r - s;
                r = H[m + 2][m + 1];
                s = Math.abs(p) + Math.abs(q) + Math.abs(r);
                p = p / s;
                q = q / s;
                r = r / s;
                if (m === l) {
                    break;
                }
                if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) {
                    break;
                }
                m--;
            }

            for (i = m + 2; i <= n; i++) {
                H[i][i - 2] = 0;
                if (i > m + 2) {
                    H[i][i - 3] = 0;
                }
            }

            for (k = m; k <= n - 1; k++) {
                notlast = (k !== n - 1);
                if (k !== m) {
                    p = H[k][k - 1];
                    q = H[k + 1][k - 1];
                    r = (notlast ? H[k + 2][k - 1] : 0);
                    x = Math.abs(p) + Math.abs(q) + Math.abs(r);
                    if (x !== 0) {
                        p = p / x;
                        q = q / x;
                        r = r / x;
                    }
                }

                if (x === 0) {
                    break;
                }

                s = Math.sqrt(p * p + q * q + r * r);
                if (p < 0) {
                    s = -s;
                }

                if (s !== 0) {
                    if (k !== m) {
                        H[k][k - 1] = -s * x;
                    } else if (l !== m) {
                        H[k][k - 1] = -H[k][k - 1];
                    }

                    p = p + s;
                    x = p / s;
                    y = q / s;
                    z = r / s;
                    q = q / p;
                    r = r / p;

                    for (j = k; j < nn; j++) {
                        p = H[k][j] + q * H[k + 1][j];
                        if (notlast) {
                            p = p + r * H[k + 2][j];
                            H[k + 2][j] = H[k + 2][j] - p * z;
                        }

                        H[k][j] = H[k][j] - p * x;
                        H[k + 1][j] = H[k + 1][j] - p * y;
                    }

                    for (i = 0; i <= Math.min(n, k + 3); i++) {
                        p = x * H[i][k] + y * H[i][k + 1];
                        if (notlast) {
                            p = p + z * H[i][k + 2];
                            H[i][k + 2] = H[i][k + 2] - p * r;
                        }

                        H[i][k] = H[i][k] - p;
                        H[i][k + 1] = H[i][k + 1] - p * q;
                    }

                    for (i = low; i <= high; i++) {
                        p = x * V[i][k] + y * V[i][k + 1];
                        if (notlast) {
                            p = p + z * V[i][k + 2];
                            V[i][k + 2] = V[i][k + 2] - p * r;
                        }

                        V[i][k] = V[i][k] - p;
                        V[i][k + 1] = V[i][k + 1] - p * q;
                    }
                }
            }
        }
    }

    if (norm === 0) {
        return;
    }

    for (n = nn - 1; n >= 0; n--) {
        p = d[n];
        q = e[n];

        if (q === 0) {
            l = n;
            H[n][n] = 1;
            for (i = n - 1; i >= 0; i--) {
                w = H[i][i] - p;
                r = 0;
                for (j = l; j <= n; j++) {
                    r = r + H[i][j] * H[j][n];
                }

                if (e[i] < 0) {
                    z = w;
                    s = r;
                } else {
                    l = i;
                    if (e[i] === 0) {
                        H[i][n] = (w !== 0) ? (-r / w) : (-r / (eps * norm));
                    } else {
                        x = H[i][i + 1];
                        y = H[i + 1][i];
                        q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
                        t = (x * s - z * r) / q;
                        H[i][n] = t;
                        H[i + 1][n] = (Math.abs(x) > Math.abs(z)) ? ((-r - w * t) / x) : ((-s - y * t) / z);
                    }

                    t = Math.abs(H[i][n]);
                    if ((eps * t) * t > 1) {
                        for (j = i; j <= n; j++) {
                            H[j][n] = H[j][n] / t;
                        }
                    }
                }
            }
        } else if (q < 0) {
            l = n - 1;

            if (Math.abs(H[n][n - 1]) > Math.abs(H[n - 1][n])) {
                H[n - 1][n - 1] = q / H[n][n - 1];
                H[n - 1][n] = -(H[n][n] - p) / H[n][n - 1];
            } else {
                cdivres = cdiv(0, -H[n - 1][n], H[n - 1][n - 1] - p, q);
                H[n - 1][n - 1] = cdivres[0];
                H[n - 1][n] = cdivres[1];
            }

            H[n][n - 1] = 0;
            H[n][n] = 1;
            for (i = n - 2; i >= 0; i--) {
                ra = 0;
                sa = 0;
                for (j = l; j <= n; j++) {
                    ra = ra + H[i][j] * H[j][n - 1];
                    sa = sa + H[i][j] * H[j][n];
                }

                w = H[i][i] - p;

                if (e[i] < 0) {
                    z = w;
                    r = ra;
                    s = sa;
                } else {
                    l = i;
                    if (e[i] === 0) {
                        cdivres = cdiv(-ra, -sa, w, q);
                        H[i][n - 1] = cdivres[0];
                        H[i][n] = cdivres[1];
                    } else {
                        x = H[i][i + 1];
                        y = H[i + 1][i];
                        vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
                        vi = (d[i] - p) * 2 * q;
                        if (vr === 0 && vi === 0) {
                            vr = eps * norm * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
                        }
                        cdivres = cdiv(x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi);
                        H[i][n - 1] = cdivres[0];
                        H[i][n] = cdivres[1];
                        if (Math.abs(x) > (Math.abs(z) + Math.abs(q))) {
                            H[i + 1][n - 1] = (-ra - w * H[i][n - 1] + q * H[i][n]) / x;
                            H[i + 1][n] = (-sa - w * H[i][n] - q * H[i][n - 1]) / x;
                        } else {
                            cdivres = cdiv(-r - y * H[i][n - 1], -s - y * H[i][n], z, q);
                            H[i + 1][n - 1] = cdivres[0];
                            H[i + 1][n] = cdivres[1];
                        }
                    }

                    t = Math.max(Math.abs(H[i][n - 1]), Math.abs(H[i][n]));
                    if ((eps * t) * t > 1) {
                        for (j = i; j <= n; j++) {
                            H[j][n - 1] = H[j][n - 1] / t;
                            H[j][n] = H[j][n] / t;
                        }
                    }
                }
            }
        }
    }

    for (i = 0; i < nn; i++) {
        if (i < low || i > high) {
            for (j = i; j < nn; j++) {
                V[i][j] = H[i][j];
            }
        }
    }

    for (j = nn - 1; j >= low; j--) {
        for (i = low; i <= high; i++) {
            z = 0;
            for (k = low; k <= Math.min(j, high); k++) {
                z = z + V[i][k] * H[k][j];
            }
            V[i][j] = z;
        }
    }
}

function cdiv(xr, xi, yr, yi) {
    var r, d;
    if (Math.abs(yr) > Math.abs(yi)) {
        r = yi / yr;
        d = yr + r * yi;
        return [(xr + r * xi) / d, (xi - r * xr) / d];
    }
    else {
        r = yr / yi;
        d = yi + r * yr;
        return [(r * xr + xi) / d, (r * xi - xr) / d];
    }
}

module.exports = EigenvalueDecomposition;

},{"../matrix":9,"./util":6}],3:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');

// https://github.com/lutzroeder/Mapack/blob/master/Source/LuDecomposition.cs
function LuDecomposition(matrix) {
    if (!(this instanceof LuDecomposition)) {
        return new LuDecomposition(matrix);
    }
    matrix = Matrix.checkMatrix(matrix);

    var lu = matrix.clone(),
        rows = lu.rows,
        columns = lu.columns,
        pivotVector = new Array(rows),
        pivotSign = 1,
        i, j, k, p, s, t, v,
        LUrowi, LUcolj, kmax;

    for (i = 0; i < rows; i++) {
        pivotVector[i] = i;
    }

    LUcolj = new Array(rows);

    for (j = 0; j < columns; j++) {

        for (i = 0; i < rows; i++) {
            LUcolj[i] = lu[i][j];
        }

        for (i = 0; i < rows; i++) {
            LUrowi = lu[i];
            kmax = Math.min(i, j);
            s = 0;
            for (k = 0; k < kmax; k++) {
                s += LUrowi[k] * LUcolj[k];
            }
            LUrowi[j] = LUcolj[i] -= s;
        }

        p = j;
        for (i = j + 1; i < rows; i++) {
            if (Math.abs(LUcolj[i]) > Math.abs(LUcolj[p])) {
                p = i;
            }
        }

        if (p !== j) {
            for (k = 0; k < columns; k++) {
                t = lu[p][k];
                lu[p][k] = lu[j][k];
                lu[j][k] = t;
            }

            v = pivotVector[p];
            pivotVector[p] = pivotVector[j];
            pivotVector[j] = v;

            pivotSign = -pivotSign;
        }

        if (j < rows && lu[j][j] !== 0) {
            for (i = j + 1; i < rows; i++) {
                lu[i][j] /= lu[j][j];
            }
        }
    }

    this.LU = lu;
    this.pivotVector = pivotVector;
    this.pivotSign = pivotSign;
}

LuDecomposition.prototype = {
    isSingular: function () {
        var data = this.LU,
            col = data.columns;
        for (var j = 0; j < col; j++) {
            if (data[j][j] === 0) {
                return true;
            }
        }
        return false;
    },
    get determinant() {
        var data = this.LU;
        if (!data.isSquare())
            throw new Error('Matrix must be square');
        var determinant = this.pivotSign, col = data.columns;
        for (var j = 0; j < col; j++)
            determinant *= data[j][j];
        return determinant;
    },
    get lowerTriangularMatrix() {
        var data = this.LU,
            rows = data.rows,
            columns = data.columns,
            X = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                if (i > j) {
                    X[i][j] = data[i][j];
                } else if (i === j) {
                    X[i][j] = 1;
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get upperTriangularMatrix() {
        var data = this.LU,
            rows = data.rows,
            columns = data.columns,
            X = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                if (i <= j) {
                    X[i][j] = data[i][j];
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get pivotPermutationVector() {
        return this.pivotVector.slice();
    },
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var lu = this.LU,
            rows = lu.rows;

        if (rows !== value.rows)
            throw new Error('Invalid matrix dimensions');
        if (this.isSingular())
            throw new Error('LU matrix is singular');

        var count = value.columns,
            X = value.subMatrixRow(this.pivotVector, 0, count - 1),
            columns = lu.columns,
            i, j, k;

        for (k = 0; k < columns; k++) {
            for (i = k + 1; i < columns; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * lu[i][k];
                }
            }
        }
        for (k = columns - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                X[k][j] /= lu[k][k];
            }
            for (i = 0; i < k; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * lu[i][k];
                }
            }
        }
        return X;
    }
};

module.exports = LuDecomposition;

},{"../matrix":9}],4:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var hypotenuse = require('./util').hypotenuse;

//https://github.com/lutzroeder/Mapack/blob/master/Source/QrDecomposition.cs
function QrDecomposition(value) {
    if (!(this instanceof QrDecomposition)) {
        return new QrDecomposition(value);
    }
    value = Matrix.checkMatrix(value);

    var qr = value.clone(),
        m = value.rows,
        n = value.columns,
        rdiag = new Array(n),
        i, j, k, s;

    for (k = 0; k < n; k++) {
        var nrm = 0;
        for (i = k; i < m; i++) {
            nrm = hypotenuse(nrm, qr[i][k]);
        }
        if (nrm !== 0) {
            if (qr[k][k] < 0) {
                nrm = -nrm;
            }
            for (i = k; i < m; i++) {
                qr[i][k] /= nrm;
            }
            qr[k][k] += 1;
            for (j = k + 1; j < n; j++) {
                s = 0;
                for (i = k; i < m; i++) {
                    s += qr[i][k] * qr[i][j];
                }
                s = -s / qr[k][k];
                for (i = k; i < m; i++) {
                    qr[i][j] += s * qr[i][k];
                }
            }
        }
        rdiag[k] = -nrm;
    }

    this.QR = qr;
    this.Rdiag = rdiag;
}

QrDecomposition.prototype = {
    solve: function (value) {
        value = Matrix.checkMatrix(value);

        var qr = this.QR,
            m = qr.rows;

        if (value.rows !== m)
            throw new Error('Matrix row dimensions must agree');
        if (!this.isFullRank())
            throw new Error('Matrix is rank deficient');

        var count = value.columns,
            X = value.clone(),
            n = qr.columns,
            i, j, k, s;

        for (k = 0; k < n; k++) {
            for (j = 0; j < count; j++) {
                s = 0;
                for (i = k; i < m; i++) {
                    s += qr[i][k] * X[i][j];
                }
                s = -s / qr[k][k];
                for (i = k; i < m; i++) {
                    X[i][j] += s * qr[i][k];
                }
            }
        }
        for (k = n - 1; k >= 0; k--) {
            for (j = 0; j < count; j++) {
                X[k][j] /= this.Rdiag[k];
            }
            for (i = 0; i < k; i++) {
                for (j = 0; j < count; j++) {
                    X[i][j] -= X[k][j] * qr[i][k];
                }
            }
        }

        return X.subMatrix(0, n - 1, 0, count - 1);
    },
    isFullRank: function () {
        var columns = this.QR.columns;
        for (var i = 0; i < columns; i++) {
            if (this.Rdiag[i] === 0) {
                return false;
            }
        }
        return true;
    },
    get upperTriangularMatrix() {
        var qr = this.QR,
            n = qr.columns,
            X = new Matrix(n, n),
            i, j;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                if (i < j) {
                    X[i][j] = qr[i][j];
                } else if (i === j) {
                    X[i][j] = this.Rdiag[i];
                } else {
                    X[i][j] = 0;
                }
            }
        }
        return X;
    },
    get orthogonalMatrix() {
        var qr = this.QR,
            rows = qr.rows,
            columns = qr.columns,
            X = new Matrix(rows, columns),
            i, j, k, s;

        for (k = columns - 1; k >= 0; k--) {
            for (i = 0; i < rows; i++) {
                X[i][k] = 0;
            }
            X[k][k] = 1;
            for (j = k; j < columns; j++) {
                if (qr[k][k] !== 0) {
                    s = 0;
                    for (i = k; i < rows; i++) {
                        s += qr[i][k] * X[i][j];
                    }

                    s = -s / qr[k][k];

                    for (i = k; i < rows; i++) {
                        X[i][j] += s * qr[i][k];
                    }
                }
            }
        }
        return X;
    }
};

module.exports = QrDecomposition;

},{"../matrix":9,"./util":6}],5:[function(require,module,exports){
'use strict';

var Matrix = require('../matrix');
var util = require('./util');
var hypotenuse = util.hypotenuse;
var getFilled2DArray = util.getFilled2DArray;

// https://github.com/lutzroeder/Mapack/blob/master/Source/SingularValueDecomposition.cs
function SingularValueDecomposition(value, options) {
    if (!(this instanceof SingularValueDecomposition)) {
        return new SingularValueDecomposition(value, options);
    }
    value = Matrix.checkMatrix(value);

    options = options || {};

    var m = value.rows,
        n = value.columns,
        nu = Math.min(m, n);

    var wantu = true, wantv = true;
    if (options.computeLeftSingularVectors === false)
        wantu = false;
    if (options.computeRightSingularVectors === false)
        wantv = false;
    var autoTranspose = options.autoTranspose === true;

    var swapped = false;
    var a;
    if (m < n) {
        if (!autoTranspose) {
            a = value.clone();
            console.warn('Computing SVD on a matrix with more columns than rows. Consider enabling autoTranspose');
        } else {
            a = value.transpose();
            m = a.rows;
            n = a.columns;
            swapped = true;
            var aux = wantu;
            wantu = wantv;
            wantv = aux;
        }
    } else {
        a = value.clone();
    }

    var s = new Array(Math.min(m + 1, n)),
        U = getFilled2DArray(m, nu, 0),
        V = getFilled2DArray(n, n, 0),
        e = new Array(n),
        work = new Array(m);

    var nct = Math.min(m - 1, n);
    var nrt = Math.max(0, Math.min(n - 2, m));

    var i, j, k, p, t, ks, f, cs, sn, max, kase,
        scale, sp, spm1, epm1, sk, ek, b, c, shift, g;

    for (k = 0, max = Math.max(nct, nrt); k < max; k++) {
        if (k < nct) {
            s[k] = 0;
            for (i = k; i < m; i++) {
                s[k] = hypotenuse(s[k], a[i][k]);
            }
            if (s[k] !== 0) {
                if (a[k][k] < 0) {
                    s[k] = -s[k];
                }
                for (i = k; i < m; i++) {
                    a[i][k] /= s[k];
                }
                a[k][k] += 1;
            }
            s[k] = -s[k];
        }

        for (j = k + 1; j < n; j++) {
            if ((k < nct) && (s[k] !== 0)) {
                t = 0;
                for (i = k; i < m; i++) {
                    t += a[i][k] * a[i][j];
                }
                t = -t / a[k][k];
                for (i = k; i < m; i++) {
                    a[i][j] += t * a[i][k];
                }
            }
            e[j] = a[k][j];
        }

        if (wantu && (k < nct)) {
            for (i = k; i < m; i++) {
                U[i][k] = a[i][k];
            }
        }

        if (k < nrt) {
            e[k] = 0;
            for (i = k + 1; i < n; i++) {
                e[k] = hypotenuse(e[k], e[i]);
            }
            if (e[k] !== 0) {
                if (e[k + 1] < 0)
                    e[k] = -e[k];
                for (i = k + 1; i < n; i++) {
                    e[i] /= e[k];
                }
                e[k + 1] += 1;
            }
            e[k] = -e[k];
            if ((k + 1 < m) && (e[k] !== 0)) {
                for (i = k + 1; i < m; i++) {
                    work[i] = 0;
                }
                for (j = k + 1; j < n; j++) {
                    for (i = k + 1; i < m; i++) {
                        work[i] += e[j] * a[i][j];
                    }
                }
                for (j = k + 1; j < n; j++) {
                    t = -e[j] / e[k + 1];
                    for (i = k + 1; i < m; i++) {
                        a[i][j] += t * work[i];
                    }
                }
            }
            if (wantv) {
                for (i = k + 1; i < n; i++) {
                    V[i][k] = e[i];
                }
            }
        }
    }

    p = Math.min(n, m + 1);
    if (nct < n) {
        s[nct] = a[nct][nct];
    }
    if (m < p) {
        s[p - 1] = 0;
    }
    if (nrt + 1 < p) {
        e[nrt] = a[nrt][p - 1];
    }
    e[p - 1] = 0;

    if (wantu) {
        for (j = nct; j < nu; j++) {
            for (i = 0; i < m; i++) {
                U[i][j] = 0;
            }
            U[j][j] = 1;
        }
        for (k = nct - 1; k >= 0; k--) {
            if (s[k] !== 0) {
                for (j = k + 1; j < nu; j++) {
                    t = 0;
                    for (i = k; i < m; i++) {
                        t += U[i][k] * U[i][j];
                    }
                    t = -t / U[k][k];
                    for (i = k; i < m; i++) {
                        U[i][j] += t * U[i][k];
                    }
                }
                for (i = k; i < m; i++) {
                    U[i][k] = -U[i][k];
                }
                U[k][k] = 1 + U[k][k];
                for (i = 0; i < k - 1; i++) {
                    U[i][k] = 0;
                }
            } else {
                for (i = 0; i < m; i++) {
                    U[i][k] = 0;
                }
                U[k][k] = 1;
            }
        }
    }

    if (wantv) {
        for (k = n - 1; k >= 0; k--) {
            if ((k < nrt) && (e[k] !== 0)) {
                for (j = k + 1; j < n; j++) {
                    t = 0;
                    for (i = k + 1; i < n; i++) {
                        t += V[i][k] * V[i][j];
                    }
                    t = -t / V[k + 1][k];
                    for (i = k + 1; i < n; i++) {
                        V[i][j] += t * V[i][k];
                    }
                }
            }
            for (i = 0; i < n; i++) {
                V[i][k] = 0;
            }
            V[k][k] = 1;
        }
    }

    var pp = p - 1,
        iter = 0,
        eps = Math.pow(2, -52);
    while (p > 0) {
        for (k = p - 2; k >= -1; k--) {
            if (k === -1) {
                break;
            }
            if (Math.abs(e[k]) <= eps * (Math.abs(s[k]) + Math.abs(s[k + 1]))) {
                e[k] = 0;
                break;
            }
        }
        if (k === p - 2) {
            kase = 4;
        } else {
            for (ks = p - 1; ks >= k; ks--) {
                if (ks === k) {
                    break;
                }
                t = (ks !== p ? Math.abs(e[ks]) : 0) + (ks !== k + 1 ? Math.abs(e[ks - 1]) : 0);
                if (Math.abs(s[ks]) <= eps * t) {
                    s[ks] = 0;
                    break;
                }
            }
            if (ks === k) {
                kase = 3;
            } else if (ks === p - 1) {
                kase = 1;
            } else {
                kase = 2;
                k = ks;
            }
        }

        k++;

        switch (kase) {
            case 1: {
                f = e[p - 2];
                e[p - 2] = 0;
                for (j = p - 2; j >= k; j--) {
                    t = hypotenuse(s[j], f);
                    cs = s[j] / t;
                    sn = f / t;
                    s[j] = t;
                    if (j !== k) {
                        f = -sn * e[j - 1];
                        e[j - 1] = cs * e[j - 1];
                    }
                    if (wantv) {
                        for (i = 0; i < n; i++) {
                            t = cs * V[i][j] + sn * V[i][p - 1];
                            V[i][p - 1] = -sn * V[i][j] + cs * V[i][p - 1];
                            V[i][j] = t;
                        }
                    }
                }
                break;
            }
            case 2 : {
                f = e[k - 1];
                e[k - 1] = 0;
                for (j = k; j < p; j++) {
                    t = hypotenuse(s[j], f);
                    cs = s[j] / t;
                    sn = f / t;
                    s[j] = t;
                    f = -sn * e[j];
                    e[j] = cs * e[j];
                    if (wantu) {
                        for (i = 0; i < m; i++) {
                            t = cs * U[i][j] + sn * U[i][k - 1];
                            U[i][k - 1] = -sn * U[i][j] + cs * U[i][k - 1];
                            U[i][j] = t;
                        }
                    }
                }
                break;
            }
            case 3 : {
                scale = Math.max(Math.max(Math.max(Math.max(Math.abs(s[p - 1]), Math.abs(s[p - 2])), Math.abs(e[p - 2])), Math.abs(s[k])), Math.abs(e[k]));
                sp = s[p - 1] / scale;
                spm1 = s[p - 2] / scale;
                epm1 = e[p - 2] / scale;
                sk = s[k] / scale;
                ek = e[k] / scale;
                b = ((spm1 + sp) * (spm1 - sp) + epm1 * epm1) / 2;
                c = (sp * epm1) * (sp * epm1);
                shift = 0;
                if ((b !== 0) || (c !== 0)) {
                    shift = Math.sqrt(b * b + c);
                    if (b < 0) {
                        shift = -shift;
                    }
                    shift = c / (b + shift);
                }
                f = (sk + sp) * (sk - sp) + shift;
                g = sk * ek;
                for (j = k; j < p - 1; j++) {
                    t = hypotenuse(f, g);
                    cs = f / t;
                    sn = g / t;
                    if (j !== k) {
                        e[j - 1] = t;
                    }
                    f = cs * s[j] + sn * e[j];
                    e[j] = cs * e[j] - sn * s[j];
                    g = sn * s[j + 1];
                    s[j + 1] = cs * s[j + 1];
                    if (wantv) {
                        for (i = 0; i < n; i++) {
                            t = cs * V[i][j] + sn * V[i][j + 1];
                            V[i][j + 1] = -sn * V[i][j] + cs * V[i][j + 1];
                            V[i][j] = t;
                        }
                    }
                    t = hypotenuse(f, g);
                    cs = f / t;
                    sn = g / t;
                    s[j] = t;
                    f = cs * e[j] + sn * s[j + 1];
                    s[j + 1] = -sn * e[j] + cs * s[j + 1];
                    g = sn * e[j + 1];
                    e[j + 1] = cs * e[j + 1];
                    if (wantu && (j < m - 1)) {
                        for (i = 0; i < m; i++) {
                            t = cs * U[i][j] + sn * U[i][j + 1];
                            U[i][j + 1] = -sn * U[i][j] + cs * U[i][j + 1];
                            U[i][j] = t;
                        }
                    }
                }
                e[p - 2] = f;
                iter = iter + 1;
                break;
            }
            case 4: {
                if (s[k] <= 0) {
                    s[k] = (s[k] < 0 ? -s[k] : 0);
                    if (wantv) {
                        for (i = 0; i <= pp; i++) {
                            V[i][k] = -V[i][k];
                        }
                    }
                }
                while (k < pp) {
                    if (s[k] >= s[k + 1]) {
                        break;
                    }
                    t = s[k];
                    s[k] = s[k + 1];
                    s[k + 1] = t;
                    if (wantv && (k < n - 1)) {
                        for (i = 0; i < n; i++) {
                            t = V[i][k + 1];
                            V[i][k + 1] = V[i][k];
                            V[i][k] = t;
                        }
                    }
                    if (wantu && (k < m - 1)) {
                        for (i = 0; i < m; i++) {
                            t = U[i][k + 1];
                            U[i][k + 1] = U[i][k];
                            U[i][k] = t;
                        }
                    }
                    k++;
                }
                iter = 0;
                p--;
                break;
            }
        }
    }

    if (swapped) {
        var tmp = V;
        V = U;
        U = tmp;
    }

    this.m = m;
    this.n = n;
    this.s = s;
    this.U = U;
    this.V = V;
}

SingularValueDecomposition.prototype = {
    get condition() {
        return this.s[0] / this.s[Math.min(this.m, this.n) - 1];
    },
    get norm2() {
        return this.s[0];
    },
    get rank() {
        var eps = Math.pow(2, -52),
            tol = Math.max(this.m, this.n) * this.s[0] * eps,
            r = 0,
            s = this.s;
        for (var i = 0, ii = s.length; i < ii; i++) {
            if (s[i] > tol) {
                r++;
            }
        }
        return r;
    },
    get diagonal() {
        return this.s;
    },
    // https://github.com/accord-net/framework/blob/development/Sources/Accord.Math/Decompositions/SingularValueDecomposition.cs
    get threshold() {
        return (Math.pow(2, -52) / 2) * Math.max(this.m, this.n) * this.s[0];
    },
    get leftSingularVectors() {
        if (!Matrix.isMatrix(this.U)) {
            this.U = new Matrix(this.U);
        }
        return this.U;
    },
    get rightSingularVectors() {
        if (!Matrix.isMatrix(this.V)) {
            this.V = new Matrix(this.V);
        }
        return this.V;
    },
    get diagonalMatrix() {
        return Matrix.diag(this.s);
    },
    solve: function (value) {

        var Y = value,
            e = this.threshold,
            scols = this.s.length,
            Ls = Matrix.zeros(scols, scols),
            i;

        for (i = 0; i < scols; i++) {
            if (Math.abs(this.s[i]) <= e) {
                Ls[i][i] = 0;
            } else {
                Ls[i][i] = 1 / this.s[i];
            }
        }

        var U = this.U;
        var V = this.rightSingularVectors;

        var VL = V.mmul(Ls),
            vrows = V.rows,
            urows = U.length,
            VLU = Matrix.zeros(vrows, urows),
            j, k, sum;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < urows; j++) {
                sum = 0;
                for (k = 0; k < scols; k++) {
                    sum += VL[i][k] * U[j][k];
                }
                VLU[i][j] = sum;
            }
        }

        return VLU.mmul(Y);
    },
    solveForDiagonal: function (value) {
        return this.solve(Matrix.diag(value));
    },
    inverse: function () {
        var V = this.V;
        var e = this.threshold,
            vrows = V.length,
            vcols = V[0].length,
            X = new Matrix(vrows, this.s.length),
            i, j;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < vcols; j++) {
                if (Math.abs(this.s[j]) > e) {
                    X[i][j] = V[i][j] / this.s[j];
                } else {
                    X[i][j] = 0;
                }
            }
        }

        var U = this.U;

        var urows = U.length,
            ucols = U[0].length,
            Y = new Matrix(vrows, urows),
            k, sum;

        for (i = 0; i < vrows; i++) {
            for (j = 0; j < urows; j++) {
                sum = 0;
                for (k = 0; k < ucols; k++) {
                    sum += X[i][k] * U[j][k];
                }
                Y[i][j] = sum;
            }
        }

        return Y;
    }
};

module.exports = SingularValueDecomposition;

},{"../matrix":9,"./util":6}],6:[function(require,module,exports){
'use strict';

exports.hypotenuse = function hypotenuse(a, b) {
    if (Math.abs(a) > Math.abs(b)) {
        var r = b / a;
        return Math.abs(a) * Math.sqrt(1 + r * r);
    }
    if (b !== 0) {
        var r = a / b;
        return Math.abs(b) * Math.sqrt(1 + r * r);
    }
    return 0;
};

// For use in the decomposition algorithms. With big matrices, access time is
// too long on elements from array subclass
// todo check when it is fixed in v8
// http://jsperf.com/access-and-write-array-subclass
exports.getEmpty2DArray = function (rows, columns) {
    var array = new Array(rows);
    for (var i = 0; i < rows; i++) {
        array[i] = new Array(columns);
    }
    return array;
};

exports.getFilled2DArray = function (rows, columns, value) {
    var array = new Array(rows);
    for (var i = 0; i < rows; i++) {
        array[i] = new Array(columns);
        for (var j = 0; j < columns; j++) {
            array[i][j] = value;
        }
    }
    return array;
};

},{}],7:[function(require,module,exports){
'use strict';

var Matrix = require('./matrix');

var SingularValueDecomposition = require('./dc/svd');
var EigenvalueDecomposition = require('./dc/evd');
var LuDecomposition = require('./dc/lu');
var QrDecomposition = require('./dc/qr');
var CholeskyDecomposition = require('./dc/cholesky');

function inverse(matrix) {
    matrix = Matrix.checkMatrix(matrix);
    return solve(matrix, Matrix.eye(matrix.rows));
}

Matrix.inverse = Matrix.inv = inverse;
Matrix.prototype.inverse = Matrix.prototype.inv = function () {
    return inverse(this);
};

function solve(leftHandSide, rightHandSide) {
    leftHandSide = Matrix.checkMatrix(leftHandSide);
    rightHandSide = Matrix.checkMatrix(rightHandSide);
    return leftHandSide.isSquare() ? new LuDecomposition(leftHandSide).solve(rightHandSide) : new QrDecomposition(leftHandSide).solve(rightHandSide);
}

Matrix.solve = solve;
Matrix.prototype.solve = function (other) {
    return solve(this, other);
};

module.exports = {
    SingularValueDecomposition: SingularValueDecomposition,
    SVD: SingularValueDecomposition,
    EigenvalueDecomposition: EigenvalueDecomposition,
    EVD: EigenvalueDecomposition,
    LuDecomposition: LuDecomposition,
    LU: LuDecomposition,
    QrDecomposition: QrDecomposition,
    QR: QrDecomposition,
    CholeskyDecomposition: CholeskyDecomposition,
    CHO: CholeskyDecomposition,
    inverse: inverse,
    solve: solve
};

},{"./dc/cholesky":1,"./dc/evd":2,"./dc/lu":3,"./dc/qr":4,"./dc/svd":5,"./matrix":9}],8:[function(require,module,exports){
'use strict';

module.exports = require('./matrix');
module.exports.Decompositions = module.exports.DC = require('./decompositions');

},{"./decompositions":7,"./matrix":9}],9:[function(require,module,exports){
'use strict';

/**
 * Real matrix
 */
class Matrix extends Array {
    /**
     * @constructor
     * @param {number|Array|Matrix} nRows - Number of rows of the new matrix,
     * 2D array containing the data or Matrix instance to clone
     * @param {number} [nColumns] - Number of columns of the new matrix
     */
    constructor(nRows, nColumns) {
        if (Matrix.isMatrix(nRows)) {
            return nRows.clone();
        } else if (Number.isInteger(nRows) && nRows > 0) { // Create an empty matrix
            super(nRows);
            if (Number.isInteger(nColumns) && nColumns > 0) {
                for (var i = 0; i < nRows; i++) {
                    this[i] = new Array(nColumns);
                }
            } else {
                throw new TypeError('nColumns must be a positive integer');
            }
        } else if (Array.isArray(nRows)) { // Copy the values from the 2D array
            var matrix = nRows;
            nRows = matrix.length;
            nColumns = matrix[0].length;
            if (typeof nColumns !== 'number' || nColumns === 0) {
                throw new TypeError('Data must be a 2D array with at least one element');
            }
            super(nRows);
            for (var i = 0; i < nRows; i++) {
                if (matrix[i].length !== nColumns) {
                    throw new RangeError('Inconsistent array dimensions');
                }
                this[i] = [].concat(matrix[i]);
            }
        } else {
            throw new TypeError('First argument must be a positive number or an array');
        }
        this.rows = nRows;
        this.columns = nColumns;
    }

    /**
     * Constructs a Matrix with the chosen dimensions from a 1D array
     * @param {number} newRows - Number of rows
     * @param {number} newColumns - Number of columns
     * @param {Array} newData - A 1D array containing data for the matrix
     * @returns {Matrix} - The new matrix
     */
    static from1DArray(newRows, newColumns, newData) {
        var length = newRows * newColumns;
        if (length !== newData.length) {
            throw new RangeError('Data length does not match given dimensions');
        }
        var newMatrix = new Matrix(newRows, newColumns);
        for (var row = 0; row < newRows; row++) {
            for (var column = 0; column < newColumns; column++) {
                newMatrix[row][column] = newData[row * newColumns + column];
            }
        }
        return newMatrix;
    }

    /**
     * Creates a row vector, a matrix with only one row.
     * @param {Array} newData - A 1D array containing data for the vector
     * @returns {Matrix} - The new matrix
     */
    static rowVector(newData) {
        var vector = new Matrix(1, newData.length);
        for (var i = 0; i < newData.length; i++) {
            vector[0][i] = newData[i];
        }
        return vector;
    }

    /**
     * Creates a column vector, a matrix with only one column.
     * @param {Array} newData - A 1D array containing data for the vector
     * @returns {Matrix} - The new matrix
     */
    static columnVector(newData) {
        var vector = new Matrix(newData.length, 1);
        for (var i = 0; i < newData.length; i++) {
            vector[i][0] = newData[i];
        }
        return vector;
    }

    /**
     * Creates an empty matrix with the given dimensions. Values will be undefined. Same as using new Matrix(rows, columns).
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static empty(rows, columns) {
        return new Matrix(rows, columns);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be set to zero.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static zeros(rows, columns) {
        return Matrix.empty(rows, columns).fill(0);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be set to one.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @returns {Matrix} - The new matrix
     */
    static ones(rows, columns) {
        return Matrix.empty(rows, columns).fill(1);
    }

    /**
     * Creates a matrix with the given dimensions. Values will be randomly set.
     * @param {number} rows - Number of rows
     * @param {number} columns - Number of columns
     * @param {function} [rng] - Random number generator (default: Math.random)
     * @returns {Matrix} The new matrix
     */
    static rand(rows, columns, rng) {
        if (rng === undefined) rng = Math.random;
        var matrix = Matrix.empty(rows, columns);
        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                matrix[i][j] = rng();
            }
        }
        return matrix;
    }

    /**
     * Creates an identity matrix with the given dimension. Values of the diagonal will be 1 and others will be 0.
     * @param {number} rows - Number of rows
     * @param {number} [columns] - Number of columns (Default: rows)
     * @returns {Matrix} - The new identity matrix
     */
    static eye(rows, columns) {
        if (columns === undefined) columns = rows;
        var min = Math.min(rows, columns);
        var matrix = Matrix.zeros(rows, columns);
        for (var i = 0; i < min; i++) {
            matrix[i][i] = 1;
        }
        return matrix;
    }

    /**
     * Creates a diagonal matrix based on the given array.
     * @param {Array} data - Array containing the data for the diagonal
     * @param {number} [rows] - Number of rows (Default: data.length)
     * @param {number} [columns] - Number of columns (Default: rows)
     * @returns {Matrix} - The new diagonal matrix
     */
    static diag(data, rows, columns) {
        var l = data.length;
        if (rows === undefined) rows = l;
        if (columns === undefined) columns = rows;
        var min = Math.min(l, rows, columns);
        var matrix = Matrix.zeros(rows, columns);
        for (var i = 0; i < min; i++) {
            matrix[i][i] = data[i];
        }
        return matrix;
    }

    /**
     * Returns a matrix whose elements are the minimum between matrix1 and matrix2
     * @param matrix1
     * @param matrix2
     * @returns {Matrix}
     */
    static min(matrix1, matrix2) {
        var rows = matrix1.length;
        var columns = matrix1[0].length;
        var result = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for(var j = 0; j < columns; j++) {
                result[i][j] = Math.min(matrix1[i][j], matrix2[i][j]);
            }
        }
        return result;
    }

    /**
     * Returns a matrix whose elements are the maximum between matrix1 and matrix2
     * @param matrix1
     * @param matrix2
     * @returns {Matrix}
     */
    static max(matrix1, matrix2) {
        var rows = matrix1.length;
        var columns = matrix1[0].length;
        var result = new Matrix(rows, columns);
        for (var i = 0; i < rows; i++) {
            for(var j = 0; j < columns; j++) {
                result[i][j] = Math.max(matrix1[i][j], matrix2[i][j]);
            }
        }
        return result;
    }

    /**
     * Check that the provided value is a Matrix and tries to instantiate one if not
     * @param value - The value to check
     * @returns {Matrix}
     */
    static checkMatrix(value) {
        return Matrix.isMatrix(value) ? value : new Matrix(value);
    }

    /**
     * Returns true if the argument is a Matrix, false otherwise
     * @param value - The value to check
     * @return {boolean}
     */
    static isMatrix(value) {
        return (value != null) && (value.klass === 'Matrix');
    }

    /**
     * @property {number} - The number of elements in the matrix.
     */
    get size() {
        return this.rows * this.columns;
    }

    /**
     * Applies a callback for each element of the matrix. The function is called in the matrix (this) context.
     * @param {function} callback - Function that will be called with two parameters : i (row) and j (column)
     * @returns {Matrix} this
     */
    apply(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }
        var ii = this.rows;
        var jj = this.columns;
        for (var i = 0; i < ii; i++) {
            for (var j = 0; j < jj; j++) {
                callback.call(this, i, j);
            }
        }
        return this;
    }

    /**
     * Creates an exact and independent copy of the matrix
     * @returns {Matrix}
     */
    clone() {
        var newMatrix = new Matrix(this.rows, this.columns);
        for (var row = 0; row < this.rows; row++) {
            for (var column = 0; column < this.columns; column++) {
                newMatrix[row][column] = this[row][column];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a new 1D array filled row by row with the matrix values
     * @returns {Array}
     */
    to1DArray() {
        var array = new Array(this.size);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                array[i * this.columns + j] = this[i][j];
            }
        }
        return array;
    }

    /**
     * Returns a 2D array containing a copy of the data
     * @returns {Array}
     */
    to2DArray() {
        var copy = new Array(this.rows);
        for (var i = 0; i < this.rows; i++) {
            copy[i] = [].concat(this[i]);
        }
        return copy;
    }

    /**
     * @returns {boolean} true if the matrix has one row
     */
    isRowVector() {
        return this.rows === 1;
    }

    /**
     * @returns {boolean} true if the matrix has one column
     */
    isColumnVector() {
        return this.columns === 1;
    }

    /**
     * @returns {boolean} true if the matrix has one row or one column
     */
    isVector() {
        return (this.rows === 1) || (this.columns === 1);
    }

    /**
     * @returns {boolean} true if the matrix has the same number of rows and columns
     */
    isSquare() {
        return this.rows === this.columns;
    }

    /**
     * @returns {boolean} true if the matrix is square and has the same values on both sides of the diagonal
     */
    isSymmetric() {
        if (this.isSquare()) {
            for (var i = 0; i < this.rows; i++) {
                for (var j = 0; j <= i; j++) {
                    if (this[i][j] !== this[j][i]) {
                        return false;
                    }
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Sets a given element of the matrix. mat.set(3,4,1) is equivalent to mat[3][4]=1
     * @param {number} rowIndex - Index of the row
     * @param {number} columnIndex - Index of the column
     * @param {number} value - The new value for the element
     * @returns {Matrix} this
     */
    set(rowIndex, columnIndex, value) {
        this[rowIndex][columnIndex] = value;
        return this;
    }

    /**
     * Returns the given element of the matrix. mat.get(3,4) is equivalent to matrix[3][4]
     * @param {number} rowIndex - Index of the row
     * @param {number} columnIndex - Index of the column
     * @returns {number}
     */
    get(rowIndex, columnIndex) {
        return this[rowIndex][columnIndex];
    }

    /**
     * Fills the matrix with a given value. All elements will be set to this value.
     * @param {number} value - New value
     * @returns {Matrix} this
     */
    fill(value) {
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] = value;
            }
        }
        return this;
    }

    /**
     * Negates the matrix. All elements will be multiplied by (-1)
     * @returns {Matrix} this
     */
    neg() {
        return this.mulS(-1);
    }

    /**
     * Returns a new array from the given row index
     * @param {number} index - Row index
     * @returns {Array}
     */
    getRow(index) {
        checkRowIndex(this, index);
        return [].concat(this[index]);
    }

    /**
     * Returns a new row vector from the given row index
     * @param {number} index - Row index
     * @returns {Matrix}
     */
    getRowVector(index) {
        return Matrix.rowVector(this.getRow(index));
    }

    /**
     * Sets a row at the given index
     * @param {number} index - Row index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    setRow(index, array) {
        checkRowIndex(this, index);
        array = checkRowVector(this, array, true);
        this[index] = array;
        return this;
    }

    /**
     * Removes a row from the given index
     * @param {number} index - Row index
     * @returns {Matrix} this
     */
    removeRow(index) {
        checkRowIndex(this, index);
        if (this.rows === 1)
            throw new RangeError('A matrix cannot have less than one row');
        this.splice(index, 1);
        this.rows -= 1;
        return this;
    }

    /**
     * Adds a row at the given index
     * @param {number} [index = this.rows] - Row index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    addRow(index, array) {
        if (array === undefined) {
            array = index;
            index = this.rows;
        }
        checkRowIndex(this, index, true);
        array = checkRowVector(this, array, true);
        this.splice(index, 0, array);
        this.rows += 1;
        return this;
    }

    /**
     * Swaps two rows
     * @param {number} row1 - First row index
     * @param {number} row2 - Second row index
     * @returns {Matrix} this
     */
    swapRows(row1, row2) {
        checkRowIndex(this, row1);
        checkRowIndex(this, row2);
        var temp = this[row1];
        this[row1] = this[row2];
        this[row2] = temp;
        return this;
    }

    /**
     * Returns a new array from the given column index
     * @param {number} index - Column index
     * @returns {Array}
     */
    getColumn(index) {
        checkColumnIndex(this, index);
        var column = new Array(this.rows);
        for (var i = 0; i < this.rows; i++) {
            column[i] = this[i][index];
        }
        return column;
    }

    /**
     * Returns a new column vector from the given column index
     * @param {number} index - Column index
     * @returns {Matrix}
     */
    getColumnVector(index) {
        return Matrix.columnVector(this.getColumn(index));
    }

    /**
     * Sets a column at the given index
     * @param {number} index - Column index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    setColumn(index, array) {
        checkColumnIndex(this, index);
        array = checkColumnVector(this, array);
        for (var i = 0; i < this.rows; i++) {
            this[i][index] = array[i];
        }
        return this;
    }

    /**
     * Removes a column from the given index
     * @param {number} index - Column index
     * @returns {Matrix} this
     */
    removeColumn(index) {
        checkColumnIndex(this, index);
        if (this.columns === 1)
            throw new RangeError('A matrix cannot have less than one column');
        for (var i = 0; i < this.rows; i++) {
            this[i].splice(index, 1);
        }
        this.columns -= 1;
        return this;
    }

    /**
     * Adds a column at the given index
     * @param {number} [index = this.columns] - Column index
     * @param {Array|Matrix} array - Array or vector
     * @returns {Matrix} this
     */
    addColumn(index, array) {
        if (typeof array === 'undefined') {
            array = index;
            index = this.columns;
        }
        checkColumnIndex(this, index, true);
        array = checkColumnVector(this, array);
        for (var i = 0; i < this.rows; i++) {
            this[i].splice(index, 0, array[i]);
        }
        this.columns += 1;
        return this;
    }

    /**
     * Swaps two columns
     * @param {number} column1 - First column index
     * @param {number} column2 - Second column index
     * @returns {Matrix} this
     */
    swapColumns(column1, column2) {
        checkColumnIndex(this, column1);
        checkColumnIndex(this, column2);
        var temp, row;
        for (var i = 0; i < this.rows; i++) {
            row = this[i];
            temp = row[column1];
            row[column1] = row[column2];
            row[column2] = temp;
        }
        return this;
    }

    /**
     * Adds the values of a vector to each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    addRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] += vector[j];
            }
        }
        return this;
    }

    /**
     * Subtracts the values of a vector from each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    subRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] -= vector[j];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a vector with each row
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    mulRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] *= vector[j];
            }
        }
        return this;
    }

    /**
     * Divides the values of each row by those of a vector
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    divRowVector(vector) {
        vector = checkRowVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] /= vector[j];
            }
        }
        return this;
    }

    /**
     * Adds the values of a vector to each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    addColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] += vector[i];
            }
        }
        return this;
    }

    /**
     * Subtracts the values of a vector from each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    subColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] -= vector[i];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a vector with each column
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    mulColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] *= vector[i];
            }
        }
        return this;
    }

    /**
     * Divides the values of each column by those of a vector
     * @param {Array|Matrix} vector - Array or vector
     * @returns {Matrix} this
     */
    divColumnVector(vector) {
        vector = checkColumnVector(this, vector);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                this[i][j] /= vector[i];
            }
        }
        return this;
    }

    /**
     * Multiplies the values of a row with a scalar
     * @param {number} index - Row index
     * @param {number} value
     * @returns {Matrix} this
     */
    mulRow(index, value) {
        checkRowIndex(this, index);
        for (var i = 0; i < this.columns; i++) {
            this[index][i] *= value;
        }
        return this;
    }

    /**
     * Multiplies the values of a column with a scalar
     * @param {number} index - Column index
     * @param {number} value
     * @returns {Matrix} this
     */
    mulColumn(index, value) {
        checkColumnIndex(this, index);
        for (var i = 0; i < this.rows; i++) {
            this[i][index] *= value;
        }
    }

    /**
     * Returns the maximum value of the matrix
     * @returns {number}
     */
    max() {
        var v = this[0][0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] > v) {
                    v = this[i][j];
                }
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value
     * @returns {Array}
     */
    maxIndex() {
        var v = this[0][0];
        var idx = [0, 0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] > v) {
                    v = this[i][j];
                    idx[0] = i;
                    idx[1] = j;
                }
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of the matrix
     * @returns {number}
     */
    min() {
        var v = this[0][0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] < v) {
                    v = this[i][j];
                }
            }
        }
        return v;
    }

    /**
     * Returns the index of the minimum value
     * @returns {Array}
     */
    minIndex() {
        var v = this[0][0];
        var idx = [0, 0];
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                if (this[i][j] < v) {
                    v = this[i][j];
                    idx[0] = i;
                    idx[1] = j;
                }
            }
        }
        return idx;
    }

    /**
     * Returns the maximum value of one row
     * @param {number} row - Row index
     * @returns {number}
     */
    maxRow(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] > v) {
                v = this[row][i];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one row
     * @param {number} row - Row index
     * @returns {Array}
     */
    maxRowIndex(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        var idx = [row, 0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] > v) {
                v = this[row][i];
                idx[1] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of one row
     * @param {number} row - Row index
     * @returns {number}
     */
    minRow(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] < v) {
                v = this[row][i];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one row
     * @param {number} row - Row index
     * @returns {Array}
     */
    minRowIndex(row) {
        checkRowIndex(this, row);
        var v = this[row][0];
        var idx = [row, 0];
        for (var i = 1; i < this.columns; i++) {
            if (this[row][i] < v) {
                v = this[row][i];
                idx[1] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the maximum value of one column
     * @param {number} column - Column index
     * @returns {number}
     */
    maxColumn(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] > v) {
                v = this[i][column];
            }
        }
        return v;
    }

    /**
     * Returns the index of the maximum value of one column
     * @param {number} column - Column index
     * @returns {Array}
     */
    maxColumnIndex(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        var idx = [0, column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] > v) {
                v = this[i][column];
                idx[0] = i;
            }
        }
        return idx;
    }

    /**
     * Returns the minimum value of one column
     * @param {number} column - Column index
     * @returns {number}
     */
    minColumn(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] < v) {
                v = this[i][column];
            }
        }
        return v;
    }

    /**
     * Returns the index of the minimum value of one column
     * @param {number} column - Column index
     * @returns {Array}
     */
    minColumnIndex(column) {
        checkColumnIndex(this, column);
        var v = this[0][column];
        var idx = [0, column];
        for (var i = 1; i < this.rows; i++) {
            if (this[i][column] < v) {
                v = this[i][column];
                idx[0] = i;
            }
        }
        return idx;
    }

    /**
     * Returns an array containing the diagonal values of the matrix
     * @returns {Array}
     */
    diag() {
        var min = Math.min(this.rows, this.columns);
        var diag = new Array(min);
        for (var i = 0; i < min; i++) {
            diag[i] = this[i][i];
        }
        return diag;
    }

    /**
     * Returns the sum of all elements of the matrix
     * @returns {number}
     */
    sum() {
        var v = 0;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                v += this[i][j];
            }
        }
        return v;
    }

    /**
     * Returns the mean of all elements of the matrix
     * @returns {number}
     */
    mean() {
        return this.sum() / this.size;
    }

    /**
     * Returns the product of all elements of the matrix
     * @returns {number}
     */
    prod() {
        var prod = 1;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                prod *= this[i][j];
            }
        }
        return prod;
    }

    /**
     * Computes the cumulative sum of the matrix elements (in place, row by row)
     * @returns {Matrix} this
     */
    cumulativeSum() {
        var sum = 0;
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                sum += this[i][j];
                this[i][j] = sum;
            }
        }
        return this;
    }

    /**
     * Computes the dot (scalar) product between the matrix and another
     * @param {Matrix} vector2 vector
     * @returns {number}
     */
    dot(vector2) {
        if (Matrix.isMatrix(vector2)) vector2 = vector2.to1DArray();
        var vector1 = this.to1DArray();
        if (vector1.length !== vector2.length) {
            throw new RangeError('vectors do not have the same size');
        }
        var dot = 0;
        for (var i = 0; i < vector1.length; i++) {
            dot += vector1[i] * vector2[i];
        }
        return dot;
    }

    /**
     * Returns the matrix product between this and other
     * @returns {Matrix}
     */
    mmul(other) {
        other = Matrix.checkMatrix(other);
        if (this.columns !== other.rows)
            console.warn('Number of columns of left matrix are not equal to number of rows of right matrix.');

        var m = this.rows;
        var n = this.columns;
        var p = other.columns;

        var result = new Matrix(m, p);

        var Bcolj = new Array(n);
        for (var j = 0; j < p; j++) {
            for (var k = 0; k < n; k++)
                Bcolj[k] = other[k][j];

            for (var i = 0; i < m; i++) {
                var Arowi = this[i];

                var s = 0;
                for (k = 0; k < n; k++)
                    s += Arowi[k] * Bcolj[k];

                result[i][j] = s;
            }
        }
        return result;
    }

    /**
     * Transposes the matrix and returns a new one containing the result
     * @returns {Matrix}
     */
    transpose() {
        var result = new Matrix(this.columns, this.rows);
        for (var i = 0; i < this.rows; i++) {
            for (var j = 0; j < this.columns; j++) {
                result[j][i] = this[i][j];
            }
        }
        return result;
    }

    /**
     * Sorts the rows (in place)
     * @param {function} compareFunction - usual Array.prototype.sort comparison function
     * @returns {Matrix} this
     */
    sortRows(compareFunction) {
        if (compareFunction === undefined) compareFunction = compareNumbers;
        for (var i = 0; i < this.rows; i++) {
            this[i].sort(compareFunction);
        }
        return this;
    }

    /**
     * Sorts the columns (in place)
     * @param {function} compareFunction - usual Array.prototype.sort comparison function
     * @returns {Matrix} this
     */
    sortColumns(compareFunction) {
        if (compareFunction === undefined) compareFunction = compareNumbers;
        for (var i = 0; i < this.columns; i++) {
            this.setColumn(i, this.getColumn(i).sort(compareFunction));
        }
        return this;
    }

    /**
     * Returns a subset of the matrix
     * @param {number} startRow - First row index
     * @param {number} endRow - Last row index
     * @param {number} startColumn - First column index
     * @param {number} endColumn - Last column index
     * @returns {Matrix}
     */
    subMatrix(startRow, endRow, startColumn, endColumn) {
        if ((startRow > endRow) || (startColumn > endColumn) || (startRow < 0) || (startRow >= this.rows) || (endRow < 0) || (endRow >= this.rows) || (startColumn < 0) || (startColumn >= this.columns) || (endColumn < 0) || (endColumn >= this.columns)) {
            throw new RangeError('Argument out of range');
        }
        var newMatrix = new Matrix(endRow - startRow + 1, endColumn - startColumn + 1);
        for (var i = startRow; i <= endRow; i++) {
            for (var j = startColumn; j <= endColumn; j++) {
                newMatrix[i - startRow][j - startColumn] = this[i][j];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a subset of the matrix based on an array of row indices
     * @param {Array} indices - Array containing the row indices
     * @param {number} [startColumn = 0] - First column index
     * @param {number} [endColumn = this.columns-1] - Last column index
     * @returns {Matrix}
     */
    subMatrixRow(indices, startColumn, endColumn) {
        if (startColumn === undefined) startColumn = 0;
        if (endColumn === undefined) endColumn = this.columns - 1;
        if ((startColumn > endColumn) || (startColumn < 0) || (startColumn >= this.columns) || (endColumn < 0) || (endColumn >= this.columns)) {
            throw new RangeError('Argument out of range');
        }

        var newMatrix = new Matrix(indices.length, endColumn - startColumn + 1);
        for (var i = 0; i < indices.length; i++) {
            for (var j = startColumn; j <= endColumn; j++) {
                if (indices[i] < 0 || indices[i] >= this.rows) {
                    throw new RangeError('Row index out of range: ' + indices[i]);
                }
                newMatrix[i][j - startColumn] = this[indices[i]][j];
            }
        }
        return newMatrix;
    }

    /**
     * Returns a subset of the matrix based on an array of column indices
     * @param {Array} indices - Array containing the column indices
     * @param {number} [startRow = 0] - First row index
     * @param {number} [endRow = this.rows-1] - Last row index
     * @returns {Matrix}
     */
    subMatrixColumn(indices, startRow, endRow) {
        if (startRow === undefined) startRow = 0;
        if (endRow === undefined) endRow = this.rows - 1;
        if ((startRow > endRow) || (startRow < 0) || (startRow >= this.rows) || (endRow < 0) || (endRow >= this.rows)) {
            throw new RangeError('Argument out of range');
        }

        var newMatrix = new Matrix(endRow - startRow + 1, indices.length);
        for (var i = 0; i < indices.length; i++) {
            for (var j = startRow; j <= endRow; j++) {
                if (indices[i] < 0 || indices[i] >= this.columns) {
                    throw new RangeError('Column index out of range: ' + indices[i]);
                }
                newMatrix[j - startRow][i] = this[j][indices[i]];
            }
        }
        return newMatrix;
    }

    /**
     * Returns the trace of the matrix (sum of the diagonal elements)
     * @returns {number}
     */
    trace() {
        var min = Math.min(this.rows, this.columns);
        var trace = 0;
        for (var i = 0; i < min; i++) {
            trace += this[i][i];
        }
        return trace;
    }
}

Matrix.prototype.klass = 'Matrix';

module.exports = Matrix;

/**
 * @private
 * Check that a row index is not out of bounds
 * @param {Matrix} matrix
 * @param {number} index
 * @param {boolean} [outer]
 */
function checkRowIndex(matrix, index, outer) {
    var max = outer ? matrix.rows : matrix.rows - 1;
    if (index < 0 || index > max)
        throw new RangeError('Row index out of range');
}

/**
 * @private
 * Check that the provided vector is an array with the right length
 * @param {Matrix} matrix
 * @param {Array|Matrix} vector
 * @param {boolean} copy
 * @returns {Array}
 * @throws {RangeError}
 */
function checkRowVector(matrix, vector, copy) {
    if (Matrix.isMatrix(vector)) {
        vector = vector.to1DArray();
    } else if (copy) {
        vector = [].concat(vector);
    }
    if (vector.length !== matrix.columns)
        throw new RangeError('vector size must be the same as the number of columns');
    return vector;
}

/**
 * @private
 * Check that the provided vector is an array with the right length
 * @param {Matrix} matrix
 * @param {Array|Matrix} vector
 * @param {boolean} copy
 * @returns {Array}
 * @throws {RangeError}
 */
function checkColumnVector(matrix, vector, copy) {
    if (Matrix.isMatrix(vector)) {
        vector = vector.to1DArray();
    } else if (copy) {
        vector = [].concat(vector);
    }
    if (vector.length !== matrix.rows)
        throw new RangeError('vector size must be the same as the number of rows');
    return vector;
}

/**
 * @private
 * Check that a column index is not out of bounds
 * @param {Matrix} matrix
 * @param {number} index
 * @param {boolean} [outer]
 */
function checkColumnIndex(matrix, index, outer) {
    var max = outer ? matrix.columns : matrix.columns - 1;
    if (index < 0 || index > max)
        throw new RangeError('Column index out of range');
}

/**
 * @private
 * Check that two matrices have the same dimensions
 * @param {Matrix} matrix
 * @param {Matrix} otherMatrix
 */
function checkDimensions(matrix, otherMatrix) {
    if (matrix.rows !== otherMatrix.length ||
        matrix.columns !== otherMatrix[0].length) {
        throw new RangeError('Matrices dimensions must be equal');
    }
}

function compareNumbers(a, b) {
    return a - b;
}

/*
Synonyms
 */

Matrix.random = Matrix.rand;
Matrix.diagonal = Matrix.diag;
Matrix.prototype.diagonal = Matrix.prototype.diag;
Matrix.identity = Matrix.eye;
Matrix.prototype.negate = Matrix.prototype.neg;

/*
Add dynamically instance and static methods for mathematical operations
 */

var inplaceOperator = `
(function %name%(value) {
    if (typeof value === 'number') return this.%name%S(value);
    return this.%name%M(value);
})
`;

var inplaceOperatorScalar = `
(function %name%S(value) {
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = this[i][j] %op% value;
        }
    }
    return this;
})
`;

var inplaceOperatorMatrix = `
(function %name%M(matrix) {
    checkDimensions(this, matrix);
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = this[i][j] %op% matrix[i][j];
        }
    }
    return this;
})
`;

var staticOperator = `
(function %name%(matrix, value) {
    var newMatrix = new Matrix(matrix);
    return newMatrix.%name%(value);
})
`;

var inplaceMethod = `
(function %name%() {
    for (var i = 0; i < this.rows; i++) {
        for (var j = 0; j < this.columns; j++) {
            this[i][j] = %method%(this[i][j]);
        }
    }
    return this;
})
`;

var staticMethod = `
(function %name%(matrix) {
    var newMatrix = new Matrix(matrix);
    return newMatrix.%name%();
})
`;

var operators = [
    // Arithmetic operators
    ['+', 'add'],
    ['-', 'sub', 'subtract'],
    ['*', 'mul', 'multiply'],
    ['/', 'div', 'divide'],
    ['%', 'mod', 'modulus'],
    // Bitwise operators
    ['&', 'and'],
    ['|', 'or'],
    ['^', 'xor'],
    ['<<', 'leftShift'],
    ['>>', 'signPropagatingRightShift'],
    ['>>>', 'rightShift', 'zeroFillRightShift']
];

for (var operator of operators) {
    for (var i = 1; i < operator.length; i++) {
        Matrix.prototype[operator[i]] = eval(fillTemplateFunction(inplaceOperator, {name: operator[i], op: operator[0]}));
        Matrix.prototype[operator[i] + 'S'] = eval(fillTemplateFunction(inplaceOperatorScalar, {name: operator[i] + 'S', op: operator[0]}));
        Matrix.prototype[operator[i] + 'M'] = eval(fillTemplateFunction(inplaceOperatorMatrix, {name: operator[i] + 'M', op: operator[0]}));

        Matrix[operator[i]] = eval(fillTemplateFunction(staticOperator, {name: operator[i]}));
    }
}

var methods = [
    ['~', 'not']
];

[
    'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'cbrt', 'ceil',
    'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'log', 'log1p',
    'log10', 'log2', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc'
].forEach(function (mathMethod) {
    methods.push(['Math.' + mathMethod, mathMethod]);
});

for (var method of methods) {
    for (var i = 1; i < method.length; i++) {
        Matrix.prototype[method[i]] = eval(fillTemplateFunction(inplaceMethod, {name: method[i], method: method[0]}));
        Matrix[method[i]] = eval(fillTemplateFunction(staticMethod, {name: method[i]}));
    }
}

function fillTemplateFunction(template, values) {
    for (var i in values) {
        template = template.replace(new RegExp('%' + i + '%', 'g'), values[i]);
    }
    return template;
}

},{}],10:[function(require,module,exports){
arguments[4][1][0].apply(exports,arguments)
},{"../matrix":18,"dup":1}],11:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"../matrix":18,"./util":15,"dup":2}],12:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"../matrix":18,"dup":3}],13:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"../matrix":18,"./util":15,"dup":4}],14:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"../matrix":18,"./util":15,"dup":5}],15:[function(require,module,exports){
arguments[4][6][0].apply(exports,arguments)
},{"dup":6}],16:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"./dc/cholesky":10,"./dc/evd":11,"./dc/lu":12,"./dc/qr":13,"./dc/svd":14,"./matrix":18,"dup":7}],17:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"./decompositions":16,"./matrix":18,"dup":8}],18:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"dup":9}],19:[function(require,module,exports){
'use strict';

function compareNumbers(a, b) {
    return a - b;
}

/**
 * Computes the sum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.sum = function sum(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum;
};

/**
 * Computes the maximum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.max = function max(values) {
    var max = -Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] > max) max = values[i];
    }
    return max;
};

/**
 * Computes the minimum of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.min = function min(values) {
    var min = Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] < min) min = values[i];
    }
    return min;
};

/**
 * Computes the min and max of the given values
 * @param {Array} values
 * @returns {{min: number, max: number}}
 */
exports.minMax = function minMax(values) {
    var min = Infinity;
    var max = -Infinity;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
    }
    return {
        min: min,
        max: max
    };
};

/**
 * Computes the arithmetic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.arithmeticMean = function arithmeticMean(values) {
    var sum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        sum += values[i];
    }
    return sum / l;
};

/**
 * {@link arithmeticMean}
 */
exports.mean = exports.arithmeticMean;

/**
 * Computes the geometric mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.geometricMean = function geometricMean(values) {
    var mul = 1;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        mul *= values[i];
    }
    return Math.pow(mul, 1 / l);
};

/**
 * Computes the mean of the log of the given values
 * If the return value is exponentiated, it gives the same result as the
 * geometric mean.
 * @param {Array} values
 * @returns {number}
 */
exports.logMean = function logMean(values) {
    var lnsum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        lnsum += Math.log(values[i]);
    }
    return lnsum / l;
};

/**
 * Computes the weighted grand mean for a list of means and sample sizes
 * @param {Array} means - Mean values for each set of samples
 * @param {Array} samples - Number of original values for each set of samples
 * @returns {number}
 */
exports.grandMean = function grandMean(means, samples) {
    var sum = 0;
    var n = 0;
    var l = means.length;
    for (var i = 0; i < l; i++) {
        sum += samples[i] * means[i];
        n += samples[i];
    }
    return sum / n;
};

/**
 * Computes the truncated mean of the given values using a given percentage
 * @param {Array} values
 * @param {number} percent - The percentage of values to keep (range: [0,1])
 * @param {boolean} [alreadySorted=false]
 * @returns {number}
 */
exports.truncatedMean = function truncatedMean(values, percent, alreadySorted) {
    if (alreadySorted === undefined) alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice().sort(compareNumbers);
    }
    var l = values.length;
    var k = Math.floor(l * percent);
    var sum = 0;
    for (var i = k; i < (l - k); i++) {
        sum += values[i];
    }
    return sum / (l - 2 * k);
};

/**
 * Computes the harmonic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.harmonicMean = function harmonicMean(values) {
    var sum = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        if (values[i] === 0) {
            throw new RangeError('value at index ' + i + 'is zero');
        }
        sum += 1 / values[i];
    }
    return l / sum;
};

/**
 * Computes the contraharmonic mean of the given values
 * @param {Array} values
 * @returns {number}
 */
exports.contraHarmonicMean = function contraHarmonicMean(values) {
    var r1 = 0;
    var r2 = 0;
    var l = values.length;
    for (var i = 0; i < l; i++) {
        r1 += values[i] * values[i];
        r2 += values[i];
    }
    if (r2 < 0) {
        throw new RangeError('sum of values is negative');
    }
    return r1 / r2;
};

/**
 * Computes the median of the given values
 * @param {Array} values
 * @param {boolean} [alreadySorted=false]
 * @returns {number}
 */
exports.median = function median(values, alreadySorted) {
    if (alreadySorted === undefined) alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice().sort(compareNumbers);
    }
    var l = values.length;
    var half = Math.floor(l / 2);
    if (l % 2 === 0) {
        return (values[half - 1] + values[half]) * 0.5;
    } else {
        return values[half];
    }
};

/**
 * Computes the variance of the given values
 * @param {Array} values
 * @param {boolean} [unbiased=true] - if true, divide by (n-1); if false, divide by n.
 * @returns {number}
 */
exports.variance = function variance(values, unbiased) {
    if (unbiased === undefined) unbiased = true;
    var theMean = exports.mean(values);
    var theVariance = 0;
    var l = values.length;

    for (var i = 0; i < l; i++) {
        var x = values[i] - theMean;
        theVariance += x * x;
    }

    if (unbiased) {
        return theVariance / (l - 1);
    } else {
        return theVariance / l;
    }
};

/**
 * Computes the standard deviation of the given values
 * @param {Array} values
 * @param {boolean} [unbiased=true] - if true, divide by (n-1); if false, divide by n.
 * @returns {number}
 */
exports.standardDeviation = function standardDeviation(values, unbiased) {
    return Math.sqrt(exports.variance(values, unbiased));
};

exports.standardError = function standardError(values) {
    return exports.standardDeviation(values) / Math.sqrt(values.length);
};

exports.quartiles = function quartiles(values, alreadySorted) {
    if (typeof(alreadySorted) === 'undefined') alreadySorted = false;
    if (!alreadySorted) {
        values = values.slice();
        values.sort(compareNumbers);
    }

    var quart = values.length / 4;
    var q1 = values[Math.ceil(quart) - 1];
    var q2 = exports.median(values, true);
    var q3 = values[Math.ceil(quart * 3) - 1];

    return {q1: q1, q2: q2, q3: q3};
};

exports.pooledStandardDeviation = function pooledStandardDeviation(samples, unbiased) {
    return Math.sqrt(exports.pooledVariance(samples, unbiased));
};

exports.pooledVariance = function pooledVariance(samples, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var sum = 0;
    var length = 0, l = samples.length;
    for (var i = 0; i < l; i++) {
        var values = samples[i];
        var vari = exports.variance(values);

        sum += (values.length - 1) * vari;

        if (unbiased)
            length += values.length - 1;
        else
            length += values.length;
    }
    return sum / length;
};

exports.mode = function mode(values) {
    var l = values.length,
        itemCount = new Array(l),
        i;
    for (i = 0; i < l; i++) {
        itemCount[i] = 0;
    }
    var itemArray = new Array(l);
    var count = 0;

    for (i = 0; i < l; i++) {
        var index = itemArray.indexOf(values[i]);
        if (index >= 0)
            itemCount[index]++;
        else {
            itemArray[count] = values[i];
            itemCount[count] = 1;
            count++;
        }
    }

    var maxValue = 0, maxIndex = 0;
    for (i = 0; i < count; i++) {
        if (itemCount[i] > maxValue) {
            maxValue = itemCount[i];
            maxIndex = i;
        }
    }

    return itemArray[maxIndex];
};

exports.covariance = function covariance(vector1, vector2, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var mean1 = exports.mean(vector1);
    var mean2 = exports.mean(vector2);

    if (vector1.length !== vector2.length)
        throw "Vectors do not have the same dimensions";

    var cov = 0, l = vector1.length;
    for (var i = 0; i < l; i++) {
        var x = vector1[i] - mean1;
        var y = vector2[i] - mean2;
        cov += x * y;
    }

    if (unbiased)
        return cov / (l - 1);
    else
        return cov / l;
};

exports.skewness = function skewness(values, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var theMean = exports.mean(values);

    var s2 = 0, s3 = 0, l = values.length;
    for (var i = 0; i < l; i++) {
        var dev = values[i] - theMean;
        s2 += dev * dev;
        s3 += dev * dev * dev;
    }
    var m2 = s2 / l;
    var m3 = s3 / l;

    var g = m3 / (Math.pow(m2, 3 / 2.0));
    if (unbiased) {
        var a = Math.sqrt(l * (l - 1));
        var b = l - 2;
        return (a / b) * g;
    }
    else {
        return g;
    }
};

exports.kurtosis = function kurtosis(values, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var theMean = exports.mean(values);
    var n = values.length, s2 = 0, s4 = 0;

    for (var i = 0; i < n; i++) {
        var dev = values[i] - theMean;
        s2 += dev * dev;
        s4 += dev * dev * dev * dev;
    }
    var m2 = s2 / n;
    var m4 = s4 / n;

    if (unbiased) {
        var v = s2 / (n - 1);
        var a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
        var b = s4 / (v * v);
        var c = ((n - 1) * (n - 1)) / ((n - 2) * (n - 3));

        return a * b - 3 * c;
    }
    else {
        return m4 / (m2 * m2) - 3;
    }
};

exports.entropy = function entropy(values, eps) {
    if (typeof(eps) === 'undefined') eps = 0;
    var sum = 0, l = values.length;
    for (var i = 0; i < l; i++)
        sum += values[i] * Math.log(values[i] + eps);
    return -sum;
};

exports.weightedMean = function weightedMean(values, weights) {
    var sum = 0, l = values.length;
    for (var i = 0; i < l; i++)
        sum += values[i] * weights[i];
    return sum;
};

exports.weightedStandardDeviation = function weightedStandardDeviation(values, weights) {
    return Math.sqrt(exports.weightedVariance(values, weights));
};

exports.weightedVariance = function weightedVariance(values, weights) {
    var theMean = exports.weightedMean(values, weights);
    var vari = 0, l = values.length;
    var a = 0, b = 0;

    for (var i = 0; i < l; i++) {
        var z = values[i] - theMean;
        var w = weights[i];

        vari += w * (z * z);
        b += w;
        a += w * w;
    }

    return vari * (b / (b * b - a));
};

exports.center = function center(values, inPlace) {
    if (typeof(inPlace) === 'undefined') inPlace = false;

    var result = values;
    if (!inPlace)
        result = values.slice();

    var theMean = exports.mean(result), l = result.length;
    for (var i = 0; i < l; i++)
        result[i] -= theMean;
};

exports.standardize = function standardize(values, standardDev, inPlace) {
    if (typeof(standardDev) === 'undefined') standardDev = exports.standardDeviation(values);
    if (typeof(inPlace) === 'undefined') inPlace = false;
    var l = values.length;
    var result = inPlace ? values : new Array(l);
    for (var i = 0; i < l; i++)
        result[i] = values[i] / standardDev;
    return result;
};

exports.cumulativeSum = function cumulativeSum(array) {
    var l = array.length;
    var result = new Array(l);
    result[0] = array[0];
    for (var i = 1; i < l; i++)
        result[i] = result[i - 1] + array[i];
    return result;
};

},{}],20:[function(require,module,exports){
'use strict';

exports.array = require('./array');
exports.matrix = require('./matrix');

},{"./array":19,"./matrix":21}],21:[function(require,module,exports){
'use strict';
var arrayStat = require('./array');

// https://github.com/accord-net/framework/blob/development/Sources/Accord.Statistics/Tools.cs

function entropy(matrix, eps) {
    if (typeof(eps) === 'undefined') {
        eps = 0;
    }
    var sum = 0,
        l1 = matrix.length,
        l2 = matrix[0].length;
    for (var i = 0; i < l1; i++) {
        for (var j = 0; j < l2; j++) {
            sum += matrix[i][j] * Math.log(matrix[i][j] + eps);
        }
    }
    return -sum;
}

function mean(matrix, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    var rows = matrix.length,
        cols = matrix[0].length,
        theMean, N, i, j;

    if (dimension === -1) {
        theMean = [0];
        N = rows * cols;
        for (i = 0; i < rows; i++) {
            for (j = 0; j < cols; j++) {
                theMean[0] += matrix[i][j];
            }
        }
        theMean[0] /= N;
    } else if (dimension === 0) {
        theMean = new Array(cols);
        N = rows;
        for (j = 0; j < cols; j++) {
            theMean[j] = 0;
            for (i = 0; i < rows; i++) {
                theMean[j] += matrix[i][j];
            }
            theMean[j] /= N;
        }
    } else if (dimension === 1) {
        theMean = new Array(rows);
        N = cols;
        for (j = 0; j < rows; j++) {
            theMean[j] = 0;
            for (i = 0; i < cols; i++) {
                theMean[j] += matrix[j][i];
            }
            theMean[j] /= N;
        }
    } else {
        throw new Error('Invalid dimension');
    }
    return theMean;
}

function standardDeviation(matrix, means, unbiased) {
    var vari = variance(matrix, means, unbiased), l = vari.length;
    for (var i = 0; i < l; i++) {
        vari[i] = Math.sqrt(vari[i]);
    }
    return vari;
}

function variance(matrix, means, unbiased) {
    if (typeof(unbiased) === 'undefined') {
        unbiased = true;
    }
    means = means || mean(matrix);
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length;
    var vari = new Array(cols);

    for (var j = 0; j < cols; j++) {
        var sum1 = 0, sum2 = 0, x = 0;
        for (var i = 0; i < rows; i++) {
            x = matrix[i][j] - means[j];
            sum1 += x;
            sum2 += x * x;
        }
        if (unbiased) {
            vari[j] = (sum2 - ((sum1 * sum1) / rows)) / (rows - 1);
        } else {
            vari[j] = (sum2 - ((sum1 * sum1) / rows)) / rows;
        }
    }
    return vari;
}

function median(matrix) {
    var rows = matrix.length, cols = matrix[0].length;
    var medians = new Array(cols);

    for (var i = 0; i < cols; i++) {
        var data = new Array(rows);
        for (var j = 0; j < rows; j++) {
            data[j] = matrix[j][i];
        }
        data.sort();
        var N = data.length;
        if (N % 2 === 0) {
            medians[i] = (data[N / 2] + data[(N / 2) - 1]) * 0.5;
        } else {
            medians[i] = data[Math.floor(N / 2)];
        }
    }
    return medians;
}

function mode(matrix) {
    var rows = matrix.length,
        cols = matrix[0].length,
        modes = new Array(cols),
        i, j;
    for (i = 0; i < cols; i++) {
        var itemCount = new Array(rows);
        for (var k = 0; k < rows; k++) {
            itemCount[k] = 0;
        }
        var itemArray = new Array(rows);
        var count = 0;

        for (j = 0; j < rows; j++) {
            var index = itemArray.indexOf(matrix[j][i]);
            if (index >= 0) {
                itemCount[index]++;
            } else {
                itemArray[count] = matrix[j][i];
                itemCount[count] = 1;
                count++;
            }
        }

        var maxValue = 0, maxIndex = 0;
        for (j = 0; j < count; j++) {
            if (itemCount[j] > maxValue) {
                maxValue = itemCount[j];
                maxIndex = j;
            }
        }

        modes[i] = itemArray[maxIndex];
    }
    return modes;
}

function skewness(matrix, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var means = mean(matrix);
    var n = matrix.length, l = means.length;
    var skew = new Array(l);

    for (var j = 0; j < l; j++) {
        var s2 = 0, s3 = 0;
        for (var i = 0; i < n; i++) {
            var dev = matrix[i][j] - means[j];
            s2 += dev * dev;
            s3 += dev * dev * dev;
        }

        var m2 = s2 / n;
        var m3 = s3 / n;
        var g = m3 / Math.pow(m2, 3 / 2);

        if (unbiased) {
            var a = Math.sqrt(n * (n - 1));
            var b = n - 2;
            skew[j] = (a / b) * g;
        } else {
            skew[j] = g;
        }
    }
    return skew;
}

function kurtosis(matrix, unbiased) {
    if (typeof(unbiased) === 'undefined') unbiased = true;
    var means = mean(matrix);
    var n = matrix.length, m = matrix[0].length;
    var kurt = new Array(m);

    for (var j = 0; j < m; j++) {
        var s2 = 0, s4 = 0;
        for (var i = 0; i < n; i++) {
            var dev = matrix[i][j] - means[j];
            s2 += dev * dev;
            s4 += dev * dev * dev * dev;
        }
        var m2 = s2 / n;
        var m4 = s4 / n;

        if (unbiased) {
            var v = s2 / (n - 1);
            var a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
            var b = s4 / (v * v);
            var c = ((n - 1) * (n - 1)) / ((n - 2) * (n - 3));
            kurt[j] = a * b - 3 * c;
        } else {
            kurt[j] = m4 / (m2 * m2) - 3;
        }
    }
    return kurt;
}

function standardError(matrix) {
    var samples = matrix.length;
    var standardDeviations = standardDeviation(matrix), l = standardDeviations.length;
    var standardErrors = new Array(l);
    var sqrtN = Math.sqrt(samples);

    for (var i = 0; i < l; i++) {
        standardErrors[i] = standardDeviations[i] / sqrtN;
    }
    return standardErrors;
}

function covariance(matrix, dimension) {
    return scatter(matrix, undefined, dimension);
}

function scatter(matrix, divisor, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    if (typeof(divisor) === 'undefined') {
        if (dimension === 0) {
            divisor = matrix.length - 1;
        } else if (dimension === 1) {
            divisor = matrix[0].length - 1;
        }
    }
    var means = mean(matrix, dimension),
        rows = matrix.length;
    if (rows === 0) {
        return [[]];
    }
    var cols = matrix[0].length,
        cov, i, j, s, k;

    if (dimension === 0) {
        cov = new Array(cols);
        for (i = 0; i < cols; i++) {
            cov[i] = new Array(cols);
        }
        for (i = 0; i < cols; i++) {
            for (j = i; j < cols; j++) {
                s = 0;
                for (k = 0; k < rows; k++) {
                    s += (matrix[k][j] - means[j]) * (matrix[k][i] - means[i]);
                }
                s /= divisor;
                cov[i][j] = s;
                cov[j][i] = s;
            }
        }
    } else if (dimension === 1) {
        cov = new Array(rows);
        for (i = 0; i < rows; i++) {
            cov[i] = new Array(rows);
        }
        for (i = 0; i < rows; i++) {
            for (j = i; j < rows; j++) {
                s = 0;
                for (k = 0; k < cols; k++) {
                    s += (matrix[j][k] - means[j]) * (matrix[i][k] - means[i]);
                }
                s /= divisor;
                cov[i][j] = s;
                cov[j][i] = s;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    return cov;
}

function correlation(matrix) {
    var means = mean(matrix),
        standardDeviations = standardDeviation(matrix, true, means),
        scores = zScores(matrix, means, standardDeviations),
        rows = matrix.length,
        cols = matrix[0].length,
        i, j;

    var cor = new Array(cols);
    for (i = 0; i < cols; i++) {
        cor[i] = new Array(cols);
    }
    for (i = 0; i < cols; i++) {
        for (j = i; j < cols; j++) {
            var c = 0;
            for (var k = 0, l = scores.length; k < l; k++) {
                c += scores[k][j] * scores[k][i];
            }
            c /= rows - 1;
            cor[i][j] = c;
            cor[j][i] = c;
        }
    }
    return cor;
}

function zScores(matrix, means, standardDeviations) {
    means = means || mean(matrix);
    if (typeof(standardDeviations) === 'undefined') standardDeviations = standardDeviation(matrix, true, means);
    return standardize(center(matrix, means, false), standardDeviations, true);
}

function center(matrix, means, inPlace) {
    means = means || mean(matrix);
    var result = matrix,
        l = matrix.length,
        i, j, jj;

    if (!inPlace) {
        result = new Array(l);
        for (i = 0; i < l; i++) {
            result[i] = new Array(matrix[i].length);
        }
    }

    for (i = 0; i < l; i++) {
        var row = result[i];
        for (j = 0, jj = row.length; j < jj; j++) {
            row[j] = matrix[i][j] - means[j];
        }
    }
    return result;
}

function standardize(matrix, standardDeviations, inPlace) {
    if (typeof(standardDeviations) === 'undefined') standardDeviations = standardDeviation(matrix);
    var result = matrix,
        l = matrix.length,
        i, j, jj;

    if (!inPlace) {
        result = new Array(l);
        for (i = 0; i < l; i++) {
            result[i] = new Array(matrix[i].length);
        }
    }

    for (i = 0; i < l; i++) {
        var resultRow = result[i];
        var sourceRow = matrix[i];
        for (j = 0, jj = resultRow.length; j < jj; j++) {
            if (standardDeviations[j] !== 0 && !isNaN(standardDeviations[j])) {
                resultRow[j] = sourceRow[j] / standardDeviations[j];
            }
        }
    }
    return result;
}

function weightedVariance(matrix, weights) {
    var means = mean(matrix);
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length;
    var vari = new Array(cols);

    for (var j = 0; j < cols; j++) {
        var sum = 0;
        var a = 0, b = 0;

        for (var i = 0; i < rows; i++) {
            var z = matrix[i][j] - means[j];
            var w = weights[i];

            sum += w * (z * z);
            b += w;
            a += w * w;
        }

        vari[j] = sum * (b / (b * b - a));
    }

    return vari;
}

function weightedMean(matrix, weights, dimension) {
    if (typeof(dimension) === 'undefined') {
        dimension = 0;
    }
    var rows = matrix.length;
    if (rows === 0) return [];
    var cols = matrix[0].length,
        means, i, ii, j, w, row;

    if (dimension === 0) {
        means = new Array(cols);
        for (i = 0; i < cols; i++) {
            means[i] = 0;
        }
        for (i = 0; i < rows; i++) {
            row = matrix[i];
            w = weights[i];
            for (j = 0; j < cols; j++) {
                means[j] += row[j] * w;
            }
        }
    } else if (dimension === 1) {
        means = new Array(rows);
        for (i = 0; i < rows; i++) {
            means[i] = 0;
        }
        for (j = 0; j < rows; j++) {
            row = matrix[j];
            w = weights[j];
            for (i = 0; i < cols; i++) {
                means[j] += row[i] * w;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    var weightSum = arrayStat.sum(weights);
    if (weightSum !== 0) {
        for (i = 0, ii = means.length; i < ii; i++) {
            means[i] /= weightSum;
        }
    }
    return means;
}

function weightedCovariance(matrix, weights, means, dimension) {
    dimension = dimension || 0;
    means = means || weightedMean(matrix, weights, dimension);
    var s1 = 0, s2 = 0;
    for (var i = 0, ii = weights.length; i < ii; i++) {
        s1 += weights[i];
        s2 += weights[i] * weights[i];
    }
    var factor = s1 / (s1 * s1 - s2);
    return weightedScatter(matrix, weights, means, factor, dimension);
}

function weightedScatter(matrix, weights, means, factor, dimension) {
    dimension = dimension || 0;
    means = means || weightedMean(matrix, weights, dimension);
    if (typeof(factor) === 'undefined') {
        factor = 1;
    }
    var rows = matrix.length;
    if (rows === 0) {
        return [[]];
    }
    var cols = matrix[0].length,
        cov, i, j, k, s;

    if (dimension === 0) {
        cov = new Array(cols);
        for (i = 0; i < cols; i++) {
            cov[i] = new Array(cols);
        }
        for (i = 0; i < cols; i++) {
            for (j = i; j < cols; j++) {
                s = 0;
                for (k = 0; k < rows; k++) {
                    s += weights[k] * (matrix[k][j] - means[j]) * (matrix[k][i] - means[i]);
                }
                cov[i][j] = s * factor;
                cov[j][i] = s * factor;
            }
        }
    } else if (dimension === 1) {
        cov = new Array(rows);
        for (i = 0; i < rows; i++) {
            cov[i] = new Array(rows);
        }
        for (i = 0; i < rows; i++) {
            for (j = i; j < rows; j++) {
                s = 0;
                for (k = 0; k < cols; k++) {
                    s += weights[k] * (matrix[j][k] - means[j]) * (matrix[i][k] - means[i]);
                }
                cov[i][j] = s * factor;
                cov[j][i] = s * factor;
            }
        }
    } else {
        throw new Error('Invalid dimension');
    }

    return cov;
}

module.exports = {
    entropy: entropy,
    mean: mean,
    standardDeviation: standardDeviation,
    variance: variance,
    median: median,
    mode: mode,
    skewness: skewness,
    kurtosis: kurtosis,
    standardError: standardError,
    covariance: covariance,
    scatter: scatter,
    correlation: correlation,
    zScores: zScores,
    center: center,
    standardize: standardize,
    weightedVariance: weightedVariance,
    weightedMean: weightedMean,
    weightedCovariance: weightedCovariance,
    weightedScatter: weightedScatter
};

},{"./array":19}],22:[function(require,module,exports){
module.exports = require('./pca');

},{"./pca":23}],23:[function(require,module,exports){
'use strict';
var Matrix = require('ml-matrix');
var Stat = require('ml-stat');
var SVD = Matrix.DC.SVD;

module.exports = PCA;

/**
* Creates new PCA (Principal Component Analysis) from the dataset
* @param {Matrix} dataset
* @param {Object} options - options for the PCA algorithm
* @param {boolean} reload - for load purposes
* @param {Object} model - for load purposes
* @constructor
* */
function PCA(dataset, options, reload, model) {

    if (reload) {
        this.U = model.U;
        this.S = model.S;
        this.means = model.means;
        this.std = model.std;
        this.standardize = model.standardize
    } else {
        if(options === undefined) {
            options = {
                standardize: false
            };
        }

        this.standardize = options.standardize;

        if (!Matrix.isMatrix(dataset)) {
            dataset = new Matrix(dataset);
        } else {
            dataset = dataset.clone();
        }

        var normalization = adjust(dataset, this.standardize);
        var normalizedDataset = normalization.result;

        var covarianceMatrix = normalizedDataset.transpose().mmul(normalizedDataset).divS(dataset.rows);

        var target = new SVD(covarianceMatrix, {
            computeLeftSingularVectors: true,
            computeRightSingularVectors: true,
            autoTranspose: false
        });

        this.U = target.leftSingularVectors;
        this.S = target.diagonal;
        this.means = normalization.means;
        this.std = normalization.std;
    }
}

/**
* Load a PCA model from JSON
* @oaram {Object} model
* @return {PCA}
* */
PCA.load = function (model) {
    if(model.modelName !== 'PCA')
        throw new RangeError("The current model is invalid!");

    return new PCA(null, null, true, model);
};

/**
* Exports the current model to an Object
* @return {Object} model
* */
PCA.prototype.export = function () {
    return {
        modelName: "PCA",
        U: this.U,
        S: this.S,
        means: this.means,
        std: this.std,
        standardize: this.standardize
    };
};

/**
* Function that project the dataset into new space of k dimensions,
* this method doesn't modify your dataset.
* @param {Matrix} dataset.
* @param {Number} k - dimensions to project.
* @return {Matrix} dataset projected in k dimensions.
* @throws {RangeError} if k is larger than the number of eigenvector
*                      of the model.
* */
PCA.prototype.project = function (dataset, k) {
    var dimensions = k - 1;
    if(k > this.U.columns)
        throw new RangeError("the number of dimensions must not be larger than " + this.U.columns);

    if (!Matrix.isMatrix(dataset)) {
        dataset = new Matrix(dataset);
    } else {
        dataset = dataset.clone();
    }

    var X = adjust(dataset, this.standardize).result;
    return X.mmul(this.U.subMatrix(0, this.U.rows - 1, 0, dimensions));
};

/**
* This method returns the percentage variance of each eigenvector.
* @return {Number} percentage variance of each eigenvector.
* */
PCA.prototype.getExplainedVariance = function () {
    var sum = this.S.reduce(function (previous, value) {
        return previous + value;
    });
    return this.S.map(function (value) {
        return value / sum;
    });
};

/**
 * Function that returns the Eigenvectors of the covariance matrix.
 * @returns {Matrix}
 */
PCA.prototype.getEigenvectors = function () {
    return this.U;
};

/**
 * Function that returns the Eigenvalues (on the diagonal).
 * @returns {*}
 */
PCA.prototype.getEigenvalues = function () {
    return this.S;
};

/**
* This method returns a dataset normalized in the following form:
* X = (X - mean) / std
* @param dataset.
* @param {Boolean} standarize - do standardization
* @return A dataset normalized.
* */
function adjust(dataset, standarize) {
    var means = Stat.matrix.mean(dataset);
    var std = standarize ? Stat.matrix.standardDeviation(dataset, means, true) : undefined;

    var result = dataset.subRowVector(means);
    return {
        result: standarize ? result.divRowVector(std) : result,
        means: means,
        std: std
    }
}

},{"ml-matrix":17,"ml-stat":20}],24:[function(require,module,exports){
arguments[4][1][0].apply(exports,arguments)
},{"../matrix":32,"dup":1}],25:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"../matrix":32,"./util":29,"dup":2}],26:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"../matrix":32,"dup":3}],27:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"../matrix":32,"./util":29,"dup":4}],28:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"../matrix":32,"./util":29,"dup":5}],29:[function(require,module,exports){
arguments[4][6][0].apply(exports,arguments)
},{"dup":6}],30:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"./dc/cholesky":24,"./dc/evd":25,"./dc/lu":26,"./dc/qr":27,"./dc/svd":28,"./matrix":32,"dup":7}],31:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"./decompositions":30,"./matrix":32,"dup":8}],32:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"dup":9}],33:[function(require,module,exports){
arguments[4][19][0].apply(exports,arguments)
},{"dup":19}],34:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"./array":33,"./matrix":35,"dup":20}],35:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"./array":33,"dup":21}],36:[function(require,module,exports){
module.exports = exports = require('./pls');
exports.Utils = require('./utils');
exports.OPLS = require('./opls');

},{"./opls":37,"./pls":38,"./utils":39}],37:[function(require,module,exports){
'use strict';

var Matrix = require('ml-matrix');
var Utils = require('./utils');

module.exports = OPLS;

function OPLS(dataset, predictions, numberOSC) {
    var X = new Matrix(dataset);
    var y = new Matrix(predictions);

    X = Utils.featureNormalize(X).result;
    y = Utils.featureNormalize(y).result;

    var rows = X.rows;
    var columns = X.columns;

    var sumOfSquaresX = X.clone().mul(X).sum();
    var w = X.transpose().mmul(y);
    w.div(Utils.norm(w));

    var orthoW = new Array(numberOSC);
    var orthoT = new Array(numberOSC);
    var orthoP = new Array(numberOSC);
    for (var i = 0; i < numberOSC; i++) {
        var t = X.mmul(w);

        var numerator = X.transpose().mmul(t);
        var denominator = t.transpose().mmul(t)[0][0];
        var p =  numerator.div(denominator);

        numerator = w.transpose().mmul(p)[0][0];
        denominator = w.transpose().mmul(w)[0][0];
        var wOsc = p.sub(w.clone().mul(numerator / denominator));
        wOsc.div(Utils.norm(wOsc));

        var tOsc = X.mmul(wOsc);

        numerator = X.transpose().mmul(tOsc);
        denominator = tOsc.transpose().mmul(tOsc)[0][0];
        var pOsc = numerator.div(denominator);

        X.sub(tOsc.mmul(pOsc.transpose()));
        orthoW[i] = wOsc.getColumn(0);
        orthoT[i] = tOsc.getColumn(0);
        orthoP[i] = pOsc.getColumn(0);
    }

    this.Xosc = X;

    var sumOfSquaresXosx = this.Xosc.clone().mul(this.Xosc).sum();
    this.R2X = 1 - sumOfSquaresXosx/sumOfSquaresX;

    this.W = orthoW;
    this.T = orthoT;
    this.P = orthoP;
    this.numberOSC = numberOSC;
}

OPLS.prototype.correctDataset = function (dataset) {
    var X = new Matrix(dataset);

    var sumOfSquaresX = X.clone().mul(X).sum();
    for (var i = 0; i < this.numberOSC; i++) {
        var currentW = this.W.getColumnVector(i);
        var currentP = this.P.getColumnVector(i);

        var t = X.mmul(currentW);
        X.sub(t.mmul(currentP));
    }
    var sumOfSquaresXosx = X.clone().mul(X).sum();

    var R2X = 1 - sumOfSquaresXosx / sumOfSquaresX;

    return {
        datasetOsc: X,
        R2Dataset: R2X
    };
};
},{"./utils":39,"ml-matrix":31}],38:[function(require,module,exports){
'use strict';

module.exports = PLS;
var Matrix = require('ml-matrix');
var Utils = require('./utils');

/**
 * Retrieves the sum at the column of the given matrix.
 * @param matrix
 * @param column
 * @returns {number}
 */
function getColSum(matrix, column) {
    var sum = 0;
    for (var i = 0; i < matrix.rows; i++) {
        sum += matrix[i][column];
    }
    return sum;
}

/**
 * Function that returns the index where the sum of each
 * column vector is maximum.
 * @param {Matrix} data
 * @returns {number} index of the maximum
 */
function maxSumColIndex(data) {
    var maxIndex = 0;
    var maxSum = -Infinity;
    for(var i = 0; i < data.columns; ++i) {
        var currentSum = getColSum(data, i);
        if(currentSum > maxSum) {
            maxSum = currentSum;
            maxIndex = i;
        }
    }
    return maxIndex;
}

/**
 * Constructor of the PLS model.
 * @param reload - used for load purposes.
 * @param model - used for load purposes.
 * @constructor
 */
function PLS(reload, model) {
    if(reload) {
        this.E = Matrix.checkMatrix(model.E);
        this.F = Matrix.checkMatrix(model.F);
        this.ssqYcal = model.ssqYcal;
        this.R2X = model.R2X;
        this.ymean = Matrix.checkMatrix(model.ymean);
        this.ystd = Matrix.checkMatrix(model.ystd);
        this.PBQ = Matrix.checkMatrix(model.PBQ);
        this.T = Matrix.checkMatrix(model.T);
        this.P = Matrix.checkMatrix(model.P);
        this.U = Matrix.checkMatrix(model.U);
        this.Q = Matrix.checkMatrix(model.Q);
        this.W = Matrix.checkMatrix(model.W);
        this.B = Matrix.checkMatrix(model.B);
    }
}

/**
 * Function that fit the model with the given data and predictions, in this function is calculated the
 * following outputs:
 *
 * T - Score matrix of X
 * P - Loading matrix of X
 * U - Score matrix of Y
 * Q - Loading matrix of Y
 * B - Matrix of regression coefficient
 * W - Weight matrix of X
 *
 * @param {Matrix} trainingSet - Dataset to be apply the model
 * @param {Matrix} predictions - Predictions over each case of the dataset
 * @param {Number} options - recieves the latentVectors and the tolerance of each step of the PLS
 */
PLS.prototype.train = function (trainingSet, predictions, options) {

    if(options === undefined) options = {};

    var latentVectors = options.latentVectors;
    if(latentVectors === undefined || isNaN(latentVectors)) {
        throw new RangeError("Latent vector must be a number.");
    }

    var tolerance = options.tolerance;
    if(tolerance === undefined || isNaN(tolerance)) {
        throw new RangeError("Tolerance must be a number");
    }

    if(trainingSet.length !== predictions.length)
        throw new RangeError("The number of predictions and elements in the dataset must be the same");

    //var tolerance = 1e-9;
    var X = Utils.featureNormalize(new Matrix(trainingSet)).result;
    var resultY = Utils.featureNormalize(new Matrix(predictions));
    this.ymean = resultY.means.neg();
    this.ystd = resultY.std;
    var Y = resultY.result;

    var rx = X.rows;
    var cx = X.columns;
    var ry = Y.rows;
    var cy = Y.columns;

    if(rx != ry) {
        throw new RangeError("dataset cases is not the same as the predictions");
    }

    var ssqXcal = X.clone().mul(X).sum(); // for the r²
    var sumOfSquaresY = Y.clone().mul(Y).sum();

    var n = latentVectors; //Math.max(cx, cy); // components of the pls
    var T = Matrix.zeros(rx, n);
    var P = Matrix.zeros(cx, n);
    var U = Matrix.zeros(ry, n);
    var Q = Matrix.zeros(cy, n);
    var B = Matrix.zeros(n, n);
    var W = P.clone();
    var k = 0;
    var R2X = new Array(n);

    while(Utils.norm(Y) > tolerance && k < n) {
        var transposeX = X.transpose();
        var transposeY = Y.transpose();

        var tIndex = maxSumColIndex(X.clone().mulM(X));
        var uIndex = maxSumColIndex(Y.clone().mulM(Y));

        var t1 = X.getColumnVector(tIndex);
        var u = Y.getColumnVector(uIndex);
        var t = Matrix.zeros(rx, 1);

        while(Utils.norm(t1.clone().sub(t)) > tolerance) {
            var w = transposeX.mmul(u);
            w.div(Utils.norm(w));
            t = t1;
            t1 = X.mmul(w);
            var q = transposeY.mmul(t1);
            q.div(Utils.norm(q));
            u = Y.mmul(q);
        }

        t = t1;
        var num = transposeX.mmul(t);
        var den = (t.transpose().mmul(t))[0][0];
        var p = num.div(den);
        var pnorm = Utils.norm(p);
        p.div(pnorm);
        t.mul(pnorm);
        w.mul(pnorm);

        num = u.transpose().mmul(t);
        den = (t.transpose().mmul(t))[0][0];
        var b = (num.div(den))[0][0];
        X.sub(t.mmul(p.transpose()));
        Y.sub(t.clone().mul(b).mmul(q.transpose()));

        T.setColumn(k, t);
        P.setColumn(k, p);
        U.setColumn(k, u);
        Q.setColumn(k, q);
        W.setColumn(k, w);

        B[k][k] = b;
        k++;
    }

    k--;
    T = T.subMatrix(0, T.rows - 1, 0, k);
    P = P.subMatrix(0, P.rows - 1, 0, k);
    U = U.subMatrix(0, U.rows - 1, 0, k);
    Q = Q.subMatrix(0, Q.rows - 1, 0, k);
    W = W.subMatrix(0, W.rows - 1, 0, k);
    B = B.subMatrix(0, k, 0, k);

    this.R2X = t.transpose().mmul(t).mmul(p.transpose().mmul(p)).divS(ssqXcal)[0][0];

    // TODO: review of R2Y
    //this.R2Y = t.transpose().mmul(t).mul(q[k][0]*q[k][0]).divS(ssqYcal)[0][0];

    this.ssqYcal = sumOfSquaresY;
    this.E = X;
    this.F = Y;
    this.T = T;
    this.P = P;
    this.U = U;
    this.Q = Q;
    this.W = W;
    this.B = B;
    this.PBQ = P.mmul(B).mmul(Q.transpose());
};

/**
 * Function that predict the behavior of the given dataset.
 * @param dataset - data to be predicted.
 * @returns {Matrix} - predictions of each element of the dataset.
 */
PLS.prototype.predict = function (dataset) {
    var X = new Matrix(dataset);
    var normalization = Utils.featureNormalize(X);
    X = normalization.result;
    var Y = X.mmul(this.PBQ);
    Y.mulRowVector(this.ystd);
    Y.addRowVector(this.ymean);
    return Y;
};

/**
 * Function that returns the explained variance on training of the PLS model.
 * @returns {number}
 */
PLS.prototype.getExplainedVariance = function () {
    return this.R2X;
};

/**
 * Load a PLS model from an Object
 * @param model
 * @returns {PLS} - PLS object from the given model
 */
PLS.load = function (model) {
    if(model.modelName !== 'PLS')
        throw new RangeError("The current model is invalid!");

    return new PLS(true, model);
};

/**
 * Function that exports a PLS model to an Object.
 * @returns {{modelName: string, ymean: *, ystd: *, PBQ: *}} model.
 */
PLS.prototype.export = function () {
    return {
        modelName: "PLS",
        E: this.E,
        F: this.F,
        R2X: this.R2X,
        ssqYcal: this.ssqYcal,
        ymean: this.ymean,
        ystd: this.ystd,
        PBQ: this.PBQ,
        T: this.T,
        P: this.P,
        U: this.U,
        Q: this.Q,
        W: this.W,
        B: this.B
    };
};

},{"./utils":39,"ml-matrix":31}],39:[function(require,module,exports){
'use strict';

var Matrix = require('ml-matrix');
var Stat = require('ml-stat');

/**
 * Function that given vector, returns his norm
 * @param {Vector} X
 * @returns {number} Norm of the vector
 */
function norm(X) {
    return Math.sqrt(X.clone().apply(pow2array).sum());
}

/**
 * Function that pow 2 each element of a Matrix or a Vector,
 * used in the apply method of the Matrix object
 * @param i - index i.
 * @param j - index j.
 * @return The Matrix object modified at the index i, j.
 * */
function pow2array(i, j) {
    this[i][j] = this[i][j] * this[i][j];
    return this;
}

/**
 * Function that normalize the dataset and return the means and
 * standard deviation of each feature.
 * @param dataset
 * @returns {{result: Matrix, means: (*|number), std: Matrix}} dataset normalized, means
 *                                                             and standard deviations
 */
function featureNormalize(dataset) {
    var means = Stat.matrix.mean(dataset);
    var std = Matrix.rowVector(Stat.matrix.standardDeviation(dataset, means, true));
    means = Matrix.rowVector(means);

    var result = dataset.addRowVector(means.neg());
    return {result: result.divRowVector(std), means: means, std: std};
}

module.exports = {
    norm: norm,
    pow2array: pow2array,
    featureNormalize: featureNormalize
};


},{"ml-matrix":31,"ml-stat":34}],40:[function(require,module,exports){
//This file includes services which rely on node public modules.
angular.module('app.nodeServices', ['ionic', 'ngCordova'])

.service('chemo', function(){

    var lib_pls = require('ml-pls');
    var lib_pca = require('ml-pca');
    var lib_matrix = require('ml-matrix');

    var chemoIsPls;
    var chemoConcentrationLabels = [];
    var chemoTrainingAbsorbances = [];
    var chemoTrainingConcentrations = [];
    var chemoPCACompressed = [];
    var chemoNumLatentVectors = 0;
    var chemoIsTrained = false;
    //represents a Pls or PCA module.
    var chemoAlgo;

    var chemoFlags = {
        success: 0,
        failFileID: 1,
        failTrainingRowMismatch: 2,
        failNotEnoughLabels: 3,
        failNoTrainingData: 4,
        failUnknownTrainError: 5,
        failUnknownInferenceError: 6,
        failAbsorbanceMismatch: 7,
        failConcentrationMismatch: 8,
        failFileNotSaved: 9,
        failInferenceRowMismatch: 10,
        failInferenceColumnMismatch: 11
    }

    function databaseGetFile(fileID) {
        return { absorbances: [], concentrationLabels: [], concentrations: [] }
    };

    function chemoGetFile(fileID) {
        return databaseGetFile(fileID);
    };

    function databaseAddFile(absorbances, concentrationLables, concentrations, fileName) {

    };

    function chemoAddLabels(labels) {

        var newLabelsLength = labels.length;
        var oldLabelsLength = chemoConcentrationLabels.length;
        //locationArr ([int]) holds the number of the column of a concentration matrix this label is linked to
        var locationArr = [];
        //Look to see if we have seen this label before
        for (var i = 0; i < newLabelsLength; ++i) {
            var notFound = true;
            for (var j = 0; j < oldLabelsLength; ++j) {
                //If we have seen before, make a note of what column the concentration will go in
                //inside of training-Y matrix.
                if (labels[i] == chemoConcentrationLabels[j]) {
                    notFound = false;
                    locationArr[locationArr.length] = j;
                }
            }
            //If never seen before, we add the label to a listing of labels.
            if (notFound) {
                chemoConcentrationLabels[oldLabelsLength] = labels[i];
                locationArr[locationArr.length] = oldLabelsLength;
            }
        }
        return locationArr;
    };

    //Adds a file with the measured absorptions and estimated concentrations.
    function chemoAddFile(absorbances, concentrationLables, concentrations) {
        databaseAddFile(absorbances, concentrationLables, concentrations);
    };

    function chemoAddConcentration(newConcentration, currRow, currCol) {
        //add index
        var numRow = chemoTrainingConcentrations.length;
        var numCol = 0;
        if (numRow > 0) {
            numCol = chemoTrainingConcentrations[0].length;
        }

        //If past last row by 1, make a new row (full of not-init)
        if (currRow == numRow) {
            numRow += 1;
            chemoTrainingConcentrations[currRow] = [];
            var currRowArr = chemoTrainingConcentrations[currRow];
            for (var i = 0; i < numCol; ++i) {
                currRowArr[i] = 0;
            }
        }
        //We pass the last column- add new column with 0 states.
        if (currCol == numCol) {
            numCol += 1;
            for (var i = 0; i < numRow; ++i) {
                var currRowArr = chemoTrainingConcentrations[i];
                if (i == currRow) {
                    currRowArr[currCol] = newConcentration;
                }
                else {
                    //When we add a column, we leave indices 0
                    currRowArr[currCol] = 0;
                }
            }
        }
        else {
            //In this situation we are overwriting a 0
            chemoTrainingConcentrations[currRow][currCol] = newConcentration;
        }
    };

    function chemoTrain(isQuantify, fileIDArr) {
        chemoIsPls = isQuantify;
        var numFiles = fileIDArr.length;
        for (var i = 0; i < numFiles; ++i) {
            var file = chemoGetFile(fileIDArr[i]);
            if (file == null) {
                return chemoFlags.failFileID;
            }
            else {
                //Add new chemical labels if there are any new ones in this file and associate labels with concentration indices
                var locationArr = chemoAddLabels(file.concentrationLabels);
                var numChemicals = locationArr.length;
                //Add absorbances as next row of matrix training-Y
                chemoTrainingAbsorbances[i] = file.absorbances;
                //Add chem concentration in correct part of training matrix X.
                for (var j = 0; j < numChemicals; ++j) {
                    //Each chem conc goes in ith row (as represents ith scan) at the index representing the appropriate label
                    chemoAddConcentration(file.concentrations[j], i, locationArr[j]);
                }
            }
        }
        if (chemoTrainingAbsorbances.length == 0) {
            //No training data means no success (also sometimes we use 0th row to find num of col)
            return chemoFlags.failNoTrainingData;
        }
        if (chemoTrainingAbsorbances.length != chemoTrainingConcentrations.length) {
            //There should be an array of concentrations for every array of absorbances
            return chemoFlags.failTrainingRowMismatch;
        }
        if (chemoConcentrationLabels.length != chemoTrainingConcentrations[0].length) {
            //We don't have a name for each material (Cry)
            return chemoFlags.failNotEnoughLabels;
        }
        if (chemoIsPls) {
            var numColAbsorbances = chemoTrainingAbsorbances[0].length;
            var numColConcentrations = chemoTrainingConcentrations[0].length;
            //Take 10% of data (probably of Y).
            var maxVectors = min(numColAbsorbances, numColConcentrations);
            var numLatentVectors = floor(maxVectors * 0.1);
            if (numLatentVectors == 0) {
                numLatentVectors += 1;
            }
            var explainedVariances = 0;
            while (numLatentVectors <= maxVectors && explainedVariances < 0.85) {
                chemoAlgo = new lib_pls();
                var options = {
                    latentVectors: numLatentVectors,
                    tolerance: 1e-5
                };
                try {
                    chemoAlgo.train(chemoTrainingAbsorbances, chemoTrainingConcentrations, options);
                }
                catch (err) {
                    return chemoFlags.failUnknownTrainError;
                }
                explainedVariances = chemoAlgo.getExplainedVariance();
                if (explainedVariances < 0.85) {
                    numLatentVectors++;
                }
            }
        }
        else {
            //Get principle components associated with training set absorbances X.
            try {
                chemoAlgo = new lib_pca(chemoTrainingAbsorbances);
            }
            catch (err) {
                return chemoFlags.failUnknownTrainError;
            }
            //chemoNumLatentVectors = floor(numColAbsorbances * 0.1);
            var explainedVariances = chemoAlgo.getExplainedVariance();
            //How many vectors to get ~85% of variance?
            chemoNumLatentVectors = floor(0.85 / explainedVariances);
            if (chemoNumLatentVectors == 0) {
                chemoNumLatentVectors += 1;
            }
            try {
                //Check parameter requirements
                chemoPCACompressed = chemoAlgo.project(chemoTrainingAbsorbances, chemoNumLatentVectors);
            }
            catch (err) {
                return chemoFlags.failUnknownTrainError;
            }
        }
        chemoIsTrained = true;
        return chemoFlags.success;
    };

    //Expect a 1D array containing absorbances, flag telling to save, (if save, provide a file name)
    function chemoInfer(measuredAbsorbances, doSave, fileName) {
        if (!chemoIsTrained) {
            return { compounds: [], concentrations: [], status: chemoFlags.failNoTrainingData };
        }
        if (measuredAbsorbances.length != chemoTrainingAbsorbances[0].length) {
            return { compounds: [], concentrations: [], status: chemoFlags.failAbsorbanceMismatch };
        }
        if (chemoIsPls) {
            var inferred = [];
            try {
                inferred = chemoAlgo.predict(measuredAbsorbances);
            }
            catch (err) {
                return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
            }
            if (inferred.length == 0) {
                return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
            }
            if (inferred[0].length != chemoTrainingConcentrations[0].length) {
                return { compounds: [], concentrations: [], status: chemoFlags.failConcentrationMismatch };
            }
            //The implementation provides a row of averages at the bottom (we don't want it)
            var allConcentrations = inferred[0];

            //Find the chemical names which have been detected.
            var labels = [];
            var nonZeroConcentrations = [];
            for (var i = 0; i < allConcentrations.length; ++i) {
                if (allConcentrations[i] != 0) {
                    labels[labels.length] = chemoConcentrationLabels[i];
                    nonZeroConcentrations[nonZeroConcentrations.length] = allConcentrations[i];
                }
            }

            if (doSave) {
                var databaseResult = databaseAddFile(measuredAbsorbances, labels, nonZeroConcentrations, fileName);
                if (databaseResult.status != chemoFlags.success) {
                    //This fail is a mixed bag- we succeed at getting our data, but we don't manage to save it to the file system.
                    return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.failFileNotSaved };
                }
            }

            return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
        }
        else {
            var measured = [];
            try {
                measured = chemoAlgo.project(measuredAbsorbances, chemoNumLatentVectors);
            }
            catch (err) {
                return { compounds: [], concentrations: [], status: chemoFlags.failUnknownInferenceError };
            }
            var distances = [];
            var numPoints = chemoPCACompressed.length;
            if (numPoints != chemoTrainingAbsorbances.length) {
                return { compounds: [], concentrations: [], status: chemoFlags.failInferenceRowMismatch };
            }
            if (chemoNumLatentVectors != chemoPCACompressed[0].length) {
                return { compounds: [], concentrations: [], status: chemoFlags.failInferenceColumnMismatch };
            }
            for (var i = 0; i < numPoints; ++i) {
                var sum = 0;
                var numComponents = chemoPCACompressed[i].length;
                for (var j = 0; j < numComponents; ++j) {
                    //(x1-x2)^2
                    var component = measured[j] - chemoPCACompressed[i][j];
                    component = component * component;
                    sum += component;
                }
                //Square root of distances squared is the euclidean distance formula
                sum = sqrt(sum);
                distance[i] = sum;
            }
            //Linear search to find point with minimum distance from new observation
            var minimumDistance = distances[0];
            var minimumIndex = 0;
            for (var i = 1; i < numPoints; ++i) {
                if (distances[i] < minimumDistance) {
                    minimumDistance = distances[i];
                    minimumIndex = i;
                }
            }
            var allConcentrations = chemoTrainingConcentrations[minimumIndex];
            var labels = [];
            var nonZeroConcentrations = [];
            for (var i = 0; i < allConcentrations.length; ++i) {
                if (allConcentrations[i] != 0) {
                    labels[labels.length] = chemoConcentrationLabels[i];
                    nonZeroConcentrations[nonZeroConcentrations.length] = allConcentrations[i];
                }
            }

            if (doSave) {
                databaseAddFile(measuredAbsorbances, labels, nonZeroConcentrations, fileName);
                if (databaseResult.status != chemoFlags.success) {
                    //This fail is a mixed bag- we succeed at getting our data, but we don't manage to save it to the file system.
                    return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.failFileNotSaved };
                }
            }

            return { compounds: labels, concentrations: nonZeroConcentrations, status: chemoFlags.success };
        }
    };

    return { train: chemoTrain, infer: chemoInfer, flags: chemoFlags };

});

angular.module('app.nodeServices')

.service('database', function ($cordovaFile) {

    function getFullName(fileName, isAlgorithm, isPls) {
        var fullName;
        if (isAlgorithm) {
            if (isPls) {
                fullName = "PLS";
            }
            else {
                fullName = "PCA";
            }
        }
        else {
            fullName = "DAT";
        }
        fullName = fullName.concat(fileName);
        fullName = fullName.concat(".pmir");
        return fullName
    }

    function getManagementName(isAlgorithm, isPls) {
        var fileName;
        if (isAlgorithm) {
            if (isPls) {
                fileName = "mngmntPls.pmir";
            }
            else {
                fileName = "mngmntPca.pmir";
            }
        }
        else {
            fileName = "mngmntDat.pmir";
        }
        return fileName;
    }

    function linearSearch(arr, find) {
        var len = arr.length;
        for (var i = 0; i < len; ++i) {
            if (arr[i] == find)
                return i;
        }
        return null;
    }

    function listEntries(isAlgorithm, isPls) {
        var managementFileName = getManagementName(isAlgorithm, isPls);
        var mngmntArr = { entries: [] };
        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
            },
                function (error) { });

        }, function (error) {
            //If no management file, return no files.
        });
        return mngmntArr.entries;
    }

    function inputModel(fileName, algorithm) {
        var output = angular.toJson(algorithm);
        var mngmntArr = { entries: [fileName] };

        var isPls = algorithm.modelName == "PLS";
        var fullFileName = getFullName(fileName, true, isPls);
        var managementFileName = getManagementName(true, isPls);

        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
                var numEntries = mngmntArr.entries.length;
                mngmntArr.entries[numEntries] = fileName;
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
                var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
            },
                function (error) { });

        }, function (error) {
            //If no management file, create new one and output JSON
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
        });

        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        //Add conditionals at later time, account for memory at another time.
        var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output);
    }

    function outputModel(fileName, isPls) {
        var fullFileName = getFullName(fileName, true, isPls);
        var model = null;
        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(function (success) {
                model = angular.fromJson(success);
            },
                 function (error) { });
        },
        function (error) {
        });
        return model;
    }

    function inputDataFile(absorbances, concentrationLables, concentrations, fileName) {
        var fullFileName = getFullName(fileName, false);
        var managementFileName = getManagementName(false);
        var managementExists = $cordovaFile.checkName(cordova.file.dataDirectory, managementFileName);
        var mngmntArr = { entries: [fileName] };

        managementExists.then(function (success) {
            //If exists read in Json string and convert to object, add elements and push back to file.
            var mngmntRead = $cordovaFile.readAsText(cordova.file.dataDirectory, managementFileName);
            mngmntRead.then(function (success) {
                mngmntArr = angular.fromJson(success);
                var numEntries = mngmntArr.entries.length;
                mngmntArr.entries[numEntries] = fileName;
                var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
                var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
            },
                function (error) { });
        }, function (error) {
            //If no management file, create new one and output JSON
            var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, managementFileName, true);
            var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, managementFileName, angular.toJson(mngmntArr));
        });

        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        var outputCreated = $cordovaFile.createFile(cordova.file.dataDirectory, fullFileName, true);
        var output = { absorbances: absorbances, concentrations: concentrations, concentrationLables: concentrationLables }
        output = angular.toJson(output);
        var outputWritten = $cordovaFile.writeExistingFile(cordova.file.dataDirectory, fullFileName, output);
    }

    function outputDataFile(fileName) {
        var fullFileName = getFullName(fileName, false);
        var data = { absorbances: [], concentrations: [], concentrationLabels: [] };
        var outputExists = $cordovaFile.checkName(cordova.file.dataDirectory, fullFileName);
        outputExists.then(function (success) {
            var fileRead = $cordovaFile.readAsText(cordova.file.dataDirectory, fullFileName);
            fileRead.then(function (success) {
                data = angular.fromJson(success);
            },
                 function (error) { });
        },
        function (error) {
        });
        return data;
    }

    return {inputModel: inputModel, outputModel: outputModel, inputDataFile: inputDataFile, outputDataFile: outputDataFile, listEntries:listEntries};
});
},{"ml-matrix":8,"ml-pca":22,"ml-pls":36}]},{},[40])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9jaG9sZXNreS5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RjL2V2ZC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL2RjL2x1LmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGMvcXIuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy9zdmQuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9kYy91dGlsLmpzIiwibm9kZV9tb2R1bGVzL21sLW1hdHJpeC9zcmMvZGVjb21wb3NpdGlvbnMuanMiLCJub2RlX21vZHVsZXMvbWwtbWF0cml4L3NyYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1tYXRyaXgvc3JjL21hdHJpeC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wY2Evbm9kZV9tb2R1bGVzL21sLXN0YXQvYXJyYXkuanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL25vZGVfbW9kdWxlcy9tbC1zdGF0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL21sLXBjYS9ub2RlX21vZHVsZXMvbWwtc3RhdC9tYXRyaXguanMiLCJub2RlX21vZHVsZXMvbWwtcGNhL3NyYy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wY2Evc3JjL3BjYS5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL21sLXBscy9zcmMvb3Bscy5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL3Bscy5qcyIsIm5vZGVfbW9kdWxlcy9tbC1wbHMvc3JjL3V0aWxzLmpzIiwid3d3L2pzL25vZGVTZXJ2aWNlcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbndCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDamdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQzkwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Z0JBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBNYXRyaXggPSByZXF1aXJlKCcuLi9tYXRyaXgnKTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2x1dHpyb2VkZXIvTWFwYWNrL2Jsb2IvbWFzdGVyL1NvdXJjZS9DaG9sZXNreURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIENob2xlc2t5RGVjb21wb3NpdGlvbih2YWx1ZSkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBDaG9sZXNreURlY29tcG9zaXRpb24pKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ2hvbGVza3lEZWNvbXBvc2l0aW9uKHZhbHVlKTtcbiAgICB9XG4gICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuICAgIGlmICghdmFsdWUuaXNTeW1tZXRyaWMoKSlcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgbm90IHN5bW1ldHJpYycpO1xuXG4gICAgdmFyIGEgPSB2YWx1ZSxcbiAgICAgICAgZGltZW5zaW9uID0gYS5yb3dzLFxuICAgICAgICBsID0gbmV3IE1hdHJpeChkaW1lbnNpb24sIGRpbWVuc2lvbiksXG4gICAgICAgIHBvc2l0aXZlRGVmaW5pdGUgPSB0cnVlLFxuICAgICAgICBpLCBqLCBrO1xuXG4gICAgZm9yIChqID0gMDsgaiA8IGRpbWVuc2lvbjsgaisrKSB7XG4gICAgICAgIHZhciBMcm93aiA9IGxbal07XG4gICAgICAgIHZhciBkID0gMDtcbiAgICAgICAgZm9yIChrID0gMDsgayA8IGo7IGsrKykge1xuICAgICAgICAgICAgdmFyIExyb3drID0gbFtrXTtcbiAgICAgICAgICAgIHZhciBzID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzICs9IExyb3drW2ldICogTHJvd2pbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBMcm93altrXSA9IHMgPSAoYVtqXVtrXSAtIHMpIC8gbFtrXVtrXTtcbiAgICAgICAgICAgIGQgPSBkICsgcyAqIHM7XG4gICAgICAgIH1cblxuICAgICAgICBkID0gYVtqXVtqXSAtIGQ7XG5cbiAgICAgICAgcG9zaXRpdmVEZWZpbml0ZSAmPSAoZCA+IDApO1xuICAgICAgICBsW2pdW2pdID0gTWF0aC5zcXJ0KE1hdGgubWF4KGQsIDApKTtcbiAgICAgICAgZm9yIChrID0gaiArIDE7IGsgPCBkaW1lbnNpb247IGsrKykge1xuICAgICAgICAgICAgbFtqXVtrXSA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBvc2l0aXZlRGVmaW5pdGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgbm90IHBvc2l0aXZlIGRlZmluaXRlJyk7XG4gICAgfVxuXG4gICAgdGhpcy5MID0gbDtcbn1cblxuQ2hvbGVza3lEZWNvbXBvc2l0aW9uLnByb3RvdHlwZSA9IHtcbiAgICBnZXQgbG93ZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MO1xuICAgIH0sXG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICAgICAgdmFyIGwgPSB0aGlzLkwsXG4gICAgICAgICAgICBkaW1lbnNpb24gPSBsLnJvd3M7XG5cbiAgICAgICAgaWYgKHZhbHVlLnJvd3MgIT09IGRpbWVuc2lvbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggZGltZW5zaW9ucyBkbyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjb3VudCA9IHZhbHVlLmNvbHVtbnMsXG4gICAgICAgICAgICBCID0gdmFsdWUuY2xvbmUoKSxcbiAgICAgICAgICAgIGksIGosIGs7XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8IGRpbWVuc2lvbjsgaysrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBrOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgQltrXVtqXSAtPSBCW2ldW2pdICogbFtrXVtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgQltrXVtqXSAvPSBsW2tdW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChrID0gZGltZW5zaW9uIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBkaW1lbnNpb247IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBCW2tdW2pdIC09IEJbaV1bal0gKiBsW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBCW2tdW2pdIC89IGxba11ba107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gQjtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENob2xlc2t5RGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbnZhciBoeXBvdGVudXNlID0gdXRpbC5oeXBvdGVudXNlO1xudmFyIGdldEZpbGxlZDJEQXJyYXkgPSB1dGlsLmdldEZpbGxlZDJEQXJyYXk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvRWlnZW52YWx1ZURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uKG1hdHJpeCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbihtYXRyaXgpO1xuICAgIH1cbiAgICBtYXRyaXggPSBNYXRyaXguY2hlY2tNYXRyaXgobWF0cml4KTtcbiAgICBpZiAoIW1hdHJpeC5pc1NxdWFyZSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IGlzIG5vdCBhIHNxdWFyZSBtYXRyaXgnKTtcbiAgICB9XG5cbiAgICB2YXIgbiA9IG1hdHJpeC5jb2x1bW5zLFxuICAgICAgICBWID0gZ2V0RmlsbGVkMkRBcnJheShuLCBuLCAwKSxcbiAgICAgICAgZCA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgZSA9IG5ldyBBcnJheShuKSxcbiAgICAgICAgdmFsdWUgPSBtYXRyaXgsXG4gICAgICAgIGksIGo7XG5cbiAgICBpZiAobWF0cml4LmlzU3ltbWV0cmljKCkpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIFZbaV1bal0gPSB2YWx1ZVtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0cmVkMihuLCBlLCBkLCBWKTtcbiAgICAgICAgdHFsMihuLCBlLCBkLCBWKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBIID0gZ2V0RmlsbGVkMkRBcnJheShuLCBuLCAwKSxcbiAgICAgICAgICAgIG9ydCA9IG5ldyBBcnJheShuKTtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIEhbaV1bal0gPSB2YWx1ZVtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBvcnRoZXMobiwgSCwgb3J0LCBWKTtcbiAgICAgICAgaHFyMihuLCBlLCBkLCBWLCBIKTtcbiAgICB9XG5cbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuZSA9IGU7XG4gICAgdGhpcy5kID0gZDtcbiAgICB0aGlzLlYgPSBWO1xufVxuXG5FaWdlbnZhbHVlRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgZ2V0IHJlYWxFaWdlbnZhbHVlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZDtcbiAgICB9LFxuICAgIGdldCBpbWFnaW5hcnlFaWdlbnZhbHVlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZTtcbiAgICB9LFxuICAgIGdldCBlaWdlbnZlY3Rvck1hdHJpeCgpIHtcbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgodGhpcy5WKSkge1xuICAgICAgICAgICAgdGhpcy5WID0gbmV3IE1hdHJpeCh0aGlzLlYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLlY7XG4gICAgfSxcbiAgICBnZXQgZGlhZ29uYWxNYXRyaXgoKSB7XG4gICAgICAgIHZhciBuID0gdGhpcy5uLFxuICAgICAgICAgICAgZSA9IHRoaXMuZSxcbiAgICAgICAgICAgIGQgPSB0aGlzLmQsXG4gICAgICAgICAgICBYID0gbmV3IE1hdHJpeChuLCBuKSxcbiAgICAgICAgICAgIGksIGo7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBYW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFhbaV1baV0gPSBkW2ldO1xuICAgICAgICAgICAgaWYgKGVbaV0gPiAwKSB7XG4gICAgICAgICAgICAgICAgWFtpXVtpICsgMV0gPSBlW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZVtpXSA8IDApIHtcbiAgICAgICAgICAgICAgICBYW2ldW2kgLSAxXSA9IGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFg7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gdHJlZDIobiwgZSwgZCwgVikge1xuXG4gICAgdmFyIGYsIGcsIGgsIGksIGosIGssXG4gICAgICAgIGhoLCBzY2FsZTtcblxuICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgZFtqXSA9IFZbbiAtIDFdW2pdO1xuICAgIH1cblxuICAgIGZvciAoaSA9IG4gLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgIHNjYWxlID0gMDtcbiAgICAgICAgaCA9IDA7XG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBpOyBrKyspIHtcbiAgICAgICAgICAgIHNjYWxlID0gc2NhbGUgKyBNYXRoLmFicyhkW2tdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzY2FsZSA9PT0gMCkge1xuICAgICAgICAgICAgZVtpXSA9IGRbaSAtIDFdO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGRbal0gPSBWW2kgLSAxXVtqXTtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gMDtcbiAgICAgICAgICAgICAgICBWW2pdW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICBkW2tdIC89IHNjYWxlO1xuICAgICAgICAgICAgICAgIGggKz0gZFtrXSAqIGRba107XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGYgPSBkW2kgLSAxXTtcbiAgICAgICAgICAgIGcgPSBNYXRoLnNxcnQoaCk7XG4gICAgICAgICAgICBpZiAoZiA+IDApIHtcbiAgICAgICAgICAgICAgICBnID0gLWc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVbaV0gPSBzY2FsZSAqIGc7XG4gICAgICAgICAgICBoID0gaCAtIGYgKiBnO1xuICAgICAgICAgICAgZFtpIC0gMV0gPSBmIC0gZztcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBlW2pdID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgICAgIGYgPSBkW2pdO1xuICAgICAgICAgICAgICAgIFZbal1baV0gPSBmO1xuICAgICAgICAgICAgICAgIGcgPSBlW2pdICsgVltqXVtqXSAqIGY7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gaiArIDE7IGsgPD0gaSAtIDE7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBnICs9IFZba11bal0gKiBkW2tdO1xuICAgICAgICAgICAgICAgICAgICBlW2tdICs9IFZba11bal0gKiBmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW2pdID0gZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZiA9IDA7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZVtqXSAvPSBoO1xuICAgICAgICAgICAgICAgIGYgKz0gZVtqXSAqIGRbal07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGhoID0gZiAvIChoICsgaCk7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZVtqXSAtPSBoaCAqIGRbal07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmID0gZFtqXTtcbiAgICAgICAgICAgICAgICBnID0gZVtqXTtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSBqOyBrIDw9IGkgLSAxOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVltrXVtqXSAtPSAoZiAqIGVba10gKyBnICogZFtrXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRbal0gPSBWW2kgLSAxXVtqXTtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkW2ldID0gaDtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgICBWW24gLSAxXVtpXSA9IFZbaV1baV07XG4gICAgICAgIFZbaV1baV0gPSAxO1xuICAgICAgICBoID0gZFtpICsgMV07XG4gICAgICAgIGlmIChoICE9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDw9IGk7IGsrKykge1xuICAgICAgICAgICAgICAgIGRba10gPSBWW2tdW2kgKyAxXSAvIGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPD0gaTsgaisrKSB7XG4gICAgICAgICAgICAgICAgZyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZyArPSBWW2tdW2kgKyAxXSAqIFZba11bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPD0gaTsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZba11bal0gLT0gZyAqIGRba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8PSBpOyBrKyspIHtcbiAgICAgICAgICAgIFZba11baSArIDFdID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgZFtqXSA9IFZbbiAtIDFdW2pdO1xuICAgICAgICBWW24gLSAxXVtqXSA9IDA7XG4gICAgfVxuXG4gICAgVltuIC0gMV1bbiAtIDFdID0gMTtcbiAgICBlWzBdID0gMDtcbn1cblxuZnVuY3Rpb24gdHFsMihuLCBlLCBkLCBWKSB7XG5cbiAgICB2YXIgZywgaCwgaSwgaiwgaywgbCwgbSwgcCwgcixcbiAgICAgICAgZGwxLCBjLCBjMiwgYzMsIGVsMSwgcywgczIsXG4gICAgICAgIGl0ZXI7XG5cbiAgICBmb3IgKGkgPSAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGVbaSAtIDFdID0gZVtpXTtcbiAgICB9XG5cbiAgICBlW24gLSAxXSA9IDA7XG5cbiAgICB2YXIgZiA9IDAsXG4gICAgICAgIHRzdDEgPSAwLFxuICAgICAgICBlcHMgPSBNYXRoLnBvdygyLCAtNTIpO1xuXG4gICAgZm9yIChsID0gMDsgbCA8IG47IGwrKykge1xuICAgICAgICB0c3QxID0gTWF0aC5tYXgodHN0MSwgTWF0aC5hYnMoZFtsXSkgKyBNYXRoLmFicyhlW2xdKSk7XG4gICAgICAgIG0gPSBsO1xuICAgICAgICB3aGlsZSAobSA8IG4pIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhlW21dKSA8PSBlcHMgKiB0c3QxKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtKys7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSA+IGwpIHtcbiAgICAgICAgICAgIGl0ZXIgPSAwO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIGl0ZXIgPSBpdGVyICsgMTtcblxuICAgICAgICAgICAgICAgIGcgPSBkW2xdO1xuICAgICAgICAgICAgICAgIHAgPSAoZFtsICsgMV0gLSBnKSAvICgyICogZVtsXSk7XG4gICAgICAgICAgICAgICAgciA9IGh5cG90ZW51c2UocCwgMSk7XG4gICAgICAgICAgICAgICAgaWYgKHAgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHIgPSAtcjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBkW2xdID0gZVtsXSAvIChwICsgcik7XG4gICAgICAgICAgICAgICAgZFtsICsgMV0gPSBlW2xdICogKHAgKyByKTtcbiAgICAgICAgICAgICAgICBkbDEgPSBkW2wgKyAxXTtcbiAgICAgICAgICAgICAgICBoID0gZyAtIGRbbF07XG4gICAgICAgICAgICAgICAgZm9yIChpID0gbCArIDI7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZFtpXSAtPSBoO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGYgPSBmICsgaDtcblxuICAgICAgICAgICAgICAgIHAgPSBkW21dO1xuICAgICAgICAgICAgICAgIGMgPSAxO1xuICAgICAgICAgICAgICAgIGMyID0gYztcbiAgICAgICAgICAgICAgICBjMyA9IGM7XG4gICAgICAgICAgICAgICAgZWwxID0gZVtsICsgMV07XG4gICAgICAgICAgICAgICAgcyA9IDA7XG4gICAgICAgICAgICAgICAgczIgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG0gLSAxOyBpID49IGw7IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBjMyA9IGMyO1xuICAgICAgICAgICAgICAgICAgICBjMiA9IGM7XG4gICAgICAgICAgICAgICAgICAgIHMyID0gcztcbiAgICAgICAgICAgICAgICAgICAgZyA9IGMgKiBlW2ldO1xuICAgICAgICAgICAgICAgICAgICBoID0gYyAqIHA7XG4gICAgICAgICAgICAgICAgICAgIHIgPSBoeXBvdGVudXNlKHAsIGVbaV0pO1xuICAgICAgICAgICAgICAgICAgICBlW2kgKyAxXSA9IHMgKiByO1xuICAgICAgICAgICAgICAgICAgICBzID0gZVtpXSAvIHI7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBwIC8gcjtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGMgKiBkW2ldIC0gcyAqIGc7XG4gICAgICAgICAgICAgICAgICAgIGRbaSArIDFdID0gaCArIHMgKiAoYyAqIGcgKyBzICogZFtpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaCA9IFZba11baSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltrXVtpICsgMV0gPSBzICogVltrXVtpXSArIGMgKiBoO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltrXVtpXSA9IGMgKiBWW2tdW2ldIC0gcyAqIGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBwID0gLXMgKiBzMiAqIGMzICogZWwxICogZVtsXSAvIGRsMTtcbiAgICAgICAgICAgICAgICBlW2xdID0gcyAqIHA7XG4gICAgICAgICAgICAgICAgZFtsXSA9IGMgKiBwO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsZSAoTWF0aC5hYnMoZVtsXSkgPiBlcHMgKiB0c3QxKTtcbiAgICAgICAgfVxuICAgICAgICBkW2xdID0gZFtsXSArIGY7XG4gICAgICAgIGVbbF0gPSAwO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBuIC0gMTsgaSsrKSB7XG4gICAgICAgIGsgPSBpO1xuICAgICAgICBwID0gZFtpXTtcbiAgICAgICAgZm9yIChqID0gaSArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChkW2pdIDwgcCkge1xuICAgICAgICAgICAgICAgIGsgPSBqO1xuICAgICAgICAgICAgICAgIHAgPSBkW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGsgIT09IGkpIHtcbiAgICAgICAgICAgIGRba10gPSBkW2ldO1xuICAgICAgICAgICAgZFtpXSA9IHA7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgcCA9IFZbal1baV07XG4gICAgICAgICAgICAgICAgVltqXVtpXSA9IFZbal1ba107XG4gICAgICAgICAgICAgICAgVltqXVtrXSA9IHA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG9ydGhlcyhuLCBILCBvcnQsIFYpIHtcblxuICAgIHZhciBsb3cgPSAwLFxuICAgICAgICBoaWdoID0gbiAtIDEsXG4gICAgICAgIGYsIGcsIGgsIGksIGosIG0sXG4gICAgICAgIHNjYWxlO1xuXG4gICAgZm9yIChtID0gbG93ICsgMTsgbSA8PSBoaWdoIC0gMTsgbSsrKSB7XG4gICAgICAgIHNjYWxlID0gMDtcbiAgICAgICAgZm9yIChpID0gbTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgIHNjYWxlID0gc2NhbGUgKyBNYXRoLmFicyhIW2ldW20gLSAxXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2NhbGUgIT09IDApIHtcbiAgICAgICAgICAgIGggPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gaGlnaDsgaSA+PSBtOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBvcnRbaV0gPSBIW2ldW20gLSAxXSAvIHNjYWxlO1xuICAgICAgICAgICAgICAgIGggKz0gb3J0W2ldICogb3J0W2ldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnID0gTWF0aC5zcXJ0KGgpO1xuICAgICAgICAgICAgaWYgKG9ydFttXSA+IDApIHtcbiAgICAgICAgICAgICAgICBnID0gLWc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGggPSBoIC0gb3J0W21dICogZztcbiAgICAgICAgICAgIG9ydFttXSA9IG9ydFttXSAtIGc7XG5cbiAgICAgICAgICAgIGZvciAoaiA9IG07IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBoaWdoOyBpID49IG07IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBmICs9IG9ydFtpXSAqIEhbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZiA9IGYgLyBoO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bal0gLT0gZiAqIG9ydFtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZiA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gaGlnaDsgaiA+PSBtOyBqLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgZiArPSBvcnRbal0gKiBIW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGYgPSBmIC8gaDtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBtOyBqIDw9IGhpZ2g7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2pdIC09IGYgKiBvcnRbal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvcnRbbV0gPSBzY2FsZSAqIG9ydFttXTtcbiAgICAgICAgICAgIEhbbV1bbSAtIDFdID0gc2NhbGUgKiBnO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBWW2ldW2pdID0gKGkgPT09IGogPyAxIDogMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKG0gPSBoaWdoIC0gMTsgbSA+PSBsb3cgKyAxOyBtLS0pIHtcbiAgICAgICAgaWYgKEhbbV1bbSAtIDFdICE9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBtICsgMTsgaSA8PSBoaWdoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBvcnRbaV0gPSBIW2ldW20gLSAxXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gbTsgaiA8PSBoaWdoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBnID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBtOyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBnICs9IG9ydFtpXSAqIFZbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZyA9IChnIC8gb3J0W21dKSAvIEhbbV1bbSAtIDFdO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IG07IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFZbaV1bal0gKz0gZyAqIG9ydFtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhxcjIobm4sIGUsIGQsIFYsIEgpIHtcbiAgICB2YXIgbiA9IG5uIC0gMSxcbiAgICAgICAgbG93ID0gMCxcbiAgICAgICAgaGlnaCA9IG5uIC0gMSxcbiAgICAgICAgZXBzID0gTWF0aC5wb3coMiwgLTUyKSxcbiAgICAgICAgZXhzaGlmdCA9IDAsXG4gICAgICAgIG5vcm0gPSAwLFxuICAgICAgICBwID0gMCxcbiAgICAgICAgcSA9IDAsXG4gICAgICAgIHIgPSAwLFxuICAgICAgICBzID0gMCxcbiAgICAgICAgeiA9IDAsXG4gICAgICAgIGl0ZXIgPSAwLFxuICAgICAgICBpLCBqLCBrLCBsLCBtLCB0LCB3LCB4LCB5LFxuICAgICAgICByYSwgc2EsIHZyLCB2aSxcbiAgICAgICAgbm90bGFzdCwgY2RpdnJlcztcblxuICAgIGZvciAoaSA9IDA7IGkgPCBubjsgaSsrKSB7XG4gICAgICAgIGlmIChpIDwgbG93IHx8IGkgPiBoaWdoKSB7XG4gICAgICAgICAgICBkW2ldID0gSFtpXVtpXTtcbiAgICAgICAgICAgIGVbaV0gPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChqID0gTWF0aC5tYXgoaSAtIDEsIDApOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgbm9ybSA9IG5vcm0gKyBNYXRoLmFicyhIW2ldW2pdKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHdoaWxlIChuID49IGxvdykge1xuICAgICAgICBsID0gbjtcbiAgICAgICAgd2hpbGUgKGwgPiBsb3cpIHtcbiAgICAgICAgICAgIHMgPSBNYXRoLmFicyhIW2wgLSAxXVtsIC0gMV0pICsgTWF0aC5hYnMoSFtsXVtsXSk7XG4gICAgICAgICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHMgPSBub3JtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKEhbbF1bbCAtIDFdKSA8IGVwcyAqIHMpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGwtLTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsID09PSBuKSB7XG4gICAgICAgICAgICBIW25dW25dID0gSFtuXVtuXSArIGV4c2hpZnQ7XG4gICAgICAgICAgICBkW25dID0gSFtuXVtuXTtcbiAgICAgICAgICAgIGVbbl0gPSAwO1xuICAgICAgICAgICAgbi0tO1xuICAgICAgICAgICAgaXRlciA9IDA7XG4gICAgICAgIH0gZWxzZSBpZiAobCA9PT0gbiAtIDEpIHtcbiAgICAgICAgICAgIHcgPSBIW25dW24gLSAxXSAqIEhbbiAtIDFdW25dO1xuICAgICAgICAgICAgcCA9IChIW24gLSAxXVtuIC0gMV0gLSBIW25dW25dKSAvIDI7XG4gICAgICAgICAgICBxID0gcCAqIHAgKyB3O1xuICAgICAgICAgICAgeiA9IE1hdGguc3FydChNYXRoLmFicyhxKSk7XG4gICAgICAgICAgICBIW25dW25dID0gSFtuXVtuXSArIGV4c2hpZnQ7XG4gICAgICAgICAgICBIW24gLSAxXVtuIC0gMV0gPSBIW24gLSAxXVtuIC0gMV0gKyBleHNoaWZ0O1xuICAgICAgICAgICAgeCA9IEhbbl1bbl07XG5cbiAgICAgICAgICAgIGlmIChxID49IDApIHtcbiAgICAgICAgICAgICAgICB6ID0gKHAgPj0gMCkgPyAocCArIHopIDogKHAgLSB6KTtcbiAgICAgICAgICAgICAgICBkW24gLSAxXSA9IHggKyB6O1xuICAgICAgICAgICAgICAgIGRbbl0gPSBkW24gLSAxXTtcbiAgICAgICAgICAgICAgICBpZiAoeiAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBkW25dID0geCAtIHcgLyB6O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW24gLSAxXSA9IDA7XG4gICAgICAgICAgICAgICAgZVtuXSA9IDA7XG4gICAgICAgICAgICAgICAgeCA9IEhbbl1bbiAtIDFdO1xuICAgICAgICAgICAgICAgIHMgPSBNYXRoLmFicyh4KSArIE1hdGguYWJzKHopO1xuICAgICAgICAgICAgICAgIHAgPSB4IC8gcztcbiAgICAgICAgICAgICAgICBxID0geiAvIHM7XG4gICAgICAgICAgICAgICAgciA9IE1hdGguc3FydChwICogcCArIHEgKiBxKTtcbiAgICAgICAgICAgICAgICBwID0gcCAvIHI7XG4gICAgICAgICAgICAgICAgcSA9IHEgLyByO1xuXG4gICAgICAgICAgICAgICAgZm9yIChqID0gbiAtIDE7IGogPCBubjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSBIW24gLSAxXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgSFtuIC0gMV1bal0gPSBxICogeiArIHAgKiBIW25dW2pdO1xuICAgICAgICAgICAgICAgICAgICBIW25dW2pdID0gcSAqIEhbbl1bal0gLSBwICogejtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB6ID0gSFtpXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIEhbaV1bbiAtIDFdID0gcSAqIHogKyBwICogSFtpXVtuXTtcbiAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IHEgKiBIW2ldW25dIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gbG93OyBpIDw9IGhpZ2g7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB6ID0gVltpXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIFZbaV1bbiAtIDFdID0gcSAqIHogKyBwICogVltpXVtuXTtcbiAgICAgICAgICAgICAgICAgICAgVltpXVtuXSA9IHEgKiBWW2ldW25dIC0gcCAqIHo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkW24gLSAxXSA9IHggKyBwO1xuICAgICAgICAgICAgICAgIGRbbl0gPSB4ICsgcDtcbiAgICAgICAgICAgICAgICBlW24gLSAxXSA9IHo7XG4gICAgICAgICAgICAgICAgZVtuXSA9IC16O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuID0gbiAtIDI7XG4gICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHggPSBIW25dW25dO1xuICAgICAgICAgICAgeSA9IDA7XG4gICAgICAgICAgICB3ID0gMDtcbiAgICAgICAgICAgIGlmIChsIDwgbikge1xuICAgICAgICAgICAgICAgIHkgPSBIW24gLSAxXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgdyA9IEhbbl1bbiAtIDFdICogSFtuIC0gMV1bbl07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpdGVyID09PSAxMCkge1xuICAgICAgICAgICAgICAgIGV4c2hpZnQgKz0geDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEhbaV1baV0gLT0geDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyA9IE1hdGguYWJzKEhbbl1bbiAtIDFdKSArIE1hdGguYWJzKEhbbiAtIDFdW24gLSAyXSk7XG4gICAgICAgICAgICAgICAgeCA9IHkgPSAwLjc1ICogcztcbiAgICAgICAgICAgICAgICB3ID0gLTAuNDM3NSAqIHMgKiBzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXRlciA9PT0gMzApIHtcbiAgICAgICAgICAgICAgICBzID0gKHkgLSB4KSAvIDI7XG4gICAgICAgICAgICAgICAgcyA9IHMgKiBzICsgdztcbiAgICAgICAgICAgICAgICBpZiAocyA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcyA9IE1hdGguc3FydChzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHkgPCB4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzID0gLXM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcyA9IHggLSB3IC8gKCh5IC0geCkgLyAyICsgcyk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGxvdzsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1baV0gLT0gcztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBleHNoaWZ0ICs9IHM7XG4gICAgICAgICAgICAgICAgICAgIHggPSB5ID0gdyA9IDAuOTY0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaXRlciA9IGl0ZXIgKyAxO1xuXG4gICAgICAgICAgICBtID0gbiAtIDI7XG4gICAgICAgICAgICB3aGlsZSAobSA+PSBsKSB7XG4gICAgICAgICAgICAgICAgeiA9IEhbbV1bbV07XG4gICAgICAgICAgICAgICAgciA9IHggLSB6O1xuICAgICAgICAgICAgICAgIHMgPSB5IC0gejtcbiAgICAgICAgICAgICAgICBwID0gKHIgKiBzIC0gdykgLyBIW20gKyAxXVttXSArIEhbbV1bbSArIDFdO1xuICAgICAgICAgICAgICAgIHEgPSBIW20gKyAxXVttICsgMV0gLSB6IC0gciAtIHM7XG4gICAgICAgICAgICAgICAgciA9IEhbbSArIDJdW20gKyAxXTtcbiAgICAgICAgICAgICAgICBzID0gTWF0aC5hYnMocCkgKyBNYXRoLmFicyhxKSArIE1hdGguYWJzKHIpO1xuICAgICAgICAgICAgICAgIHAgPSBwIC8gcztcbiAgICAgICAgICAgICAgICBxID0gcSAvIHM7XG4gICAgICAgICAgICAgICAgciA9IHIgLyBzO1xuICAgICAgICAgICAgICAgIGlmIChtID09PSBsKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoSFttXVttIC0gMV0pICogKE1hdGguYWJzKHEpICsgTWF0aC5hYnMocikpIDwgZXBzICogKE1hdGguYWJzKHApICogKE1hdGguYWJzKEhbbSAtIDFdW20gLSAxXSkgKyBNYXRoLmFicyh6KSArIE1hdGguYWJzKEhbbSArIDFdW20gKyAxXSkpKSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbS0tO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGkgPSBtICsgMjsgaSA8PSBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBIW2ldW2kgLSAyXSA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBtICsgMikge1xuICAgICAgICAgICAgICAgICAgICBIW2ldW2kgLSAzXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGsgPSBtOyBrIDw9IG4gLSAxOyBrKyspIHtcbiAgICAgICAgICAgICAgICBub3RsYXN0ID0gKGsgIT09IG4gLSAxKTtcbiAgICAgICAgICAgICAgICBpZiAoayAhPT0gbSkge1xuICAgICAgICAgICAgICAgICAgICBwID0gSFtrXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHEgPSBIW2sgKyAxXVtrIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHIgPSAobm90bGFzdCA/IEhbayArIDJdW2sgLSAxXSA6IDApO1xuICAgICAgICAgICAgICAgICAgICB4ID0gTWF0aC5hYnMocCkgKyBNYXRoLmFicyhxKSArIE1hdGguYWJzKHIpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoeCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgcSA9IHEgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgciA9IHIgLyB4O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcyA9IE1hdGguc3FydChwICogcCArIHEgKiBxICsgciAqIHIpO1xuICAgICAgICAgICAgICAgIGlmIChwIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzID0gLXM7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHMgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGsgIT09IG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhba11bayAtIDFdID0gLXMgKiB4O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGwgIT09IG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhba11bayAtIDFdID0gLUhba11bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyBzO1xuICAgICAgICAgICAgICAgICAgICB4ID0gcCAvIHM7XG4gICAgICAgICAgICAgICAgICAgIHkgPSBxIC8gcztcbiAgICAgICAgICAgICAgICAgICAgeiA9IHIgLyBzO1xuICAgICAgICAgICAgICAgICAgICBxID0gcSAvIHA7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByIC8gcDtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSBrOyBqIDwgbm47IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcCA9IEhba11bal0gKyBxICogSFtrICsgMV1bal07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm90bGFzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwICsgciAqIEhbayArIDJdW2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbayArIDJdW2pdID0gSFtrICsgMl1bal0gLSBwICogejtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgSFtrXVtqXSA9IEhba11bal0gLSBwICogeDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbayArIDFdW2pdID0gSFtrICsgMV1bal0gLSBwICogeTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPD0gTWF0aC5taW4obiwgayArIDMpOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAgPSB4ICogSFtpXVtrXSArIHkgKiBIW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub3RsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcCA9IHAgKyB6ICogSFtpXVtrICsgMl07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtrICsgMl0gPSBIW2ldW2sgKyAyXSAtIHAgKiByO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2tdID0gSFtpXVtrXSAtIHA7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2ldW2sgKyAxXSA9IEhbaV1bayArIDFdIC0gcCAqIHE7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwID0geCAqIFZbaV1ba10gKyB5ICogVltpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm90bGFzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPSBwICsgeiAqIFZbaV1bayArIDJdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bayArIDJdID0gVltpXVtrICsgMl0gLSBwICogcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrXSA9IFZbaV1ba10gLSBwO1xuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrICsgMV0gPSBWW2ldW2sgKyAxXSAtIHAgKiBxO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG5vcm0gPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAobiA9IG5uIC0gMTsgbiA+PSAwOyBuLS0pIHtcbiAgICAgICAgcCA9IGRbbl07XG4gICAgICAgIHEgPSBlW25dO1xuXG4gICAgICAgIGlmIChxID09PSAwKSB7XG4gICAgICAgICAgICBsID0gbjtcbiAgICAgICAgICAgIEhbbl1bbl0gPSAxO1xuICAgICAgICAgICAgZm9yIChpID0gbiAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgdyA9IEhbaV1baV0gLSBwO1xuICAgICAgICAgICAgICAgIHIgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGw7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByICsgSFtpXVtqXSAqIEhbal1bbl07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGVbaV0gPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHogPSB3O1xuICAgICAgICAgICAgICAgICAgICBzID0gcjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIEhbaV1bbl0gPSAodyAhPT0gMCkgPyAoLXIgLyB3KSA6ICgtciAvIChlcHMgKiBub3JtKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gSFtpXVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB5ID0gSFtpICsgMV1baV07XG4gICAgICAgICAgICAgICAgICAgICAgICBxID0gKGRbaV0gLSBwKSAqIChkW2ldIC0gcCkgKyBlW2ldICogZVtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgPSAoeCAqIHMgLSB6ICogcikgLyBxO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9IChNYXRoLmFicyh4KSA+IE1hdGguYWJzKHopKSA/ICgoLXIgLSB3ICogdCkgLyB4KSA6ICgoLXMgLSB5ICogdCkgLyB6KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHQgPSBNYXRoLmFicyhIW2ldW25dKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKChlcHMgKiB0KSAqIHQgPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSBpOyBqIDw9IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhbal1bbl0gPSBIW2pdW25dIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChxIDwgMCkge1xuICAgICAgICAgICAgbCA9IG4gLSAxO1xuXG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMoSFtuXVtuIC0gMV0pID4gTWF0aC5hYnMoSFtuIC0gMV1bbl0pKSB7XG4gICAgICAgICAgICAgICAgSFtuIC0gMV1bbiAtIDFdID0gcSAvIEhbbl1bbiAtIDFdO1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW25dID0gLShIW25dW25dIC0gcCkgLyBIW25dW24gLSAxXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoMCwgLUhbbiAtIDFdW25dLCBIW24gLSAxXVtuIC0gMV0gLSBwLCBxKTtcbiAgICAgICAgICAgICAgICBIW24gLSAxXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgIEhbbiAtIDFdW25dID0gY2RpdnJlc1sxXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgSFtuXVtuIC0gMV0gPSAwO1xuICAgICAgICAgICAgSFtuXVtuXSA9IDE7XG4gICAgICAgICAgICBmb3IgKGkgPSBuIC0gMjsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICByYSA9IDA7XG4gICAgICAgICAgICAgICAgc2EgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGw7IGogPD0gbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhID0gcmEgKyBIW2ldW2pdICogSFtqXVtuIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIHNhID0gc2EgKyBIW2ldW2pdICogSFtqXVtuXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB3ID0gSFtpXVtpXSAtIHA7XG5cbiAgICAgICAgICAgICAgICBpZiAoZVtpXSA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgeiA9IHc7XG4gICAgICAgICAgICAgICAgICAgIHIgPSByYTtcbiAgICAgICAgICAgICAgICAgICAgcyA9IHNhO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGwgPSBpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoLXJhLCAtc2EsIHcsIHEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4ID0gSFtpXVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB5ID0gSFtpICsgMV1baV07XG4gICAgICAgICAgICAgICAgICAgICAgICB2ciA9IChkW2ldIC0gcCkgKiAoZFtpXSAtIHApICsgZVtpXSAqIGVbaV0gLSBxICogcTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpID0gKGRbaV0gLSBwKSAqIDIgKiBxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZyID09PSAwICYmIHZpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdnIgPSBlcHMgKiBub3JtICogKE1hdGguYWJzKHcpICsgTWF0aC5hYnMocSkgKyBNYXRoLmFicyh4KSArIE1hdGguYWJzKHkpICsgTWF0aC5hYnMoeikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2RpdnJlcyA9IGNkaXYoeCAqIHIgLSB6ICogcmEgKyBxICogc2EsIHggKiBzIC0geiAqIHNhIC0gcSAqIHJhLCB2ciwgdmkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuIC0gMV0gPSBjZGl2cmVzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgSFtpXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoeCkgPiAoTWF0aC5hYnMoeikgKyBNYXRoLmFicyhxKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuIC0gMV0gPSAoLXJhIC0gdyAqIEhbaV1bbiAtIDFdICsgcSAqIEhbaV1bbl0pIC8geDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9ICgtc2EgLSB3ICogSFtpXVtuXSAtIHEgKiBIW2ldW24gLSAxXSkgLyB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZGl2cmVzID0gY2RpdigtciAtIHkgKiBIW2ldW24gLSAxXSwgLXMgLSB5ICogSFtpXVtuXSwgeiwgcSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSFtpICsgMV1bbiAtIDFdID0gY2RpdnJlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2kgKyAxXVtuXSA9IGNkaXZyZXNbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0ID0gTWF0aC5tYXgoTWF0aC5hYnMoSFtpXVtuIC0gMV0pLCBNYXRoLmFicyhIW2ldW25dKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoZXBzICogdCkgKiB0ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8PSBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2pdW24gLSAxXSA9IEhbal1bbiAtIDFdIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBIW2pdW25dID0gSFtqXVtuXSAvIHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbm47IGkrKykge1xuICAgICAgICBpZiAoaSA8IGxvdyB8fCBpID4gaGlnaCkge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IG5uOyBqKyspIHtcbiAgICAgICAgICAgICAgICBWW2ldW2pdID0gSFtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaiA9IG5uIC0gMTsgaiA+PSBsb3c7IGotLSkge1xuICAgICAgICBmb3IgKGkgPSBsb3c7IGkgPD0gaGlnaDsgaSsrKSB7XG4gICAgICAgICAgICB6ID0gMDtcbiAgICAgICAgICAgIGZvciAoayA9IGxvdzsgayA8PSBNYXRoLm1pbihqLCBoaWdoKTsgaysrKSB7XG4gICAgICAgICAgICAgICAgeiA9IHogKyBWW2ldW2tdICogSFtrXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFZbaV1bal0gPSB6O1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjZGl2KHhyLCB4aSwgeXIsIHlpKSB7XG4gICAgdmFyIHIsIGQ7XG4gICAgaWYgKE1hdGguYWJzKHlyKSA+IE1hdGguYWJzKHlpKSkge1xuICAgICAgICByID0geWkgLyB5cjtcbiAgICAgICAgZCA9IHlyICsgciAqIHlpO1xuICAgICAgICByZXR1cm4gWyh4ciArIHIgKiB4aSkgLyBkLCAoeGkgLSByICogeHIpIC8gZF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByID0geXIgLyB5aTtcbiAgICAgICAgZCA9IHlpICsgciAqIHlyO1xuICAgICAgICByZXR1cm4gWyhyICogeHIgKyB4aSkgLyBkLCAociAqIHhpIC0geHIpIC8gZF07XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi4vbWF0cml4Jyk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvTHVEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBMdURlY29tcG9zaXRpb24obWF0cml4KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEx1RGVjb21wb3NpdGlvbikpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMdURlY29tcG9zaXRpb24obWF0cml4KTtcbiAgICB9XG4gICAgbWF0cml4ID0gTWF0cml4LmNoZWNrTWF0cml4KG1hdHJpeCk7XG5cbiAgICB2YXIgbHUgPSBtYXRyaXguY2xvbmUoKSxcbiAgICAgICAgcm93cyA9IGx1LnJvd3MsXG4gICAgICAgIGNvbHVtbnMgPSBsdS5jb2x1bW5zLFxuICAgICAgICBwaXZvdFZlY3RvciA9IG5ldyBBcnJheShyb3dzKSxcbiAgICAgICAgcGl2b3RTaWduID0gMSxcbiAgICAgICAgaSwgaiwgaywgcCwgcywgdCwgdixcbiAgICAgICAgTFVyb3dpLCBMVWNvbGosIGttYXg7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgIHBpdm90VmVjdG9yW2ldID0gaTtcbiAgICB9XG5cbiAgICBMVWNvbGogPSBuZXcgQXJyYXkocm93cyk7XG5cbiAgICBmb3IgKGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgTFVjb2xqW2ldID0gbHVbaV1bal07XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBMVXJvd2kgPSBsdVtpXTtcbiAgICAgICAgICAgIGttYXggPSBNYXRoLm1pbihpLCBqKTtcbiAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGttYXg7IGsrKykge1xuICAgICAgICAgICAgICAgIHMgKz0gTFVyb3dpW2tdICogTFVjb2xqW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgTFVyb3dpW2pdID0gTFVjb2xqW2ldIC09IHM7XG4gICAgICAgIH1cblxuICAgICAgICBwID0gajtcbiAgICAgICAgZm9yIChpID0gaiArIDE7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhMVWNvbGpbaV0pID4gTWF0aC5hYnMoTFVjb2xqW3BdKSkge1xuICAgICAgICAgICAgICAgIHAgPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHAgIT09IGopIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2x1bW5zOyBrKyspIHtcbiAgICAgICAgICAgICAgICB0ID0gbHVbcF1ba107XG4gICAgICAgICAgICAgICAgbHVbcF1ba10gPSBsdVtqXVtrXTtcbiAgICAgICAgICAgICAgICBsdVtqXVtrXSA9IHQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHYgPSBwaXZvdFZlY3RvcltwXTtcbiAgICAgICAgICAgIHBpdm90VmVjdG9yW3BdID0gcGl2b3RWZWN0b3Jbal07XG4gICAgICAgICAgICBwaXZvdFZlY3RvcltqXSA9IHY7XG5cbiAgICAgICAgICAgIHBpdm90U2lnbiA9IC1waXZvdFNpZ247XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaiA8IHJvd3MgJiYgbHVbal1bal0gIT09IDApIHtcbiAgICAgICAgICAgIGZvciAoaSA9IGogKyAxOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbHVbaV1bal0gLz0gbHVbal1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLkxVID0gbHU7XG4gICAgdGhpcy5waXZvdFZlY3RvciA9IHBpdm90VmVjdG9yO1xuICAgIHRoaXMucGl2b3RTaWduID0gcGl2b3RTaWduO1xufVxuXG5MdURlY29tcG9zaXRpb24ucHJvdG90eXBlID0ge1xuICAgIGlzU2luZ3VsYXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVLFxuICAgICAgICAgICAgY29sID0gZGF0YS5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbDsgaisrKSB7XG4gICAgICAgICAgICBpZiAoZGF0YVtqXVtqXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuICAgIGdldCBkZXRlcm1pbmFudCgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLkxVO1xuICAgICAgICBpZiAoIWRhdGEuaXNTcXVhcmUoKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTWF0cml4IG11c3QgYmUgc3F1YXJlJyk7XG4gICAgICAgIHZhciBkZXRlcm1pbmFudCA9IHRoaXMucGl2b3RTaWduLCBjb2wgPSBkYXRhLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sOyBqKyspXG4gICAgICAgICAgICBkZXRlcm1pbmFudCAqPSBkYXRhW2pdW2pdO1xuICAgICAgICByZXR1cm4gZGV0ZXJtaW5hbnQ7XG4gICAgfSxcbiAgICBnZXQgbG93ZXJUcmlhbmd1bGFyTWF0cml4KCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuTFUsXG4gICAgICAgICAgICByb3dzID0gZGF0YS5yb3dzLFxuICAgICAgICAgICAgY29sdW1ucyA9IGRhdGEuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IGRhdGFbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9LFxuICAgIGdldCB1cHBlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5MVSxcbiAgICAgICAgICAgIHJvd3MgPSBkYXRhLnJvd3MsXG4gICAgICAgICAgICBjb2x1bW5zID0gZGF0YS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDw9IGopIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IGRhdGFbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBYO1xuICAgIH0sXG4gICAgZ2V0IHBpdm90UGVybXV0YXRpb25WZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBpdm90VmVjdG9yLnNsaWNlKCk7XG4gICAgfSxcbiAgICBzb2x2ZTogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgICAgICB2YXIgbHUgPSB0aGlzLkxVLFxuICAgICAgICAgICAgcm93cyA9IGx1LnJvd3M7XG5cbiAgICAgICAgaWYgKHJvd3MgIT09IHZhbHVlLnJvd3MpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbWF0cml4IGRpbWVuc2lvbnMnKTtcbiAgICAgICAgaWYgKHRoaXMuaXNTaW5ndWxhcigpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdMVSBtYXRyaXggaXMgc2luZ3VsYXInKTtcblxuICAgICAgICB2YXIgY291bnQgPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IHZhbHVlLnN1Yk1hdHJpeFJvdyh0aGlzLnBpdm90VmVjdG9yLCAwLCBjb3VudCAtIDEpLFxuICAgICAgICAgICAgY29sdW1ucyA9IGx1LmNvbHVtbnMsXG4gICAgICAgICAgICBpLCBqLCBrO1xuXG4gICAgICAgIGZvciAoayA9IDA7IGsgPCBjb2x1bW5zOyBrKyspIHtcbiAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgWFtpXVtqXSAtPSBYW2tdW2pdICogbHVbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoayA9IGNvbHVtbnMgLSAxOyBrID49IDA7IGstLSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBYW2tdW2pdIC89IGx1W2tdW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gLT0gWFtrXVtqXSAqIGx1W2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEx1RGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIGh5cG90ZW51c2UgPSByZXF1aXJlKCcuL3V0aWwnKS5oeXBvdGVudXNlO1xuXG4vL2h0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvUXJEZWNvbXBvc2l0aW9uLmNzXG5mdW5jdGlvbiBRckRlY29tcG9zaXRpb24odmFsdWUpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUXJEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IFFyRGVjb21wb3NpdGlvbih2YWx1ZSk7XG4gICAgfVxuICAgIHZhbHVlID0gTWF0cml4LmNoZWNrTWF0cml4KHZhbHVlKTtcblxuICAgIHZhciBxciA9IHZhbHVlLmNsb25lKCksXG4gICAgICAgIG0gPSB2YWx1ZS5yb3dzLFxuICAgICAgICBuID0gdmFsdWUuY29sdW1ucyxcbiAgICAgICAgcmRpYWcgPSBuZXcgQXJyYXkobiksXG4gICAgICAgIGksIGosIGssIHM7XG5cbiAgICBmb3IgKGsgPSAwOyBrIDwgbjsgaysrKSB7XG4gICAgICAgIHZhciBucm0gPSAwO1xuICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICBucm0gPSBoeXBvdGVudXNlKG5ybSwgcXJbaV1ba10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChucm0gIT09IDApIHtcbiAgICAgICAgICAgIGlmIChxcltrXVtrXSA8IDApIHtcbiAgICAgICAgICAgICAgICBucm0gPSAtbnJtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIHFyW2ldW2tdIC89IG5ybTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHFyW2tdW2tdICs9IDE7XG4gICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSBxcltpXVtrXSAqIHFyW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHFyW2ldW2pdICs9IHMgKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmRpYWdba10gPSAtbnJtO1xuICAgIH1cblxuICAgIHRoaXMuUVIgPSBxcjtcbiAgICB0aGlzLlJkaWFnID0gcmRpYWc7XG59XG5cblFyRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YWx1ZSA9IE1hdHJpeC5jaGVja01hdHJpeCh2YWx1ZSk7XG5cbiAgICAgICAgdmFyIHFyID0gdGhpcy5RUixcbiAgICAgICAgICAgIG0gPSBxci5yb3dzO1xuXG4gICAgICAgIGlmICh2YWx1ZS5yb3dzICE9PSBtKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggcm93IGRpbWVuc2lvbnMgbXVzdCBhZ3JlZScpO1xuICAgICAgICBpZiAoIXRoaXMuaXNGdWxsUmFuaygpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYXRyaXggaXMgcmFuayBkZWZpY2llbnQnKTtcblxuICAgICAgICB2YXIgY291bnQgPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICAgICAgWCA9IHZhbHVlLmNsb25lKCksXG4gICAgICAgICAgICBuID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIGksIGosIGssIHM7XG5cbiAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gcXJbaV1ba10gKiBYW2ldW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gKz0gcyAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGsgPSBuIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgWFtrXVtqXSAvPSB0aGlzLlJkaWFnW2tdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gLT0gWFtrXVtqXSAqIHFyW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBYLnN1Yk1hdHJpeCgwLCBuIC0gMSwgMCwgY291bnQgLSAxKTtcbiAgICB9LFxuICAgIGlzRnVsbFJhbms6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSB0aGlzLlFSLmNvbHVtbnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5SZGlhZ1tpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuICAgIGdldCB1cHBlclRyaWFuZ3VsYXJNYXRyaXgoKSB7XG4gICAgICAgIHZhciBxciA9IHRoaXMuUVIsXG4gICAgICAgICAgICBuID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KG4sIG4pLFxuICAgICAgICAgICAgaSwgajtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgaikge1xuICAgICAgICAgICAgICAgICAgICBYW2ldW2pdID0gcXJbaV1bal07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID09PSBqKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSB0aGlzLlJkaWFnW2ldO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9LFxuICAgIGdldCBvcnRob2dvbmFsTWF0cml4KCkge1xuICAgICAgICB2YXIgcXIgPSB0aGlzLlFSLFxuICAgICAgICAgICAgcm93cyA9IHFyLnJvd3MsXG4gICAgICAgICAgICBjb2x1bW5zID0gcXIuY29sdW1ucyxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHJvd3MsIGNvbHVtbnMpLFxuICAgICAgICAgICAgaSwgaiwgaywgcztcblxuICAgICAgICBmb3IgKGsgPSBjb2x1bW5zIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBYW2ldW2tdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFhba11ba10gPSAxO1xuICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChxcltrXVtrXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcyArPSBxcltpXVtrXSAqIFhbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzID0gLXMgLyBxcltrXVtrXTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBYW2ldW2pdICs9IHMgKiBxcltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gWDtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFFyRGVjb21wb3NpdGlvbjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1hdHJpeCA9IHJlcXVpcmUoJy4uL21hdHJpeCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbnZhciBoeXBvdGVudXNlID0gdXRpbC5oeXBvdGVudXNlO1xudmFyIGdldEZpbGxlZDJEQXJyYXkgPSB1dGlsLmdldEZpbGxlZDJEQXJyYXk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sdXR6cm9lZGVyL01hcGFjay9ibG9iL21hc3Rlci9Tb3VyY2UvU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24uY3NcbmZ1bmN0aW9uIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKHZhbHVlLCBvcHRpb25zKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKSkge1xuICAgICAgICByZXR1cm4gbmV3IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uKHZhbHVlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgdmFsdWUgPSBNYXRyaXguY2hlY2tNYXRyaXgodmFsdWUpO1xuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIgbSA9IHZhbHVlLnJvd3MsXG4gICAgICAgIG4gPSB2YWx1ZS5jb2x1bW5zLFxuICAgICAgICBudSA9IE1hdGgubWluKG0sIG4pO1xuXG4gICAgdmFyIHdhbnR1ID0gdHJ1ZSwgd2FudHYgPSB0cnVlO1xuICAgIGlmIChvcHRpb25zLmNvbXB1dGVMZWZ0U2luZ3VsYXJWZWN0b3JzID09PSBmYWxzZSlcbiAgICAgICAgd2FudHUgPSBmYWxzZTtcbiAgICBpZiAob3B0aW9ucy5jb21wdXRlUmlnaHRTaW5ndWxhclZlY3RvcnMgPT09IGZhbHNlKVxuICAgICAgICB3YW50diA9IGZhbHNlO1xuICAgIHZhciBhdXRvVHJhbnNwb3NlID0gb3B0aW9ucy5hdXRvVHJhbnNwb3NlID09PSB0cnVlO1xuXG4gICAgdmFyIHN3YXBwZWQgPSBmYWxzZTtcbiAgICB2YXIgYTtcbiAgICBpZiAobSA8IG4pIHtcbiAgICAgICAgaWYgKCFhdXRvVHJhbnNwb3NlKSB7XG4gICAgICAgICAgICBhID0gdmFsdWUuY2xvbmUoKTtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignQ29tcHV0aW5nIFNWRCBvbiBhIG1hdHJpeCB3aXRoIG1vcmUgY29sdW1ucyB0aGFuIHJvd3MuIENvbnNpZGVyIGVuYWJsaW5nIGF1dG9UcmFuc3Bvc2UnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGEgPSB2YWx1ZS50cmFuc3Bvc2UoKTtcbiAgICAgICAgICAgIG0gPSBhLnJvd3M7XG4gICAgICAgICAgICBuID0gYS5jb2x1bW5zO1xuICAgICAgICAgICAgc3dhcHBlZCA9IHRydWU7XG4gICAgICAgICAgICB2YXIgYXV4ID0gd2FudHU7XG4gICAgICAgICAgICB3YW50dSA9IHdhbnR2O1xuICAgICAgICAgICAgd2FudHYgPSBhdXg7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBhID0gdmFsdWUuY2xvbmUoKTtcbiAgICB9XG5cbiAgICB2YXIgcyA9IG5ldyBBcnJheShNYXRoLm1pbihtICsgMSwgbikpLFxuICAgICAgICBVID0gZ2V0RmlsbGVkMkRBcnJheShtLCBudSwgMCksXG4gICAgICAgIFYgPSBnZXRGaWxsZWQyREFycmF5KG4sIG4sIDApLFxuICAgICAgICBlID0gbmV3IEFycmF5KG4pLFxuICAgICAgICB3b3JrID0gbmV3IEFycmF5KG0pO1xuXG4gICAgdmFyIG5jdCA9IE1hdGgubWluKG0gLSAxLCBuKTtcbiAgICB2YXIgbnJ0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4obiAtIDIsIG0pKTtcblxuICAgIHZhciBpLCBqLCBrLCBwLCB0LCBrcywgZiwgY3MsIHNuLCBtYXgsIGthc2UsXG4gICAgICAgIHNjYWxlLCBzcCwgc3BtMSwgZXBtMSwgc2ssIGVrLCBiLCBjLCBzaGlmdCwgZztcblxuICAgIGZvciAoayA9IDAsIG1heCA9IE1hdGgubWF4KG5jdCwgbnJ0KTsgayA8IG1heDsgaysrKSB7XG4gICAgICAgIGlmIChrIDwgbmN0KSB7XG4gICAgICAgICAgICBzW2tdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzW2tdID0gaHlwb3RlbnVzZShzW2tdLCBhW2ldW2tdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzW2tdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGFba11ba10gPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNba10gPSAtc1trXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhW2ldW2tdIC89IHNba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFba11ba10gKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNba10gPSAtc1trXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbjsgaisrKSB7XG4gICAgICAgICAgICBpZiAoKGsgPCBuY3QpICYmIChzW2tdICE9PSAwKSkge1xuICAgICAgICAgICAgICAgIHQgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCArPSBhW2ldW2tdICogYVtpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdCA9IC10IC8gYVtrXVtrXTtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFbaV1bal0gKz0gdCAqIGFbaV1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZVtqXSA9IGFba11bal07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAod2FudHUgJiYgKGsgPCBuY3QpKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgVVtpXVtrXSA9IGFbaV1ba107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoayA8IG5ydCkge1xuICAgICAgICAgICAgZVtrXSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgIGVba10gPSBoeXBvdGVudXNlKGVba10sIGVbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVba10gIT09IDApIHtcbiAgICAgICAgICAgICAgICBpZiAoZVtrICsgMV0gPCAwKVxuICAgICAgICAgICAgICAgICAgICBlW2tdID0gLWVba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZVtpXSAvPSBlW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW2sgKyAxXSArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZVtrXSA9IC1lW2tdO1xuICAgICAgICAgICAgaWYgKChrICsgMSA8IG0pICYmIChlW2tdICE9PSAwKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHdvcmtbaV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgd29ya1tpXSArPSBlW2pdICogYVtpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gLWVbal0gLyBlW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gayArIDE7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFbaV1bal0gKz0gdCAqIHdvcmtbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gZVtpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwID0gTWF0aC5taW4obiwgbSArIDEpO1xuICAgIGlmIChuY3QgPCBuKSB7XG4gICAgICAgIHNbbmN0XSA9IGFbbmN0XVtuY3RdO1xuICAgIH1cbiAgICBpZiAobSA8IHApIHtcbiAgICAgICAgc1twIC0gMV0gPSAwO1xuICAgIH1cbiAgICBpZiAobnJ0ICsgMSA8IHApIHtcbiAgICAgICAgZVtucnRdID0gYVtucnRdW3AgLSAxXTtcbiAgICB9XG4gICAgZVtwIC0gMV0gPSAwO1xuXG4gICAgaWYgKHdhbnR1KSB7XG4gICAgICAgIGZvciAoaiA9IG5jdDsgaiA8IG51OyBqKyspIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICBVW2ldW2pdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFVbal1bal0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoayA9IG5jdCAtIDE7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgICAgICBpZiAoc1trXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGsgKyAxOyBqIDwgbnU7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gazsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdCArPSBVW2ldW2tdICogVVtpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0ID0gLXQgLyBVW2tdW2tdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2pdICs9IHQgKiBVW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoaSA9IGs7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IC1VW2ldW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBVW2tdW2tdID0gMSArIFVba11ba107XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGsgLSAxOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIFVbaV1ba10gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBVW2tdW2tdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh3YW50dikge1xuICAgICAgICBmb3IgKGsgPSBuIC0gMTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgICAgIGlmICgoayA8IG5ydCkgJiYgKGVba10gIT09IDApKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDE7IGogPCBuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IGsgKyAxOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ICs9IFZbaV1ba10gKiBWW2ldW2pdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQgPSAtdCAvIFZbayArIDFdW2tdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSBrICsgMTsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqXSArPSB0ICogVltpXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBWW2ldW2tdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFZba11ba10gPSAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHBwID0gcCAtIDEsXG4gICAgICAgIGl0ZXIgPSAwLFxuICAgICAgICBlcHMgPSBNYXRoLnBvdygyLCAtNTIpO1xuICAgIHdoaWxlIChwID4gMCkge1xuICAgICAgICBmb3IgKGsgPSBwIC0gMjsgayA+PSAtMTsgay0tKSB7XG4gICAgICAgICAgICBpZiAoayA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhlW2tdKSA8PSBlcHMgKiAoTWF0aC5hYnMoc1trXSkgKyBNYXRoLmFicyhzW2sgKyAxXSkpKSB7XG4gICAgICAgICAgICAgICAgZVtrXSA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGsgPT09IHAgLSAyKSB7XG4gICAgICAgICAgICBrYXNlID0gNDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoa3MgPSBwIC0gMTsga3MgPj0gazsga3MtLSkge1xuICAgICAgICAgICAgICAgIGlmIChrcyA9PT0gaykge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdCA9IChrcyAhPT0gcCA/IE1hdGguYWJzKGVba3NdKSA6IDApICsgKGtzICE9PSBrICsgMSA/IE1hdGguYWJzKGVba3MgLSAxXSkgOiAwKTtcbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoc1trc10pIDw9IGVwcyAqIHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc1trc10gPSAwO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoa3MgPT09IGspIHtcbiAgICAgICAgICAgICAgICBrYXNlID0gMztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa3MgPT09IHAgLSAxKSB7XG4gICAgICAgICAgICAgICAga2FzZSA9IDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGthc2UgPSAyO1xuICAgICAgICAgICAgICAgIGsgPSBrcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGsrKztcblxuICAgICAgICBzd2l0Y2ggKGthc2UpIHtcbiAgICAgICAgICAgIGNhc2UgMToge1xuICAgICAgICAgICAgICAgIGYgPSBlW3AgLSAyXTtcbiAgICAgICAgICAgICAgICBlW3AgLSAyXSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gcCAtIDI7IGogPj0gazsgai0tKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKHNbal0sIGYpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IHNbal0gLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGogIT09IGspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGYgPSAtc24gKiBlW2ogLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVbaiAtIDFdID0gY3MgKiBlW2ogLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBWW2ldW2pdICsgc24gKiBWW2ldW3AgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW3AgLSAxXSA9IC1zbiAqIFZbaV1bal0gKyBjcyAqIFZbaV1bcCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAyIDoge1xuICAgICAgICAgICAgICAgIGYgPSBlW2sgLSAxXTtcbiAgICAgICAgICAgICAgICBlW2sgLSAxXSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChqID0gazsgaiA8IHA7IGorKykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gaHlwb3RlbnVzZShzW2pdLCBmKTtcbiAgICAgICAgICAgICAgICAgICAgY3MgPSBzW2pdIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc24gPSBmIC8gdDtcbiAgICAgICAgICAgICAgICAgICAgc1tqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgIGYgPSAtc24gKiBlW2pdO1xuICAgICAgICAgICAgICAgICAgICBlW2pdID0gY3MgKiBlW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBtOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gY3MgKiBVW2ldW2pdICsgc24gKiBVW2ldW2sgLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2sgLSAxXSA9IC1zbiAqIFVbaV1bal0gKyBjcyAqIFVbaV1bayAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFVbaV1bal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAzIDoge1xuICAgICAgICAgICAgICAgIHNjYWxlID0gTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5tYXgoTWF0aC5hYnMoc1twIC0gMV0pLCBNYXRoLmFicyhzW3AgLSAyXSkpLCBNYXRoLmFicyhlW3AgLSAyXSkpLCBNYXRoLmFicyhzW2tdKSksIE1hdGguYWJzKGVba10pKTtcbiAgICAgICAgICAgICAgICBzcCA9IHNbcCAtIDFdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgc3BtMSA9IHNbcCAtIDJdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgZXBtMSA9IGVbcCAtIDJdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgc2sgPSBzW2tdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgZWsgPSBlW2tdIC8gc2NhbGU7XG4gICAgICAgICAgICAgICAgYiA9ICgoc3BtMSArIHNwKSAqIChzcG0xIC0gc3ApICsgZXBtMSAqIGVwbTEpIC8gMjtcbiAgICAgICAgICAgICAgICBjID0gKHNwICogZXBtMSkgKiAoc3AgKiBlcG0xKTtcbiAgICAgICAgICAgICAgICBzaGlmdCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKChiICE9PSAwKSB8fCAoYyAhPT0gMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hpZnQgPSBNYXRoLnNxcnQoYiAqIGIgKyBjKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGIgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaGlmdCA9IC1zaGlmdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzaGlmdCA9IGMgLyAoYiArIHNoaWZ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZiA9IChzayArIHNwKSAqIChzayAtIHNwKSArIHNoaWZ0O1xuICAgICAgICAgICAgICAgIGcgPSBzayAqIGVrO1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGs7IGogPCBwIC0gMTsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSBoeXBvdGVudXNlKGYsIGcpO1xuICAgICAgICAgICAgICAgICAgICBjcyA9IGYgLyB0O1xuICAgICAgICAgICAgICAgICAgICBzbiA9IGcgLyB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoaiAhPT0gaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZVtqIC0gMV0gPSB0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGYgPSBjcyAqIHNbal0gKyBzbiAqIGVbal07XG4gICAgICAgICAgICAgICAgICAgIGVbal0gPSBjcyAqIGVbal0gLSBzbiAqIHNbal07XG4gICAgICAgICAgICAgICAgICAgIGcgPSBzbiAqIHNbaiArIDFdO1xuICAgICAgICAgICAgICAgICAgICBzW2ogKyAxXSA9IGNzICogc1tqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBjcyAqIFZbaV1bal0gKyBzbiAqIFZbaV1baiArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1baiArIDFdID0gLXNuICogVltpXVtqXSArIGNzICogVltpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtqXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IGh5cG90ZW51c2UoZiwgZyk7XG4gICAgICAgICAgICAgICAgICAgIGNzID0gZiAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNuID0gZyAvIHQ7XG4gICAgICAgICAgICAgICAgICAgIHNbal0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBmID0gY3MgKiBlW2pdICsgc24gKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgc1tqICsgMV0gPSAtc24gKiBlW2pdICsgY3MgKiBzW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgZyA9IHNuICogZVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGVbaiArIDFdID0gY3MgKiBlW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR1ICYmIChqIDwgbSAtIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdCA9IGNzICogVVtpXVtqXSArIHNuICogVVtpXVtqICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtqICsgMV0gPSAtc24gKiBVW2ldW2pdICsgY3MgKiBVW2ldW2ogKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2pdID0gdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlW3AgLSAyXSA9IGY7XG4gICAgICAgICAgICAgICAgaXRlciA9IGl0ZXIgKyAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSA0OiB7XG4gICAgICAgICAgICAgICAgaWYgKHNba10gPD0gMCkge1xuICAgICAgICAgICAgICAgICAgICBzW2tdID0gKHNba10gPCAwID8gLXNba10gOiAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhbnR2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IHBwOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWW2ldW2tdID0gLVZbaV1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKGsgPCBwcCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc1trXSA+PSBzW2sgKyAxXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdCA9IHNba107XG4gICAgICAgICAgICAgICAgICAgIHNba10gPSBzW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgc1trICsgMV0gPSB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAod2FudHYgJiYgKGsgPCBuIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ID0gVltpXVtrICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVltpXVtrICsgMV0gPSBWW2ldW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZbaV1ba10gPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh3YW50dSAmJiAoayA8IG0gLSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBVW2ldW2sgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBVW2ldW2sgKyAxXSA9IFVbaV1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVVtpXVtrXSA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaysrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpdGVyID0gMDtcbiAgICAgICAgICAgICAgICBwLS07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3dhcHBlZCkge1xuICAgICAgICB2YXIgdG1wID0gVjtcbiAgICAgICAgViA9IFU7XG4gICAgICAgIFUgPSB0bXA7XG4gICAgfVxuXG4gICAgdGhpcy5tID0gbTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMucyA9IHM7XG4gICAgdGhpcy5VID0gVTtcbiAgICB0aGlzLlYgPSBWO1xufVxuXG5TaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgZ2V0IGNvbmRpdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc1swXSAvIHRoaXMuc1tNYXRoLm1pbih0aGlzLm0sIHRoaXMubikgLSAxXTtcbiAgICB9LFxuICAgIGdldCBub3JtMigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc1swXTtcbiAgICB9LFxuICAgIGdldCByYW5rKCkge1xuICAgICAgICB2YXIgZXBzID0gTWF0aC5wb3coMiwgLTUyKSxcbiAgICAgICAgICAgIHRvbCA9IE1hdGgubWF4KHRoaXMubSwgdGhpcy5uKSAqIHRoaXMuc1swXSAqIGVwcyxcbiAgICAgICAgICAgIHIgPSAwLFxuICAgICAgICAgICAgcyA9IHRoaXMucztcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc1tpXSA+IHRvbCkge1xuICAgICAgICAgICAgICAgIHIrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcjtcbiAgICB9LFxuICAgIGdldCBkaWFnb25hbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucztcbiAgICB9LFxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hY2NvcmQtbmV0L2ZyYW1ld29yay9ibG9iL2RldmVsb3BtZW50L1NvdXJjZXMvQWNjb3JkLk1hdGgvRGVjb21wb3NpdGlvbnMvU2luZ3VsYXJWYWx1ZURlY29tcG9zaXRpb24uY3NcbiAgICBnZXQgdGhyZXNob2xkKCkge1xuICAgICAgICByZXR1cm4gKE1hdGgucG93KDIsIC01MikgLyAyKSAqIE1hdGgubWF4KHRoaXMubSwgdGhpcy5uKSAqIHRoaXMuc1swXTtcbiAgICB9LFxuICAgIGdldCBsZWZ0U2luZ3VsYXJWZWN0b3JzKCkge1xuICAgICAgICBpZiAoIU1hdHJpeC5pc01hdHJpeCh0aGlzLlUpKSB7XG4gICAgICAgICAgICB0aGlzLlUgPSBuZXcgTWF0cml4KHRoaXMuVSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuVTtcbiAgICB9LFxuICAgIGdldCByaWdodFNpbmd1bGFyVmVjdG9ycygpIHtcbiAgICAgICAgaWYgKCFNYXRyaXguaXNNYXRyaXgodGhpcy5WKSkge1xuICAgICAgICAgICAgdGhpcy5WID0gbmV3IE1hdHJpeCh0aGlzLlYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLlY7XG4gICAgfSxcbiAgICBnZXQgZGlhZ29uYWxNYXRyaXgoKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguZGlhZyh0aGlzLnMpO1xuICAgIH0sXG4gICAgc29sdmU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuXG4gICAgICAgIHZhciBZID0gdmFsdWUsXG4gICAgICAgICAgICBlID0gdGhpcy50aHJlc2hvbGQsXG4gICAgICAgICAgICBzY29scyA9IHRoaXMucy5sZW5ndGgsXG4gICAgICAgICAgICBMcyA9IE1hdHJpeC56ZXJvcyhzY29scywgc2NvbHMpLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgc2NvbHM7IGkrKykge1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXMuc1tpXSkgPD0gZSkge1xuICAgICAgICAgICAgICAgIExzW2ldW2ldID0gMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgTHNbaV1baV0gPSAxIC8gdGhpcy5zW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIFUgPSB0aGlzLlU7XG4gICAgICAgIHZhciBWID0gdGhpcy5yaWdodFNpbmd1bGFyVmVjdG9ycztcblxuICAgICAgICB2YXIgVkwgPSBWLm1tdWwoTHMpLFxuICAgICAgICAgICAgdnJvd3MgPSBWLnJvd3MsXG4gICAgICAgICAgICB1cm93cyA9IFUubGVuZ3RoLFxuICAgICAgICAgICAgVkxVID0gTWF0cml4Lnplcm9zKHZyb3dzLCB1cm93cyksXG4gICAgICAgICAgICBqLCBrLCBzdW07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1cm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgc3VtID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgc2NvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gVkxbaV1ba10gKiBVW2pdW2tdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBWTFVbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gVkxVLm1tdWwoWSk7XG4gICAgfSxcbiAgICBzb2x2ZUZvckRpYWdvbmFsOiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc29sdmUoTWF0cml4LmRpYWcodmFsdWUpKTtcbiAgICB9LFxuICAgIGludmVyc2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIFYgPSB0aGlzLlY7XG4gICAgICAgIHZhciBlID0gdGhpcy50aHJlc2hvbGQsXG4gICAgICAgICAgICB2cm93cyA9IFYubGVuZ3RoLFxuICAgICAgICAgICAgdmNvbHMgPSBWWzBdLmxlbmd0aCxcbiAgICAgICAgICAgIFggPSBuZXcgTWF0cml4KHZyb3dzLCB0aGlzLnMubGVuZ3RoKSxcbiAgICAgICAgICAgIGksIGo7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB2Y29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXMuc1tqXSkgPiBlKSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSBWW2ldW2pdIC8gdGhpcy5zW2pdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIFhbaV1bal0gPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBVID0gdGhpcy5VO1xuXG4gICAgICAgIHZhciB1cm93cyA9IFUubGVuZ3RoLFxuICAgICAgICAgICAgdWNvbHMgPSBVWzBdLmxlbmd0aCxcbiAgICAgICAgICAgIFkgPSBuZXcgTWF0cml4KHZyb3dzLCB1cm93cyksXG4gICAgICAgICAgICBrLCBzdW07XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHZyb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1cm93czsgaisrKSB7XG4gICAgICAgICAgICAgICAgc3VtID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgdWNvbHM7IGsrKykge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gWFtpXVtrXSAqIFVbal1ba107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFlbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gWTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmh5cG90ZW51c2UgPSBmdW5jdGlvbiBoeXBvdGVudXNlKGEsIGIpIHtcbiAgICBpZiAoTWF0aC5hYnMoYSkgPiBNYXRoLmFicyhiKSkge1xuICAgICAgICB2YXIgciA9IGIgLyBhO1xuICAgICAgICByZXR1cm4gTWF0aC5hYnMoYSkgKiBNYXRoLnNxcnQoMSArIHIgKiByKTtcbiAgICB9XG4gICAgaWYgKGIgIT09IDApIHtcbiAgICAgICAgdmFyIHIgPSBhIC8gYjtcbiAgICAgICAgcmV0dXJuIE1hdGguYWJzKGIpICogTWF0aC5zcXJ0KDEgKyByICogcik7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxuLy8gRm9yIHVzZSBpbiB0aGUgZGVjb21wb3NpdGlvbiBhbGdvcml0aG1zLiBXaXRoIGJpZyBtYXRyaWNlcywgYWNjZXNzIHRpbWUgaXNcbi8vIHRvbyBsb25nIG9uIGVsZW1lbnRzIGZyb20gYXJyYXkgc3ViY2xhc3Ncbi8vIHRvZG8gY2hlY2sgd2hlbiBpdCBpcyBmaXhlZCBpbiB2OFxuLy8gaHR0cDovL2pzcGVyZi5jb20vYWNjZXNzLWFuZC13cml0ZS1hcnJheS1zdWJjbGFzc1xuZXhwb3J0cy5nZXRFbXB0eTJEQXJyYXkgPSBmdW5jdGlvbiAocm93cywgY29sdW1ucykge1xuICAgIHZhciBhcnJheSA9IG5ldyBBcnJheShyb3dzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICBhcnJheVtpXSA9IG5ldyBBcnJheShjb2x1bW5zKTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xufTtcblxuZXhwb3J0cy5nZXRGaWxsZWQyREFycmF5ID0gZnVuY3Rpb24gKHJvd3MsIGNvbHVtbnMsIHZhbHVlKSB7XG4gICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gbmV3IEFycmF5KGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgYXJyYXlbaV1bal0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnLi9tYXRyaXgnKTtcblxudmFyIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9zdmQnKTtcbnZhciBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvZXZkJyk7XG52YXIgTHVEZWNvbXBvc2l0aW9uID0gcmVxdWlyZSgnLi9kYy9sdScpO1xudmFyIFFyRGVjb21wb3NpdGlvbiA9IHJlcXVpcmUoJy4vZGMvcXInKTtcbnZhciBDaG9sZXNreURlY29tcG9zaXRpb24gPSByZXF1aXJlKCcuL2RjL2Nob2xlc2t5Jyk7XG5cbmZ1bmN0aW9uIGludmVyc2UobWF0cml4KSB7XG4gICAgbWF0cml4ID0gTWF0cml4LmNoZWNrTWF0cml4KG1hdHJpeCk7XG4gICAgcmV0dXJuIHNvbHZlKG1hdHJpeCwgTWF0cml4LmV5ZShtYXRyaXgucm93cykpO1xufVxuXG5NYXRyaXguaW52ZXJzZSA9IE1hdHJpeC5pbnYgPSBpbnZlcnNlO1xuTWF0cml4LnByb3RvdHlwZS5pbnZlcnNlID0gTWF0cml4LnByb3RvdHlwZS5pbnYgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG59O1xuXG5mdW5jdGlvbiBzb2x2ZShsZWZ0SGFuZFNpZGUsIHJpZ2h0SGFuZFNpZGUpIHtcbiAgICBsZWZ0SGFuZFNpZGUgPSBNYXRyaXguY2hlY2tNYXRyaXgobGVmdEhhbmRTaWRlKTtcbiAgICByaWdodEhhbmRTaWRlID0gTWF0cml4LmNoZWNrTWF0cml4KHJpZ2h0SGFuZFNpZGUpO1xuICAgIHJldHVybiBsZWZ0SGFuZFNpZGUuaXNTcXVhcmUoKSA/IG5ldyBMdURlY29tcG9zaXRpb24obGVmdEhhbmRTaWRlKS5zb2x2ZShyaWdodEhhbmRTaWRlKSA6IG5ldyBRckRlY29tcG9zaXRpb24obGVmdEhhbmRTaWRlKS5zb2x2ZShyaWdodEhhbmRTaWRlKTtcbn1cblxuTWF0cml4LnNvbHZlID0gc29sdmU7XG5NYXRyaXgucHJvdG90eXBlLnNvbHZlID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgcmV0dXJuIHNvbHZlKHRoaXMsIG90aGVyKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uOiBTaW5ndWxhclZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBTVkQ6IFNpbmd1bGFyVmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uOiBFaWdlbnZhbHVlRGVjb21wb3NpdGlvbixcbiAgICBFVkQ6IEVpZ2VudmFsdWVEZWNvbXBvc2l0aW9uLFxuICAgIEx1RGVjb21wb3NpdGlvbjogTHVEZWNvbXBvc2l0aW9uLFxuICAgIExVOiBMdURlY29tcG9zaXRpb24sXG4gICAgUXJEZWNvbXBvc2l0aW9uOiBRckRlY29tcG9zaXRpb24sXG4gICAgUVI6IFFyRGVjb21wb3NpdGlvbixcbiAgICBDaG9sZXNreURlY29tcG9zaXRpb246IENob2xlc2t5RGVjb21wb3NpdGlvbixcbiAgICBDSE86IENob2xlc2t5RGVjb21wb3NpdGlvbixcbiAgICBpbnZlcnNlOiBpbnZlcnNlLFxuICAgIHNvbHZlOiBzb2x2ZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL21hdHJpeCcpO1xubW9kdWxlLmV4cG9ydHMuRGVjb21wb3NpdGlvbnMgPSBtb2R1bGUuZXhwb3J0cy5EQyA9IHJlcXVpcmUoJy4vZGVjb21wb3NpdGlvbnMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBSZWFsIG1hdHJpeFxuICovXG5jbGFzcyBNYXRyaXggZXh0ZW5kcyBBcnJheSB7XG4gICAgLyoqXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHtudW1iZXJ8QXJyYXl8TWF0cml4fSBuUm93cyAtIE51bWJlciBvZiByb3dzIG9mIHRoZSBuZXcgbWF0cml4LFxuICAgICAqIDJEIGFycmF5IGNvbnRhaW5pbmcgdGhlIGRhdGEgb3IgTWF0cml4IGluc3RhbmNlIHRvIGNsb25lXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtuQ29sdW1uc10gLSBOdW1iZXIgb2YgY29sdW1ucyBvZiB0aGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG5Sb3dzLCBuQ29sdW1ucykge1xuICAgICAgICBpZiAoTWF0cml4LmlzTWF0cml4KG5Sb3dzKSkge1xuICAgICAgICAgICAgcmV0dXJuIG5Sb3dzLmNsb25lKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoTnVtYmVyLmlzSW50ZWdlcihuUm93cykgJiYgblJvd3MgPiAwKSB7IC8vIENyZWF0ZSBhbiBlbXB0eSBtYXRyaXhcbiAgICAgICAgICAgIHN1cGVyKG5Sb3dzKTtcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNJbnRlZ2VyKG5Db2x1bW5zKSAmJiBuQ29sdW1ucyA+IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5Sb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1tpXSA9IG5ldyBBcnJheShuQ29sdW1ucyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCduQ29sdW1ucyBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoblJvd3MpKSB7IC8vIENvcHkgdGhlIHZhbHVlcyBmcm9tIHRoZSAyRCBhcnJheVxuICAgICAgICAgICAgdmFyIG1hdHJpeCA9IG5Sb3dzO1xuICAgICAgICAgICAgblJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgICAgICAgICAgbkNvbHVtbnMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBuQ29sdW1ucyAhPT0gJ251bWJlcicgfHwgbkNvbHVtbnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdEYXRhIG11c3QgYmUgYSAyRCBhcnJheSB3aXRoIGF0IGxlYXN0IG9uZSBlbGVtZW50Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdXBlcihuUm93cyk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5Sb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAobWF0cml4W2ldLmxlbmd0aCAhPT0gbkNvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0luY29uc2lzdGVudCBhcnJheSBkaW1lbnNpb25zJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXNbaV0gPSBbXS5jb25jYXQobWF0cml4W2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXIgb3IgYW4gYXJyYXknKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJvd3MgPSBuUm93cztcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gbkNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIE1hdHJpeCB3aXRoIHRoZSBjaG9zZW4gZGltZW5zaW9ucyBmcm9tIGEgMUQgYXJyYXlcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbmV3Um93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IG5ld0NvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IG5ld0RhdGEgLSBBIDFEIGFycmF5IGNvbnRhaW5pbmcgZGF0YSBmb3IgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZnJvbTFEQXJyYXkobmV3Um93cywgbmV3Q29sdW1ucywgbmV3RGF0YSkge1xuICAgICAgICB2YXIgbGVuZ3RoID0gbmV3Um93cyAqIG5ld0NvbHVtbnM7XG4gICAgICAgIGlmIChsZW5ndGggIT09IG5ld0RhdGEubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignRGF0YSBsZW5ndGggZG9lcyBub3QgbWF0Y2ggZ2l2ZW4gZGltZW5zaW9ucycpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KG5ld1Jvd3MsIG5ld0NvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCBuZXdSb3dzOyByb3crKykge1xuICAgICAgICAgICAgZm9yICh2YXIgY29sdW1uID0gMDsgY29sdW1uIDwgbmV3Q29sdW1uczsgY29sdW1uKyspIHtcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbcm93XVtjb2x1bW5dID0gbmV3RGF0YVtyb3cgKiBuZXdDb2x1bW5zICsgY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSByb3cgdmVjdG9yLCBhIG1hdHJpeCB3aXRoIG9ubHkgb25lIHJvdy5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBuZXdEYXRhIC0gQSAxRCBhcnJheSBjb250YWluaW5nIGRhdGEgZm9yIHRoZSB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIHJvd1ZlY3RvcihuZXdEYXRhKSB7XG4gICAgICAgIHZhciB2ZWN0b3IgPSBuZXcgTWF0cml4KDEsIG5ld0RhdGEubGVuZ3RoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdEYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2ZWN0b3JbMF1baV0gPSBuZXdEYXRhW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2ZWN0b3I7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIGNvbHVtbiB2ZWN0b3IsIGEgbWF0cml4IHdpdGggb25seSBvbmUgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IG5ld0RhdGEgLSBBIDFEIGFycmF5IGNvbnRhaW5pbmcgZGF0YSBmb3IgdGhlIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgY29sdW1uVmVjdG9yKG5ld0RhdGEpIHtcbiAgICAgICAgdmFyIHZlY3RvciA9IG5ldyBNYXRyaXgobmV3RGF0YS5sZW5ndGgsIDEpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5ld0RhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZlY3RvcltpXVswXSA9IG5ld0RhdGFbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZlY3RvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGVtcHR5IG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSB1bmRlZmluZWQuIFNhbWUgYXMgdXNpbmcgbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93cyAtIE51bWJlciBvZiByb3dzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbnMgLSBOdW1iZXIgb2YgY29sdW1uc1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IC0gVGhlIG5ldyBtYXRyaXhcbiAgICAgKi9cbiAgICBzdGF0aWMgZW1wdHkocm93cywgY29sdW1ucykge1xuICAgICAgICByZXR1cm4gbmV3IE1hdHJpeChyb3dzLCBjb2x1bW5zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHNldCB0byB6ZXJvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dzIC0gTnVtYmVyIG9mIHJvd3NcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1ucyAtIE51bWJlciBvZiBjb2x1bW5zXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyB6ZXJvcyhyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguZW1wdHkocm93cywgY29sdW1ucykuZmlsbCgwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbnMuIFZhbHVlcyB3aWxsIGJlIHNldCB0byBvbmUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIG9uZXMocm93cywgY29sdW1ucykge1xuICAgICAgICByZXR1cm4gTWF0cml4LmVtcHR5KHJvd3MsIGNvbHVtbnMpLmZpbGwoMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBkaW1lbnNpb25zLiBWYWx1ZXMgd2lsbCBiZSByYW5kb21seSBzZXQuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW5zIC0gTnVtYmVyIG9mIGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBbcm5nXSAtIFJhbmRvbSBudW1iZXIgZ2VuZXJhdG9yIChkZWZhdWx0OiBNYXRoLnJhbmRvbSlcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSBUaGUgbmV3IG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyByYW5kKHJvd3MsIGNvbHVtbnMsIHJuZykge1xuICAgICAgICBpZiAocm5nID09PSB1bmRlZmluZWQpIHJuZyA9IE1hdGgucmFuZG9tO1xuICAgICAgICB2YXIgbWF0cml4ID0gTWF0cml4LmVtcHR5KHJvd3MsIGNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBtYXRyaXhbaV1bal0gPSBybmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYW4gaWRlbnRpdHkgbWF0cml4IHdpdGggdGhlIGdpdmVuIGRpbWVuc2lvbi4gVmFsdWVzIG9mIHRoZSBkaWFnb25hbCB3aWxsIGJlIDEgYW5kIG90aGVycyB3aWxsIGJlIDAuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvd3MgLSBOdW1iZXIgb2Ygcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbY29sdW1uc10gLSBOdW1iZXIgb2YgY29sdW1ucyAoRGVmYXVsdDogcm93cylcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSAtIFRoZSBuZXcgaWRlbnRpdHkgbWF0cml4XG4gICAgICovXG4gICAgc3RhdGljIGV5ZShyb3dzLCBjb2x1bW5zKSB7XG4gICAgICAgIGlmIChjb2x1bW5zID09PSB1bmRlZmluZWQpIGNvbHVtbnMgPSByb3dzO1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4ocm93cywgY29sdW1ucyk7XG4gICAgICAgIHZhciBtYXRyaXggPSBNYXRyaXguemVyb3Mocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIG1hdHJpeFtpXVtpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgZGlhZ29uYWwgbWF0cml4IGJhc2VkIG9uIHRoZSBnaXZlbiBhcnJheS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkYXRhIC0gQXJyYXkgY29udGFpbmluZyB0aGUgZGF0YSBmb3IgdGhlIGRpYWdvbmFsXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IFtyb3dzXSAtIE51bWJlciBvZiByb3dzIChEZWZhdWx0OiBkYXRhLmxlbmd0aClcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2NvbHVtbnNdIC0gTnVtYmVyIG9mIGNvbHVtbnMgKERlZmF1bHQ6IHJvd3MpXG4gICAgICogQHJldHVybnMge01hdHJpeH0gLSBUaGUgbmV3IGRpYWdvbmFsIG1hdHJpeFxuICAgICAqL1xuICAgIHN0YXRpYyBkaWFnKGRhdGEsIHJvd3MsIGNvbHVtbnMpIHtcbiAgICAgICAgdmFyIGwgPSBkYXRhLmxlbmd0aDtcbiAgICAgICAgaWYgKHJvd3MgPT09IHVuZGVmaW5lZCkgcm93cyA9IGw7XG4gICAgICAgIGlmIChjb2x1bW5zID09PSB1bmRlZmluZWQpIGNvbHVtbnMgPSByb3dzO1xuICAgICAgICB2YXIgbWluID0gTWF0aC5taW4obCwgcm93cywgY29sdW1ucyk7XG4gICAgICAgIHZhciBtYXRyaXggPSBNYXRyaXguemVyb3Mocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWluOyBpKyspIHtcbiAgICAgICAgICAgIG1hdHJpeFtpXVtpXSA9IGRhdGFbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdHJpeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbWF0cml4IHdob3NlIGVsZW1lbnRzIGFyZSB0aGUgbWluaW11bSBiZXR3ZWVuIG1hdHJpeDEgYW5kIG1hdHJpeDJcbiAgICAgKiBAcGFyYW0gbWF0cml4MVxuICAgICAqIEBwYXJhbSBtYXRyaXgyXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdGF0aWMgbWluKG1hdHJpeDEsIG1hdHJpeDIpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBtYXRyaXgxLmxlbmd0aDtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSBtYXRyaXgxWzBdLmxlbmd0aDtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gTWF0aC5taW4obWF0cml4MVtpXVtqXSwgbWF0cml4MltpXVtqXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbWF0cml4IHdob3NlIGVsZW1lbnRzIGFyZSB0aGUgbWF4aW11bSBiZXR3ZWVuIG1hdHJpeDEgYW5kIG1hdHJpeDJcbiAgICAgKiBAcGFyYW0gbWF0cml4MVxuICAgICAqIEBwYXJhbSBtYXRyaXgyXG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdGF0aWMgbWF4KG1hdHJpeDEsIG1hdHJpeDIpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBtYXRyaXgxLmxlbmd0aDtcbiAgICAgICAgdmFyIGNvbHVtbnMgPSBtYXRyaXgxWzBdLmxlbmd0aDtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBNYXRyaXgocm93cywgY29sdW1ucyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gTWF0aC5tYXgobWF0cml4MVtpXVtqXSwgbWF0cml4MltpXVtqXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayB0aGF0IHRoZSBwcm92aWRlZCB2YWx1ZSBpcyBhIE1hdHJpeCBhbmQgdHJpZXMgdG8gaW5zdGFudGlhdGUgb25lIGlmIG5vdFxuICAgICAqIEBwYXJhbSB2YWx1ZSAtIFRoZSB2YWx1ZSB0byBjaGVja1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9XG4gICAgICovXG4gICAgc3RhdGljIGNoZWNrTWF0cml4KHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXguaXNNYXRyaXgodmFsdWUpID8gdmFsdWUgOiBuZXcgTWF0cml4KHZhbHVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGFyZ3VtZW50IGlzIGEgTWF0cml4LCBmYWxzZSBvdGhlcndpc2VcbiAgICAgKiBAcGFyYW0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHN0YXRpYyBpc01hdHJpeCh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gKHZhbHVlICE9IG51bGwpICYmICh2YWx1ZS5rbGFzcyA9PT0gJ01hdHJpeCcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSAtIFRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gdGhlIG1hdHJpeC5cbiAgICAgKi9cbiAgICBnZXQgc2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucm93cyAqIHRoaXMuY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBsaWVzIGEgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudCBvZiB0aGUgbWF0cml4LiBUaGUgZnVuY3Rpb24gaXMgY2FsbGVkIGluIHRoZSBtYXRyaXggKHRoaXMpIGNvbnRleHQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBGdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIHdpdGggdHdvIHBhcmFtZXRlcnMgOiBpIChyb3cpIGFuZCBqIChjb2x1bW4pXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFwcGx5KGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBpaSA9IHRoaXMucm93cztcbiAgICAgICAgdmFyIGpqID0gdGhpcy5jb2x1bW5zO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgaSwgaik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBleGFjdCBhbmQgaW5kZXBlbmRlbnQgY29weSBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBjbG9uZSgpIHtcbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgodGhpcy5yb3dzLCB0aGlzLmNvbHVtbnMpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCB0aGlzLnJvd3M7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gPSAwOyBjb2x1bW4gPCB0aGlzLmNvbHVtbnM7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICAgICAgbmV3TWF0cml4W3Jvd11bY29sdW1uXSA9IHRoaXNbcm93XVtjb2x1bW5dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdNYXRyaXg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIG5ldyAxRCBhcnJheSBmaWxsZWQgcm93IGJ5IHJvdyB3aXRoIHRoZSBtYXRyaXggdmFsdWVzXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIHRvMURBcnJheSgpIHtcbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KHRoaXMuc2l6ZSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBhcnJheVtpICogdGhpcy5jb2x1bW5zICsgal0gPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcnJheTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgMkQgYXJyYXkgY29udGFpbmluZyBhIGNvcHkgb2YgdGhlIGRhdGFcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgdG8yREFycmF5KCkge1xuICAgICAgICB2YXIgY29weSA9IG5ldyBBcnJheSh0aGlzLnJvd3MpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb3B5W2ldID0gW10uY29uY2F0KHRoaXNbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb3B5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRoZSBtYXRyaXggaGFzIG9uZSByb3dcbiAgICAgKi9cbiAgICBpc1Jvd1ZlY3RvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucm93cyA9PT0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyBvbmUgY29sdW1uXG4gICAgICovXG4gICAgaXNDb2x1bW5WZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbHVtbnMgPT09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBoYXMgb25lIHJvdyBvciBvbmUgY29sdW1uXG4gICAgICovXG4gICAgaXNWZWN0b3IoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5yb3dzID09PSAxKSB8fCAodGhpcy5jb2x1bW5zID09PSAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgbWF0cml4IGhhcyB0aGUgc2FtZSBudW1iZXIgb2Ygcm93cyBhbmQgY29sdW1uc1xuICAgICAqL1xuICAgIGlzU3F1YXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yb3dzID09PSB0aGlzLmNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIG1hdHJpeCBpcyBzcXVhcmUgYW5kIGhhcyB0aGUgc2FtZSB2YWx1ZXMgb24gYm90aCBzaWRlcyBvZiB0aGUgZGlhZ29uYWxcbiAgICAgKi9cbiAgICBpc1N5bW1ldHJpYygpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNTcXVhcmUoKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDw9IGk7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSAhPT0gdGhpc1tqXVtpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBnaXZlbiBlbGVtZW50IG9mIHRoZSBtYXRyaXguIG1hdC5zZXQoMyw0LDEpIGlzIGVxdWl2YWxlbnQgdG8gbWF0WzNdWzRdPTFcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93SW5kZXggLSBJbmRleCBvZiB0aGUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbkluZGV4IC0gSW5kZXggb2YgdGhlIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSAtIFRoZSBuZXcgdmFsdWUgZm9yIHRoZSBlbGVtZW50XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldChyb3dJbmRleCwgY29sdW1uSW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIHRoaXNbcm93SW5kZXhdW2NvbHVtbkluZGV4XSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBnaXZlbiBlbGVtZW50IG9mIHRoZSBtYXRyaXguIG1hdC5nZXQoMyw0KSBpcyBlcXVpdmFsZW50IHRvIG1hdHJpeFszXVs0XVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3dJbmRleCAtIEluZGV4IG9mIHRoZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uSW5kZXggLSBJbmRleCBvZiB0aGUgY29sdW1uXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBnZXQocm93SW5kZXgsIGNvbHVtbkluZGV4KSB7XG4gICAgICAgIHJldHVybiB0aGlzW3Jvd0luZGV4XVtjb2x1bW5JbmRleF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlsbHMgdGhlIG1hdHJpeCB3aXRoIGEgZ2l2ZW4gdmFsdWUuIEFsbCBlbGVtZW50cyB3aWxsIGJlIHNldCB0byB0aGlzIHZhbHVlLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZSAtIE5ldyB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBmaWxsKHZhbHVlKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTmVnYXRlcyB0aGUgbWF0cml4LiBBbGwgZWxlbWVudHMgd2lsbCBiZSBtdWx0aXBsaWVkIGJ5ICgtMSlcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbmVnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5tdWxTKC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IGFycmF5IGZyb20gdGhlIGdpdmVuIHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBnZXRSb3coaW5kZXgpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIHJldHVybiBbXS5jb25jYXQodGhpc1tpbmRleF0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgcm93IHZlY3RvciBmcm9tIHRoZSBnaXZlbiByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIGdldFJvd1ZlY3RvcihpbmRleCkge1xuICAgICAgICByZXR1cm4gTWF0cml4LnJvd1ZlY3Rvcih0aGlzLmdldFJvdyhpbmRleCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSByb3cgYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldFJvdyhpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tSb3dWZWN0b3IodGhpcywgYXJyYXksIHRydWUpO1xuICAgICAgICB0aGlzW2luZGV4XSA9IGFycmF5O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgcm93IGZyb20gdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHJlbW92ZVJvdyhpbmRleCkge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgaWYgKHRoaXMucm93cyA9PT0gMSlcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBIG1hdHJpeCBjYW5ub3QgaGF2ZSBsZXNzIHRoYW4gb25lIHJvdycpO1xuICAgICAgICB0aGlzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIHRoaXMucm93cyAtPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcm93IGF0IHRoZSBnaXZlbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbaW5kZXggPSB0aGlzLnJvd3NdIC0gUm93IGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIGFkZFJvdyhpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgaWYgKGFycmF5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGFycmF5ID0gaW5kZXg7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMucm93cztcbiAgICAgICAgfVxuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIGluZGV4LCB0cnVlKTtcbiAgICAgICAgYXJyYXkgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCBhcnJheSwgdHJ1ZSk7XG4gICAgICAgIHRoaXMuc3BsaWNlKGluZGV4LCAwLCBhcnJheSk7XG4gICAgICAgIHRoaXMucm93cyArPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTd2FwcyB0d28gcm93c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cxIC0gRmlyc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdzIgLSBTZWNvbmQgcm93IGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN3YXBSb3dzKHJvdzEsIHJvdzIpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cxKTtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cyKTtcbiAgICAgICAgdmFyIHRlbXAgPSB0aGlzW3JvdzFdO1xuICAgICAgICB0aGlzW3JvdzFdID0gdGhpc1tyb3cyXTtcbiAgICAgICAgdGhpc1tyb3cyXSA9IHRlbXA7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgYXJyYXkgZnJvbSB0aGUgZ2l2ZW4gY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIGdldENvbHVtbihpbmRleCkge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGluZGV4KTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IG5ldyBBcnJheSh0aGlzLnJvd3MpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBjb2x1bW5baV0gPSB0aGlzW2ldW2luZGV4XTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgY29sdW1uIHZlY3RvciBmcm9tIHRoZSBnaXZlbiBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIGdldENvbHVtblZlY3RvcihpbmRleCkge1xuICAgICAgICByZXR1cm4gTWF0cml4LmNvbHVtblZlY3Rvcih0aGlzLmdldENvbHVtbihpbmRleCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBjb2x1bW4gYXQgdGhlIGdpdmVuIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGluZGV4IC0gQ29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IGFycmF5IC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHNldENvbHVtbihpbmRleCwgYXJyYXkpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgYXJyYXkpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2luZGV4XSA9IGFycmF5W2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSBjb2x1bW4gZnJvbSB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaW5kZXggLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgcmVtb3ZlQ29sdW1uKGluZGV4KSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBpZiAodGhpcy5jb2x1bW5zID09PSAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0EgbWF0cml4IGNhbm5vdCBoYXZlIGxlc3MgdGhhbiBvbmUgY29sdW1uJyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV0uc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbHVtbnMgLT0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGNvbHVtbiBhdCB0aGUgZ2l2ZW4gaW5kZXhcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gW2luZGV4ID0gdGhpcy5jb2x1bW5zXSAtIENvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSBhcnJheSAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRDb2x1bW4oaW5kZXgsIGFycmF5KSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJyYXkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBhcnJheSA9IGluZGV4O1xuICAgICAgICAgICAgaW5kZXggPSB0aGlzLmNvbHVtbnM7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBpbmRleCwgdHJ1ZSk7XG4gICAgICAgIGFycmF5ID0gY2hlY2tDb2x1bW5WZWN0b3IodGhpcywgYXJyYXkpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldLnNwbGljZShpbmRleCwgMCwgYXJyYXlbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29sdW1ucyArPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTd2FwcyB0d28gY29sdW1uc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4xIC0gRmlyc3QgY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbjIgLSBTZWNvbmQgY29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIHN3YXBDb2x1bW5zKGNvbHVtbjEsIGNvbHVtbjIpIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4xKTtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4yKTtcbiAgICAgICAgdmFyIHRlbXAsIHJvdztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgcm93ID0gdGhpc1tpXTtcbiAgICAgICAgICAgIHRlbXAgPSByb3dbY29sdW1uMV07XG4gICAgICAgICAgICByb3dbY29sdW1uMV0gPSByb3dbY29sdW1uMl07XG4gICAgICAgICAgICByb3dbY29sdW1uMl0gPSB0ZW1wO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciB0byBlYWNoIHJvd1xuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgYWRkUm93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSArPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3VidHJhY3RzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3IgZnJvbSBlYWNoIHJvd1xuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc3ViUm93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAtPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTXVsdGlwbGllcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHdpdGggZWFjaCByb3dcbiAgICAgKiBAcGFyYW0ge0FycmF5fE1hdHJpeH0gdmVjdG9yIC0gQXJyYXkgb3IgdmVjdG9yXG4gICAgICogQHJldHVybnMge01hdHJpeH0gdGhpc1xuICAgICAqL1xuICAgIG11bFJvd1ZlY3Rvcih2ZWN0b3IpIHtcbiAgICAgICAgdmVjdG9yID0gY2hlY2tSb3dWZWN0b3IodGhpcywgdmVjdG9yKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gKj0gdmVjdG9yW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERpdmlkZXMgdGhlIHZhbHVlcyBvZiBlYWNoIHJvdyBieSB0aG9zZSBvZiBhIHZlY3RvclxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgZGl2Um93VmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja1Jvd1ZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAvPSB2ZWN0b3Jbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyB0aGUgdmFsdWVzIG9mIGEgdmVjdG9yIHRvIGVhY2ggY29sdW1uXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBhZGRDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdICs9IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJ0cmFjdHMgdGhlIHZhbHVlcyBvZiBhIHZlY3RvciBmcm9tIGVhY2ggY29sdW1uXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzdWJDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC09IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSB2ZWN0b3Igd2l0aCBlYWNoIGNvbHVtblxuICAgICAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3IgLSBBcnJheSBvciB2ZWN0b3JcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgbXVsQ29sdW1uVmVjdG9yKHZlY3Rvcikge1xuICAgICAgICB2ZWN0b3IgPSBjaGVja0NvbHVtblZlY3Rvcih0aGlzLCB2ZWN0b3IpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuY29sdW1uczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpc1tpXVtqXSAqPSB2ZWN0b3JbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGl2aWRlcyB0aGUgdmFsdWVzIG9mIGVhY2ggY29sdW1uIGJ5IHRob3NlIG9mIGEgdmVjdG9yXG4gICAgICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvciAtIEFycmF5IG9yIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBkaXZDb2x1bW5WZWN0b3IodmVjdG9yKSB7XG4gICAgICAgIHZlY3RvciA9IGNoZWNrQ29sdW1uVmVjdG9yKHRoaXMsIHZlY3Rvcik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzW2ldW2pdIC89IHZlY3RvcltpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSByb3cgd2l0aCBhIHNjYWxhclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIFJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxSb3coaW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2luZGV4XVtpXSAqPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNdWx0aXBsaWVzIHRoZSB2YWx1ZXMgb2YgYSBjb2x1bW4gd2l0aCBhIHNjYWxhclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAtIENvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBtdWxDb2x1bW4oaW5kZXgsIHZhbHVlKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgaW5kZXgpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzW2ldW2luZGV4XSAqPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1heGltdW0gdmFsdWUgb2YgdGhlIG1hdHJpeFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWF4KCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA+IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlXG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1heEluZGV4KCkge1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bMF07XG4gICAgICAgIHZhciBpZHggPSBbMCwgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1tpXVtqXSA+IHYpIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGlkeFsxXSA9IGo7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWluaW11bSB2YWx1ZSBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtaW4oKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdIDwgdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1pbmltdW0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWluSW5kZXgoKSB7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCAwXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW2ldW2pdIDwgdikge1xuICAgICAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgICAgICAgICAgaWR4WzFdID0gajtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtYXhSb3cocm93KSB7XG4gICAgICAgIGNoZWNrUm93SW5kZXgodGhpcywgcm93KTtcbiAgICAgICAgdmFyIHYgPSB0aGlzW3Jvd11bMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPiB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgcm93XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJvdyAtIFJvdyBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtYXhSb3dJbmRleChyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgdmFyIGlkeCA9IFtyb3csIDBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMuY29sdW1uczsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tyb3ddW2ldID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW3Jvd11baV07XG4gICAgICAgICAgICAgICAgaWR4WzFdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1pbmltdW0gdmFsdWUgb2Ygb25lIHJvd1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgLSBSb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIG1pblJvdyhyb3cpIHtcbiAgICAgICAgY2hlY2tSb3dJbmRleCh0aGlzLCByb3cpO1xuICAgICAgICB2YXIgdiA9IHRoaXNbcm93XVswXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLmNvbHVtbnM7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbcm93XVtpXSA8IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tyb3ddW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXhpbXVtIHZhbHVlIG9mIG9uZSByb3dcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IC0gUm93IGluZGV4XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIG1pblJvd0luZGV4KHJvdykge1xuICAgICAgICBjaGVja1Jvd0luZGV4KHRoaXMsIHJvdyk7XG4gICAgICAgIHZhciB2ID0gdGhpc1tyb3ddWzBdO1xuICAgICAgICB2YXIgaWR4ID0gW3JvdywgMF07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW3Jvd11baV0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbcm93XVtpXTtcbiAgICAgICAgICAgICAgICBpZHhbMV0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZHg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbWF4aW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgbWF4Q29sdW1uKGNvbHVtbikge1xuICAgICAgICBjaGVja0NvbHVtbkluZGV4KHRoaXMsIGNvbHVtbik7XG4gICAgICAgIHZhciB2ID0gdGhpc1swXVtjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dID4gdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1heGltdW0gdmFsdWUgb2Ygb25lIGNvbHVtblxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgbWF4Q29sdW1uSW5kZXgoY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIHZhciBpZHggPSBbMCwgY29sdW1uXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV1bY29sdW1uXSA+IHYpIHtcbiAgICAgICAgICAgICAgICB2ID0gdGhpc1tpXVtjb2x1bW5dO1xuICAgICAgICAgICAgICAgIGlkeFswXSA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkeDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtaW5pbXVtIHZhbHVlIG9mIG9uZSBjb2x1bW5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gY29sdW1uIC0gQ29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtaW5Db2x1bW4oY29sdW1uKSB7XG4gICAgICAgIGNoZWNrQ29sdW1uSW5kZXgodGhpcywgY29sdW1uKTtcbiAgICAgICAgdmFyIHYgPSB0aGlzWzBdW2NvbHVtbl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzW2ldW2NvbHVtbl0gPCB2KSB7XG4gICAgICAgICAgICAgICAgdiA9IHRoaXNbaV1bY29sdW1uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWluaW11bSB2YWx1ZSBvZiBvbmUgY29sdW1uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGNvbHVtbiAtIENvbHVtbiBpbmRleFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBtaW5Db2x1bW5JbmRleChjb2x1bW4pIHtcbiAgICAgICAgY2hlY2tDb2x1bW5JbmRleCh0aGlzLCBjb2x1bW4pO1xuICAgICAgICB2YXIgdiA9IHRoaXNbMF1bY29sdW1uXTtcbiAgICAgICAgdmFyIGlkeCA9IFswLCBjb2x1bW5dO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXVtjb2x1bW5dIDwgdikge1xuICAgICAgICAgICAgICAgIHYgPSB0aGlzW2ldW2NvbHVtbl07XG4gICAgICAgICAgICAgICAgaWR4WzBdID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWR4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgZGlhZ29uYWwgdmFsdWVzIG9mIHRoZSBtYXRyaXhcbiAgICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgICovXG4gICAgZGlhZygpIHtcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKHRoaXMucm93cywgdGhpcy5jb2x1bW5zKTtcbiAgICAgICAgdmFyIGRpYWcgPSBuZXcgQXJyYXkobWluKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgZGlhZ1tpXSA9IHRoaXNbaV1baV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRpYWc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3VtIG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBzdW0oKSB7XG4gICAgICAgIHZhciB2ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHYgKz0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBtZWFuIG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBtZWFuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdW0oKSAvIHRoaXMuc2l6ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwcm9kdWN0IG9mIGFsbCBlbGVtZW50cyBvZiB0aGUgbWF0cml4XG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBwcm9kKCkge1xuICAgICAgICB2YXIgcHJvZCA9IDE7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgICAgICBwcm9kICo9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByb2Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcHV0ZXMgdGhlIGN1bXVsYXRpdmUgc3VtIG9mIHRoZSBtYXRyaXggZWxlbWVudHMgKGluIHBsYWNlLCByb3cgYnkgcm93KVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBjdW11bGF0aXZlU3VtKCkge1xuICAgICAgICB2YXIgc3VtID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHN1bSArPSB0aGlzW2ldW2pdO1xuICAgICAgICAgICAgICAgIHRoaXNbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcHV0ZXMgdGhlIGRvdCAoc2NhbGFyKSBwcm9kdWN0IGJldHdlZW4gdGhlIG1hdHJpeCBhbmQgYW5vdGhlclxuICAgICAqIEBwYXJhbSB7TWF0cml4fSB2ZWN0b3IyIHZlY3RvclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgZG90KHZlY3RvcjIpIHtcbiAgICAgICAgaWYgKE1hdHJpeC5pc01hdHJpeCh2ZWN0b3IyKSkgdmVjdG9yMiA9IHZlY3RvcjIudG8xREFycmF5KCk7XG4gICAgICAgIHZhciB2ZWN0b3IxID0gdGhpcy50bzFEQXJyYXkoKTtcbiAgICAgICAgaWYgKHZlY3RvcjEubGVuZ3RoICE9PSB2ZWN0b3IyLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZlY3RvcnMgZG8gbm90IGhhdmUgdGhlIHNhbWUgc2l6ZScpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBkb3QgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZlY3RvcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRvdCArPSB2ZWN0b3IxW2ldICogdmVjdG9yMltpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZG90O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG1hdHJpeCBwcm9kdWN0IGJldHdlZW4gdGhpcyBhbmQgb3RoZXJcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIG1tdWwob3RoZXIpIHtcbiAgICAgICAgb3RoZXIgPSBNYXRyaXguY2hlY2tNYXRyaXgob3RoZXIpO1xuICAgICAgICBpZiAodGhpcy5jb2x1bW5zICE9PSBvdGhlci5yb3dzKVxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdOdW1iZXIgb2YgY29sdW1ucyBvZiBsZWZ0IG1hdHJpeCBhcmUgbm90IGVxdWFsIHRvIG51bWJlciBvZiByb3dzIG9mIHJpZ2h0IG1hdHJpeC4nKTtcblxuICAgICAgICB2YXIgbSA9IHRoaXMucm93cztcbiAgICAgICAgdmFyIG4gPSB0aGlzLmNvbHVtbnM7XG4gICAgICAgIHZhciBwID0gb3RoZXIuY29sdW1ucztcblxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IE1hdHJpeChtLCBwKTtcblxuICAgICAgICB2YXIgQmNvbGogPSBuZXcgQXJyYXkobik7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcDsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IG47IGsrKylcbiAgICAgICAgICAgICAgICBCY29saltrXSA9IG90aGVyW2tdW2pdO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG07IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBBcm93aSA9IHRoaXNbaV07XG5cbiAgICAgICAgICAgICAgICB2YXIgcyA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IG47IGsrKylcbiAgICAgICAgICAgICAgICAgICAgcyArPSBBcm93aVtrXSAqIEJjb2xqW2tdO1xuXG4gICAgICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zcG9zZXMgdGhlIG1hdHJpeCBhbmQgcmV0dXJucyBhIG5ldyBvbmUgY29udGFpbmluZyB0aGUgcmVzdWx0XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICB0cmFuc3Bvc2UoKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgTWF0cml4KHRoaXMuY29sdW1ucywgdGhpcy5yb3dzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgICAgIHJlc3VsdFtqXVtpXSA9IHRoaXNbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTb3J0cyB0aGUgcm93cyAoaW4gcGxhY2UpXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY29tcGFyZUZ1bmN0aW9uIC0gdXN1YWwgQXJyYXkucHJvdG90eXBlLnNvcnQgY29tcGFyaXNvbiBmdW5jdGlvblxuICAgICAqIEByZXR1cm5zIHtNYXRyaXh9IHRoaXNcbiAgICAgKi9cbiAgICBzb3J0Um93cyhjb21wYXJlRnVuY3Rpb24pIHtcbiAgICAgICAgaWYgKGNvbXBhcmVGdW5jdGlvbiA9PT0gdW5kZWZpbmVkKSBjb21wYXJlRnVuY3Rpb24gPSBjb21wYXJlTnVtYmVycztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJvd3M7IGkrKykge1xuICAgICAgICAgICAgdGhpc1tpXS5zb3J0KGNvbXBhcmVGdW5jdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU29ydHMgdGhlIGNvbHVtbnMgKGluIHBsYWNlKVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNvbXBhcmVGdW5jdGlvbiAtIHVzdWFsIEFycmF5LnByb3RvdHlwZS5zb3J0IGNvbXBhcmlzb24gZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fSB0aGlzXG4gICAgICovXG4gICAgc29ydENvbHVtbnMoY29tcGFyZUZ1bmN0aW9uKSB7XG4gICAgICAgIGlmIChjb21wYXJlRnVuY3Rpb24gPT09IHVuZGVmaW5lZCkgY29tcGFyZUZ1bmN0aW9uID0gY29tcGFyZU51bWJlcnM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jb2x1bW5zOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Q29sdW1uKGksIHRoaXMuZ2V0Q29sdW1uKGkpLnNvcnQoY29tcGFyZUZ1bmN0aW9uKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHN1YnNldCBvZiB0aGUgbWF0cml4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0Um93IC0gRmlyc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGVuZFJvdyAtIExhc3Qgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0Q29sdW1uIC0gRmlyc3QgY29sdW1uIGluZGV4XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGVuZENvbHVtbiAtIExhc3QgY29sdW1uIGluZGV4XG4gICAgICogQHJldHVybnMge01hdHJpeH1cbiAgICAgKi9cbiAgICBzdWJNYXRyaXgoc3RhcnRSb3csIGVuZFJvdywgc3RhcnRDb2x1bW4sIGVuZENvbHVtbikge1xuICAgICAgICBpZiAoKHN0YXJ0Um93ID4gZW5kUm93KSB8fCAoc3RhcnRDb2x1bW4gPiBlbmRDb2x1bW4pIHx8IChzdGFydFJvdyA8IDApIHx8IChzdGFydFJvdyA+PSB0aGlzLnJvd3MpIHx8IChlbmRSb3cgPCAwKSB8fCAoZW5kUm93ID49IHRoaXMucm93cykgfHwgKHN0YXJ0Q29sdW1uIDwgMCkgfHwgKHN0YXJ0Q29sdW1uID49IHRoaXMuY29sdW1ucykgfHwgKGVuZENvbHVtbiA8IDApIHx8IChlbmRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KGVuZFJvdyAtIHN0YXJ0Um93ICsgMSwgZW5kQ29sdW1uIC0gc3RhcnRDb2x1bW4gKyAxKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0Um93OyBpIDw9IGVuZFJvdzsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnRDb2x1bW47IGogPD0gZW5kQ29sdW1uOyBqKyspIHtcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbaSAtIHN0YXJ0Um93XVtqIC0gc3RhcnRDb2x1bW5dID0gdGhpc1tpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdWJzZXQgb2YgdGhlIG1hdHJpeCBiYXNlZCBvbiBhbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IGluZGljZXMgLSBBcnJheSBjb250YWluaW5nIHRoZSByb3cgaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnRDb2x1bW4gPSAwXSAtIEZpcnN0IGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbZW5kQ29sdW1uID0gdGhpcy5jb2x1bW5zLTFdIC0gTGFzdCBjb2x1bW4gaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN1Yk1hdHJpeFJvdyhpbmRpY2VzLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uKSB7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PT0gdW5kZWZpbmVkKSBzdGFydENvbHVtbiA9IDA7XG4gICAgICAgIGlmIChlbmRDb2x1bW4gPT09IHVuZGVmaW5lZCkgZW5kQ29sdW1uID0gdGhpcy5jb2x1bW5zIC0gMTtcbiAgICAgICAgaWYgKChzdGFydENvbHVtbiA+IGVuZENvbHVtbikgfHwgKHN0YXJ0Q29sdW1uIDwgMCkgfHwgKHN0YXJ0Q29sdW1uID49IHRoaXMuY29sdW1ucykgfHwgKGVuZENvbHVtbiA8IDApIHx8IChlbmRDb2x1bW4gPj0gdGhpcy5jb2x1bW5zKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgoaW5kaWNlcy5sZW5ndGgsIGVuZENvbHVtbiAtIHN0YXJ0Q29sdW1uICsgMSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0Q29sdW1uOyBqIDw9IGVuZENvbHVtbjsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGljZXNbaV0gPCAwIHx8IGluZGljZXNbaV0gPj0gdGhpcy5yb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdSb3cgaW5kZXggb3V0IG9mIHJhbmdlOiAnICsgaW5kaWNlc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtpXVtqIC0gc3RhcnRDb2x1bW5dID0gdGhpc1tpbmRpY2VzW2ldXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdWJzZXQgb2YgdGhlIG1hdHJpeCBiYXNlZCBvbiBhbiBhcnJheSBvZiBjb2x1bW4gaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IGluZGljZXMgLSBBcnJheSBjb250YWluaW5nIHRoZSBjb2x1bW4gaW5kaWNlc1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbc3RhcnRSb3cgPSAwXSAtIEZpcnN0IHJvdyBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBbZW5kUm93ID0gdGhpcy5yb3dzLTFdIC0gTGFzdCByb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4fVxuICAgICAqL1xuICAgIHN1Yk1hdHJpeENvbHVtbihpbmRpY2VzLCBzdGFydFJvdywgZW5kUm93KSB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PT0gdW5kZWZpbmVkKSBzdGFydFJvdyA9IDA7XG4gICAgICAgIGlmIChlbmRSb3cgPT09IHVuZGVmaW5lZCkgZW5kUm93ID0gdGhpcy5yb3dzIC0gMTtcbiAgICAgICAgaWYgKChzdGFydFJvdyA+IGVuZFJvdykgfHwgKHN0YXJ0Um93IDwgMCkgfHwgKHN0YXJ0Um93ID49IHRoaXMucm93cykgfHwgKGVuZFJvdyA8IDApIHx8IChlbmRSb3cgPj0gdGhpcy5yb3dzKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0FyZ3VtZW50IG91dCBvZiByYW5nZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgoZW5kUm93IC0gc3RhcnRSb3cgKyAxLCBpbmRpY2VzLmxlbmd0aCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0Um93OyBqIDw9IGVuZFJvdzsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGljZXNbaV0gPCAwIHx8IGluZGljZXNbaV0gPj0gdGhpcy5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdDb2x1bW4gaW5kZXggb3V0IG9mIHJhbmdlOiAnICsgaW5kaWNlc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5ld01hdHJpeFtqIC0gc3RhcnRSb3ddW2ldID0gdGhpc1tqXVtpbmRpY2VzW2ldXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHRyYWNlIG9mIHRoZSBtYXRyaXggKHN1bSBvZiB0aGUgZGlhZ29uYWwgZWxlbWVudHMpXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICB0cmFjZSgpIHtcbiAgICAgICAgdmFyIG1pbiA9IE1hdGgubWluKHRoaXMucm93cywgdGhpcy5jb2x1bW5zKTtcbiAgICAgICAgdmFyIHRyYWNlID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtaW47IGkrKykge1xuICAgICAgICAgICAgdHJhY2UgKz0gdGhpc1tpXVtpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJhY2U7XG4gICAgfVxufVxuXG5NYXRyaXgucHJvdG90eXBlLmtsYXNzID0gJ01hdHJpeCc7XG5cbm1vZHVsZS5leHBvcnRzID0gTWF0cml4O1xuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IGEgcm93IGluZGV4IGlzIG5vdCBvdXQgb2YgYm91bmRzXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gaW5kZXhcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW291dGVyXVxuICovXG5mdW5jdGlvbiBjaGVja1Jvd0luZGV4KG1hdHJpeCwgaW5kZXgsIG91dGVyKSB7XG4gICAgdmFyIG1heCA9IG91dGVyID8gbWF0cml4LnJvd3MgOiBtYXRyaXgucm93cyAtIDE7XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG1heClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1JvdyBpbmRleCBvdXQgb2YgcmFuZ2UnKTtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCB0aGUgcHJvdmlkZWQgdmVjdG9yIGlzIGFuIGFycmF5IHdpdGggdGhlIHJpZ2h0IGxlbmd0aFxuICogQHBhcmFtIHtNYXRyaXh9IG1hdHJpeFxuICogQHBhcmFtIHtBcnJheXxNYXRyaXh9IHZlY3RvclxuICogQHBhcmFtIHtib29sZWFufSBjb3B5XG4gKiBAcmV0dXJucyB7QXJyYXl9XG4gKiBAdGhyb3dzIHtSYW5nZUVycm9yfVxuICovXG5mdW5jdGlvbiBjaGVja1Jvd1ZlY3RvcihtYXRyaXgsIHZlY3RvciwgY29weSkge1xuICAgIGlmIChNYXRyaXguaXNNYXRyaXgodmVjdG9yKSkge1xuICAgICAgICB2ZWN0b3IgPSB2ZWN0b3IudG8xREFycmF5KCk7XG4gICAgfSBlbHNlIGlmIChjb3B5KSB7XG4gICAgICAgIHZlY3RvciA9IFtdLmNvbmNhdCh2ZWN0b3IpO1xuICAgIH1cbiAgICBpZiAodmVjdG9yLmxlbmd0aCAhPT0gbWF0cml4LmNvbHVtbnMpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd2ZWN0b3Igc2l6ZSBtdXN0IGJlIHRoZSBzYW1lIGFzIHRoZSBudW1iZXIgb2YgY29sdW1ucycpO1xuICAgIHJldHVybiB2ZWN0b3I7XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIENoZWNrIHRoYXQgdGhlIHByb3ZpZGVkIHZlY3RvciBpcyBhbiBhcnJheSB3aXRoIHRoZSByaWdodCBsZW5ndGhcbiAqIEBwYXJhbSB7TWF0cml4fSBtYXRyaXhcbiAqIEBwYXJhbSB7QXJyYXl8TWF0cml4fSB2ZWN0b3JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY29weVxuICogQHJldHVybnMge0FycmF5fVxuICogQHRocm93cyB7UmFuZ2VFcnJvcn1cbiAqL1xuZnVuY3Rpb24gY2hlY2tDb2x1bW5WZWN0b3IobWF0cml4LCB2ZWN0b3IsIGNvcHkpIHtcbiAgICBpZiAoTWF0cml4LmlzTWF0cml4KHZlY3RvcikpIHtcbiAgICAgICAgdmVjdG9yID0gdmVjdG9yLnRvMURBcnJheSgpO1xuICAgIH0gZWxzZSBpZiAoY29weSkge1xuICAgICAgICB2ZWN0b3IgPSBbXS5jb25jYXQodmVjdG9yKTtcbiAgICB9XG4gICAgaWYgKHZlY3Rvci5sZW5ndGggIT09IG1hdHJpeC5yb3dzKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmVjdG9yIHNpemUgbXVzdCBiZSB0aGUgc2FtZSBhcyB0aGUgbnVtYmVyIG9mIHJvd3MnKTtcbiAgICByZXR1cm4gdmVjdG9yO1xufVxuXG4vKipcbiAqIEBwcml2YXRlXG4gKiBDaGVjayB0aGF0IGEgY29sdW1uIGluZGV4IGlzIG5vdCBvdXQgb2YgYm91bmRzXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge251bWJlcn0gaW5kZXhcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW291dGVyXVxuICovXG5mdW5jdGlvbiBjaGVja0NvbHVtbkluZGV4KG1hdHJpeCwgaW5kZXgsIG91dGVyKSB7XG4gICAgdmFyIG1heCA9IG91dGVyID8gbWF0cml4LmNvbHVtbnMgOiBtYXRyaXguY29sdW1ucyAtIDE7XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG1heClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0NvbHVtbiBpbmRleCBvdXQgb2YgcmFuZ2UnKTtcbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQ2hlY2sgdGhhdCB0d28gbWF0cmljZXMgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zXG4gKiBAcGFyYW0ge01hdHJpeH0gbWF0cml4XG4gKiBAcGFyYW0ge01hdHJpeH0gb3RoZXJNYXRyaXhcbiAqL1xuZnVuY3Rpb24gY2hlY2tEaW1lbnNpb25zKG1hdHJpeCwgb3RoZXJNYXRyaXgpIHtcbiAgICBpZiAobWF0cml4LnJvd3MgIT09IG90aGVyTWF0cml4Lmxlbmd0aCB8fFxuICAgICAgICBtYXRyaXguY29sdW1ucyAhPT0gb3RoZXJNYXRyaXhbMF0ubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdNYXRyaWNlcyBkaW1lbnNpb25zIG11c3QgYmUgZXF1YWwnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVOdW1iZXJzKGEsIGIpIHtcbiAgICByZXR1cm4gYSAtIGI7XG59XG5cbi8qXG5TeW5vbnltc1xuICovXG5cbk1hdHJpeC5yYW5kb20gPSBNYXRyaXgucmFuZDtcbk1hdHJpeC5kaWFnb25hbCA9IE1hdHJpeC5kaWFnO1xuTWF0cml4LnByb3RvdHlwZS5kaWFnb25hbCA9IE1hdHJpeC5wcm90b3R5cGUuZGlhZztcbk1hdHJpeC5pZGVudGl0eSA9IE1hdHJpeC5leWU7XG5NYXRyaXgucHJvdG90eXBlLm5lZ2F0ZSA9IE1hdHJpeC5wcm90b3R5cGUubmVnO1xuXG4vKlxuQWRkIGR5bmFtaWNhbGx5IGluc3RhbmNlIGFuZCBzdGF0aWMgbWV0aG9kcyBmb3IgbWF0aGVtYXRpY2FsIG9wZXJhdGlvbnNcbiAqL1xuXG52YXIgaW5wbGFjZU9wZXJhdG9yID0gYFxuKGZ1bmN0aW9uICVuYW1lJSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gdGhpcy4lbmFtZSVTKHZhbHVlKTtcbiAgICByZXR1cm4gdGhpcy4lbmFtZSVNKHZhbHVlKTtcbn0pXG5gO1xuXG52YXIgaW5wbGFjZU9wZXJhdG9yU2NhbGFyID0gYFxuKGZ1bmN0aW9uICVuYW1lJVModmFsdWUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5jb2x1bW5zOyBqKyspIHtcbiAgICAgICAgICAgIHRoaXNbaV1bal0gPSB0aGlzW2ldW2pdICVvcCUgdmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59KVxuYDtcblxudmFyIGlucGxhY2VPcGVyYXRvck1hdHJpeCA9IGBcbihmdW5jdGlvbiAlbmFtZSVNKG1hdHJpeCkge1xuICAgIGNoZWNrRGltZW5zaW9ucyh0aGlzLCBtYXRyaXgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgdGhpc1tpXVtqXSA9IHRoaXNbaV1bal0gJW9wJSBtYXRyaXhbaV1bal07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59KVxuYDtcblxudmFyIHN0YXRpY09wZXJhdG9yID0gYFxuKGZ1bmN0aW9uICVuYW1lJShtYXRyaXgsIHZhbHVlKSB7XG4gICAgdmFyIG5ld01hdHJpeCA9IG5ldyBNYXRyaXgobWF0cml4KTtcbiAgICByZXR1cm4gbmV3TWF0cml4LiVuYW1lJSh2YWx1ZSk7XG59KVxuYDtcblxudmFyIGlucGxhY2VNZXRob2QgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yb3dzOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmNvbHVtbnM7IGorKykge1xuICAgICAgICAgICAgdGhpc1tpXVtqXSA9ICVtZXRob2QlKHRoaXNbaV1bal0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufSlcbmA7XG5cbnZhciBzdGF0aWNNZXRob2QgPSBgXG4oZnVuY3Rpb24gJW5hbWUlKG1hdHJpeCkge1xuICAgIHZhciBuZXdNYXRyaXggPSBuZXcgTWF0cml4KG1hdHJpeCk7XG4gICAgcmV0dXJuIG5ld01hdHJpeC4lbmFtZSUoKTtcbn0pXG5gO1xuXG52YXIgb3BlcmF0b3JzID0gW1xuICAgIC8vIEFyaXRobWV0aWMgb3BlcmF0b3JzXG4gICAgWycrJywgJ2FkZCddLFxuICAgIFsnLScsICdzdWInLCAnc3VidHJhY3QnXSxcbiAgICBbJyonLCAnbXVsJywgJ211bHRpcGx5J10sXG4gICAgWycvJywgJ2RpdicsICdkaXZpZGUnXSxcbiAgICBbJyUnLCAnbW9kJywgJ21vZHVsdXMnXSxcbiAgICAvLyBCaXR3aXNlIG9wZXJhdG9yc1xuICAgIFsnJicsICdhbmQnXSxcbiAgICBbJ3wnLCAnb3InXSxcbiAgICBbJ14nLCAneG9yJ10sXG4gICAgWyc8PCcsICdsZWZ0U2hpZnQnXSxcbiAgICBbJz4+JywgJ3NpZ25Qcm9wYWdhdGluZ1JpZ2h0U2hpZnQnXSxcbiAgICBbJz4+PicsICdyaWdodFNoaWZ0JywgJ3plcm9GaWxsUmlnaHRTaGlmdCddXG5dO1xuXG5mb3IgKHZhciBvcGVyYXRvciBvZiBvcGVyYXRvcnMpIHtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IG9wZXJhdG9yLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbb3BlcmF0b3JbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihpbnBsYWNlT3BlcmF0b3IsIHtuYW1lOiBvcGVyYXRvcltpXSwgb3A6IG9wZXJhdG9yWzBdfSkpO1xuICAgICAgICBNYXRyaXgucHJvdG90eXBlW29wZXJhdG9yW2ldICsgJ1MnXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU9wZXJhdG9yU2NhbGFyLCB7bmFtZTogb3BlcmF0b3JbaV0gKyAnUycsIG9wOiBvcGVyYXRvclswXX0pKTtcbiAgICAgICAgTWF0cml4LnByb3RvdHlwZVtvcGVyYXRvcltpXSArICdNJ10gPSBldmFsKGZpbGxUZW1wbGF0ZUZ1bmN0aW9uKGlucGxhY2VPcGVyYXRvck1hdHJpeCwge25hbWU6IG9wZXJhdG9yW2ldICsgJ00nLCBvcDogb3BlcmF0b3JbMF19KSk7XG5cbiAgICAgICAgTWF0cml4W29wZXJhdG9yW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oc3RhdGljT3BlcmF0b3IsIHtuYW1lOiBvcGVyYXRvcltpXX0pKTtcbiAgICB9XG59XG5cbnZhciBtZXRob2RzID0gW1xuICAgIFsnficsICdub3QnXVxuXTtcblxuW1xuICAgICdhYnMnLCAnYWNvcycsICdhY29zaCcsICdhc2luJywgJ2FzaW5oJywgJ2F0YW4nLCAnYXRhbmgnLCAnY2JydCcsICdjZWlsJyxcbiAgICAnY2x6MzInLCAnY29zJywgJ2Nvc2gnLCAnZXhwJywgJ2V4cG0xJywgJ2Zsb29yJywgJ2Zyb3VuZCcsICdsb2cnLCAnbG9nMXAnLFxuICAgICdsb2cxMCcsICdsb2cyJywgJ3JvdW5kJywgJ3NpZ24nLCAnc2luJywgJ3NpbmgnLCAnc3FydCcsICd0YW4nLCAndGFuaCcsICd0cnVuYydcbl0uZm9yRWFjaChmdW5jdGlvbiAobWF0aE1ldGhvZCkge1xuICAgIG1ldGhvZHMucHVzaChbJ01hdGguJyArIG1hdGhNZXRob2QsIG1hdGhNZXRob2RdKTtcbn0pO1xuXG5mb3IgKHZhciBtZXRob2Qgb2YgbWV0aG9kcykge1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbWV0aG9kLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIE1hdHJpeC5wcm90b3R5cGVbbWV0aG9kW2ldXSA9IGV2YWwoZmlsbFRlbXBsYXRlRnVuY3Rpb24oaW5wbGFjZU1ldGhvZCwge25hbWU6IG1ldGhvZFtpXSwgbWV0aG9kOiBtZXRob2RbMF19KSk7XG4gICAgICAgIE1hdHJpeFttZXRob2RbaV1dID0gZXZhbChmaWxsVGVtcGxhdGVGdW5jdGlvbihzdGF0aWNNZXRob2QsIHtuYW1lOiBtZXRob2RbaV19KSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmaWxsVGVtcGxhdGVGdW5jdGlvbih0ZW1wbGF0ZSwgdmFsdWVzKSB7XG4gICAgZm9yICh2YXIgaSBpbiB2YWx1ZXMpIHtcbiAgICAgICAgdGVtcGxhdGUgPSB0ZW1wbGF0ZS5yZXBsYWNlKG5ldyBSZWdFeHAoJyUnICsgaSArICclJywgJ2cnKSwgdmFsdWVzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHRlbXBsYXRlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBjb21wYXJlTnVtYmVycyhhLCBiKSB7XG4gICAgcmV0dXJuIGEgLSBiO1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBzdW0gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnN1bSA9IGZ1bmN0aW9uIHN1bSh2YWx1ZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzdW0gKz0gdmFsdWVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWF4aW11bSBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubWF4ID0gZnVuY3Rpb24gbWF4KHZhbHVlcykge1xuICAgIHZhciBtYXggPSAtSW5maW5pdHk7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPiBtYXgpIG1heCA9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIG1heDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbmltdW0gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLm1pbiA9IGZ1bmN0aW9uIG1pbih2YWx1ZXMpIHtcbiAgICB2YXIgbWluID0gSW5maW5pdHk7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbaV0gPCBtaW4pIG1pbiA9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIG1pbjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1pbiBhbmQgbWF4IG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge3ttaW46IG51bWJlciwgbWF4OiBudW1iZXJ9fVxuICovXG5leHBvcnRzLm1pbk1heCA9IGZ1bmN0aW9uIG1pbk1heCh2YWx1ZXMpIHtcbiAgICB2YXIgbWluID0gSW5maW5pdHk7XG4gICAgdmFyIG1heCA9IC1JbmZpbml0eTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA8IG1pbikgbWluID0gdmFsdWVzW2ldO1xuICAgICAgICBpZiAodmFsdWVzW2ldID4gbWF4KSBtYXggPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG1pbjogbWluLFxuICAgICAgICBtYXg6IG1heFxuICAgIH07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBhcml0aG1ldGljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmFyaXRobWV0aWNNZWFuID0gZnVuY3Rpb24gYXJpdGhtZXRpY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIHN1bSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyBsO1xufTtcblxuLyoqXG4gKiB7QGxpbmsgYXJpdGhtZXRpY01lYW59XG4gKi9cbmV4cG9ydHMubWVhbiA9IGV4cG9ydHMuYXJpdGhtZXRpY01lYW47XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGdlb21ldHJpYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5nZW9tZXRyaWNNZWFuID0gZnVuY3Rpb24gZ2VvbWV0cmljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgbXVsID0gMTtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbXVsICo9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIE1hdGgucG93KG11bCwgMSAvIGwpO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbWVhbiBvZiB0aGUgbG9nIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIElmIHRoZSByZXR1cm4gdmFsdWUgaXMgZXhwb25lbnRpYXRlZCwgaXQgZ2l2ZXMgdGhlIHNhbWUgcmVzdWx0IGFzIHRoZVxuICogZ2VvbWV0cmljIG1lYW4uXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMubG9nTWVhbiA9IGZ1bmN0aW9uIGxvZ01lYW4odmFsdWVzKSB7XG4gICAgdmFyIGxuc3VtID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbG5zdW0gKz0gTWF0aC5sb2codmFsdWVzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGxuc3VtIC8gbDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHdlaWdodGVkIGdyYW5kIG1lYW4gZm9yIGEgbGlzdCBvZiBtZWFucyBhbmQgc2FtcGxlIHNpemVzXG4gKiBAcGFyYW0ge0FycmF5fSBtZWFucyAtIE1lYW4gdmFsdWVzIGZvciBlYWNoIHNldCBvZiBzYW1wbGVzXG4gKiBAcGFyYW0ge0FycmF5fSBzYW1wbGVzIC0gTnVtYmVyIG9mIG9yaWdpbmFsIHZhbHVlcyBmb3IgZWFjaCBzZXQgb2Ygc2FtcGxlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5ncmFuZE1lYW4gPSBmdW5jdGlvbiBncmFuZE1lYW4obWVhbnMsIHNhbXBsZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbiA9IDA7XG4gICAgdmFyIGwgPSBtZWFucy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgc3VtICs9IHNhbXBsZXNbaV0gKiBtZWFuc1tpXTtcbiAgICAgICAgbiArPSBzYW1wbGVzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gbjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHRydW5jYXRlZCBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXMgdXNpbmcgYSBnaXZlbiBwZXJjZW50YWdlXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7bnVtYmVyfSBwZXJjZW50IC0gVGhlIHBlcmNlbnRhZ2Ugb2YgdmFsdWVzIHRvIGtlZXAgKHJhbmdlOiBbMCwxXSlcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FscmVhZHlTb3J0ZWQ9ZmFsc2VdXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnRydW5jYXRlZE1lYW4gPSBmdW5jdGlvbiB0cnVuY2F0ZWRNZWFuKHZhbHVlcywgcGVyY2VudCwgYWxyZWFkeVNvcnRlZCkge1xuICAgIGlmIChhbHJlYWR5U29ydGVkID09PSB1bmRlZmluZWQpIGFscmVhZHlTb3J0ZWQgPSBmYWxzZTtcbiAgICBpZiAoIWFscmVhZHlTb3J0ZWQpIHtcbiAgICAgICAgdmFsdWVzID0gdmFsdWVzLnNsaWNlKCkuc29ydChjb21wYXJlTnVtYmVycyk7XG4gICAgfVxuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgayA9IE1hdGguZmxvb3IobCAqIHBlcmNlbnQpO1xuICAgIHZhciBzdW0gPSAwO1xuICAgIGZvciAodmFyIGkgPSBrOyBpIDwgKGwgLSBrKTsgaSsrKSB7XG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV07XG4gICAgfVxuICAgIHJldHVybiBzdW0gLyAobCAtIDIgKiBrKTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGhhcm1vbmljIG1lYW4gb2YgdGhlIGdpdmVuIHZhbHVlc1xuICogQHBhcmFtIHtBcnJheX0gdmFsdWVzXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLmhhcm1vbmljTWVhbiA9IGZ1bmN0aW9uIGhhcm1vbmljTWVhbih2YWx1ZXMpIHtcbiAgICB2YXIgc3VtID0gMDtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbHVlc1tpXSA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZhbHVlIGF0IGluZGV4ICcgKyBpICsgJ2lzIHplcm8nKTtcbiAgICAgICAgfVxuICAgICAgICBzdW0gKz0gMSAvIHZhbHVlc1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIGwgLyBzdW07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBjb250cmFoYXJtb25pYyBtZWFuIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0cy5jb250cmFIYXJtb25pY01lYW4gPSBmdW5jdGlvbiBjb250cmFIYXJtb25pY01lYW4odmFsdWVzKSB7XG4gICAgdmFyIHIxID0gMDtcbiAgICB2YXIgcjIgPSAwO1xuICAgIHZhciBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICByMSArPSB2YWx1ZXNbaV0gKiB2YWx1ZXNbaV07XG4gICAgICAgIHIyICs9IHZhbHVlc1tpXTtcbiAgICB9XG4gICAgaWYgKHIyIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc3VtIG9mIHZhbHVlcyBpcyBuZWdhdGl2ZScpO1xuICAgIH1cbiAgICByZXR1cm4gcjEgLyByMjtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1lZGlhbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FscmVhZHlTb3J0ZWQ9ZmFsc2VdXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLm1lZGlhbiA9IGZ1bmN0aW9uIG1lZGlhbih2YWx1ZXMsIGFscmVhZHlTb3J0ZWQpIHtcbiAgICBpZiAoYWxyZWFkeVNvcnRlZCA9PT0gdW5kZWZpbmVkKSBhbHJlYWR5U29ydGVkID0gZmFsc2U7XG4gICAgaWYgKCFhbHJlYWR5U29ydGVkKSB7XG4gICAgICAgIHZhbHVlcyA9IHZhbHVlcy5zbGljZSgpLnNvcnQoY29tcGFyZU51bWJlcnMpO1xuICAgIH1cbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgdmFyIGhhbGYgPSBNYXRoLmZsb29yKGwgLyAyKTtcbiAgICBpZiAobCAlIDIgPT09IDApIHtcbiAgICAgICAgcmV0dXJuICh2YWx1ZXNbaGFsZiAtIDFdICsgdmFsdWVzW2hhbGZdKSAqIDAuNTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdmFsdWVzW2hhbGZdO1xuICAgIH1cbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHZhcmlhbmNlIG9mIHRoZSBnaXZlbiB2YWx1ZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlc1xuICogQHBhcmFtIHtib29sZWFufSBbdW5iaWFzZWQ9dHJ1ZV0gLSBpZiB0cnVlLCBkaXZpZGUgYnkgKG4tMSk7IGlmIGZhbHNlLCBkaXZpZGUgYnkgbi5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydHMudmFyaWFuY2UgPSBmdW5jdGlvbiB2YXJpYW5jZSh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHVuYmlhc2VkID09PSB1bmRlZmluZWQpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMubWVhbih2YWx1ZXMpO1xuICAgIHZhciB0aGVWYXJpYW5jZSA9IDA7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHggPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICB0aGVWYXJpYW5jZSArPSB4ICogeDtcbiAgICB9XG5cbiAgICBpZiAodW5iaWFzZWQpIHtcbiAgICAgICAgcmV0dXJuIHRoZVZhcmlhbmNlIC8gKGwgLSAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhlVmFyaWFuY2UgLyBsO1xuICAgIH1cbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHN0YW5kYXJkIGRldmlhdGlvbiBvZiB0aGUgZ2l2ZW4gdmFsdWVzXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZXNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3VuYmlhc2VkPXRydWVdIC0gaWYgdHJ1ZSwgZGl2aWRlIGJ5IChuLTEpOyBpZiBmYWxzZSwgZGl2aWRlIGJ5IG4uXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnRzLnN0YW5kYXJkRGV2aWF0aW9uID0gZnVuY3Rpb24gc3RhbmRhcmREZXZpYXRpb24odmFsdWVzLCB1bmJpYXNlZCkge1xuICAgIHJldHVybiBNYXRoLnNxcnQoZXhwb3J0cy52YXJpYW5jZSh2YWx1ZXMsIHVuYmlhc2VkKSk7XG59O1xuXG5leHBvcnRzLnN0YW5kYXJkRXJyb3IgPSBmdW5jdGlvbiBzdGFuZGFyZEVycm9yKHZhbHVlcykge1xuICAgIHJldHVybiBleHBvcnRzLnN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcykgLyBNYXRoLnNxcnQodmFsdWVzLmxlbmd0aCk7XG59O1xuXG5leHBvcnRzLnF1YXJ0aWxlcyA9IGZ1bmN0aW9uIHF1YXJ0aWxlcyh2YWx1ZXMsIGFscmVhZHlTb3J0ZWQpIHtcbiAgICBpZiAodHlwZW9mKGFscmVhZHlTb3J0ZWQpID09PSAndW5kZWZpbmVkJykgYWxyZWFkeVNvcnRlZCA9IGZhbHNlO1xuICAgIGlmICghYWxyZWFkeVNvcnRlZCkge1xuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKTtcbiAgICAgICAgdmFsdWVzLnNvcnQoY29tcGFyZU51bWJlcnMpO1xuICAgIH1cblxuICAgIHZhciBxdWFydCA9IHZhbHVlcy5sZW5ndGggLyA0O1xuICAgIHZhciBxMSA9IHZhbHVlc1tNYXRoLmNlaWwocXVhcnQpIC0gMV07XG4gICAgdmFyIHEyID0gZXhwb3J0cy5tZWRpYW4odmFsdWVzLCB0cnVlKTtcbiAgICB2YXIgcTMgPSB2YWx1ZXNbTWF0aC5jZWlsKHF1YXJ0ICogMykgLSAxXTtcblxuICAgIHJldHVybiB7cTE6IHExLCBxMjogcTIsIHEzOiBxM307XG59O1xuXG5leHBvcnRzLnBvb2xlZFN0YW5kYXJkRGV2aWF0aW9uID0gZnVuY3Rpb24gcG9vbGVkU3RhbmRhcmREZXZpYXRpb24oc2FtcGxlcywgdW5iaWFzZWQpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KGV4cG9ydHMucG9vbGVkVmFyaWFuY2Uoc2FtcGxlcywgdW5iaWFzZWQpKTtcbn07XG5cbmV4cG9ydHMucG9vbGVkVmFyaWFuY2UgPSBmdW5jdGlvbiBwb29sZWRWYXJpYW5jZShzYW1wbGVzLCB1bmJpYXNlZCkge1xuICAgIGlmICh0eXBlb2YodW5iaWFzZWQpID09PSAndW5kZWZpbmVkJykgdW5iaWFzZWQgPSB0cnVlO1xuICAgIHZhciBzdW0gPSAwO1xuICAgIHZhciBsZW5ndGggPSAwLCBsID0gc2FtcGxlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHZhbHVlcyA9IHNhbXBsZXNbaV07XG4gICAgICAgIHZhciB2YXJpID0gZXhwb3J0cy52YXJpYW5jZSh2YWx1ZXMpO1xuXG4gICAgICAgIHN1bSArPSAodmFsdWVzLmxlbmd0aCAtIDEpICogdmFyaTtcblxuICAgICAgICBpZiAodW5iaWFzZWQpXG4gICAgICAgICAgICBsZW5ndGggKz0gdmFsdWVzLmxlbmd0aCAtIDE7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGxlbmd0aCArPSB2YWx1ZXMubGVuZ3RoO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gbGVuZ3RoO1xufTtcblxuZXhwb3J0cy5tb2RlID0gZnVuY3Rpb24gbW9kZSh2YWx1ZXMpIHtcbiAgICB2YXIgbCA9IHZhbHVlcy5sZW5ndGgsXG4gICAgICAgIGl0ZW1Db3VudCA9IG5ldyBBcnJheShsKSxcbiAgICAgICAgaTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGl0ZW1Db3VudFtpXSA9IDA7XG4gICAgfVxuICAgIHZhciBpdGVtQXJyYXkgPSBuZXcgQXJyYXkobCk7XG4gICAgdmFyIGNvdW50ID0gMDtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGluZGV4ID0gaXRlbUFycmF5LmluZGV4T2YodmFsdWVzW2ldKTtcbiAgICAgICAgaWYgKGluZGV4ID49IDApXG4gICAgICAgICAgICBpdGVtQ291bnRbaW5kZXhdKys7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaXRlbUFycmF5W2NvdW50XSA9IHZhbHVlc1tpXTtcbiAgICAgICAgICAgIGl0ZW1Db3VudFtjb3VudF0gPSAxO1xuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBtYXhWYWx1ZSA9IDAsIG1heEluZGV4ID0gMDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICBpZiAoaXRlbUNvdW50W2ldID4gbWF4VmFsdWUpIHtcbiAgICAgICAgICAgIG1heFZhbHVlID0gaXRlbUNvdW50W2ldO1xuICAgICAgICAgICAgbWF4SW5kZXggPSBpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGl0ZW1BcnJheVttYXhJbmRleF07XG59O1xuXG5leHBvcnRzLmNvdmFyaWFuY2UgPSBmdW5jdGlvbiBjb3ZhcmlhbmNlKHZlY3RvcjEsIHZlY3RvcjIsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIG1lYW4xID0gZXhwb3J0cy5tZWFuKHZlY3RvcjEpO1xuICAgIHZhciBtZWFuMiA9IGV4cG9ydHMubWVhbih2ZWN0b3IyKTtcblxuICAgIGlmICh2ZWN0b3IxLmxlbmd0aCAhPT0gdmVjdG9yMi5sZW5ndGgpXG4gICAgICAgIHRocm93IFwiVmVjdG9ycyBkbyBub3QgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zXCI7XG5cbiAgICB2YXIgY292ID0gMCwgbCA9IHZlY3RvcjEubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciB4ID0gdmVjdG9yMVtpXSAtIG1lYW4xO1xuICAgICAgICB2YXIgeSA9IHZlY3RvcjJbaV0gLSBtZWFuMjtcbiAgICAgICAgY292ICs9IHggKiB5O1xuICAgIH1cblxuICAgIGlmICh1bmJpYXNlZClcbiAgICAgICAgcmV0dXJuIGNvdiAvIChsIC0gMSk7XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gY292IC8gbDtcbn07XG5cbmV4cG9ydHMuc2tld25lc3MgPSBmdW5jdGlvbiBza2V3bmVzcyh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4odmFsdWVzKTtcblxuICAgIHZhciBzMiA9IDAsIHMzID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGRldiA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgczMgKz0gZGV2ICogZGV2ICogZGV2O1xuICAgIH1cbiAgICB2YXIgbTIgPSBzMiAvIGw7XG4gICAgdmFyIG0zID0gczMgLyBsO1xuXG4gICAgdmFyIGcgPSBtMyAvIChNYXRoLnBvdyhtMiwgMyAvIDIuMCkpO1xuICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICB2YXIgYSA9IE1hdGguc3FydChsICogKGwgLSAxKSk7XG4gICAgICAgIHZhciBiID0gbCAtIDI7XG4gICAgICAgIHJldHVybiAoYSAvIGIpICogZztcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBnO1xuICAgIH1cbn07XG5cbmV4cG9ydHMua3VydG9zaXMgPSBmdW5jdGlvbiBrdXJ0b3Npcyh2YWx1ZXMsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4odmFsdWVzKTtcbiAgICB2YXIgbiA9IHZhbHVlcy5sZW5ndGgsIHMyID0gMCwgczQgPSAwO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGRldiA9IHZhbHVlc1tpXSAtIHRoZU1lYW47XG4gICAgICAgIHMyICs9IGRldiAqIGRldjtcbiAgICAgICAgczQgKz0gZGV2ICogZGV2ICogZGV2ICogZGV2O1xuICAgIH1cbiAgICB2YXIgbTIgPSBzMiAvIG47XG4gICAgdmFyIG00ID0gczQgLyBuO1xuXG4gICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgIHZhciB2ID0gczIgLyAobiAtIDEpO1xuICAgICAgICB2YXIgYSA9IChuICogKG4gKyAxKSkgLyAoKG4gLSAxKSAqIChuIC0gMikgKiAobiAtIDMpKTtcbiAgICAgICAgdmFyIGIgPSBzNCAvICh2ICogdik7XG4gICAgICAgIHZhciBjID0gKChuIC0gMSkgKiAobiAtIDEpKSAvICgobiAtIDIpICogKG4gLSAzKSk7XG5cbiAgICAgICAgcmV0dXJuIGEgKiBiIC0gMyAqIGM7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gbTQgLyAobTIgKiBtMikgLSAzO1xuICAgIH1cbn07XG5cbmV4cG9ydHMuZW50cm9weSA9IGZ1bmN0aW9uIGVudHJvcHkodmFsdWVzLCBlcHMpIHtcbiAgICBpZiAodHlwZW9mKGVwcykgPT09ICd1bmRlZmluZWQnKSBlcHMgPSAwO1xuICAgIHZhciBzdW0gPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKylcbiAgICAgICAgc3VtICs9IHZhbHVlc1tpXSAqIE1hdGgubG9nKHZhbHVlc1tpXSArIGVwcyk7XG4gICAgcmV0dXJuIC1zdW07XG59O1xuXG5leHBvcnRzLndlaWdodGVkTWVhbiA9IGZ1bmN0aW9uIHdlaWdodGVkTWVhbih2YWx1ZXMsIHdlaWdodHMpIHtcbiAgICB2YXIgc3VtID0gMCwgbCA9IHZhbHVlcy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHN1bSArPSB2YWx1ZXNbaV0gKiB3ZWlnaHRzW2ldO1xuICAgIHJldHVybiBzdW07XG59O1xuXG5leHBvcnRzLndlaWdodGVkU3RhbmRhcmREZXZpYXRpb24gPSBmdW5jdGlvbiB3ZWlnaHRlZFN0YW5kYXJkRGV2aWF0aW9uKHZhbHVlcywgd2VpZ2h0cykge1xuICAgIHJldHVybiBNYXRoLnNxcnQoZXhwb3J0cy53ZWlnaHRlZFZhcmlhbmNlKHZhbHVlcywgd2VpZ2h0cykpO1xufTtcblxuZXhwb3J0cy53ZWlnaHRlZFZhcmlhbmNlID0gZnVuY3Rpb24gd2VpZ2h0ZWRWYXJpYW5jZSh2YWx1ZXMsIHdlaWdodHMpIHtcbiAgICB2YXIgdGhlTWVhbiA9IGV4cG9ydHMud2VpZ2h0ZWRNZWFuKHZhbHVlcywgd2VpZ2h0cyk7XG4gICAgdmFyIHZhcmkgPSAwLCBsID0gdmFsdWVzLmxlbmd0aDtcbiAgICB2YXIgYSA9IDAsIGIgPSAwO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHogPSB2YWx1ZXNbaV0gLSB0aGVNZWFuO1xuICAgICAgICB2YXIgdyA9IHdlaWdodHNbaV07XG5cbiAgICAgICAgdmFyaSArPSB3ICogKHogKiB6KTtcbiAgICAgICAgYiArPSB3O1xuICAgICAgICBhICs9IHcgKiB3O1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpICogKGIgLyAoYiAqIGIgLSBhKSk7XG59O1xuXG5leHBvcnRzLmNlbnRlciA9IGZ1bmN0aW9uIGNlbnRlcih2YWx1ZXMsIGluUGxhY2UpIHtcbiAgICBpZiAodHlwZW9mKGluUGxhY2UpID09PSAndW5kZWZpbmVkJykgaW5QbGFjZSA9IGZhbHNlO1xuXG4gICAgdmFyIHJlc3VsdCA9IHZhbHVlcztcbiAgICBpZiAoIWluUGxhY2UpXG4gICAgICAgIHJlc3VsdCA9IHZhbHVlcy5zbGljZSgpO1xuXG4gICAgdmFyIHRoZU1lYW4gPSBleHBvcnRzLm1lYW4ocmVzdWx0KSwgbCA9IHJlc3VsdC5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspXG4gICAgICAgIHJlc3VsdFtpXSAtPSB0aGVNZWFuO1xufTtcblxuZXhwb3J0cy5zdGFuZGFyZGl6ZSA9IGZ1bmN0aW9uIHN0YW5kYXJkaXplKHZhbHVlcywgc3RhbmRhcmREZXYsIGluUGxhY2UpIHtcbiAgICBpZiAodHlwZW9mKHN0YW5kYXJkRGV2KSA9PT0gJ3VuZGVmaW5lZCcpIHN0YW5kYXJkRGV2ID0gZXhwb3J0cy5zdGFuZGFyZERldmlhdGlvbih2YWx1ZXMpO1xuICAgIGlmICh0eXBlb2YoaW5QbGFjZSkgPT09ICd1bmRlZmluZWQnKSBpblBsYWNlID0gZmFsc2U7XG4gICAgdmFyIGwgPSB2YWx1ZXMubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSBpblBsYWNlID8gdmFsdWVzIDogbmV3IEFycmF5KGwpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKVxuICAgICAgICByZXN1bHRbaV0gPSB2YWx1ZXNbaV0gLyBzdGFuZGFyZERldjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuZXhwb3J0cy5jdW11bGF0aXZlU3VtID0gZnVuY3Rpb24gY3VtdWxhdGl2ZVN1bShhcnJheSkge1xuICAgIHZhciBsID0gYXJyYXkubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobCk7XG4gICAgcmVzdWx0WzBdID0gYXJyYXlbMF07XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBsOyBpKyspXG4gICAgICAgIHJlc3VsdFtpXSA9IHJlc3VsdFtpIC0gMV0gKyBhcnJheVtpXTtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5hcnJheSA9IHJlcXVpcmUoJy4vYXJyYXknKTtcbmV4cG9ydHMubWF0cml4ID0gcmVxdWlyZSgnLi9tYXRyaXgnKTtcbiIsIid1c2Ugc3RyaWN0JztcbnZhciBhcnJheVN0YXQgPSByZXF1aXJlKCcuL2FycmF5Jyk7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hY2NvcmQtbmV0L2ZyYW1ld29yay9ibG9iL2RldmVsb3BtZW50L1NvdXJjZXMvQWNjb3JkLlN0YXRpc3RpY3MvVG9vbHMuY3NcblxuZnVuY3Rpb24gZW50cm9weShtYXRyaXgsIGVwcykge1xuICAgIGlmICh0eXBlb2YoZXBzKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZXBzID0gMDtcbiAgICB9XG4gICAgdmFyIHN1bSA9IDAsXG4gICAgICAgIGwxID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgbDIgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDE7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGwyOyBqKyspIHtcbiAgICAgICAgICAgIHN1bSArPSBtYXRyaXhbaV1bal0gKiBNYXRoLmxvZyhtYXRyaXhbaV1bal0gKyBlcHMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtc3VtO1xufVxuXG5mdW5jdGlvbiBtZWFuKG1hdHJpeCwgZGltZW5zaW9uKSB7XG4gICAgaWYgKHR5cGVvZihkaW1lbnNpb24pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkaW1lbnNpb24gPSAwO1xuICAgIH1cbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoLFxuICAgICAgICB0aGVNZWFuLCBOLCBpLCBqO1xuXG4gICAgaWYgKGRpbWVuc2lvbiA9PT0gLTEpIHtcbiAgICAgICAgdGhlTWVhbiA9IFswXTtcbiAgICAgICAgTiA9IHJvd3MgKiBjb2xzO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhlTWVhblswXSArPSBtYXRyaXhbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhlTWVhblswXSAvPSBOO1xuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIHRoZU1lYW4gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIE4gPSByb3dzO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICB0aGVNZWFuW2pdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGVNZWFuW2pdICs9IG1hdHJpeFtpXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZU1lYW5bal0gLz0gTjtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIHRoZU1lYW4gPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIE4gPSBjb2xzO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICB0aGVNZWFuW2pdID0gMDtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGVNZWFuW2pdICs9IG1hdHJpeFtqXVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZU1lYW5bal0gLz0gTjtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoZU1lYW47XG59XG5cbmZ1bmN0aW9uIHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCwgbWVhbnMsIHVuYmlhc2VkKSB7XG4gICAgdmFyIHZhcmkgPSB2YXJpYW5jZShtYXRyaXgsIG1lYW5zLCB1bmJpYXNlZCksIGwgPSB2YXJpLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXJpW2ldID0gTWF0aC5zcXJ0KHZhcmlbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gdmFyaTtcbn1cblxuZnVuY3Rpb24gdmFyaWFuY2UobWF0cml4LCBtZWFucywgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdW5iaWFzZWQgPSB0cnVlO1xuICAgIH1cbiAgICBtZWFucyA9IG1lYW5zIHx8IG1lYW4obWF0cml4KTtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGg7XG4gICAgaWYgKHJvd3MgPT09IDApIHJldHVybiBbXTtcbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIHZhcmkgPSBuZXcgQXJyYXkoY29scyk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICB2YXIgc3VtMSA9IDAsIHN1bTIgPSAwLCB4ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIHggPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgICAgIHN1bTEgKz0geDtcbiAgICAgICAgICAgIHN1bTIgKz0geCAqIHg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgICAgICB2YXJpW2pdID0gKHN1bTIgLSAoKHN1bTEgKiBzdW0xKSAvIHJvd3MpKSAvIChyb3dzIC0gMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXJpW2pdID0gKHN1bTIgLSAoKHN1bTEgKiBzdW0xKSAvIHJvd3MpKSAvIHJvd3M7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhcmk7XG59XG5cbmZ1bmN0aW9uIG1lZGlhbihtYXRyaXgpIHtcbiAgICB2YXIgcm93cyA9IG1hdHJpeC5sZW5ndGgsIGNvbHMgPSBtYXRyaXhbMF0ubGVuZ3RoO1xuICAgIHZhciBtZWRpYW5zID0gbmV3IEFycmF5KGNvbHMpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgdmFyIGRhdGEgPSBuZXcgQXJyYXkocm93cyk7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcm93czsgaisrKSB7XG4gICAgICAgICAgICBkYXRhW2pdID0gbWF0cml4W2pdW2ldO1xuICAgICAgICB9XG4gICAgICAgIGRhdGEuc29ydCgpO1xuICAgICAgICB2YXIgTiA9IGRhdGEubGVuZ3RoO1xuICAgICAgICBpZiAoTiAlIDIgPT09IDApIHtcbiAgICAgICAgICAgIG1lZGlhbnNbaV0gPSAoZGF0YVtOIC8gMl0gKyBkYXRhWyhOIC8gMikgLSAxXSkgKiAwLjU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtZWRpYW5zW2ldID0gZGF0YVtNYXRoLmZsb29yKE4gLyAyKV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1lZGlhbnM7XG59XG5cbmZ1bmN0aW9uIG1vZGUobWF0cml4KSB7XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoLFxuICAgICAgICBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgbW9kZXMgPSBuZXcgQXJyYXkoY29scyksXG4gICAgICAgIGksIGo7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICB2YXIgaXRlbUNvdW50ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IHJvd3M7IGsrKykge1xuICAgICAgICAgICAgaXRlbUNvdW50W2tdID0gMDtcbiAgICAgICAgfVxuICAgICAgICB2YXIgaXRlbUFycmF5ID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB2YXIgY291bnQgPSAwO1xuXG4gICAgICAgIGZvciAoaiA9IDA7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IGl0ZW1BcnJheS5pbmRleE9mKG1hdHJpeFtqXVtpXSk7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIGl0ZW1Db3VudFtpbmRleF0rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaXRlbUFycmF5W2NvdW50XSA9IG1hdHJpeFtqXVtpXTtcbiAgICAgICAgICAgICAgICBpdGVtQ291bnRbY291bnRdID0gMTtcbiAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFZhbHVlID0gMCwgbWF4SW5kZXggPSAwO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgY291bnQ7IGorKykge1xuICAgICAgICAgICAgaWYgKGl0ZW1Db3VudFtqXSA+IG1heFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgbWF4VmFsdWUgPSBpdGVtQ291bnRbal07XG4gICAgICAgICAgICAgICAgbWF4SW5kZXggPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW9kZXNbaV0gPSBpdGVtQXJyYXlbbWF4SW5kZXhdO1xuICAgIH1cbiAgICByZXR1cm4gbW9kZXM7XG59XG5cbmZ1bmN0aW9uIHNrZXduZXNzKG1hdHJpeCwgdW5iaWFzZWQpIHtcbiAgICBpZiAodHlwZW9mKHVuYmlhc2VkKSA9PT0gJ3VuZGVmaW5lZCcpIHVuYmlhc2VkID0gdHJ1ZTtcbiAgICB2YXIgbWVhbnMgPSBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIG4gPSBtYXRyaXgubGVuZ3RoLCBsID0gbWVhbnMubGVuZ3RoO1xuICAgIHZhciBza2V3ID0gbmV3IEFycmF5KGwpO1xuXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBsOyBqKyspIHtcbiAgICAgICAgdmFyIHMyID0gMCwgczMgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgdmFyIGRldiA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgczIgKz0gZGV2ICogZGV2O1xuICAgICAgICAgICAgczMgKz0gZGV2ICogZGV2ICogZGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG0yID0gczIgLyBuO1xuICAgICAgICB2YXIgbTMgPSBzMyAvIG47XG4gICAgICAgIHZhciBnID0gbTMgLyBNYXRoLnBvdyhtMiwgMyAvIDIpO1xuXG4gICAgICAgIGlmICh1bmJpYXNlZCkge1xuICAgICAgICAgICAgdmFyIGEgPSBNYXRoLnNxcnQobiAqIChuIC0gMSkpO1xuICAgICAgICAgICAgdmFyIGIgPSBuIC0gMjtcbiAgICAgICAgICAgIHNrZXdbal0gPSAoYSAvIGIpICogZztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNrZXdbal0gPSBnO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBza2V3O1xufVxuXG5mdW5jdGlvbiBrdXJ0b3NpcyhtYXRyaXgsIHVuYmlhc2VkKSB7XG4gICAgaWYgKHR5cGVvZih1bmJpYXNlZCkgPT09ICd1bmRlZmluZWQnKSB1bmJpYXNlZCA9IHRydWU7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpO1xuICAgIHZhciBuID0gbWF0cml4Lmxlbmd0aCwgbSA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgdmFyIGt1cnQgPSBuZXcgQXJyYXkobSk7XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG07IGorKykge1xuICAgICAgICB2YXIgczIgPSAwLCBzNCA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGV2ID0gbWF0cml4W2ldW2pdIC0gbWVhbnNbal07XG4gICAgICAgICAgICBzMiArPSBkZXYgKiBkZXY7XG4gICAgICAgICAgICBzNCArPSBkZXYgKiBkZXYgKiBkZXYgKiBkZXY7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG0yID0gczIgLyBuO1xuICAgICAgICB2YXIgbTQgPSBzNCAvIG47XG5cbiAgICAgICAgaWYgKHVuYmlhc2VkKSB7XG4gICAgICAgICAgICB2YXIgdiA9IHMyIC8gKG4gLSAxKTtcbiAgICAgICAgICAgIHZhciBhID0gKG4gKiAobiArIDEpKSAvICgobiAtIDEpICogKG4gLSAyKSAqIChuIC0gMykpO1xuICAgICAgICAgICAgdmFyIGIgPSBzNCAvICh2ICogdik7XG4gICAgICAgICAgICB2YXIgYyA9ICgobiAtIDEpICogKG4gLSAxKSkgLyAoKG4gLSAyKSAqIChuIC0gMykpO1xuICAgICAgICAgICAga3VydFtqXSA9IGEgKiBiIC0gMyAqIGM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrdXJ0W2pdID0gbTQgLyAobTIgKiBtMikgLSAzO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBrdXJ0O1xufVxuXG5mdW5jdGlvbiBzdGFuZGFyZEVycm9yKG1hdHJpeCkge1xuICAgIHZhciBzYW1wbGVzID0gbWF0cml4Lmxlbmd0aDtcbiAgICB2YXIgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4KSwgbCA9IHN0YW5kYXJkRGV2aWF0aW9ucy5sZW5ndGg7XG4gICAgdmFyIHN0YW5kYXJkRXJyb3JzID0gbmV3IEFycmF5KGwpO1xuICAgIHZhciBzcXJ0TiA9IE1hdGguc3FydChzYW1wbGVzKTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHN0YW5kYXJkRXJyb3JzW2ldID0gc3RhbmRhcmREZXZpYXRpb25zW2ldIC8gc3FydE47XG4gICAgfVxuICAgIHJldHVybiBzdGFuZGFyZEVycm9ycztcbn1cblxuZnVuY3Rpb24gY292YXJpYW5jZShtYXRyaXgsIGRpbWVuc2lvbikge1xuICAgIHJldHVybiBzY2F0dGVyKG1hdHJpeCwgdW5kZWZpbmVkLCBkaW1lbnNpb24pO1xufVxuXG5mdW5jdGlvbiBzY2F0dGVyKG1hdHJpeCwgZGl2aXNvciwgZGltZW5zaW9uKSB7XG4gICAgaWYgKHR5cGVvZihkaW1lbnNpb24pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkaW1lbnNpb24gPSAwO1xuICAgIH1cbiAgICBpZiAodHlwZW9mKGRpdmlzb3IpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgICAgICBkaXZpc29yID0gbWF0cml4Lmxlbmd0aCAtIDE7XG4gICAgICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgICAgICBkaXZpc29yID0gbWF0cml4WzBdLmxlbmd0aCAtIDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgsIGRpbWVuc2lvbiksXG4gICAgICAgIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbW11dO1xuICAgIH1cbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGNvdiwgaSwgaiwgcywgaztcblxuICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCByb3dzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSAobWF0cml4W2tdW2pdIC0gbWVhbnNbal0pICogKG1hdHJpeFtrXVtpXSAtIG1lYW5zW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcyAvPSBkaXZpc29yO1xuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHM7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gKG1hdHJpeFtqXVtrXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhbaV1ba10gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHMgLz0gZGl2aXNvcjtcbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvdjtcbn1cblxuZnVuY3Rpb24gY29ycmVsYXRpb24obWF0cml4KSB7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpLFxuICAgICAgICBzdGFuZGFyZERldmlhdGlvbnMgPSBzdGFuZGFyZERldmlhdGlvbihtYXRyaXgsIHRydWUsIG1lYW5zKSxcbiAgICAgICAgc2NvcmVzID0gelNjb3JlcyhtYXRyaXgsIG1lYW5zLCBzdGFuZGFyZERldmlhdGlvbnMpLFxuICAgICAgICByb3dzID0gbWF0cml4Lmxlbmd0aCxcbiAgICAgICAgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGksIGo7XG5cbiAgICB2YXIgY29yID0gbmV3IEFycmF5KGNvbHMpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2xzOyBpKyspIHtcbiAgICAgICAgY29yW2ldID0gbmV3IEFycmF5KGNvbHMpO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgIGZvciAoaiA9IGk7IGogPCBjb2xzOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGsgPSAwLCBsID0gc2NvcmVzLmxlbmd0aDsgayA8IGw7IGsrKykge1xuICAgICAgICAgICAgICAgIGMgKz0gc2NvcmVzW2tdW2pdICogc2NvcmVzW2tdW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYyAvPSByb3dzIC0gMTtcbiAgICAgICAgICAgIGNvcltpXVtqXSA9IGM7XG4gICAgICAgICAgICBjb3Jbal1baV0gPSBjO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb3I7XG59XG5cbmZ1bmN0aW9uIHpTY29yZXMobWF0cml4LCBtZWFucywgc3RhbmRhcmREZXZpYXRpb25zKSB7XG4gICAgbWVhbnMgPSBtZWFucyB8fCBtZWFuKG1hdHJpeCk7XG4gICAgaWYgKHR5cGVvZihzdGFuZGFyZERldmlhdGlvbnMpID09PSAndW5kZWZpbmVkJykgc3RhbmRhcmREZXZpYXRpb25zID0gc3RhbmRhcmREZXZpYXRpb24obWF0cml4LCB0cnVlLCBtZWFucyk7XG4gICAgcmV0dXJuIHN0YW5kYXJkaXplKGNlbnRlcihtYXRyaXgsIG1lYW5zLCBmYWxzZSksIHN0YW5kYXJkRGV2aWF0aW9ucywgdHJ1ZSk7XG59XG5cbmZ1bmN0aW9uIGNlbnRlcihtYXRyaXgsIG1lYW5zLCBpblBsYWNlKSB7XG4gICAgbWVhbnMgPSBtZWFucyB8fCBtZWFuKG1hdHJpeCk7XG4gICAgdmFyIHJlc3VsdCA9IG1hdHJpeCxcbiAgICAgICAgbCA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGksIGosIGpqO1xuXG4gICAgaWYgKCFpblBsYWNlKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyBBcnJheShsKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG1hdHJpeFtpXS5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gcmVzdWx0W2ldO1xuICAgICAgICBmb3IgKGogPSAwLCBqaiA9IHJvdy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICByb3dbal0gPSBtYXRyaXhbaV1bal0gLSBtZWFuc1tqXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBzdGFuZGFyZGl6ZShtYXRyaXgsIHN0YW5kYXJkRGV2aWF0aW9ucywgaW5QbGFjZSkge1xuICAgIGlmICh0eXBlb2Yoc3RhbmRhcmREZXZpYXRpb25zKSA9PT0gJ3VuZGVmaW5lZCcpIHN0YW5kYXJkRGV2aWF0aW9ucyA9IHN0YW5kYXJkRGV2aWF0aW9uKG1hdHJpeCk7XG4gICAgdmFyIHJlc3VsdCA9IG1hdHJpeCxcbiAgICAgICAgbCA9IG1hdHJpeC5sZW5ndGgsXG4gICAgICAgIGksIGosIGpqO1xuXG4gICAgaWYgKCFpblBsYWNlKSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyBBcnJheShsKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgcmVzdWx0W2ldID0gbmV3IEFycmF5KG1hdHJpeFtpXS5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0Um93ID0gcmVzdWx0W2ldO1xuICAgICAgICB2YXIgc291cmNlUm93ID0gbWF0cml4W2ldO1xuICAgICAgICBmb3IgKGogPSAwLCBqaiA9IHJlc3VsdFJvdy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICBpZiAoc3RhbmRhcmREZXZpYXRpb25zW2pdICE9PSAwICYmICFpc05hTihzdGFuZGFyZERldmlhdGlvbnNbal0pKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0Um93W2pdID0gc291cmNlUm93W2pdIC8gc3RhbmRhcmREZXZpYXRpb25zW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHdlaWdodGVkVmFyaWFuY2UobWF0cml4LCB3ZWlnaHRzKSB7XG4gICAgdmFyIG1lYW5zID0gbWVhbihtYXRyaXgpO1xuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aDtcbiAgICB2YXIgdmFyaSA9IG5ldyBBcnJheShjb2xzKTtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgIHZhciBzdW0gPSAwO1xuICAgICAgICB2YXIgYSA9IDAsIGIgPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgeiA9IG1hdHJpeFtpXVtqXSAtIG1lYW5zW2pdO1xuICAgICAgICAgICAgdmFyIHcgPSB3ZWlnaHRzW2ldO1xuXG4gICAgICAgICAgICBzdW0gKz0gdyAqICh6ICogeik7XG4gICAgICAgICAgICBiICs9IHc7XG4gICAgICAgICAgICBhICs9IHcgKiB3O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyaVtqXSA9IHN1bSAqIChiIC8gKGIgKiBiIC0gYSkpO1xuICAgIH1cblxuICAgIHJldHVybiB2YXJpO1xufVxuXG5mdW5jdGlvbiB3ZWlnaHRlZE1lYW4obWF0cml4LCB3ZWlnaHRzLCBkaW1lbnNpb24pIHtcbiAgICBpZiAodHlwZW9mKGRpbWVuc2lvbikgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9IDA7XG4gICAgfVxuICAgIHZhciByb3dzID0gbWF0cml4Lmxlbmd0aDtcbiAgICBpZiAocm93cyA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIHZhciBjb2xzID0gbWF0cml4WzBdLmxlbmd0aCxcbiAgICAgICAgbWVhbnMsIGksIGlpLCBqLCB3LCByb3c7XG5cbiAgICBpZiAoZGltZW5zaW9uID09PSAwKSB7XG4gICAgICAgIG1lYW5zID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBtZWFuc1tpXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgcm93ID0gbWF0cml4W2ldO1xuICAgICAgICAgICAgdyA9IHdlaWdodHNbaV07XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29sczsgaisrKSB7XG4gICAgICAgICAgICAgICAgbWVhbnNbal0gKz0gcm93W2pdICogdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIG1lYW5zID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgcm93czsgaSsrKSB7XG4gICAgICAgICAgICBtZWFuc1tpXSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChqID0gMDsgaiA8IHJvd3M7IGorKykge1xuICAgICAgICAgICAgcm93ID0gbWF0cml4W2pdO1xuICAgICAgICAgICAgdyA9IHdlaWdodHNbal07XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbWVhbnNbal0gKz0gcm93W2ldICogdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBkaW1lbnNpb24nKTtcbiAgICB9XG5cbiAgICB2YXIgd2VpZ2h0U3VtID0gYXJyYXlTdGF0LnN1bSh3ZWlnaHRzKTtcbiAgICBpZiAod2VpZ2h0U3VtICE9PSAwKSB7XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gbWVhbnMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgbWVhbnNbaV0gLz0gd2VpZ2h0U3VtO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtZWFucztcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRDb3ZhcmlhbmNlKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGRpbWVuc2lvbikge1xuICAgIGRpbWVuc2lvbiA9IGRpbWVuc2lvbiB8fCAwO1xuICAgIG1lYW5zID0gbWVhbnMgfHwgd2VpZ2h0ZWRNZWFuKG1hdHJpeCwgd2VpZ2h0cywgZGltZW5zaW9uKTtcbiAgICB2YXIgczEgPSAwLCBzMiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDAsIGlpID0gd2VpZ2h0cy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgIHMxICs9IHdlaWdodHNbaV07XG4gICAgICAgIHMyICs9IHdlaWdodHNbaV0gKiB3ZWlnaHRzW2ldO1xuICAgIH1cbiAgICB2YXIgZmFjdG9yID0gczEgLyAoczEgKiBzMSAtIHMyKTtcbiAgICByZXR1cm4gd2VpZ2h0ZWRTY2F0dGVyKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGZhY3RvciwgZGltZW5zaW9uKTtcbn1cblxuZnVuY3Rpb24gd2VpZ2h0ZWRTY2F0dGVyKG1hdHJpeCwgd2VpZ2h0cywgbWVhbnMsIGZhY3RvciwgZGltZW5zaW9uKSB7XG4gICAgZGltZW5zaW9uID0gZGltZW5zaW9uIHx8IDA7XG4gICAgbWVhbnMgPSBtZWFucyB8fCB3ZWlnaHRlZE1lYW4obWF0cml4LCB3ZWlnaHRzLCBkaW1lbnNpb24pO1xuICAgIGlmICh0eXBlb2YoZmFjdG9yKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZmFjdG9yID0gMTtcbiAgICB9XG4gICAgdmFyIHJvd3MgPSBtYXRyaXgubGVuZ3RoO1xuICAgIGlmIChyb3dzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBbW11dO1xuICAgIH1cbiAgICB2YXIgY29scyA9IG1hdHJpeFswXS5sZW5ndGgsXG4gICAgICAgIGNvdiwgaSwgaiwgaywgcztcblxuICAgIGlmIChkaW1lbnNpb24gPT09IDApIHtcbiAgICAgICAgY292ID0gbmV3IEFycmF5KGNvbHMpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sczsgaSsrKSB7XG4gICAgICAgICAgICBjb3ZbaV0gPSBuZXcgQXJyYXkoY29scyk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbHM7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gaTsgaiA8IGNvbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHMgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCByb3dzOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcyArPSB3ZWlnaHRzW2tdICogKG1hdHJpeFtrXVtqXSAtIG1lYW5zW2pdKSAqIChtYXRyaXhba11baV0gLSBtZWFuc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvdltpXVtqXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICAgICAgY292W2pdW2ldID0gcyAqIGZhY3RvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGltZW5zaW9uID09PSAxKSB7XG4gICAgICAgIGNvdiA9IG5ldyBBcnJheShyb3dzKTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHJvd3M7IGkrKykge1xuICAgICAgICAgICAgY292W2ldID0gbmV3IEFycmF5KHJvd3MpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCByb3dzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IGk7IGogPCByb3dzOyBqKyspIHtcbiAgICAgICAgICAgICAgICBzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGsgPSAwOyBrIDwgY29sczsgaysrKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gd2VpZ2h0c1trXSAqIChtYXRyaXhbal1ba10gLSBtZWFuc1tqXSkgKiAobWF0cml4W2ldW2tdIC0gbWVhbnNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3ZbaV1bal0gPSBzICogZmFjdG9yO1xuICAgICAgICAgICAgICAgIGNvdltqXVtpXSA9IHMgKiBmYWN0b3I7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGltZW5zaW9uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvdjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgZW50cm9weTogZW50cm9weSxcbiAgICBtZWFuOiBtZWFuLFxuICAgIHN0YW5kYXJkRGV2aWF0aW9uOiBzdGFuZGFyZERldmlhdGlvbixcbiAgICB2YXJpYW5jZTogdmFyaWFuY2UsXG4gICAgbWVkaWFuOiBtZWRpYW4sXG4gICAgbW9kZTogbW9kZSxcbiAgICBza2V3bmVzczogc2tld25lc3MsXG4gICAga3VydG9zaXM6IGt1cnRvc2lzLFxuICAgIHN0YW5kYXJkRXJyb3I6IHN0YW5kYXJkRXJyb3IsXG4gICAgY292YXJpYW5jZTogY292YXJpYW5jZSxcbiAgICBzY2F0dGVyOiBzY2F0dGVyLFxuICAgIGNvcnJlbGF0aW9uOiBjb3JyZWxhdGlvbixcbiAgICB6U2NvcmVzOiB6U2NvcmVzLFxuICAgIGNlbnRlcjogY2VudGVyLFxuICAgIHN0YW5kYXJkaXplOiBzdGFuZGFyZGl6ZSxcbiAgICB3ZWlnaHRlZFZhcmlhbmNlOiB3ZWlnaHRlZFZhcmlhbmNlLFxuICAgIHdlaWdodGVkTWVhbjogd2VpZ2h0ZWRNZWFuLFxuICAgIHdlaWdodGVkQ292YXJpYW5jZTogd2VpZ2h0ZWRDb3ZhcmlhbmNlLFxuICAgIHdlaWdodGVkU2NhdHRlcjogd2VpZ2h0ZWRTY2F0dGVyXG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3BjYScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFN0YXQgPSByZXF1aXJlKCdtbC1zdGF0Jyk7XG52YXIgU1ZEID0gTWF0cml4LkRDLlNWRDtcblxubW9kdWxlLmV4cG9ydHMgPSBQQ0E7XG5cbi8qKlxuKiBDcmVhdGVzIG5ldyBQQ0EgKFByaW5jaXBhbCBDb21wb25lbnQgQW5hbHlzaXMpIGZyb20gdGhlIGRhdGFzZXRcbiogQHBhcmFtIHtNYXRyaXh9IGRhdGFzZXRcbiogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBvcHRpb25zIGZvciB0aGUgUENBIGFsZ29yaXRobVxuKiBAcGFyYW0ge2Jvb2xlYW59IHJlbG9hZCAtIGZvciBsb2FkIHB1cnBvc2VzXG4qIEBwYXJhbSB7T2JqZWN0fSBtb2RlbCAtIGZvciBsb2FkIHB1cnBvc2VzXG4qIEBjb25zdHJ1Y3RvclxuKiAqL1xuZnVuY3Rpb24gUENBKGRhdGFzZXQsIG9wdGlvbnMsIHJlbG9hZCwgbW9kZWwpIHtcblxuICAgIGlmIChyZWxvYWQpIHtcbiAgICAgICAgdGhpcy5VID0gbW9kZWwuVTtcbiAgICAgICAgdGhpcy5TID0gbW9kZWwuUztcbiAgICAgICAgdGhpcy5tZWFucyA9IG1vZGVsLm1lYW5zO1xuICAgICAgICB0aGlzLnN0ZCA9IG1vZGVsLnN0ZDtcbiAgICAgICAgdGhpcy5zdGFuZGFyZGl6ZSA9IG1vZGVsLnN0YW5kYXJkaXplXG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYob3B0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIHN0YW5kYXJkaXplOiBmYWxzZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3RhbmRhcmRpemUgPSBvcHRpb25zLnN0YW5kYXJkaXplO1xuXG4gICAgICAgIGlmICghTWF0cml4LmlzTWF0cml4KGRhdGFzZXQpKSB7XG4gICAgICAgICAgICBkYXRhc2V0ID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRhdGFzZXQgPSBkYXRhc2V0LmNsb25lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbm9ybWFsaXphdGlvbiA9IGFkanVzdChkYXRhc2V0LCB0aGlzLnN0YW5kYXJkaXplKTtcbiAgICAgICAgdmFyIG5vcm1hbGl6ZWREYXRhc2V0ID0gbm9ybWFsaXphdGlvbi5yZXN1bHQ7XG5cbiAgICAgICAgdmFyIGNvdmFyaWFuY2VNYXRyaXggPSBub3JtYWxpemVkRGF0YXNldC50cmFuc3Bvc2UoKS5tbXVsKG5vcm1hbGl6ZWREYXRhc2V0KS5kaXZTKGRhdGFzZXQucm93cyk7XG5cbiAgICAgICAgdmFyIHRhcmdldCA9IG5ldyBTVkQoY292YXJpYW5jZU1hdHJpeCwge1xuICAgICAgICAgICAgY29tcHV0ZUxlZnRTaW5ndWxhclZlY3RvcnM6IHRydWUsXG4gICAgICAgICAgICBjb21wdXRlUmlnaHRTaW5ndWxhclZlY3RvcnM6IHRydWUsXG4gICAgICAgICAgICBhdXRvVHJhbnNwb3NlOiBmYWxzZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLlUgPSB0YXJnZXQubGVmdFNpbmd1bGFyVmVjdG9ycztcbiAgICAgICAgdGhpcy5TID0gdGFyZ2V0LmRpYWdvbmFsO1xuICAgICAgICB0aGlzLm1lYW5zID0gbm9ybWFsaXphdGlvbi5tZWFucztcbiAgICAgICAgdGhpcy5zdGQgPSBub3JtYWxpemF0aW9uLnN0ZDtcbiAgICB9XG59XG5cbi8qKlxuKiBMb2FkIGEgUENBIG1vZGVsIGZyb20gSlNPTlxuKiBAb2FyYW0ge09iamVjdH0gbW9kZWxcbiogQHJldHVybiB7UENBfVxuKiAqL1xuUENBLmxvYWQgPSBmdW5jdGlvbiAobW9kZWwpIHtcbiAgICBpZihtb2RlbC5tb2RlbE5hbWUgIT09ICdQQ0EnKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIlRoZSBjdXJyZW50IG1vZGVsIGlzIGludmFsaWQhXCIpO1xuXG4gICAgcmV0dXJuIG5ldyBQQ0EobnVsbCwgbnVsbCwgdHJ1ZSwgbW9kZWwpO1xufTtcblxuLyoqXG4qIEV4cG9ydHMgdGhlIGN1cnJlbnQgbW9kZWwgdG8gYW4gT2JqZWN0XG4qIEByZXR1cm4ge09iamVjdH0gbW9kZWxcbiogKi9cblBDQS5wcm90b3R5cGUuZXhwb3J0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG1vZGVsTmFtZTogXCJQQ0FcIixcbiAgICAgICAgVTogdGhpcy5VLFxuICAgICAgICBTOiB0aGlzLlMsXG4gICAgICAgIG1lYW5zOiB0aGlzLm1lYW5zLFxuICAgICAgICBzdGQ6IHRoaXMuc3RkLFxuICAgICAgICBzdGFuZGFyZGl6ZTogdGhpcy5zdGFuZGFyZGl6ZVxuICAgIH07XG59O1xuXG4vKipcbiogRnVuY3Rpb24gdGhhdCBwcm9qZWN0IHRoZSBkYXRhc2V0IGludG8gbmV3IHNwYWNlIG9mIGsgZGltZW5zaW9ucyxcbiogdGhpcyBtZXRob2QgZG9lc24ndCBtb2RpZnkgeW91ciBkYXRhc2V0LlxuKiBAcGFyYW0ge01hdHJpeH0gZGF0YXNldC5cbiogQHBhcmFtIHtOdW1iZXJ9IGsgLSBkaW1lbnNpb25zIHRvIHByb2plY3QuXG4qIEByZXR1cm4ge01hdHJpeH0gZGF0YXNldCBwcm9qZWN0ZWQgaW4gayBkaW1lbnNpb25zLlxuKiBAdGhyb3dzIHtSYW5nZUVycm9yfSBpZiBrIGlzIGxhcmdlciB0aGFuIHRoZSBudW1iZXIgb2YgZWlnZW52ZWN0b3JcbiogICAgICAgICAgICAgICAgICAgICAgb2YgdGhlIG1vZGVsLlxuKiAqL1xuUENBLnByb3RvdHlwZS5wcm9qZWN0ID0gZnVuY3Rpb24gKGRhdGFzZXQsIGspIHtcbiAgICB2YXIgZGltZW5zaW9ucyA9IGsgLSAxO1xuICAgIGlmKGsgPiB0aGlzLlUuY29sdW1ucylcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJ0aGUgbnVtYmVyIG9mIGRpbWVuc2lvbnMgbXVzdCBub3QgYmUgbGFyZ2VyIHRoYW4gXCIgKyB0aGlzLlUuY29sdW1ucyk7XG5cbiAgICBpZiAoIU1hdHJpeC5pc01hdHJpeChkYXRhc2V0KSkge1xuICAgICAgICBkYXRhc2V0ID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhc2V0ID0gZGF0YXNldC5jbG9uZSgpO1xuICAgIH1cblxuICAgIHZhciBYID0gYWRqdXN0KGRhdGFzZXQsIHRoaXMuc3RhbmRhcmRpemUpLnJlc3VsdDtcbiAgICByZXR1cm4gWC5tbXVsKHRoaXMuVS5zdWJNYXRyaXgoMCwgdGhpcy5VLnJvd3MgLSAxLCAwLCBkaW1lbnNpb25zKSk7XG59O1xuXG4vKipcbiogVGhpcyBtZXRob2QgcmV0dXJucyB0aGUgcGVyY2VudGFnZSB2YXJpYW5jZSBvZiBlYWNoIGVpZ2VudmVjdG9yLlxuKiBAcmV0dXJuIHtOdW1iZXJ9IHBlcmNlbnRhZ2UgdmFyaWFuY2Ugb2YgZWFjaCBlaWdlbnZlY3Rvci5cbiogKi9cblBDQS5wcm90b3R5cGUuZ2V0RXhwbGFpbmVkVmFyaWFuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN1bSA9IHRoaXMuUy5yZWR1Y2UoZnVuY3Rpb24gKHByZXZpb3VzLCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gcHJldmlvdXMgKyB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5TLm1hcChmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlIC8gc3VtO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIEVpZ2VudmVjdG9ycyBvZiB0aGUgY292YXJpYW5jZSBtYXRyaXguXG4gKiBAcmV0dXJucyB7TWF0cml4fVxuICovXG5QQ0EucHJvdG90eXBlLmdldEVpZ2VudmVjdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5VO1xufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIEVpZ2VudmFsdWVzIChvbiB0aGUgZGlhZ29uYWwpLlxuICogQHJldHVybnMgeyp9XG4gKi9cblBDQS5wcm90b3R5cGUuZ2V0RWlnZW52YWx1ZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuUztcbn07XG5cbi8qKlxuKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgZGF0YXNldCBub3JtYWxpemVkIGluIHRoZSBmb2xsb3dpbmcgZm9ybTpcbiogWCA9IChYIC0gbWVhbikgLyBzdGRcbiogQHBhcmFtIGRhdGFzZXQuXG4qIEBwYXJhbSB7Qm9vbGVhbn0gc3RhbmRhcml6ZSAtIGRvIHN0YW5kYXJkaXphdGlvblxuKiBAcmV0dXJuIEEgZGF0YXNldCBub3JtYWxpemVkLlxuKiAqL1xuZnVuY3Rpb24gYWRqdXN0KGRhdGFzZXQsIHN0YW5kYXJpemUpIHtcbiAgICB2YXIgbWVhbnMgPSBTdGF0Lm1hdHJpeC5tZWFuKGRhdGFzZXQpO1xuICAgIHZhciBzdGQgPSBzdGFuZGFyaXplID8gU3RhdC5tYXRyaXguc3RhbmRhcmREZXZpYXRpb24oZGF0YXNldCwgbWVhbnMsIHRydWUpIDogdW5kZWZpbmVkO1xuXG4gICAgdmFyIHJlc3VsdCA9IGRhdGFzZXQuc3ViUm93VmVjdG9yKG1lYW5zKTtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN1bHQ6IHN0YW5kYXJpemUgPyByZXN1bHQuZGl2Um93VmVjdG9yKHN0ZCkgOiByZXN1bHQsXG4gICAgICAgIG1lYW5zOiBtZWFucyxcbiAgICAgICAgc3RkOiBzdGRcbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSByZXF1aXJlKCcuL3BscycpO1xuZXhwb3J0cy5VdGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbmV4cG9ydHMuT1BMUyA9IHJlcXVpcmUoJy4vb3BscycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgVXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gT1BMUztcblxuZnVuY3Rpb24gT1BMUyhkYXRhc2V0LCBwcmVkaWN0aW9ucywgbnVtYmVyT1NDKSB7XG4gICAgdmFyIFggPSBuZXcgTWF0cml4KGRhdGFzZXQpO1xuICAgIHZhciB5ID0gbmV3IE1hdHJpeChwcmVkaWN0aW9ucyk7XG5cbiAgICBYID0gVXRpbHMuZmVhdHVyZU5vcm1hbGl6ZShYKS5yZXN1bHQ7XG4gICAgeSA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUoeSkucmVzdWx0O1xuXG4gICAgdmFyIHJvd3MgPSBYLnJvd3M7XG4gICAgdmFyIGNvbHVtbnMgPSBYLmNvbHVtbnM7XG5cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7XG4gICAgdmFyIHcgPSBYLnRyYW5zcG9zZSgpLm1tdWwoeSk7XG4gICAgdy5kaXYoVXRpbHMubm9ybSh3KSk7XG5cbiAgICB2YXIgb3J0aG9XID0gbmV3IEFycmF5KG51bWJlck9TQyk7XG4gICAgdmFyIG9ydGhvVCA9IG5ldyBBcnJheShudW1iZXJPU0MpO1xuICAgIHZhciBvcnRob1AgPSBuZXcgQXJyYXkobnVtYmVyT1NDKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bWJlck9TQzsgaSsrKSB7XG4gICAgICAgIHZhciB0ID0gWC5tbXVsKHcpO1xuXG4gICAgICAgIHZhciBudW1lcmF0b3IgPSBYLnRyYW5zcG9zZSgpLm1tdWwodCk7XG4gICAgICAgIHZhciBkZW5vbWluYXRvciA9IHQudHJhbnNwb3NlKCkubW11bCh0KVswXVswXTtcbiAgICAgICAgdmFyIHAgPSAgbnVtZXJhdG9yLmRpdihkZW5vbWluYXRvcik7XG5cbiAgICAgICAgbnVtZXJhdG9yID0gdy50cmFuc3Bvc2UoKS5tbXVsKHApWzBdWzBdO1xuICAgICAgICBkZW5vbWluYXRvciA9IHcudHJhbnNwb3NlKCkubW11bCh3KVswXVswXTtcbiAgICAgICAgdmFyIHdPc2MgPSBwLnN1Yih3LmNsb25lKCkubXVsKG51bWVyYXRvciAvIGRlbm9taW5hdG9yKSk7XG4gICAgICAgIHdPc2MuZGl2KFV0aWxzLm5vcm0od09zYykpO1xuXG4gICAgICAgIHZhciB0T3NjID0gWC5tbXVsKHdPc2MpO1xuXG4gICAgICAgIG51bWVyYXRvciA9IFgudHJhbnNwb3NlKCkubW11bCh0T3NjKTtcbiAgICAgICAgZGVub21pbmF0b3IgPSB0T3NjLnRyYW5zcG9zZSgpLm1tdWwodE9zYylbMF1bMF07XG4gICAgICAgIHZhciBwT3NjID0gbnVtZXJhdG9yLmRpdihkZW5vbWluYXRvcik7XG5cbiAgICAgICAgWC5zdWIodE9zYy5tbXVsKHBPc2MudHJhbnNwb3NlKCkpKTtcbiAgICAgICAgb3J0aG9XW2ldID0gd09zYy5nZXRDb2x1bW4oMCk7XG4gICAgICAgIG9ydGhvVFtpXSA9IHRPc2MuZ2V0Q29sdW1uKDApO1xuICAgICAgICBvcnRob1BbaV0gPSBwT3NjLmdldENvbHVtbigwKTtcbiAgICB9XG5cbiAgICB0aGlzLlhvc2MgPSBYO1xuXG4gICAgdmFyIHN1bU9mU3F1YXJlc1hvc3ggPSB0aGlzLlhvc2MuY2xvbmUoKS5tdWwodGhpcy5Yb3NjKS5zdW0oKTtcbiAgICB0aGlzLlIyWCA9IDEgLSBzdW1PZlNxdWFyZXNYb3N4L3N1bU9mU3F1YXJlc1g7XG5cbiAgICB0aGlzLlcgPSBvcnRob1c7XG4gICAgdGhpcy5UID0gb3J0aG9UO1xuICAgIHRoaXMuUCA9IG9ydGhvUDtcbiAgICB0aGlzLm51bWJlck9TQyA9IG51bWJlck9TQztcbn1cblxuT1BMUy5wcm90b3R5cGUuY29ycmVjdERhdGFzZXQgPSBmdW5jdGlvbiAoZGF0YXNldCkge1xuICAgIHZhciBYID0gbmV3IE1hdHJpeChkYXRhc2V0KTtcblxuICAgIHZhciBzdW1PZlNxdWFyZXNYID0gWC5jbG9uZSgpLm11bChYKS5zdW0oKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubnVtYmVyT1NDOyBpKyspIHtcbiAgICAgICAgdmFyIGN1cnJlbnRXID0gdGhpcy5XLmdldENvbHVtblZlY3RvcihpKTtcbiAgICAgICAgdmFyIGN1cnJlbnRQID0gdGhpcy5QLmdldENvbHVtblZlY3RvcihpKTtcblxuICAgICAgICB2YXIgdCA9IFgubW11bChjdXJyZW50Vyk7XG4gICAgICAgIFguc3ViKHQubW11bChjdXJyZW50UCkpO1xuICAgIH1cbiAgICB2YXIgc3VtT2ZTcXVhcmVzWG9zeCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7XG5cbiAgICB2YXIgUjJYID0gMSAtIHN1bU9mU3F1YXJlc1hvc3ggLyBzdW1PZlNxdWFyZXNYO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZGF0YXNldE9zYzogWCxcbiAgICAgICAgUjJEYXRhc2V0OiBSMlhcbiAgICB9O1xufTsiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gUExTO1xudmFyIE1hdHJpeCA9IHJlcXVpcmUoJ21sLW1hdHJpeCcpO1xudmFyIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgc3VtIGF0IHRoZSBjb2x1bW4gb2YgdGhlIGdpdmVuIG1hdHJpeC5cbiAqIEBwYXJhbSBtYXRyaXhcbiAqIEBwYXJhbSBjb2x1bW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGdldENvbFN1bShtYXRyaXgsIGNvbHVtbikge1xuICAgIHZhciBzdW0gPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF0cml4LnJvd3M7IGkrKykge1xuICAgICAgICBzdW0gKz0gbWF0cml4W2ldW2NvbHVtbl07XG4gICAgfVxuICAgIHJldHVybiBzdW07XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBpbmRleCB3aGVyZSB0aGUgc3VtIG9mIGVhY2hcbiAqIGNvbHVtbiB2ZWN0b3IgaXMgbWF4aW11bS5cbiAqIEBwYXJhbSB7TWF0cml4fSBkYXRhXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBpbmRleCBvZiB0aGUgbWF4aW11bVxuICovXG5mdW5jdGlvbiBtYXhTdW1Db2xJbmRleChkYXRhKSB7XG4gICAgdmFyIG1heEluZGV4ID0gMDtcbiAgICB2YXIgbWF4U3VtID0gLUluZmluaXR5O1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBkYXRhLmNvbHVtbnM7ICsraSkge1xuICAgICAgICB2YXIgY3VycmVudFN1bSA9IGdldENvbFN1bShkYXRhLCBpKTtcbiAgICAgICAgaWYoY3VycmVudFN1bSA+IG1heFN1bSkge1xuICAgICAgICAgICAgbWF4U3VtID0gY3VycmVudFN1bTtcbiAgICAgICAgICAgIG1heEluZGV4ID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbWF4SW5kZXg7XG59XG5cbi8qKlxuICogQ29uc3RydWN0b3Igb2YgdGhlIFBMUyBtb2RlbC5cbiAqIEBwYXJhbSByZWxvYWQgLSB1c2VkIGZvciBsb2FkIHB1cnBvc2VzLlxuICogQHBhcmFtIG1vZGVsIC0gdXNlZCBmb3IgbG9hZCBwdXJwb3Nlcy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBQTFMocmVsb2FkLCBtb2RlbCkge1xuICAgIGlmKHJlbG9hZCkge1xuICAgICAgICB0aGlzLkUgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuRSk7XG4gICAgICAgIHRoaXMuRiA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5GKTtcbiAgICAgICAgdGhpcy5zc3FZY2FsID0gbW9kZWwuc3NxWWNhbDtcbiAgICAgICAgdGhpcy5SMlggPSBtb2RlbC5SMlg7XG4gICAgICAgIHRoaXMueW1lYW4gPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwueW1lYW4pO1xuICAgICAgICB0aGlzLnlzdGQgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwueXN0ZCk7XG4gICAgICAgIHRoaXMuUEJRID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlBCUSk7XG4gICAgICAgIHRoaXMuVCA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5UKTtcbiAgICAgICAgdGhpcy5QID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlApO1xuICAgICAgICB0aGlzLlUgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuVSk7XG4gICAgICAgIHRoaXMuUSA9IE1hdHJpeC5jaGVja01hdHJpeChtb2RlbC5RKTtcbiAgICAgICAgdGhpcy5XID0gTWF0cml4LmNoZWNrTWF0cml4KG1vZGVsLlcpO1xuICAgICAgICB0aGlzLkIgPSBNYXRyaXguY2hlY2tNYXRyaXgobW9kZWwuQik7XG4gICAgfVxufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgZml0IHRoZSBtb2RlbCB3aXRoIHRoZSBnaXZlbiBkYXRhIGFuZCBwcmVkaWN0aW9ucywgaW4gdGhpcyBmdW5jdGlvbiBpcyBjYWxjdWxhdGVkIHRoZVxuICogZm9sbG93aW5nIG91dHB1dHM6XG4gKlxuICogVCAtIFNjb3JlIG1hdHJpeCBvZiBYXG4gKiBQIC0gTG9hZGluZyBtYXRyaXggb2YgWFxuICogVSAtIFNjb3JlIG1hdHJpeCBvZiBZXG4gKiBRIC0gTG9hZGluZyBtYXRyaXggb2YgWVxuICogQiAtIE1hdHJpeCBvZiByZWdyZXNzaW9uIGNvZWZmaWNpZW50XG4gKiBXIC0gV2VpZ2h0IG1hdHJpeCBvZiBYXG4gKlxuICogQHBhcmFtIHtNYXRyaXh9IHRyYWluaW5nU2V0IC0gRGF0YXNldCB0byBiZSBhcHBseSB0aGUgbW9kZWxcbiAqIEBwYXJhbSB7TWF0cml4fSBwcmVkaWN0aW9ucyAtIFByZWRpY3Rpb25zIG92ZXIgZWFjaCBjYXNlIG9mIHRoZSBkYXRhc2V0XG4gKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucyAtIHJlY2lldmVzIHRoZSBsYXRlbnRWZWN0b3JzIGFuZCB0aGUgdG9sZXJhbmNlIG9mIGVhY2ggc3RlcCBvZiB0aGUgUExTXG4gKi9cblBMUy5wcm90b3R5cGUudHJhaW4gPSBmdW5jdGlvbiAodHJhaW5pbmdTZXQsIHByZWRpY3Rpb25zLCBvcHRpb25zKSB7XG5cbiAgICBpZihvcHRpb25zID09PSB1bmRlZmluZWQpIG9wdGlvbnMgPSB7fTtcblxuICAgIHZhciBsYXRlbnRWZWN0b3JzID0gb3B0aW9ucy5sYXRlbnRWZWN0b3JzO1xuICAgIGlmKGxhdGVudFZlY3RvcnMgPT09IHVuZGVmaW5lZCB8fCBpc05hTihsYXRlbnRWZWN0b3JzKSkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcIkxhdGVudCB2ZWN0b3IgbXVzdCBiZSBhIG51bWJlci5cIik7XG4gICAgfVxuXG4gICAgdmFyIHRvbGVyYW5jZSA9IG9wdGlvbnMudG9sZXJhbmNlO1xuICAgIGlmKHRvbGVyYW5jZSA9PT0gdW5kZWZpbmVkIHx8IGlzTmFOKHRvbGVyYW5jZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUb2xlcmFuY2UgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICB9XG5cbiAgICBpZih0cmFpbmluZ1NldC5sZW5ndGggIT09IHByZWRpY3Rpb25zLmxlbmd0aClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJUaGUgbnVtYmVyIG9mIHByZWRpY3Rpb25zIGFuZCBlbGVtZW50cyBpbiB0aGUgZGF0YXNldCBtdXN0IGJlIHRoZSBzYW1lXCIpO1xuXG4gICAgLy92YXIgdG9sZXJhbmNlID0gMWUtOTtcbiAgICB2YXIgWCA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUobmV3IE1hdHJpeCh0cmFpbmluZ1NldCkpLnJlc3VsdDtcbiAgICB2YXIgcmVzdWx0WSA9IFV0aWxzLmZlYXR1cmVOb3JtYWxpemUobmV3IE1hdHJpeChwcmVkaWN0aW9ucykpO1xuICAgIHRoaXMueW1lYW4gPSByZXN1bHRZLm1lYW5zLm5lZygpO1xuICAgIHRoaXMueXN0ZCA9IHJlc3VsdFkuc3RkO1xuICAgIHZhciBZID0gcmVzdWx0WS5yZXN1bHQ7XG5cbiAgICB2YXIgcnggPSBYLnJvd3M7XG4gICAgdmFyIGN4ID0gWC5jb2x1bW5zO1xuICAgIHZhciByeSA9IFkucm93cztcbiAgICB2YXIgY3kgPSBZLmNvbHVtbnM7XG5cbiAgICBpZihyeCAhPSByeSkge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcImRhdGFzZXQgY2FzZXMgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBwcmVkaWN0aW9uc1wiKTtcbiAgICB9XG5cbiAgICB2YXIgc3NxWGNhbCA9IFguY2xvbmUoKS5tdWwoWCkuc3VtKCk7IC8vIGZvciB0aGUgcsKyXG4gICAgdmFyIHN1bU9mU3F1YXJlc1kgPSBZLmNsb25lKCkubXVsKFkpLnN1bSgpO1xuXG4gICAgdmFyIG4gPSBsYXRlbnRWZWN0b3JzOyAvL01hdGgubWF4KGN4LCBjeSk7IC8vIGNvbXBvbmVudHMgb2YgdGhlIHBsc1xuICAgIHZhciBUID0gTWF0cml4Lnplcm9zKHJ4LCBuKTtcbiAgICB2YXIgUCA9IE1hdHJpeC56ZXJvcyhjeCwgbik7XG4gICAgdmFyIFUgPSBNYXRyaXguemVyb3MocnksIG4pO1xuICAgIHZhciBRID0gTWF0cml4Lnplcm9zKGN5LCBuKTtcbiAgICB2YXIgQiA9IE1hdHJpeC56ZXJvcyhuLCBuKTtcbiAgICB2YXIgVyA9IFAuY2xvbmUoKTtcbiAgICB2YXIgayA9IDA7XG4gICAgdmFyIFIyWCA9IG5ldyBBcnJheShuKTtcblxuICAgIHdoaWxlKFV0aWxzLm5vcm0oWSkgPiB0b2xlcmFuY2UgJiYgayA8IG4pIHtcbiAgICAgICAgdmFyIHRyYW5zcG9zZVggPSBYLnRyYW5zcG9zZSgpO1xuICAgICAgICB2YXIgdHJhbnNwb3NlWSA9IFkudHJhbnNwb3NlKCk7XG5cbiAgICAgICAgdmFyIHRJbmRleCA9IG1heFN1bUNvbEluZGV4KFguY2xvbmUoKS5tdWxNKFgpKTtcbiAgICAgICAgdmFyIHVJbmRleCA9IG1heFN1bUNvbEluZGV4KFkuY2xvbmUoKS5tdWxNKFkpKTtcblxuICAgICAgICB2YXIgdDEgPSBYLmdldENvbHVtblZlY3Rvcih0SW5kZXgpO1xuICAgICAgICB2YXIgdSA9IFkuZ2V0Q29sdW1uVmVjdG9yKHVJbmRleCk7XG4gICAgICAgIHZhciB0ID0gTWF0cml4Lnplcm9zKHJ4LCAxKTtcblxuICAgICAgICB3aGlsZShVdGlscy5ub3JtKHQxLmNsb25lKCkuc3ViKHQpKSA+IHRvbGVyYW5jZSkge1xuICAgICAgICAgICAgdmFyIHcgPSB0cmFuc3Bvc2VYLm1tdWwodSk7XG4gICAgICAgICAgICB3LmRpdihVdGlscy5ub3JtKHcpKTtcbiAgICAgICAgICAgIHQgPSB0MTtcbiAgICAgICAgICAgIHQxID0gWC5tbXVsKHcpO1xuICAgICAgICAgICAgdmFyIHEgPSB0cmFuc3Bvc2VZLm1tdWwodDEpO1xuICAgICAgICAgICAgcS5kaXYoVXRpbHMubm9ybShxKSk7XG4gICAgICAgICAgICB1ID0gWS5tbXVsKHEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdCA9IHQxO1xuICAgICAgICB2YXIgbnVtID0gdHJhbnNwb3NlWC5tbXVsKHQpO1xuICAgICAgICB2YXIgZGVuID0gKHQudHJhbnNwb3NlKCkubW11bCh0KSlbMF1bMF07XG4gICAgICAgIHZhciBwID0gbnVtLmRpdihkZW4pO1xuICAgICAgICB2YXIgcG5vcm0gPSBVdGlscy5ub3JtKHApO1xuICAgICAgICBwLmRpdihwbm9ybSk7XG4gICAgICAgIHQubXVsKHBub3JtKTtcbiAgICAgICAgdy5tdWwocG5vcm0pO1xuXG4gICAgICAgIG51bSA9IHUudHJhbnNwb3NlKCkubW11bCh0KTtcbiAgICAgICAgZGVuID0gKHQudHJhbnNwb3NlKCkubW11bCh0KSlbMF1bMF07XG4gICAgICAgIHZhciBiID0gKG51bS5kaXYoZGVuKSlbMF1bMF07XG4gICAgICAgIFguc3ViKHQubW11bChwLnRyYW5zcG9zZSgpKSk7XG4gICAgICAgIFkuc3ViKHQuY2xvbmUoKS5tdWwoYikubW11bChxLnRyYW5zcG9zZSgpKSk7XG5cbiAgICAgICAgVC5zZXRDb2x1bW4oaywgdCk7XG4gICAgICAgIFAuc2V0Q29sdW1uKGssIHApO1xuICAgICAgICBVLnNldENvbHVtbihrLCB1KTtcbiAgICAgICAgUS5zZXRDb2x1bW4oaywgcSk7XG4gICAgICAgIFcuc2V0Q29sdW1uKGssIHcpO1xuXG4gICAgICAgIEJba11ba10gPSBiO1xuICAgICAgICBrKys7XG4gICAgfVxuXG4gICAgay0tO1xuICAgIFQgPSBULnN1Yk1hdHJpeCgwLCBULnJvd3MgLSAxLCAwLCBrKTtcbiAgICBQID0gUC5zdWJNYXRyaXgoMCwgUC5yb3dzIC0gMSwgMCwgayk7XG4gICAgVSA9IFUuc3ViTWF0cml4KDAsIFUucm93cyAtIDEsIDAsIGspO1xuICAgIFEgPSBRLnN1Yk1hdHJpeCgwLCBRLnJvd3MgLSAxLCAwLCBrKTtcbiAgICBXID0gVy5zdWJNYXRyaXgoMCwgVy5yb3dzIC0gMSwgMCwgayk7XG4gICAgQiA9IEIuc3ViTWF0cml4KDAsIGssIDAsIGspO1xuXG4gICAgdGhpcy5SMlggPSB0LnRyYW5zcG9zZSgpLm1tdWwodCkubW11bChwLnRyYW5zcG9zZSgpLm1tdWwocCkpLmRpdlMoc3NxWGNhbClbMF1bMF07XG5cbiAgICAvLyBUT0RPOiByZXZpZXcgb2YgUjJZXG4gICAgLy90aGlzLlIyWSA9IHQudHJhbnNwb3NlKCkubW11bCh0KS5tdWwocVtrXVswXSpxW2tdWzBdKS5kaXZTKHNzcVljYWwpWzBdWzBdO1xuXG4gICAgdGhpcy5zc3FZY2FsID0gc3VtT2ZTcXVhcmVzWTtcbiAgICB0aGlzLkUgPSBYO1xuICAgIHRoaXMuRiA9IFk7XG4gICAgdGhpcy5UID0gVDtcbiAgICB0aGlzLlAgPSBQO1xuICAgIHRoaXMuVSA9IFU7XG4gICAgdGhpcy5RID0gUTtcbiAgICB0aGlzLlcgPSBXO1xuICAgIHRoaXMuQiA9IEI7XG4gICAgdGhpcy5QQlEgPSBQLm1tdWwoQikubW11bChRLnRyYW5zcG9zZSgpKTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCBwcmVkaWN0IHRoZSBiZWhhdmlvciBvZiB0aGUgZ2l2ZW4gZGF0YXNldC5cbiAqIEBwYXJhbSBkYXRhc2V0IC0gZGF0YSB0byBiZSBwcmVkaWN0ZWQuXG4gKiBAcmV0dXJucyB7TWF0cml4fSAtIHByZWRpY3Rpb25zIG9mIGVhY2ggZWxlbWVudCBvZiB0aGUgZGF0YXNldC5cbiAqL1xuUExTLnByb3RvdHlwZS5wcmVkaWN0ID0gZnVuY3Rpb24gKGRhdGFzZXQpIHtcbiAgICB2YXIgWCA9IG5ldyBNYXRyaXgoZGF0YXNldCk7XG4gICAgdmFyIG5vcm1hbGl6YXRpb24gPSBVdGlscy5mZWF0dXJlTm9ybWFsaXplKFgpO1xuICAgIFggPSBub3JtYWxpemF0aW9uLnJlc3VsdDtcbiAgICB2YXIgWSA9IFgubW11bCh0aGlzLlBCUSk7XG4gICAgWS5tdWxSb3dWZWN0b3IodGhpcy55c3RkKTtcbiAgICBZLmFkZFJvd1ZlY3Rvcih0aGlzLnltZWFuKTtcbiAgICByZXR1cm4gWTtcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBleHBsYWluZWQgdmFyaWFuY2Ugb24gdHJhaW5pbmcgb2YgdGhlIFBMUyBtb2RlbC5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblBMUy5wcm90b3R5cGUuZ2V0RXhwbGFpbmVkVmFyaWFuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuUjJYO1xufTtcblxuLyoqXG4gKiBMb2FkIGEgUExTIG1vZGVsIGZyb20gYW4gT2JqZWN0XG4gKiBAcGFyYW0gbW9kZWxcbiAqIEByZXR1cm5zIHtQTFN9IC0gUExTIG9iamVjdCBmcm9tIHRoZSBnaXZlbiBtb2RlbFxuICovXG5QTFMubG9hZCA9IGZ1bmN0aW9uIChtb2RlbCkge1xuICAgIGlmKG1vZGVsLm1vZGVsTmFtZSAhPT0gJ1BMUycpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFwiVGhlIGN1cnJlbnQgbW9kZWwgaXMgaW52YWxpZCFcIik7XG5cbiAgICByZXR1cm4gbmV3IFBMUyh0cnVlLCBtb2RlbCk7XG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRoYXQgZXhwb3J0cyBhIFBMUyBtb2RlbCB0byBhbiBPYmplY3QuXG4gKiBAcmV0dXJucyB7e21vZGVsTmFtZTogc3RyaW5nLCB5bWVhbjogKiwgeXN0ZDogKiwgUEJROiAqfX0gbW9kZWwuXG4gKi9cblBMUy5wcm90b3R5cGUuZXhwb3J0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG1vZGVsTmFtZTogXCJQTFNcIixcbiAgICAgICAgRTogdGhpcy5FLFxuICAgICAgICBGOiB0aGlzLkYsXG4gICAgICAgIFIyWDogdGhpcy5SMlgsXG4gICAgICAgIHNzcVljYWw6IHRoaXMuc3NxWWNhbCxcbiAgICAgICAgeW1lYW46IHRoaXMueW1lYW4sXG4gICAgICAgIHlzdGQ6IHRoaXMueXN0ZCxcbiAgICAgICAgUEJROiB0aGlzLlBCUSxcbiAgICAgICAgVDogdGhpcy5ULFxuICAgICAgICBQOiB0aGlzLlAsXG4gICAgICAgIFU6IHRoaXMuVSxcbiAgICAgICAgUTogdGhpcy5RLFxuICAgICAgICBXOiB0aGlzLlcsXG4gICAgICAgIEI6IHRoaXMuQlxuICAgIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XG52YXIgU3RhdCA9IHJlcXVpcmUoJ21sLXN0YXQnKTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IGdpdmVuIHZlY3RvciwgcmV0dXJucyBoaXMgbm9ybVxuICogQHBhcmFtIHtWZWN0b3J9IFhcbiAqIEByZXR1cm5zIHtudW1iZXJ9IE5vcm0gb2YgdGhlIHZlY3RvclxuICovXG5mdW5jdGlvbiBub3JtKFgpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KFguY2xvbmUoKS5hcHBseShwb3cyYXJyYXkpLnN1bSgpKTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IHBvdyAyIGVhY2ggZWxlbWVudCBvZiBhIE1hdHJpeCBvciBhIFZlY3RvcixcbiAqIHVzZWQgaW4gdGhlIGFwcGx5IG1ldGhvZCBvZiB0aGUgTWF0cml4IG9iamVjdFxuICogQHBhcmFtIGkgLSBpbmRleCBpLlxuICogQHBhcmFtIGogLSBpbmRleCBqLlxuICogQHJldHVybiBUaGUgTWF0cml4IG9iamVjdCBtb2RpZmllZCBhdCB0aGUgaW5kZXggaSwgai5cbiAqICovXG5mdW5jdGlvbiBwb3cyYXJyYXkoaSwgaikge1xuICAgIHRoaXNbaV1bal0gPSB0aGlzW2ldW2pdICogdGhpc1tpXVtqXTtcbiAgICByZXR1cm4gdGhpcztcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0aGF0IG5vcm1hbGl6ZSB0aGUgZGF0YXNldCBhbmQgcmV0dXJuIHRoZSBtZWFucyBhbmRcbiAqIHN0YW5kYXJkIGRldmlhdGlvbiBvZiBlYWNoIGZlYXR1cmUuXG4gKiBAcGFyYW0gZGF0YXNldFxuICogQHJldHVybnMge3tyZXN1bHQ6IE1hdHJpeCwgbWVhbnM6ICgqfG51bWJlciksIHN0ZDogTWF0cml4fX0gZGF0YXNldCBub3JtYWxpemVkLCBtZWFuc1xuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYW5kIHN0YW5kYXJkIGRldmlhdGlvbnNcbiAqL1xuZnVuY3Rpb24gZmVhdHVyZU5vcm1hbGl6ZShkYXRhc2V0KSB7XG4gICAgdmFyIG1lYW5zID0gU3RhdC5tYXRyaXgubWVhbihkYXRhc2V0KTtcbiAgICB2YXIgc3RkID0gTWF0cml4LnJvd1ZlY3RvcihTdGF0Lm1hdHJpeC5zdGFuZGFyZERldmlhdGlvbihkYXRhc2V0LCBtZWFucywgdHJ1ZSkpO1xuICAgIG1lYW5zID0gTWF0cml4LnJvd1ZlY3RvcihtZWFucyk7XG5cbiAgICB2YXIgcmVzdWx0ID0gZGF0YXNldC5hZGRSb3dWZWN0b3IobWVhbnMubmVnKCkpO1xuICAgIHJldHVybiB7cmVzdWx0OiByZXN1bHQuZGl2Um93VmVjdG9yKHN0ZCksIG1lYW5zOiBtZWFucywgc3RkOiBzdGR9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBub3JtOiBub3JtLFxuICAgIHBvdzJhcnJheTogcG93MmFycmF5LFxuICAgIGZlYXR1cmVOb3JtYWxpemU6IGZlYXR1cmVOb3JtYWxpemVcbn07XG5cbiIsIi8vVGhpcyBmaWxlIGluY2x1ZGVzIHNlcnZpY2VzIHdoaWNoIHJlbHkgb24gbm9kZSBwdWJsaWMgbW9kdWxlcy5cclxuYW5ndWxhci5tb2R1bGUoJ2FwcC5ub2RlU2VydmljZXMnLCBbJ2lvbmljJywgJ25nQ29yZG92YSddKVxyXG5cclxuLnNlcnZpY2UoJ2NoZW1vJywgZnVuY3Rpb24oKXtcclxuXHJcbiAgICB2YXIgbGliX3BscyA9IHJlcXVpcmUoJ21sLXBscycpO1xyXG4gICAgdmFyIGxpYl9wY2EgPSByZXF1aXJlKCdtbC1wY2EnKTtcclxuICAgIHZhciBsaWJfbWF0cml4ID0gcmVxdWlyZSgnbWwtbWF0cml4Jyk7XHJcblxyXG4gICAgdmFyIGNoZW1vSXNQbHM7XHJcbiAgICB2YXIgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzID0gW107XHJcbiAgICB2YXIgY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzID0gW107XHJcbiAgICB2YXIgY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICB2YXIgY2hlbW9QQ0FDb21wcmVzc2VkID0gW107XHJcbiAgICB2YXIgY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gMDtcclxuICAgIHZhciBjaGVtb0lzVHJhaW5lZCA9IGZhbHNlO1xyXG4gICAgLy9yZXByZXNlbnRzIGEgUGxzIG9yIFBDQSBtb2R1bGUuXHJcbiAgICB2YXIgY2hlbW9BbGdvO1xyXG5cclxuICAgIHZhciBjaGVtb0ZsYWdzID0ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IDAsXHJcbiAgICAgICAgZmFpbEZpbGVJRDogMSxcclxuICAgICAgICBmYWlsVHJhaW5pbmdSb3dNaXNtYXRjaDogMixcclxuICAgICAgICBmYWlsTm90RW5vdWdoTGFiZWxzOiAzLFxyXG4gICAgICAgIGZhaWxOb1RyYWluaW5nRGF0YTogNCxcclxuICAgICAgICBmYWlsVW5rbm93blRyYWluRXJyb3I6IDUsXHJcbiAgICAgICAgZmFpbFVua25vd25JbmZlcmVuY2VFcnJvcjogNixcclxuICAgICAgICBmYWlsQWJzb3JiYW5jZU1pc21hdGNoOiA3LFxyXG4gICAgICAgIGZhaWxDb25jZW50cmF0aW9uTWlzbWF0Y2g6IDgsXHJcbiAgICAgICAgZmFpbEZpbGVOb3RTYXZlZDogOSxcclxuICAgICAgICBmYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2g6IDEwLFxyXG4gICAgICAgIGZhaWxJbmZlcmVuY2VDb2x1bW5NaXNtYXRjaDogMTFcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkYXRhYmFzZUdldEZpbGUoZmlsZUlEKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgYWJzb3JiYW5jZXM6IFtdLCBjb25jZW50cmF0aW9uTGFiZWxzOiBbXSwgY29uY2VudHJhdGlvbnM6IFtdIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlbW9HZXRGaWxlKGZpbGVJRCkge1xyXG4gICAgICAgIHJldHVybiBkYXRhYmFzZUdldEZpbGUoZmlsZUlEKTtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZGF0YWJhc2VBZGRGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFibGVzLCBjb25jZW50cmF0aW9ucywgZmlsZU5hbWUpIHtcclxuXHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNoZW1vQWRkTGFiZWxzKGxhYmVscykge1xyXG5cclxuICAgICAgICB2YXIgbmV3TGFiZWxzTGVuZ3RoID0gbGFiZWxzLmxlbmd0aDtcclxuICAgICAgICB2YXIgb2xkTGFiZWxzTGVuZ3RoID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzLmxlbmd0aDtcclxuICAgICAgICAvL2xvY2F0aW9uQXJyIChbaW50XSkgaG9sZHMgdGhlIG51bWJlciBvZiB0aGUgY29sdW1uIG9mIGEgY29uY2VudHJhdGlvbiBtYXRyaXggdGhpcyBsYWJlbCBpcyBsaW5rZWQgdG9cclxuICAgICAgICB2YXIgbG9jYXRpb25BcnIgPSBbXTtcclxuICAgICAgICAvL0xvb2sgdG8gc2VlIGlmIHdlIGhhdmUgc2VlbiB0aGlzIGxhYmVsIGJlZm9yZVxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3TGFiZWxzTGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG5vdEZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBvbGRMYWJlbHNMZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgLy9JZiB3ZSBoYXZlIHNlZW4gYmVmb3JlLCBtYWtlIGEgbm90ZSBvZiB3aGF0IGNvbHVtbiB0aGUgY29uY2VudHJhdGlvbiB3aWxsIGdvIGluXHJcbiAgICAgICAgICAgICAgICAvL2luc2lkZSBvZiB0cmFpbmluZy1ZIG1hdHJpeC5cclxuICAgICAgICAgICAgICAgIGlmIChsYWJlbHNbaV0gPT0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2pdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm90Rm91bmQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gajtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0lmIG5ldmVyIHNlZW4gYmVmb3JlLCB3ZSBhZGQgdGhlIGxhYmVsIHRvIGEgbGlzdGluZyBvZiBsYWJlbHMuXHJcbiAgICAgICAgICAgIGlmIChub3RGb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW29sZExhYmVsc0xlbmd0aF0gPSBsYWJlbHNbaV07XHJcbiAgICAgICAgICAgICAgICBsb2NhdGlvbkFycltsb2NhdGlvbkFyci5sZW5ndGhdID0gb2xkTGFiZWxzTGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsb2NhdGlvbkFycjtcclxuICAgIH07XHJcblxyXG4gICAgLy9BZGRzIGEgZmlsZSB3aXRoIHRoZSBtZWFzdXJlZCBhYnNvcnB0aW9ucyBhbmQgZXN0aW1hdGVkIGNvbmNlbnRyYXRpb25zLlxyXG4gICAgZnVuY3Rpb24gY2hlbW9BZGRGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFibGVzLCBjb25jZW50cmF0aW9ucykge1xyXG4gICAgICAgIGRhdGFiYXNlQWRkRmlsZShhYnNvcmJhbmNlcywgY29uY2VudHJhdGlvbkxhYmxlcywgY29uY2VudHJhdGlvbnMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjaGVtb0FkZENvbmNlbnRyYXRpb24obmV3Q29uY2VudHJhdGlvbiwgY3VyclJvdywgY3VyckNvbCkge1xyXG4gICAgICAgIC8vYWRkIGluZGV4XHJcbiAgICAgICAgdmFyIG51bVJvdyA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9ucy5sZW5ndGg7XHJcbiAgICAgICAgdmFyIG51bUNvbCA9IDA7XHJcbiAgICAgICAgaWYgKG51bVJvdyA+IDApIHtcclxuICAgICAgICAgICAgbnVtQ29sID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zWzBdLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vSWYgcGFzdCBsYXN0IHJvdyBieSAxLCBtYWtlIGEgbmV3IHJvdyAoZnVsbCBvZiBub3QtaW5pdClcclxuICAgICAgICBpZiAoY3VyclJvdyA9PSBudW1Sb3cpIHtcclxuICAgICAgICAgICAgbnVtUm93ICs9IDE7XHJcbiAgICAgICAgICAgIGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XSA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgY3VyclJvd0FyciA9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1tjdXJyUm93XTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db2w7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgY3VyclJvd0FycltpXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy9XZSBwYXNzIHRoZSBsYXN0IGNvbHVtbi0gYWRkIG5ldyBjb2x1bW4gd2l0aCAwIHN0YXRlcy5cclxuICAgICAgICBpZiAoY3VyckNvbCA9PSBudW1Db2wpIHtcclxuICAgICAgICAgICAgbnVtQ29sICs9IDE7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUm93OyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjdXJyUm93QXJyID0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKGkgPT0gY3VyclJvdykge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJSb3dBcnJbY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9XaGVuIHdlIGFkZCBhIGNvbHVtbiwgd2UgbGVhdmUgaW5kaWNlcyAwXHJcbiAgICAgICAgICAgICAgICAgICAgY3VyclJvd0FycltjdXJyQ29sXSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIC8vSW4gdGhpcyBzaXR1YXRpb24gd2UgYXJlIG92ZXJ3cml0aW5nIGEgMFxyXG4gICAgICAgICAgICBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbY3VyclJvd11bY3VyckNvbF0gPSBuZXdDb25jZW50cmF0aW9uO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlbW9UcmFpbihpc1F1YW50aWZ5LCBmaWxlSURBcnIpIHtcclxuICAgICAgICBjaGVtb0lzUGxzID0gaXNRdWFudGlmeTtcclxuICAgICAgICB2YXIgbnVtRmlsZXMgPSBmaWxlSURBcnIubGVuZ3RoO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtRmlsZXM7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgZmlsZSA9IGNoZW1vR2V0RmlsZShmaWxlSURBcnJbaV0pO1xyXG4gICAgICAgICAgICBpZiAoZmlsZSA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsRmlsZUlEO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy9BZGQgbmV3IGNoZW1pY2FsIGxhYmVscyBpZiB0aGVyZSBhcmUgYW55IG5ldyBvbmVzIGluIHRoaXMgZmlsZSBhbmQgYXNzb2NpYXRlIGxhYmVscyB3aXRoIGNvbmNlbnRyYXRpb24gaW5kaWNlc1xyXG4gICAgICAgICAgICAgICAgdmFyIGxvY2F0aW9uQXJyID0gY2hlbW9BZGRMYWJlbHMoZmlsZS5jb25jZW50cmF0aW9uTGFiZWxzKTtcclxuICAgICAgICAgICAgICAgIHZhciBudW1DaGVtaWNhbHMgPSBsb2NhdGlvbkFyci5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICAvL0FkZCBhYnNvcmJhbmNlcyBhcyBuZXh0IHJvdyBvZiBtYXRyaXggdHJhaW5pbmctWVxyXG4gICAgICAgICAgICAgICAgY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzW2ldID0gZmlsZS5hYnNvcmJhbmNlcztcclxuICAgICAgICAgICAgICAgIC8vQWRkIGNoZW0gY29uY2VudHJhdGlvbiBpbiBjb3JyZWN0IHBhcnQgb2YgdHJhaW5pbmcgbWF0cml4IFguXHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bUNoZW1pY2FsczsgKytqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9FYWNoIGNoZW0gY29uYyBnb2VzIGluIGl0aCByb3cgKGFzIHJlcHJlc2VudHMgaXRoIHNjYW4pIGF0IHRoZSBpbmRleCByZXByZXNlbnRpbmcgdGhlIGFwcHJvcHJpYXRlIGxhYmVsXHJcbiAgICAgICAgICAgICAgICAgICAgY2hlbW9BZGRDb25jZW50cmF0aW9uKGZpbGUuY29uY2VudHJhdGlvbnNbal0sIGksIGxvY2F0aW9uQXJyW2pdKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzLmxlbmd0aCA9PSAwKSB7XHJcbiAgICAgICAgICAgIC8vTm8gdHJhaW5pbmcgZGF0YSBtZWFucyBubyBzdWNjZXNzIChhbHNvIHNvbWV0aW1lcyB3ZSB1c2UgMHRoIHJvdyB0byBmaW5kIG51bSBvZiBjb2wpXHJcbiAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcy5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0NvbmNlbnRyYXRpb25zLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAvL1RoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBjb25jZW50cmF0aW9ucyBmb3IgZXZlcnkgYXJyYXkgb2YgYWJzb3JiYW5jZXNcclxuICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbFRyYWluaW5nUm93TWlzbWF0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb0NvbmNlbnRyYXRpb25MYWJlbHMubGVuZ3RoICE9IGNoZW1vVHJhaW5pbmdDb25jZW50cmF0aW9uc1swXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgLy9XZSBkb24ndCBoYXZlIGEgbmFtZSBmb3IgZWFjaCBtYXRlcmlhbCAoQ3J5KVxyXG4gICAgICAgICAgICByZXR1cm4gY2hlbW9GbGFncy5mYWlsTm90RW5vdWdoTGFiZWxzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlbW9Jc1Bscykge1xyXG4gICAgICAgICAgICB2YXIgbnVtQ29sQWJzb3JiYW5jZXMgPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXNbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB2YXIgbnVtQ29sQ29uY2VudHJhdGlvbnMgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAvL1Rha2UgMTAlIG9mIGRhdGEgKHByb2JhYmx5IG9mIFkpLlxyXG4gICAgICAgICAgICB2YXIgbWF4VmVjdG9ycyA9IG1pbihudW1Db2xBYnNvcmJhbmNlcywgbnVtQ29sQ29uY2VudHJhdGlvbnMpO1xyXG4gICAgICAgICAgICB2YXIgbnVtTGF0ZW50VmVjdG9ycyA9IGZsb29yKG1heFZlY3RvcnMgKiAwLjEpO1xyXG4gICAgICAgICAgICBpZiAobnVtTGF0ZW50VmVjdG9ycyA9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBudW1MYXRlbnRWZWN0b3JzICs9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGV4cGxhaW5lZFZhcmlhbmNlcyA9IDA7XHJcbiAgICAgICAgICAgIHdoaWxlIChudW1MYXRlbnRWZWN0b3JzIDw9IG1heFZlY3RvcnMgJiYgZXhwbGFpbmVkVmFyaWFuY2VzIDwgMC44NSkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9BbGdvID0gbmV3IGxpYl9wbHMoKTtcclxuICAgICAgICAgICAgICAgIHZhciBvcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIGxhdGVudFZlY3RvcnM6IG51bUxhdGVudFZlY3RvcnMsXHJcbiAgICAgICAgICAgICAgICAgICAgdG9sZXJhbmNlOiAxZS01XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjaGVtb0FsZ28udHJhaW4oY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzLCBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnMsIG9wdGlvbnMpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duVHJhaW5FcnJvcjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGV4cGxhaW5lZFZhcmlhbmNlcyA9IGNoZW1vQWxnby5nZXRFeHBsYWluZWRWYXJpYW5jZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGV4cGxhaW5lZFZhcmlhbmNlcyA8IDAuODUpIHtcclxuICAgICAgICAgICAgICAgICAgICBudW1MYXRlbnRWZWN0b3JzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIC8vR2V0IHByaW5jaXBsZSBjb21wb25lbnRzIGFzc29jaWF0ZWQgd2l0aCB0cmFpbmluZyBzZXQgYWJzb3JiYW5jZXMgWC5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNoZW1vQWxnbyA9IG5ldyBsaWJfcGNhKGNoZW1vVHJhaW5pbmdBYnNvcmJhbmNlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3MuZmFpbFVua25vd25UcmFpbkVycm9yO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IobnVtQ29sQWJzb3JiYW5jZXMgKiAwLjEpO1xyXG4gICAgICAgICAgICB2YXIgZXhwbGFpbmVkVmFyaWFuY2VzID0gY2hlbW9BbGdvLmdldEV4cGxhaW5lZFZhcmlhbmNlKCk7XHJcbiAgICAgICAgICAgIC8vSG93IG1hbnkgdmVjdG9ycyB0byBnZXQgfjg1JSBvZiB2YXJpYW5jZT9cclxuICAgICAgICAgICAgY2hlbW9OdW1MYXRlbnRWZWN0b3JzID0gZmxvb3IoMC44NSAvIGV4cGxhaW5lZFZhcmlhbmNlcyk7XHJcbiAgICAgICAgICAgIGlmIChjaGVtb051bUxhdGVudFZlY3RvcnMgPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY2hlbW9OdW1MYXRlbnRWZWN0b3JzICs9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIC8vQ2hlY2sgcGFyYW1ldGVyIHJlcXVpcmVtZW50c1xyXG4gICAgICAgICAgICAgICAgY2hlbW9QQ0FDb21wcmVzc2VkID0gY2hlbW9BbGdvLnByb2plY3QoY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzLCBjaGVtb051bUxhdGVudFZlY3RvcnMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjaGVtb0ZsYWdzLmZhaWxVbmtub3duVHJhaW5FcnJvcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBjaGVtb0lzVHJhaW5lZCA9IHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGNoZW1vRmxhZ3Muc3VjY2VzcztcclxuICAgIH07XHJcblxyXG4gICAgLy9FeHBlY3QgYSAxRCBhcnJheSBjb250YWluaW5nIGFic29yYmFuY2VzLCBmbGFnIHRlbGxpbmcgdG8gc2F2ZSwgKGlmIHNhdmUsIHByb3ZpZGUgYSBmaWxlIG5hbWUpXHJcbiAgICBmdW5jdGlvbiBjaGVtb0luZmVyKG1lYXN1cmVkQWJzb3JiYW5jZXMsIGRvU2F2ZSwgZmlsZU5hbWUpIHtcclxuICAgICAgICBpZiAoIWNoZW1vSXNUcmFpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxOb1RyYWluaW5nRGF0YSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVhc3VyZWRBYnNvcmJhbmNlcy5sZW5ndGggIT0gY2hlbW9UcmFpbmluZ0Fic29yYmFuY2VzWzBdLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsQWJzb3JiYW5jZU1pc21hdGNoIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVtb0lzUGxzKSB7XHJcbiAgICAgICAgICAgIHZhciBpbmZlcnJlZCA9IFtdO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgaW5mZXJyZWQgPSBjaGVtb0FsZ28ucHJlZGljdChtZWFzdXJlZEFic29yYmFuY2VzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsVW5rbm93bkluZmVyZW5jZUVycm9yIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGluZmVycmVkLmxlbmd0aCA9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsVW5rbm93bkluZmVyZW5jZUVycm9yIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGluZmVycmVkWzBdLmxlbmd0aCAhPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbMF0ubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsQ29uY2VudHJhdGlvbk1pc21hdGNoIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9UaGUgaW1wbGVtZW50YXRpb24gcHJvdmlkZXMgYSByb3cgb2YgYXZlcmFnZXMgYXQgdGhlIGJvdHRvbSAod2UgZG9uJ3Qgd2FudCBpdClcclxuICAgICAgICAgICAgdmFyIGFsbENvbmNlbnRyYXRpb25zID0gaW5mZXJyZWRbMF07XHJcblxyXG4gICAgICAgICAgICAvL0ZpbmQgdGhlIGNoZW1pY2FsIG5hbWVzIHdoaWNoIGhhdmUgYmVlbiBkZXRlY3RlZC5cclxuICAgICAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgbm9uWmVyb0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWxsQ29uY2VudHJhdGlvbnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWxzW2xhYmVscy5sZW5ndGhdID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG5vblplcm9Db25jZW50cmF0aW9uc1tub25aZXJvQ29uY2VudHJhdGlvbnMubGVuZ3RoXSA9IGFsbENvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZG9TYXZlKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGF0YWJhc2VSZXN1bHQgPSBkYXRhYmFzZUFkZEZpbGUobWVhc3VyZWRBYnNvcmJhbmNlcywgbGFiZWxzLCBub25aZXJvQ29uY2VudHJhdGlvbnMsIGZpbGVOYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhYmFzZVJlc3VsdC5zdGF0dXMgIT0gY2hlbW9GbGFncy5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9UaGlzIGZhaWwgaXMgYSBtaXhlZCBiYWctIHdlIHN1Y2NlZWQgYXQgZ2V0dGluZyBvdXIgZGF0YSwgYnV0IHdlIGRvbid0IG1hbmFnZSB0byBzYXZlIGl0IHRvIHRoZSBmaWxlIHN5c3RlbS5cclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IGxhYmVscywgY29uY2VudHJhdGlvbnM6IG5vblplcm9Db25jZW50cmF0aW9ucywgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxGaWxlTm90U2F2ZWQgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgbWVhc3VyZWQgPSBbXTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIG1lYXN1cmVkID0gY2hlbW9BbGdvLnByb2plY3QobWVhc3VyZWRBYnNvcmJhbmNlcywgY2hlbW9OdW1MYXRlbnRWZWN0b3JzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsVW5rbm93bkluZmVyZW5jZUVycm9yIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGRpc3RhbmNlcyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgbnVtUG9pbnRzID0gY2hlbW9QQ0FDb21wcmVzc2VkLmxlbmd0aDtcclxuICAgICAgICAgICAgaWYgKG51bVBvaW50cyAhPSBjaGVtb1RyYWluaW5nQWJzb3JiYW5jZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIHN0YXR1czogY2hlbW9GbGFncy5mYWlsSW5mZXJlbmNlUm93TWlzbWF0Y2ggfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoY2hlbW9OdW1MYXRlbnRWZWN0b3JzICE9IGNoZW1vUENBQ29tcHJlc3NlZFswXS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGNvbXBvdW5kczogW10sIGNvbmNlbnRyYXRpb25zOiBbXSwgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxJbmZlcmVuY2VDb2x1bW5NaXNtYXRjaCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdW0gPSAwO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBjaGVtb1BDQUNvbXByZXNzZWRbaV0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBudW1Db21wb25lbnRzOyArK2opIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyh4MS14MileMlxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnQgPSBtZWFzdXJlZFtqXSAtIGNoZW1vUENBQ29tcHJlc3NlZFtpXVtqXTtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQgPSBjb21wb25lbnQgKiBjb21wb25lbnQ7XHJcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IGNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vU3F1YXJlIHJvb3Qgb2YgZGlzdGFuY2VzIHNxdWFyZWQgaXMgdGhlIGV1Y2xpZGVhbiBkaXN0YW5jZSBmb3JtdWxhXHJcbiAgICAgICAgICAgICAgICBzdW0gPSBzcXJ0KHN1bSk7XHJcbiAgICAgICAgICAgICAgICBkaXN0YW5jZVtpXSA9IHN1bTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvL0xpbmVhciBzZWFyY2ggdG8gZmluZCBwb2ludCB3aXRoIG1pbmltdW0gZGlzdGFuY2UgZnJvbSBuZXcgb2JzZXJ2YXRpb25cclxuICAgICAgICAgICAgdmFyIG1pbmltdW1EaXN0YW5jZSA9IGRpc3RhbmNlc1swXTtcclxuICAgICAgICAgICAgdmFyIG1pbmltdW1JbmRleCA9IDA7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbnVtUG9pbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZXNbaV0gPCBtaW5pbXVtRGlzdGFuY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBtaW5pbXVtRGlzdGFuY2UgPSBkaXN0YW5jZXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bUluZGV4ID0gaTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgYWxsQ29uY2VudHJhdGlvbnMgPSBjaGVtb1RyYWluaW5nQ29uY2VudHJhdGlvbnNbbWluaW11bUluZGV4XTtcclxuICAgICAgICAgICAgdmFyIGxhYmVscyA9IFtdO1xyXG4gICAgICAgICAgICB2YXIgbm9uWmVyb0NvbmNlbnRyYXRpb25zID0gW107XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWxsQ29uY2VudHJhdGlvbnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhbGxDb25jZW50cmF0aW9uc1tpXSAhPSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGFiZWxzW2xhYmVscy5sZW5ndGhdID0gY2hlbW9Db25jZW50cmF0aW9uTGFiZWxzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG5vblplcm9Db25jZW50cmF0aW9uc1tub25aZXJvQ29uY2VudHJhdGlvbnMubGVuZ3RoXSA9IGFsbENvbmNlbnRyYXRpb25zW2ldO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZG9TYXZlKSB7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmFzZUFkZEZpbGUobWVhc3VyZWRBYnNvcmJhbmNlcywgbGFiZWxzLCBub25aZXJvQ29uY2VudHJhdGlvbnMsIGZpbGVOYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhYmFzZVJlc3VsdC5zdGF0dXMgIT0gY2hlbW9GbGFncy5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9UaGlzIGZhaWwgaXMgYSBtaXhlZCBiYWctIHdlIHN1Y2NlZWQgYXQgZ2V0dGluZyBvdXIgZGF0YSwgYnV0IHdlIGRvbid0IG1hbmFnZSB0byBzYXZlIGl0IHRvIHRoZSBmaWxlIHN5c3RlbS5cclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBjb21wb3VuZHM6IGxhYmVscywgY29uY2VudHJhdGlvbnM6IG5vblplcm9Db25jZW50cmF0aW9ucywgc3RhdHVzOiBjaGVtb0ZsYWdzLmZhaWxGaWxlTm90U2F2ZWQgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHsgY29tcG91bmRzOiBsYWJlbHMsIGNvbmNlbnRyYXRpb25zOiBub25aZXJvQ29uY2VudHJhdGlvbnMsIHN0YXR1czogY2hlbW9GbGFncy5zdWNjZXNzIH07XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4geyB0cmFpbjogY2hlbW9UcmFpbiwgaW5mZXI6IGNoZW1vSW5mZXIsIGZsYWdzOiBjaGVtb0ZsYWdzIH07XHJcblxyXG59KTtcclxuXHJcbmFuZ3VsYXIubW9kdWxlKCdhcHAubm9kZVNlcnZpY2VzJylcclxuXHJcbi5zZXJ2aWNlKCdkYXRhYmFzZScsIGZ1bmN0aW9uICgkY29yZG92YUZpbGUpIHtcclxuXHJcbiAgICBmdW5jdGlvbiBnZXRGdWxsTmFtZShmaWxlTmFtZSwgaXNBbGdvcml0aG0sIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIGZ1bGxOYW1lO1xyXG4gICAgICAgIGlmIChpc0FsZ29yaXRobSkge1xyXG4gICAgICAgICAgICBpZiAoaXNQbHMpIHtcclxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lID0gXCJQTFNcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lID0gXCJQQ0FcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZnVsbE5hbWUgPSBcIkRBVFwiO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmdWxsTmFtZSA9IGZ1bGxOYW1lLmNvbmNhdChmaWxlTmFtZSk7XHJcbiAgICAgICAgZnVsbE5hbWUgPSBmdWxsTmFtZS5jb25jYXQoXCIucG1pclwiKTtcclxuICAgICAgICByZXR1cm4gZnVsbE5hbWVcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRNYW5hZ2VtZW50TmFtZShpc0FsZ29yaXRobSwgaXNQbHMpIHtcclxuICAgICAgICB2YXIgZmlsZU5hbWU7XHJcbiAgICAgICAgaWYgKGlzQWxnb3JpdGhtKSB7XHJcbiAgICAgICAgICAgIGlmIChpc1Bscykge1xyXG4gICAgICAgICAgICAgICAgZmlsZU5hbWUgPSBcIm1uZ21udFBscy5wbWlyXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBmaWxlTmFtZSA9IFwibW5nbW50UGNhLnBtaXJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgZmlsZU5hbWUgPSBcIm1uZ21udERhdC5wbWlyXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmaWxlTmFtZTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBsaW5lYXJTZWFyY2goYXJyLCBmaW5kKSB7XHJcbiAgICAgICAgdmFyIGxlbiA9IGFyci5sZW5ndGg7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xyXG4gICAgICAgICAgICBpZiAoYXJyW2ldID09IGZpbmQpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gbGlzdEVudHJpZXMoaXNBbGdvcml0aG0sIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIG1hbmFnZW1lbnRGaWxlTmFtZSA9IGdldE1hbmFnZW1lbnROYW1lKGlzQWxnb3JpdGhtLCBpc1Bscyk7XHJcbiAgICAgICAgdmFyIG1uZ21udEFyciA9IHsgZW50cmllczogW10gfTtcclxuICAgICAgICB2YXIgbWFuYWdlbWVudEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSk7XHJcbiAgICAgICAgbWFuYWdlbWVudEV4aXN0cy50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIC8vSWYgZXhpc3RzIHJlYWQgaW4gSnNvbiBzdHJpbmcgYW5kIGNvbnZlcnQgdG8gb2JqZWN0LCBhZGQgZWxlbWVudHMgYW5kIHB1c2ggYmFjayB0byBmaWxlLlxyXG4gICAgICAgICAgICB2YXIgbW5nbW50UmVhZCA9ICRjb3Jkb3ZhRmlsZS5yZWFkQXNUZXh0KGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgICAgICBtbmdtbnRSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyciA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcblxyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICAvL0lmIG5vIG1hbmFnZW1lbnQgZmlsZSwgcmV0dXJuIG5vIGZpbGVzLlxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtbmdtbnRBcnIuZW50cmllcztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpbnB1dE1vZGVsKGZpbGVOYW1lLCBhbGdvcml0aG0pIHtcclxuICAgICAgICB2YXIgb3V0cHV0ID0gYW5ndWxhci50b0pzb24oYWxnb3JpdGhtKTtcclxuICAgICAgICB2YXIgbW5nbW50QXJyID0geyBlbnRyaWVzOiBbZmlsZU5hbWVdIH07XHJcblxyXG4gICAgICAgIHZhciBpc1BscyA9IGFsZ29yaXRobS5tb2RlbE5hbWUgPT0gXCJQTFNcIjtcclxuICAgICAgICB2YXIgZnVsbEZpbGVOYW1lID0gZ2V0RnVsbE5hbWUoZmlsZU5hbWUsIHRydWUsIGlzUGxzKTtcclxuICAgICAgICB2YXIgbWFuYWdlbWVudEZpbGVOYW1lID0gZ2V0TWFuYWdlbWVudE5hbWUodHJ1ZSwgaXNQbHMpO1xyXG5cclxuICAgICAgICB2YXIgbWFuYWdlbWVudEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSk7XHJcbiAgICAgICAgbWFuYWdlbWVudEV4aXN0cy50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIC8vSWYgZXhpc3RzIHJlYWQgaW4gSnNvbiBzdHJpbmcgYW5kIGNvbnZlcnQgdG8gb2JqZWN0LCBhZGQgZWxlbWVudHMgYW5kIHB1c2ggYmFjayB0byBmaWxlLlxyXG4gICAgICAgICAgICB2YXIgbW5nbW50UmVhZCA9ICRjb3Jkb3ZhRmlsZS5yZWFkQXNUZXh0KGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUpO1xyXG4gICAgICAgICAgICBtbmdtbnRSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyciA9IGFuZ3VsYXIuZnJvbUpzb24oc3VjY2Vzcyk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbnVtRW50cmllcyA9IG1uZ21udEFyci5lbnRyaWVzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG1uZ21udEFyci5lbnRyaWVzW251bUVudHJpZXNdID0gZmlsZU5hbWU7XHJcbiAgICAgICAgICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dFdyaXR0ZW4gPSAkY29yZG92YUZpbGUud3JpdGVFeGlzdGluZ0ZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgYW5ndWxhci50b0pzb24obW5nbW50QXJyKSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IpIHsgfSk7XHJcblxyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICAvL0lmIG5vIG1hbmFnZW1lbnQgZmlsZSwgY3JlYXRlIG5ldyBvbmUgYW5kIG91dHB1dCBKU09OXHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRDcmVhdGVkID0gJGNvcmRvdmFGaWxlLmNyZWF0ZUZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIGFuZ3VsYXIudG9Kc29uKG1uZ21udEFycikpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB2YXIgb3V0cHV0RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICAvL0FkZCBjb25kaXRpb25hbHMgYXQgbGF0ZXIgdGltZSwgYWNjb3VudCBmb3IgbWVtb3J5IGF0IGFub3RoZXIgdGltZS5cclxuICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIG91dHB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gb3V0cHV0TW9kZWwoZmlsZU5hbWUsIGlzUGxzKSB7XHJcbiAgICAgICAgdmFyIGZ1bGxGaWxlTmFtZSA9IGdldEZ1bGxOYW1lKGZpbGVOYW1lLCB0cnVlLCBpc1Bscyk7XHJcbiAgICAgICAgdmFyIG1vZGVsID0gbnVsbDtcclxuICAgICAgICB2YXIgb3V0cHV0RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICBvdXRwdXRFeGlzdHMudGhlbihmdW5jdGlvbiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICB2YXIgZmlsZVJlYWQgPSAkY29yZG92YUZpbGUucmVhZEFzVGV4dChjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICAgICAgZmlsZVJlYWQudGhlbihmdW5jdGlvbiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgbW9kZWwgPSBhbmd1bGFyLmZyb21Kc29uKHN1Y2Nlc3MpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikgeyB9KTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBtb2RlbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpbnB1dERhdGFGaWxlKGFic29yYmFuY2VzLCBjb25jZW50cmF0aW9uTGFibGVzLCBjb25jZW50cmF0aW9ucywgZmlsZU5hbWUpIHtcclxuICAgICAgICB2YXIgZnVsbEZpbGVOYW1lID0gZ2V0RnVsbE5hbWUoZmlsZU5hbWUsIGZhbHNlKTtcclxuICAgICAgICB2YXIgbWFuYWdlbWVudEZpbGVOYW1lID0gZ2V0TWFuYWdlbWVudE5hbWUoZmFsc2UpO1xyXG4gICAgICAgIHZhciBtYW5hZ2VtZW50RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgbWFuYWdlbWVudEZpbGVOYW1lKTtcclxuICAgICAgICB2YXIgbW5nbW50QXJyID0geyBlbnRyaWVzOiBbZmlsZU5hbWVdIH07XHJcblxyXG4gICAgICAgIG1hbmFnZW1lbnRFeGlzdHMudGhlbihmdW5jdGlvbiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAvL0lmIGV4aXN0cyByZWFkIGluIEpzb24gc3RyaW5nIGFuZCBjb252ZXJ0IHRvIG9iamVjdCwgYWRkIGVsZW1lbnRzIGFuZCBwdXNoIGJhY2sgdG8gZmlsZS5cclxuICAgICAgICAgICAgdmFyIG1uZ21udFJlYWQgPSAkY29yZG92YUZpbGUucmVhZEFzVGV4dChjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgbWFuYWdlbWVudEZpbGVOYW1lKTtcclxuICAgICAgICAgICAgbW5nbW50UmVhZC50aGVuKGZ1bmN0aW9uIChzdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgICBtbmdtbnRBcnIgPSBhbmd1bGFyLmZyb21Kc29uKHN1Y2Nlc3MpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG51bUVudHJpZXMgPSBtbmdtbnRBcnIuZW50cmllcy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBtbmdtbnRBcnIuZW50cmllc1tudW1FbnRyaWVzXSA9IGZpbGVOYW1lO1xyXG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dENyZWF0ZWQgPSAkY29yZG92YUZpbGUuY3JlYXRlRmlsZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgbWFuYWdlbWVudEZpbGVOYW1lLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIGFuZ3VsYXIudG9Kc29uKG1uZ21udEFycikpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVycm9yKSB7IH0pO1xyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICAvL0lmIG5vIG1hbmFnZW1lbnQgZmlsZSwgY3JlYXRlIG5ldyBvbmUgYW5kIG91dHB1dCBKU09OXHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRDcmVhdGVkID0gJGNvcmRvdmFGaWxlLmNyZWF0ZUZpbGUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIG1hbmFnZW1lbnRGaWxlTmFtZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBtYW5hZ2VtZW50RmlsZU5hbWUsIGFuZ3VsYXIudG9Kc29uKG1uZ21udEFycikpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB2YXIgb3V0cHV0RXhpc3RzID0gJGNvcmRvdmFGaWxlLmNoZWNrTmFtZShjb3Jkb3ZhLmZpbGUuZGF0YURpcmVjdG9yeSwgZnVsbEZpbGVOYW1lKTtcclxuICAgICAgICB2YXIgb3V0cHV0Q3JlYXRlZCA9ICRjb3Jkb3ZhRmlsZS5jcmVhdGVGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIHRydWUpO1xyXG4gICAgICAgIHZhciBvdXRwdXQgPSB7IGFic29yYmFuY2VzOiBhYnNvcmJhbmNlcywgY29uY2VudHJhdGlvbnM6IGNvbmNlbnRyYXRpb25zLCBjb25jZW50cmF0aW9uTGFibGVzOiBjb25jZW50cmF0aW9uTGFibGVzIH1cclxuICAgICAgICBvdXRwdXQgPSBhbmd1bGFyLnRvSnNvbihvdXRwdXQpO1xyXG4gICAgICAgIHZhciBvdXRwdXRXcml0dGVuID0gJGNvcmRvdmFGaWxlLndyaXRlRXhpc3RpbmdGaWxlKGNvcmRvdmEuZmlsZS5kYXRhRGlyZWN0b3J5LCBmdWxsRmlsZU5hbWUsIG91dHB1dCk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gb3V0cHV0RGF0YUZpbGUoZmlsZU5hbWUpIHtcclxuICAgICAgICB2YXIgZnVsbEZpbGVOYW1lID0gZ2V0RnVsbE5hbWUoZmlsZU5hbWUsIGZhbHNlKTtcclxuICAgICAgICB2YXIgZGF0YSA9IHsgYWJzb3JiYW5jZXM6IFtdLCBjb25jZW50cmF0aW9uczogW10sIGNvbmNlbnRyYXRpb25MYWJlbHM6IFtdIH07XHJcbiAgICAgICAgdmFyIG91dHB1dEV4aXN0cyA9ICRjb3Jkb3ZhRmlsZS5jaGVja05hbWUoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSk7XHJcbiAgICAgICAgb3V0cHV0RXhpc3RzLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgdmFyIGZpbGVSZWFkID0gJGNvcmRvdmFGaWxlLnJlYWRBc1RleHQoY29yZG92YS5maWxlLmRhdGFEaXJlY3RvcnksIGZ1bGxGaWxlTmFtZSk7XHJcbiAgICAgICAgICAgIGZpbGVSZWFkLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgIGRhdGEgPSBhbmd1bGFyLmZyb21Kc29uKHN1Y2Nlc3MpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlcnJvcikgeyB9KTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7aW5wdXRNb2RlbDogaW5wdXRNb2RlbCwgb3V0cHV0TW9kZWw6IG91dHB1dE1vZGVsLCBpbnB1dERhdGFGaWxlOiBpbnB1dERhdGFGaWxlLCBvdXRwdXREYXRhRmlsZTogb3V0cHV0RGF0YUZpbGUsIGxpc3RFbnRyaWVzOmxpc3RFbnRyaWVzfTtcclxufSk7Il19
