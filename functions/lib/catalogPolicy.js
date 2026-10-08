"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLegacyFoodSample = isLegacyFoodSample;
exports.visibleForSegment = visibleForSegment;
// Exact fingerprints only: never hide real products based on a food keyword.
function isLegacyFoodSample(p) {
    return (p.id === 'prod_1' && p.name === 'Item Especial da Casa' && p.description === 'Receita artesanal exclusiva com acompanhamentos frescos.' && !!p.imageUrl?.includes('photo-1568901346375-23c9450c58cd')) ||
        (p.id === 'prod_2' && p.name === 'Refrigerante Lata 350ml' && p.description === 'Bebida bem gelada para acompanhar.' && !!p.imageUrl?.includes('photo-1622483767028-3f66f32aef97'));
}
function visibleForSegment(products, segment) {
    return segment === 'AUTOMOTIVE_PARTS' ? products.filter(p => !isLegacyFoodSample(p)) : products;
}
//# sourceMappingURL=catalogPolicy.js.map