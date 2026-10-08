import React, { lazy, Suspense, useState } from 'react';
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import './storefront-showcase.css';
const ExplodedFood = lazy(() => import('./ExplodedFood'));
const PhotographicBurger = lazy(() => import('./PhotographicBurger'));

interface Item { id: string; name: string; description?: string; imageUrl?: string; price: number; category?: string }
export function StorefrontShowcase({ products, add }: { products: Item[]; add: (id: string) => void }) {
  const featured = products.filter(p => p.imageUrl || /pizza|hamb[uú]rg|burger/i.test(p.name)).slice(0, 6);
  const [index, setIndex] = useState(0);
  const product = featured[index % Math.max(featured.length, 1)];
  if (!product) return null;
  const themeText = `${product.name} ${product.category || ''}`;
  const foodKind = /pizza/i.test(themeText) ? 'pizza' : /hamb[uú]rg|burger/i.test(themeText) ? 'burger' : null;
  const change = (direction: number) => setIndex(i => (i + direction + featured.length) % featured.length);
  return <section className={`sf-showcase ${foodKind ? 'sf-immersive' : ''}`} aria-label="Explore nossos produtos">
    <div className="sf-orbit" aria-hidden="true" />
    <div className="sf-topline"><span>UMA NOVA FORMA DE ESCOLHER</span><span>EXPLORE ↗</span></div>
    <div className="sf-scene" key={product.id}>
      <div className="sf-copy"><p className="sf-eyebrow">{product.category || 'Seleção da loja'}</p><h2>{product.name}</h2><p className="sf-description">{product.description || 'Conheça de perto. Escolha do seu jeito.'}</p><div className="sf-buy"><strong>{product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><button onClick={() => add(product.id)}><Plus size={18} /> Adicionar</button></div></div>
      {foodKind ? <Suspense fallback={<div className="sf-food-loading">Preparando sua experiência…</div>}>{foodKind === 'burger' ? <PhotographicBurger /> : <ExplodedFood kind={foodKind} image={product.imageUrl} />}</Suspense> : <div className="sf-art" onPointerMove={e => { if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--rx', `${-(e.clientY - rect.top - rect.height / 2) / 45}deg`); e.currentTarget.style.setProperty('--ry', `${(e.clientX - rect.left - rect.width / 2) / 45}deg`); }} onPointerLeave={e => { e.currentTarget.style.setProperty('--rx', '0deg'); e.currentTarget.style.setProperty('--ry', '0deg'); }}>
        <span className="sf-big-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div className="sf-photo"><img src={product.imageUrl} alt={product.name} fetchPriority="high" /><span className="sf-photo-tag">ESCOLHIDO POR VOCÊ <ArrowUpRight size={16} /></span></div><div className="sf-floating-label">Do catálogo<br /><b>para o seu carrinho.</b></div>
      </div>}
    </div>
    <div className="sf-bottom"><a href="#sf-catalog"><ArrowDown size={16} /> Explore o catálogo</a>{featured.length > 1 && <div className="sf-controls"><button aria-label="Produto anterior" onClick={() => change(-1)}><ChevronLeft size={20} /></button><span>{String(index + 1).padStart(2, '0')} <i>/ {String(featured.length).padStart(2, '0')}</i></span><button aria-label="Próximo produto" onClick={() => change(1)}><ChevronRight size={20} /></button></div>}</div>
  </section>;
}
