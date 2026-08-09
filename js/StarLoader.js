// js/StarLoader.js
import * as THREE from 'three';

export class StarLoader {
    static async loadStars(basePath, scene) {
        try {
            const manifestResponse = await fetch(`${basePath}stars_manifest.json`);
            if (!manifestResponse.ok) throw new Error('No stars_manifest.json found');
            const manifest = await manifestResponse.json();

            const geometry = new THREE.BufferGeometry();
            const positions = [];
            const velocities = [];
            const mags = [];
            const cis = [];
            const pickIds = [];
            const sourceData = [];

            const PARSEC_TO_AU = 206264.806;
            const cosE = 0.917482; // Cosine of 23.439 degrees (Axial Tilt)
            const sinE = 0.397777; // Sine of 23.439 degrees

            const fetchPromises = [];
            for (const dataset of Object.values(manifest.datasets)) {
                for (const chunk of dataset.chunks) {
                    fetchPromises.push(fetch(`${basePath}${chunk}`).then(res => res.json()));
                }
            }

            const allChunks = await Promise.all(fetchPromises);
            
            allChunks.forEach(chunk => {
                chunk.forEach(star => {
                    const px = star.x || 0; const py = star.y || 0; const pz = star.z || 0;
                    const vx = star.vx || 0; const vy = star.vy || 0; const vz = star.vz || 0;

                    // 1. Equatorial to Ecliptic Rotation
                    const eq_x = px;
                    const eq_y = py * cosE - pz * sinE;
                    const eq_z = py * sinE + pz * cosE;

                    const eq_vx = vx;
                    const eq_vy = vy * cosE - vz * sinE;
                    const eq_vz = vy * sinE + vz * cosE;

                    // 2. Three.js Engine Map (x=x, y=z, z=-y) & Scale to AU
                    const ex = eq_x * PARSEC_TO_AU;
                    const ey = eq_z * PARSEC_TO_AU;
                    const ez = -eq_y * PARSEC_TO_AU;

                    const evx = eq_vx * PARSEC_TO_AU;
                    const evy = eq_vz * PARSEC_TO_AU;
                    const evz = -eq_vy * PARSEC_TO_AU;

                    positions.push(ex, ey, ez);
                    velocities.push(evx, evy, evz);
                    mags.push(star.mag !== null ? star.mag : 10.0);
                    cis.push(star.ci !== null ? star.ci : 0.0);
                    // 1-based pick ID (0 is reserved for "no hit" in the picking pass)
                    pickIds.push(sourceData.length + 1);
                    
                    // 3. Save calculations for CPU Promotion
                    star.engineX = ex; star.engineY = ey; star.engineZ = ez;
                    star.engineVx = evx; star.engineVy = evy; star.engineVz = evz;
                    sourceData.push({ ...star, datasetCategory: 'BACKGROUND_STAR' }); 
                });
            });

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
            geometry.setAttribute('mag', new THREE.Float32BufferAttribute(mags, 1));
            geometry.setAttribute('ci', new THREE.Float32BufferAttribute(cis, 1));
            geometry.setAttribute('pickId', new THREE.Float32BufferAttribute(pickIds, 1));
            
            geometry.userData = { sourceData: sourceData }; 

            return geometry;
        } catch (error) {
            console.warn("Star background disabled or missing:", error);
            return null;
        }
    }
}