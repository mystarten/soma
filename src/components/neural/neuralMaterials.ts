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

/* Neurones : disque lumineux qui scintille, avec
   – halo qui respire pour les éléments importants (retard, priorité haute, échéance proche),
   – profondeur de champ : ce qui est loin du plan net devient doux et plus discret,
   – bourgeonnement : un neurone récent grossit à son apparition, un très ancien s'estompe. */
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
      /* Distance (en unités de vue) du plan net, et force du flou. */
      uFocus: { value: 1 },
      uDof: { value: 0 },
      /* 0 → 1 pendant la pousse des nouveaux neurones. */
      uBorn: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uScale;
      attribute float aSize;
      attribute float aSeed;
      attribute float aAlert;
      attribute float aAge;
      attribute float aDim;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uFocus;
      uniform float uDof;
      uniform float uBorn;
      varying vec3 vColor;
      varying float vTw;
      varying float vHalo;
      varying float vBlur;
      varying float vDim;
      varying float vOld;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.78 + 0.22 * sin(uTime * 1.6 + aSeed * 23.0);
        /* Une tâche en retard bat plus vite. */
        tw += aAlert * 0.28 * sin(uTime * 4.2 + aSeed * 9.0);
        float fresh = 1.0 - smoothstep(0.0, 10.0, aAge);
        float bud = mix(1.0, smoothstep(0.0, 1.0, uBorn), fresh);
        float blur = clamp(abs(-mv.z - uFocus) * uDof, 0.0, 1.0);
        vTw = tw;
        vColor = color;
        vHalo = aAlert + fresh * 0.45;
        vBlur = blur;
        vDim = aDim;
        vOld = smoothstep(60.0, 240.0, aAge) * 0.35;
        float size = aSize * (1.0 + fresh * 0.25) * bud * (1.0 + vHalo * 0.8) * (1.0 + blur * 0.7);
        gl_PointSize = size * uPixelRatio * (uScale / -mv.z) * tw;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTw;
      varying float vHalo;
      varying float vBlur;
      varying float vDim;
      varying float vOld;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float dn = d * (1.0 + vHalo * 0.8);
        float soft = mix(0.0, 0.32, vBlur);
        float core = smoothstep(0.5, soft, dn);
        float glow = pow(core, 2.4) + smoothstep(0.12, 0.0, dn) * 0.9 * (1.0 - vBlur * 0.6);
        /* Halo qui respire */
        float breath = 0.5 + 0.5 * sin(uTime * 2.2 + vHalo * 5.0);
        float ring = vHalo * smoothstep(0.5, 0.34, d) * smoothstep(0.16, 0.3, d) * (0.35 + 0.65 * breath);
        float a = (glow + ring) * uFade * (1.0 - vBlur * 0.5) * (1.0 - vOld) * vDim;
        gl_FragColor = vec4(vColor * a * 1.15, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
