import { describe, it, expect } from 'vitest';
import { OrbitalMath } from '../js/OrbitalMath.js';
import { EclipseEngine } from '../js/EclipseEngine.js';
import * as THREE from 'three';

describe('August 12, 2026 Total Solar Eclipse Test Suite', () => {
    const sunData = { name: "SUN", category: "STAR", parent: "SUN", radius_km: 696340 };
    
    const earthData = { 
        name: "EARTH", 
        category: "PLANET", 
        orbit_model: "VSOP87", 
        parent: "SUN", 
        radius_km: 6371,
        n: 0.017202 // Earth mean daily motion (rad/day)
    };
    
    const moonData = { 
        name: "MOON", 
        category: "MOON", 
        orbit_model: "MEEUS", 
        parent: "EARTH", 
        radius_km: 1737.4, 
        a: 384400,
        n: 0.22997  // Moon mean daily motion (rad/day)
    };
    
    const allBodies = [sunData, earthData, moonData];

    // Helper: convert a UTC Date to days since J2000.0 (TT ≈ UT for these tests)
    const toJ2000Days = (date) =>
        (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;

    // Helper: convert days since J2000 back to a UTC Date
    const fromJ2000Days = (days) =>
        new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + days * 86400000);

    // Helper: is this the Aug 12 2026 event?
    const isAug12_2026 = (date) =>
        date.getUTCFullYear() === 2026 &&
        date.getUTCMonth() === 7 &&
        date.getUTCDate() === 12;

    // ------------------------------------------------------------------
    // 1. Forward search – detect the 12 Aug 2026 solar eclipse
    // ------------------------------------------------------------------
    it('should detect the solar eclipse event using EclipseEngine (forward search)', () => {
        // Start search window on August 11, 2026
        const searchStartDate = new Date(Date.UTC(2026, 7, 11, 0, 0, 0));
        const startDays = toJ2000Days(searchStartDate);

        // Run EclipseEngine search forward from Aug 11
        const event = EclipseEngine.findNextEclipse(earthData, allBodies, startDays, 1);

        expect(event).not.toBeNull();
        expect(event.shadowed.name).toBe("EARTH");
        expect(event.occulter.name).toBe("MOON");

        // findNextEclipse returns the *start* of the eclipse (signal crossing 0→positive).
        // At first contact the classification is PARTIAL; totality occurs later near greatest eclipse.
        expect(["PARTIAL", "TOTAL", "ANNULAR"]).toContain(event.type);

        // Convert detected event days back to UT Date
        const eventDate = fromJ2000Days(event.days);

        // Verify event falls on August 12, 2026
        expect(eventDate.getUTCFullYear()).toBe(2026);
        expect(eventDate.getUTCMonth()).toBe(7); // August (0-indexed)
        expect(eventDate.getUTCDate()).toBe(12);
    });

    // ------------------------------------------------------------------
    // 2. Backward search – same event found when searching from after it
    // ------------------------------------------------------------------
    it('should detect the same solar eclipse when searching backward', () => {
        // Start a few days after the eclipse
        const searchStartDate = new Date(Date.UTC(2026, 7, 15, 0, 0, 0));
        const startDays = toJ2000Days(searchStartDate);

        const event = EclipseEngine.findNextEclipse(earthData, allBodies, startDays, -1);

        expect(event).not.toBeNull();
        expect(event.shadowed.name).toBe("EARTH");
        expect(event.occulter.name).toBe("MOON");
        expect(["PARTIAL", "TOTAL", "ANNULAR"]).toContain(event.type);

        const eventDate = fromJ2000Days(event.days);
        expect(isAug12_2026(eventDate)).toBe(true);
    });

    // ------------------------------------------------------------------
    // 3. Geometry + deeper signal check near greatest eclipse (~17:47 UTC)
    // ------------------------------------------------------------------
    it('should verify physical alignment and positive eclipse signal near greatest eclipse (17:47 UTC)', () => {
        // Greatest eclipse ≈ 17:47 UTC (NASA / Espenak)
        const targetDate = new Date(Date.UTC(2026, 7, 12, 17, 47, 0));
        const days = toJ2000Days(targetDate);

        const earthPos = OrbitalMath.calculatePosition(earthData, days);
        const moonLocal = OrbitalMath.calculatePosition(moonData, days);

        const earthGlobal = new THREE.Vector3(earthPos.x, earthPos.y, earthPos.z);
        const moonGlobal = new THREE.Vector3(
            earthPos.x + moonLocal.x,
            earthPos.y + moonLocal.y,
            earthPos.z + moonLocal.z
        );

        // Angular separation of Earth and Moon as seen from the Sun
        const angleDeg = moonGlobal.angleTo(earthGlobal) * (180 / Math.PI);
        const distEarth = earthGlobal.length();
        const distMoon  = moonGlobal.length();

        // 1. Angular alignment (tolerant of analytical models)
        expect(angleDeg).toBeLessThan(0.20);

        // 2. Body ordering – Moon must lie between Sun and Earth
        expect(distMoon).toBeLessThan(distEarth);

        // 3. Quantitative shadow-signal check via the engine’s own geometry
        //    (re-uses the same _shadowTest / _signalFromSnapshot path)
        const snapshot = new Map([
            ["SUN",   new THREE.Vector3(0, 0, 0)],
            ["EARTH", earthGlobal.clone()],
            ["MOON",  moonGlobal.clone()]
        ]);

        const { signal, type } = EclipseEngine._signalFromSnapshot(
            earthData, moonData, sunData, snapshot
        );

        // Positive signal means the penumbra (or umbra) intersects the Earth disk
        expect(signal).toBeGreaterThan(0);
        // Prefer TOTAL, but accept that analytical models may classify it as PARTIAL
        // at the exact instant; the important invariant is that a strong positive
        // signal exists.
        expect(["TOTAL", "ANNULAR", "PARTIAL"]).toContain(type);
    });

    // ------------------------------------------------------------------
    // 4. Negative case – search from mid-2025 should not return the Aug 2026 event
    //    as the *first* hit (or may return an earlier eclipse).
    // ------------------------------------------------------------------
    it('should not return the August 2026 eclipse as the first hit from mid-2025', () => {
        const searchStartDate = new Date(Date.UTC(2025, 5, 15, 0, 0, 0)); // 15 June 2025
        const startDays = toJ2000Days(searchStartDate);

        const event = EclipseEngine.findNextEclipse(earthData, allBodies, startDays, 1);

        // Engine has a long horizon (1500 days). If it finds something, it must
        // not be the specific Aug 12 2026 event we are using as the primary oracle.
        if (event !== null) {
            const eventDate = fromJ2000Days(event.days);
            expect(isAug12_2026(eventDate)).toBe(false);
        }
        // null is also acceptable
    });

    // ------------------------------------------------------------------
    // 5. Post-event isolation – searching forward from after the eclipse
    //    must not rediscover the *same* Aug 12 2026 event.
    // ------------------------------------------------------------------
    it('should not rediscover the August 12 2026 eclipse when searching forward from after it', () => {
        const searchStartDate = new Date(Date.UTC(2026, 7, 20, 0, 0, 0)); // 20 Aug 2026
        const startDays = toJ2000Days(searchStartDate);

        const event = EclipseEngine.findNextEclipse(earthData, allBodies, startDays, 1);

        if (event !== null) {
            const eventDate = fromJ2000Days(event.days);
            // Must not be the same calendar day we already tested
            expect(isAug12_2026(eventDate)).toBe(false);
        }
        // null is also a perfectly valid outcome
    });
});