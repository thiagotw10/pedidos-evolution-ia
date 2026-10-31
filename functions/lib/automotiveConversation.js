"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAuto = void 0;
exports.automotiveIntent = automotiveIntent;
exports.selectAutomotiveProfile = selectAutomotiveProfile;
exports.automotiveTurnInstructions = automotiveTurnInstructions;
const normalizeAuto = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
exports.normalizeAuto = normalizeAuto;
function automotiveIntent(text) {
    const t = (0, exports.normalizeAuto)(text);
    const intents = [];
    if (/\b(atendente|humano|pessoa|vendedor|consultor|equipe)\b/.test(t) && /\b(falar|chama|chamar|quero|preciso|encaminh|atendimento)\w*/.test(t))
        intents.push('human');
    if (/\b(preco|valor|custa|orcamento|quanto|parcel|pagamento)\w*/.test(t))
        intents.push('price');
    if (/\b(estoque|saldo|disponivel|disponiveis)\b/.test(t) || /\b(tem|possui)\b.*\b(kit|escape|escapamento|peca)\b/.test(t) && !/\b(fotos?|videos?|imagens?|referencias?|projetos?)\b/.test(t))
        intents.push('stock');
    if (/\b(agendar|agendamento|marcar|horario disponivel|vaga|disponibilidade.*instala|instalar.*amanha)\b/.test(t))
        intents.push('appointment');
    if (/\b(fotos?|imagens?|videos?|ouvir|escutar)\b|ronco desse/.test(t))
        intents.push('media');
    if (/\b(catalogo|referencias?|projetos?|opcoes|outros|outras)\b/.test(t))
        intents.push('browse');
    if (/\b(endereco|onde fica|localizacao|como chegar|site|website|telefone|horario|whatsapp)\b/.test(t))
        intents.push('business');
    if (/\b(compatib|serve|garantia|prazo|entrega|potencia|cavalos|cv|drone|ressonancia|legaliz|catalisador)\w*/.test(t))
        intents.push('technical');
    const ownsVehicle = /\b(tenho|possuo|meu carro|meu veiculo|minha\s+(?:bmw|porsche|audi)|meu\s+(?:jetta|golf|civic|porsche|carro)|outro carro|outro veiculo|troquei de carro|voltando (?:ao|pro|para o)|sobre o meu|i have|my car|back to my)\b/.test(t);
    return { intents, primary: intents[0] || 'qualification', ownsVehicle, exploring: !ownsVehicle && intents.some(i => ['media', 'browse', 'stock'].includes(i)), transactional: intents.some(i => ['human', 'price', 'appointment', 'technical'].includes(i)) };
}
function selectAutomotiveProfile(text, memory, extracted) {
    const intent = automotiveIntent(text);
    const profiles = { ...(memory.automotiveProfiles || {}) };
    const previous = memory.automotiveContext || {};
    let active = memory.activeAutomotiveProfile || 'legacy';
    if (!profiles[active])
        profiles[active] = { ...previous };
    let context = { ...profiles[active] };
    if (context.year && !/^(19|20)\d{2}$/.test(context.year))
        context.year = '';
    let switched = false;
    const model = (0, exports.normalizeAuto)(extracted.model), brand = (0, exports.normalizeAuto)(extracted.brand);
    const newProject = /\b(outro projeto|novo projeto para o mesmo|outro carro|outro veiculo|tambem tenho|agora tenho|troquei de carro)\b/.test((0, exports.normalizeAuto)(text));
    const correction = /\b(na verdade|corrigindo|correcao|errei|quis dizer)\b/.test((0, exports.normalizeAuto)(text));
    const vehicleStatement = intent.ownsVehicle || (!intent.exploring && !['human', 'technical'].includes(intent.primary) && !!(model || brand));
    if (vehicleStatement && (model || brand)) {
        const previousGeneration = (0, exports.normalizeAuto)(context.version).match(/\b(991(?:\.[12])?|992(?:\.[12])?|g80|g82|f80|f82|mk7|mk8)\b/)?.[0];
        const nextGeneration = (0, exports.normalizeAuto)(extracted.version).match(/\b(991(?:\.[12])?|992(?:\.[12])?|g80|g82|f80|f82|mk7|mk8)\b/)?.[0];
        const differs = !!((previousGeneration && nextGeneration && previousGeneration !== nextGeneration) || (model && context.model && model !== (0, exports.normalizeAuto)(context.model)) || (brand && context.brand && brand !== (0, exports.normalizeAuto)(context.brand)) || (extracted.year && context.year && extracted.year !== context.year));
        if (!correction && (differs || newProject)) {
            const candidates = Object.entries(profiles).filter(([, p]) => (!model || (0, exports.normalizeAuto)(p.model) === model) && (!brand || (0, exports.normalizeAuto)(p.brand) === brand) && (!extracted.year || !p.year || p.year === extracted.year) && (!nextGeneration || !p.version || !(0, exports.normalizeAuto)(p.version).match(/\b(991(?:\.[12])?|992(?:\.[12])?|g80|g82|f80|f82|mk7|mk8)\b/) || (0, exports.normalizeAuto)(p.version).includes(nextGeneration)));
            const match = !/outro projeto|novo projeto para o mesmo/.test((0, exports.normalizeAuto)(text)) && candidates.length === 1 ? candidates[0] : undefined;
            if (match) {
                active = match[0];
                context = { ...match[1] };
            }
            else {
                let count = Object.keys(profiles).length + 1;
                while (profiles[`vehicle_${count}`])
                    count++;
                active = `vehicle_${count}`;
                context = { customerName: previous.customerName, phone: previous.phone, cep: previous.cep, country: previous.country, currency: previous.currency, detectedLanguage: previous.detectedLanguage, zipCode: previous.zipCode };
            }
            switched = true;
        }
    }
    const safeExtracted = { ...extracted };
    delete safeExtracted.hasAutomotiveInterest;
    // References being browsed are not evidence that the visitor owns that vehicle.
    if (intent.exploring || (['human', 'technical'].includes(intent.primary) && !intent.ownsVehicle)) {
        for (const key of ['brand', 'model', 'year', 'version', 'modifications', 'objective'])
            delete safeExtracted[key];
    }
    for (const [key, value] of Object.entries(safeExtracted))
        if (value !== undefined && value !== '')
            context[key] = value;
    return { active, profiles, context, switched, intent };
}
function automotiveTurnInstructions(text, context, switched = false) {
    const intent = automotiveIntent(text);
    const missing = [!context.model && 'modelo', !context.year && 'ano', !context.version && 'versão/motorização', !context.modifications && 'configuração atual', !context.objective && 'objetivo', (!context.delivery || context.delivery === 'A definir') && 'instalação local ou envio'].filter(Boolean);
    return `PLANO DESTA MENSAGEM (prioridade sobre roteiro genérico):\nIntenções: ${intent.intents.join(', ') || 'conversa/qualificação'}. ${switched ? 'O cliente mudou de veículo/projeto: use somente os dados do projeto ativo; não herde configuração, objetivo ou referências do anterior.' : ''}\nResponda a todas as solicitações explícitas antes de qualificar. ${intent.exploring ? 'O cliente está explorando: mostre apenas referências reais disponíveis e não peça ficha, CEP ou orçamento para liberar mídia.' : ''}\n${intent.primary === 'human' ? 'O cliente pediu uma pessoa. Respeite o pedido e não continue o questionário. Só diga que encaminhou após confirmação real da plataforma.' : ''}\n${intent.primary === 'price' ? 'Consulte somente valores aprovados cadastrados; se não houver, explique brevemente que a oficina confirma o orçamento e pergunte apenas o dado relevante que falta. Não desvie imediatamente para fotos.' : ''}\n${intent.primary === 'appointment' ? 'Não confirme vaga, data ou horário sem agenda confirmada; registre o interesse e pergunte a preferência do cliente.' : ''}\nDados ainda não confirmados: ${missing.join(', ') || 'nenhum dado básico pendente'}. Faça no máximo UMA pergunta útil. Nunca repita pergunta respondida. Não elogie o carro automaticamente, não repita apresentação e não transforme objetivo desejado em resultado técnico garantido.`;
}
//# sourceMappingURL=automotiveConversation.js.map