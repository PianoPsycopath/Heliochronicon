// js/shaders/grid.js
// Ecliptic + equatorial reference-grid materials (gravity-well parallax grid,
// and the targeted-body equatorial grid). Split out of the former Shaders.js
// monolith -- see ShaderManager.js for the aggregated call surface.
import * as THREE from 'three'

export class GridShaders {

    static getGridMaterial(maxWells) {
        const wellPositions = new Array(maxWells).fill(null).map(() => new THREE.Vector2());
        const wellDepths = new Array(maxWells).fill(0.0);
        const wellRadii = new Array(maxWells).fill(0.0);

        return new THREE.ShaderMaterial({
            uniforms: {
                zoomScale: { value: 1.0 }, // Kept for pipeline safety
                cameraPos: { value: new THREE.Vector3() },
                wellPositions: { value: wellPositions },
                wellDepths: { value: wellDepths },
                wellRadii: { value: wellRadii },
                numWells: { value: 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform float zoomScale; 
                uniform vec3 cameraPos;
                
                uniform vec2 wellPositions[${maxWells}];
                uniform float wellDepths[${maxWells}];
                uniform float wellRadii[${maxWells}];
                uniform int numWells;

                varying vec3 vWorldPosition;

                float drawGrid(vec2 coord, float spacing, float baseAlpha) {
                    vec2 gridCoord = coord / spacing;
                    vec2 derivative = fwidth(gridCoord);
                    vec2 gridPhase = abs(fract(gridCoord - 0.5) - 0.5);
                    
                    vec2 line = gridPhase / derivative;
                    float val = 1.0 - min(min(line.x, line.y), 1.0);
                    
                    float fade = smoothstep(0.2, 0.05, max(derivative.x, derivative.y));
                    return val * fade * baseAlpha;
                }
                
                void main() {
                    vec2 coord = vWorldPosition.xz;
                    vec3 viewDir = normalize(vWorldPosition - cameraPos);
                    
                    float virtualDepth = 0.0;
                    for(int i = 0; i < ${maxWells}; i++) {
                        if (i >= numWells) break;
                        
                        float dist = distance(coord, wellPositions[i]);
                        float r = wellRadii[i];
                        
                        if (r > 0.0) {
                            float influence = exp(-(dist * dist) / (r * r));
                            virtualDepth += wellDepths[i] * influence;
                        }
                    }

                    float safeY = viewDir.y >= 0.0 ? max(viewDir.y, 0.2) : min(viewDir.y, -0.2);
                    float zoomDampener = clamp(1.2 / pow(zoomScale, 0.7), 0.15, 1.0);
                    
                    vec2 parallaxCoord = coord;
                    parallaxCoord += viewDir.xz * (virtualDepth / safeY) * 0.35 * zoomDampener;

                    vec3 lineColor = vec3(1.0, 0.6, 0.15);
                    float intensity = 0.0;
                    
                    // --- ECLIPTIC GRID (6 TIERS) ---
                    // The micro-tiers are removed, leaving only macroscopic layers
                    intensity = max(intensity, drawGrid(parallaxCoord, 0.01,    0.35)); // Hill Sphere
                    intensity = max(intensity, drawGrid(parallaxCoord, 0.1,     0.45)); // Interplanetary
                    intensity = max(intensity, drawGrid(parallaxCoord, 1.0,     0.55)); // Inner System
                    intensity = max(intensity, drawGrid(parallaxCoord, 10.0,    0.70)); // Jovian
                    intensity = max(intensity, drawGrid(parallaxCoord, 100.0,   0.85)); // Deep Space
                    intensity = max(intensity, drawGrid(parallaxCoord, 1000.0,  1.00)); // Interstellar
                    
                    float fade = 1.0 - smoothstep(50000.0, 150000.0, length(vWorldPosition.xz - cameraPos.xz));
                    
                    if (intensity < 0.015) discard;
                    gl_FragColor = vec4(lineColor, intensity * fade * 0.35);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            extensions: { derivatives: true }
        });
    }

    static getEquatorialGridMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                cameraPos: { value: new THREE.Vector3() },
                uGridRadius: { value: 0.5 } // NEW: Dynamic grid size uniform
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vLocalPlane;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    vLocalPlane = position.xy; // Extracts geometry scale cleanly
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 cameraPos;
                uniform float uGridRadius;
                
                varying vec3 vWorldPosition;
                varying vec2 vLocalPlane;

                float drawGrid(vec2 coord, float spacing, float baseAlpha) {
                    vec2 gridCoord = coord / spacing;
                    vec2 derivative = fwidth(gridCoord);
                    vec2 gridPhase = abs(fract(gridCoord - 0.5) - 0.5);
                    
                    vec2 line = gridPhase / derivative;
                    float val = 1.0 - min(min(line.x, line.y), 1.0);
                    
                    float fade = smoothstep(0.2, 0.05, max(derivative.x, derivative.y));
                    return val * fade * baseAlpha;
                }
                
                void main() {
                    vec2 coord = vLocalPlane; 
                    vec3 lineColor = vec3(1.0, 1.0, 1.0); // Pure White Line
                    float intensity = 0.0;
                    
                    // --- 5-TIER EQUATORIAL FRACTAL ---
                    intensity = max(intensity, drawGrid(coord, 0.00001, 0.15)); // LEO
                    intensity = max(intensity, drawGrid(coord, 0.0001,  0.25)); // Geosynchronous
                    intensity = max(intensity, drawGrid(coord, 0.001,   0.40)); // Sub-Lunar
                    intensity = max(intensity, drawGrid(coord, 0.01,    0.60)); // Hill Sphere
                    intensity = max(intensity, drawGrid(coord, 0.1,     0.80)); // System Space
                    
                    // NEW: Dynamic Radial Fade using the mass-calculated uGridRadius
                    float edgeFade = 1.0 - smoothstep(uGridRadius * 0.2, uGridRadius, length(coord)); 
                    
                    if (intensity < 0.015) discard;
                    gl_FragColor = vec4(lineColor, intensity * edgeFade * 0.35);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            extensions: { derivatives: true }
        });
    }
}
