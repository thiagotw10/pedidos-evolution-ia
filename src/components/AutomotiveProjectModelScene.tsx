import React, { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { automotivePixelRatio } from '../utils/automotiveRenderQuality';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MAX_MODEL3D_BYTES, validateGlb } from '../../functions/src/automotiveModel3d';

interface AutomotiveProjectModelSceneProps {
  accent: string;
  model: {
    url: string;
    source: 'photos' | 'cad' | 'scan';
    fileName: string;
    sizeBytes: number;
    referenceImages?: string[];
  };
  projectName: string;
  fallbackImage?: string;
}

type ExplodablePart = { object: THREE.Object3D; base: THREE.Vector3; offset: THREE.Vector3 };
type View = { yaw: number; pitch: number; distance: number; spread: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const initialView = (): View => ({ yaw: 0, pitch: 0, distance: 1, spread: 0 });
const sourceLabels = { photos: 'Modelo a partir de fotos', cad: 'Modelo a partir de CAD', scan: 'Modelo a partir de escaneamento' };

/** Release parsed assets, including ImageBitmaps that Three does not close itself. */
function disposeObjects(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  roots.forEach(root => root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
    const skeleton = (object as THREE.SkinnedMesh).skeleton;
    if (skeleton?.boneTexture) textures.add(skeleton.boneTexture);
  }));
  materials.forEach(material => {
    Object.values(material).forEach(value => {
      if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) textures.add(value as THREE.Texture);
    });
    material.dispose();
  });
  textures.forEach(texture => {
    const imageList = Array.isArray(texture.image) ? texture.image : [texture.image];
    imageList.forEach(image => { if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image); });
    texture.dispose();
  });
  images.forEach(image => image.close());
  geometries.forEach(geometry => geometry.dispose());
}

