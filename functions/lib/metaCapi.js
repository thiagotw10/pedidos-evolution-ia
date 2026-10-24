"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashForMeta = hashForMeta;
exports.hashPhoneForMeta = hashPhoneForMeta;
exports.extractTrafficAttribution = extractTrafficAttribution;
exports.sendMetaConversionEvent = sendMetaConversionEvent;
exports.buildTrackedCampaignLink = buildTrackedCampaignLink;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Normaliza e gera hash SHA-256 conforme exigido pela Meta Conversions API
 */
function hashForMeta(value) {
    if (!value)
        return undefined;
    const clean = value.trim().toLowerCase();
    if (!clean)
        return undefined;
    return crypto_1.default.createHash('sha256').update(clean).digest('hex');
}
/**
 * Normaliza telefone para formato internacional com DDI (ex: 5511999999999) e gera SHA-256
 */
function hashPhoneForMeta(phone) {
    if (!phone)
        return undefined;
    let digits = phone.replace(/\D/g, '');
    if (!digits)
        return undefined;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
        digits = `55${digits}`;
    }
    return crypto_1.default.createHash('sha256').update(digits).digest('hex');
}
/**
 * Analisa a mensagem recebida pelo WhatsApp e extrai tags de campanhas e UTMs
 * Exemplo de tags reconhecidas:
 * [REF:ADS_DOWNPIPE_GOLF]
 * [UTM:INSTAGRAM_VALVETRONIC]
 * [CAMP:STAGE2_PORSCHE]
 * Ou texto contendo "?utm_source=meta&utm_campaign=..."
 */
function extractTrafficAttribution(incomingText) {
    if (!incomingText)
        return { cleanText: '', attribution: null };
    let text = incomingText;
    let attribution = null;
    // 1. Tag explícita entre colchetes: [REF:...], [UTM:...], [CAMP:...], [AD:...]
    const tagRegex = /\[(REF|UTM|CAMP|AD):([A-Za-z0-9_-]+)\]/i;
    const match = text.match(tagRegex);
    if (match) {
        const rawTag = match[0];
        const tagValue = match[2];
        text = text.replace(rawTag, '').trim();
        let trafficSource = 'META_ADS';
        if (tagValue.toLowerCase().includes('google'))
            trafficSource = 'GOOGLE_ADS';
        else if (tagValue.toLowerCase().includes('tiktok'))
            trafficSource = 'TIKTOK_ADS';
        else if (tagValue.toLowerCase().includes('site'))
            trafficSource = 'SITE';
        const humanCampaign = tagValue
            .replace(/^(ADS_|UTM_|CAMP_)/i, '')
            .replace(/_/g, ' ')
            .trim();
        attribution = {
            trafficSource,
            campaignName: humanCampaign || tagValue,
            adName: tagValue,
            matchedTag: rawTag,
            utmSource: trafficSource === 'META_ADS' ? 'facebook_instagram' : 'google',
            utmCampaign: tagValue
        };
    }
    else {
        // 2. Detecção de parâmetros na mensagem ou links com UTMs
        if (text.includes('utm_source=') || text.includes('fbclid=')) {
            try {
                const urlMatch = text.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                    const parsed = new URL(urlMatch[0]);
                    const utmSource = parsed.searchParams.get('utm_source') || '';
                    const utmCampaign = parsed.searchParams.get('utm_campaign') || '';
                    const utmMedium = parsed.searchParams.get('utm_medium') || '';
                    const fbclid = parsed.searchParams.get('fbclid') || '';
                    const gclid = parsed.searchParams.get('gclid') || '';
                    attribution = {
                        trafficSource: utmSource.includes('google') ? 'GOOGLE_ADS' : 'META_ADS',
                        campaignName: utmCampaign || 'Campanha Digital',
                        utmSource,
                        utmMedium,
                        utmCampaign,
                        fbclid,
                        gclid
                    };
                }
            }
            catch { }
        }
        else {
            // 3. Heurística baseada em criativos conhecidos de performance
            const lower = text.toLowerCase();
            if (lower.includes('vi no instagram') || lower.includes('vi o anúncio') || lower.includes('vi no anuncio') || lower.includes('vi o post')) {
                attribution = {
                    trafficSource: 'META_ADS',
                    campaignName: 'Anúncio Instagram / Meta',
                    utmSource: 'instagram_ads'
                };
            }
        }
    }
    return {
        cleanText: text.replace(/\s+/g, ' ').trim(),
        attribution
    };
}
/**
 * Dispara evento Server-Side para a Meta Conversions API (CAPI)
 */
