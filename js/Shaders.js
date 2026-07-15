// js/Shaders.js
class Shaders {
    
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

                    float safeY = min(viewDir.y, -0.2); 
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

    // --- NEW PURE 2D EQUATORIAL GRID ---
    static getEquatorialGridMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: { 
                cameraPos: { value: new THREE.Vector3() }
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
                    
                    // Radial fade (0.1 to 0.5 AU) so it gracefully dissolves into space
                    float edgeFade = 1.0 - smoothstep(0.1, 0.5, length(coord)); 
                    
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
        return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false });
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
}