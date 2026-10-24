"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findEvolutionToken = findEvolutionToken;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
const evoTokenCache = new Map();
async function findEvolutionToken(evoUrl, evoKey, evoInst) {
    const cacheKey = `${evoUrl}:${evoInst}`;
    if (evoTokenCache.has(cacheKey))
        return evoTokenCache.get(cacheKey);
    try {
        const res = await fetch(`${evoUrl}/instance/all`, {
            headers: { apikey: evoKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108' },
            signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data?.data)) {
                const cleanTarget = evoInst.replace(/^pedidos_/, '');
                const found = data.data.find((inst) => inst.name === evoInst ||
                    inst.token === evoInst ||
                    inst.name?.startsWith(`pedidos_${cleanTarget.slice(0, 15)}`) ||
                    evoInst.startsWith(inst.name) ||
                    (inst.webhook && inst.webhook.includes(cleanTarget)));
                if (found && (found.token || found.name)) {
                    const token = found.token || found.name;
                    evoTokenCache.set(cacheKey, token);
                    return token;
                }
            }
        }
    }
    catch (e) {
        console.warn('[findEvolutionToken Error]:', e.message);
    }
    return null;
}
async function sendWhatsAppMessage(evoUrl, evoKey, evoInst, number, text) {
    try {
        const isGroup = number.includes('@g.us');
        const isLid = number.includes('@lid');
        let finalPhone = number;
        if (!isGroup && !isLid) {
            const numericPhone = number.replace(/\D/g, '');
            finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
        }
        const charDelay = Math.min(5500, Math.max(2200, Math.floor((text || '').length * 18)));
        const randomJitter = Math.floor(Math.random() * 1200);
        const typingDelay = charDelay + randomJitter;
        let activeToken = evoInst;
        try {
            fetch(`${evoUrl}/message/presence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: activeToken },
                body: JSON.stringify({ number: finalPhone, state: 'composing', delay: Math.min(typingDelay, 4000) }),
                signal: AbortSignal.timeout(3000)
            }).catch(() => { });
        }
        catch { }
        // 1. Try Evolution Go (/send/text)
        try {
            const respGo = await fetch(`${evoUrl}/send/text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: activeToken
                },
                body: JSON.stringify({
                    number: finalPhone,
                    text: text,
                    delay: typingDelay
                }),
                signal: AbortSignal.timeout(12000)
            });
            if (respGo.ok) {
                const dataGo = await respGo.json().catch(() => ({}));
                return { success: true, data: dataGo };
            }
            if (respGo.status === 401) {
                console.warn(`[sendWhatsAppMessage] 401 Unauthorized com token "${activeToken}". Buscando token atualizado em /instance/all...`);
                const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
                if (discovered && discovered !== activeToken) {
                    activeToken = discovered;
                    console.log(`[sendWhatsAppMessage] Retentando /send/text com token recuperado: "${activeToken}"`);
                    const retryGo = await fetch(`${evoUrl}/send/text`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            apikey: activeToken
                        },
                        body: JSON.stringify({
                            number: finalPhone,
                            text: text,
                            delay: typingDelay
                        }),
                        signal: AbortSignal.timeout(12000)
                    });
                    if (retryGo.ok) {
                        const dataGo = await retryGo.json().catch(() => ({}));
                        return { success: true, data: dataGo };
                    }
                }
            }
        }
        catch (e) {
            console.warn('[sendWhatsAppMessage] Evolution Go /send/text falhou ou timeout:', e.message);
        }
        // 2. Fallback to Evolution API v1/v2 (/message/sendText/{evoInst})
        const res = await fetch(`${evoUrl}/message/sendText/${activeToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: evoKey || activeToken
            },
            body: JSON.stringify({
                number: finalPhone,
                options: {
                    delay: typingDelay,
                    presence: 'composing',
                    linkPreview: false
                },
                textMessage: {
                    text: text
                }
            }),
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { success: false, error: errText };
        }
        const data = await res.json().catch(() => ({}));
        return { success: true, data };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=whatsappSender.js.map