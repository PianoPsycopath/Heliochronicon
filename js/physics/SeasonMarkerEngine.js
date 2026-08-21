// js/SeasonMarkerEngine.js
import { OrbitalMath } from '@physics/OrbitalMath.js';
import {
    JULIAN_CENTURY_DAYS,
    SEASON_MIN_RADIUS_KM,
    SEASON_ECCENTRICITY_THRESHOLD,
    SEASON_TILT_THRESHOLD_DEG,
    SEASON_DISTANCE_MODIFIER_DEG,
    SEASON_SYMBOLS,
} from '@core/constants.js';

const TWO_PI = Math.PI * 2;
const RAD = Math.PI / 180;
const ORBIT_SAMPLE_RESOLUTION = 360;
const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
function length(a) {
    return Math.hypot(a.x, a.y, a.z);
}
function normalize(a) {
    const len = length(a);
    if (!len || !isFinite(len)) return { x: 0, y: 0, z: 0 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}
function normalizeAngle(theta) {
    return ((theta % TWO_PI) + TWO_PI) % TWO_PI;
}
function angularDelta(a, b) {
    let d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    if (d > Math.PI) d = TWO_PI - d;
    return d;
}
//function lerpAngle(a0, a1, frac) {
//    let unwrapped = a1;
//    while (unwrapped - a0 > Math.PI) unwrapped -= TWO_PI;
//    while (unwrapped - a0 < -Math.PI) unwrapped += TWO_PI;
//    return normalizeAngle(a0 + (unwrapped - a0) * frac);
//}

export class SeasonMarkerEngine {
    // Regular moons inherit parent seasons (moon orbit is irrelevant to insolation).
    // Non-moons and moons with overrideParentSeasons compute their own.
    static resolveSeasonBody(targetBody, celestialBodies) {
        if (!targetBody) return null;
        if (targetBody.isMoon && !targetBody.data.overrideParentSeasons) {
            return (
                (celestialBodies || []).find((b) => b.data.name === targetBody.data.parent) || null
            );
        }
        return targetBody;
    }

    static formatCountdown(targetDate, now) {
        const ms = targetDate.getTime() - now.getTime();
        if (ms < 0) return 'passed';
        const days = Math.floor(ms / 86400000);
        const hours = Math.floor((ms % 86400000) / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        if (days > 0) return `in ${days} d ${hours} h ${mins} m`;
        if (hours > 0) return `in ${hours} h ${mins} m`;
        return `in ${mins} m`;
    }

    static computeMarkers(bodyData, daysSinceJ2000, systemDate) {
        if (!bodyData) return [];
        // Anchor stars (and any body orbiting itself) have no seasons.
        if (bodyData.parent === bodyData.name) return [];
        const period = bodyData.period > 0 ? bodyData.period : 0;
        if (period <= 0) return [];

        const samples = this._sampleOrbit(bodyData, daysSinceJ2000, period);
        if (samples.length < 4) return [];

        const orbitalNormal = this._computeOrbitalNormal(samples);
        if (!length(orbitalNormal)) return [];

        // Gate 1: size check
        const radiusKm = bodyData.radius_km || 0;
        let obliquityDeg = 0;
        if (radiusKm >= SEASON_MIN_RADIUS_KM) {
            const poleVec = this._computePoleVector(bodyData, daysSinceJ2000);
            obliquityDeg = this._computeObliquityDeg(poleVec, orbitalNormal);
        }

        const eccentricity = bodyData.e || 0;

        // Gate 3 vs Gate 2 vs Gate 4
        const isTiltDominated = obliquityDeg >= SEASON_TILT_THRESHOLD_DEG;
        const isDistanceDominated =
            !isTiltDominated && eccentricity >= SEASON_ECCENTRICITY_THRESHOLD;

        // (u, v) basis anchored on perihelion so true anomaly matches usual definition.
        let periSample = samples[0];
        let apoSample = samples[0];
        for (const s of samples) {
            if (s.dist < periSample.dist) periSample = s;
            if (s.dist > apoSample.dist) apoSample = s;
        }
        const u = normalize(periSample.pos);
        let v = normalize(cross(orbitalNormal, u));
        if (!length(v)) v = { x: 0, y: 0, z: 1 };

        for (const s of samples) {
            s.trueAnomaly = normalizeAngle(Math.atan2(dot(s.pos, v), dot(s.pos, u)));
        }
        periSample.trueAnomaly = 0;
        apoSample.trueAnomaly = Math.PI;

        const structuralMarkers = [
            this._assembleMarker(
                'perihelion',
                'PERI',
                'Perihelion',
                periSample.pos,
                periSample.t,
                periSample.trueAnomaly,
                systemDate
            ),
            this._assembleMarker(
                'aphelion',
                'APO',
                'Aphelion',
                apoSample.pos,
                apoSample.t,
                apoSample.trueAnomaly,
                systemDate
            ),
        ];

        // Gate 4: seasonless
        if (!isTiltDominated && !isDistanceDominated) {
            return structuralMarkers;
        }

        // Gate 2: distance-dominated
        if (isDistanceDominated) {
            return [
                this._assembleMarker(
                    'perihelion-hot',
                    'PERI_HOT',
                    'Perihelion (Thermal Max)',
                    periSample.pos,
                    periSample.t,
                    periSample.trueAnomaly,
                    systemDate
                ),
                this._assembleMarker(
                    'aphelion-cold',
                    'APO_COLD',
                    'Aphelion (Thermal Min)',
                    apoSample.pos,
                    apoSample.t,
                    apoSample.trueAnomaly,
                    systemDate
                ),
            ];
        }

        // Gate 3: tilt-dominated (4 season markers + structural peri/apo)
        const poleVec = this._computePoleVector(bodyData, daysSinceJ2000);
        const poleDotNormal = dot(poleVec, orbitalNormal);
        const poleProjRaw = {
            x: poleVec.x - poleDotNormal * orbitalNormal.x,
            y: poleVec.y - poleDotNormal * orbitalNormal.y,
            z: poleVec.z - poleDotNormal * orbitalNormal.z,
        };
        const poleProj = normalize(poleProjRaw);
        if (!length(poleProj)) return []; // pole ~parallel to orbital normal; solstices undefined

        const thetaWinter = normalizeAngle(Math.atan2(dot(poleProj, v), dot(poleProj, u)));
        const thetaSummer = normalizeAngle(thetaWinter + Math.PI);
        const thetaSpring = normalizeAngle(thetaSummer - Math.PI / 2);
        const thetaAutumn = normalizeAngle(thetaSummer + Math.PI / 2);

        const { ascTheta, descTheta } = this._findNodeThetas(samples);

        const events = [
            {
                id: 'summer-solstice',
                symbolKey: 'FIRE',
                season: 'Summer',
                kind: 'Solstice',
                theta: thetaSummer,
            },
            {
                id: 'winter-solstice',
                symbolKey: 'WATER',
                season: 'Winter',
                kind: 'Solstice',
                theta: thetaWinter,
            },
            {
                id: 'spring-equinox',
                symbolKey: 'AIR',
                season: 'Spring',
                kind: 'Equinox',
                theta: thetaSpring,
            },
            {
                id: 'autumn-equinox',
                symbolKey: 'EARTH',
                season: 'Autumn',
                kind: 'Equinox',
                theta: thetaAutumn,
            },
        ];
        const markers = events.map((ev) => {
            const tDays = this._findCrossingTime(samples, ev.theta);
            const pos = OrbitalMath.calculatePosition(bodyData, tDays);
            const label = this._buildTiltLabel(ev, ascTheta, descTheta);
            return this._assembleMarker(
                ev.id,
                ev.symbolKey,
                label,
                pos,
                tDays,
                ev.theta,
                systemDate
            );
        });

        markers.push(
            this._assembleMarker(
                'perihelion',
                'PERI',
                'Perihelion',
                periSample.pos,
                periSample.t,
                periSample.trueAnomaly,
                systemDate
            ),
            this._assembleMarker(
                'aphelion',
                'APO',
                'Aphelion',
                apoSample.pos,
                apoSample.t,
                apoSample.trueAnomaly,
                systemDate
            )
        );

        return markers;
    }

    static _sampleOrbit(bodyData, daysSinceJ2000, period) {
        const samples = [];
        // 5% margin so dynamic VSOP orbits still cover a full 360° true-anomaly sweep.
        const safePeriod = period * 1.05;

        for (let k = 0; k <= ORBIT_SAMPLE_RESOLUTION; k++) {
            const t = daysSinceJ2000 + (k / ORBIT_SAMPLE_RESOLUTION) * safePeriod;
            const pos = OrbitalMath.calculatePosition(bodyData, t);
            const dist = Math.hypot(pos.x, pos.y, pos.z);
            samples.push({ t, pos, dist });
        }
        return samples;
    }

    // Cross product of any two non-collinear sample positions gives the orbital normal.
    // Works for any eccentricity and both Kepler / analytic models.
    static _computeOrbitalNormal(samples) {
        const candidateOffsets = [0.25, 0.33, 0.1, 0.6];
        for (const frac of candidateOffsets) {
            const a = samples[0].pos;
            const b = samples[Math.floor(samples.length * frac)].pos;
            const n = cross(a, b);
            if (length(n) > 1e-9) return normalize(n);
        }
        return { x: 0, y: 1, z: 0 }; // degenerate fallback
    }

    // Match PhysicsEngine.calculateKeplerianKinematics pole vector convention
    // so obliquity is measured in the same frame the renderer uses.
    static _computePoleVector(bodyData, daysSinceJ2000) {
        const T = daysSinceJ2000 / JULIAN_CENTURY_DAYS;
        const raDeg = (bodyData.pole_ra || 0) + (bodyData.pole_ra_rate || 0) * T;
        const decDeg =
            (bodyData.pole_dec !== undefined ? bodyData.pole_dec : 90) +
            (bodyData.pole_dec_rate || 0) * T;

        const RA = raDeg * RAD;
        const DEC = decDeg * RAD;

        const eqX = Math.cos(DEC) * Math.cos(RA);
        const eqY = Math.cos(DEC) * Math.sin(RA);
        const eqZ = Math.sin(DEC);

        // Rotate equatorial → ecliptic (Earth obliquity ε ≈ 23.439°)
        const EPSILON = 23.4392911 * RAD;
        const cosEps = Math.cos(EPSILON);
        const sinEps = Math.sin(EPSILON);

        const eclX = eqX;
        const eclY = eqY * cosEps + eqZ * sinEps;
        const eclZ = -eqY * sinEps + eqZ * cosEps;

        // Map to THREE.js right-handed system (x=x, y=z, z=-y)
        return {
            x: eclX,
            y: eclZ,
            z: -eclY,
        };
    }

    static _computeObliquityDeg(poleVec, orbitalNormal) {
        const d = Math.max(-1, Math.min(1, dot(poleVec, orbitalNormal)));
        let deg = (Math.acos(d) * 180) / Math.PI;
        // Normalize retrograde planets (e.g. Venus 177° → 3°)
        return deg > 90 ? 180 - deg : deg;
    }

    // Locate ascending/descending node against the world ecliptic (y = 0).
    static _findNodeThetas(samples) {
        let maxIncrease = -Infinity;
        let maxDecrease = Infinity;
        let ascTheta = Math.PI / 2;
        let descTheta = Math.PI * 1.5;

        for (let k = 0; k < samples.length - 1; k++) {
            const delta = samples[k + 1].dist - samples[k].dist;
            if (delta > maxIncrease) {
                maxIncrease = delta;
                ascTheta = samples[k].trueAnomaly;
            }
            if (delta < maxDecrease) {
                maxDecrease = delta;
                descTheta = samples[k].trueAnomaly;
            }
        }

        return { ascTheta, descTheta };
    }

    // Linear interpolation of true-anomaly crossing time between bracketing samples.
    static _findCrossingTime(samples, targetTheta) {
        const theta = normalizeAngle(targetTheta);
        for (let k = 0; k < samples.length - 1; k++) {
            const a0 = normalizeAngle(samples[k].trueAnomaly);
            let a1 = normalizeAngle(samples[k + 1].trueAnomaly);
            if (a1 < a0) a1 += TWO_PI;
            let thetaU = theta;
            if (thetaU < a0) thetaU += TWO_PI;
            if (thetaU >= a0 && thetaU <= a1) {
                const span = a1 - a0;
                const frac = span > 1e-9 ? (thetaU - a0) / span : 0;
                return samples[k].t + frac * (samples[k + 1].t - samples[k].t);
            }
        }
        // Fallback: nearest sample by angular distance.
        let best = samples[0];
        let bestDelta = Infinity;
        for (const s of samples) {
            const delta = angularDelta(s.trueAnomaly, theta);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = s;
            }
        }
        return best.t;
    }

    // Distance modifier for solstices, node modifier for equinoxes.
    static _buildTiltLabel(ev, ascTheta, descTheta) {
        const windowRad = SEASON_DISTANCE_MODIFIER_DEG * RAD;

        const nearPeri = angularDelta(ev.theta, 0) <= windowRad;
        const nearApo = angularDelta(ev.theta, Math.PI) <= windowRad;
        const nearAsc = angularDelta(ev.theta, ascTheta) <= windowRad;
        const nearDesc = angularDelta(ev.theta, descTheta) <= windowRad;

        const distanceModifier = nearPeri ? 'Perihelion' : nearApo ? 'Aphelion' : null;
        const nodeModifier = nearAsc ? 'Ascending' : nearDesc ? 'Descending' : null;

        const modifier =
            ev.kind === 'Equinox'
                ? nodeModifier || distanceModifier
                : distanceModifier || nodeModifier;

        if (modifier) return `${modifier} ${ev.season}`;
        return `${ev.season} ${ev.kind}`;
    }

    static _assembleMarker(id, symbolKey, label, pos, tDays, trueAnomaly, systemDate) {
        const date = new Date(J2000_EPOCH_MS + tDays * 86400000);
        return {
            id,
            symbolKey,
            symbol: SEASON_SYMBOLS[symbolKey],
            label,
            position: { x: pos.x, y: pos.y, z: pos.z },
            date,
            countdownText: this.formatCountdown(date, systemDate),
            trueAnomaly,
        };
    }
}
