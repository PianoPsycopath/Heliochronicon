export function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

export function assertFiniteNumber(value, label) {
    assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
}

export function assertNonEmptyString(value, label) {
    assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
}

export function assertOneOf(value, allowed, label) {
    assert(allowed.includes(value), `${label} must be one of: ${allowed.join(', ')}`);
}

export function assertVector3(value, label) {
    assert(value !== null && typeof value === 'object', `${label} must be an object with x, y, z`);
    assertFiniteNumber(value.x, `${label}.x`);
    assertFiniteNumber(value.y, `${label}.y`);
    assertFiniteNumber(value.z, `${label}.z`);
}

export function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}
