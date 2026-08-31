// js/rendering/shaders/starField.js
import * as THREE from 'three';

export class StarFieldShaders {
    static getStarFieldMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 }, // days since J2000 (matches gpuParticleSystems convention)
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uZoom: { value: 1.0 },
                uPixelRatio: {
                    value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
                },
                // Magnitude LOD floor: stars with mag > uMagLimit are culled
                // in the vertex shader. Default keeps every star visible.
                uMagLimit: { value: 100.0 },
                uStarProjectionMatrix: { value: new THREE.Matrix4() },
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
                    gl_Position = uStarProjectionMatrix * mvPosition;
                    gl_Position.z = gl_Position.w * 0.9999;
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
            blendEquation: THREE.MaxEquation,
        });
    }

    static getStarPickingMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uOrigin: { value: new THREE.Vector3(0, 0, 0) },
                uZoom: { value: 1.0 },
                uPixelRatio: {
                    value: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
                },
                uStarProjectionMatrix: { value: new THREE.Matrix4() },
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
                    gl_Position.z = gl_Position.w * 0.9999;
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
            depthWrite: false,
        });
    }
}
