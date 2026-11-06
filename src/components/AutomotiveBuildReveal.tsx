import React, { useEffect, useRef, useState } from 'react';
import './automotive-build-reveal.css';

const agents = [
  ['Estrutura', '#70e5d2'], ['Forma', '#c4a2ff'], ['Detalhes', '#ffb975'],
  ['Acabamento', '#87bdff'], ['Composição', '#f6a6d8'], ['Precisão', '#dbdf8c'],
  ['Texturas', '#70e5d2'], ['Luz', '#c4a2ff'], ['Superfícies', '#ffb975'], ['Montagem', '#87bdff'],
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
// Animate separate pieces, never a parent and its child at the same time.
const selector = [
  '.auto-brand', '.auto-header-nav', '.auto-header-cta',
  '.auto-immersion-copy h1', '.auto-immersion-copy h2',
  '.auto-immersion-description', '.auto-immersion-actions', '.auto-immersion-project',
  '.auto-editorial-strip', '.auto-section-heading', '.auto-engineering-mount',
  '.auto-projects-heading', '.auto-project-media', '.auto-project-body',
  '.auto-workflow > div', '#project-form > div', '#project-form > form',
].join(',');

type Piece = { el: HTMLElement; original: string; progress: number; opening: boolean; delay: number };

/** Decorative swarm over real content. Native scroll, no cloned DOM or external scripts. */
export default function AutomotiveBuildReveal({ storeId, root }: { storeId: string; root: React.RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState(false);
  const pointers = useRef<Array<HTMLDivElement | null>>([]);
  const frames = useRef<Array<HTMLDivElement | null>>([]);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const container = root.current;
    if (motion.matches || !container) return;
    const compact = matchMedia('(max-width:767px)').matches;
    const count = compact ? 6 : agents.length;
    const pieces = new Map<HTMLElement, Piece>();
    const positions = agents.map((_, i) => ({ x: innerWidth * (i % 2 ? .85 : .15), y: innerHeight * (.15 + (i % 4) * .2) }));
    const started = performance.now();
    let raf = 0, disposed = false, last = 0;
    const restore = () => pieces.forEach(p => { p.el.style.clipPath = p.original; });
    const finish = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      restore();
      setActive(false);
    };
    const discover = () => {
      pieces.forEach((p, el) => { if (!container.contains(el)) { el.style.clipPath = p.original; pieces.delete(el); } });
      container.querySelectorAll<HTMLElement>(selector).forEach(el => {
        if (pieces.has(el)) return;
        const rect = el.getBoundingClientRect();
        pieces.set(el, { el, original: el.style.clipPath, progress: 0,
          opening: performance.now() - started < 250 && rect.top < innerHeight && rect.bottom > 0,
          delay: (pieces.size % 6) * 110 });
        el.style.clipPath = 'inset(0 100% 0 0)';
      });
    };
    const observer = new MutationObserver(discover);
    discover();
    observer.observe(container, { childList: true, subtree: true });
    stop.current = finish;
    setActive(true);

    const draw = (now: number) => {
      if (disposed || document.hidden) return;
      raf = requestAnimationFrame(draw);
      if (now - last < 32) return; // Bound the decorative work to ~30fps on phones too.
      const dt = Math.min(80, now - (last || now - 32));
      last = now;
      const width = innerWidth, height = innerHeight;
      const visible: Array<{ p: Piece; r: DOMRect; working: boolean }> = [];
      // Read all layout before applying styles, avoiding per-piece forced reflows.
      const geometry = [...pieces.values()].map(p => ({ p, r: p.el.getBoundingClientRect() }));
      geometry.forEach(({ p, r }) => {
        if (!r.width || !r.height) return;
        const entry = p.opening ? clamp((height - r.top) / 70) : clamp((height * .98 - r.top) / (height * .38));
        const exit = clamp(r.bottom / Math.min(160, r.height));
        const intro = p.opening ? clamp((now - started - p.delay) / 2300) : 1;
        const target = Math.min(entry, exit, intro);
        p.progress += (target - p.progress) * (1 - Math.exp(-dt / 115));
        if (Math.abs(target - p.progress) < .002) p.progress = target;
        p.el.style.clipPath = p.progress >= .998 ? p.original : `inset(0 ${((1 - p.progress) * 100).toFixed(2)}% 0 0)`;
        const chapter = p.el.closest('.auto-immersion-copy');
        if (r.bottom > 0 && r.top < height && (!chapter || !chapter.hasAttribute('inert'))) {
          visible.push({ p, r, working: p.progress > .005 && p.progress < .998 });
        }
      });
      const working = visible.filter(v => v.working);
      const targets = working.length ? working : visible;
      const t = now / 1000;
      pointers.current.forEach((pointer, i) => {
        if (!pointer) return;
        if (i >= count || !targets.length) { pointer.style.opacity = '0'; return; }
        const { p, r } = targets[i % targets.length];
        const busy = working.length > 0;
        const phase = t * (busy ? 2.1 : .8) + i * 2.399;
        const centerX = busy ? r.left + r.width * p.progress : r.left + r.width * (.2 + ((i * .193) % .65));
        const centerY = r.top + Math.min(r.height, height * .6) * (.18 + ((i * .271) % .65));
        const orbit = compact ? 19 : 36;
        const x = Math.max(6, Math.min(width - 35, centerX + Math.cos(phase) * orbit));
        const y = Math.max(10, Math.min(height - 90, centerY + Math.sin(phase * 1.3) * orbit));
        positions[i].x += (x - positions[i].x) * (1 - Math.exp(-dt / (170 + i * 13)));
        positions[i].y += (y - positions[i].y) * (1 - Math.exp(-dt / (170 + i * 13)));
        pointer.style.transform = `translate3d(${positions[i].x.toFixed(1)}px,${positions[i].y.toFixed(1)}px,0)`;
        pointer.style.opacity = busy ? '1' : '.38';
        pointer.classList.toggle('is-working', busy);
        pointer.classList.toggle('label-left', positions[i].x > width - 140);
      });
      frames.current.forEach((frame, i) => {
        if (!frame) return;
        const target = working[i];
        if (!target) { frame.style.opacity = '0'; return; }
        const { p, r } = target;
        frame.style.transform = `translate3d(${r.left}px,${r.top}px,0)`;
        frame.style.width = `${r.width}px`;
        frame.style.height = `${r.height}px`;
        frame.style.setProperty('--build-progress', `${p.progress * 100}%`);
        frame.style.opacity = String(Math.sin(p.progress * Math.PI) * .65);
      });
    };
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !disposed) { last = 0; raf = requestAnimationFrame(draw); }
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Tab') finish(); };
    // Keep a focused form usable even when the software keyboard changes viewport size.
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement).matches('input, textarea, select')) finish(); };
    raf = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', keydown);
    container.addEventListener('focusin', focus);
    motion.addEventListener('change', finish);
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
      restore();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', keydown);
      container.removeEventListener('focusin', focus);
      motion.removeEventListener('change', finish);
    };
  }, [storeId, root]);

  if (!active) return null;
  return <div className="auto-build-reveal">
    {Array.from({ length: 6 }, (_, i) => <div key={i} ref={el => { frames.current[i] = el; }} className="auto-build-frame" aria-hidden="true"><i /></div>)}
    {agents.map(([label, color], i) => <div key={label} ref={el => { pointers.current[i] = el; }} className="auto-build-cursor" style={{ '--cursor-color': color } as React.CSSProperties} aria-hidden="true">
      <i className="auto-build-trail" /><svg width="23" height="29" viewBox="0 0 23 29"><path d="M2 2v22l6-6 5 10 4-2-5-10h9Z" fill={color} stroke="#101218" strokeWidth="2" /></svg><span>{label}</span>
    </div>)}
    <button className="auto-build-skip" onClick={() => stop.current()}>Pular animação <span aria-hidden="true">↗</span></button>
  </div>;
}
