import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

// Sphere SDF
float sdSphere(vec3 p, float s) {
  return length(p) - s;
}

// Inigo Quilez smooth minimum for natural fluid blending
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// Scene SDF with left & right mercury bubble clusters + mouse blob
float map(vec3 p) {
  // Left side bubbles (flanking the left side)
  vec3 cl1 = vec3(-8.2 + sin(uTime * 0.45) * 1.1, cos(uTime * 0.35) * 2.0, sin(uTime * 0.25) * 0.5);
  vec3 cl2 = vec3(-7.6 + cos(uTime * 0.55) * 0.8, sin(uTime * 0.3) * 2.4 + 2.0, cos(uTime * 0.4) * 0.6);
  vec3 cl3 = vec3(-8.8 + sin(uTime * 0.38 + 1.5) * 0.9, cos(uTime * 0.42 + 2.0) * 1.8 - 2.0, sin(uTime * 0.5) * 0.5);

  float d1 = sdSphere(p - cl1, 1.55);
  float d2 = sdSphere(p - cl2, 1.25);
  float d3 = sdSphere(p - cl3, 1.45);

  float d = smin(d1, d2, 1.6);
  d = smin(d, d3, 1.6);

  // Right side bubbles (flanking the right side)
  vec3 cr1 = vec3(10.2 + cos(uTime * 0.38 - 1.0) * 1.1, sin(uTime * 0.5 + 2.0) * 2.0, cos(uTime * 0.3) * 0.5);
  vec3 cr2 = vec3(9.6 + sin(uTime * 0.48 + 3.0) * 0.9, cos(uTime * 0.32 - 1.5) * 2.2 - 2.0, sin(uTime * 0.45) * 0.6);
  vec3 cr3 = vec3(10.8 + sin(uTime * 0.6 + 0.8) * 0.8, cos(uTime * 0.22 + 1.2) * 2.4 + 1.8, cos(uTime * 0.35) * 0.5);

  float dr1 = sdSphere(p - cr1, 1.6);
  float dr2 = sdSphere(p - cr2, 1.25);
  float dr3 = sdSphere(p - cr3, 1.4);

  d = smin(d, dr1, 1.6);
  d = smin(d, dr2, 1.6);
  d = smin(d, dr3, 1.6);

  // Interactive mouse blob - follows cursor when mouse enters
  vec3 mouseP = p - vec3(uMouse.x * 7.5, uMouse.y * 4.5, 0.0);
  float mouseBlob = sdSphere(mouseP, 1.3);
  d = smin(d, mouseBlob, 1.8);

  return d;
}

// Surface normal
vec3 calcNormal(vec3 p) {
  const float h = 0.0008;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * map(p + k.xyy * h) +
    k.yyx * map(p + k.yyx * h) +
    k.yxy * map(p + k.yxy * h) +
    k.xxx * map(p + k.xxx * h)
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.y, uResolution.x);
  
  // Camera
  vec3 ro = vec3(0.0, 0.0, 10.0);
  vec3 rd = normalize(vec3(uv, -1.0));

  float t = 0.0;
  float max_d = 22.0;
  bool hit = false;
  
  // Raymarch loop with conservative step size to eliminate stepping artifacts
  for(int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float dist = map(p);
    if(dist < 0.001) {
      hit = true;
      break;
    }
    t += dist * 0.75;
    if(t > max_d) break;
  }

  // Pure white canvas background
  vec3 color = vec3(1.0); 

  if(hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 viewDir = normalize(ro - p);
    vec3 ref = reflect(-viewDir, n);

    // Studio environment map synthesis for luxurious silver mercury
    // 1. Soft silver-grey gradient base
    vec3 baseSilver = mix(vec3(0.20, 0.21, 0.24), vec3(0.74, 0.76, 0.80), smoothstep(-0.6, 0.7, ref.y));

    // 2. Primary studio softbox highlight (broad white top-front shine)
    vec3 light1 = normalize(vec3(0.5, 0.9, 0.7));
    float dot1 = max(dot(ref, light1), 0.0);
    vec3 highlight1 = vec3(1.0) * pow(dot1, 5.0) * 0.65 + vec3(1.0) * pow(dot1, 35.0) * 1.1;

    // 3. Side studio strip light (cool rim reflection)
    vec3 light2 = normalize(vec3(-0.8, 0.2, 0.5));
    float dot2 = max(dot(ref, light2), 0.0);
    vec3 highlight2 = vec3(0.85, 0.88, 0.94) * pow(dot2, 8.0) * 0.6 + vec3(1.0) * pow(dot2, 50.0) * 0.8;

    // 4. Subtle studio floor bounce
    vec3 light3 = normalize(vec3(0.0, -1.0, 0.4));
    float dot3 = max(dot(ref, light3), 0.0);
    vec3 highlight3 = vec3(0.42, 0.44, 0.48) * pow(dot3, 3.0) * 0.35;

    // 5. Elegant dark studio flag reflection (creates liquid metal contrast)
    float darkRibbon = smoothstep(0.22, 0.0, abs(ref.y + 0.12 * ref.x));
    
    // Combine studio lighting
    vec3 chrome = baseSilver + highlight1 + highlight2 + highlight3;
    chrome = mix(chrome, vec3(0.12, 0.13, 0.15), darkRibbon * 0.6);

    // 6. Deep rim definition against white background
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    chrome = mix(chrome, vec3(0.15, 0.16, 0.18), fresnel * 0.65);

    // Monotonic edge antialiasing (no distance stepping or rings)
    float edgeAlpha = smoothstep(0.0, 0.04, dot(n, viewDir));
    color = mix(vec3(1.0), clamp(chrome, 0.0, 1.0), edgeAlpha);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const vertexShader = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

const ShaderMaterial = () => {
  const materialRef = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMouse: { value: new THREE.Vector2(-100, -100) }
    }),
    []
  );

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Normalize mouse to -1 to 1
      uniforms.uMouse.value.x = (e.clientX / window.innerWidth) * 2 - 1;
      uniforms.uMouse.value.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    
    // Handle touch
    const handleTouchMove = (e) => {
      if(e.touches.length > 0) {
        uniforms.uMouse.value.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        uniforms.uMouse.value.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [uniforms]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uResolution.value.set(
        window.innerWidth,
        window.innerHeight
      );
    }
  });

  return (
    <shaderMaterial
      ref={materialRef}
      fragmentShader={fragmentShader}
      vertexShader={vertexShader}
      uniforms={uniforms}
    />
  );
};

export default function LiquidChrome() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, background: '#fff' }}>
      <Canvas camera={{ position: [0, 0, 1] }}>
        <mesh>
          <planeGeometry args={[2, 2]} />
          <ShaderMaterial />
        </mesh>
      </Canvas>
    </div>
  );
}
