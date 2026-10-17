import React, { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { automotivePixelRatio } from '../utils/automotiveRenderQuality';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface AutomotiveExhaustSceneProps {
  accent: string;
  fallbackImage?: string;
}

type Finish = 'inox' | 'titanium';
type Piece = { group: THREE.Group; base: THREE.Vector3; direction: THREE.Vector3 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A lightweight, illustrative catback study. Product photography remains the source of truth. */
export default function AutomotiveExhaustScene({ accent, fallbackImage }: AutomotiveExhaustSceneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<() => void>(() => {});
  const targets = useRef({ finish: 'titanium' as Finish, spread: 0.08, manualSpread: false, yaw: 0, pitch: 0 });
  const [nearViewport, setNearViewport] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finish, setFinish] = useState<Finish>('titanium');
  const [spread, setSpread] = useState(0.08);
  const instructionsId = useId();
  const rangeId = useId();

  // Importing the component is cheap; the WebGL context is created only near its section.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '260px 0px' });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!nearViewport || !host || !stage) return;

    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let environment: THREE.WebGLRenderTarget | undefined;
    let room: RoomEnvironment | undefined;
    let pmrem: THREE.PMREMGenerator | undefined;
    let sizeObserver: ResizeObserver | undefined;
    let viewObserver: IntersectionObserver | undefined;
    let frame = 0;
    let scrollFrame = 0;
    let disposed = false;
    let contextLost = false;
    let inView = false;
    let readyReported = false;
    let renderFrame: (now: number) => void = () => {};
    const removeListeners: (() => void)[] = [];
    const ownedTextures = new Set<THREE.Texture>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const wake = () => {
      if (!disposed && !contextLost && inView && !document.hidden && !frame && renderer) {
        frame = requestAnimationFrame(renderFrame);
      }
    };
    const clean = () => {
      if (disposed) return;
      disposed = true;
      stop();
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      sizeObserver?.disconnect();
      viewObserver?.disconnect();
      removeListeners.forEach(remove => remove());
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene?.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) {
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      ownedTextures.forEach(texture => texture.dispose());
      environment?.dispose();
      room?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      if (wakeRef.current === wake) wakeRef.current = () => {};
    };

    setReady(false);
    setFailed(false);
    wakeRef.current = wake;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x101317, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'pan-y';
      canvas.style.cursor = 'grab';
      canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);

      scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 60);
      const cameraDirection = new THREE.Vector3(4.4, 4.1, 7.5).normalize();
      let cameraDistance = 10;
      const aim = new THREE.Vector3(0, 0.05, 0);

      room = new RoomEnvironment();
      pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, 0.045);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.85;
      room.dispose();
      room = undefined;
      pmrem.dispose();
      pmrem = undefined;

      scene.add(new THREE.HemisphereLight(0xd7e2ee, 0x20242c, 2.1));
      const key = new THREE.DirectionalLight(0xfff2df, 3.2);
      key.position.set(-3, 6, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(/^#([\da-f]{3}|[\da-f]{6})$/i.test(accent) ? accent : '#5c7fff', 2.8);
      rim.position.set(-4, 2, -4);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xe7f0ff, 1.6);
      fill.position.set(5, 1, 3);
      scene.add(fill);

      // Fine deterministic lines modulate the roughness without network textures.
      const brushCanvas = document.createElement('canvas');
      brushCanvas.width = 256;
      brushCanvas.height = 128;
      const brushContext = brushCanvas.getContext('2d');
      if (brushContext) {
        brushContext.fillStyle = '#c5c5c5';
        brushContext.fillRect(0, 0, 256, 128);
        for (let y = 0; y < 128; y++) {
          const shade = 170 + Math.round((Math.sin(y * 43.17) * 0.5 + 0.5) * 76);
          brushContext.strokeStyle = `rgb(${shade},${shade},${shade})`;
          brushContext.lineWidth = 0.5;
          brushContext.beginPath();
          brushContext.moveTo(0, y + 0.5);
          brushContext.lineTo(256, y + 0.5);
          brushContext.stroke();
        }
      }
      const brushed = new THREE.CanvasTexture(brushCanvas);
      brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
      brushed.repeat.set(2, 3);
      ownedTextures.add(brushed);
      const steel = new THREE.MeshStandardMaterial({ color: 0xb7bec8, metalness: 0.96, roughness: 0.32, roughnessMap: brushed });
      const polished = new THREE.MeshStandardMaterial({ color: 0xcbd1d6, metalness: 1, roughness: 0.19 });
      const satin = new THREE.MeshStandardMaterial({ color: 0x7a8490, metalness: 0.92, roughness: 0.42 });
      const weldMetal = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.92, roughness: 0.37 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x151b22, metalness: 0.45, roughness: 0.7 });
      const bore = new THREE.MeshStandardMaterial({ color: 0x16191d, metalness: 0.5, roughness: 0.78, side: THREE.BackSide });
      const heatMaterials = [0x9d733b, 0x896b88, 0x575b99, 0x49789c, 0x7d928f].map(color => (
        new THREE.MeshStandardMaterial({ color, metalness: 0.92, roughness: 0.32 })
      ));

      const model = new THREE.Group();
      scene.add(model);
      const pieces: Piece[] = [];
      const heatZones: THREE.Group[] = [];
      const zAxis = new THREE.Vector3(0, 0, 1);
      const xAxis = new THREE.Vector3(1, 0, 0);
      const piece = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        model.add(group);
        pieces.push({ group, base: group.position.clone(), direction: new THREE.Vector3(dx, dy, dz) });
        return group;
      };
      const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position?: THREE.Vector3) => {
        const object = new THREE.Mesh(geometry, material);
        if (position) object.position.copy(position);
        parent.add(object);
        return object;
      };
      const ring = (parent: THREE.Object3D, position: THREE.Vector3, direction: THREE.Vector3, radius: number, thickness: number, material: THREE.Material) => {
        const object = mesh(new THREE.TorusGeometry(radius, thickness, 8, 48), material, parent, position);
        object.quaternion.setFromUnitVectors(zAxis, direction.clone().normalize());
        return object;
      };
      const weld = (parent: THREE.Object3D, point: THREE.Vector3, direction: THREE.Vector3, radius = 0.155) => {
        const tangent = direction.clone().normalize();
        ring(parent, point, tangent, radius + 0.005, 0.012, weldMetal);
        const zone = new THREE.Group();
        parent.add(zone);
        heatZones.push(zone);
        heatMaterials.forEach((material, index) => {
          const offset = point.clone().addScaledVector(tangent, (index - 2) * 0.018);
          ring(zone, offset, tangent, radius + 0.002, 0.0105, material);
        });
      };
      const tube = (parent: THREE.Object3D, points: number[][], radius = 0.15, seams: number[] = []) => {
        const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point as [number, number, number])), false, 'centripetal');
        mesh(new THREE.TubeGeometry(curve, 56, radius, 20, false), steel, parent);
        seams.forEach(progress => weld(parent, curve.getPointAt(progress), curve.getTangentAt(progress), radius));
        return curve;
      };
      const flange = (parent: THREE.Object3D, position: THREE.Vector3, radius = 0.16) => {
        const group = new THREE.Group();
        group.position.copy(position);
        parent.add(group);
        const shape = new THREE.Shape();
        shape.absarc(0, 0, radius + 0.105, 0, Math.PI * 2, false);
        const opening = new THREE.Path();
        opening.absarc(0, 0, radius - 0.01, 0, Math.PI * 2, true);
        shape.holes.push(opening);
        const plate = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.009, bevelThickness: 0.009, curveSegments: 32 }), satin, group);
        plate.rotation.y = Math.PI / 2;
        for (let i = 0; i < 3; i++) {
          const angle = i * Math.PI * 2 / 3 + Math.PI / 6;
          const bolt = mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.105, 6), polished, group, new THREE.Vector3(0.027, Math.sin(angle) * (radius + 0.06), Math.cos(angle) * (radius + 0.06)));
          bolt.rotation.z = Math.PI / 2;
        }
        return group;
      };

      // Longitudinal inlet and a pair of swept branches establish the recognizable catback silhouette.
      const inlet = piece(0, 0, 0, -0.55, 0, 0);
      tube(inlet, [[-3.05, 0.08, 0], [-2.7, 0.08, 0], [-2.22, 0.04, 0.15], [-1.75, 0, 0.12], [-1.35, 0, 0]], 0.17, [0.22, 0.66]);
      flange(inlet, new THREE.Vector3(-3.09, 0.08, 0), 0.17);
      ring(inlet, new THREE.Vector3(-1.41, 0, 0), xAxis, 0.181, 0.025, satin);

      const splitter = piece(0, 0, 0, -0.06, 0, 0);
      for (const side of [-1, 1]) {
        tube(splitter, [[-1.38, 0, 0], [-1.05, 0, side * 0.22], [-0.68, 0, side * 0.64], [-0.25, 0, side * 0.82], [0.04, 0, side * 0.82]], 0.15, [0.5, 0.88]);
      }
      const collector = mesh(new THREE.SphereGeometry(0.2, 24, 12), steel, splitter, new THREE.Vector3(-1.25, 0, 0));
      collector.scale.set(1.4, 0.85, 1.05);

      for (const side of [-1, 1]) {
        const muffler = piece(0.70, 0, side * 0.82, 0.10, 0.12, side * 0.30);
        const body = mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.34, 48, 1), steel, muffler);
        body.scale.x = 0.78;
        body.rotation.z = Math.PI / 2;
        for (const end of [-1, 1]) {
          const cap = mesh(new THREE.SphereGeometry(1, 40, 20), satin, muffler, new THREE.Vector3(end * 0.67, 0, 0));
          cap.scale.set(0.105, 0.333, 0.429);
          const seam = ring(muffler, new THREE.Vector3(end * 0.645, 0, 0), xAxis, 0.432, 0.013, weldMetal);
          seam.scale.y = 0.78;
          tube(muffler, [[end * 0.66, 0, 0], [end * 0.80, 0, 0]], 0.151);
          weld(muffler, new THREE.Vector3(end * 0.77, 0, 0), xAxis);
        }
        const strap = ring(muffler, new THREE.Vector3(0.17, 0, 0), xAxis, 0.444, 0.021, satin);
        strap.scale.y = 0.78;
        const hanger = new THREE.CatmullRomCurve3([new THREE.Vector3(0.18, 0.3, -0.12), new THREE.Vector3(0.18, 0.52, -0.12), new THREE.Vector3(0.18, 0.58, 0.08), new THREE.Vector3(0.18, 0.52, 0.25)]);
        mesh(new THREE.TubeGeometry(hanger, 20, 0.026, 8), satin, muffler);
        const mount = mesh(new THREE.BoxGeometry(0.21, 0.1, 0.13), dark, muffler, new THREE.Vector3(0.18, 0.54, 0.27));
        mount.rotation.x = -0.12;

        // A restrained valve actuator detail makes the assembly feel engineered, not decorative tubing.
        const actuator = mesh(new THREE.BoxGeometry(0.24, 0.13, 0.22), dark, muffler, new THREE.Vector3(0.62, 0.25, side * 0.08));
        actuator.rotation.z = -0.12;
        mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 16), polished, muffler, new THREE.Vector3(0.62, 0.13, side * 0.08));
        for (const offset of [-0.075, 0.075]) {
          mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 6), polished, muffler, new THREE.Vector3(0.62 + offset, 0.326, side * 0.08));
        }

        const outlet = piece(0, 0, 0, 0.40, 0, side * 0.30);
        tube(outlet, [[1.48, 0, side * 0.82], [1.70, 0, side * 0.82], [1.94, 0.02, side * 0.99], [2.24, 0.03, side * 0.99]], 0.15, [0.24, 0.74]);
        ring(outlet, new THREE.Vector3(1.50, 0, side * 0.82), xAxis, 0.17, 0.024, satin);

        // The closed profile includes an inner wall and lip; the mouth stays genuinely hollow.
        const tip = piece(2.54, 0.03, side * 0.99, 0.76, 0, side * 0.30);
        const profile = [
          [0.16, -0.37], [0.177, -0.23], [0.21, 0.16], [0.239, 0.32],
          [0.243, 0.39], [0.235, 0.415], [0.211, 0.415], [0.207, 0.37],
          [0.183, 0.16], [0.145, -0.37], [0.16, -0.37]
        ].map(([radius, along]) => new THREE.Vector2(radius, along));
        const shell = mesh(new THREE.LatheGeometry(profile, 64), polished, tip);
        shell.rotation.z = -Math.PI / 2;
        const innerWall = mesh(new THREE.CylinderGeometry(0.143, 0.143, 0.60, 40, 1, true), bore, tip, new THREE.Vector3(-0.10, 0, 0));
        innerWall.rotation.z = Math.PI / 2;
        const depth = mesh(new THREE.CircleGeometry(0.143, 40), dark, tip, new THREE.Vector3(-0.405, 0, 0));
        depth.rotation.y = Math.PI / 2;
        const mouth = ring(tip, new THREE.Vector3(0.405, 0, 0), xAxis, 0.225, 0.012, polished);
        mouth.scale.set(1, 1, 1);
        weld(tip, new THREE.Vector3(-0.29, 0, 0), xAxis, 0.171);
      }

      // A soft, local contact shadow grounds the part without expensive realtime shadow maps.
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const shadowContext = shadowCanvas.getContext('2d');
      if (shadowContext) {
        const gradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(0,0,0,.60)');
        gradient.addColorStop(0.55, 'rgba(0,0,0,.25)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        shadowContext.fillStyle = gradient;
        shadowContext.fillRect(0, 0, 128, 128);
      }
      const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      ownedTextures.add(shadowTexture);
      const shadow = mesh(new THREE.PlaneGeometry(7.8, 4), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.65, depthWrite: false }), scene, new THREE.Vector3(0, -0.65, 0));
      shadow.rotation.x = -Math.PI / 2;
      const grid = new THREE.GridHelper(9, 18, 0x77818b, 0x4d5865);
      grid.position.y = -0.68;
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(material => { material.transparent = true; material.opacity = 0.13; material.depthWrite = false; });
      scene.add(grid);

      let spreadCurrent = targets.current.spread;
      let yawCurrent = -0.30;
      let pitchCurrent = 0.035;
      let scrollProgress = 0.5;
      let lastFinish: Finish | undefined;
      const syncScroll = () => {
        scrollFrame = 0;
        if (disposed || reduced.matches) return;
        const rect = stage.getBoundingClientRect();
        const viewportHeight = window.innerHeight || 1;
        scrollProgress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
        if (!targets.current.manualSpread) {
          const next = 0.035 + scrollProgress * 0.18;
          targets.current.spread = next;
          setSpread(previous => Math.abs(previous - next) > 0.012 ? next : previous);
        }
        wake();
      };
      const onScroll = () => {
        if (!scrollFrame && inView && !reduced.matches) scrollFrame = requestAnimationFrame(syncScroll);
      };
      const resize = () => {
        if (disposed || !renderer) return;
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (!width || !height) return;
        renderer.setPixelRatio(automotivePixelRatio(width, height, window.devicePixelRatio, renderer.capabilities.maxTextureSize));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        const fieldOfView = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        cameraDistance = Math.max(3.6 / (2 * fieldOfView), 7.8 / (2 * fieldOfView * camera.aspect)) * 1.1;
        camera.updateProjectionMatrix();
        wake();
      };

      renderFrame = now => {
        frame = 0;
        if (disposed || contextLost || !inView || document.hidden || !renderer || !scene) return;
        const target = targets.current;
        const mix = reduced.matches ? 1 : 0.09;
        const desiredYaw = -0.30 + target.yaw + (reduced.matches ? 0 : (scrollProgress - 0.5) * 0.25);
        const desiredPitch = 0.035 + target.pitch;
        spreadCurrent += (target.spread - spreadCurrent) * mix;
        yawCurrent += (desiredYaw - yawCurrent) * mix;
        pitchCurrent += (desiredPitch - pitchCurrent) * mix;
        pieces.forEach(item => item.group.position.copy(item.base).addScaledVector(item.direction, spreadCurrent));
        model.rotation.set(pitchCurrent, yawCurrent, -0.035);
        model.position.y = 0.08 + (reduced.matches ? 0 : Math.sin(now * 0.00048) * 0.022);
        camera.position.copy(cameraDirection).multiplyScalar(cameraDistance + spreadCurrent * 1.0);
        camera.lookAt(aim);
        if (lastFinish !== target.finish) {
          const titanium = target.finish === 'titanium';
          steel.color.setHex(titanium ? 0xadb7c3 : 0xc7cdd0);
          steel.roughness = titanium ? 0.34 : 0.29;
          polished.color.setHex(titanium ? 0xb8c3d3 : 0xd8dcdf);
          polished.roughness = titanium ? 0.23 : 0.18;
          heatZones.forEach(zone => { zone.visible = titanium; });
          lastFinish = target.finish;
        }
        renderer.render(scene, camera);
        if (!readyReported) {
          readyReported = true;
          setReady(true);
        }
        if (!reduced.matches) wake();
      };

      let pointer: number | null = null;
      let lastX = 0;
      let lastY = 0;
      const down = (event: PointerEvent) => {
        if (event.button !== 0 || !event.isPrimary) return;
        pointer = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
      };
      const move = (event: PointerEvent) => {
        if (pointer !== event.pointerId) return;
        targets.current.yaw += (event.clientX - lastX) * 0.009;
        targets.current.pitch = clamp(targets.current.pitch + (event.clientY - lastY) * 0.0035, -0.28, 0.32);
        lastX = event.clientX;
        lastY = event.clientY;
        wake();
      };
      const up = (event: PointerEvent) => {
        if (pointer !== event.pointerId) return;
        pointer = null;
        canvas.style.cursor = 'grab';
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      };
      const lostCapture = () => { pointer = null; canvas.style.cursor = 'grab'; };
      const lost = (event: Event) => {
        event.preventDefault();
        contextLost = true;
        clean();
        setFailed(true);
        setReady(false);
      };
      const visibilityChanged = () => { if (document.hidden) stop(); else wake(); };
      const reducedChanged = () => { stop(); wake(); };

      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('lostpointercapture', lostCapture);
      canvas.addEventListener('webglcontextlost', lost);
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('visibilitychange', visibilityChanged);
      reduced.addEventListener('change', reducedChanged);
      removeListeners.push(() => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('lostpointercapture', lostCapture);
        canvas.removeEventListener('webglcontextlost', lost);
        window.removeEventListener('scroll', onScroll);
        document.removeEventListener('visibilitychange', visibilityChanged);
        reduced.removeEventListener('change', reducedChanged);
        if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      });

      sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      if ('IntersectionObserver' in window) {
        viewObserver = new IntersectionObserver(entries => {
          inView = entries.some(entry => entry.isIntersecting);
          if (inView) { syncScroll(); wake(); }
          else stop();
        }, { threshold: 0 });
        viewObserver.observe(stage);
      } else {
        inView = true;
      }
      resize();
      syncScroll();
      wake();
    } catch {
      clean();
      setFailed(true);
      setReady(false);
    }

    return clean;
  }, [accent, nearViewport]);

  const chooseFinish = (next: Finish) => {
    targets.current.finish = next;
    setFinish(next);
    wakeRef.current();
  };
  const rotate = (direction: number) => {
    targets.current.yaw += direction * Math.PI / 8;
    wakeRef.current();
  };
  const resetRotation = () => {
    targets.current.yaw = 0;
    targets.current.pitch = 0;
    wakeRef.current();
  };

  return (
    <div className="auto-exhaust-experience">
      <div
        ref={stageRef}
        className={`auto-exhaust-stage${ready && !failed ? ' is-ready' : ''}${failed ? ' is-fallback' : ''}`}
        style={{ position: 'relative', width: '100%', height: 'clamp(380px, 44vw, 600px)', minHeight: 380, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 38%, #252c34 0%, #15191f 56%, #0c0f13 100%)' }}
      >
        <div
          ref={hostRef}
          className="auto-exhaust-canvas"
          role="img"
          aria-label="Modelo 3D ilustrativo de escapamento catback, com bifurcação, dois abafadores e ponteiras ocas."
          aria-describedby={instructionsId}
          aria-hidden={failed || !ready}
          style={{ position: 'absolute', inset: 0, opacity: failed ? 0 : 1 }}
        />
        <div className="auto-exhaust-hud" aria-hidden="true" style={{ position: 'absolute', inset: '20px 22px auto', display: 'flex', justifyContent: 'space-between', gap: 12, pointerEvents: 'none' }}>
          <span>CATBACK / ESTUDO DE FORMA</span>
          <span>{finish === 'titanium' ? 'TITÂNIO' : 'INOX'}</span>
        </div>
        {!ready && !failed && (
          <div className="auto-exhaust-loading" role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#aeb8c3', fontSize: 13, pointerEvents: 'none' }}>
            {nearViewport ? 'Preparando a visualização 3D…' : 'Explore a engenharia em 3D'}
          </div>
        )}
        {failed && (
          <div className="auto-exhaust-fallback" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '54px 24px 24px' }}>
            {fallbackImage && <img src={fallbackImage} alt="Foto de um projeto da oficina" loading="lazy" style={{ width: '100%', height: 'calc(100% - 52px)', minHeight: 0, objectFit: 'contain', borderRadius: 12 }} />}
            <p role="status" style={{ color: '#b7c0cc', fontSize: 13, lineHeight: 1.5, textAlign: 'center', maxWidth: 340 }}>A visualização 3D não está disponível neste dispositivo. Explore as fotos e os vídeos dos projetos no portfólio.</p>
          </div>
        )}
        {ready && !failed && (
          <div className="auto-exhaust-stage-caption" aria-hidden="true" style={{ position: 'absolute', bottom: 20, left: 22, right: 22, pointerEvents: 'none' }}>
            ARRASTE PARA EXPLORAR <span>↔</span>
          </div>
        )}
      </div>

      {!failed && (
        <div className="auto-exhaust-controls">
          <div className="auto-exhaust-finish" role="group" aria-label="Acabamento ilustrativo do modelo">
            <button type="button" aria-pressed={finish === 'inox'} className={finish === 'inox' ? 'is-active' : ''} onClick={() => chooseFinish('inox')}><span aria-hidden="true" className="auto-exhaust-swatch auto-exhaust-swatch-inox" />Inox</button>
            <button type="button" aria-pressed={finish === 'titanium'} className={finish === 'titanium' ? 'is-active' : ''} onClick={() => chooseFinish('titanium')}><span aria-hidden="true" className="auto-exhaust-swatch auto-exhaust-swatch-titanium" />Titânio</button>
          </div>
          <div className="auto-exhaust-spread">
            <label htmlFor={rangeId}>Montado</label>
            <input id={rangeId} aria-label="Separação das peças do escapamento" type="range" min="0" max="1" step="0.01" value={spread} onChange={event => {
              const next = Number(event.target.value);
              targets.current.manualSpread = true;
              targets.current.spread = next;
              setSpread(next);
              wakeRef.current();
            }} />
            <span>Em detalhes</span>
          </div>
          <div className="auto-exhaust-orbit-controls" role="group" aria-label="Girar a visualização 3D">
            <button type="button" aria-label="Girar modelo para a esquerda" onClick={() => rotate(-1)}>←</button>
            <button type="button" className="auto-exhaust-reset" onClick={resetRotation}>Recentrar</button>
            <button type="button" aria-label="Girar modelo para a direita" onClick={() => rotate(1)}>→</button>
          </div>
        </div>
      )}
      <p id={instructionsId} className="auto-exhaust-note">Visualização 3D ilustrativa. {failed ? 'Consulte as referências reais no portfólio.' : 'Arraste para girar ou use as setas. Aplicação e materiais são definidos na análise técnica.'}</p>
    </div>
  );
}
