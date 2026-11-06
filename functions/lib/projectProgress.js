"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProjectResumeMessage = exports.isProjectProgressQuestion = void 0;
exports.projectProgressText = projectProgressText;
exports.resolveProjectProgress = resolveProjectProgress;
exports.projectProgressNotification = projectProgressNotification;
exports.deliverProjectProgress = deliverProjectProgress;
const crypto_1 = __importDefault(require("crypto"));
const instagramWebhook_1 = require("./instagramWebhook");
const whatsappSender_1 = require("./whatsappSender");
const clean = (v, n = 500) => String(v || '').trim().slice(0, n);
const norm = (v) => clean(v, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isProjectProgressQuestion = (text) => /\b(como (?:anda|esta|vai)|andamento|status|situacao|novidade|novidades|ficou pronto|ja esta pronto|ja ta pronto|quando (?:fica|vai ficar|sai|vai sair|posso (?:buscar|pegar|retirar))|vai sair|vai ficar pronto|previsao|esta pronto|ta pronto|ja saiu|terminou|finalizou|posso (?:buscar|pegar|retirar))\b/.test(norm(text)) && /\b(projeto|carro|veiculo|instalacao|servico|escape|pronto|buscar|pegar|retirar|sai|sair)\b/.test(norm(text));
exports.isProjectProgressQuestion = isProjectProgressQuestion;
const isProjectResumeMessage = (text) => /^(?:oi|ola|bom dia|boa tarde|boa noite|opa|e ai)[!?. ]*$/.test(norm(text)) || /\b(?:ja (?:nao )?(?:conversei|conversamos)|ja falei com voce|nao (?:se )?lembra|lembra de mim)\b/.test(norm(text));
exports.isProjectResumeMessage = isProjectResumeMessage;
function projectProgressText(project) {
    const vehicle = clean([project.brand, project.model, project.year].filter(Boolean).join(' '), 160), car = vehicle ? ` do ${vehicle}` : '';
    const stages = {
        'Novo contato': `Seu projeto${car} está na etapa de novo contato.`,
        'Qualificação': `Seu projeto${car} está em qualificação.`,
        'Análise técnica': `Seu projeto${car} está em análise técnica.`,
        'Orçamento enviado': `O orçamento do seu projeto${car} já foi enviado e aguarda aprovação.`,
        'Aprovado': `Seu projeto${car} está aprovado, mas o início da execução ainda não foi registrado.`,
        'Em execução': `Seu projeto${car} está em execução na oficina.`,
        'Pronto para retirada': `Seu carro${car} está pronto e liberado para retirada na oficina.`,
        'Enviado': `Seu projeto${car} está marcado como enviado.${project.tracking ? ` Código de rastreio: ${clean(project.tracking, 150)}.` : ''}`,
        'Concluído': `Seu projeto${car} está concluído.`,
        'Cancelado': `Seu projeto${car} consta como cancelado.`
    };
    let text = stages[project.status] || `Seu projeto${car} está registrado, mas a etapa precisa ser conferida pela equipe.`;
    if (project.serviceUpdate)
        text += ` ${clean(project.serviceUpdate)}`;
    if (!['Pronto para retirada', 'Enviado', 'Concluído', 'Cancelado'].includes(project.status))
        text += project.completionForecast ? ` Previsão informada pela oficina: ${clean(project.completionForecast, 200)}.` : ' Ainda não há uma previsão de conclusão registrada pela oficina.';
    if (project.status === 'Em execução')
        text += ' Assim que a oficina liberar a retirada, te avisamos por aqui.';
    return text;
}
async function resolveProjectProgress(db, storeId, contactId, projectId, input) {
    const progress = (0, exports.isProjectProgressQuestion)(input), resume = (0, exports.isProjectResumeMessage)(input);
    if (!progress && !(resume && projectId))
        return null;
    if (!projectId)
        return { replyText: 'Não consegui identificar com segurança qual é o seu projeto neste atendimento. Qual veículo você deixou na oficina?', kind: 'project_progress' };
    const project = (await db.collection('automotive_projects').doc(projectId).get()).data();
    // The conversation ID, rather than a model-supplied name, proves ownership.
    if ((!project || project.establishmentId !== storeId || project.phone !== contactId) && !progress)
        return null;
    if (!project || project.establishmentId !== storeId || project.phone !== contactId)
        return { replyText: 'Não encontrei um projeto vinculado a este contato para consultar o andamento. Qual veículo é o seu?', kind: 'project_progress' };
    return { replyText: (resume ? (/^(?:oi|ola|bom dia|boa tarde|boa noite|opa|e ai)[!?. ]*$/.test(norm(input)) ? 'Olá! ' : 'Sim, já temos seu projeto vinculado a este atendimento. ') : '') + projectProgressText(project), kind: 'project_progress' };
}
function projectProgressNotification(before, after) {
    if (!before || !after)
        return '';
    if (before.status !== after.status && after.status === 'Em execução')
        return `${after.delivery === 'Atendimento local' ? 'Recebemos seu carro. ' : ''}${projectProgressText(after)}`;
    if (before.status !== after.status && after.status === 'Pronto para retirada' && after.delivery === 'Atendimento local')
        return projectProgressText(after);
    if (after.status === 'Em execução' && after.completionForecast && before.completionForecast !== after.completionForecast)
        return `Atualização do seu projeto: ${projectProgressText(after)}`;
    return '';
}
/** Event claim precedes the provider call. Ambiguous deliveries are never retried automatically. */
async function deliverProjectProgress(db, projectId, eventId, before, after, send) {
    const text = projectProgressNotification(before, after);
    if (!text)
        return;
    const ref = db.collection('automotive_projects').doc(projectId), job = ref.collection('notifications').doc(crypto_1.default.createHash('sha256').update(eventId).digest('hex'));
    const claimed = await db.runTransaction(async (tx) => {
        const previous = (await tx.get(job)).data(), project = (await tx.get(ref)).data();
        if (previous || !project)
            return null;
        const storeRef = db.collection('establishments').doc(project.establishmentId), store = (await tx.get(storeRef)).data();
        const contact = clean(project.phone, 100);
        if (!contact || contact.includes('/'))
            return null;
        const chatRef = storeRef.collection('chats').doc(contact), chat = (await tx.get(chatRef)).data();
        const channel = /^(ig_|instagram_)/.test(contact) ? 'instagram' : 'whatsapp';
        let reason = '';
        if (store?.segment !== 'AUTOMOTIVE_PARTS' || project.establishmentId !== after.establishmentId || project.phone !== after.phone)
            reason = 'ownership_changed';
        else if (project.status !== after.status || clean(project.completionForecast) !== clean(after.completionForecast) || clean(project.serviceUpdate) !== clean(after.serviceUpdate))
            reason = 'superseded';
        else if (!chat)
            reason = 'chat_unavailable';
        else if (chat.aiPaused && (!chat.aiPausedUntil || Date.parse(chat.aiPausedUntil) > Date.now()))
            reason = 'human_takeover';
        else if (channel === 'instagram' && (!Number.isFinite(Date.parse(chat.lastInboundAt)) || Date.now() - Date.parse(chat.lastInboundAt) >= 24 * 3600000))
            reason = 'instagram_window_expired';
        tx.set(job, { status: reason ? 'blocked' : 'sending', reason, text, channel, eventId, createdAt: new Date().toISOString() });
        return reason ? { blocked: true, reason } : { blocked: false, store, contact, channel, chatRef, profile: Object.entries(chat?.automotiveProfiles || {}).find(([, v]) => v?.projectId === projectId)?.[0] || 'legacy' };
    });
    if (!claimed)
        return;
    if (claimed.blocked)
        return { blocked: true, reason: claimed.reason };
    const { store, contact, channel, chatRef, profile } = claimed, messageRef = chatRef.collection('messages').doc(`project_${job.id}`);
    try {
        await messageRef.set({ sender: 'assistant', origin: 'ai', channel, text, timestamp: new Date().toISOString(), deliveryStatus: 'pending', projectId, automotiveProfileId: profile, operationKind: 'project_progress_notification' });
        const latest = (await ref.get()).data(), latestChat = (await chatRef.get()).data();
        if (!latest || latest.status !== after.status || latest.phone !== contact || latest.establishmentId !== after.establishmentId || clean(latest.completionForecast) !== clean(after.completionForecast) || clean(latest.serviceUpdate) !== clean(after.serviceUpdate) || (latestChat?.aiPaused && (!latestChat.aiPausedUntil || Date.parse(latestChat.aiPausedUntil) > Date.now()))) {
            await job.set({ status: 'blocked', reason: 'changed_before_send' }, { merge: true });
            await messageRef.set({ deliveryStatus: 'cancelled' }, { merge: true });
            return;
        }
        const result = await (send || (async (storeId, contact, text, channel, store) => channel === 'instagram' ? (0, instagramWebhook_1.sendInstagramDirect)(db, storeId, contact, text) : (0, whatsappSender_1.sendWhatsAppMessage)((process.env.EVOLUTION_API_URL || store.evolutionApiUrl || '').replace(/\/$/, ''), store.evolutionApiKey || process.env.EVOLUTION_API_KEY || '', store.evolutionInstanceName || `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`, contact, text)))(after.establishmentId, contact, text, channel, store);
        if (!result.success)
            throw Error(result.error || 'Envio não confirmado');
        await messageRef.set({ deliveryStatus: 'sent', sentAt: new Date().toISOString() }, { merge: true });
        await job.set({ status: 'sent', sentAt: new Date().toISOString() }, { merge: true });
        await chatRef.set({ lastMessage: text, lastSender: 'assistant', lastTimestamp: new Date().toISOString() }, { merge: true });
    }
    catch (e) {
        await job.set({ status: 'delivery_unknown', error: clean(e.message) }, { merge: true });
        await messageRef.set({ deliveryStatus: 'failed' }, { merge: true });
    }
}
//# sourceMappingURL=projectProgress.js.map