import { OrbitalMath, kmToAU } from '@physics/OrbitalMath.js';
import { AU_IN_KM } from '@core/constants.js';

const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const MAX_SAMPLES = 720;
const ROOT_TOLERANCE = 1e-10;
const POSITION_EPSILON_DAYS = 1e-3;

export class EclipseSeasonEngine {
    static calculate(moonData, parentData, starData, bodiesByName, fromDays) {
        if (!moonData || moonData.category !== 'MOON') return [];
        if (!parentData || !starData) return [];
        if (!Number.isFinite(parentData.period) || parentData.period <= 0) return [];
        const period = parentData.period;
        const endDays = fromDays + period;
        const samples = MAX_SAMPLES;
        const step = period / samples;
        const values = new Array(samples + 1);
        for (let index = 0; index <= samples; index++) {
            const days = fromDays + index * step;
            values[index] = this._isInSeason(moonData, parentData, starData, bodiesByName, days);
        }
        if (values.every(Boolean)) {
            return [{ startDays: fromDays, endDays }];
        }
        if (values.every((value) => !value)) {
            return [];
        }
        const intervals = [];
        let inside = values[0];
        let startDays = inside ? fromDays : null;
        for (let index = 1; index <= samples; index++) {
            const current = values[index];
            if (current === inside) continue;
            const left = fromDays + (index - 1) * step;
            const right = fromDays + index * step;
            const boundary = this._refineBoundary(moonData, parentData, starData, bodiesByName, left, right, inside);
            if (current) {
                startDays = boundary;
            } else if (startDays !== null) {
                intervals.push({ startDays, endDays: boundary });
                startDays = null;
            }
            inside = current;
        }
        if (inside && startDays !== null) {
            intervals.push({ startDays, endDays });
        }
        return intervals;
    }
    static _isInSeason(moonData, parentData, starData, bodiesByName, days) {
        const geometry = this._getGeometry(moonData, parentData, starData, bodiesByName, days);
        if (!geometry) return false;
        const { moonNormal, parentNormal, moonDistance, sunDistance } = geometry;
        const planeDot = Math.min(1, Math.max(-1, Math.abs(this._dot(moonNormal, parentNormal))));
        const inclination = Math.acos(planeDot);
        const betaLimit = this._getPhysicalLatitudeLimit(parentData, moonData, starData, moonDistance, sunDistance);
        if (betaLimit === null) return false;
        if (inclination <= betaLimit + ROOT_TOLERANCE) return true;
        const sinInclination = Math.sin(inclination);
        if (sinInclination <= ROOT_TOLERANCE) return true;
        const ratio = Math.sin(betaLimit) / sinInclination;
        if (ratio >= 1) return true;
        if (ratio <= 0) return false;
        const maximumNodeLongitude = Math.asin(ratio);
        const nodeDirection = this._cross(moonNormal, parentNormal);
        const nodeLength = this._length(nodeDirection);
        if (nodeLength <= ROOT_TOLERANCE) return true;
        this._normalize(nodeDirection);
        const parentPosition = this._getAbsolutePosition(parentData, bodiesByName, days, new Map());
        if (!parentPosition) return false;
        const sunDirection = { x: -parentPosition.x, y: -parentPosition.y, z: -parentPosition.z };
        this._normalize(sunDirection);
        const nodeAlignment = Math.min(1, Math.max(0, Math.abs(this._dot(sunDirection, nodeDirection))));
        const nodeLongitude = Math.acos(nodeAlignment);
        return nodeLongitude <= maximumNodeLongitude + ROOT_TOLERANCE;
    }
    static _getGeometry(moonData, parentData, starData, bodiesByName, days) {
        const epsilon = this._positionStep(moonData, parentData);
        const moonBefore = this._getAbsolutePosition(moonData, bodiesByName, days - epsilon, new Map());
        const moonAfter = this._getAbsolutePosition(moonData, bodiesByName, days + epsilon, new Map());
        const parentBefore = this._getAbsolutePosition(parentData, bodiesByName, days - epsilon, new Map());
        const parentAfter = this._getAbsolutePosition(parentData, bodiesByName, days + epsilon, new Map());
        const parentPosition = this._getAbsolutePosition(parentData, bodiesByName, days, new Map());
        const moonPosition = this._getAbsolutePosition(moonData, bodiesByName, days, new Map());
        if (!moonBefore || !moonAfter || !parentBefore || !parentAfter || !parentPosition || !moonPosition) {
            return null;
        }
        const moonRelativeBefore = this._subtract(moonBefore, parentBefore);
        const moonRelativeAfter = this._subtract(moonAfter, parentAfter);
        const moonRelative = this._subtract(moonPosition, parentPosition);
        const moonVelocity = this._subtract(moonRelativeAfter, moonRelativeBefore);
        const moonNormal = this._cross(moonRelative, moonVelocity);
        const parentVelocity = this._subtract(parentAfter, parentBefore);
        const parentNormal = this._cross(parentPosition, parentVelocity);
        if (this._length(moonNormal) <= ROOT_TOLERANCE || this._length(parentNormal) <= ROOT_TOLERANCE) {
            return null;
        }
        this._normalize(moonNormal);
        this._normalize(parentNormal);
        return { moonNormal, parentNormal, moonDistance: this._length(moonRelative), sunDistance: this._length(parentPosition) };
    }
    static _getPhysicalLatitudeLimit(parentData, moonData, starData, moonDistance, sunDistance) {
        const parentRadius = this._radiusAU(parentData);
        const moonRadius = this._radiusAU(moonData);
        const starRadius = this._radiusAU(starData);
        if (parentRadius === null || moonRadius === null || starRadius === null || moonDistance <= 0 || sunDistance <= 0) {
            return null;
        }
        const solarUmbraDistance = moonRadius + (moonDistance * (starRadius + moonRadius)) / sunDistance;
        const solarTolerance = (solarUmbraDistance + parentRadius) / moonDistance;
        const lunarPenumbraDistance = parentRadius + (moonDistance * (starRadius + parentRadius)) / sunDistance;
        const lunarTolerance = (lunarPenumbraDistance + moonRadius) / moonDistance;
        const tolerance = Math.min(1, Math.max(solarTolerance, lunarTolerance));
        return Math.asin(tolerance);
    }
    static _refineBoundary(moonData, parentData, starData, bodiesByName, left, right, leftInside) {
        let lo = left;
        let hi = right;
        for (let iteration = 0; iteration < 32; iteration++) {
            const mid = (lo + hi) * 0.5;
            const inside = this._isInSeason(moonData, parentData, starData, bodiesByName, mid);
            if (inside === leftInside) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return (lo + hi) * 0.5;
    }
    static getOrbitProgress(bodyData, days) {
        if (bodyData.orbit_model === 'MEEUS' || bodyData.orbit_model === 'VSOP87') {
            if (!Number.isFinite(bodyData.period) || bodyData.period <= 0) return null;
            return this._normalizePhase(days / bodyData.period);
        }
        if (!Number.isFinite(bodyData.n)) return null;
        const meanAnomaly = bodyData.M0 + bodyData.n * days;
        const trueAnomaly = OrbitalMath.getTrueAnomaly(meanAnomaly, bodyData.e);
        return this._normalizePhase(trueAnomaly / TWO_PI);
    }
    static _getAbsolutePosition(bodyData, bodiesByName, days, cache) {
        const cacheKey = `${bodyData.name}:${days}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        let position;
        if (bodyData.parent === bodyData.name) {
            position = { x: 0, y: 0, z: 0 };
        } else {
            const local = OrbitalMath.calculatePosition(bodyData, days);
            if (!local) return null;
            const localPosition = { x: local.x, y: local.y, z: local.z };
            if (bodyData.category === 'MOON' && (!bodyData.orbit_model || bodyData.orbit_model === 'KEPLER')) {
                const parentData = bodiesByName.get(bodyData.parent);
                if (parentData) this._applyPoleRotation(localPosition, parentData, days);
            }
            const parentData = bodiesByName.get(bodyData.parent);
            const parentPosition = parentData ? this._getAbsolutePosition(parentData, bodiesByName, days, cache) : { x: 0, y: 0, z: 0 };
            if (!parentPosition) return null;
            position = { x: localPosition.x + parentPosition.x, y: localPosition.y + parentPosition.y, z: localPosition.z + parentPosition.z };
        }
        cache.set(cacheKey, position);
        return position;
    }
    static _applyPoleRotation(vector, bodyData, days) {
        const T = days / 36525;
        const rad = DEG_TO_RAD;
        const ra = (bodyData.pole_ra + bodyData.pole_ra_rate * T) * rad;
        const dec = (bodyData.pole_dec + bodyData.pole_dec_rate * T) * rad;
        const pole = { x: Math.cos(dec) * Math.cos(ra), y: Math.sin(dec), z: -Math.cos(dec) * Math.sin(ra) };
        const source = { x: 0, y: 1, z: 0 };
        const axis = this._cross(source, pole);
        const axisLength = this._length(axis);
        const dot = Math.min(1, Math.max(-1, this._dot(source, pole)));
        if (axisLength <= ROOT_TOLERANCE) {
            if (dot >= 0) return;
            vector.x = -vector.x;
            vector.y = -vector.y;
            vector.z = -vector.z;
            return;
        }
        this._normalize(axis);
        const angle = Math.acos(dot);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = vector.x;
        const y = vector.y;
        const z = vector.z;
        const crossX = axis.y * z - axis.z * y;
        const crossY = axis.z * x - axis.x * z;
        const crossZ = axis.x * y - axis.y * x;
        const axisDotVector = axis.x * x + axis.y * y + axis.z * z;
        const oneMinusCos = 1 - cos;
        vector.x = x * cos + crossX * sin + axis.x * axisDotVector * oneMinusCos;
        vector.y = y * cos + crossY * sin + axis.y * axisDotVector * oneMinusCos;
        vector.z = z * cos + crossZ * sin + axis.z * axisDotVector * oneMinusCos;
    }
    static _positionStep(moonData, parentData) {
        const moonPeriod = Number.isFinite(moonData.period) ? Math.abs(moonData.period) : Infinity;
        const parentPeriod = Number.isFinite(parentData.period) ? Math.abs(parentData.period) : Infinity;
        return Math.max(POSITION_EPSILON_DAYS, Math.min(0.25, moonPeriod / 100, parentPeriod / 100));
    }
    static _radiusAU(data) {
        if (!Number.isFinite(data.radius_km) || data.radius_km <= 0) return null;
        return kmToAU(data.radius_km);
    }
    static _normalizePhase(value) {
        return ((value % 1) + 1) % 1;
    }
    static _subtract(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }
    static _cross(a, b) {
        return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    }
    static _dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    static _length(vector) {
        return Math.hypot(vector.x, vector.y, vector.z);
    }
    static _normalize(vector) {
        const length = this._length(vector);
        if (length <= ROOT_TOLERANCE) return vector;
        vector.x /= length;
        vector.y /= length;
        vector.z /= length;
        return vector;
    }
}