async function sendMetaConversionEvent(config, payload) {
    const pixelId = config.pixelId?.trim();
    const accessToken = config.accessToken?.trim();
    if (!config.enabled || !pixelId || !accessToken) {
        return { success: false, error: 'Meta CAPI desativado ou credenciais incompletas.' };
    }
    try {
        const eventTime = payload.eventTime || Math.floor(Date.now() / 1000);
        const eventId = payload.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const hashedPhone = hashPhoneForMeta(payload.customerPhone);
        const firstName = payload.customerName?.split(' ')[0];
        const hashedFirstName = hashForMeta(firstName);
        const hashedEmail = hashForMeta(payload.customerEmail);
        const userData = {};
        if (hashedPhone)
            userData.ph = [hashedPhone];
        if (hashedFirstName)
            userData.fn = [hashedFirstName];
        if (hashedEmail)
            userData.em = [hashedEmail];
        const eventData = {
            event_name: payload.eventName,
            event_time: eventTime,
            event_id: eventId,
            action_source: 'chat',
            user_data: userData
        };
        if (payload.sourceUrl) {
            eventData.event_source_url = payload.sourceUrl;
        }
        if (payload.value && payload.value > 0) {
            eventData.custom_data = {
                value: Number(payload.value.toFixed(2)),
                currency: payload.currency || 'BRL',
                content_name: payload.contentName || 'Projeto de Performance & Escapamento',
                content_category: payload.contentCategory || 'Automotivo'
            };
        }
        const requestBody = {
            data: [eventData]
        };
        if (config.testEventCode?.trim()) {
            requestBody.test_event_code = config.testEventCode.trim();
        }
        const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errMsg = data.error?.message || `HTTP ${response.status}`;
            console.warn('[Meta CAPI Warning]:', errMsg);
            return { success: false, error: errMsg, fbtrace_id: data.error?.fbtrace_id };
        }
        console.log(`[Meta CAPI 🚀] Evento "${payload.eventName}" disparado com sucesso!`, {
            events_received: data.events_received,
            fbtrace_id: data.fbtrace_id
        });
        return {
            success: true,
            fbtrace_id: data.fbtrace_id
        };
    }
    catch (err) {
        console.error('[Meta CAPI Error]:', err.message);
        return { success: false, error: err.message };
    }
}
/**
 * Construtor de links inteligentes rastreados para WhatsApp e Web
 */
function buildTrackedCampaignLink(params) {
    const cleanPhone = params.phone.replace(/\D/g, '');
    const trackingTag = `[REF:ADS_${params.campaignKey.toUpperCase().replace(/\s+/g, '_')}]`;
    const carInfo = params.carOrProduct ? ` para meu ${params.carOrProduct}` : '';
    const offer = params.offerText ? ` Aproveitando a condição de ${params.offerText}.` : '';
    const defaultGreeting = `Olá! Vi o anúncio no Instagram e gostaria de solicitar um orçamento de projeto${carInfo}.${offer}`;
    const messageBody = params.customGreeting || defaultGreeting;
    const fullMessage = `${messageBody}\n\n${trackingTag}`;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullMessage)}`;
    return {
        whatsappUrl,
        fullMessage,
        trackingTag
    };
}
//# sourceMappingURL=metaCapi.js.map