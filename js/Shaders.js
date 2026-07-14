// js/Shaders.js
class Shaders {
    
    static getGridMaterial(maxWells) {
        const wellPositions = new Array(maxWells).fill(null).map(() => new THREE.Vector2());
        const wellDepths = new Array(maxWells).fill(0.0);
        const wellRadii = new Array(maxWells).fill(0.0);

        return new THREE.ShaderMaterial({
            uniforms: { 
                zoomScale: { value: 1.0 },
                wellPositions: { value: wellPositions },
                wellDepths: { value: wellDepths },
                wellRadii: { value: wellRadii },
                numWells: { value: 0 }
            },
            vertexShader: `
                uniform vec2 wellPositions[${maxWells}];
                uniform float wellDepths[${maxWells}];
                uniform float wellRadii[${maxWells}];
                uniform int numWells;
                
                varying vec3 vWorldPosition;
                
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    float totalWarp = 0.0;
                    
                    for(int i = 0; i < ${maxWells}; i++) {
                        if (i >= numWells) break;
                        float dist = distance(worldPos.xz, wellPositions[i]);
                        float influence = exp(-(dist * dist) / wellRadii[i]);
                        totalWarp += wellDepths[i] * influence;
                    }
                    
                    worldPos.y += totalWarp;
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform float zoomScale;
                varying vec3 vWorldPosition;
                
                void main() {
                    vec2 coord = vWorldPosition.xz;
                    
                    float dynamicStep = max(0.1, 1.0 / (zoomScale * 0.5));
                    vec2 grid = abs(fract(coord / dynamicStep - 0.5) - 0.5) / fwidth(coord / dynamicStep);
                    float line = min(grid.x, grid.y);
                    
                    vec2 majorCoord = coord / (dynamicStep * 10.0);
                    vec2 majorGrid = abs(fract(majorCoord - 0.5) - 0.5) / fwidth(majorCoord);
                    float majorLine = min(majorGrid.x, majorGrid.y);
                    
                    float finalAlpha = max((1.0 - min(line, 1.0)) * 0.3, (1.0 - min(majorLine, 1.0)) * 0.8);
                    
                    float fade = 1.0 - smoothstep(4000.0, 7000.0, length(vWorldPosition.xz));
                    
                    if (finalAlpha < 0.01) discard;
                    gl_FragColor = vec4(1.0, 0.55, 0.0, finalAlpha * fade * 0.20);
                }
            `,
            transparent: true, 
            side: THREE.DoubleSide, 
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

    // --- NEW: Clean White Dot for Asteroids ---
    static createDotTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // Kept white so the SpriteMaterial color tint applies properly
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

                // Orbital Elements passed as binary buffers
                attribute float a;
                attribute float e;
                attribute float i;
                attribute float w;
                attribute float Node;
                attribute float M0;
                attribute float n;

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
                    
                    // Dynamic Point Sizing based on Tactical Camera Zoom
                    gl_PointSize = max(1.0, (12.0 / uZoom)); 
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                void main() {
                    // Carve the square gl_Point into a perfect circular dot
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    if(length(coord) > 0.5) discard;
                    
                    // Add a slight glowing core effect
                    float glow = 1.0 - (length(coord) * 2.0);
                    gl_FragColor = vec4(uColor, glow * 1.5);
                }
            `,
            transparent: true,
            depthTest: false
        });
    }
}