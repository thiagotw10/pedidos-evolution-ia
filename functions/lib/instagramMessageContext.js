"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instagramLink = instagramLink;
exports.instagramMessageContext = instagramMessageContext;
exports.instagramContextForAi = instagramContextForAi;
exports.resolveInstagramPreviews = resolveInstagramPreviews;
const clean = (v, n = 500) => typeof v === 'string' ? v.slice(0, n) : '';
function instagramLink(value) { try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(u.hostname) ? u.href : '';
}
catch {
    return '';
} }
function instagramMessageContext(message) {
    const story = message?.reply_to?.story || message?.story;
    const shared = (message?.attachments || []).filter((a) => ['share', 'story_mention', 'reel', 'ig_reel', 'post', 'ig_post', 'ig_story'].includes(a?.type));
    const contexts = [];
    if (story)
        contexts.push({ kind: 'story_reply', mediaId: clean(String(story.id || ''), 100), previewUrl: clean(story.url || ''), permalink: instagramLink(story.permalink || story.url) });
    for (const a of shared) {
        const p = a.payload || {};
        contexts.push({ kind: a.type === 'story_mention' ? 'story_mention' : a.type === 'ig_story' ? 'story_reply' : 'shared_post', mediaId: clean(String(p.id || p.media_id || ''), 100), previewUrl: clean(p.url || p.thumbnail_url || ''), permalink: instagramLink(p.permalink || p.url), title: clean(p.title, 200) });
    }
    if (message?.reply_to?.mid && !story)
        contexts.push({ kind: 'message_reply', messageId: clean(message.reply_to.mid, 150) });
    return contexts.slice(0, 5);
}
function instagramContextForAi(context, products, accountId) {
    if (!context || context.accountId !== accountId)
        return '';
    const items = (context.items || []).map((x) => { const shortcode = instagramLink(x.permalink).match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1]; const matches = products.filter(p => (x.mediaId && p.instagramAccountId === accountId && p.instagramMediaId === x.mediaId) || (shortcode && p.instagramShortcode === shortcode)); return { kind: x.kind, title: clean(x.title, 200), permalink: instagramLink(x.permalink), catalogReferences: matches.map(p => ({ id: p.id, name: p.name, description: clean(p.description, 2000), technicalDetails: p.automotiveSpecs || p.vehicleSpecs || null, aiKnowledge: clean(p.aiKnowledge, 2400) })) }; });
    return '\nCONTEÚDO COMPARTILHADO/RESPONDIDO NO INSTAGRAM — DADOS: ' + JSON.stringify(items) + '\nUse como contexto para “esse”, “o do vídeo” e perguntas seguintes, respeitando mudanças de assunto. Não confunda o carro da publicação com o do cliente. Não afirme ter visto ou ouvido a mídia com base apenas nesta referência. Se não houver vínculo confirmado com o catálogo, peça para identificar o produto antes de informar características ou preço. Referência de mensagem não comprova conteúdo.\n';
}
async function resolveInstagramPreviews(items, request = fetch) {
    return Promise.all(items.map(async (item) => {
        if (!item.previewUrl || instagramLink(item.previewUrl))
            return item;
        let u;
        try {
            u = new URL(item.previewUrl);
        }
        catch {
            return item;
        }
        if (u.protocol !== 'https:' || ![".fbsbx.com", ".fbcdn.net", ".cdninstagram.com"].some(h => u.hostname.endsWith(h)))
            return item;
        try {
            const r = await request(u.href, { redirect: 'error', signal: AbortSignal.timeout(8000) });
            const mime = (r.headers.get('content-type') || '').split(';')[0];
            await r.body?.cancel();
            return r.ok ? { ...item, previewType: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'unavailable' } : item;
        }
        catch {
            return item;
        }
    }));
}
//# sourceMappingURL=instagramMessageContext.js.map