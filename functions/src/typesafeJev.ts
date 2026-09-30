/**
 * TypeSafe AI (Jev - System One Model)
 * Non-autoregressive fast decision and triage engine for WhatsApp automation.
 */

export interface JevTriageResult {
  intent: 'PIX_QUERY' | 'ORDER_STATUS' | 'STORE_HOURS' | 'STORE_LOCATION' | 'HUMAN_HELP' | 'COMPLAINT' | 'CONVERSATION';
  urgent: boolean;
  sentiment: 'ANGRY' | 'NEUTRAL' | 'HAPPY';
  confidence: number;
  durationMs: number;
}

export interface JevLeadResult {
  leadTemperature: 'HOT' | 'WARM' | 'COLD';
  readyToVisit: boolean;
  durationMs: number;
}

const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY || 'apikey_28126e1dedfbc8b4ed6a01e5e47c090f644_c5fae74707c4d68704cd52e43e7ea270006718345637e606bc0965ddb892d2a0';

/**
 * Rapidly triage inbound WhatsApp message in ~100-300ms using Jev System One model.
 */
export async function triageInboundMessageWithJev(
  text: string,
  storeContext?: { name?: string; segment?: string }
): Promise<JevTriageResult | null> {
  if (!text || !text.trim() || !TYPESAFE_API_KEY) {
    return null;
  }

  const startTime = Date.now();
  try {
    const storeInfo = storeContext?.name ? ` no estabelecimento "${storeContext.name}"` : '';
    const segmentInfo = storeContext?.segment ? ` (Nicho: ${storeContext.segment})` : '';

    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TYPESAFE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: `Mensagem enviada por cliente no WhatsApp${storeInfo}${segmentInfo}: "${text.trim().slice(0, 500)}"`,
        questions: {
          intent: {
            type: 'choice',
            instructions: 'Qual é a intenção principal da mensagem do cliente?',
            criteria: {
              'PIX_QUERY': 'Cliente quer saber a chave PIX, dados bancários ou como pagar via PIX',
              'ORDER_STATUS': 'Cliente perguntando onde está o pedido, se já saiu para entrega ou tempo de espera',
              'STORE_HOURS': 'Cliente perguntando se a loja está aberta hoje ou horário de funcionamento',
              'STORE_LOCATION': 'Cliente perguntando endereço físico da loja, onde fica ou localização presencial',
              'HUMAN_HELP': 'Cliente pedindo expressamente para falar com uma pessoa, atendente humano ou suporte real',
              'COMPLAINT': 'Cliente insatisfeito, nervoso, reclamando de atraso, erro, comida fria ou cobrando gerente',
              'CONVERSATION': 'Cliente escolhendo produtos, fazendo pedidos, tirando dúvidas sobre o cardápio ou conversa geral de vendas'
            }
          },
          urgent: {
            type: 'choice',
            instructions: 'O cliente está irritado ou necessita de intervenção humana urgente?',
            criteria: {
              'YES': 'Sim, cliente indignado, reclamando de atraso/erro grave ou exigindo gerente',
              'NO': 'Não, atendimento normal e amigável'
            }
          },
          sentiment: {
            type: 'choice',
            instructions: 'Sentimento geral do cliente',
            criteria: {
              'ANGRY': 'Irritado, nervoso ou insatisfeito',
              'NEUTRAL': 'Neutro, objetivo',
              'HAPPY': 'Agradecido, simpático ou feliz'
            }
          }
        }
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      console.warn(`[TypeSafe Jev] Status HTTP ${response.status}:`, await response.text().catch(() => ''));
      return null;
    }

    const data: any = await response.json();
    const durationMs = Date.now() - startTime;
    const answers = data?.answers || {};

    const rawIntent = answers.intent?.choice || 'CONVERSATION';
    const rawUrgent = answers.urgent?.choice || 'NO';
    const rawSentiment = answers.sentiment?.choice || 'NEUTRAL';
    const confidence = Number(answers.intent?.confidence ?? 1.0);

    const result: JevTriageResult = {
      intent: rawIntent,
      urgent: rawUrgent === 'YES',
      sentiment: rawSentiment,
      confidence,
      durationMs
    };

    console.log(`[TypeSafe Jev] Triagem concluída em ${durationMs}ms: Intent=${result.intent} | Urgent=${result.urgent} | Sentiment=${result.sentiment} (Conf: ${result.confidence})`);
    return result;
  } catch (err: any) {
    console.warn('[TypeSafe Jev] Falha ou timeout na triagem (fallback automático ativado):', err.message);
    return null;
  }
}

/**
 * Qualify lead temperature and visit readiness for automotive & real estate.
 */
export async function qualifyLeadWithJev(
  text: string,
  segment: string
): Promise<JevLeadResult | null> {
  if (!text || !text.trim() || !TYPESAFE_API_KEY) {
    return null;
  }

  const startTime = Date.now();
  try {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TYPESAFE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: `Mensagem recebida no WhatsApp do segmento "${segment}": "${text.trim().slice(0, 500)}"`,
        questions: {
          leadTemperature: {
            type: 'choice',
            instructions: 'Qual a temperatura e prontidão de compra do lead?',
            criteria: {
              'HOT': 'Lead muito quente com intenção imediata de compra, visita ou proposta',
              'WARM': 'Lead interessado, tirando dúvidas sobre modelo, financiamento ou valor',
              'COLD': 'Apenas curioso ou mensagem genérica'
            }
          },
          readyToVisit: {
            type: 'choice',
            instructions: 'O cliente quer agendar visita presencial, test drive ou reunião?',
            criteria: {
              'YES': 'Sim, quer ver o produto/carro/imóvel presencialmente ou agendar horário',
              'NO': 'Não'
            }
          }
        }
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    const durationMs = Date.now() - startTime;
    const answers = data?.answers || {};

    return {
      leadTemperature: answers.leadTemperature?.choice || 'WARM',
      readyToVisit: answers.readyToVisit?.choice === 'YES',
      durationMs
    };
  } catch (err: any) {
    console.warn('[TypeSafe Jev] Falha ao qualificar lead:', err.message);
    return null;
  }
}
