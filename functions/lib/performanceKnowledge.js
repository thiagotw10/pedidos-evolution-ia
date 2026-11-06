"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.technicalFields = void 0;
exports.performanceContext = performanceContext;
exports.normalizePerformance = normalizePerformance;
// Structured catalogue facts, shared by the editor and the attendance context.
exports.technicalFields = [
    ['alloy', 'Grau da liga'], ['diameter', 'Diâmetro dos tubos'], ['thickness', 'Espessura'],
    ['components', 'Itens incluídos'], ['valves', 'Válvulas e acionamento'], ['fitment', 'Aplicações confirmadas'],
    ['installation', 'Instalação e adaptações'], ['sound', 'Características de ronco comprovadas'],
    ['results', 'Resultados medidos'], ['leadTime', 'Prazo'], ['warranty', 'Garantia'], ['notes', 'Outras informações confirmadas']
];
function performanceContext(item, catalog) {
    const linked = (item.linkedExhaustIds || []).map((id) => catalog.find(p => p.id === id && p.catalogKind === 'exhaust_product')).filter(Boolean);
    return { kind: item.catalogKind || 'legacy_reference', price: Number(item.price) > 0 && !item.priceOnRequest ? Number(item.price) : null,
        technicalFacts: item.technicalFacts || {}, exhausts: linked.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) > 0 && !p.priceOnRequest ? Number(p.price) : null, material: p.automotiveSpecs?.material || null, technicalFacts: p.technicalFacts || {}, knowledge: String(p.aiKnowledge || '').slice(0, 2400) })) };
}
function normalizePerformance(value, catalog) {
    const catalogKind = value.catalogKind;
    if (!['exhaust_product', 'vehicle_project'].includes(catalogKind))
        throw Error('Selecione produto ou projeto.');
    const technicalFacts = {};
    for (const [key] of exports.technicalFields)
        if (typeof value.technicalFacts?.[key] === 'string')
            technicalFacts[key] = value.technicalFacts[key].trim().slice(0, 1200);
    const ids = catalogKind === 'vehicle_project' && Array.isArray(value.linkedExhaustIds) ? [...new Set(value.linkedExhaustIds)] : [];
    if (ids.length > 10 || ids.some(id => !catalog.some(p => p.id === id && p.catalogKind === 'exhaust_product')))
        throw Error('Vincule somente escapamentos cadastrados nesta loja.');
    return { catalogKind, technicalFacts, linkedExhaustIds: ids, priceOnRequest: value.priceOnRequest === true || !(Number(value.price) > 0) };
}
//# sourceMappingURL=performanceKnowledge.js.map