// js/shaders/terrain.js
// Heightmap-driven tactical terrain contour material (elevation contours,
// slope glow, lat/lon grid, ocean fill). Split out of the former
// Shaders.js monolith -- see ShaderManager.js for the aggregated call
// surface.
import * as THREE from 'three';

export class TerrainShaders {
    static createTerrainContourMat(heightmapTexture, elevMin = -450, elevMax = 6800) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uHeightmap: { value: heightmapTexture },
                uElevMin: { value: elevMin },
                uElevMax: { value: elevMax },
                uLonOffset: { value: 0.0 },
                uLineWidthPx: { value: 2.0 },
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
            uniform sampler2D uHeightmap;
            uniform float uElevMin;
            uniform float uElevMax;
            uniform float uLonOffset;
            uniform float uLineWidthPx; 

            varying vec2 vUv;
            varying vec3 vNormal;

            float decodeElev(vec2 uv) {
                vec2 rg = texture2D(uHeightmap, uv).rg * 255.0;
                float raw16 = rg.x * 256.0 + rg.y;
                return uElevMin + (raw16 - 1.0) / 65534.0 * (uElevMax - uElevMin);
            }

            float drawContour(float elev, float interval, float baseAlpha, float lineWidthPx) {
                float bands = elev / interval;
                float deriv = fwidth(bands);
                if (deriv < 0.00001) return 0.0;
                
                float dist = abs(fract(bands - 0.5) - 0.5); 
                float halfWidth = deriv * lineWidthPx * 0.5;
                
                float val = 1.0 - smoothstep(halfWidth * 0.8, halfWidth, dist);
                float fade = smoothstep(0.2, 0.05, deriv);
                return val * fade * baseAlpha;
            }

            // NEW: Draws a UV-based coordinate grid (Latitude / Longitude)
            float drawLatLonGrid(vec2 uv, vec2 cells, float baseAlpha, float lineWidthPx) {
                vec2 gridCoord = uv * cells;
                vec2 deriv = fwidth(gridCoord);
                
                if (deriv.x < 0.00001 || deriv.y < 0.00001) return 0.0;
                
                vec2 dist = abs(fract(gridCoord - 0.5) - 0.5); 
                vec2 halfWidth = deriv * lineWidthPx * 0.5;
                
                vec2 val = 1.0 - smoothstep(halfWidth * 0.8, halfWidth, dist);
                float combinedVal = max(val.x, val.y);
                
                // Fade grid out when derivatives get too high (e.g., at the poles to prevent moiré)
                float fade = 1.0 - smoothstep(0.1, 0.5, max(deriv.x, deriv.y));
                return combinedVal * fade * baseAlpha;
            }

            void main() {
                vec2 uv = vec2(fract(vUv.x + uLonOffset), vUv.y);
                
                // Sample the texture once to get all channels
                vec4 texData = texture2D(uHeightmap, uv);

                vec3 baseColor = vec3(0.0, 0.04, 0.07);   
                vec3 oceanColor = vec3(0.02, 0.15, 0.35); // NEW: Slightly blue tactical ocean
                vec3 lineColor = vec3(0.2, 1.0, 0.5);
                vec3 gridColor = vec3(0.2, 0.2, 0.2);     // NEW: Pure white for the grid

                bool isLiquid = texData.a < 0.5; 

                // Calculate the planetary grid (36 longitude lines, 18 latitude lines = 10-degree squares)
                // Intensity is kept low (0.15) so it is softer than the contours.
                float gridIntensity = drawLatLonGrid(uv, vec2(36.0, 18.0), 0.15, uLineWidthPx);

                if (isLiquid) {
                    // Render ocean and overlay the soft white grid
                    vec3 finalOcean = mix(oceanColor, gridColor, gridIntensity);
                    gl_FragColor = vec4(finalOcean, 1.0); 
                    return;
                }

                float elevation = decodeElev(uv);

                vec2 texel = vec2(1.0 / 4320.0, 1.0 / 2160.0);
                float eL = decodeElev(uv - vec2(texel.x, 0.0));
                float eR = decodeElev(uv + vec2(texel.x, 0.0));
                float eD = decodeElev(uv - vec2(0.0, texel.y));
                float eU = decodeElev(uv + vec2(0.0, texel.y));
                float slope = (abs(elevation - eL) + abs(elevation - eR) + abs(elevation - eD) + abs(elevation - eU)) * 0.25;
                
                float slopeGlow = smoothstep(30.0, 200.0, slope); 

                float intensity = 0.0;
                intensity = max(intensity, drawContour(elevation, 1000.0, 0.35, uLineWidthPx));
                intensity = max(intensity, drawContour(elevation, 200.0,  0.55, uLineWidthPx));
                intensity = max(intensity, drawContour(elevation, 50.0,   0.80, uLineWidthPx));
                intensity = max(intensity, slopeGlow * 0.4); 

                float rim = pow(1.0 - abs(vNormal.z), 2.0) * 0.15;
                intensity = clamp(intensity + rim, 0.0, 1.0);

                // Mix the base land color with the contour lines
                vec3 color = mix(baseColor, lineColor, intensity);
                
                // Overlay the soft planetary grid on top of the land
                color = mix(color, gridColor, gridIntensity);
                
                gl_FragColor = vec4(color, 1.0); 
            }
        `,
            transparent: true,
            extensions: { derivatives: true },
        });
    }
}
