import * as THREE from 'three';

const MAX_ECLIPSE_SEASONS = 16;

export class OrbitTrailShaders {
    static createOrbitTrailMaterial({
        color = 0xff1111,
        opacity = 0.5,
        solidFraction = 0.25,
        dashCycles = 28,
        dashRatio = 0.55,
        depthTest = false,
        linewidth = 1,
    } = {}) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uOpacity: { value: opacity },
                uPhase: { value: 0 },
                uSolidFraction: { value: solidFraction },
                uDashCycles: { value: dashCycles },
                uDashRatio: { value: dashRatio },
                uEclipseSeasonCount: { value: 0 },
                uEclipseSeasonStarts: {
                    value: new Float32Array(MAX_ECLIPSE_SEASONS),
                },
                uEclipseSeasonEnds: {
                    value: new Float32Array(MAX_ECLIPSE_SEASONS),
                },
                uEclipseSeasonColor: {
                    value: new THREE.Color(0xffff00),
                },
                uEclipseSeasonOpacity: { value: 1.0 },
            },
            vertexShader: `
                attribute float aProgress;
                varying float vProgress;

                void main() {
                    vProgress = aProgress;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;

                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uPhase;
                uniform float uSolidFraction;
                uniform float uDashCycles;
                uniform float uDashRatio;
                uniform int uEclipseSeasonCount;
                uniform float uEclipseSeasonStarts[16];
                uniform float uEclipseSeasonEnds[16];
                uniform vec3 uEclipseSeasonColor;
                uniform float uEclipseSeasonOpacity;

                varying float vProgress;

                bool isInEclipseSeason(float progress) {
                    for (int i = 0; i < 16; i++) {
                        if (i >= uEclipseSeasonCount) {
                            break;
                        }

                        float start = uEclipseSeasonStarts[i];
                        float end = uEclipseSeasonEnds[i];

                        if (start <= end) {
                            if (progress >= start && progress <= end) {
                                return true;
                            }
                        } else {
                            if (progress >= start || progress <= end) {
                                return true;
                            }
                        }
                    }

                    return false;
                }

                void main() {
                    bool inSeason = isInEclipseSeason(vProgress);
                    float deltaBehind = mod(uPhase - vProgress, 1.0);
                    float alpha = 1.0;
                
                    // Only apply dashed transparency if outside the eclipse season
                    if (!inSeason && deltaBehind >= uSolidFraction) {
                        float dashPhase = vProgress * uDashCycles;
                        float frac = fract(dashPhase);
                        float behindNorm = clamp((deltaBehind - uSolidFraction) / (1.0 - uSolidFraction), 0.0, 1.0);
                        float dashWidth = uDashRatio * (1.0 - behindNorm);
                        
                        alpha = step(frac, dashWidth);
                        if (alpha <= 0.0) {
                            discard;
                        }
                    }
                
                    if (inSeason) {
                        gl_FragColor = vec4(uEclipseSeasonColor, uEclipseSeasonOpacity);
                        return;
                    }
                
                    gl_FragColor = vec4(uColor, uOpacity * alpha);
                }
            `,
            transparent: true,
            depthTest,
        });

        material.linewidth = linewidth;

        Object.defineProperty(material, 'color', {
            get() {
                return this.uniforms.uColor.value;
            },
        });

        Object.defineProperty(material, 'opacity', {
            get() {
                return this.uniforms.uOpacity.value;
            },
            set(value) {
                this.uniforms.uOpacity.value = value;
            },
        });

        return material;
    }
}