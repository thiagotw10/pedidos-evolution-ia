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
    const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
    if (discovered) activeToken = discovered;

    const apiKeyToUse = evoKey || activeToken;
    const isHttpUrl = mediaUrlOrBase64.startsWith('http://') || mediaUrlOrBase64.startsWith('https://');
    // Evolution GO requires raw base64 without "data:image/...;base64,"
    const cleanMedia = isHttpUrl ? mediaUrlOrBase64 : (mediaUrlOrBase64.split(';base64,').pop() || mediaUrlOrBase64).trim();

    // 1. Try Evolution Go: /send/media (primary for Evolution Go server)
    try {
      const resGo = await fetch(`${evoUrl}/send/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: activeToken
        },
        body: JSON.stringify({
          number: finalPhone,
          type: type,
          url: cleanMedia,
          caption: caption || '',
          delay: 500
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (resGo.ok) {
        const data = await resGo.json().catch(() => ({}));
        return { success: true, data };
      }
      console.warn(`[sendWhatsAppMedia] Evolution Go /send/media status: ${resGo.status}`);
    } catch (e: any) {
      console.warn('[sendWhatsAppMedia Go failed]:', e.message);
    }

    // 2. Fallback to Evolution API v1/v2: /message/sendMedia/{instance}
    try {
      const resV2 = await fetch(`${evoUrl}/message/sendMedia/${activeToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKeyToUse
        },
        body: JSON.stringify({
          number: finalPhone,
          mediaMessage: {
            mediatype: type,
            caption: caption || '',
            media: mediaUrlOrBase64
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (resV2.ok) {
        const data = await resV2.json().catch(() => ({}));
        return { success: true, data };
      }
      const errText = await resV2.text().catch(() => '');
      return { success: false, error: errText };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
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
    const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
    if (discovered) activeToken = discovered;

    const apiKeyToUse = evoKey || activeToken;
    const isHttpUrl = base64Audio.startsWith('http://') || base64Audio.startsWith('https://');
    // Evolution GO requires raw base64 without "data:audio/...;base64,"
    const cleanAudio = isHttpUrl ? base64Audio : (base64Audio.split(';base64,').pop() || base64Audio).trim();

    // 1. Try Evolution Go: /send/media (primary for Evolution Go server)
    try {
      const resGo = await fetch(`${evoUrl}/send/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: activeToken
        },
        body: JSON.stringify({
          number: finalPhone,
          type: 'audio',
          url: cleanAudio,
          delay: 500
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (resGo.ok) {
        const data = await resGo.json().catch(() => ({}));
        return { success: true, data };
      }
      console.warn(`[sendWhatsAppAudio] Evolution Go /send/media status: ${resGo.status}`);
    } catch (e: any) {
      console.warn('[sendWhatsAppAudio Go failed]:', e.message);
    }

    // 2. Fallback to Evolution API v1/v2 native WhatsApp Audio endpoint: /message/sendWhatsAppAudio/{instance}
    try {
      const resAudio = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${activeToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKeyToUse
        },
        body: JSON.stringify({
          number: finalPhone,
          audio: base64Audio,
          delay: 500,
          encoding: true
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (resAudio.ok) {
        const data = await resAudio.json().catch(() => ({}));
        return { success: true, data };
      }
    } catch (e: any) {
      console.warn('[sendWhatsAppAudio v2 failed]:', e.message);
    }

    // 3. Fallback to Evolution API v1/v2 /message/sendMedia/{instance} (mediatype: audio)
    try {
      const resMedia = await fetch(`${evoUrl}/message/sendMedia/${activeToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKeyToUse
        },
        body: JSON.stringify({
          number: finalPhone,
          mediaMessage: {
            mediatype: 'audio',
            media: base64Audio
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (resMedia.ok) {
        const data = await resMedia.json().catch(() => ({}));
        return { success: true, data };
      }

      const errText = await resMedia.text().catch(() => '');
      return { success: false, error: errText };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
