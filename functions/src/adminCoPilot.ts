/**
 * Admin Co-Pilot: WhatsApp Management by the Store Owner
 * Allows the store owner to create products, pause items, change prices,
 * and view daily sales metrics by sending voice audios or text in their self-chat or admin phone.
 */
import admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';

const geminiApiKey = process.env.GEMINI_API_KEY || 'AIzaSyA9GspslNh-yPg2n1vCRXU6SPP5OBUsDpo';
const genai = new GoogleGenAI({ apiKey: geminiApiKey });

export interface CoPilotResult {
  handled: boolean;
  replyText: string;
  actionTaken?: string;
  productCreated?: any;
}

/**
 * Helper to extract base identifier without device index (:1, :58) and domain
 */
function getJidBase(jid: string): string {
  if (!jid) return '';
  return jid.split(':')[0].replace(/@.*$/, '').trim().toLowerCase();
}

/**
 * Checks if an incoming message is from the Store Owner in their own private conversation
 * (WhatsApp Self-Chat / "Mensagens para você")
 */
export function isOwnerAdminMessage(
  fromMe: boolean,
  remoteJid: string,
  phone: string,
  infoChat: string,
  infoSender: string,
  est: any
): boolean {
  // CRITICAL: The Co-Pilot MUST ONLY activate in the owner's own private conversation (Self-Chat).
  // If fromMe is false, it's a customer messaging the store, NEVER self-chat.
  if (!fromMe) {
    return false;
  }

  // 1. Evolution Go: Info.Chat and Info.Sender are provided
  if (infoChat && infoSender) {
    const baseChat = getJidBase(infoChat);
    const baseSender = getJidBase(infoSender);
    // In Self-Chat, the message was sent to oneself, so baseChat === baseSender
    if (baseChat && baseSender && baseChat === baseSender) {
      return true;
    }
    // If baseChat !== baseSender, the owner is talking to another contact/customer.
    // MUST return false so fromMe handler ignores it and never speaks for the owner!
    return false;
  }

  // 2. Baileys / Node format (when infoChat/infoSender are not both present):
  // Check if remoteJid matches the instance's own connected WhatsApp phone/LID
  const ownWhatsapp = (est?.whatsappNumber || est?.evolutionInstancePhone || '').replace(/\D/g, '');
  const cleanPhone = (phone || '').replace(/\D/g, '');

  if (ownWhatsapp && cleanPhone && cleanPhone.endsWith(ownWhatsapp.slice(-8))) {
    return true;
  }

  // By default, if fromMe is true and we cannot confirm it is the user's private self-chat,
  // do NOT treat as admin to avoid intercepting personal chats!
  return false;
}

/**
 * Process an admin voice/text command with Gemini and execute Firestore operations
 */
