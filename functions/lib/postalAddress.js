"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostalLookupError = void 0;
exports.lookupPostalAddress = lookupPostalAddress;
exports.postalSummary = postalSummary;
class PostalLookupError extends Error {
    constructor(reason) {
        super(reason === 'invalid' ? 'Informe um CEP com 8 dígitos.' : reason === 'not_found' ? 'Esse CEP não foi encontrado. Confira os números, por favor.' : 'Não consegui consultar o CEP agora. Tente novamente em instantes.');
        this.reason = reason;
    }
}
exports.PostalLookupError = PostalLookupError;
async function lookupPostalAddress(input, fetcher = fetch) {
    if (!/^\d{5}-?\d{3}$/.test(input.trim()))
        throw new PostalLookupError('invalid');
    const cep = input.replace(/\D/g, '');
    let data;
    try {
        const response = await fetcher(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok)
            throw new Error();
        data = await response.json();
    }
    catch {
        throw new PostalLookupError('unavailable');
    }
    if (data.erro === true || data.erro === 'true')
        throw new PostalLookupError('not_found');
    if (!data.localidade || !/^[A-Z]{2}$/.test(data.uf || '') || String(data.cep || '').replace(/\D/g, '') !== cep)
        throw new PostalLookupError('unavailable');
    const clean = (v) => String(v || '').trim().slice(0, 200);
    return { cep, street: clean(data.logradouro), district: clean(data.bairro), city: clean(data.localidade), state: data.uf, source: 'ViaCEP', lookedUpAt: new Date().toISOString(), confirmed: false };
}
function postalSummary(address) {
    return [address.street, address.number, address.complement, address.district, `${address.city}/${address.state}`, `CEP ${address.cep.slice(0, 5)}-${address.cep.slice(5)}`].filter(Boolean).join(', ');
}
//# sourceMappingURL=postalAddress.js.map