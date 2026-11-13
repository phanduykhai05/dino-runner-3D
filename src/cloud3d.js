import * as THREE from 'three';

let noiseTexture;
function cloudNoise() {
  if (noiseTexture) return noiseTexture;
  const size = 64, data = new Uint8Array(size ** 3);
  let seed = 7219;
  const layers = [4, 8, 16, 32].map(n => {
    const grid = new Float32Array(n ** 3);
    for (let i = 0; i < grid.length; i++) { seed = Math.imul(seed, 1664525) + 1013904223 | 0; grid[i] = (seed >>> 0) / 4294967296; }
    return { n, grid };
  });
  const fade = t => t * t * (3 - 2 * t);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value = 0, weight = 0.55;
    for (const { n, grid } of layers) {
      const px = x / size * n, py = y / size * n, pz = z / size * n;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      const fx = fade(px - ix), fy = fade(py - iy), fz = fade(pz - iz);
      let sample = 0;
      for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        sample += grid[((iz + dz) % n * n + (iy + dy) % n) * n + (ix + dx) % n]
          * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      }
      value += sample * weight;
      weight *= 0.5;
    }
    data[(z * size + y) * size + x] = Math.round(value / 1.03125 * 255);
  }
  noiseTexture = new THREE.Data3DTexture(data, size, size, size);
  noiseTexture.format = THREE.RedFormat;
  noiseTexture.minFilter = noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.wrapS = noiseTexture.wrapT = noiseTexture.wrapR = THREE.RepeatWrapping;
  noiseTexture.unpackAlignment = 1;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}

export function createCloudMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: cloudNoise() }, uTint: { value: new THREE.Color('#ffffff') },
      uSky: { value: new THREE.Color('#e9f2f7') },
    },
    vertexShader: `
      varying vec3 vOrigin;
      varying vec3 vDirection;
      varying float vDistance;
      void main() {
        vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vDirection = position - vOrigin;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDistance = length(world.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      precision highp sampler3D;
      uniform sampler3D uNoise;
      uniform vec3 uTint;
      uniform vec3 uSky;
      varying vec3 vOrigin;
      varying vec3 vDirection;
      varying float vDistance;
      float lobe(vec3 p, vec3 center, vec3 radius) { return 1.0 - length((p - center) / radius); }
      float density(vec3 p) {
        float shape = max(lobe(p, vec3(-.24,-.10,.00), vec3(.25,.24,.30)),
                          lobe(p, vec3(.02,.02,.00), vec3(.29,.40,.31)));
        shape = max(shape, lobe(p, vec3(.29,-.11,.01), vec3(.21,.24,.25)));
        shape = max(shape, lobe(p, vec3(-.06,-.08,-.18), vec3(.30,.26,.24)));
        float noise = texture(uNoise, p * 1.7 + .5).r;
        return smoothstep(-.06, .32, shape + (noise - .5) * .75)
          * smoothstep(-.34, -.25, p.y);
      }
      void main() {
        vec3 ray = normalize(vDirection);
        vec3 a = (-.5 - vOrigin) / ray;
        vec3 b = (.5 - vOrigin) / ray;
        vec3 nearPlane = min(a, b), farPlane = max(a, b);
        float start = max(max(nearPlane.x, nearPlane.y), max(nearPlane.z, 0.0));
        float end = min(min(farPlane.x, farPlane.y), farPlane.z);
        if (end <= start) discard;
        float stepSize = (end - start) / 28.0;
        float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
        vec3 p = vOrigin + ray * (start + stepSize * jitter);
        vec4 sum = vec4(0.0);
        vec3 sun = normalize(vec3(-.4, .9, -.3));
        for (int i = 0; i < 28; i++) {
          float d = density(p);
          if (d > .015) {
            float light = clamp(.64 + (d - density(p + sun * .12)) * 1.1 + p.y * .4, .20, 1.0);
            vec3 color = mix(vec3(.47,.57,.65), vec3(1.0,.99,.96), light) * uTint;
            float alpha = 1.0 - exp(-d * stepSize * 17.0);
            sum.rgb += (1.0 - sum.a) * alpha * color;
            sum.a += (1.0 - sum.a) * alpha;
            if (sum.a > .98) break;
          }
          p += ray * stepSize;
        }
        if (sum.a < .015) discard;
        vec3 color = sum.rgb / sum.a;
        color = mix(color, uSky, smoothstep(65.0, 165.0, vDistance) * .6);
        gl_FragColor = vec4(color, sum.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  });
}
