// js/vsop87.js
export class VSOP87 {
    static bodies = {
        "EARTH": {
            L_base: 1.75347046,
            L_rate: 6283.07585,
            L0: [
                [3341656.48, 4.6692568, 6283.07585],
                [34894.27, 4.6261, 12566.1517],
                [3497.06, 2.7441, 5753.3849],
                [3418.15, 2.8289, 3.5231],
                [3136.00, 3.6277, 77713.7715],
                [2676.22, 4.4181, 7860.4194],
                [2342.92, 6.1352, 3930.2097],
                [1323.73, 0.7425, 11506.7698],
                [1273.49, 2.0371, 529.6910],
                [1199.19, 1.1096, 1577.3435]
            ],
            B0: [
                [280.20, 5.1985, 77713.7715],
                [102.32, 5.4226, 155427.543],
                [80.05, 3.880, 4.14],
                [44.02, 3.700, 77713.77],
                [32.32, 4.000, 77713.77]
            ],
            R0: [
                [100013989.0, 0.0, 0.0],
                [167070.0, 3.0984635, 6283.07585],
                [1399.0, 3.05525, 12566.1517],
                [308.0, 5.1985, 77713.7715],
                [162.0, 1.1739, 5753.3849],
                [157.0, 2.8469, 7860.4194],
                [145.0, 3.1416, 3.5231],
                [113.0, 0.4667, 11506.7698]
            ]
        }
    };

    static _computeSeries(terms, T) {
        let sum = 0;
        for (let i = 0; i < terms.length; i++) {
            sum += terms[i][0] * Math.cos(terms[i][1] + terms[i][2] * T);
        }
        return sum;
    }

    static getPosition(bodyName, daysSinceJ2000) {
        const T = daysSinceJ2000 / 365250.0;
        const terms = this.bodies[bodyName];
        
        if (!terms) return { x: 0, y: 0, z: 0 }; 

        const meanLongitude = terms.L_base + terms.L_rate * T;
        const L = meanLongitude + (this._computeSeries(terms.L0, T) / 1e8);
        const B = this._computeSeries(terms.B0, T) / 1e8;
        const R = this._computeSeries(terms.R0, T) / 1e8;

        const ast_x = R * Math.cos(B) * Math.cos(L);
        const ast_y = R * Math.cos(B) * Math.sin(L);
        const ast_z = R * Math.sin(B);

        return { x: ast_x, y: ast_z, z: -ast_y };
    }
}