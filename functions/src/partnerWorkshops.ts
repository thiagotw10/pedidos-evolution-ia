import { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';

export interface PartnerWorkshop {
  id?: string;
  name: string;
  city: string;
  state: string;
  country: string;
  address: string;
  phone?: string;
  whatsapp?: string;
  contactPerson?: string;
  specialties: string[];
  installationWarrantyDays: number;
  installationFeeEstimate?: string;
  discountTierB2B?: string;
  notes?: string;
  active: boolean;
  rating?: number;
  googleMapsUrl?: string;
  instagram?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PARTNER_WORKSHOPS: Omit<PartnerWorkshop, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Stuttgart Service & Performance Jardins',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
    address: 'Av. Europa, 780 - Jardins, São Paulo - SP',
    phone: '11988887701',
    whatsapp: '11988887701',
    contactPerson: 'Eduardo (Chefe de Oficina)',
    specialties: ['Porsche 911 / 718', 'BMW M', 'Audi RS', 'Dinamômetro', 'Instalação Plug&Play'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.200 a R$ 1.800',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Matriz e centro técnico credenciado Flow Garage para SP Capital e Grande SP.',
    active: true,
    rating: 4.9,
    instagram: '@stuttgartservice'
  },
  {
    name: 'Pitstop Motorsport & Exhaust Curitiba',
    city: 'Curitiba',
    state: 'PR',
    country: 'Brasil',
    address: 'Av. Batel, 1550 - Batel, Curitiba - PR',
    phone: '41999981234',
    whatsapp: '41999981234',
    contactPerson: 'Guilherme',
    specialties: ['Porsche 991/992/Cayman', 'Superesportivos', 'Escapamentos Valvulados'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.000 a R$ 1.500',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Ponto focal da Flow Garage em Curitiba e todo o Paraná. Box dedicado para instalação de escapes.',
    active: true,
    rating: 4.9,
    instagram: '@pitstopcuritiba'
  },
  {
    name: 'Barra Motorsport High Performance',
    city: 'Rio de Janeiro',
    state: 'RJ',
    country: 'Brasil',
    address: 'Av. das Américas, 4200 - Barra da Tijuca, Rio de Janeiro - RJ',
    phone: '21977775522',
    whatsapp: '21977775522',
    contactPerson: 'Rodrigo',
    specialties: ['Porsche GT3 / Carrera', 'Ferrari / McLaren', 'Inox 304 & Titânio'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.400 a R$ 2.000',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Referência no Rio de Janeiro para donos de Porsche na Barra e Zona Sul.',
    active: true,
    rating: 4.8,
    instagram: '@barramotorsport'
  },
  {
    name: 'Belo Horizonte Euro Tuners',
    city: 'Belo Horizonte',
    state: 'MG',
    country: 'Brasil',
    address: 'Av. Raja Gabaglia, 3100 - Estoril, Belo Horizonte - MG',
    phone: '31988884433',
    whatsapp: '31988884433',
    contactPerson: 'Alexandre',
    specialties: ['Porsche', 'BMW M3/M4/M5', 'Mercedes AMG', 'Stage 2 & Downpipes'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.100 a R$ 1.600',
    discountTierB2B: 'Tabela Prata (18% Margem)',
    notes: 'Centro de instalação credenciado oficial para Minas Gerais.',
    active: true,
    rating: 4.9,
    instagram: '@bheurotuners'
  },
  {
    name: 'Capital Performance BSB',
    city: 'Brasília',
    state: 'DF',
    country: 'Brasil',
    address: 'SIA Trecho 3, Lote 620 - Guará, Brasília - DF',
    phone: '61999993311',
    whatsapp: '61999993311',
    contactPerson: 'Marcos Vinicius',
    specialties: ['Porsche', 'Audi RS', 'BMW M', 'Custom Exhaust Fitting'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.200 a R$ 1.800',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Atende clientes de Brasília, Anápolis e Entorno do DF com elevador especializado.',
    active: true,
    rating: 4.8,
    instagram: '@capitalperformancebsb'
  },
  {
    name: 'Goiânia Euro Service Garage',
    city: 'Goiânia',
    state: 'GO',
    country: 'Brasil',
    address: 'Av. 85, Setor Marista - Goiânia - GO',
    phone: '62981112233',
    whatsapp: '62981112233',
    contactPerson: 'Felipe',
    specialties: ['Porsche Macan/Cayenne/911', 'Valvetronic Exhausts', 'Remap'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.000 a R$ 1.500',
    discountTierB2B: 'Tabela Prata (18% Margem)',
    notes: 'Ponto oficial de montagem para o Centro-Oeste.',
    active: true,
    rating: 4.9,
    instagram: '@goianiaeuroservice'
  },
  {
    name: 'BC Supercars Service & Tuning',
    city: 'Balneário Camboriú',
    state: 'SC',
    country: 'Brasil',
    address: 'Terceira Avenida, 1400 - Centro, Balneário Camboriú - SC',
    phone: '47992224455',
    whatsapp: '47992224455',
    contactPerson: 'Leandro',
    specialties: ['Porsche', 'Lamborghini', 'Ferrari', 'Montagem Titânio & Inox'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.500 a R$ 2.200',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Maior densidade de superesportivos do Sul do país. Atende Itajaí, BC e Florianópolis.',
    active: true,
    rating: 5.0,
    instagram: '@bcsupercars'
  },
  {
    name: 'Sul Performance Motors',
    city: 'Porto Alegre',
    state: 'RS',
    country: 'Brasil',
    address: 'Rua Mostardeiro, 800 - Moinhos de Vento, Porto Alegre - RS',
    phone: '51984446677',
    whatsapp: '51984446677',
    contactPerson: 'Cristiano',
    specialties: ['Porsche', 'BMW M', 'Downpipes & Catbacks'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.100 a R$ 1.600',
    discountTierB2B: 'Tabela Prata (18% Margem)',
    notes: 'Ponto de instalação autorizado para o Rio Grande do Sul.',
    active: true,
    rating: 4.8,
    instagram: '@sulperformance'
  },
  {
    name: 'Campinas Exhaust & Track Tech',
    city: 'Campinas',
    state: 'SP',
    country: 'Brasil',
    address: 'Av. José de Souza Campos (Norte-Sul), 1200 - Cambuí, Campinas - SP',
    phone: '19987773344',
    whatsapp: '19987773344',
    contactPerson: 'Bruno',
    specialties: ['Porsche Track Day / GT3', 'BMW M2/M3', 'Instalação Plug & Play'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.100 a R$ 1.500',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: 'Atende todo o interior paulista, Circuito das Águas e região de Paulínia/Piracicaba.',
    active: true,
    rating: 4.9,
    instagram: '@campinasexhaust'
  },
  {
    name: 'Apex German Performance Miami (Authorized US Partner)',
    city: 'Miami',
    state: 'FL',
    country: 'Estados Unidos',
    address: 'NW 36th St, Doral, FL 33166 - Miami, United States',
    phone: '+13055550199',
    whatsapp: '+13055550199',
    contactPerson: 'David Miller',
    specialties: ['Porsche 992 Carrera/Turbo/GT3', 'Valvetronic Titanium Exhausts', 'US Fitment'],
    installationWarrantyDays: 180,
    installationFeeEstimate: '$650 to $950 USD',
    discountTierB2B: 'Distributor Tier (25%)',
    notes: 'Authorized Flow Garage installation hub for Florida, US import and DHL delivery.',
    active: true,
    rating: 4.9,
    instagram: '@apexgermanmiami'
  }
];

/**
 * Builds high-density, precise RAG text to inject directly into the AI system instructions.
 */
export function buildPartnerWorkshopsRagContext(partners: PartnerWorkshop[]): string {
  if (!partners || partners.length === 0) {
    return `
REDE DE OFICINAS CREDENCIADAS FLOW GARAGE:
- Nossos sistemas de escapamento (Catback, Downpipe, Valvulado) são 100% plug & play (bolt-on), desenvolvidos em gabarito milimétrico sem cortes ou adaptações.
- O cliente pode instalar em qualquer oficina mecânica de performance de sua confiança em 2 a 3 horas com nosso guia técnico de montagem, ou nossa equipe técnica auxilia a credenciar uma oficina na cidade dele.
`;
  }

  // Group by state/region
  const byRegion: Record<string, PartnerWorkshop[]> = {};
  for (const p of partners) {
    if (!p.active) continue;
    const key = `${p.country === 'Brasil' ? p.state.toUpperCase() : p.country.toUpperCase()}`;
    if (!byRegion[key]) byRegion[key] = [];
    byRegion[key].push(p);
  }

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════',
    'REDE OFICIAL DE OFICINAS CREDENCIADAS & INSTALADORES PARCEIROS (RAG FLOW GARAGE):',
    'Use estas informações com naturalidade para eliminar o medo do cliente quanto à instalação e frete:',
    ''
  ];

  for (const [region, list] of Object.entries(byRegion)) {
    lines.push(`📍 [REGIÃO: ${region}]`);
    for (const w of list) {
      lines.push(
        `• ${w.name} (${w.city} - ${w.state}): Endereço: ${w.address}. Responsável: ${w.contactPerson || 'Consultor Técnico'}. WhatsApp/Tel: ${w.whatsapp || w.phone || 'Sob consulta'}. Especialidades: ${w.specialties.join(', ')}. Garantia de Instalação: ${w.installationWarrantyDays} dias. Estimativa Mão de Obra: ${w.installationFeeEstimate || 'Sob consulta'}.`
      );
    }
    lines.push('');
  }

  lines.push('DIRETRIZES FUNDAMENTAIS PARA A IA USAR ESTE RAG NA CONVERSA:');
  lines.push('1. QUEBRA DA OBJEÇÃO DE INSTALAÇÃO (CRÍTICO):');
  lines.push('   - Quando o cliente disser de qual cidade/estado é (ex: "sou de Curitiba", "moro no RJ", "moro em Brasília", "CEP 80420..."):');
  lines.push('   - OU quando o cliente perguntar: "Onde eu instalo?", "Tem quem instale aqui?", "Vocês são de onde?", "Tem parceiro em Goiânia?":');
  lines.push('   - CONSULTE A LISTA ACIMA IMEDIATAMENTE e cite nominalmente a oficina parceira credenciada da cidade/estado dele!');
  lines.push('   - Exemplo de resposta da IA:');
  lines.push('     "Pode ficar 100% tranquilo quanto à instalação! Em Curitiba nós temos nossa Oficina Credenciada Oficial parceira: a *Pitstop Motorsport* (no Batel). Eles são especialistas em Porsche e montam o sistema com encaixe perfeito plug & play, sem nenhuma adaptação ou corte, com garantia total! Nós despachamos o escapamento e você só leva o carro lá para montar."');
  lines.push('2. CASO A CIDADE DO CLIENTE AINDA NÃO TENHA PARCEIRO NA LISTA:');
  lines.push('   - Explique com segurança e autoridade que os sistemas da Flow Garage são desenvolvidos sob gabarito a laser milimétrico (100% bolt-on / plug and play, utilizando os coxins e pontos originais do carro).');
  lines.push('   - Qualquer oficina mecânica ou centro automotivo de confiança instala em 2 a 3 horas seguindo o manual ilustrado que acompanha o kit, sem perder garantia nem cortar chicote.');
  lines.push('   - Ofereça também conversar com a oficina de preferência dele para credenciá-la e fornecer suporte técnico direto na instalação.');
  lines.push('3. CLIENTES INTERNACIONAIS (EUA / EUROPA):');
  lines.push('   - Para clientes nos EUA, mencione nosso ponto de montagem parceiro na Flórida (*Apex German Performance Miami*) ou o envio via DHL Express com instruções completas para qualquer especialista independente em Porsche.');
  lines.push('═══════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Registers REST API endpoints for Managing Partner Workshops
 */
export function registerPartnerWorkshopEndpoints(app: Express, db: admin.firestore.Firestore) {
  // Helper to get establishmentId
  const getStoreId = (req: Request): string => {
    return (
      (req.headers['x-establishment-id'] as string) ||
      (req.query.establishmentId as string) ||
      req.body?.establishmentId ||
      'ZFFWUNspKNYKsn22kKDH6nybCWw2'
    );
  };

  // GET /api/automotive/partners
  app.get('/api/automotive/partners', async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = getStoreId(req);
      const partnersCol = db.collection('establishments').doc(storeId).collection('partnerWorkshops');
      const snap = await partnersCol.orderBy('createdAt', 'desc').get();

      // If empty, auto-seed default list once
      if (snap.empty) {
        const batch = db.batch();
        const now = new Date().toISOString();
        const seededList: PartnerWorkshop[] = [];

        for (const def of DEFAULT_PARTNER_WORKSHOPS) {
          const docRef = partnersCol.doc();
          const item: PartnerWorkshop = {
            ...def,
            id: docRef.id,
            createdAt: now,
            updatedAt: now
          };
          batch.set(docRef, item);
          seededList.push(item);
        }
        await batch.commit();
        res.json({ success: true, count: seededList.length, partners: seededList, autoSeeded: true });
        return;
      }

      const partners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ success: true, count: partners.length, partners });
    } catch (err: any) {
      console.error('Error fetching partner workshops:', err);
      res.status(500).json({ error: 'Falha ao buscar oficinas parceiras: ' + (err.message || err) });
    }
  });

  // POST /api/automotive/partners (Create or Update)
  app.post('/api/automotive/partners', async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = getStoreId(req);
      const body = req.body || {};

      if (!body.name || !body.city || !body.state) {
        res.status(400).json({ error: 'Nome da oficina, cidade e estado são obrigatórios.' });
        return;
      }

      const partnersCol = db.collection('establishments').doc(storeId).collection('partnerWorkshops');
      const docId = body.id || partnersCol.doc().id;
      const docRef = partnersCol.doc(docId);
      const now = new Date().toISOString();

      const partnerData: PartnerWorkshop = {
        id: docId,
        name: String(body.name).trim(),
        city: String(body.city).trim(),
        state: String(body.state).trim().toUpperCase(),
        country: String(body.country || 'Brasil').trim(),
        address: String(body.address || '').trim(),
        phone: String(body.phone || '').trim(),
        whatsapp: String(body.whatsapp || body.phone || '').trim(),
        contactPerson: String(body.contactPerson || '').trim(),
        specialties: Array.isArray(body.specialties) ? body.specialties : ['Porsche', 'Instalação Plug&Play'],
        installationWarrantyDays: Number(body.installationWarrantyDays || 180),
        installationFeeEstimate: String(body.installationFeeEstimate || 'R$ 1.200 a R$ 1.800').trim(),
        discountTierB2B: String(body.discountTierB2B || 'Tabela Parceiro (20% Margem)').trim(),
        notes: String(body.notes || '').trim(),
        active: body.active !== false,
        rating: Number(body.rating || 5.0),
        googleMapsUrl: body.googleMapsUrl || '',
        instagram: body.instagram || '',
        createdAt: body.createdAt || now,
        updatedAt: now
      };

      await docRef.set(partnerData, { merge: true });
      res.json({ success: true, partner: partnerData });
    } catch (err: any) {
      console.error('Error saving partner workshop:', err);
      res.status(500).json({ error: 'Erro ao salvar oficina parceira: ' + (err.message || err) });
    }
  });

  // DELETE /api/automotive/partners/:id
  app.delete('/api/automotive/partners/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = getStoreId(req);
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'ID da oficina não fornecido.' });
        return;
      }
      await db.collection('establishments').doc(storeId).collection('partnerWorkshops').doc(id).delete();
      res.json({ success: true, deletedId: id });
    } catch (err: any) {
      console.error('Error deleting partner workshop:', err);
      res.status(500).json({ error: 'Erro ao excluir parceiro: ' + (err.message || err) });
    }
  });

  // POST /api/automotive/partners/import-from-lead (Convert radar lead to partner)
  app.post('/api/automotive/partners/import-from-lead', async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = getStoreId(req);
      const { lead } = req.body;
      if (!lead || !lead.name) {
        res.status(400).json({ error: 'Dados do lead incompletos para credenciamento.' });
        return;
      }

      const partnersCol = db.collection('establishments').doc(storeId).collection('partnerWorkshops');
      const docRef = partnersCol.doc();
      const now = new Date().toISOString();

      // Extract city and state from location or address
      const loc = lead.location || '';
      const stateMatch = loc.match(/\b([A-Z]{2})\b/);
      const detectedState = stateMatch ? stateMatch[1] : 'SP';
      const cityClean = loc.replace(new RegExp(detectedState, 'g'), '').replace(/[,-]/g, '').trim() || 'São Paulo';

      const partnerData: PartnerWorkshop = {
        id: docRef.id,
        name: lead.name,
        city: cityClean,
        state: detectedState,
        country: lead.location?.toLowerCase().includes('usa') || lead.location?.toLowerCase().includes('estados unidos') ? 'Estados Unidos' : 'Brasil',
        address: lead.address || lead.location || '',
        phone: lead.phone || '',
        whatsapp: lead.whatsapp || lead.phone || '',
        contactPerson: lead.instagramHandle ? `@${lead.instagramHandle}` : 'Responsável Técnico',
        specialties: ['Porsche Tuning', 'Escapamentos Esportivos', 'Instalação Plug & Play'],
        installationWarrantyDays: 180,
        installationFeeEstimate: 'Sob consulta',
        discountTierB2B: 'Tabela Prospecção B2B (20%)',
        notes: `Importado diretamente do Radar de Leads (Maps). Score: ${lead.porscheScore || 90}/100. Pitch sugerido: ${lead.suggestedPitch || ''}`,
        active: true,
        rating: lead.rating || 4.9,
        googleMapsUrl: lead.mapsUrl || '',
        instagram: lead.instagramHandle ? `@${lead.instagramHandle}` : '',
        createdAt: now,
        updatedAt: now
      };

      await docRef.set(partnerData);
      res.json({ success: true, partner: partnerData, message: 'Oficina credenciada com sucesso e integrada ao RAG da IA!' });
    } catch (err: any) {
      console.error('Error importing lead to partner:', err);
      res.status(500).json({ error: 'Erro ao credenciar oficina: ' + (err.message || err) });
    }
  });

  // POST /api/automotive/partners/seed (Force reset / re-seed)
  app.post('/api/automotive/partners/seed', async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = getStoreId(req);
      const partnersCol = db.collection('establishments').doc(storeId).collection('partnerWorkshops');
      const batch = db.batch();
      const now = new Date().toISOString();
      const seededList: PartnerWorkshop[] = [];

      for (const def of DEFAULT_PARTNER_WORKSHOPS) {
        const docRef = partnersCol.doc();
        const item: PartnerWorkshop = {
          ...def,
          id: docRef.id,
          createdAt: now,
          updatedAt: now
        };
        batch.set(docRef, item);
        seededList.push(item);
      }
      await batch.commit();
      res.json({ success: true, count: seededList.length, partners: seededList });
    } catch (err: any) {
      console.error('Error seeding partners:', err);
      res.status(500).json({ error: 'Erro ao popular parceiros: ' + (err.message || err) });
    }
  });
}
