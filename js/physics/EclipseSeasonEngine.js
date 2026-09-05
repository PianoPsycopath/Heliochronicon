import { OrbitalMath, kmToAU } from '@physics/OrbitalMath.js';

const DEFAULT_SAMPLE_COUNT = 720;
const MIN_VECTOR_LENGTH = 1e-12;

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
function length(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}
function normalize(vector) {
    const magnitude = length(vector);
    if (magnitude <= MIN_VECTOR_LENGTH || !Number.isFinite(magnitude)) return null;
    return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function angularDistanceFromPlane(direction, normal) {
    return Math.asin(Math.abs(clamp(dot(direction, normal), -1, 1)));
}

export class EclipseSeasonEngine {
    static computeSeasons(moonData, parentData, sunData, daysSinceJ2000, options = {}) {
        if (!moonData || !parentData || !sunData) return [];
        if (moonData.parent !== parentData.name || parentData.parent === parentData.name) return [];

        const parentPeriod = Number(parentData.period);
        const moonPeriod = Number(moonData.period);
        if (!(parentPeriod > 0) || !(moonPeriod > 0)) return [];

        const sampleCount = options.sampleCount || DEFAULT_SAMPLE_COUNT;
        const span = options.spanDays || parentPeriod;
        const start = daysSinceJ2000;
        const end = start + span;
        const step = (end - start) / sampleCount;
        const samples = [];

        for (let index = 0; index <= sampleCount; index++) {
            const time = start + index * step;
            const parentPosition = OrbitalMath.calculatePosition(parentData, time);
            const moonPosition = OrbitalMath.calculatePosition(moonData, time);
            const moonNormal = this._getOrbitalNormal(moonData, time, moonPeriod);
            const parentNormal = this._getOrbitalNormal(parentData, time, parentPeriod);
            const parentDirection = normalize(parentPosition);
            if (!moonNormal || !parentNormal || !parentDirection) continue;

            const nodeLine = normalize(cross(moonNormal, parentNormal));
            if (!nodeLine) continue;

            const moonDistance = length(moonPosition);
            const sunDistance = length(parentPosition);
            if (!(moonDistance > 0) || !(sunDistance > 0)) continue;

            const tolerance = this._getSolarAlignmentTolerance(
                moonData,
                sunData,
                moonDistance,
                sunDistance
            );
            const sunDirection = { x: -parentDirection.x, y: -parentDirection.y, z: -parentDirection.z };
            const planeDistance = angularDistanceFromPlane(sunDirection, moonNormal);
            const nodeAlignment = Math.asin(Math.abs(clamp(dot(sunDirection, nodeLine), -1, 1)));

            samples.push({
                time,
                parentPosition,
                tolerance,
                planeDistance,
                nodeAlignment,
            });
        }

        return this._buildWindows(samples);
    }

    static _getOrbitalNormal(bodyData, time, period) {
        const delta = Math.max(period * 0.125, 1e-6);
        const previous = OrbitalMath.calculatePosition(bodyData, time - delta);
        const current = OrbitalMath.calculatePosition(bodyData, time);
        const next = OrbitalMath.calculatePosition(bodyData, time + delta);
        return normalize(cross(subtract(current, previous), subtract(next, current))) ||
            normalize(cross(previous, next));
    }

    static _getSolarAlignmentTolerance(moonData, sunData, moonDistance, sunDistance) {
        const moonRadius = kmToAU(moonData.radius_km || 0);
        const sunRadius = kmToAU(sunData.radius_km || 0);
        if (!(moonRadius >= 0) || !(sunRadius > 0)) return 0;

        const moonAngularRadius = Math.asin(clamp(moonRadius / moonDistance, 0, 1));
        const sunAngularRadius = Math.asin(clamp(sunRadius / sunDistance, 0, 1));
        return moonAngularRadius + sunAngularRadius;
    }

    static _buildWindows(samples) {
        if (samples.length < 2) return [];
        const windows = [];
        let activeStart = null;

        for (let index = 0; index < samples.length; index++) {
            const sample = samples[index];
            const active = sample.planeDistance <= sample.tolerance;
            if (active && activeStart === null) {
                activeStart = index === 0 ? sample : this._interpolateBoundary(samples[index - 1], sample);
            }

            const isLast = index === samples.length - 1;
            if ((!active || isLast) && activeStart !== null) {
                const end = active
                    ? sample
                    : this._interpolateBoundary(samples[index - 1], sample);
                if (end.time > activeStart.time) {
                    windows.push(this._createWindow(activeStart, end, samples));
                }
                activeStart = null;
            }
        }
        return windows;
    }

    static _interpolateBoundary(a, b) {
        const aValue = a.planeDistance - a.tolerance;
        const bValue = b.planeDistance - b.tolerance;
        const denominator = aValue - bValue;
        const fraction = Math.abs(denominator) > 1e-12 ? aValue / denominator : 0.5;
        const clampedFraction = clamp(fraction, 0, 1);
        return {
            time: a.time + (b.time - a.time) * clampedFraction,
            parentPosition: {
                x: a.parentPosition.x + (b.parentPosition.x - a.parentPosition.x) * clampedFraction,
                y: a.parentPosition.y + (b.parentPosition.y - a.parentPosition.y) * clampedFraction,
                z: a.parentPosition.z + (b.parentPosition.z - a.parentPosition.z) * clampedFraction,
            },
        };
    }

    static _createWindow(start, end, samples) {
        const center = this._findClosestToNode(samples, start.time, end.time);
        return {
            startTime: start.time,
            endTime: end.time,
            centerTime: center.time,
            startPosition: start.parentPosition,
            endPosition: end.parentPosition,
            centerPosition: center.parentPosition,
        };
    }

    static _findClosestToNode(samples, startTime, endTime) {
        let best = samples[0];
        let bestDistance = Infinity;
        for (const sample of samples) {
            if (sample.time < startTime || sample.time > endTime) continue;
            if (sample.nodeAlignment < bestDistance) {
                best = sample;
                bestDistance = sample.nodeAlignment;
            }
        }
        return best;
    }
}
