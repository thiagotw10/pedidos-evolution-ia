"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERNAL_TOOL_NAMES = void 0;
exports.hasToolProtocol = hasToolProtocol;
exports.claimsMediaDispatch = claimsMediaDispatch;
exports.repairToolProtocol = repairToolProtocol;
/** Tool calls are accepted only through the provider's structured response, never parsed from prose. */
exports.INTERNAL_TOOL_NAMES = ['enviar_cardapio_com_fotos', 'enviar_foto_produto', 'enviar_localizacao_loja', 'consultar_operacao_oficina', 'consultar_andamento_projeto', 'registrar_interesse_projeto', 'registrar_pedido'];
function hasToolProtocol(text, names = exports.INTERNAL_TOOL_NAMES) {
    return names.some(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text || '')) || /\b(?:tool_calls?|function_calls?|functionDeclarations)\b|<\|(?:tool|function)[^>]*\|>/i.test(text || '');
}
function claimsMediaDispatch(text) {
    const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /\b(?:vou|vamos|irei)\b.{0,25}\b(?:enviar|mandar)\b.{0,100}\b(?:fotos?|videos?|imagens?|midias|referencias|projetos)\b|\b(?:enviei|mandei|seguem|aqui estao|estou enviando)\b.{0,100}\b(?:fotos?|videos?|imagens?|midias)\b/.test(t);
}
async function repairToolProtocol(response, regenerate, names = exports.INTERNAL_TOOL_NAMES) {
    if (!hasToolProtocol(response?.text || '', names))
        return { response, status: 'none' };
    try {
        const repaired = await regenerate();
        if ((repaired?.text || repaired?.functionCalls?.length) && !hasToolProtocol(repaired.text || '', names) && !(claimsMediaDispatch(repaired.text || '') && !repaired.functionCalls?.length))
            return { response: repaired, status: 'recovered' };
    }
    catch { /* The local output guard handles the failed repair without executing prose. */ }
    return { response: { text: response?.text || '', functionCalls: [] }, status: 'blocked' };
}
//# sourceMappingURL=toolProtocol.js.map