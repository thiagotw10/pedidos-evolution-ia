"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeWebsite = storeWebsite;
exports.groundedInstagram = groundedInstagram;
const automotiveConversation_1 = require("./automotiveConversation");
const automotiveCatalog_1 = require("./automotiveCatalog");
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/porshe/g, 'porsche');
const https = (url) => !!url && /^https:\/\//i.test(url);
function storeWebsite(store, id) {
    const registered = [store.website, store.websiteUrl, store.site].find(https);
    return registered || `https://iapedido.web.app/loja/${encodeURIComponent(store.publicSlug || id)}`;
}
function groundedInstagram(text, products, store, storeId, previous = {}) {
    const t = norm(text);
    const intent = (0, automotiveConversation_1.automotiveIntent)(text);
    if (intent.transactional || intent.ownsVehicle)
        return null;
    const facts = [];
    if (/\b(site|website|link|catalogo online)\b/.test(t))
        facts.push(`Você pode ver nosso catálogo aqui: ${storeWebsite(store, storeId)}`);
    if (/\b(endereco|onde fica|localizacao|como chegar)\b/.test(t))
        facts.push(store.address ? `Ficamos na ${store.address}.` : 'O endereço não está informado no cadastro.');
    if (/\b(horario|abre|fecha|funciona)\b/.test(t))
        facts.push(store.operatingHours ? `Nosso horário: ${store.operatingHours}.` : 'O horário não está informado no cadastro.');
    if (/\b(telefone|contato|whatsapp)\b/.test(t))
        facts.push(store.phone ? `Nosso contato é ${store.phone}.` : 'Não tenho um telefone cadastrado para informar.');
    const photo = /\b(fotos?|imagens?)\b/.test(t);
    const video = /\b(videos?|ouvir|escutar)\b|ronco desse/.test(t);
    const other = /\b(outros?|outras?|diferentes?|mais opcoes|mais projetos|mais referencias)\b/.test(t);
    const browse = /\b(projetos?|catalogos?|referencias?|opcoes)\b/.test(t);
    const explicitQuery = (0, automotiveCatalog_1.catalogQuery)(text, products);
    const ordinal = /^(?:opcao |numero |o |a )?([1-3])(?:[.!?]|$)/.exec(t.trim());
    const explicit = !!explicitQuery;
    if (!photo && !video && !other && /\b(preco|valor|custa|prazo|garantia|potencia|cv|orcamento|instalar|instalacao)\b/.test(t))
        return facts.length ? { replyText: facts.join('\n\n'), mediaList: [], memory: previous } : null;
    if (!photo && !video && !other && !browse && !explicit && !ordinal)
        return facts.length ? { replyText: facts.join('\n\n'), mediaList: [], memory: previous } : null;
    // Events are real catalog entries but must not be offered as exhaust projects.
    const projects = products.filter(p => !/\bevento\b/.test(norm(p.name)));
    let query = explicit ? explicitQuery : previous.query || '';
    if (other && /\b(qualquer|outros carros|outras marcas|geral|todos)\b/.test(t))
        query = '';
    const terms = query.split(' ').filter(Boolean);
    let candidates = terms.length ? projects.filter(p => (0, automotiveCatalog_1.referenceMatches)(p, query)) : projects;
    let selected = ordinal ? projects.filter(p => p.id === previous.selectedIds?.[Number(ordinal[1]) - 1]) : (!explicit && !other && (photo || video)) ? projects.filter(p => previous.selectedIds?.includes(p.id)) : [];
    if (!selected.length)
        selected = candidates;
    if (other && !explicit && !selected.some(p => !previous.shownIds?.includes(p.id))) {
        query = '';
        selected = projects;
    }
    if (other)
        selected = selected.filter(p => !previous.shownIds?.includes(p.id));
    const batch = selected.slice(0, (photo || video) ? 1 : 3);
    if (!batch.length) {
        const reason = other ? 'Já mostrei todas as referências cadastradas para essa seleção.' : `Não encontrei uma referência cadastrada${query ? ` para ${query}` : ''}.`;
        return { replyText: [...facts, `${reason} Posso mostrar projetos de outros modelos como referência, sem confirmar compatibilidade com o seu carro.`].join('\n\n'), mediaList: [], memory: { ...previous, query } };
    }
    const mediaList = [];
    const sent = new Set(previous.mediaUrls || []);
    const repeat = /\b(de novo|novamente|reenvi|repete)\b/.test(t);
    for (const p of batch) {
        const photos = Array.from(new Set([p.imageUrl, ...(p.images || [])].filter(https)));
        const urls = [...(!video || photo ? photos.map(url => ({ url, type: 'image' })) : []), ...(video && https(p.videoUrl) ? [{ url: p.videoUrl, type: 'video' }] : [])];
        if (photo || video)
            mediaList.push(...urls.filter(m => repeat || !sent.has(m.url)).sort((a, b) => Number(b.type === 'video') - Number(a.type === 'video')).slice(0, 4).map(m => ({ ...m, caption: p.name, productName: p.name })));
    }
    const names = batch.map((p, i) => `${i + 1}. ${p.name}${p.automotiveSpecs?.status === 'development' || /em (fase de )?desenvolvimento/i.test(p.description || '') ? ' (em desenvolvimento)' : ''}`).join('\n');
    let reply = `${other ? 'Separei outras referências do catálogo:' : 'Estas são as referências cadastradas:'}\n${names}`;
    if (photo || video)
        reply = `${batch[0].name}\n\n${mediaList.length ? `Seguem ${photo && video ? 'as mídias disponíveis' : video ? 'os vídeos cadastrados' : 'as fotos cadastradas'} dessa referência.` : 'Não há mais mídias desse tipo cadastradas para enviar. Posso mostrar outra referência.'}`;
    else
        reply += '\n\nPode escolher pelo nome ou número para ver fotos e vídeos.';
    if (batch.length === 1 && (0, automotiveCatalog_1.referenceDetails)(batch[0]))
        reply += `\n${(0, automotiveCatalog_1.referenceDetails)(batch[0])}`;
    if (batch.some(p => !previous.shownIds?.includes(p.id)))
        reply += '\nReferência de projeto; aplicação no seu carro depende de avaliação técnica.';
    return { replyText: [...facts, reply].join('\n\n'), mediaList, memory: { query, selectedIds: batch.map(p => p.id), shownIds: Array.from(new Set([...(previous.shownIds || []), ...batch.map(p => p.id)])), mediaUrls: Array.from(new Set([...(previous.mediaUrls || []), ...mediaList.map(m => m.url)])) } };
}
//# sourceMappingURL=groundedInstagram.js.map