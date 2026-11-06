"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeWebsite = storeWebsite;
exports.catalogMemoryForTurn = catalogMemoryForTurn;
exports.groundedInstagram = groundedInstagram;
const automotiveConversation_1 = require("./automotiveConversation");
const automotiveCatalog_1 = require("./automotiveCatalog");
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/porshe/g, 'porsche');
const https = (url) => !!url && /^https:\/\//i.test(url);
function storeWebsite(store, id) {
    const registered = [store.website, store.websiteUrl, store.site].find(https);
    return registered || `https://iapedido.web.app/loja/${encodeURIComponent(store.publicSlug || id)}`;
}
function catalogMemoryForTurn(memory, history) {
    const lastAssistant = [...history].reverse().find(m => m.sender === 'assistant');
    let audience = memory.audience;
    for (const m of history.filter(m => m.sender === 'user')) {
        const text = norm(m.text || '');
        if (/\b(amigo|amiga|colega|irmao|irma|conhecido|conhecida)\b/.test(text))
            audience = 'friend';
        else if (/\b(meu carro|meu veiculo|meu projeto|voltando ao meu|agora para mim)\b/.test(text))
            audience = 'self';
    }
    return { ...memory, ...(audience ? { audience } : {}), ...(memory.pendingAction && lastAssistant?.text !== memory.pendingPrompt ? { pendingAction: null, pendingPrompt: null } : {}) };
}
function groundedInstagram(text, products, store, storeId, previous = {}) {
    let t = norm(text);
    const friend = /\b(amigo|amiga|colega|irmao|irma|conhecido|conhecida)\b/.test(t);
    const self = /\b(meu carro|meu veiculo|meu projeto|pra mim|para mim|voltando ao meu)\b/.test(t);
    const audience = friend ? 'friend' : self ? 'self' : previous.audience || 'self';
    previous = { ...previous, audience };
    const accepting = /^(?:sim|pode mandar|manda|pode enviar|envia|pode mostrar|mostra|claro|quero ver|pode ser|ok)[.!? ]*$/.test(t.trim()) && !!previous.pendingAction;
    const resending = accepting && previous.pendingAction === 'resend';
    if (accepting)
        t = previous.pendingAction === 'selection_media' ? 'fotos' : 'fotos de projetos de outros modelos';
    // A vehicle-only answer continues qualification; it is not a request for catalogue media.
    if (store.segment === 'AUTOMOTIVE_PARTS' && store.automotiveBusinessFacts?.customBuildVerified === true && audience === 'self' && !accepting && (0, automotiveCatalog_1.catalogQuery)(text, products) && !/\b(fotos?|videos?|imagens?|projetos?|referencias?|catalogo|mostr[a-z]*|manda|envi[a-z]*|opcoes)\b/.test(t))
        return null;
    const intent = (0, automotiveConversation_1.automotiveIntent)(text);
    // Personal contact/address questions need conversation memory, not the store's factual shortcut.
    if (/\b(?:meu|minha|nosso|nossa)\s+(?:endereco|localizacao|telefone|contato|whatsapp)\b|\bendereco\s+(?:de entrega|que (?:eu |te |ja )*(?:passei|enviei|informei))\b/.test(t))
        return null;
    if (intent.transactional || intent.ownsVehicle)
        return null;
    // Technical follow-ups and company reputation are conversation, not catalogue browsing.
    if (/\b(?:voces sao referencia|sao referencia|ele foi feito|esse e de|essa e de|foi feito em|e manufaturado|fabricam|fabricado por|voces fabricam|marcas de prateleira|me explica|explica|detalhes dess[ae]|qual material)\b/.test(t) && !/\b(fotos?|videos?|mostr[ae]|manda|envi[ae])\b/.test(t))
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
    const explicitQuery = accepting ? '' : (0, automotiveCatalog_1.catalogQuery)(text, products);
    const ordinal = /^(?:opcao |numero |o |a )?([1-3])(?:[.!?]|$)/.exec(t.trim());
    const explicit = !!explicitQuery;
    if (!photo && !video && !other && /\b(preco|valor|custa|prazo|garantia|potencia|cv|orcamento|instalar|instalacao)\b/.test(t))
        return facts.length ? { replyText: facts.join('\n\n'), mediaList: [], memory: previous } : null;
    if (!photo && !video && !other && !browse && !explicit && !ordinal)
        return facts.length ? { replyText: facts.join('\n\n'), mediaList: [], memory: previous } : null;
    // Events are real catalog entries but must not be offered as exhaust projects.
    const projects = products.filter(p => !/\bevento\b/.test(norm(p.name)));
    if (!projects.length)
        return { replyText: [...facts, 'Ainda não há projetos cadastrados no catálogo para mostrar.'].join('\n\n'), mediaList: [], memory: { ...previous, pendingAction: null, pendingPrompt: null } };
    let query = explicit ? explicitQuery : previous.query || '';
    if (accepting || friend && !explicit || other && /\b(qualquer|outros carros|outras marcas|outros modelos|geral|todos)\b/.test(t))
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
    if (other && !resending)
        selected = selected.filter(p => !previous.shownIds?.includes(p.id));
    const batch = selected.slice(0, accepting ? 3 : (photo || video) ? 1 : 3);
    if (!batch.length) {
        if (!other && audience === 'self' && store.segment === 'AUTOMOTIVE_PARTS' && store.automotiveBusinessFacts?.customBuildVerified === true) {
            const parts = products.filter((p) => p.catalogKind === 'exhaust_product');
            const options = parts.slice(0, 3).map(p => p.name).join('; ');
            const replyText = [...facts, `Ainda não tenho um projeto desse veículo cadastrado para mostrar. Trabalhamos com projetos sob medida e podemos avaliar uma configuração para ele.${options ? ' Temos estas peças no catálogo: ' + options + '. Elas servem para conhecer nossa linha; a aplicação no seu carro precisa de avaliação.' : ''}${parts.length ? ' Quer ver as fotos dessas peças?' : ' Qual resultado você busca para o escapamento?'}`].join('\n\n');
            return { replyText, mediaList: [], memory: { ...previous, query: '', selectedIds: parts.slice(0, 3).map(p => p.id), pendingAction: parts.length ? 'selection_media' : null, pendingPrompt: replyText } };
        }
        const reason = other ? 'Já mostrei todas as referências cadastradas para essa seleção.' : `Não encontrei uma referência cadastrada${query ? ` para ${query}` : ''}.`;
        const replyText = [...facts, `${reason} ${projects.some(p => !previous.shownIds?.includes(p.id)) ? 'Quer ver as opções de outros modelos?' : audience === 'friend' ? 'Quer que eu reenvie algumas opções para você compartilhar com seu amigo?' : 'Quer que eu reenvie algumas dessas referências?'}`].join('\n\n');
        return { replyText, mediaList: [], memory: { ...previous, query, pendingPrompt: replyText, pendingAction: projects.some(p => !previous.shownIds?.includes(p.id)) ? 'alternatives' : 'resend' } };
    }
    const mediaList = [];
    const sent = new Set(previous.mediaUrls || []);
    const repeat = resending || /\b(de novo|novamente|reenvi|repete)\b/.test(t);
    for (const p of batch) {
        const photos = Array.from(new Set([p.imageUrl, ...(p.images || [])].filter(https)));
        const urls = [...(!video || photo ? photos.map(url => ({ url, type: 'image' })) : []), ...(video && https(p.videoUrl) ? [{ url: p.videoUrl, type: 'video' }] : [])];
        if (photo || video)
            mediaList.push(...urls.filter(m => repeat || !sent.has(m.url)).sort((a, b) => Number(b.type === 'video') - Number(a.type === 'video')).slice(0, accepting ? 1 : 4).map(m => ({ ...m, caption: p.name, productName: p.name })));
    }
    const names = batch.map((p, i) => `${i + 1}. ${p.name}${p.automotiveSpecs?.status === 'development' || /em (fase de )?desenvolvimento/i.test(p.description || '') ? ' (em desenvolvimento)' : ''}`).join('\n');
    let reply = `${other ? 'Separei outras referências do catálogo:' : 'Estas são as referências cadastradas:'}\n${names}`;
    if (photo || video)
        reply = `${batch[0].name}\n\n${mediaList.length ? `Seguem ${photo && video ? 'as mídias disponíveis' : video ? 'os vídeos cadastrados' : 'as fotos cadastradas'} dessa referência.` : 'Não há mais mídias desse tipo cadastradas para enviar. Posso mostrar outra referência.'}`;
    if (accepting)
        reply = `${audience === 'friend' ? 'Separei estas opções para você mostrar ao seu amigo:' : 'Separei estas referências do catálogo:'}\n${names}`;
    else if (!photo && !video)
        reply += '\n\nPode escolher pelo nome ou número para ver fotos e vídeos.';
    if (batch.length === 1 && (0, automotiveCatalog_1.referenceDetails)(batch[0]))
        reply += `\n${(0, automotiveCatalog_1.referenceDetails)(batch[0])}`;
    if (audience === 'friend')
        reply += '\nPode compartilhar com ele. Se alguma opção interessar, me diga qual.';
    else if (batch.some(p => !previous.shownIds?.includes(p.id)))
        reply += '\nSão referências do catálogo; aplicação depende de avaliação técnica.';
    const replyText = [...facts, reply].join('\n\n');
    return { replyText, mediaList, memory: { audience, pendingAction: !photo && !video ? 'selection_media' : null, pendingPrompt: !photo && !video ? replyText : null, query, selectedIds: batch.map(p => p.id), shownIds: Array.from(new Set([...(previous.shownIds || []), ...batch.map(p => p.id)])), mediaUrls: Array.from(new Set([...(previous.mediaUrls || []), ...mediaList.map(m => m.url)])) } };
}
//# sourceMappingURL=groundedInstagram.js.map