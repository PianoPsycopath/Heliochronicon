// js/shaders/starField.js
// GPU-instanced background star field (proper motion integrated on the GPU)
// and its color-id picking counterpart. Split out of the former Shaders.js
// monolith -- see ShaderManager.js for the aggregated call surface.
//
// Perf note (PLAN.md Phase C): getStarFieldMaterial() now exposes a
// `uMagLimit` uniform used for a cheap magnitude-based LOD. Stars dimmer
// than the current limit are pushed outside the clip volume in the vertex
// shader, so the GPU discards them before rasterization instead of paying
// the point-sprite fill cost for millions of sub-pixel dots. Uniform
// defaults to "show everything" (100.0) so behavior is unchanged unless a
// caller actively lowers it -- see main.js's magnitude-limit-by-zoom curve
// and docs/performance-notes.md.
import * as THREE from 'three'

export class StarFieldShaders {

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
                // Magnitude LOD floor: stars with mag > uMagLimit are culled
                // in the vertex shader. Default keeps every star visible.
                uMagLimit: { value: 100.0 },
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
                uniform float uMagLimit;
                uniform mat4 uStarProjectionMatrix;

                attribute vec3 velocity; // AU / year
                attribute float mag;
                attribute float ci;

                varying float vMag;
                varying float vCi;
                varying float vAlpha;

                void main() {
                    // Magnitude LOD: dimmer-than-limit stars are pushed
                    // outside the clip volume so the rasterizer drops them
                    // before spending fill-rate on a sub-pixel dot. Cheaper
                    // than a CPU-side rebuild of the buffer per zoom level,
                    // and reversible every frame as uMagLimit changes.
                    if (mag > uMagLimit) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        return;
                    }

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
}
