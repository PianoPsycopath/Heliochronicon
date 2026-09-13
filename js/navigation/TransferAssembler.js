// js/navigation/TransferAssembler.js

import { LambertSolver } from '@navigation/LambertSolver.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { Fleet } from '@navigation/Fleet.js';
import { FlightPlan } from '@navigation/FlightPlan.js';
const STANDARD_GRAVITY_M_S2 = 9.80665;
const DEFAULT_VELOCITY_UNIT_TO_METERS_PER_SECOND = 1000;

function isVector3(v) {
    return !!v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

function subtractVectors(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vectorMagnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`TransferAssembler requires a numeric "${label}"`);
    }
}

function requirePositiveNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`TransferAssembler requires a positive numeric "${label}"`);
    }
}

function requireNonNegativeNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`TransferAssembler requires a non-negative numeric "${label}"`);
    }
}

export class TransferAssembler {
    /**
     * @param {object} params
     * @param {object} params.fleet - fleet runtime state, expected to expose
     *   `position` / `velocity` vectors when tracked (see DefaultFleetState.js)
     * @param {object} [params.originBodyData] - ephemeris body data for the
     *   body the fleet is parked at; used only as a fallback
     * @param {number} params.departureEpochDaysJ2000
     * @param {number} [params.stepDays] - forwarded to EphemerisAdapter for
     *   the fallback path's velocity finite-difference step
     * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
     */
    static resolveOriginState({ fleet, originBodyData, departureEpochDaysJ2000, stepDays }) {
        if (!fleet || typeof fleet !== 'object') {
            throw new Error('TransferAssembler requires a fleet runtime state object');
        }

        if (isVector3(fleet.position) && isVector3(fleet.velocity)) {
            return {
                position: { ...fleet.position },
                velocity: { ...fleet.velocity },
            };
        }

        if (originBodyData) {
            requireFiniteNumber(departureEpochDaysJ2000, 'departureEpochDaysJ2000');
            return EphemerisAdapter.getState(
                originBodyData,
                departureEpochDaysJ2000,
                stepDays !== undefined ? { stepDays } : undefined
            );
        }

        throw new Error(
            'TransferAssembler could not resolve an origin state: the fleet has no tracked ' +
                'position/velocity and no "originBodyData" was supplied to fall back on'
        );
    }

    /**
     * @param {object} params
     * @param {object} params.targetBodyData - raw ephemeris body data (the
     * @param {number} params.arrivalEpochDaysJ2000
     * @param {number} [params.stepDays]
     * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
     */
    static resolveTargetState({ targetBodyData, arrivalEpochDaysJ2000, stepDays }) {
        if (!targetBodyData || typeof targetBodyData !== 'object') {
            throw new Error('TransferAssembler requires "targetBodyData" for the ephemeris lookup');
        }
        requireFiniteNumber(arrivalEpochDaysJ2000, 'arrivalEpochDaysJ2000');

        return EphemerisAdapter.getState(
            targetBodyData,
            arrivalEpochDaysJ2000,
            stepDays !== undefined ? { stepDays } : undefined
        );
    }

