import * as THREE from 'three'

/* Filaments : base faible + influx lumineux qui parcourent chaque fibre. */
export function createFilamentMaterial(base: number, pulse: number, speed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: base },
      uPulse: { value: pulse },
      uSpeed: { value: speed },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aSeed;
      varying float vT;
      varying float vSeed;
      varying vec3 vColor;
      void main() {
        vT = aT;
        vSeed = aSeed;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBase;
      uniform float uPulse;
      uniform float uSpeed;
      uniform float uFade;
      varying float vT;
      varying float vSeed;
      varying vec3 vColor;
      void main() {
        float head = fract(uTime * uSpeed * (0.55 + vSeed * 0.9) + vSeed * 7.31);
        float d = abs(vT - head);
        float pulse = smoothstep(0.14, 0.0, d);
        float a = (uBase + uPulse * pulse) * uFade;
        gl_FragColor = vec4(vColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/* Neurones : disque lumineux qui scintille doucement. */
export function createNeuronMaterial(pixelRatio: number, scale = 4.2) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uScale: { value: scale },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uScale;
      attribute float aSize;
      attribute float aSeed;
      attribute float aAlert;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.78 + 0.22 * sin(uTime * 1.6 + aSeed * 23.0);
        /* Une tâche en retard bat plus vite. */
        tw += aAlert * 0.28 * sin(uTime * 4.2 + aSeed * 9.0);
        vTw = tw;
        vColor = color;
        gl_PointSize = aSize * uPixelRatio * (uScale / -mv.z) * tw;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 2.4) + smoothstep(0.12, 0.0, d) * 0.9;
        float a = glow * uFade;
        gl_FragColor = vec4(vColor * a * 1.15, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
