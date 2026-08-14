// js/shaders/nightSide.js
// Day/night terminator shading shell for a single body. Split out of the
// former Shaders.js monolith -- see ShaderManager.js for the aggregated call
// surface.
import * as THREE from 'three'

export class NightSideShaders {

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
}
