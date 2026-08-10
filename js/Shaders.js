// js/Shaders.js
import * as THREE from 'three'

export class Shaders {
    
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

    static getTacticalMaterial() {
        return new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(1.0 - abs(vNormal.z), 3.0);
                    float line = smoothstep(0.4, 0.5, intensity);
                    gl_FragColor = vec4(vec3(1.0, 0.8, 0.0) * line, 1.0);
                }
            `,
            depthTest: false,
            transparent: true 
        });
    }
    static createDotTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; 
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();
        return new THREE.CanvasTexture(canvas);
    }

    static createStarSpriteMat() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffcc00'; ctx.beginPath();
        ctx.moveTo(64, 0); ctx.quadraticCurveTo(64, 64, 128, 64); ctx.quadraticCurveTo(64, 64, 64, 128); ctx.quadraticCurveTo(64, 64, 0, 64); ctx.quadraticCurveTo(64, 64, 64, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 45px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("☉", 64, 66);
        return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false });
    }

    static createDiamondSpriteMat(symbol) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.moveTo(64, 5); ctx.lineTo(123, 64); ctx.lineTo(64, 123); ctx.lineTo(5, 64); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.font = 'bold 50px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(symbol, 64, 68);
        return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false });
    }
    static getAsteroidParticleMaterial(colorHex) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 }, // Days since J2000
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uColor: { value: new THREE.Color(colorHex) },
                uZoom: { value: 1.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform vec3 uOrigin;
                uniform float uZoom;
                
                // cameraPosition is automatically provided by Three.js

                // Orbital Elements passed as binary buffers
                attribute float a;
                attribute float e;
                attribute float i;
                attribute float w;
                attribute float Node;
                attribute float M0;
                attribute float n;
            
                varying float vAlpha;
                varying float vDarken; 

                void main() {
                    // 1. Solve Kepler's Equation (Newton-Raphson 5 Iterations)
                    float M_current = M0 + n * uTime;
                    float E = M_current;
                    for (int iter = 0; iter < 5; iter++) {
                        E = E - (E - e * sin(E) - M_current) / (1.0 - e * cos(E));
                    }

                    // 2. 2D Orbital Plane Coordinates
                    float xv = a * (cos(E) - e);
                    float yv = a * (sqrt(1.0 - e * e) * sin(E));

                    // 3. 3D Ecliptic Rotation (with J2000 Angles)
                    float cos_w = cos(w); float sin_w = sin(w);
                    float cos_Node = cos(Node); float sin_Node = sin(Node);
                    float cos_i = cos(i); float sin_i = sin(i);

                    float ast_x = (cos_w*cos_Node - sin_w*sin_Node*cos_i) * xv + (-sin_w*cos_Node - cos_w*sin_Node*cos_i) * yv;
                    float ast_y = (cos_w*sin_Node + sin_w*cos_Node*cos_i) * xv + (-sin_w*sin_Node + cos_w*cos_Node*cos_i) * yv;
                    float ast_z = (sin_w*sin_i) * xv + (cos_w*sin_i) * yv;

                    // 4. Three.js Chirality Fix & Floating Origin Shift
                    vec3 globalPos = vec3(ast_x, ast_z, -ast_y);
                    vec3 renderPos = globalPos - uOrigin;

                    vec4 mvPosition = viewMatrix * vec4(renderPos, 1.0);
                    
                    // 5. Dynamic Sizing
                    float rawSize = 12.0 / uZoom;
                    gl_PointSize = clamp(rawSize, 1.0, 3.5); // Hard cap at 3.5 pixels max
                    
                    // --- DISTANCE-BASED VISIBILITY & DARKENING ---
                    // Calculate exact 3D distance from the camera to this specific asteroid
                    float camDist = distance(cameraPosition, renderPos);
                    
                    // Invert the smoothstep: 1.0 when close, fading to 0.0 when far.
                    // TWEAK THESE NUMBERS: 5.0 is the distance full brightness starts fading, 35.0 is max fade.
                    float visibility = 1.0 - smoothstep(50.0, 800.0, camDist);
                    
                    vAlpha = mix(0.1, 1.0, visibility);
                    vDarken = mix(0.1, 1.0, visibility); 
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                varying float vDarken;

                void main() {
                    // Carve the square gl_Point into a perfect circular dot
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    if(length(coord) > 0.5) discard;
                    
                    // Add a slight glowing core effect
                    float glow = 1.0 - (length(coord) * 2.0);
                    
                    // Multiply the base color by your manual darken slider
                    vec3 baseColor = uColor * vDarken;
                    
                    // PRE-MULTIPLY the color by alpha so MaxEquation caps the brightness
                    vec3 finalColor = baseColor * glow * 1.5 * vAlpha;
                    
                    gl_FragColor = vec4(finalColor, vAlpha);
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.MaxEquation 
        });
    }

    // (position/velocity baked in AU by StarLoader, magnitude + B-V color
    // index carried as attributes). Proper motion is integrated on the GPU
    // from uTime (days since J2000, same clock the asteroid field uses) and
    // shifted by the floating origin exactly like the asteroid particles.
    static getStarFieldMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },       // days since J2000 (matches gpuParticleSystems convention)
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uZoom: { value: 1.0 },
                uPixelRatio: { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1 },
                // Real star distances (hundreds of millions of AU) are far
                // beyond the scene camera's actual `far` plane, which is
                // kept tight on purpose for AU-scale planet depth precision.
                // The built-in `projectionMatrix` uniform IS that tight
                // camera matrix, so using it here hardware-clips stars the
                // instant they cross it -- angle-dependently, since it's a
                // frustum. uStarProjectionMatrix is a separate copy of the
                // same camera (same fov/aspect/near/zoom) but with `far`
                // pushed out past every real star distance -- see
                // updateStarFieldFarProjection() in main.js, called once per
                // frame. Nothing else in the scene uses this matrix, so
                // planet/grid depth precision is untouched.
                uStarProjectionMatrix: { value: new THREE.Matrix4() }
            },
            vertexShader: `
                uniform float uTime;
                uniform vec3 uOrigin;
                uniform float uZoom;
                uniform float uPixelRatio;
                uniform mat4 uStarProjectionMatrix;

