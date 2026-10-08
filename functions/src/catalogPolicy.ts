// Exact fingerprints only: never hide real products based on a food keyword.
export function isLegacyFoodSample(p: { id?: string; name?: string; description?: string; imageUrl?: string }) {
  return (p.id === 'prod_1' && p.name === 'Item Especial da Casa' && p.description === 'Receita artesanal exclusiva com acompanhamentos frescos.' && !!p.imageUrl?.includes('photo-1568901346375-23c9450c58cd')) ||
    (p.id === 'prod_2' && p.name === 'Refrigerante Lata 350ml' && p.description === 'Bebida bem gelada para acompanhar.' && !!p.imageUrl?.includes('photo-1622483767028-3f66f32aef97'));
}
export function visibleForSegment<T extends { id?: string; name?: string; description?: string; imageUrl?: string }>(products: T[], segment?: string): T[] {
  return segment === 'AUTOMOTIVE_PARTS' ? products.filter(p => !isLegacyFoodSample(p)) : products;
}