    /**
     * @param {object} params
     * @param {object} params.fleet - fleet runtime state (see DefaultFleetState.js)
     * @param {object} [params.originBodyData] - fallback ephemeris body data,
     *   used only when the fleet has no tracked position/velocity yet
     * @param {object} params.targetBodyData - raw ephemeris body data for the target
     * @param {number} params.departureEpochDaysJ2000
     * @param {number} params.arrivalEpochDaysJ2000 - must be after departure
     * @param {number} params.mu - gravitational parameter, in units consistent
     *   with the epochs (e.g. AU^3/day^2 when epochs are in days)
     * @param {boolean} [params.longWay]
     * @param {number} [params.tolerance] - forwarded to LambertSolver.solve
     * @param {number} [params.maxIterations] - forwarded to LambertSolver.solve
     * @param {number} [params.stepDays] - ephemeris velocity finite-difference step
     * @param {number|null} [params.samples] - when a number >= 2, attaches
     *   `trajectorySamples`; when null (default), trajectorySamples is null
     *   and no extra propagation work is done
     * @returns {{
     *   departureEpochDaysJ2000: number,
     *   arrivalEpochDaysJ2000: number,
     *   tof: number,
     *   originState: {position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}},
     *   targetState: {position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}},
     *   departureVelocity: {x:number,y:number,z:number},
     *   arrivalVelocity: {x:number,y:number,z:number},
     *   transferAngle: number,
     *   universalAnomaly: number,
     *   iterations: number,
     *   trajectorySamples: Array<{t:number, position:object, velocity:object}>|null
     * }}
     */
    static assembleTransfer({
        fleet,
        originBodyData,
        targetBodyData,
        departureEpochDaysJ2000,
        arrivalEpochDaysJ2000,
        mu,
        longWay = false,
        tolerance,
        maxIterations,
        stepDays,
        samples = null,
    }) {
        requireFiniteNumber(departureEpochDaysJ2000, 'departureEpochDaysJ2000');
        requireFiniteNumber(arrivalEpochDaysJ2000, 'arrivalEpochDaysJ2000');

        const tof = arrivalEpochDaysJ2000 - departureEpochDaysJ2000;
        requirePositiveNumber(tof, 'tof (arrivalEpochDaysJ2000 - departureEpochDaysJ2000)');

        const originState = TransferAssembler.resolveOriginState({
            fleet,
            originBodyData,
            departureEpochDaysJ2000,
            stepDays,
        });

        const targetState = TransferAssembler.resolveTargetState({
            targetBodyData,
            arrivalEpochDaysJ2000,
            stepDays,
        });

        const solveParams = { r1: originState.position, r2: targetState.position, tof, mu, longWay };
        if (tolerance !== undefined) solveParams.tolerance = tolerance;
        if (maxIterations !== undefined) solveParams.maxIterations = maxIterations;

        const { departureVelocity, arrivalVelocity, transferAngle, universalAnomaly, iterations } =
            LambertSolver.solve(solveParams);

        let trajectorySamples = null;
        if (samples !== null) {
            trajectorySamples = LambertSolver.sampleTrajectory({
                r1: originState.position,
                v1: departureVelocity,
                tof,
                mu,
                samples,
            });
        }

        return {
            departureEpochDaysJ2000,
            arrivalEpochDaysJ2000,
            tof,
            originState,
            targetState,
            departureVelocity,
            arrivalVelocity,
            transferAngle,
            universalAnomaly,
            iterations,
            trajectorySamples,
        };
    }

    /**
     * @param {object} params
     * @param {object} params.fleet - fleet with a "ships" array (see Fleet.js)
     * @param {number} params.totalDeltaV - total Δv budget, in the caller's
     *   velocity unit
     * @param {number} [params.standardGravityMS2]
     * @param {number} [params.velocityUnitToMetersPerSecond] - multiplier
     *   converting totalDeltaV's unit into m/s
     * @returns {number} propellant required, in the fleet's "weight" unit
     */
    static computePropellantRequired({
        fleet,
        totalDeltaV,
        standardGravityMS2 = STANDARD_GRAVITY_M_S2,
        velocityUnitToMetersPerSecond = DEFAULT_VELOCITY_UNIT_TO_METERS_PER_SECOND,
    }) {
        requireNonNegativeNumber(totalDeltaV, 'totalDeltaV');
        requirePositiveNumber(standardGravityMS2, 'standardGravityMS2');
        requirePositiveNumber(velocityUnitToMetersPerSecond, 'velocityUnitToMetersPerSecond');

        const isp = Fleet.worstIsp(fleet);
        requirePositiveNumber(isp, 'worst Isp');

        const initialMass = fleet.ships.reduce((sum, ship) => sum + ship.weight, 0);
        requirePositiveNumber(initialMass, 'total fleet ship weight');

        const deltaVMetersPerSecond = totalDeltaV * velocityUnitToMetersPerSecond;
        const effectiveExhaustVelocity = isp * standardGravityMS2;
        const massRatio = Math.exp(-deltaVMetersPerSecond / effectiveExhaustVelocity);

        return initialMass * (1 - massRatio);
    }

