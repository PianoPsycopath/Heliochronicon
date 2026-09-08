import { createMissionSolution } from './MissionSolution.js';
import { createBurn } from './Burn.js';
import { assert } from './validation.js';

const G0_MPS2 = 9.80665;

export function calculateMassAfterImpulsiveBurn(massBefore_kg, deltaV_kmps, specificImpulse_s) {
    if (massBefore_kg <= 0 || deltaV_kmps === 0) {
        return massBefore_kg;
    }
    assert(specificImpulse_s > 0, 'specificImpulse_s must be > 0 for non-zero deltaV');
    const exhaustVelocity_kmps = (specificImpulse_s * G0_MPS2) / 1000;
    return massBefore_kg * Math.exp(-deltaV_kmps / exhaustVelocity_kmps);
}

export function calculateBurnDuration(propellantUsed_kg, thrust_N, specificImpulse_s) {
    if (thrust_N <= 0 || specificImpulse_s <= 0 || propellantUsed_kg <= 0) return 0;
    const massFlowRate_kgps = thrust_N / (specificImpulse_s * G0_MPS2);
    return propellantUsed_kg / massFlowRate_kgps;
}

export function evaluateTransferFeasibility(transferData, spacecraft) {
    assert(transferData !== null && typeof transferData === 'object', 'transferData is required');
    assert(spacecraft !== null && typeof spacecraft === 'object', 'spacecraft is required');
    
    if (transferData.totalDeltaVMagnitude > 0) {
        assert(spacecraft.propulsion !== null && typeof spacecraft.propulsion === 'object', 'spacecraft.propulsion is required when totalDeltaV > 0');
        assert(spacecraft.propulsion.specificImpulse_s > 0, 'spacecraft.propulsion.specificImpulse_s must be > 0 when totalDeltaV > 0');
    }
    
    const isp = spacecraft.propulsion ? spacecraft.propulsion.specificImpulse_s : 0;
    
    let currentMass = spacecraft.wetMass_kg;
    const massHistory = [currentMass];
    const burns = [];

    // Departure Burn
    const mAfterDeparture = calculateMassAfterImpulsiveBurn(currentMass, transferData.departureDeltaVMagnitude, isp);
    const depPropellant = currentMass - mAfterDeparture;
    const depTime = transferData.departureState.time_daysSinceJ2000 || transferData.departureState.epoch_daysSinceJ2000;
    
    burns.push(createBurn({
        time_daysSinceJ2000: depTime,
        position: transferData.departureState.position,
        deltaV_kmps: transferData.departureDeltaV,
        massBefore_kg: currentMass,
        massAfter_kg: mAfterDeparture,
        type: 'IMPULSIVE'
    }));

    currentMass = mAfterDeparture;
    massHistory.push(currentMass);

    // Arrival Burn
    const mAfterArrival = calculateMassAfterImpulsiveBurn(currentMass, transferData.arrivalDeltaVMagnitude, isp);
    const arrPropellant = currentMass - mAfterArrival;
    const arrTime = transferData.arrivalState.time_daysSinceJ2000 || transferData.arrivalState.epoch_daysSinceJ2000;

    burns.push(createBurn({
        time_daysSinceJ2000: arrTime,
        position: transferData.arrivalState.position,
        deltaV_kmps: transferData.arrivalDeltaV,
        massBefore_kg: currentMass,
        massAfter_kg: mAfterArrival,
        type: 'IMPULSIVE'
    }));

    currentMass = mAfterArrival;
    massHistory.push(currentMass);

    const totalPropellantRequired = depPropellant + arrPropellant;
    const propellantRemaining = spacecraft.propellantMass_kg - totalPropellantRequired;
    const isFeasible = propellantRemaining >= 0;

    // Normalizing time keys to map internal ephemeris epochs to the strict MissionSolution contract
    const mappedDepartureState = { ...transferData.departureState, time_daysSinceJ2000: depTime };
    const mappedArrivalState = { ...transferData.arrivalState, time_daysSinceJ2000: arrTime };

    // Note: c3_km2s2 and hyperbolicExcessVelocity_kmps are impulsive proxies from departure/arrival Δv magnitudes, not full parking-orbit escape values.
    const c3 = transferData.departureDeltaVMagnitude * transferData.departureDeltaVMagnitude;
    const vInf = {
        departure: transferData.departureDeltaVMagnitude,
        arrival: transferData.arrivalDeltaVMagnitude
    };

    const solverMeta = transferData.solverMetadata || {};
    const isConverged = typeof solverMeta.converged === 'boolean' ? solverMeta.converged : true;

    const solution = createMissionSolution({
        totalDeltaV_kmps: transferData.totalDeltaVMagnitude,
        departureDeltaV_kmps: transferData.departureDeltaVMagnitude,
        arrivalDeltaV_kmps: transferData.arrivalDeltaVMagnitude,
        burns,
        trajectorySamples: transferData.trajectorySamples || [],
        departureState: mappedDepartureState,
        arrivalState: mappedArrivalState,
        timeOfFlight_days: transferData.timeOfFlight_days,
        c3_km2s2: c3,
        hyperbolicExcessVelocity_kmps: vInf,
        propellantRequired_kg: totalPropellantRequired,
        propellantRemaining_kg: propellantRemaining,
        massHistory,
        solver: { family: 'IMPULSIVE', ...solverMeta },
        quality: { converged: isConverged }
    });

    return { solution, isFeasible };
}