export async function processAdminCoPilotCommand(
  storeId: string,
  est: any,
  incomingText: string,
  mediaPart?: { mimeType: string; data: string } | null,
  dbInstance?: admin.firestore.Firestore
): Promise<CoPilotResult> {
  const db = dbInstance || admin.firestore();

  // If text is a duplicate of a bot signature, ignore immediately
  if (incomingText && (
    incomingText.startsWith('👨‍🍳 *Co-Pilot') || 
    incomingText.startsWith('🤖 *Co-Pilot') || 
    incomingText.startsWith('🤖 *Assistente')
  )) {
    return { handled: false, replyText: '' };
  }

  // Fetch current store products & categories for context
  const productsSnap = await db.collection('establishments').doc(storeId).collection('products').get();
  const existingProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const existingCategories = Array.from(new Set(existingProducts.map(p => p.category).filter(Boolean)));

  const seg = (est.segment || '').toUpperCase();
  const isVehicles = seg.includes('VEIC') || seg.includes('CARRO') || seg.includes('MOTO') || seg.includes('AUTO');
  const isRealEstate = seg.includes('IMOB') || seg.includes('IMOVE') || seg.includes('CORRETOR');
  const isFashion = seg.includes('MODA') || seg.includes('ROUPA') || seg.includes('CALCAD');
  const isElectronics = seg.includes('ELETRO') || seg.includes('CELULAR') || seg.includes('IPHONE');

  const copilotEmoji = isVehicles ? '🚗' : isRealEstate ? '🏡' : isFashion ? '✨' : isElectronics ? '📱' : '👨‍🍳';
  const copilotTitle = isVehicles ? 'Co-Pilot Concessionária' : isRealEstate ? 'Co-Pilot Imobiliário' : isFashion ? 'Co-Pilot Moda' : isElectronics ? 'Co-Pilot Tech' : 'Co-Pilot da Loja';
  const copilotHeader = `${copilotEmoji} *${copilotTitle}:*`;
  const catalogTerm = isVehicles ? 'Estoque de Veículos' : isRealEstate ? 'Catálogo de Imóveis' : isFashion ? 'Coleção de Peças' : isElectronics ? 'Catálogo de Aparelhos' : 'Cardápio / Catálogo';
  const itemTerm = isVehicles ? 'veículo(s)' : isRealEstate ? 'imóvel(is)' : isFashion ? 'peça(s)' : isElectronics ? 'aparelho(s)' : 'item(ns)';

  const systemInstruction = `
Você é o ${copilotTitle} de Gestão. Você atende DIRETAMENTE o DONO/GESTOR do estabelecimento pelo WhatsApp.
O dono fala com você por áudio ou texto para gerenciar o negócio rapidamente.
Estabelecimento: "${est.name || 'Empresa'}" (Nicho: "${est.segment || 'Alimentação'}").
Categorias já existentes no ${catalogTerm}: ${existingCategories.length > 0 ? existingCategories.join(', ') : 'Geral, Destaques'}.

Sua missão:
    - CADASTRAR MÚLTIPLOS PRODUTOS / IMPORTAR CARDÁPIO COMPLETO POR FOTO OU TEXTO:
      Quando o dono enviar a foto de um cardápio impresso, lousa, panfleto, tabela de preços ou disser "adiciona todos os itens desse cardápio" ou pedir para cadastrar vários produtos:
      1. Analise toda a imagem cuidadosamente de ponta a ponta.
      2. Extraia TODOS os produtos que estiverem visíveis com seus nomes, preços, descrições e categorias.
      3. NUNCA cadastre apenas o primeiro item! Extraia absolutamente todos os itens legíveis do cardápio.
      4. Chame OBRIGATORIAMENTE a ferramenta "cadastrar_multiplos_produtos" passando o array completo em "products".
      5. NÃO vincule a foto da folha do cardápio como a foto de cada produto individual.
    - CRIAR PRODUTO (individual, quando o dono pedir um único item específico)
    - ATUALIZAR FOTO DO PRODUTO (quando o dono enviar a foto real de um prato específico e pedir para adicionar a foto ao produto)
    - REMOVER FOTOS / LIMPAR FOTOS (quando o dono pedir para remover, limpar ou tirar as fotos dos produtos):
      Chame a ferramenta "limpar_fotos_produtos".
    - PAUSAR PRODUTO (quando acabou o estoque do dia)
    - ATIVAR PRODUTO (quando o estoque voltou)
    - ALTERAR PREÇO (mudar valor de um item)
    - EXCLUIR PRODUTO (remover do cardápio)
    - CONSULTAR VENDAS (faturamento e pedidos de hoje)
    - LISTAR PRODUTOS (ver itens cadastrados)
    - AJUDA (explicar o que você faz)

2. Chame a ferramenta (Tool) correspondente aos dados extraídos com máxima precisão.
Se o dono enviou um áudio ou foto, você já tem acesso ao áudio e à imagem.
Ao criar um produto individual, extraia:
- name: Nome do produto claro e atraente
- price: Preço em número decimal (ex: 35.00)
- description: Ingredientes ou detalhes mencionados
- category: A categoria mais adequada (use uma das existentes ou crie uma coerente com o nicho)

Seja sempre prestativo, ágil e chame o lojista cordialmente de "chefe" ou "parceiro".
`;

  // Define Function Calling Tools
  const cadastrarMultiplosProdutosTool = {
    name: 'cadastrar_multiplos_produtos',
    description: 'Cadastra múltiplos produtos de uma só vez no cardápio/catálogo da loja. Use SEMPRE que o lojista enviar a foto de um cardápio, folheto, lista de preços, tabela, ou pedir para cadastrar/adicionar todos os itens ou vários produtos de uma vez.',
    parameters: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          description: 'Lista completa com TODOS os produtos identificados na imagem ou texto',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nome do produto' },
              price: { type: 'number', description: 'Preço numérico do produto em reais (ex: 35.00)' },
              description: { type: 'string', description: 'Descrição dos ingredientes ou características' },
              category: { type: 'string', description: 'Categoria apropriada (ex: Hambúrgueres, Pizzas, Bebidas, Sobremesas, Porções)' }
            },
            required: ['name', 'price']
          }
        }
      },
      required: ['products']
    }
  };

  const limparFotosProdutosTool = {
    name: 'limpar_fotos_produtos',
    description: 'Remove todas as fotos atribuídas aos produtos do cardápio, deixando os produtos limpos sem fotos.',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Confirmar remoção' }
      }
    }
  };

  const criarProdutoTool = {
    name: 'criar_produto',
    description: 'Cadastra um único novo produto no cardápio/catálogo da loja.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do produto' },
        price: { type: 'number', description: 'Preço numérico (ex: 32.50)' },
        description: { type: 'string', description: 'Descrição dos ingredientes ou características' },
        category: { type: 'string', description: 'Categoria do produto (ex: Hambúrgueres, Bebidas, Pizzas)' }
      },
      required: ['name', 'price']
    }
  };

  const pausarProdutoTool = {
    name: 'pausar_produto',
    description: 'Pausa um produto (marca como indisponível/sem estoque temporariamente).',
    parameters: {
      type: 'object',
      properties: {
        searchName: { type: 'string', description: 'Nome aproximado do produto a pausar' }
      },
      required: ['searchName']
    }
  };

  const ativarProdutoTool = {
    name: 'ativar_produto',
    description: 'Reativa um produto (marca como disponível no cardápio novamente).',
    parameters: {
      type: 'object',
      properties: {
        searchName: { type: 'string', description: 'Nome aproximado do produto a reativar' }
      },
      required: ['searchName']
    }
  };

  const alterarPrecoTool = {
    name: 'alterar_preco',
    description: 'Altera o preço de um produto existente.',
    parameters: {
      type: 'object',
      properties: {
        searchName: { type: 'string', description: 'Nome aproximado do produto' },
        newPrice: { type: 'number', description: 'Novo preço em reais (ex: 28.00)' }
      },
      required: ['searchName', 'newPrice']
    }
  };

  const excluirProdutoTool = {
    name: 'excluir_produto',
    description: 'Exclui definitivamente um produto do catálogo.',
    parameters: {
      type: 'object',
      properties: {
        searchName: { type: 'string', description: 'Nome aproximado do produto a excluir' }
      },
      required: ['searchName']
    }
  };

  const atualizarFotoProdutoTool = {
    name: 'atualizar_foto_produto',
    description: 'Adiciona, vincula ou atualiza a foto de um produto que já existe no cardápio quando o lojista envia uma imagem e pede para adicionar a foto ao produto.',
    parameters: {
      type: 'object',
      properties: {
        searchName: { type: 'string', description: 'Nome aproximado do produto que receberá a foto (ex: pizza de frango)' }
      },
      required: ['searchName']
    }
  };

  const consultarVendasTool = {
    name: 'consultar_vendas',
    description: 'Consulta o faturamento e métricas de pedidos da loja no dia de hoje.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Período desejado (ex: hoje)' }
      }
    }
  };

  const listarProdutosTool = {
    name: 'listar_produtos',
    description: 'Lista os produtos cadastrados no cardápio.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Categoria opcional' }
      }
    }
  };

  try {
    const currentParts: any[] = [];
    if (mediaPart) {
      currentParts.push({
        inlineData: {
          mimeType: mediaPart.mimeType,
          data: mediaPart.data
        }
      });
    }

    if (incomingText && incomingText.trim()) {
      currentParts.push({ text: incomingText.trim() });
    } else if (!mediaPart) {
      currentParts.push({ text: 'Olá Co-Pilot, o que você pode fazer por mim?' });
    }

    const response = await genai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [{ role: 'user', parts: currentParts }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ 
          functionDeclarations: [
            cadastrarMultiplosProdutosTool as any,
            limparFotosProdutosTool as any,
            criarProdutoTool as any, 
            atualizarFotoProdutoTool as any,
            pausarProdutoTool as any, 
            ativarProdutoTool as any, 
            alterarPrecoTool as any, 
            excluirProdutoTool as any, 
            consultarVendasTool as any, 
            listarProdutosTool as any
          ] 
        }],
        temperature: 0.1
      }
    });

    const functionCalls = response.functionCalls;
    let replyText = response.text || '';
    let actionTaken = 'chat';
    let productCreated: any = null;

    if (functionCalls && functionCalls.length > 0) {
      // 1. Batch creation (when importing full menu, list of items or multiple function calls)
      const batchCall = functionCalls.find(c => c.name === 'cadastrar_multiplos_produtos');
      const createCalls = functionCalls.filter(c => c.name === 'criar_produto');

      if (batchCall || createCalls.length > 1) {
        let rawProducts: any[] = [];
        if (batchCall) {
          const args = (batchCall.args || {}) as any;
          if (Array.isArray(args.products)) {
            rawProducts = args.products;
          }
        }
        if (createCalls.length > 1 && rawProducts.length === 0) {
          rawProducts = createCalls.map(c => c.args);
        }

        if (rawProducts.length > 0) {
          const batch = db.batch();
          const createdItems: any[] = [];
          const nowIso = new Date().toISOString();

          for (let i = 0; i < rawProducts.length; i++) {
            const item = rawProducts[i];
            const pName = (item.name || '').trim();
            if (!pName) continue;
            const pPrice = Number(item.price) || 0;
            const pDesc = (item.description || '').trim();
            const pCat = (item.category || '').trim() || existingCategories[0] || 'Geral';

            const existing = existingProducts.find(p => (p.name || '').toLowerCase().trim() === pName.toLowerCase());
            if (existing) {
              const ref = db.collection('establishments').doc(storeId).collection('products').doc(existing.id);
              batch.update(ref, {
                price: pPrice > 0 ? pPrice : existing.price,
                description: pDesc || existing.description || '',
                category: pCat,
                updatedAt: nowIso
              });
              createdItems.push({ name: pName, price: pPrice > 0 ? pPrice : existing.price, category: pCat, description: pDesc, updated: true });
            } else {
              const prodId = `prod_${Date.now()}_${i}`;
              const ref = db.collection('establishments').doc(storeId).collection('products').doc(prodId);
              const newProd = {
                id: prodId,
                name: pName,
                description: pDesc,
                price: pPrice,
                category: pCat,
                available: true,
                imageUrl: '',
                createdAt: nowIso
              };
              batch.set(ref, newProd);
              createdItems.push(newProd);
            }
          }

          await batch.commit();
          actionTaken = 'batch_create_products';

          const byCat: { [cat: string]: any[] } = {};
          for (const item of createdItems) {
            const cat = item.category || 'Geral';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(item);
          }

          let summary = '';
          for (const [cat, items] of Object.entries(byCat)) {
            summary += `\n📂 *${cat}:*\n` + items.map(it => `• *${it.name}* — R$ ${Number(it.price).toFixed(2)}${it.description ? ` _(${it.description})_` : ''}`).join('\n') + '\n';
          }

          replyText = `${copilotHeader}\n📋 *Cardápio Importado com Sucesso, Chefe!*\n\n` +
            `Identifiquei e cadastrei *${createdItems.length} produtos* no seu catálogo:\n` +
            summary +
            `\nTodos já estão liberados no cardápio digital para os clientes pedirem! 🚀\n` +
            `_(Dica: Para adicionar a foto individual de um prato, envie a foto real dele dizendo "adiciona essa foto na pizza de frango")_`;

          return {
            handled: true,
            replyText,
            actionTaken,
            productCreated: createdItems
          };
        }
      }

      const call = functionCalls[0];
      const args = (call.args || {}) as any;

      if (call.name === 'criar_produto') {
        const prodId = `prod_${Date.now()}`;
        const newPrice = Number(args.price) || 0;
        const newCategory = args.category || existingCategories[0] || 'Destaques';

        // If an image was sent with this message, attach it ONLY if this isn't a menu sheet
        const isMenuText = incomingText && /card[aá]pio|todos|tabela|folheto/i.test(incomingText);
        let imageUrl = '';
        if (mediaPart && mediaPart.mimeType.startsWith('image/') && !isMenuText) {
          imageUrl = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
        }

        // Smart Check: If item with same name already exists in cardápio and image is provided, update its photo!
        const search = (args.name || '').toLowerCase().trim();
        const alreadyExists = existingProducts.find(p => (p.name || '').toLowerCase().includes(search));
        if (alreadyExists && imageUrl && (!newPrice || newPrice === alreadyExists.price)) {
          await db.collection('establishments').doc(storeId).collection('products').doc(alreadyExists.id).update({
            imageUrl,
            updatedAt: new Date().toISOString()
          });
          actionTaken = 'update_product_photo';
          replyText = `${copilotHeader}\n📸 *Foto Vinculada com Sucesso, Chefe!*\n\n` +
            `A imagem foi adicionada à *${alreadyExists.name}* e já está visível para os clientes no cardápio! 🍕✨`;
        } else {
          const newProd = {
            id: prodId,
            name: args.name,
            description: args.description || '',
            price: newPrice,
            category: newCategory,
            available: true,
            imageUrl: imageUrl || '',
            createdAt: new Date().toISOString()
          };

          await db.collection('establishments').doc(storeId).collection('products').doc(prodId).set(newProd);
          productCreated = newProd;
          actionTaken = 'create_product';

          replyText = `${copilotHeader}\n✅ *Produto Cadastrado com Sucesso, Chefe!*\n\n` +
            `🍽️ *${newProd.name}*\n` +
            `💰 *Preço:* R$ ${newPrice.toFixed(2)}\n` +
            `📂 *Categoria:* ${newCategory}\n` +
            (newProd.description ? `📝 *Descrição:* ${newProd.description}\n` : '') +
            (imageUrl ? `📸 *Foto anexada e salva com sucesso!*\n` : '') +
            `\nEle já está liberado no cardápio para os clientes pedirem! 🚀`;
        }
      } 
      else if (call.name === 'limpar_fotos_produtos') {
        const withPhoto = existingProducts.filter(p => p.imageUrl && p.imageUrl.trim());
        if (withPhoto.length === 0) {
          replyText = `${copilotHeader}\nTodos os seus produtos já estão sem fotos, chefe!`;
        } else {
          const batch = db.batch();
          for (const prod of withPhoto) {
            const ref = db.collection('establishments').doc(storeId).collection('products').doc(prod.id);
            batch.update(ref, {
              imageUrl: '',
              updatedAt: new Date().toISOString()
            });
          }
          await batch.commit();
          actionTaken = 'clear_product_photos';
          replyText = `${copilotHeader}\n🗑️ *Fotos Removidas com Sucesso!*\n\n` +
            `Removi as imagens de *${withPhoto.length} produto(s)*. Agora seus itens estão limpos, sem fotos vinculadas.`;
        }
      } 
      else if (call.name === 'atualizar_foto_produto') {
        const search = (args.searchName || '').toLowerCase().trim();
        const found = existingProducts.find(p => (p.name || '').toLowerCase().includes(search));

        if (found) {
          let imageUrl = '';
          if (mediaPart && mediaPart.mimeType.startsWith('image/')) {
            imageUrl = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
          }

          if (imageUrl) {
            await db.collection('establishments').doc(storeId).collection('products').doc(found.id).update({
              imageUrl,
              updatedAt: new Date().toISOString()
            });
            actionTaken = 'update_product_photo';
            replyText = `${copilotHeader}\n📸 *Foto Adicionada com Sucesso!*\n\n` +
              `A imagem foi vinculada à *${found.name}* e já está visível para os clientes no cardápio! 🍕✨`;
          } else {
            replyText = `${copilotHeader}\nChefe, não consegui carregar a foto enviada. Pode me reenviar a imagem com a legenda *"adiciona essa foto na ${found.name}"*?`;
          }
        } else {
          replyText = `${copilotHeader}\n⚠️ Não localizei nenhum produto com o nome parecido com "${args.searchName}" no cardápio. Diga *"listar produtos"* para conferir os nomes cadastrados.`;
        }
      }
      else if (call.name === 'pausar_produto' || call.name === 'ativar_produto') {
        const isPause = call.name === 'pausar_produto';
        const search = (args.searchName || '').toLowerCase().trim();
        const found = existingProducts.find(p => (p.name || '').toLowerCase().includes(search));

        if (found) {
          await db.collection('establishments').doc(storeId).collection('products').doc(found.id).update({
            available: !isPause,
            updatedAt: new Date().toISOString()
          });
          actionTaken = isPause ? 'pause_product' : 'resume_product';
          replyText = `${copilotHeader}\n` +
            `${isPause ? '⏸️' : '▶️'} *Produto ${isPause ? 'Pausado' : 'Reativado'}!*\n\n` +
            `*${found.name}* agora está marcado como *${isPause ? 'Indisponível (Sem Estoque)' : 'Disponível no Cardápio'}*.`;
        } else {
          replyText = `${copilotHeader}\n⚠️ Não encontrei nenhum produto com o nome parecido com "${args.searchName}".\n\nDiga *"listar produtos"* para conferir os nomes exatos.`;
        }
      }
      else if (call.name === 'alterar_preco') {
        const search = (args.searchName || '').toLowerCase().trim();
        const found = existingProducts.find(p => (p.name || '').toLowerCase().includes(search));
        const newPrice = Number(args.newPrice) || 0;

        if (found && newPrice > 0) {
          const oldPrice = Number(found.price) || 0;
          await db.collection('establishments').doc(storeId).collection('products').doc(found.id).update({
            price: newPrice,
            updatedAt: new Date().toISOString()
          });
          actionTaken = 'update_price';
          replyText = `${copilotHeader}\n💲 *Preço Atualizado!*\n\n` +
            `*${found.name}*: de ~R$ ${oldPrice.toFixed(2)}~ por *R$ ${newPrice.toFixed(2)}*! ✅`;
        } else {
          replyText = `${copilotHeader}\n⚠️ Não localizei o item "${args.searchName}" para atualizar o preço.`;
        }
      }
      else if (call.name === 'excluir_produto') {
        const search = (args.searchName || '').toLowerCase().trim();
        const found = existingProducts.find(p => (p.name || '').toLowerCase().includes(search));

        if (found) {
          await db.collection('establishments').doc(storeId).collection('products').doc(found.id).delete();
          actionTaken = 'delete_product';
          replyText = `${copilotHeader}\n🗑️ *Produto Removido!*\n\n*${found.name}* foi excluído permanentemente do cardápio.`;
        } else {
          replyText = `${copilotHeader}\n⚠️ Não encontrei o item "${args.searchName}" para remover.`;
        }
      }
      else if (call.name === 'consultar_vendas') {
        actionTaken = 'get_metrics';
        // Query today's orders
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        const ordersSnap = await db.collection('establishments').doc(storeId)
          .collection('orders')
          .where('createdAt', '>=', startOfDay)
          .get();

        const todayOrders = ordersSnap.docs.map(d => d.data());
        const totalCount = todayOrders.length;
        const totalRevenue = todayOrders.reduce((sum, o: any) => sum + (Number(o.total) || 0), 0);
        const delivered = todayOrders.filter((o: any) => o.status === 'ENTREGUE').length;
        const inProgress = todayOrders.filter((o: any) => o.status === 'EM_PREPARO' || o.status === 'CONFIRMADO' || o.status === 'PENDENTE').length;

        const pixCount = todayOrders.filter((o: any) => (o.paymentMethod || '').toUpperCase().includes('PIX')).length;
        const cardCount = todayOrders.filter((o: any) => (o.paymentMethod || '').toUpperCase().includes('CART')).length;

        replyText = `${copilotHeader}\n📊 *Resumo de Vendas de Hoje:*\n\n` +
          `💰 *Faturamento Total:* R$ ${totalRevenue.toFixed(2)}\n` +
          `📦 *Total de Pedidos:* ${totalCount} pedido(s)\n` +
          `🛵 *Entregues:* ${delivered}\n` +
          `🍳 *Em Andamento:* ${inProgress}\n\n` +
          `💳 *Formas de Pagamento:*\n` +
          `• PIX: ${pixCount} pedido(s)\n` +
          `• Cartão: ${cardCount} pedido(s)`;
      }
      else if (call.name === 'listar_produtos') {
        actionTaken = 'list_products';
        const active = existingProducts.filter(p => p.available !== false).slice(0, 15);
        if (active.length === 0) {
          replyText = `${copilotHeader}\nVocê ainda não possui produtos cadastrados. Me mande um áudio dizendo: *"Cadastra a Pizza de Calabresa por 45 reais"* que eu crio para você! 🍕`;
        } else {
          const listText = active.map(p => `• *${p.name}* (R$ ${Number(p.price).toFixed(2)}) - ${p.category}`).join('\n');
          replyText = `${copilotHeader}\n📋 *Produtos Ativos no Cardápio:*\n\n${listText}\n\nTotal de ${existingProducts.length} produto(s) cadastrados.`;
        }
      }
    }

    if (!replyText) {
      replyText = `${copilotHeader}\nOlá, chefe! Como posso te ajudar hoje?\n\n` +
        `Você pode me mandar áudio ou texto para:\n` +
        `• 🍽️ *Cadastrar produto:* "Cria o Burger X por 35 reais na categoria Artesanais"\n` +
        `• ⏸️ *Pausar produto:* "Pausa a Coca-Cola por hoje"\n` +
        `• ▶️ *Reativar produto:* "Ativa de novo a Coca-Cola"\n` +
        `• 💲 *Mudar preço:* "Altera o preço do X-Salada para 28 reais"\n` +
        `• 📊 *Vendas de hoje:* "Quanto vendemos hoje?"`;
    }

    return {
      handled: true,
      replyText,
      actionTaken,
      productCreated
    };
  } catch (err: any) {
    console.error('[Admin Co-Pilot Exception]:', err);
    return {
      handled: true,
      replyText: `${copilotHeader}\nDesculpe chefe, tive uma instabilidade ao processar seu comando. Pode repetir por favor?`
    };
  }
}