    /**
     * @param {object} params
     * @param {object} params.fleet - fleet with "ships" (see Fleet.js) and a
     *   numeric "fuelRemaining" runtime field (see DefaultFleetState.js)
     * @param {object} params.target - target descriptor (see Target.js)
     * @param {object} params.rawTransfer - output of assembleTransfer
     * @param {'time'|'fuel'|null} [params.optimizationMode]
     * @param {number} [params.standardGravityMS2]
     * @param {number} [params.velocityUnitToMetersPerSecond]
     * @param {string[]} [params.warnings] - warnings to seed the plan with,
     *   in addition to any fuel warning this method adds
     * @returns {object} a FlightPlan (see FlightPlan.js) extended with
     *   departureDv, arrivalDv, totalDv, tof, fuelWarning, trajectorySamples,
     *   optimizationMode, and solverMeta
     */
    static buildFlightPlan({
        fleet,
        target,
        rawTransfer,
        optimizationMode = null,
        standardGravityMS2 = STANDARD_GRAVITY_M_S2,
        velocityUnitToMetersPerSecond = DEFAULT_VELOCITY_UNIT_TO_METERS_PER_SECOND,
        warnings = [],
    }) {
        if (!fleet || !Array.isArray(fleet.ships) || fleet.ships.length === 0) {
            throw new Error('TransferAssembler.buildFlightPlan requires a fleet with at least one ship');
        }
        requireFiniteNumber(fleet.fuelRemaining, 'fleet.fuelRemaining');

        if (!rawTransfer || typeof rawTransfer !== 'object') {
            throw new Error('TransferAssembler.buildFlightPlan requires a "rawTransfer" (see assembleTransfer)');
        }
        const {
            departureEpochDaysJ2000,
            arrivalEpochDaysJ2000,
            tof,
            originState,
            targetState,
            departureVelocity,
            arrivalVelocity,
            transferAngle,
            universalAnomaly,
            iterations,
            trajectorySamples,
        } = rawTransfer;

        if (!isVector3(originState?.position) || !isVector3(originState?.velocity)) {
            throw new Error('TransferAssembler.buildFlightPlan requires "rawTransfer.originState"');
        }
        if (!isVector3(targetState?.position) || !isVector3(targetState?.velocity)) {
            throw new Error('TransferAssembler.buildFlightPlan requires "rawTransfer.targetState"');
        }
        if (!isVector3(departureVelocity) || !isVector3(arrivalVelocity)) {
            throw new Error(
                'TransferAssembler.buildFlightPlan requires "rawTransfer.departureVelocity"/"arrivalVelocity"'
            );
        }

        const departureBurnDeltaV = subtractVectors(departureVelocity, originState.velocity);
        const arrivalBurnDeltaV = subtractVectors(targetState.velocity, arrivalVelocity);

        const departureDv = vectorMagnitude(departureBurnDeltaV);
        const arrivalDv = vectorMagnitude(arrivalBurnDeltaV);
        const totalDv = departureDv + arrivalDv;

        const propellantRequired = TransferAssembler.computePropellantRequired({
            fleet,
            totalDeltaV: totalDv,
            standardGravityMS2,
            velocityUnitToMetersPerSecond,
        });

        const fuelRemaining = fleet.fuelRemaining;
        const isFeasible = propellantRequired <= fuelRemaining;
        const fuelWarning = isFeasible
            ? null
            : `Insufficient fuel: transfer requires ${propellantRequired.toFixed(2)}, ` +
              `fleet has ${fuelRemaining.toFixed(2)} remaining`;

        const combinedWarnings = Array.isArray(warnings) ? [...warnings] : [];
        if (fuelWarning) combinedWarnings.push(fuelWarning);

        const basePlan = FlightPlan.create({
            fleetId: fleet.id,
            target,
            departureEpochDaysJ2000,
            arrivalEpochDaysJ2000,
            burns: [
                {
                    epochDaysJ2000: departureEpochDaysJ2000,
                    deltaV: departureBurnDeltaV,
                    position: originState.position,
                },
                {
                    epochDaysJ2000: arrivalEpochDaysJ2000,
                    deltaV: arrivalBurnDeltaV,
                    position: targetState.position,
                },
            ],
            totalDeltaV: totalDv,
            propellantRequired,
            fuelRemainingAfter: fuelRemaining - propellantRequired,
            isFeasible,
            arrivalPosition: targetState.position,
            arrivalVelocity: targetState.velocity,
            warnings: combinedWarnings,
        });

        return {
            ...basePlan,
            departureDv,
            arrivalDv,
            totalDv,
            tof,
            fuelWarning,
            trajectorySamples: Array.isArray(trajectorySamples) ? trajectorySamples : [],
            optimizationMode,
            solverMeta: {
                transferAngle,
                universalAnomaly,
                iterations,
            },
        };
    }
}