                attribute vec3 velocity; // AU / year
                attribute float mag;
                attribute float ci;

                varying float vMag;
                varying float vCi;
                varying float vAlpha;

                void main() {
                    // Proper motion, integrated linearly (stars are effectively
                    // unaccelerated over the simulation's timescale).
                    float years = uTime / 365.25;
                    vec3 globalPos = position + velocity * years;
                    vec3 renderPos = globalPos - uOrigin;

                    vec4 mvPosition = viewMatrix * vec4(renderPos, 1.0);
                    // Use the far-reaching projection, NOT the built-in
                    // projectionMatrix (that's the camera's real, tight
                    // far plane and is why stars were being clipped).
                    gl_Position = uStarProjectionMatrix * mvPosition;

                    // Apparent brightness from magnitude (lower mag = brighter).
                    // Stars are effectively at infinity for the purposes of this
                    // sim, so size/brightness is driven by mag + zoom only, not
                    // by camera distance to the star.
                    float brightness = pow(2.512, -mag + 4.0);
                    float basePx = clamp(sqrt(brightness) * 1.1, 0.6, 3.2);
                    gl_PointSize = clamp(basePx / max(uZoom, 0.05), 0.5, 6.0) * uPixelRatio;

                    vAlpha = clamp(brightness, 0.08, 1.0);
                    vMag = mag;
                    vCi = ci;
                }
            `,
            fragmentShader: `
                varying float vMag;
                varying float vCi;
                varying float vAlpha;

                // Rough B-V color index -> RGB (blue-white-yellow-orange-red),
                // enough to read as believable stellar color without a full
                // blackbody LUT.
                vec3 bvToColor(float bv) {
                    vec3 hot  = vec3(0.61, 0.72, 1.0);   // blue-white, bv ~ -0.3
                    vec3 mid1 = vec3(1.0, 1.0, 1.0);     // white, bv ~ 0.3
                    vec3 mid2 = vec3(1.0, 0.86, 0.6);    // yellow-white, bv ~ 0.8
                    vec3 cool = vec3(1.0, 0.5, 0.35);    // orange-red, bv ~ 1.6+

                    float t1 = smoothstep(-0.3, 0.3, bv);
                    vec3 c1 = mix(hot, mid1, t1);
                    float t2 = smoothstep(0.3, 0.8, bv);
                    vec3 c2 = mix(c1, mid2, t2);
                    float t3 = smoothstep(0.8, 1.6, bv);
                    return mix(c2, cool, t3);
                }

                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float d = length(coord);
                    if (d > 0.5) discard;

                    float glow = 1.0 - smoothstep(0.0, 0.5, d);
                    vec3 color = bvToColor(vCi);
                    float alpha = vAlpha * glow;