/** Enforce the size limit during transfer, even when Content-Length is missing. */
async function fetchModel(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Não foi possível carregar o arquivo 3D.');
  const statedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(statedLength) && statedLength > MAX_MODEL3D_BYTES) {
    await response.body?.cancel();
    throw new Error('O arquivo 3D excede o limite de 70 MB.');
  }
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_MODEL3D_BYTES) throw new Error('O arquivo 3D excede o limite de 70 MB.');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_MODEL3D_BYTES) { await reader.cancel(); throw new Error('O arquivo 3D excede o limite de 70 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return bytes.buffer;
}

export default function AutomotiveProjectModelScene({ accent, model, projectName, fallbackImage }: AutomotiveProjectModelSceneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<() => void>(() => {});
  const targets = useRef<View>(initialView());
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const [hasParts, setHasParts] = useState(false);
  const [spread, setSpread] = useState(0);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const instructionsId = useId();
  const rangeId = useId();
  const safeAccent = /^#([\da-f]{3}|[\da-f]{6})$/i.test(accent) ? accent : '#5b84ff';

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return;
    const controller = new AbortController();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let environment: THREE.WebGLRenderTarget | undefined;
    let room: RoomEnvironment | undefined;
    let pmrem: THREE.PMREMGenerator | undefined;
    let sizeObserver: ResizeObserver | undefined;
    let viewObserver: IntersectionObserver | undefined;
    let disposed = false;
    let suspended = false;
    let inView = !('IntersectionObserver' in window);
    let frame = 0;
    let lastFrameTime = 0;
    let parsedRoots: THREE.Object3D[] = [];
    let renderFrame: (now: number) => void = () => {};
    const listeners: (() => void)[] = [];

    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastFrameTime = 0; };
    const wake = () => { if (!disposed && !suspended && inView && !document.hidden && !frame && renderer) frame = requestAnimationFrame(renderFrame); };
    const clean = () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      stop();
      sizeObserver?.disconnect();
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
      if (wakeRef.current === wake) wakeRef.current = () => {};
    };
    const fail = (message: string) => { if (!disposed) { clean(); setReady(false); setFailure(message); } };
    targets.current = initialView();
    setReady(false);
    setFailure('');
    setHasParts(false);
    setSpread(0);
    setFallbackFailed(false);
    wakeRef.current = wake;

    const setup = async () => {
      try {
        if (model.sizeBytes > MAX_MODEL3D_BYTES) throw new Error('O arquivo 3D excede o limite de 70 MB.');
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x101317, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        const canvas = renderer.domElement;
        Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y pinch-zoom', cursor: 'grab' });
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        const lost = (event: Event) => { event.preventDefault(); suspended = true; fail('A visualização 3D foi interrompida neste dispositivo. Você pode tentar novamente.'); };
        canvas.addEventListener('webglcontextlost', lost);
        listeners.push(() => canvas.removeEventListener('webglcontextlost', lost));

        scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(39, 1, 0.01, 160);
        const cameraDirection = new THREE.Vector3(4.5, 3.1, 7.5).normalize();
        const cameraRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraDirection, cameraRight).normalize();
        const fitCorners: { point: THREE.Vector3; offset?: THREE.Vector3 }[] = [];
        const projectedCorner = new THREE.Vector3();
        let fitDistance = 9;
        let loaded = false;
        let readyReported = false;
        const aim = new THREE.Vector3();
        const pivot = new THREE.Group();
        scene.add(pivot);
        const parts: ExplodablePart[] = [];
        const current = initialView();

        room = new RoomEnvironment();
        pmrem = new THREE.PMREMGenerator(renderer);
        environment = pmrem.fromScene(room, 0.045);
        scene.environment = environment.texture;
        scene.environmentIntensity = 0.9;
        room.dispose(); room = undefined;
        pmrem.dispose(); pmrem = undefined;
        scene.add(new THREE.HemisphereLight(0xe5edf7, 0x333840, 1.6));
        const key = new THREE.DirectionalLight(0xfff7ed, 2.4); key.position.set(-3, 6, 5); scene.add(key);
        const fill = new THREE.DirectionalLight(0xe7f0ff, 1.4); fill.position.set(5, 1, 3); scene.add(fill);
        const rim = new THREE.DirectionalLight(0xf4f7ff, 2); rim.position.set(-4, 2, -4); scene.add(rim);
        const grid = new THREE.GridHelper(14, 28, 0x3e4650, 0x303740);
        grid.position.y = -2.5;
        (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(material => { material.transparent = true; material.opacity = 0.24; });
        scene.add(grid);

        const resize = () => {
          if (disposed || !renderer) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer.setPixelRatio(automotivePixelRatio(width, height, window.devicePixelRatio, renderer.capabilities.maxTextureSize));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          wake();
        };

        renderFrame = (now: number) => {
          frame = 0;
          if (disposed || suspended || !inView || document.hidden || !renderer || !scene) return;
          const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 1 / 60;
          lastFrameTime = now;
          const factor = reduced.matches ? 1 : 1 - Math.exp(-dt * 16);
          const next = targets.current;
          let moving = false;
          (['yaw', 'pitch', 'distance', 'spread'] as const).forEach(keyName => {
            const delta = next[keyName] - current[keyName];
            if (Math.abs(delta) > 0.0001) { current[keyName] += delta * factor; moving = true; } else current[keyName] = next[keyName];
          });
          pivot.rotation.set(current.pitch, current.yaw, 0, 'YXZ');
          parts.forEach(part => part.object.position.copy(part.base).addScaledVector(part.offset, current.spread));
          if (fitCorners.length) {
            // A sphere wastes most of the viewport for long, flat exhausts. Fit
            // each projected box corner against both frustum axes instead.
            const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
            const tanHorizontal = tanVertical * camera.aspect;
            fitDistance = 0.1;
            fitCorners.forEach(corner => {
              projectedCorner.copy(corner.point);
              if (corner.offset) projectedCorner.addScaledVector(corner.offset, current.spread);
              projectedCorner.applyQuaternion(pivot.quaternion);
              const depth = projectedCorner.dot(cameraDirection);
              const horizontal = Math.abs(projectedCorner.dot(cameraRight)) * 1.12 / tanHorizontal;
              const vertical = Math.abs(projectedCorner.dot(cameraUp)) * 1.12 / tanVertical;
              fitDistance = Math.max(fitDistance, depth + Math.max(horizontal, vertical) + 0.05);
            });
          }
          camera.position.copy(cameraDirection).multiplyScalar(fitDistance * current.distance);
          camera.lookAt(aim);
          try {
            renderer.render(scene, camera);
            if (loaded && !readyReported) { readyReported = true; setReady(true); }
          } catch { fail('A visualização 3D não está disponível neste dispositivo. Consulte as fotos do projeto ou tente novamente.'); return; }
          if (moving) wake(); else lastFrameTime = 0;
        };

        let pointer: number | null = null;
        let previousX = 0;
        let previousY = 0;
        let originX = 0;
        let originY = 0;
        let touchStarted = false;
        const down = (event: PointerEvent) => {
          if (!loaded || pointer !== null || !event.isPrimary || event.button !== 0) return;
          pointer = event.pointerId;
          previousX = originX = event.clientX;
          previousY = originY = event.clientY;
          touchStarted = event.pointerType !== 'touch';
          if (touchStarted) canvas.setPointerCapture(pointer);
          canvas.style.cursor = 'grabbing';
        };
        const move = (event: PointerEvent) => {
          if (event.pointerId !== pointer) return;
          if (!touchStarted) {
            const dx = event.clientX - originX;
            const dy = event.clientY - originY;
            if (Math.abs(dx) < 7 || Math.abs(dy) > Math.abs(dx)) return;
            touchStarted = true;
            canvas.setPointerCapture(event.pointerId);
          }
          targets.current.yaw += (event.clientX - previousX) * 0.007;
          targets.current.pitch = clamp(targets.current.pitch + (event.clientY - previousY) * 0.004, -1.15, 1.15);
          previousX = event.clientX;
          previousY = event.clientY;
          wake();
        };
        const up = (event: PointerEvent) => {
          if (event.pointerId !== pointer) return;
          const released = pointer; pointer = null;
          if (canvas.hasPointerCapture(released)) canvas.releasePointerCapture(released);
          canvas.style.cursor = 'grab';
        };
        const visibility = () => { if (document.hidden) stop(); else wake(); };
        const motion = () => { stop(); wake(); };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('lostpointercapture', up);
        document.addEventListener('visibilitychange', visibility);
        reduced.addEventListener('change', motion);
        listeners.push(() => {
          canvas.removeEventListener('pointerdown', down);
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          canvas.removeEventListener('pointercancel', up);
          canvas.removeEventListener('lostpointercapture', up);
          document.removeEventListener('visibilitychange', visibility);
          reduced.removeEventListener('change', motion);
          if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
        });
        sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(host);
        if ('IntersectionObserver' in window) {
          viewObserver = new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); if (inView) wake(); else stop(); });
          viewObserver.observe(stage);
        }
        resize();

        const bytes = await fetchModel(model.url, controller.signal);
        if (disposed) return;
        // Shared validation rejects external resources and unsupported compressed assets.
        validateGlb(bytes);
        const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes, '', resolve, reject));
        parsedRoots = gltf.scenes;
        if (disposed) { disposeObjects(parsedRoots); parsedRoots = []; return; }
        const root = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(root, true);
        const size = bounds.getSize(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z);
        if (bounds.isEmpty() || !Number.isFinite(largest) || largest <= 0 || ![size.x, size.y, size.z].every(Number.isFinite)) throw new Error('O modelo não contém uma geometria visível.');
        const center = bounds.getCenter(new THREE.Vector3());
        const normalization = new THREE.Group();
        const translation = new THREE.Group();
        normalization.scale.setScalar(4.8 / largest);
        translation.position.copy(center).negate();
        translation.add(root);
        normalization.add(translation);
        pivot.add(normalization);
        grid.position.y = -size.y * (4.8 / largest) / 2 - 0.08;
        pivot.updateMatrixWorld(true);
        const addFitBox = (box: THREE.Box3, offset?: THREE.Vector3) => {
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            fitCorners.push({ point: new THREE.Vector3(x, y, z), offset });
          }
        };
        addFitBox(new THREE.Box3().setFromObject(root, true));

        // Only author-supplied directions enable exploded views. An annotated
        // ancestor owns its assembly, avoiding a second offset on descendants.
        const collectParts = (object: THREE.Object3D, hasAnnotatedAncestor: boolean) => {
          const direction = object.userData?.explodeDirection;
          const eligible = !hasAnnotatedAncestor && Array.isArray(direction) && direction.length === 3 && direction.every(value => typeof value === 'number' && Number.isFinite(value)) && direction.some(value => value !== 0);
          if (eligible) {
            const offset = new THREE.Vector3(...direction as [number, number, number]).normalize().multiplyScalar(largest * 0.38);
            parts.push({ object, base: object.position.clone(), offset });
            const worldOffset = offset.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(object.parent?.matrixWorld || new THREE.Matrix4()));
            addFitBox(new THREE.Box3().setFromObject(object, true), worldOffset);
          }
          object.children.forEach(child => collectParts(child, hasAnnotatedAncestor || eligible));
        };
        collectParts(root, false);
        setHasParts(parts.length > 0);
        loaded = true;
        resize();
        wake();
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const tooLarge = error instanceof Error && (error.message.includes('70 MB') || error.message.includes('20 MB'));
        fail(tooLarge ? error.message : 'Não foi possível abrir este modelo 3D. Consulte as fotos do projeto ou tente novamente.');
      }
    };
    void setup();
    return clean;
  }, [model.url, model.sizeBytes, attempt]);

  const rotate = (direction: number) => { targets.current.yaw += direction * Math.PI / 8; wakeRef.current(); };
  const zoom = (factor: number) => { targets.current.distance = clamp(targets.current.distance * factor, 0.55, 2.5); wakeRef.current(); };
  const reset = () => { targets.current = initialView(); setSpread(0); wakeRef.current(); };
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || failure) return;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft': rotate(-1); break;
      case 'ArrowRight': rotate(1); break;
      case 'ArrowUp': targets.current.pitch = clamp(targets.current.pitch - 0.16, -1.15, 1.15); wakeRef.current(); break;
      case 'ArrowDown': targets.current.pitch = clamp(targets.current.pitch + 0.16, -1.15, 1.15); wakeRef.current(); break;
      case '+': case '=': zoom(0.85); break;
      case '-': case '_': zoom(1 / 0.85); break;
      case 'Home': reset(); break;
      default: handled = false;
    }
    if (handled) event.preventDefault();
  };
  const buttonStyle: React.CSSProperties = { minHeight: 40, minWidth: 40, padding: '8px 12px', border: '1px solid #ffffff26', borderRadius: 5, background: '#ffffff08', color: '#e5e9ef', cursor: ready ? 'pointer' : 'default', font: 'inherit', fontSize: 12, opacity: ready ? 1 : 0.45 };

  return (
    <div className="auto-exhaust-experience auto-project-model" style={{ width: '100%', color: '#e5e9ef', '--auto-accent': safeAccent } as React.CSSProperties}>
      <style>{`.auto-project-model button:focus-visible,.auto-project-model input:focus-visible,.auto-project-model .auto-project-model-host:focus-visible{outline:2px solid var(--auto-accent);outline-offset:4px}.auto-project-model button:disabled{cursor:default}.auto-project-model .auto-project-model-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:18px 0;border-bottom:1px solid #ffffff19}.auto-project-model .auto-project-model-spread{display:flex;flex:1 1 230px;align-items:center;gap:12px;max-width:380px;font-size:11px;color:#bcc4cf}.auto-project-model .auto-project-model-spread input{min-width:50px;width:100%;flex:1;accent-color:var(--auto-accent)}@media(max-width:480px){.auto-project-model .auto-project-model-controls{justify-content:center}.auto-project-model .auto-project-model-spread{order:2;flex-basis:100%;max-width:none}}`}</style>
      <div ref={stageRef} className={`auto-exhaust-stage${ready && !failure ? ' is-ready' : ''}${failure ? ' is-fallback' : ''}`} style={{ position: 'relative', width: '100%', height: 'clamp(330px, 44vw, 600px)', minHeight: 330, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 38%, #252c34 0%, #15191f 56%, #0c0f13 100%)', borderRadius: 5 }}>
        <div ref={hostRef} className="auto-exhaust-canvas auto-project-model-host" role="group" tabIndex={ready && !failure ? 0 : -1} aria-label={`Visualização 3D do projeto ${projectName}`} aria-describedby={instructionsId} aria-hidden={!!failure || !ready} onKeyDown={keyDown} style={{ position: 'absolute', inset: 0, opacity: failure ? 0 : 1 }} />
        <div className="auto-exhaust-hud" aria-hidden="true" style={{ position: 'absolute', inset: '20px 22px auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 9, pointerEvents: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.08em', color: '#c1c8d1' }}>
          <span>3D DO PROJETO</span><span style={{ color: safeAccent }}>{sourceLabels[model.source]}</span>
        </div>
        {!ready && !failure && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#bdc6d2', fontSize: 13, pointerEvents: 'none', padding: 24, textAlign: 'center' }}>Carregando o modelo deste projeto…</div>}
        {failure && <div className="auto-exhaust-fallback" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '54px 24px 24px' }}>
          {fallbackImage && !fallbackFailed && <img src={fallbackImage} alt={`Foto do projeto ${projectName}`} onError={() => setFallbackFailed(true)} loading="lazy" style={{ width: '100%', flex: '1 1 0', minHeight: 0, maxHeight: '65%', objectFit: 'contain', borderRadius: 8 }} />}
          <p role="status" style={{ color: '#c1c8d2', fontSize: 13, lineHeight: 1.5, textAlign: 'center', maxWidth: 380, margin: 0 }}>{failure}</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)} style={{ ...buttonStyle, opacity: 1, cursor: 'pointer', flexShrink: 0 }}>Tentar novamente</button>
        </div>}
        {ready && !failure && <div className="auto-exhaust-stage-caption" aria-hidden="true" style={{ position: 'absolute', bottom: 20, left: 22, right: 22, pointerEvents: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '.1em', color: '#c1c8d1' }}>ARRASTE PARA EXPLORAR <span style={{ color: safeAccent }}>↔</span></div>}
      </div>
      {!failure && <div className="auto-project-model-controls">
        <div role="group" aria-label="Girar o modelo do projeto" style={{ display: 'flex', gap: 7 }}>
          <button type="button" disabled={!ready} aria-label="Girar modelo para a esquerda" onClick={() => rotate(-1)} style={buttonStyle}>←</button>
          <button type="button" disabled={!ready} onClick={reset} style={buttonStyle}>Recentrar</button>
          <button type="button" disabled={!ready} aria-label="Girar modelo para a direita" onClick={() => rotate(1)} style={buttonStyle}>→</button>
        </div>
        {hasParts && <div className="auto-project-model-spread">
          <label htmlFor={rangeId}>Montado</label>
          <input id={rangeId} type="range" aria-label="Separação das peças do modelo do projeto" min="0" max="1" step="0.01" value={spread} disabled={!ready} onChange={event => { const value = Number(event.target.value); targets.current.spread = value; setSpread(value); wakeRef.current(); }} />
          <span>Em detalhes</span>
        </div>}
        <div role="group" aria-label="Zoom do modelo do projeto" style={{ display: 'flex', gap: 7 }}>
          <button type="button" disabled={!ready} aria-label="Afastar modelo" onClick={() => zoom(1 / 0.85)} style={buttonStyle}>−</button>
          <button type="button" disabled={!ready} aria-label="Aproximar modelo" onClick={() => zoom(0.85)} style={buttonStyle}>+</button>
        </div>
      </div>}
      <p id={instructionsId} className="auto-exhaust-note" style={{ color: '#a9b2bf', fontSize: 11, lineHeight: 1.7, margin: '14px 0 0' }}>{sourceLabels[model.source]}. {failure ? 'As fotos continuam disponíveis no portfólio.' : 'Arraste para girar ou use as setas do teclado. Use + e − para aproximar e Home para recentrar.'} A representação não substitui a análise técnica de aplicação e medidas.</p>
    </div>
  );
}
