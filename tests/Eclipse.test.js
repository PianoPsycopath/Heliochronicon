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
        n: 0.017202 // Added: Earth mean daily motion (rad/day)
    };
    
    const moonData = { 
        name: "MOON", 
        category: "MOON", 
        orbit_model: "MEEUS", 
        parent: "EARTH", 
        radius_km: 1737.4, 
        a: 384400,
        n: 0.22997  // Added: Moon mean daily motion (rad/day)
    };
    
    const allBodies = [sunData, earthData, moonData];

    it('should detect the solar eclipse event using EclipseEngine', () => {
        // Start search window on August 11, 2026
        const searchStartDate = new Date(Date.UTC(2026, 7, 11, 0, 0, 0));
        const startDays = (searchStartDate.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;

        // Run EclipseEngine search forward from Aug 11
        const event = EclipseEngine.findNextEclipse(earthData, allBodies, startDays, 1);

        expect(event).not.toBeNull();
        expect(event.shadowed.name).toBe("EARTH");
        expect(event.occulter.name).toBe("MOON");

        // Convert detected event days back to UT Date
        const eventDate = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + event.days * 86400000);

        // Verify event falls on August 12, 2026
        expect(eventDate.getUTCFullYear()).toBe(2026);
        expect(eventDate.getUTCMonth()).toBe(7); // August (0-indexed)
        expect(eventDate.getUTCDate()).toBe(12);
    });

    it('should verify physical alignment and spatial geometry at eclipse peak (17:35 UTC)', () => {
        const targetDate = new Date(Date.UTC(2026, 7, 12, 17, 35, 0));
        const days = (targetDate.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;

        const earthPos = OrbitalMath.calculatePosition(earthData, days);
        const moonLocal = OrbitalMath.calculatePosition(moonData, days);

        const earthGlobal = new THREE.Vector3(earthPos.x, earthPos.y, earthPos.z);
        const moonGlobal = new THREE.Vector3(
            earthPos.x + moonLocal.x,
            earthPos.y + moonLocal.y,
            earthPos.z + moonLocal.z
        );

        // Compute angle subtended between Earth and Moon vectors from Sun center
        const angleDeg = moonGlobal.angleTo(earthGlobal) * (180 / Math.PI);
        const distEarth = earthGlobal.length();
        const distMoon = moonGlobal.length();

        // 1. Angular alignment check (< 0.25 deg)
        expect(angleDeg).toBeLessThan(0.25);

        // 2. Body ordering check (Moon must sit between Sun and Earth)
        expect(distMoon).toBeLessThan(distEarth);
    });
});