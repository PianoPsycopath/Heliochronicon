// js/navigation/LambertSolver.js

const DEFAULT_TOLERANCE = 1e-8;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TRAJECTORY_SAMPLES = 20;
const NEAR_ZERO = 1e-10;

function isVector3(v) {
    return !!v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

function requireVector3(v, label) {
    if (!isVector3(v)) {
        throw new Error(`LambertSolver requires "${label}" to be a { x, y, z } vector of numbers`);
    }
}

function requirePositiveNumber(value, label) {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        throw new Error(`LambertSolver requires a positive numeric "${label}"`);
    }
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function norm(v) {
    return Math.sqrt(dot(v, v));
}

function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

// --- Stumpff functions -----------------------------------------------------

function stumpffC(z) {
    if (z > NEAR_ZERO) {
        return (1 - Math.cos(Math.sqrt(z))) / z;
    }
    if (z < -NEAR_ZERO) {
        return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
    }
    return 1 / 2 - z / 24 + (z * z) / 720;
}

function stumpffS(z) {
    if (z > NEAR_ZERO) {
        const sz = Math.sqrt(z);
        return (sz - Math.sin(sz)) / (sz * sz * sz);
    }
    if (z < -NEAR_ZERO) {
        const sz = Math.sqrt(-z);
        return (Math.sinh(sz) - sz) / (sz * sz * sz);
    }
    return 1 / 6 - z / 120 + (z * z) / 5040;
}

function transferAngle(r1Vec, r2Vec, r1, r2, longWay) {
    const cosTheta = Math.min(1, Math.max(-1, dot(r1Vec, r2Vec) / (r1 * r2)));
    const theta = Math.acos(cosTheta);
    return longWay ? 2 * Math.PI - theta : theta;
}

export class LambertSolver {
    /**
     * @param {object} params
     * @param {{x:number,y:number,z:number}} params.r1 - departure position
     * @param {{x:number,y:number,z:number}} params.r2 - arrival position
     * @param {number} params.tof - time of flight (> 0), same time unit as mu
     * @param {number} params.mu - gravitational parameter of the attracting body
     * @param {boolean} [params.longWay]
     * @param {number} [params.tolerance]
     * @param {number} [params.maxIterations]
     * @returns {{
     *   departureVelocity: {x:number,y:number,z:number},
     *   arrivalVelocity: {x:number,y:number,z:number},
     *   transferAngle: number,
     *   universalAnomaly: number,
     *   iterations: number
     * }}
     */
    static solve({
        r1: r1Vec,
        r2: r2Vec,
        tof,
        mu,
        longWay = false,
        tolerance = DEFAULT_TOLERANCE,
        maxIterations = DEFAULT_MAX_ITERATIONS,
    }) {
        requireVector3(r1Vec, 'r1');
        requireVector3(r2Vec, 'r2');
        requirePositiveNumber(tof, 'tof');
        requirePositiveNumber(mu, 'mu');

        const r1 = norm(r1Vec);
        const r2 = norm(r2Vec);

        if (r1 <= NEAR_ZERO || r2 <= NEAR_ZERO) {
            throw new Error('LambertSolver requires non-zero position vectors');
        }

        const theta = transferAngle(r1Vec, r2Vec, r1, r2, longWay);
        const sinTheta = Math.sin(theta);

        if (Math.abs(sinTheta) < NEAR_ZERO) {
            throw new Error(
                'LambertSolver cannot solve a transfer angle of 0 or 180 degrees (singular geometry); ' +
                    'perturb r1/r2 or the longWay flag slightly to avoid the exact singularity'
            );
        }

        const A = sinTheta * Math.sqrt((r1 * r2) / (1 - Math.cos(theta)));

        const yOf = (z) => r1 + r2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));

        // Newton-Raphson on F(z) = (y/C)^1.5 * S + A*sqrt(y) - sqrt(mu)*tof.
        let z = 0;
        let iterations = 0;
        let converged = false;

        while (A > 0 && yOf(z) < 0) {
            z += 0.1;
        }

        for (; iterations < maxIterations; iterations++) {
            const C = stumpffC(z);
            const S = stumpffS(z);
            const y = yOf(z);

            if (y < 0) {
                // Only possible when A < 0; walk z up until y is real/positive again.
                z += 0.1;
                continue;
            }

            const sqrtY = Math.sqrt(y);
            const F = Math.pow(y / C, 1.5) * S + A * sqrtY - Math.sqrt(mu) * tof;

            let dF;
            if (Math.abs(z) < NEAR_ZERO) {
                const y0 = yOf(0);
                dF =
                    (Math.sqrt(2) / 40) * Math.pow(y0, 1.5) +
                    (A / 8) * (Math.sqrt(y0) + A * Math.sqrt(1 / (2 * y0)));
            } else {
                dF =
                    Math.pow(y / C, 1.5) *
                        ((1 / (2 * z)) * (C - (3 * S) / (2 * C)) + (3 * S * S) / (4 * C)) +
                    (A / 8) * ((3 * S * sqrtY) / C + A * Math.sqrt(C / y));
            }

            const delta = F / dF;
            const zNext = z - delta;

            if (Math.abs(zNext - z) < tolerance) {
                z = zNext;
                converged = true;
                iterations++;
                break;
            }
            z = zNext;
        }

        if (!converged) {
            throw new Error(
                `LambertSolver did not converge within ${maxIterations} iterations for the given r1/r2/tof/mu`
            );
        }

        const y = yOf(z);

        const f = 1 - y / r1;
        const g = A * Math.sqrt(y / mu);
        const gDot = 1 - y / r2;

        if (Math.abs(g) < NEAR_ZERO) {
            throw new Error('LambertSolver produced a singular Lagrange coefficient (g ~ 0)');
        }

        const departureVelocity = scale(subtract(r2Vec, scale(r1Vec, f)), 1 / g);
        const arrivalVelocity = scale(subtract(scale(r2Vec, gDot), r1Vec), 1 / g);

        return {
            departureVelocity,
            arrivalVelocity,
            transferAngle: theta,
            universalAnomaly: z,
            iterations,
        };
    }

    /**
     * @param {object} params
     * @param {{x:number,y:number,z:number}} params.r0
     * @param {{x:number,y:number,z:number}} params.v0
     * @param {number} params.tof - may be negative to propagate backward
     * @param {number} params.mu
     * @param {number} [params.tolerance]
     * @param {number} [params.maxIterations]
     * @returns {{
     *   position: {x:number,y:number,z:number},
     *   velocity: {x:number,y:number,z:number}
     * }}
     */
    static propagate({
        r0: r0Vec,
        v0: v0Vec,
        tof,
        mu,
        tolerance = DEFAULT_TOLERANCE,
        maxIterations = DEFAULT_MAX_ITERATIONS,
    }) {
        requireVector3(r0Vec, 'r0');
        requireVector3(v0Vec, 'v0');
        if (typeof tof !== 'number' || Number.isNaN(tof)) {
            throw new Error('LambertSolver.propagate requires a numeric "tof"');
        }
        requirePositiveNumber(mu, 'mu');

        if (tof === 0) {
            return { position: { ...r0Vec }, velocity: { ...v0Vec } };
        }

        const r0 = norm(r0Vec);
        const v0 = norm(v0Vec);

        if (r0 <= NEAR_ZERO) {
            throw new Error('LambertSolver.propagate requires a non-zero r0');
        }

        const vr0 = dot(r0Vec, v0Vec) / r0;
        const alpha = 2 / r0 - (v0 * v0) / mu;
        const sqrtMu = Math.sqrt(mu);

        let chi = sqrtMu * Math.abs(alpha) * tof;
        let converged = false;

        for (let iterations = 0; iterations < maxIterations; iterations++) {
            const z = alpha * chi * chi;
            const C = stumpffC(z);
            const S = stumpffS(z);

            const F =
                ((r0 * vr0) / sqrtMu) * chi * chi * C +
                (1 - alpha * r0) * chi * chi * chi * S +
                r0 * chi -
                sqrtMu * tof;
            const dF =
                ((r0 * vr0) / sqrtMu) * chi * (1 - alpha * chi * chi * S) +
                (1 - alpha * r0) * chi * chi * C +
                r0;

            const chiNext = chi - F / dF;

            if (Math.abs(chiNext - chi) < tolerance) {
                chi = chiNext;
                converged = true;
                break;
            }
            chi = chiNext;
        }

        if (!converged) {
            throw new Error(
                `LambertSolver.propagate did not converge within ${maxIterations} iterations`
            );
        }

        const z = alpha * chi * chi;
        const C = stumpffC(z);
        const S = stumpffS(z);

        const f = 1 - (chi * chi * C) / r0;
        const g = tof - (chi * chi * chi * S) / sqrtMu;

        const position = add(scale(r0Vec, f), scale(v0Vec, g));
        const r = norm(position);

        const gDot = 1 - (chi * chi * C) / r;
        const fDot = (sqrtMu / (r * r0)) * (alpha * chi * chi * chi * S - chi);

        const velocity = add(scale(r0Vec, fDot), scale(v0Vec, gDot));

        return { position, velocity };
    }

    /**

     * @param {object} params
     * @param {{x:number,y:number,z:number}} params.r1 - departure position
     * @param {{x:number,y:number,z:number}} params.v1 - departure velocity
     * @param {number} params.tof
     * @param {number} params.mu
     * @param {number} [params.samples] 
     * @returns {Array<{t:number, position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}>}
     */
    static sampleTrajectory({ r1, v1, tof, mu, samples = DEFAULT_TRAJECTORY_SAMPLES }) {
        requireVector3(r1, 'r1');
        requireVector3(v1, 'v1');
        requirePositiveNumber(tof, 'tof');
        requirePositiveNumber(mu, 'mu');
        if (!Number.isInteger(samples) || samples < 2) {
            throw new Error('LambertSolver.sampleTrajectory requires an integer "samples" >= 2');
        }

        const points = [];
        for (let index = 0; index < samples; index++) {
            const t = (tof * index) / (samples - 1);
            const state =
                t === 0
                    ? { position: { ...r1 }, velocity: { ...v1 } }
                    : LambertSolver.propagate({ r0: r1, v0: v1, tof: t, mu });
            points.push({ t, position: state.position, velocity: state.velocity });
        }
        return points;
    }
}