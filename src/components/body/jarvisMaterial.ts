import * as THREE from 'three'

/* ──────────────────────────────────────────────────────────────────────────
   Matériau « Jarvis » : coque semi-transparente, grille technique discrète,
   contour lumineux (fresnel), rendu additif sur fond noir.
   ────────────────────────────────────────────────────────────────────────── */

const vertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosV = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPulse;
  uniform float uGrid;
  uniform float uGridScale;
  uniform float uSelected;
  uniform float uRimPower;
  uniform float uGain;
  /* Fondu global : 1 = visible, 0 = invisible (plongée dans le cerveau). */
  uniform float uFade;

  varying vec3 vNormalV;
  varying vec3 vPosV;
  varying vec2 vUv;

  /* Trois familles de lignes → maillage triangulaire fin, lecture « hexagone ». */
  float techGrid(vec2 uv, float scale) {
    vec2 p = uv * scale;
    float a = abs(fract(p.x) - 0.5);
    float b = abs(fract(p.y) - 0.5);
    float c = abs(fract((p.x + p.y) * 0.5) - 0.5);
    float d = min(min(a, b), c);
    return 1.0 - smoothstep(0.0, 0.03, d);
  }

  void main() {
    vec3 N = normalize(vNormalV);
    vec3 V = normalize(-vPosV);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);
    float grid = techGrid(vUv, uGridScale) * uGrid;

    float pulse = 0.5 + 0.5 * sin(uTime * 2.3);
    float intensity = (0.10 + fres * 1.15 + grid * 0.45) * uGain;
    intensity *= 1.0 + uPulse * 0.4 * pulse;
    intensity += uSelected * (0.35 + fres * 0.6);

    float alpha = clamp(uOpacity * (0.20 + fres * 0.95 + grid * 0.4) + uSelected * 0.16, 0.0, 1.0);
    gl_FragColor = vec4(uColor * intensity * uFade, alpha * uFade);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface JarvisOptions {
  color?: string
  opacity?: number
  grid?: number
  gridScale?: number
  rimPower?: number
  gain?: number
}

export function createJarvisMaterial(opts: JarvisOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? '#35e3ff') },
      uOpacity: { value: opts.opacity ?? 0.55 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uGrid: { value: opts.grid ?? 0.55 },
      uGridScale: { value: opts.gridScale ?? 14 },
      uSelected: { value: 0 },
      uRimPower: { value: opts.rimPower ?? 2.2 },
      uGain: { value: opts.gain ?? 1 },
      uFade: { value: 1 },
    },
  })
}
