"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVehicleSpecs = normalizeVehicleSpecs;
const clean = (v, n = 300) => typeof v === 'string' ? v.trim().slice(0, n) : '';
function normalizeVehicleSpecs(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    const out = {};
    for (const key of ['brand', 'model', 'version', 'fuel', 'transmission', 'engine', 'color'])
        if (value[key])
            out[key] = clean(value[key], 100);
    if (value.year !== undefined && value.year !== '') {
        if (!/^(19|20)\d{2}$/.test(String(value.year)))
            throw Error('Informe um ano válido.');
        out.year = String(value.year);
    }
    if (value.mileage !== undefined && value.mileage !== '') {
        const n = Number(value.mileage);
        if (!Number.isFinite(n) || n < 0 || n > 3000000)
            throw Error('Quilometragem inválida.');
        out.mileage = n;
    }
    if (value.status !== undefined) {
        if (!['available', 'reserved', 'sold', 'unavailable'].includes(value.status))
            throw Error('Situação do veículo inválida.');
        out.status = value.status;
    }
    return out;
}
//# sourceMappingURL=vehicleSpecs.js.map