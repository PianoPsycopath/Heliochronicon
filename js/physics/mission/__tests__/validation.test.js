import { describe, it, expect } from 'vitest';
import {
    assert,
    assertFiniteNumber,
    assertNonEmptyString,
    assertOneOf,
    assertVector3,
    deepFreeze,
} from '../validation.js';

describe('validation helpers', () => {
    it('assert throws with the given message when the condition is falsy', () => {
        expect(() => assert(false, 'boom')).toThrow('boom');
        expect(() => assert(true, 'boom')).not.toThrow();
    });

    it('assertFiniteNumber rejects non-numbers and NaN/Infinity', () => {
        expect(() => assertFiniteNumber(1, 'x')).not.toThrow();
        expect(() => assertFiniteNumber('1', 'x')).toThrow('x must be a finite number');
        expect(() => assertFiniteNumber(NaN, 'x')).toThrow('x must be a finite number');
        expect(() => assertFiniteNumber(Infinity, 'x')).toThrow('x must be a finite number');
    });

    it('assertNonEmptyString rejects empty and non-string values', () => {
        expect(() => assertNonEmptyString('a', 'x')).not.toThrow();
        expect(() => assertNonEmptyString('', 'x')).toThrow('x must be a non-empty string');
        expect(() => assertNonEmptyString(5, 'x')).toThrow('x must be a non-empty string');
    });

    it('assertOneOf rejects values outside the allowed set', () => {
        expect(() => assertOneOf('A', ['A', 'B'], 'x')).not.toThrow();
        expect(() => assertOneOf('C', ['A', 'B'], 'x')).toThrow('x must be one of: A, B');
    });

    it('assertVector3 requires finite x/y/z', () => {
        expect(() => assertVector3({ x: 1, y: 2, z: 3 }, 'v')).not.toThrow();
        expect(() => assertVector3({ x: 1, y: 2 }, 'v')).toThrow('v.z must be a finite number');
        expect(() => assertVector3(null, 'v')).toThrow('v must be an object with x, y, z');
    });

    it('deepFreeze freezes nested objects', () => {
        const frozen = deepFreeze({ a: 1, nested: { b: 2 } });
        expect(Object.isFrozen(frozen)).toBe(true);
        expect(Object.isFrozen(frozen.nested)).toBe(true);
    });
});
