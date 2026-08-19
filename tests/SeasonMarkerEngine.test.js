import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeasonMarkerEngine } from '../js/SeasonMarkerEngine.js';
import { OrbitalMath } from '../js/OrbitalMath.js';

vi.mock('../js/OrbitalMath.js', () => ({
    OrbitalMath: {
        calculatePosition: vi.fn() 
    }
}));

describe('SeasonMarkerEngine', () => {
    
    describe('resolveSeasonBody', () => {
        const earth = { isMoon: false, data: { name: 'Earth' } };
        const luna = { isMoon: true, data: { name: 'Luna', parent: 'Earth' } };
        const titan = { isMoon: true, data: { name: 'Titan', parent: 'Saturn', overrideParentSeasons: true } };
        const celestialBodies = [earth, luna, titan];

        it('should return null if the target body is null', () => {
            expect(SeasonMarkerEngine.resolveSeasonBody(null, celestialBodies)).toBeNull();
        });

        it('should return the body itself if it is not a moon', () => {
            expect(SeasonMarkerEngine.resolveSeasonBody(earth, celestialBodies)).toBe(earth);
        });

        it('should return the parent body if the target is a regular moon', () => {
            expect(SeasonMarkerEngine.resolveSeasonBody(luna, celestialBodies)).toBe(earth);
        });

        it('should return the moon itself if overrideParentSeasons is true', () => {
            expect(SeasonMarkerEngine.resolveSeasonBody(titan, celestialBodies)).toBe(titan);
        });
    });

    describe('formatCountdown', () => {
        const now = new Date('2026-08-19T12:00:00Z');

        it('should return "passed" if the target date is in the past', () => {
            const past = new Date('2026-08-19T11:00:00Z');
            expect(SeasonMarkerEngine.formatCountdown(past, now)).toBe('passed');
        });

        it('should format correctly for times under an hour (minutes only)', () => {
            const minutesFuture = new Date('2026-08-19T12:45:00Z');
            expect(SeasonMarkerEngine.formatCountdown(minutesFuture, now)).toBe('in 45 m');
        });

        it('should format correctly for times under a day (hours and minutes)', () => {
            const hoursFuture = new Date('2026-08-19T15:30:00Z');
            expect(SeasonMarkerEngine.formatCountdown(hoursFuture, now)).toBe('in 3 h 30 m');
        });

        it('should format correctly for times over a day (days, hours, minutes)', () => {
            const daysFuture = new Date('2026-08-21T14:15:00Z');
            expect(SeasonMarkerEngine.formatCountdown(daysFuture, now)).toBe('in 2 d 2 h 15 m');
        });
    });

    describe('_computeObliquityDeg', () => {
        it('should return 0 for perfectly parallel vectors', () => {
            const poleVec = { x: 0, y: 1, z: 0 };
            const orbitalNormal = { x: 0, y: 1, z: 0 };
            const deg = SeasonMarkerEngine._computeObliquityDeg(poleVec, orbitalNormal);
            expect(deg).toBeCloseTo(0);
        });

        it('should normalize retrograde planetary orbits properly', () => {
            const poleVec = { x: 0, y: -1, z: 0 };
            const orbitalNormal = { x: 0, y: 1, z: 0 };
            const deg = SeasonMarkerEngine._computeObliquityDeg(poleVec, orbitalNormal);
            expect(deg).toBeCloseTo(0);
        });
    });

    describe('computeMarkers (Gate tests)', () => {
        const daysSinceJ2000 = 9727.5; 
        const systemDate = new Date('2026-08-19T12:00:00Z');

        beforeEach(() => {
            // Mocks orbital position calculations to provide deterministic vector outputs for gate evaluation testing.
            vi.mocked(OrbitalMath.calculatePosition).mockImplementation((bodyData, t) => {
                const angle = (t % 360) * (Math.PI / 180); 
                return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
            });
        });

        it('should return an empty array if body orbits itself (e.g., Anchor Star)', () => {
            const starData = { name: 'Sol', parent: 'Sol', period: 0 };
            const markers = SeasonMarkerEngine.computeMarkers(starData, daysSinceJ2000, systemDate);
            expect(markers).toEqual([]);
        });

        it('should return only structural markers (Perihelion/Aphelion) if it fails Tilt and Distance gates', () => {
            // Validates that bodies failing minimum radius and eccentricity requirements solely generate baseline structural markers.
            const seasonlessBody = {
                name: 'Ceres',
                parent: 'Sol',
                period: 1682,
                radius_km: 470, 
                e: 0.01 
            };
            
            const markers = SeasonMarkerEngine.computeMarkers(seasonlessBody, daysSinceJ2000, systemDate);
            
            expect(markers).toHaveLength(2);
            expect(markers[0].id).toBe('perihelion');
            expect(markers[1].id).toBe('aphelion');
        });
        it('should return 2 thermal markers for distance-dominated bodies (Gate 2)', () => {
            const eccentricAsteroid = {
                name: 'Juno',
                parent: 'Sol',
                period: 1592,
                // Demonstrates the short-circuit logic for small bodies where tilt mechanics remain negligible.
                radius_km: 117, 
                // Ensures high-eccentricity orbits trigger thermal markers despite failing the radius check.
                e: 0.255,       
                pole_ra: 0, pole_dec: 90, pole_ra_rate: 0, pole_dec_rate: 0 
            };
            
            const markers = SeasonMarkerEngine.computeMarkers(eccentricAsteroid, daysSinceJ2000, systemDate);
            
            expect(markers).toHaveLength(2);
            expect(markers[0].id).toBe('perihelion-hot');
            expect(markers[1].id).toBe('aphelion-cold');
        });

        it('should return 6 markers (4 seasons + 2 structural) for tilt-dominated bodies (Gate 3)', () => {
            const tiltedBody = {
                name: 'Earth',
                parent: 'Sol',
                period: 365.25,
                radius_km: 6371, 
                e: 0.016,
                // Forces the tilt condition to verify the generation of both seasonal and structural markers.
                pole_ra: 0, pole_dec: 0, pole_ra_rate: 0, pole_dec_rate: 0
            };
            
            const markers = SeasonMarkerEngine.computeMarkers(tiltedBody, daysSinceJ2000, systemDate);
            
            expect(markers).toHaveLength(6);
            
            const ids = markers.map(m => m.id);
            expect(ids).toContain('summer-solstice');
            expect(ids).toContain('winter-solstice');
            expect(ids).toContain('spring-equinox');
            expect(ids).toContain('autumn-equinox');
            expect(ids).toContain('perihelion');
            expect(ids).toContain('aphelion');
        });
    });
});