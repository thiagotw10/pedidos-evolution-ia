import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MAX_MODEL3D_BYTES, validateGlb, type AutomotiveModel3D } from '../../functions/src/automotiveModel3d';

interface AutomotiveImmersiveSceneProps {
  progress: React.MutableRefObject<number>;
  accent: string;
  model?: AutomotiveModel3D | null;
  onReady?: () => void;
  onUnavailable?: () => void;
  onModelReady?: (ready: boolean) => void;
}

type ExplodablePart = { object: THREE.Object3D; base: THREE.Vector3; direction: THREE.Vector3 };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = (from: number, to: number, value: number) => { const t = clamp((value - from) / (to - from)); return t * t * (3 - 2 * t); };

/** Close decoded ImageBitmaps as well as releasing the renderer's GPU resources. */
function disposeObjects(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  roots.forEach(root => root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
  }));
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) textures.add(value as THREE.Texture); });
    material.dispose();
  });
  textures.forEach(texture => {
    (Array.isArray(texture.image) ? texture.image : [texture.image]).forEach(image => { if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image); });
    texture.dispose();
  });
  images.forEach(image => image.close());
  geometries.forEach(geometry => geometry.dispose());
}

async function fetchModel(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Model unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_MODEL3D_BYTES) { await response.body?.cancel(); throw new Error('Model too large'); }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_MODEL3D_BYTES) throw new Error('Model too large');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MODEL3D_BYTES) { await reader.cancel(); throw new Error('Model too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return bytes.buffer;
}

/** A native-scroll camera journey. Nothing captures wheel, touch, or keyboard input. */
export default function AutomotiveImmersiveScene({ progress, accent, model, onReady, onUnavailable, onModelReady }: AutomotiveImmersiveSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onUnavailable, onModelReady });
  callbacks.current = { onReady, onUnavailable, onModelReady };
  const safeAccent = /^#([\da-f]{3}|[\da-f]{6})$/i.test(accent) ? accent : '#5b84ff';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    callbacks.current.onModelReady?.(false);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;
    const controller = new AbortController();
    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let environment: THREE.WebGLRenderTarget | undefined;
    let room: RoomEnvironment | undefined;
    let pmrem: THREE.PMREMGenerator | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let viewObserver: IntersectionObserver | undefined;
    let disposed = false;
    let visible = !('IntersectionObserver' in window);
    let dirty = true;
    let frame = 0;
    let lastTime = 0;
    let ready = false;
    let parsedRoots: THREE.Object3D[] = [];
    const listeners: (() => void)[] = [];
    let animate: (now: number) => void = () => {};
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
    const wake = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(animate); };
    const clean = () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      stop();
      resizeObserver?.disconnect();
      viewObserver?.disconnect();
      listeners.forEach(remove => remove());
      disposeObjects(scene ? [scene, ...parsedRoots] : parsedRoots);
      parsedRoots = [];
      environment?.dispose();
      room?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
    const fail = () => { if (!disposed) { clean(); callbacks.current.onUnavailable?.(); } };

    try {
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5));
      renderer.setClearColor(0x050609, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      const canvas = renderer.domElement;
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
      host.appendChild(canvas);
      const lost = (event: Event) => { event.preventDefault(); fail(); };
      canvas.addEventListener('webglcontextlost', lost);
      listeners.push(() => canvas.removeEventListener('webglcontextlost', lost));

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050609);
      scene.fog = new THREE.FogExp2(0x050609, 0.021);
      const camera = new THREE.PerspectiveCamera(49, 1, 0.05, 150);
      room = new RoomEnvironment();
      pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, 0.035);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.85;
      room.dispose(); room = undefined;
      pmrem.dispose(); pmrem = undefined;

      const accentColor = new THREE.Color(safeAccent);
      const silver = new THREE.MeshStandardMaterial({ color: 0x9fa9b8, metalness: 0.98, roughness: 0.24 });
      const titanium = new THREE.MeshPhysicalMaterial({ color: 0xa8b6c8, metalness: 1, roughness: 0.22, iridescence: 0.42, iridescenceIOR: 1.32, iridescenceThicknessRange: [110, 360], side: THREE.DoubleSide });
      const weldMaterial = new THREE.MeshStandardMaterial({ color: 0x92805f, metalness: 0.94, roughness: 0.28 });
      const blueHeat = new THREE.MeshStandardMaterial({ color: 0x3e587b, metalness: 0.96, roughness: 0.31 });
      const blackMetal = new THREE.MeshStandardMaterial({ color: 0x161b25, metalness: 0.85, roughness: 0.3 });
      const flowMaterial = new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.72, depthWrite: false });
      const haloMaterial = new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false });
      const zAxis = new THREE.Vector3(0, 0, 1);
      const tubeGroup = new THREE.Group();
      scene.add(tubeGroup);
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5), new THREE.Vector3(0.6, 0.15, -10),
        new THREE.Vector3(1.7, -0.35, -16), new THREE.Vector3(1.3, 0.35, -22),
        new THREE.Vector3(-1.3, 0.55, -28), new THREE.Vector3(-3, 0, -35),
      ]);
      const radialSegments = mobile ? 32 : 56;
      const longitudinalSegments = mobile ? 120 : 180;
      const tubeGeometry = new THREE.TubeGeometry(path, longitudinalSegments, 2.16, radialSegments, false);
      const colors = new Float32Array(tubeGeometry.attributes.position.count * 3);
      const tempColor = new THREE.Color();
      for (let i = 0; i <= longitudinalSegments; i++) {
        const t = i / longitudinalSegments;
        const band = Math.abs((t * 22) % 1 - 0.5);
        tempColor.set(band < 0.075 ? 0x8c774f : band < 0.16 ? 0x52647e : 0x88929f);
        for (let j = 0; j <= radialSegments; j++) tempColor.toArray(colors, (i * (radialSegments + 1) + j) * 3);
      }
      tubeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const tunnelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x687383, envMapIntensity: 0.25, metalness: 0.88, roughness: 0.34, side: THREE.DoubleSide });
      tubeGroup.add(new THREE.Mesh(tubeGeometry, tunnelMaterial));
      const ringGeometry = new THREE.TorusGeometry(2.16, 0.028, 6, radialSegments);
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const ring = new THREE.Mesh(ringGeometry, i % 3 === 0 ? blueHeat : weldMaterial);
        ring.position.copy(path.getPointAt(t));
        ring.quaternion.setFromUnitVectors(zAxis, path.getTangentAt(t));
        tubeGroup.add(ring);
      }
      const mouth = new THREE.Group();
      tubeGroup.add(mouth);
      const lip = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(2.16, -1.3), new THREE.Vector2(2.24, -0.65), new THREE.Vector2(2.4, -0.27),
        new THREE.Vector2(2.45, -0.1), new THREE.Vector2(2.42, 0.03), new THREE.Vector2(2.31, 0.08),
        new THREE.Vector2(2.25, -0.05), new THREE.Vector2(2.2, -0.35), new THREE.Vector2(2.14, -1.3),
      ], mobile ? 56 : 96), titanium);
      lip.rotation.x = Math.PI / 2;
      mouth.add(lip);
      const frontLip = new THREE.Mesh(new THREE.TorusGeometry(2.36, 0.055, 12, mobile ? 64 : 112), silver);
      frontLip.position.z = 0.07;
      mouth.add(frontLip);
      const outerShell = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.24, 1.65, radialSegments, 1, true), blackMetal);
      outerShell.rotation.x = Math.PI / 2;
      outerShell.position.z = -0.9;
      mouth.add(outerShell);
      const outerCollar = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.04, 8, radialSegments), weldMaterial);
      outerCollar.position.z = -0.35;
      mouth.add(outerCollar);

      // Long, thin light paths follow the actual inner wall rather than a screen overlay.
      const frames = path.computeFrenetFrames(180, false);
      const wallPoint = (t: number, angle: number, radius = 2.105) => {
        const index = Math.min(180, Math.round(t * 180));
        return path.getPointAt(t).addScaledVector(frames.normals[index], Math.cos(angle) * radius).addScaledVector(frames.binormals[index], Math.sin(angle) * radius);
      };
      for (const angle of [0.35, 2.2, 3.5, 5.35]) {
        const linePath = new THREE.CatmullRomCurve3(Array.from({ length: 91 }, (_, i) => wallPoint(i / 90, angle)));
        tubeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(linePath, mobile ? 72 : 120, 0.009, 3, false), flowMaterial));
        tubeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(linePath, 72, 0.052, 3, false), haloMaterial));
      }
      const flowBeads: { mesh: THREE.Mesh; angle: number; offset: number }[] = [];
      const beadGeometry = new THREE.SphereGeometry(0.025, 5, 4);
      for (let i = 0; i < 18; i++) {
        const bead = new THREE.Mesh(beadGeometry, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xf5d49a : accentColor }));
        flowBeads.push({ mesh: bead, angle: [0.35, 2.2, 3.5, 5.35][i % 4], offset: i / 18 });
        tubeGroup.add(bead);
      }
      scene.add(new THREE.HemisphereLight(0xd8e3f5, 0x0b0d15, 1.2));
      const headlight = new THREE.PointLight(0xe9efff, 27, 18, 1.5);
      scene.add(headlight);
      const mouthKey = new THREE.PointLight(0xeff4ff, 65, 24, 2);
      mouthKey.position.set(-4, 5, 6); scene.add(mouthKey);
      const mouthRim = new THREE.PointLight(accentColor, 48, 15, 2);
      mouthRim.position.set(4, -1, 0.7); scene.add(mouthRim);
      for (let i = 1; i <= 4; i++) {
        const light = new THREE.PointLight(i % 2 ? accentColor : 0xf0d7ae, 14, 12, 1.6);
        light.position.copy(path.getPointAt(i / 5)); scene.add(light);
      }

      const studioCenter = new THREE.Vector3(-3, 0, -57);
      const studio = new THREE.Group(); studio.position.copy(studioCenter); scene.add(studio);
      const product = new THREE.Group(); studio.add(product);
      let modelRadius = 3.6;
      const parts: ExplodablePart[] = [];

      // A recognizable, deliberately illustrative twin-outlet assembly is available
      // immediately, including for tenants without a project-specific GLB.
      const illustrative = new THREE.Group();
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.55, 0.1, -2.5), new THREE.Vector3(side * 0.65, 0, -1.2),
          new THREE.Vector3(side * 1.5, 0, -0.2), new THREE.Vector3(side * 1.6, 0, 1.5),
        ]);
        illustrative.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.31, 20, false), titanium));
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.36, 0.95, 28, 1, true), titanium);
        tip.rotation.x = Math.PI / 2; tip.position.set(side * 1.6, 0, 1.55); illustrative.add(tip);
        const tipLip = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.026, 8, 28), silver);
        tipLip.position.set(side * 1.6, 0, 2.025); illustrative.add(tipLip);
        for (let i = 0; i < 11; i++) {
          const t = i / 10;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.316, 0.014, 5, 20), weldMaterial);
          ring.position.copy(curve.getPointAt(t)); ring.quaternion.setFromUnitVectors(zAxis, curve.getTangentAt(t)); illustrative.add(ring);
        }
      }
      const collector = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2, 24), silver);
      collector.rotation.z = Math.PI / 2; collector.position.z = -0.35; illustrative.add(collector);
      product.add(illustrative);

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), new THREE.MeshBasicMaterial({ color: 0x080b11 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -4; studio.add(floor);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.035, 80), new THREE.MeshBasicMaterial({ color: 0x0b0e13 }));
      plinth.position.y = -3.95; studio.add(plinth);
      const stageRing = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.018, 4, 96), flowMaterial);
      stageRing.rotation.x = Math.PI / 2; stageRing.position.y = -3.92; studio.add(stageRing);
      const rearArc = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.018, 4, 100, Math.PI * 1.5), haloMaterial);
      rearArc.position.set(0, 0.1, -4.4); rearArc.rotation.z = -Math.PI / 4; studio.add(rearArc);
      const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xdce9ff });
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 9, 0.035), stripMaterial);
        strip.position.set(side * 5, 1, -3.4); strip.rotation.z = side * -0.34; studio.add(strip);
      }
      const productKey = new THREE.PointLight(0xffffff, 120, 28, 2); productKey.position.set(-4, 5, 4); studio.add(productKey);
      const productFill = new THREE.PointLight(0xd5e5ff, 90, 25, 2); productFill.position.set(5, 1, 2); studio.add(productFill);
      const productRim = new THREE.PointLight(accentColor, 120, 22, 2); productRim.position.set(1, 3, -4); studio.add(productRim);
      const goldRim = new THREE.PointLight(0xffcf91, 70, 20, 2); goldRim.position.set(-5, -1, -2); studio.add(goldRim);

      let width = 1;
      let height = 1;
      let current = clamp(progress.current || 0);
      let renderedProgress = -1;
      const cameraTarget = new THREE.Vector3();
      const finalPosition = new THREE.Vector3();
      const finalTarget = new THREE.Vector3();
      const finalDirection = new THREE.Vector3(3.8, 6.2, 7.8).normalize();
      const finalRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), finalDirection).normalize();
      const tunnelExit = path.getPointAt(0.97);
      const tunnelExitAim = path.getPointAt(1).add(path.getTangentAt(1).multiplyScalar(6));

      const resize = () => {
        if (disposed || !renderer) return;
        width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true; wake();
      };
      animate = (now: number) => {
        frame = 0;
        if (disposed || !visible || document.hidden || !renderer || !scene) return;
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 1 / 60;
        lastTime = now;
        const requested = clamp(Number.isFinite(progress.current) ? progress.current : 0);
        current += (requested - current) * (1 - Math.exp(-dt * 11));
        if (Math.abs(requested - current) < 0.0001) current = requested;
        if (dirty || Math.abs(current - renderedProgress) > 0.00008) {
          const p = current;
          const portrait = width / height < 0.9;
          const enter = ease(0, 0.2, p);
          const tunnelTravel = ease(0.18, 0.68, p) * 0.97;
          const inside = path.getPointAt(tunnelTravel);
          const lookAhead = path.getPointAt(Math.min(1, tunnelTravel + 0.1));
          camera.position.copy(new THREE.Vector3(portrait ? 0 : -3.8, portrait ? 0.5 : 0.3, portrait ? 12.8 : 7.8).lerp(inside, enter));
          cameraTarget.copy(new THREE.Vector3(portrait ? 0 : -2.65, portrait ? 0.7 : 0.15, -5).lerp(lookAhead, enter));
          const spread = ease(0.84, 1, p) * 0.72;
          parts.forEach(part => part.object.position.copy(part.base).addScaledVector(part.direction, spread));
          product.rotation.set(-0.09 + ease(0.74, 1, p) * 0.12, -0.18 + ease(0.72, 1, p) * 0.7, 0.14);
          const fitAngle = Math.min(THREE.MathUtils.degToRad(camera.fov) / 2, Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect));
          const distance = (modelRadius + spread * 1.1) / Math.sin(fitAngle) * (portrait ? 1.08 : 1.28);
          finalTarget.copy(studioCenter).addScaledVector(finalRight, portrait ? 0 : -2.5);
          if (portrait) finalTarget.y += 1.6;
          finalPosition.copy(finalTarget).addScaledVector(finalDirection, distance);
          if (p > 0.68) {
            const emerge = ease(0.68, 0.87, p);
            camera.position.copy(tunnelExit).lerp(finalPosition, emerge);
            cameraTarget.copy(tunnelExitAim).lerp(finalTarget, emerge);
          }
          camera.up.set(0, 1, 0);
          camera.lookAt(cameraTarget);
          if (p > 0.22 && p < 0.68) camera.rotateZ(Math.sin(tunnelTravel * Math.PI * 2) * 0.035);
          headlight.position.copy(camera.position).add(new THREE.Vector3(-0.5, 0.6, 0.5));
          headlight.intensity = 12 * (1 - ease(0.68, 0.83, p));
          mouthKey.intensity = 65 * (1 - ease(0.1, 0.28, p));
          mouthRim.intensity = 48 * (1 - ease(0.1, 0.28, p));
          tubeGroup.visible = p < 0.83;
          studio.visible = p > 0.45;
          flowBeads.forEach(bead => bead.mesh.position.copy(wallPoint((bead.offset + p * 1.9) % 1, bead.angle)));
          (scene.fog as THREE.FogExp2).density = 0.021 * (1 - ease(0.69, 0.87, p)) + 0.009 * ease(0.69, 0.87, p);
          try { renderer.render(scene, camera); } catch { fail(); return; }
          dirty = false; renderedProgress = current;
          if (!ready) { ready = true; callbacks.current.onReady?.(); }
        }
        // Polling the shared ref is cheap; WebGL renders only when something changes.
        wake();
      };
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
      if ('IntersectionObserver' in window) {
        viewObserver = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; if (visible) { dirty = true; wake(); } else stop(); });
        viewObserver.observe(host);
      }
      const visibility = () => { if (document.hidden) stop(); else { dirty = true; wake(); } };
      document.addEventListener('visibilitychange', visibility);
      listeners.push(() => document.removeEventListener('visibilitychange', visibility));
      resize();

      if (model?.url && model.sizeBytes <= MAX_MODEL3D_BYTES) {
        void (async () => {
          let gltf: GLTF | undefined;
          try {
            const bytes = await fetchModel(model.url, controller.signal);
            if (disposed) return;
            validateGlb(bytes);
            gltf = await new GLTFLoader().parseAsync(bytes, '');
            if (disposed) { disposeObjects(gltf.scenes); return; }
            parsedRoots = gltf.scenes;
            const root = gltf.scene;
            const box = new THREE.Box3().setFromObject(root, true);
            const size = box.getSize(new THREE.Vector3());
            const largest = Math.max(size.x, size.y, size.z);
            if (box.isEmpty() || !Number.isFinite(largest) || largest <= 0) throw new Error('Empty model');
            const normalization = new THREE.Group();
            const translation = new THREE.Group();
            const scale = 6.5 / largest;
            normalization.scale.setScalar(scale); translation.position.copy(box.getCenter(new THREE.Vector3())).negate();
            translation.add(root); normalization.add(translation);
            product.remove(illustrative);
            // These materials are also used by the tunnel, so only the fallback's
            // geometries are released here. Shared materials remain scene-owned.
            const discarded = new Set<THREE.BufferGeometry>(); illustrative.traverse(object => { if ((object as THREE.Mesh).geometry) discarded.add((object as THREE.Mesh).geometry); }); discarded.forEach(geometry => geometry.dispose());
            product.add(normalization);
            product.updateWorldMatrix(true, true);
            modelRadius = size.length() * scale * 0.5;
            const collectParts = (object: THREE.Object3D, ancestorOwns: boolean) => {
              const direction = object.userData?.explodeDirection;
              const eligible = !ancestorOwns && Array.isArray(direction) && direction.length === 3 && direction.every(value => typeof value === 'number' && Number.isFinite(value)) && direction.some(value => value !== 0);
              if (eligible && object.parent) {
                const parentLinear = new THREE.Matrix3().setFromMatrix4(object.parent.matrixWorld);
                if (Math.abs(parentLinear.determinant()) > 1e-12) {
                  const offset = new THREE.Vector3(...direction as [number, number, number]).normalize()
                    .transformDirection(object.parent.matrixWorld).multiplyScalar(6.5 * .22)
                    .applyMatrix3(parentLinear.invert());
                  parts.push({ object, base: object.position.clone(), direction: offset });
                }
              }
              object.children.forEach(child => collectParts(child, ancestorOwns || eligible));
            };
            collectParts(root, false);
            callbacks.current.onModelReady?.(true);
            dirty = true; wake();
          } catch {
            if (disposed || controller.signal.aborted) return;
            // A project asset failure never prevents entry to the storefront.
            // The opening remains the illustrative assembly; the main viewer
            // independently presents its explicit project-loading status.
            if (gltf) { disposeObjects(gltf.scenes); parsedRoots = []; }
          }
        })();
      }
    } catch { fail(); }
    return clean;
  }, [progress, safeAccent, model?.url, model?.sizeBytes]);

  return <div ref={hostRef} className="auto-immersive-canvas" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />;
}
