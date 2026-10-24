const evoTokenCache = new Map<string, string>();

export async function findEvolutionToken(evoUrl: string, evoKey: string, evoInst: string): Promise<string | null> {
  const cacheKey = `${evoUrl}:${evoInst}`;
  if (evoTokenCache.has(cacheKey)) return evoTokenCache.get(cacheKey)!;
  try {
    const res = await fetch(`${evoUrl}/instance/all`, {
      headers: { apikey: evoKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      if (Array.isArray(data?.data)) {
        const cleanTarget = evoInst.replace(/^pedidos_/, '');
        const found = data.data.find((inst: any) =>
          inst.name === evoInst ||
          inst.token === evoInst ||
          inst.name?.startsWith(`pedidos_${cleanTarget.slice(0, 15)}`) ||
          evoInst.startsWith(inst.name) ||
          (inst.webhook && inst.webhook.includes(cleanTarget))
        );
        if (found && (found.token || found.name)) {
          const token = found.token || found.name;
          evoTokenCache.set(cacheKey, token);
          return token;
        }
      }
    }
  } catch (e: any) {
    console.warn('[findEvolutionToken Error]:', e.message);
  }
  return null;
}

export async function sendWhatsAppMessage(evoUrl: string, evoKey: string, evoInst: string, number: string, text: string) {
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
      }).catch(() => {});
    } catch {}

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
    } catch (e: any) {
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
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppMedia(
  evoUrl: string,
  evoKey: string,
  evoInst: string,
  number: string,
  mediaUrlOrBase64: string,
  caption: string = '',
  type: string = 'image'
) {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let finalPhone = number;
    if (!isGroup && !isLid) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    let activeToken = evoInst;
    let res = await fetch(`${evoUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        type: type,
        url: mediaUrlOrBase64,
        caption: caption,
        delay: 500
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${evoUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: finalPhone,
            type: type,
            url: mediaUrlOrBase64,
            caption: caption,
            delay: 500
          }),
          signal: AbortSignal.timeout(15000)
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppAudio(
  evoUrl: string,
  evoKey: string,
  evoInst: string,
  number: string,
  base64Audio: string
) {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let finalPhone = number;
    if (!isGroup && !isLid) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    let activeToken = evoInst;
    let res = await fetch(`${evoUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        type: 'audio',
        url: base64Audio,
        delay: 500
      }),
      signal: AbortSignal.timeout(18000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${evoUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: finalPhone,
            type: 'audio',
            url: base64Audio,
            delay: 500
          }),
          signal: AbortSignal.timeout(18000)
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

