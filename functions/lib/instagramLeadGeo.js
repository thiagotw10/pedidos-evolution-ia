"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geoStates = exports.geoCountries = exports.geoNormalize = void 0;
exports.resolveLeadLocation = resolveLeadLocation;
exports.safeLeadLocation = safeLeadLocation;
exports.explicitLeadLocation = explicitLeadLocation;
exports.saveLeadLocation = saveLeadLocation;
exports.captureExplicitLeadLocation = captureExplicitLeadLocation;
exports.postalLeadLocation = postalLeadLocation;
const leadGeoData_1 = require("./leadGeoData");
const geoNormalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
exports.geoNormalize = geoNormalize;
const key = (city, state) => `${(0, exports.geoNormalize)(city)}|${state}`;
const cityIndex = new Map(leadGeoData_1.BR_CITIES.map(c => [key(c[1], c[2]), c]));
const uniqueCities = new Map();
for (const c of leadGeoData_1.BR_CITIES) {
    const name = (0, exports.geoNormalize)(c[1]);
    uniqueCities.set(name, [...(uniqueCities.get(name) || []), c]);
}
const display = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
exports.geoCountries = leadGeoData_1.GEO_COUNTRIES.map(c => ({ code: c[0], name: display.of(c[0]) || c[1], lat: c[2], lng: c[3], english: c[1] })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const countryIndex = new Map(exports.geoCountries.map(c => [c.code, c]));
exports.geoStates = leadGeoData_1.BR_STATES.map(s => ({ code: s[0], name: s[1] }));
function resolveLeadLocation(input, source, updatedAt = new Date().toISOString()) {
    const country = String(input.country || '').toUpperCase(), state = String(input.state || '').toUpperCase(), city = String(input.city || '').trim().slice(0, 100), c = countryIndex.get(country);
    if (!c)
        throw Error('Selecione um país disponível na base geográfica.');
    if (country === 'BR') {
        const match = input.cityId ? leadGeoData_1.BR_CITIES.find(v => v[0] === String(input.cityId)) : cityIndex.get(key(city, state));
        if (city || input.cityId) {
            if (!match || state && state !== match[2])
                throw Error('Selecione um município brasileiro válido e seu estado.');
            return { country, city: match[1], state: match[2], cityId: match[0], lat: match[3], lng: match[4], precision: 'city', source, updatedAt };
        }
        if (state) {
            const uf = leadGeoData_1.BR_STATES.find(s => s[0] === state);
            if (!uf)
                throw Error('Estado inválido.');
            return { country, city: '', state, cityId: '', lat: uf[2], lng: uf[3], precision: 'state', source, updatedAt };
        }
    }
    if (city && !/^[\p{L}\p{N} .()'’\-]{2,100}$/u.test(city))
        throw Error('Confira o nome da cidade.');
    return { country, city, state: '', cityId: '', lat: c.lat, lng: c.lng, precision: 'country', source, updatedAt };
}
function safeLeadLocation(value) {
    if (!value || !['customer_stated', 'postal_confirmed', 'owner_confirmed'].includes(value.source))
        return null;
    try {
        return resolveLeadLocation(value, value.source, value.updatedAt || '');
    }
    catch {
        return null;
    }
}
// Only explicit first-person declarations, or an exact city/UF, are accepted. No inference from language, DDD or vehicle names.
function explicitLeadLocation(text) {
    const raw = String(text || '').trim();
    if (raw.length > 1000)
        return null;
    const normalized = (0, exports.geoNormalize)(raw);
    const prefix = normalized.match(/^(?:eu )?(?:sou de|moro em|estou em|minha cidade (?:e|fica em)|aqui em)\s+(.+)$/);
    const place = (prefix?.[1] || normalized).replace(/[!?].*$/, '').replace(/\.$/, '').trim();
    const br = place.match(prefix ? /^(.+?)\s*[,/\- ]\s*([a-z]{2})(?=$|[,. ]).*$/ : /^(.+?)\s*[,/\- ]\s*([a-z]{2})$/);
    if (br && cityIndex.has(key(br[1].trim(), br[2].toUpperCase()))) {
        try {
            return resolveLeadLocation({ country: 'BR', city: br[1].trim(), state: br[2].toUpperCase() }, 'customer_stated');
        }
        catch { }
    }
    if (!prefix)
        return null;
    const simple = place.split(',')[0].trim(), matches = uniqueCities.get(simple);
    if (matches?.length === 1)
        return resolveLeadLocation({ country: 'BR', cityId: matches[0][0] }, 'customer_stated');
    const parts = place.split(',').map(s => s.trim());
    const c = exports.geoCountries.find(c => [c.name, c.english, c.code].some(name => (0, exports.geoNormalize)(name) === (parts.length >= 2 ? parts[1] : parts[0])));
    if (c) {
        try {
            return resolveLeadLocation({ country: c.code, city: parts.length >= 2 ? parts[0] : '' }, 'customer_stated');
        }
        catch { }
    }
    return null;
}
async function saveLeadLocation(db, storeId, contactId, value, accountId) {
    const ref = db.collection('establishments').doc(storeId).collection('chats').doc(contactId);
    await db.runTransaction(async (tx) => { const chat = (await tx.get(ref)).data(); if (!chat || accountId && chat.instagramAccountId !== accountId)
        return; if (Date.parse(chat.leadLocation?.updatedAt) >= Date.parse(value.updatedAt))
        return; tx.set(ref, { leadLocation: value }, { merge: true }); });
}
async function captureExplicitLeadLocation(db, storeId, contactId, text, accountId, timestamp) {
    const value = explicitLeadLocation(text);
    if (!value)
        return;
    value.updatedAt = new Date(timestamp).toISOString();
    await saveLeadLocation(db, storeId, contactId, value, accountId);
}
function postalLeadLocation(address) {
    if (address?.confirmed !== true || address?.source !== 'ViaCEP')
        return null;
    try {
        return resolveLeadLocation({ country: 'BR', state: address.state, city: address.city }, 'postal_confirmed', address.confirmedAt || address.lookedUpAt || '');
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=instagramLeadGeo.js.map