import React, { useEffect, useRef, useState } from 'react';

// Coordinates follow the photographed ingredient silhouettes in the source sheet.
const slices = [
  { y: 0, h: 300, top: 8, closed: 22, clip: 'polygon(11% 90%,12% 66%,19% 39%,31% 16%,44% 5%,58% 5%,72% 18%,86% 46%,89% 70%,89% 92%,67% 97%,29% 97%)' },
  { y: 305, h: 210, top: 27, closed: 39, clip: 'polygon(13% 40%,24% 12%,44% 4%,59% 8%,78% 17%,86% 34%,88% 72%,77% 97%,45% 91%,24% 93%,13% 77%)' },
  { y: 520, h: 265, top: 42, closed: 44, clip: 'polygon(10% 29%,15% 15%,28% 6%,45% 14%,58% 3%,71% 8%,86% 15%,90% 48%,84% 78%,71% 91%,46% 97%,27% 88%,13% 68%)' },
  { y: 790, h: 245, top: 59, closed: 52, clip: 'polygon(12% 44%,18% 19%,34% 6%,58% 2%,79% 15%,87% 35%,87% 76%,76% 92%,51% 98%,27% 93%,13% 74%)' },
  { y: 1040, h: 255, top: 75, closed: 64, clip: 'polygon(13% 39%,22% 16%,46% 3%,70% 8%,83% 25%,87% 50%,84% 80%,64% 97%,36% 96%,16% 75%)' },
  { y: 1295, h: 230, top: 91, closed: 75, clip: 'polygon(12% 24%,23% 6%,47% 0%,71% 6%,87% 20%,88% 52%,80% 78%,60% 95%,38% 94%,18% 76%,12% 53%)' },
];
export default function PhotographicBurger() {
  const root = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState(.25);
  const manual = useRef(false);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!root.current || manual.current || reduced.matches) return; const rect = root.current.getBoundingClientRect(); setSpread(Math.max(0, Math.min(1, (innerHeight * .65 - rect.top) / (innerHeight * .65)))); }); };
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); };
  }, []);
  return <div className="sf-real-food" ref={root}>
    <div className="sf-real-stage" role="img" aria-label="Hambúrguer ilustrativo com ingredientes de aparência fotográfica separados em camadas">
      {slices.map((s, i) => <div key={s.y} className="sf-real-layer" style={{ top: `${s.closed + (s.top - s.closed) * spread}%`, zIndex: 10 - i, aspectRatio: `1024 / ${s.h}` }}><div style={{ width: '100%', height: '100%', overflow: 'hidden', clipPath: s.clip }}><img draggable={false} src="/assets/food/burger-layers.png" alt="" style={{ width: '100%', maxWidth: 'none', position: 'absolute', left: 0, top: `${-s.y / s.h * 100}%` }} /></div></div>)}
    </div>
    <label className="sf-explode"><span>Montado</span><input aria-label="Separar ingredientes" type="range" min="0" max="1" step=".01" value={spread} onChange={e => { manual.current = true; setSpread(Number(e.target.value)); }} /><span>Em camadas</span></label>
    <p className="sf-food-caption">Role para explorar cada camada</p><p className="sf-food-note">Composição ilustrativa. Ingredientes reais na descrição do produto.</p>
  </div>;
}