                    gl_FragColor = vec4(color * alpha, alpha);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.MaxEquation
        });
    }

    static getStarPickingMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uZoom: { value: 1.0 },
                uPixelRatio: { value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1 },
                uStarProjectionMatrix: { value: new THREE.Matrix4() }
            },
            vertexShader: `
                uniform float uTime;
                uniform vec3 uOrigin;
                uniform float uZoom;
                uniform float uPixelRatio;
                uniform mat4 uStarProjectionMatrix;

                attribute vec3 velocity;
                attribute float pickId;

                varying vec3 vPickColor;

                vec3 packId(float id) {
                    float r = floor(id / 65536.0);
                    float g = floor((id - r * 65536.0) / 256.0);
                    float b = id - r * 65536.0 - g * 256.0;
                    return vec3(r, g, b) / 255.0;
                }

                void main() {
                    float years = uTime / 365.25;
                    vec3 globalPos = position + velocity * years;
                    vec3 renderPos = globalPos - uOrigin;

                    vec4 mvPosition = viewMatrix * vec4(renderPos, 1.0);
                    gl_Position = uStarProjectionMatrix * mvPosition;

                    // Larger, zoom-independent floor than the visual dots so
                    // faint/small stars are still easy to hit with the mouse.
                    gl_PointSize = clamp(6.0 / max(uZoom, 0.05), 4.0, 10.0) * uPixelRatio;

                    vPickColor = packId(pickId);
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec3 vPickColor;

                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    if (length(coord) > 0.5) discard;
                    gl_FragColor = vec4(vPickColor, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false
        });
    }

    static createGroupLabelMat(text, colorHex = '#ffffff', meanA = 2.5) {
        const displayText = text.toUpperCase().replace(/[-_]/g, ' ');
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.font = "bold 46px 'Helvetica Compressed', 'Helvetica Inserat', 'Teko', sans-serif";
        ctx.fillStyle = colorHex;
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 8;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const chars = [...displayText];
        const widths = chars.map(ch => ctx.measureText(ch).width);
        const totalWidth = widths.reduce((a, b) => a + b, 0);
        
        const PX_PER_AU = 90;
        const MAX_TOTAL_ANGLE = 2.2; // ~125° ceiling on how far the arc may wrap
        const distanceRadius = meanA * PX_PER_AU;
        const minFitRadius = totalWidth / MAX_TOTAL_ANGLE;
        const curveRadius = Math.max(distanceRadius, minFitRadius, 70);

        const angleSteps = widths.map(w => w / curveRadius);
        const totalAngle = angleSteps.reduce((a, b) => a + b, 0);

        const cx = size / 2;
        const circleCenterY = size / 2 + curveRadius;

        let angle = -Math.PI / 2 - totalAngle / 2;
        for (let idx = 0; idx < chars.length; idx++) {
            angle += angleSteps[idx] / 2;
            const x = cx + curveRadius * Math.cos(angle);
            const y = circleCenterY + curveRadius * Math.sin(angle);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillText(chars[idx], 0, 0);
            ctx.restore();

            angle += angleSteps[idx] / 2;
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        return new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }
    static createNightShadeMat() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uSunDir: { value: new THREE.Vector3(1, 0, 0) },
                uPlanetCenter: { value: new THREE.Vector3() },
                uColor: { value: new THREE.Color(0x8a185d) },
                uBarScale: { value: 0.05 },
                uOpacity: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPos = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uSunDir;
                uniform vec3 uPlanetCenter;
                uniform vec3 uColor;
                uniform float uBarScale;
                uniform float uOpacity;

                varying vec3 vWorldPos;

                void main() {
                    // Sphere shell, so the surface normal is just the
                    // radial direction -- no need to track planet spin.
                    vec3 n = normalize(vWorldPos - uPlanetCenter);
                    float ndotl = dot(n, normalize(uSunDir));

                    // Soft terminator band; night = 1 once we're past ~4.5deg
                    // beyond the geometric terminator.
                    float night = smoothstep(0.08, -0.08, ndotl);
                    if (night <= 0.001) discard;

                    // Screen-space diagonal hazard stripes -- reads as a
                    // fixed overlay "film" rather than a texture baked onto
                    // the rotating planet.
                    float diag = (gl_FragCoord.x + gl_FragCoord.y) * uBarScale;
                    float bar = step(0.5, fract(diag));
                    float barAlpha = mix(0.35, 1.0, bar);

                    gl_FragColor = vec4(uColor, night * barAlpha * uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide
        });
    }

    static createTerrainContourMat(heightmapTexture, elevMin = -450, elevMax = 6800) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uHeightmap: { value: heightmapTexture },
                uElevMin: { value: elevMin },
                uElevMax: { value: elevMax },
                uLonOffset: { value: 0.0 }, 
                uLineWidthPx: { value: 2.0 } 
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

                // NEW: Use the alpha channel to determine if we are rendering liquid.
                // Note: If your PNG uses 1.0 (opaque) for water, change this to > 0.5
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
            extensions: { derivatives: true }
        });
    }
}