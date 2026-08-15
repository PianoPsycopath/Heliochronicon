// js/shaders/eclipse.js
// Multi-body umbra/penumbra eclipse-shadow overlay material. Split out of
// the former Shaders.js monolith -- see ShaderManager.js for the aggregated
// call surface.
import * as THREE from 'three';
import { MAX_SHADOWS } from '../constants.js';

export class EclipseShaders {
    static createEclipseShadowMat(maxShadows = MAX_SHADOWS) {
        const defaultPositions = new Array(maxShadows).fill(null).map(() => new THREE.Vector3());
        const defaultRadii = new Array(maxShadows).fill(0.0001);

        return new THREE.ShaderMaterial({
            uniforms: {
                uStarPos: { value: new THREE.Vector3() },
                uStarRadius: { value: 0.00465 },

                // MULTI-SHADOW ARRAYS
                uOccPositions: { value: defaultPositions },
                uOccRadii: { value: defaultRadii },
                uShadowCount: { value: 0 },

                uPlanetCenter: { value: new THREE.Vector3() },

                uUmbraColor: { value: new THREE.Color(0xff0000) },
                uPenumbraColor: { value: new THREE.Color(0x8a185d) },

                uBarScale: { value: 0.05 },
                uOpacity: { value: 0.85 },
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
                uniform vec3 uStarPos; 
                uniform float uStarRadius;
                
                uniform vec3 uOccPositions[${maxShadows}];
                uniform float uOccRadii[${maxShadows}];
                uniform int uShadowCount;
                
                uniform vec3 uPlanetCenter; 
                
                uniform vec3 uUmbraColor; 
                uniform vec3 uPenumbraColor;
                
                uniform float uBarScale;
                uniform float uOpacity;
                
                varying vec3 vWorldPos;
                
                void main() {
                    // CULL THE BACK SIDE
                    vec3 sphereNormal = normalize(vWorldPos - uPlanetCenter);
                    vec3 sunDir = normalize(uStarPos - uPlanetCenter);
                    if (dot(sphereNormal, sunDir) < 0.0) discard;
                    
                    bool inAnyShadow = false;
                    bool inUmbra = false;

                    // LOOP THROUGH ALL ACTIVE SHADOWS
                    for(int i = 0; i < ${maxShadows}; i++) {
                        if (i >= uShadowCount) break;

                        vec3 occPos = uOccPositions[i];
                        float occRadius = uOccRadii[i];

                        vec3 axisVec = occPos - uStarPos;
                        float D = length(axisVec);
                        vec3 axisDir = axisVec / D;
                        
                        vec3 rel = vWorldPos - occPos;
                        float t = dot(rel, axisDir); 
                        
                        // If surface is behind the star or beyond the shadow cone
                        if (t <= 0.0 || t > D * 0.10) continue; 
                        
                        float perpDist = length(rel - axisDir * t);
                        
                        float rUmbra = occRadius - t * (uStarRadius - occRadius) / D;
                        float rPenumbra = occRadius + t * (uStarRadius + occRadius) / D;
                        
                        // Outside this specific moon's penumbra
                        if (perpDist > rPenumbra) continue;
                        
                        inAnyShadow = true;
                        
                        float coreRadius = abs(rUmbra);
                        float insideCore = step(perpDist, coreRadius); 
                        float isTotal = step(0.0, rUmbra); 
                        
                        // If it enters ANY umbra, flag it to render the core color
                        if (insideCore * isTotal > 0.5) {
                            inUmbra = true;
                        }
                    }
                    
                    if (!inAnyShadow) discard;
                    
                    // Umbra overwrites Penumbra if the fragments overlap
                    vec3 finalColor = inUmbra ? uUmbraColor : uPenumbraColor;
                    
                    float diag = (gl_FragCoord.x + gl_FragCoord.y) * uBarScale;
                    float bar = step(0.5, fract(diag));
                    float barAlpha = mix(0.35, 1.0, bar);
                    
                    gl_FragColor = vec4(finalColor, barAlpha * uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
        });
    }
}
