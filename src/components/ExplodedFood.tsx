import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function ExplodedFood({ kind, image }: { kind: 'burger' | 'pizza'; image?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const target = useRef(.65);
  const [amount, setAmount] = useState(.65);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0, 0);
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 50);
    camera.position.set(0, 3.4, 9.5); camera.lookAt(0, .8, 0);
    scene.add(new THREE.HemisphereLight(0xfff8ec, 0x584427, 3));
    const light = new THREE.DirectionalLight(0xffeed5, 5); light.position.set(4, 6, 5); scene.add(light);
    const rim = new THREE.DirectionalLight(0xffffff, 3); rim.position.set(-4, 2, -2); scene.add(rim);
    const model = new THREE.Group(); scene.add(model);
    const layers: THREE.Group[] = [];
    const material = (color: number, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness });
    const bun = material(0xdc8d37), meat = material(0x663326), cheese = material(0xffc42e), green = material(0x559735), red = material(0xc73825);
    function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); parent.add(m); return m; }
    function layer(y: number) { const g = new THREE.Group(); g.userData.base = y; g.position.y = y; layers.push(g); model.add(g); return g; }
    function disk(parent: THREE.Object3D, radius: number, height: number, mat: THREE.Material) { return mesh(new THREE.CylinderGeometry(radius, radius * .97, height, 64), mat, parent); }
    if (kind === 'burger') {
      disk(layer(0), 1, .28, bun);
      const patty = disk(layer(.25), 1.01, .24, meat);
      const positions = patty.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), z = positions.getZ(i); positions.setY(i, positions.getY(i) + .022 * Math.sin(x * 32) * Math.cos(z * 25)); }
      patty.geometry.computeVertexNormals();
      const slice = mesh(new THREE.BoxGeometry(1.72, .055, 1.72), cheese, layer(.4)); slice.rotation.y = .35;
      const salad = layer(.5);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const leaf = mesh(new THREE.SphereGeometry(.39, 16, 8), green, salad, Math.cos(a) * .68, 0, Math.sin(a) * .68); leaf.scale.set(1, .16, 1); leaf.rotation.z = Math.sin(a) * .25; }
      const tomato = layer(.62); disk(tomato, .85, .12, red);
      const top = layer(.76); const dome = mesh(new THREE.SphereGeometry(1.03, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), bun, top); dome.scale.y = .58;
      const seeds = material(0xffe8b4);
      for (let i = 0; i < 55; i++) { const a = i * 2.39996, r = Math.sqrt((i + .5) / 55) * .94; const seed = mesh(new THREE.SphereGeometry(.027, 6, 4), seeds, top, Math.cos(a) * r, Math.sqrt(1 - r * r) * .6, Math.sin(a) * r); seed.scale.set(.65, .5, 2); seed.rotation.y = a; }
    } else {
      const base = layer(0); disk(base, 1.2, .13, bun);
      const crust = mesh(new THREE.TorusGeometry(1.12, .095, 12, 64), bun, base, 0, .05); crust.rotation.x = Math.PI / 2;
      disk(layer(.12), 1.04, .035, red);
      disk(layer(.17), 1.02, .045, cheese);
      const toppings = layer(.23);
      for (let i = 0; i < 12; i++) { const a = i * 2.39996, r = Math.sqrt((i + .5) / 12) * .88; const piece = mesh(new THREE.CylinderGeometry(.16, .16, .035, 20), meat, toppings, Math.cos(a) * r, 0, Math.sin(a) * r); piece.rotation.y = a; }
      const herbs = layer(.27);
      for (let i = 0; i < 7; i++) { const a = i * 2.4; const leaf = mesh(new THREE.SphereGeometry(.12, 12, 8), green, herbs, Math.cos(a) * .72, 0, Math.sin(a) * .72); leaf.scale.set(.6, .2, 1.5); leaf.rotation.y = a; }
    }
    const resize = () => { const w = element.clientWidth, h = element.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    let visible = true; const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }); visibility.observe(element);
    let dragging = false, lastX = 0, angle = -.3, spread = target.current, frame = 0;
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (dragging) { angle += (e.clientX - lastX) * .009; lastX = e.clientX; } };
    const up = () => { dragging = false; };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => { frame = requestAnimationFrame(draw); if (!visible || document.hidden) return; spread = reduced.matches ? target.current : spread + (target.current - spread) * .08; layers.forEach((g, i) => { g.position.y = g.userData.base + (i - (layers.length - 1) / 2) * spread * .65; }); model.rotation.y = angle; model.position.y = .4; renderer.render(scene, camera); }; draw();
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); }; renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); const mats = new Set<THREE.Material>(); scene.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); }); mats.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [kind]);
  return <div className="sf-food"><div ref={host} className="sf-food-canvas" role="img" aria-label={`Modelo 3D ilustrativo de ${kind === 'burger' ? 'hambúrguer' : 'pizza'} em camadas`} />{failed && <div className="sf-food-fallback">{image ? <img src={image} alt="Produto do catálogo" /> : <span>Explore os produtos no catálogo</span>}</div>}<div className="sf-food-caption">{failed ? 'Foto do catálogo' : '3D ilustrativo · Arraste para girar'}</div>{!failed && <label className="sf-explode"><span>Montado</span><input aria-label="Separar as camadas do modelo" type="range" min="0" max="1" step=".01" value={amount} onChange={e => { const next = Number(e.target.value); target.current = next; setAmount(next); }} /><span>Em camadas</span></label>}<p className="sf-food-note">Cena decorativa. Confira os ingredientes na descrição do produto.</p></div>;
}
