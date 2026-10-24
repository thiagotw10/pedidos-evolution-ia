import { Express } from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { isLegacyFoodSample } from './catalogPolicy';
import {
  TrafficAttribution,
  extractTrafficAttribution,
  sendMetaConversionEvent,
  buildTrackedCampaignLink,
  MetaCapiConfig
} from './metaCapi';

export const AUTOMOTIVE_STAGES = ['Novo contato', 'Qualificação', 'Análise técnica', 'Orçamento enviado', 'Aprovado', 'Em execução', 'Enviado', 'Concluído', 'Cancelado'];
const stages = AUTOMOTIVE_STAGES;

export interface AutomotiveConversationContext {
  customerName?: string;
  phone?: string;
  brand?: string;
  model?: string;
  year?: string;
  version?: string;
  modifications?: string;
  objective?: string;
  cep?: string;
  delivery?: string;
  references?: Array<{ id: string; name: string }>;
  referenceNames?: string[];
  summary?: string;
  leadTemperature?: 'HOT' | 'WARM' | 'COLD';
  stage?: string;
  projectId?: string;
  protocolPrefix?: string;
  interactionCount?: number;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  trafficAttribution?: TrafficAttribution | null;
  updatedAt?: string;
}

export function normalizeBrPhoneVariants(phone: string): string[] {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return [];
  const variants = new Set<string>([clean]);
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    variants.add(clean.slice(2));
  } else if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    variants.add(`55${clean}`);
  }
  return Array.from(variants);
}

const KNOWN_BRANDS: Array<{ brand: string; regex: RegExp; models?: Array<{ name: string; regex: RegExp }> }> = [
  {
    brand: 'Porsche',
    regex: /\b(porsche)\b/i,
    models: [
      { name: '911 (992)', regex: /\b(911\s*992|992)\b/i },
      { name: '911 (991)', regex: /\b(911\s*991|991)\b/i },
      { name: '911', regex: /\b(911|carrera|gt3|turbo\s*s)\b/i },
      { name: '718 Cayman', regex: /\b(718\s*cayman|cayman|gt4)\b/i },
      { name: '718 Boxster', regex: /\b(718\s*boxster|boxster)\b/i },
      { name: 'Macan', regex: /\b(macan)\b/i },
      { name: 'Cayenne', regex: /\b(cayenne)\b/i },
      { name: 'Panamera', regex: /\b(panamera)\b/i }
    ]
  },
  {
    brand: 'BMW',
    regex: /\b(bmw)\b/i,
    models: [
      { name: 'M2', regex: /\b(m2|g87|f87)\b/i },
      { name: 'M3', regex: /\b(m3|g80|f80)\b/i },
      { name: 'M4', regex: /\b(m4|g82|f82)\b/i },
      { name: 'M5', regex: /\b(m5|f90)\b/i },
      { name: 'M340i', regex: /\b(m340i?)\b/i },
      { name: '320i', regex: /\b(320i?|g20|f30)\b/i },
      { name: '330i', regex: /\b(330i?)\b/i },
      { name: 'X3 M40i', regex: /\b(x3\s*m40i?|x3m)\b/i },
      { name: 'X4 M40i', regex: /\b(x4\s*m40i?|x4m)\b/i },
      { name: 'X5', regex: /\b(x5|x5m)\b/i },
      { name: 'X6', regex: /\b(x6|x6m)\b/i },
      { name: 'Z4', regex: /\b(z4)\b/i }
    ]
  },
  {
    brand: 'Audi',
    regex: /\b(audi)\b/i,
    models: [
      { name: 'RS3', regex: /\b(rs3)\b/i },
      { name: 'RS4', regex: /\b(rs4)\b/i },
      { name: 'RS5', regex: /\b(rs5)\b/i },
      { name: 'RS6', regex: /\b(rs6)\b/i },
      { name: 'RS7', regex: /\b(rs7)\b/i },
      { name: 'RSQ8', regex: /\b(rs\s*q8|rsq8)\b/i },
      { name: 'S3', regex: /\b(s3)\b/i },
      { name: 'A3', regex: /\b(a3)\b/i },
      { name: 'A4', regex: /\b(a4)\b/i },
      { name: 'A5', regex: /\b(a5)\b/i },
      { name: 'TT RS', regex: /\b(tt\s*rs|ttrs|tt)\b/i },
      { name: 'Q3', regex: /\b(q3)\b/i },
      { name: 'Q5', regex: /\b(q5)\b/i }
    ]
  },
  {
    brand: 'Mercedes-Benz',
    regex: /\b(mercedes|amg)\b/i,
    models: [
      { name: 'A45 AMG', regex: /\b(a45)\b/i },
      { name: 'A35 AMG', regex: /\b(a35)\b/i },
      { name: 'CLA 45 AMG', regex: /\b(cla\s*45|cla45)\b/i },
      { name: 'C63 AMG', regex: /\b(c63)\b/i },
      { name: 'C43 AMG', regex: /\b(c43)\b/i },
      { name: 'C300', regex: /\b(c300)\b/i },
      { name: 'C200', regex: /\b(c200)\b/i },
      { name: 'C180', regex: /\b(c180)\b/i },
      { name: 'GLA 45 AMG', regex: /\b(gla\s*45|gla45)\b/i },
      { name: 'GLC 63 AMG', regex: /\b(glc\s*63|glc63|glc43)\b/i }
    ]
  },
  {
    brand: 'Volkswagen',
    regex: /\b(volkswagen|vw)\b/i,
    models: [
      { name: 'Golf GTI', regex: /\b(golf\s*gti|gti\s*mk7|gti)\b/i },
      { name: 'Jetta GLI', regex: /\b(jetta\s*gli|gli)\b/i },
      { name: 'Jetta TSI', regex: /\b(jetta\s*tsi|jetta)\b/i },
      { name: 'Polo GTS', regex: /\b(polo\s*gts)\b/i },
      { name: 'Virtus GTS', regex: /\b(virtus\s*gts)\b/i },
      { name: 'Amarok V6', regex: /\b(amarok\s*v6|amarok)\b/i },
      { name: 'Tiguan R-Line', regex: /\b(tiguan)\b/i },
      { name: 'Passat', regex: /\b(passat)\b/i },
      { name: 'Up TSI', regex: /\b(up\s*tsi)\b/i }
    ]
  },
  {
    brand: 'Chevrolet',
    regex: /\b(chevrolet|gm)\b/i,
    models: [
      { name: 'Camaro', regex: /\b(camaro)\b/i },
      { name: 'Corvette', regex: /\b(corvette)\b/i },
      { name: 'Cruze Turbo', regex: /\b(cruze)\b/i }
    ]
  },
  {
    brand: 'Ford',
    regex: /\b(ford)\b/i,
    models: [
      { name: 'Mustang', regex: /\b(mustang)\b/i },
      { name: 'Ranger V6 / Raptor', regex: /\b(ranger\s*raptor|ranger\s*v6|ranger)\b/i },
      { name: 'Maverick', regex: /\b(maverick)\b/i }
    ]
  },
  {
    brand: 'Honda',
    regex: /\b(honda)\b/i,
    models: [
      { name: 'Civic Type R', regex: /\b(civic\s*type\s*r|type\s*r)\b/i },
      { name: 'Civic Si', regex: /\b(civic\s*si)\b/i },
      { name: 'Civic Touring', regex: /\b(civic\s*touring|civic\s*g10|civic)\b/i }
    ]
  },
  {
    brand: 'Toyota',
    regex: /\b(toyota)\b/i,
    models: [
      { name: 'GR Corolla', regex: /\b(gr\s*corolla)\b/i },
      { name: 'Supra', regex: /\b(supra)\b/i },
      { name: 'Hilux', regex: /\b(hilux)\b/i }
    ]
  },
  {
    brand: 'RAM / Dodge',
    regex: /\b(dodge|ram)\b/i,
    models: [
      { name: 'RAM 1500', regex: /\b(ram\s*1500)\b/i },
      { name: 'RAM 2500 / 3500', regex: /\b(ram\s*2500|ram\s*3500)\b/i },
      { name: 'Rampage R/T', regex: /\b(rampage)\b/i },
      { name: 'Challenger', regex: /\b(challenger)\b/i },
      { name: 'Charger', regex: /\b(charger)\b/i }
    ]
  },
  {
    brand: 'Mitsubishi',
    regex: /\b(mitsubishi)\b/i,
    models: [
      { name: 'Lancer Evolution', regex: /\b(lancer\s*evo|evo\s*x|lancer)\b/i }
    ]
  },
  {
    brand: 'Subaru',
    regex: /\b(subaru)\b/i,
    models: [
      { name: 'WRX STI', regex: /\b(wrx|sti)\b/i }
    ]
  },
  {
    brand: 'Nissan',
    regex: /\b(nissan)\b/i,
    models: [
      { name: 'GT-R', regex: /\b(gt-?r|r35)\b/i },
      { name: '370Z / 350Z', regex: /\b(370z|350z)\b/i }
    ]
  },
  {
    brand: 'Mini',
    regex: /\b(mini\s*cooper|jcw)\b/i,
    models: [
      { name: 'Cooper S / JCW', regex: /\b(cooper\s*s|jcw|john\s*cooper)\b/i }
    ]
  },
  {
    brand: 'Fiat Abarth',
    regex: /\b(abarth)\b/i,
    models: [
      { name: 'Fastback Abarth', regex: /\b(fastback\s*abarth|fastback)\b/i },
      { name: 'Pulse Abarth', regex: /\b(pulse\s*abarth|pulse)\b/i }
    ]
  },
  {
    brand: 'Ferrari',
    regex: /\b(ferrari|458|488|f8\s*tributo|296\s*gtb)\b/i
  },
  {
    brand: 'Lamborghini',
    regex: /\b(lamborghini|huracan|urus|aventador)\b/i
  },
  {
    brand: 'McLaren',
    regex: /\b(mclaren|720s|570s|artura)\b/i
  }
];

export function extractAutomotiveContextFromText(
  text: string,
  existing?: AutomotiveConversationContext,
  catalog?: Array<{ id: string; name: string }>
): Partial<AutomotiveConversationContext> & { hasAutomotiveInterest: boolean } {
  const raw = String(text || '').trim();
  if (!raw) return { hasAutomotiveInterest: false };

  const extracted: Partial<AutomotiveConversationContext> = {};
  let hasAutomotiveInterest = false;

  // 1. Check if message is a pre-filled site protocol message
  const protocolMatch = raw.match(/protocolo\s+([a-f0-9]{8})/i);
  if (protocolMatch) {
    extracted.protocolPrefix = protocolMatch[1].toLowerCase();
    hasAutomotiveInterest = true;
  }

  const siteVehicleMatch = raw.match(/Ve[ií]culo:\s*([^\n.]+)/i);
  if (siteVehicleMatch) {
    const parts = siteVehicleMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    if (parts[0]) {
      const words = parts[0].split(/\s+/);
      extracted.brand = words[0];
      extracted.model = words.slice(1).join(' ') || parts[0];
    }
    if (parts[1] && /^\d{4}$/.test(parts[1])) extracted.year = parts[1];
    if (parts[2]) extracted.version = parts.slice(2).join(', ');
    hasAutomotiveInterest = true;
  }

  const siteObjMatch = raw.match(/Objetivo:\s*([^\n]+)/i);
  if (siteObjMatch && siteObjMatch[1].trim()) {
    extracted.objective = siteObjMatch[1].trim();
    hasAutomotiveInterest = true;
  }

  const siteModMatch = raw.match(/Modifica[çc][õo]es:\s*([^\n]+)/i);
  if (siteModMatch && siteModMatch[1].trim() && !/n[ãa]o informad/i.test(siteModMatch[1])) {
    extracted.modifications = siteModMatch[1].trim();
  }

  // 2. Extract customer name if explicitly stated in message ("meu nome é X", "sou o X", "aqui é o X")
  const nameMatch = raw.match(/(?:meu nome [eé]|me chamo|aqui [eé] o|aqui [eé] a|sou o|sou a)\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,}){0,2})/i);
  if (nameMatch && nameMatch[1]) {
    const candidateName = nameMatch[1].trim();
    if (!/^(cliente|carro|porsche|bmw|audi|golf|jetta|interessado)$/i.test(candidateName)) {
      extracted.customerName = candidateName;
    }
  }

  // 3. Extract Brand & Model from free text if not already extracted
  if (!extracted.brand || !extracted.model) {
    for (const entry of KNOWN_BRANDS) {
      if (entry.models) {
        for (const m of entry.models) {
          if (m.regex.test(raw)) {
            extracted.brand = extracted.brand || entry.brand;
            extracted.model = extracted.model || m.name;
            hasAutomotiveInterest = true;
            break;
          }
        }
      }
      if (!extracted.brand && entry.regex.test(raw)) {
        extracted.brand = entry.brand;
        hasAutomotiveInterest = true;
      }
      if (extracted.brand && extracted.model) break;
    }
  }

  // 4. Extract Year (e.g. 2015-2027)
  if (!extracted.year) {
    // Avoid matching CEP digits as year
    const withoutCep = raw.replace(/\b\d{5}-?\d{3}\b/g, '');
    const yearMatch = withoutCep.match(/\b(199\d|20[0-2]\d)\b/);
    if (yearMatch) {
      extracted.year = yearMatch[1];
    }
  }

  // 5. Extract Version / Engine details
  if (!extracted.version) {
    const versionMatches = raw.match(/\b(competition|carrera\s*s?|turbo\s*s?|gt3\s*rs?|gt3|gt4\s*rs?|gt4|gts|gti|gli|tsi|tfsi|biturbo|bi-turbo|v6|v8|v10|v12|3\.0|2\.0|4\.0|5\.0|stage\s*[123]|mk7(?:\.5)?|mk8|g80|g82|f80|f82|992|991)\b/gi);
    if (versionMatches && versionMatches.length > 0) {
      const uniqueVersions = Array.from(new Set(versionMatches.map(v => v.trim())));
      extracted.version = uniqueVersions.join(' ');
    }
  }

  // 6. Extract Modifications
  if (!extracted.modifications) {
    const modKeywords = raw.match(/\b(stage\s*[123]|remap\w*|downpipe|catback|intake|filtro\s*esportivo|turbina\s*\w+|100%\s*original|todo\s*original|carro\s*original|original|stock)\b/gi);
    if (modKeywords && modKeywords.length > 0) {
      extracted.modifications = Array.from(new Set(modKeywords.map(m => m.trim()))).join(', ');
    }
  }

  // 7. Extract CEP
  const cepMatch = raw.match(/\b(\d{5})-?(\d{3})\b/);
  if (cepMatch) {
    extracted.cep = `${cepMatch[1]}${cepMatch[2]}`;
    hasAutomotiveInterest = true;
  }

  // 8. Extract Delivery preference
  if (/\b(envio\s*nacional|transportadora|frete|enviar|mandar\s*para|despachar|correios)\b/i.test(raw) || extracted.cep) {
    extracted.delivery = 'Envio nacional';
  } else if (/\b(atendimento\s*local|instalar\s*a[ií]|levar\s*o\s*carro|na\s*oficina|presencial|ir\s*a[ií]|visita)\b/i.test(raw)) {
    extracted.delivery = 'Atendimento local';
  }

  // 9. Extract Objective / Exhaust interest keywords
  const objectiveKeywords = /\b(escapamento|downpipe|catback|axle\s*back|full\s*exhaust|valvulado|v[aá]lvula|difusor|inox|tit[aâ]nio|ponteira|ronco|pops\s*and\s*bangs|pops|barulho|som\s*esportivo|or[cç]amento|projeto|coletor|abafador|midpipe|x-pipe|h-pipe)\b/i;
  if (!extracted.objective && objectiveKeywords.test(raw)) {
    hasAutomotiveInterest = true;
    // Keep a concise description of what the user said when they talked about the objective
    if (raw.length <= 240 && !raw.startsWith('[LOCALIZAÇÃO')) {
      extracted.objective = existing?.objective
        ? (existing.objective.includes(raw) ? existing.objective : `${existing.objective} | ${raw}`)
        : raw;
    }
  }

  // 10. Match catalog references mentioned in text
  if (catalog && catalog.length > 0) {
    const lowerRaw = raw.toLowerCase();
    const matchedRefs = catalog.filter(item => {
      const nameLower = String(item.name || '').toLowerCase();
      if (!nameLower) return false;
      if (lowerRaw.includes(nameLower)) return true;
      const significantWords = nameLower.split(/\s+/).filter(w => w.length >= 4 && !['para', 'projeto', 'escapamento', 'inox', 'com'].includes(w));
      return significantWords.length > 0 && significantWords.every(w => lowerRaw.includes(w));
    });
    if (matchedRefs.length > 0) {
      extracted.references = matchedRefs.map(r => ({ id: r.id, name: r.name }));
      extracted.referenceNames = matchedRefs.map(r => r.name);
      hasAutomotiveInterest = true;
    }
  }

  // Also check if customer asked for contact/specialist/price/quote
  if (/\b(or[cç]amento|valor|pre[cç]o|quanto\s*custa|quanto\s*fica|interesse|especialista|consultor|atendente|falar\s*com|analisar)\b/i.test(raw)) {
    hasAutomotiveInterest = true;
  }

  return { ...extracted, hasAutomotiveInterest };
}

export function buildAutomotiveSummaryText(ctx: AutomotiveConversationContext): string {
  const parts: string[] = [];
  const vehicle = [ctx.brand, ctx.model, ctx.year, ctx.version].filter(Boolean).join(' ');
  if (vehicle) parts.push(`Veículo: ${vehicle}`);
  if (ctx.modifications) parts.push(`Setup/Modificações: ${ctx.modifications}`);
  if (ctx.objective) parts.push(`Objetivo: ${ctx.objective}`);
  if (ctx.delivery || ctx.cep) {
    parts.push(`Logística: ${ctx.delivery || 'A definir'}${ctx.cep ? ` (CEP: ${ctx.cep})` : ''}`);
  }
  if (ctx.references && ctx.references.length > 0) {
    parts.push(`Referências: ${ctx.references.map(r => r.name).join(', ')}`);
  } else if (ctx.referenceNames && ctx.referenceNames.length > 0) {
    parts.push(`Referências: ${ctx.referenceNames.join(', ')}`);
  }
  return parts.join(' · ') || 'Contato inicial via WhatsApp';
}

export async function saveAutomotiveContactAndSyncCrm(params: {
  db: admin.firestore.Firestore;
  establishmentId: string;
  customerPhone: string;
  customerName?: string;
  incomingText: string;
  replyText?: string;
  toolArgs?: Partial<AutomotiveConversationContext>;
  catalog?: Array<{ id: string; name: string }>;
  forceRegisterProject?: boolean;
  attribution?: TrafficAttribution | null;
}): Promise<{
  context: AutomotiveConversationContext;
  project?: any;
  isNewProject?: boolean;
  justQualified?: boolean;
}> {
  const {
    db,
    establishmentId,
    customerPhone,
    customerName,
    incomingText,
    replyText,
    toolArgs,
    catalog = [],
    forceRegisterProject = false,
    attribution = null
  } = params;

  const cleanPhone = String(customerPhone || '').replace(/\D/g, '') || customerPhone;
  const phoneVariants = normalizeBrPhoneVariants(cleanPhone);
  const nowIso = new Date().toISOString();

  const chatDocRef = db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone);
  const customerDocRef = db.collection('establishments').doc(establishmentId).collection('customers').doc(cleanPhone.replace(/\//g, '_'));

  const [chatSnap, customerSnap] = await Promise.all([
    chatDocRef.get().catch(() => null),
    customerDocRef.get().catch(() => null)
  ]);

  const existingChat = chatSnap?.data() || {};
  const existingCustomer = customerSnap?.data() || {};
  const prevCtx: AutomotiveConversationContext = {
    ...(existingCustomer.automotiveContext || {}),
    ...(existingChat.automotiveContext || {})
  };

  const heuristic = extractAutomotiveContextFromText(incomingText, prevCtx, catalog);

  const pickNonEmpty = (...values: Array<string | undefined>): string => {
    for (const v of values) {
      const trimmed = String(v || '').trim();
      if (trimmed && trimmed.toLowerCase() !== 'cliente' && trimmed.toLowerCase() !== 'cliente whatsapp' && trimmed.toLowerCase() !== 'não informado') {
        return trimmed;
      }
    }
    return '';
  };

  // Merge references from catalog + toolArgs + heuristic + previous context
  const refMap = new Map<string, { id: string; name: string }>();
  for (const r of prevCtx.references || []) {
    if (r?.name) refMap.set(r.name.toLowerCase(), { id: r.id || r.name, name: r.name });
  }
  for (const r of heuristic.references || []) {
    if (r?.name) refMap.set(r.name.toLowerCase(), { id: r.id || r.name, name: r.name });
  }
  if (toolArgs?.referenceNames && Array.isArray(toolArgs.referenceNames)) {
    for (const refName of toolArgs.referenceNames) {
      const cleanRefName = String(refName || '').trim();
      if (!cleanRefName) continue;
      const matchedCatalog = catalog.find(c =>
        c.name.toLowerCase().includes(cleanRefName.toLowerCase()) ||
        cleanRefName.toLowerCase().includes(c.name.toLowerCase())
      );
      if (matchedCatalog) {
        refMap.set(matchedCatalog.name.toLowerCase(), { id: matchedCatalog.id, name: matchedCatalog.name });
      } else {
        refMap.set(cleanRefName.toLowerCase(), { id: cleanRefName, name: cleanRefName });
      }
    }
  }

  const mergedReferences = Array.from(refMap.values()).slice(0, 20);
  const mergedCep = pickNonEmpty(toolArgs?.cep, heuristic.cep, prevCtx.cep).replace(/\D/g, '').slice(0, 8);
  const rawDelivery = pickNonEmpty(toolArgs?.delivery, heuristic.delivery, prevCtx.delivery);
  const mergedDelivery = ['Envio nacional', 'Atendimento local'].includes(rawDelivery)
    ? rawDelivery
    : (mergedCep.length === 8 ? 'Envio nacional' : (rawDelivery || 'A definir'));

  const mergedCtx: AutomotiveConversationContext = {
    customerName: pickNonEmpty(toolArgs?.customerName, heuristic.customerName, prevCtx.customerName, customerName, existingCustomer.name, existingChat.customerName) || 'Cliente WhatsApp',
    phone: cleanPhone,
    brand: pickNonEmpty(toolArgs?.brand, heuristic.brand, prevCtx.brand).slice(0, 100),
    model: pickNonEmpty(toolArgs?.model, heuristic.model, prevCtx.model).slice(0, 100),
    year: pickNonEmpty(toolArgs?.year, heuristic.year, prevCtx.year).slice(0, 20),
    version: pickNonEmpty(toolArgs?.version, heuristic.version, prevCtx.version).slice(0, 100),
    modifications: pickNonEmpty(toolArgs?.modifications, heuristic.modifications, prevCtx.modifications).slice(0, 600),
    objective: pickNonEmpty(toolArgs?.objective, heuristic.objective, prevCtx.objective).slice(0, 600),
    cep: mergedCep,
    delivery: mergedDelivery,
    references: mergedReferences,
    referenceNames: mergedReferences.map(r => r.name),
    protocolPrefix: heuristic.protocolPrefix || prevCtx.protocolPrefix || '',
    projectId: prevCtx.projectId || '',
    leadTemperature: toolArgs?.leadTemperature || prevCtx.leadTemperature || 'WARM',
    interactionCount: Number(prevCtx.interactionCount || existingCustomer.interactionCount || 0) + 1,
    lastUserMessage: String(incomingText || '').slice(0, 500),
    lastAssistantMessage: String(replyText || '').slice(0, 500),
    updatedAt: nowIso
  };

  mergedCtx.summary = pickNonEmpty(toolArgs?.summary) || buildAutomotiveSummaryText(mergedCtx);

  // Determine qualification completeness
  const hasVehicle = Boolean(mergedCtx.brand || mergedCtx.model);
  const hasCompleteSpecs = Boolean(mergedCtx.brand && mergedCtx.model && mergedCtx.year && mergedCtx.objective && (mergedCtx.delivery === 'Atendimento local' || mergedCtx.cep.length === 8));
  const shouldSyncCrm = Boolean(
    forceRegisterProject ||
    toolArgs ||
    hasVehicle ||
    mergedCtx.objective ||
    mergedCtx.cep ||
    mergedReferences.length > 0 ||
    mergedCtx.protocolPrefix ||
    mergedCtx.projectId ||
    heuristic.hasAutomotiveInterest
  );

  let syncedProject: any = null;
  let isNewProject = false;
  let justQualified = false;

  if (shouldSyncCrm) {
    try {
      // Find if there is already a project for this establishment + phone or protocolPrefix
      const existingProjectsSnap = await db.collection('automotive_projects')
        .where('establishmentId', '==', establishmentId)
        .get();

      let matchedDoc: admin.firestore.QueryDocumentSnapshot | null = null;

      for (const doc of existingProjectsSnap.docs) {
        const d = doc.data();
        if (mergedCtx.projectId && doc.id === mergedCtx.projectId) {
          matchedDoc = doc;
          break;
        }
        if (mergedCtx.protocolPrefix && doc.id.toLowerCase().startsWith(mergedCtx.protocolPrefix)) {
          matchedDoc = doc;
          break;
        }
        const docPhone = String(d.phone || '').replace(/\D/g, '');
        if (docPhone && phoneVariants.includes(docPhone)) {
          matchedDoc = doc;
          break;
        }
      }

      const computedStage = hasCompleteSpecs
        ? 'Análise técnica'
        : (hasVehicle && mergedCtx.objective ? 'Qualificação' : 'Novo contato');

      if (matchedDoc) {
        const existingData = matchedDoc.data();
        const prevStatus = existingData.status || 'Novo contato';
        // Advance stage automatically only if still in initial auto-qualification stages
        const autoUpdatableStages = ['Novo contato', 'Qualificação'];
        const nextStatus = autoUpdatableStages.includes(prevStatus) && stages.indexOf(computedStage) > stages.indexOf(prevStatus)
          ? computedStage
          : prevStatus;

        if (prevStatus !== 'Análise técnica' && nextStatus === 'Análise técnica') {
          justQualified = true;
        }

        const updatedFields: Record<string, any> = {
          customerName: mergedCtx.customerName !== 'Cliente WhatsApp' ? mergedCtx.customerName : (existingData.customerName || 'Cliente WhatsApp'),
          phone: existingData.phone || cleanPhone,
          brand: mergedCtx.brand || existingData.brand || 'A identificar',
          model: mergedCtx.model || existingData.model || 'Em qualificação no WhatsApp',
          year: mergedCtx.year || existingData.year || '',
          version: mergedCtx.version || existingData.version || '',
          modifications: mergedCtx.modifications || existingData.modifications || '',
          objective: mergedCtx.objective || existingData.objective || String(incomingText || '').slice(0, 400),
          cep: mergedCtx.cep || existingData.cep || '',
          delivery: mergedCtx.delivery !== 'A definir' ? mergedCtx.delivery : (existingData.delivery || 'A definir'),
          references: mergedReferences.length > 0 ? mergedReferences : (existingData.references || []),
          status: nextStatus,
          conversationSummary: mergedCtx.summary,
          lastMessage: String(incomingText || '').slice(0, 400),
          lastAssistantReply: String(replyText || '').slice(0, 400),
          interactionCount: mergedCtx.interactionCount,
          leadTemperature: hasCompleteSpecs ? 'HOT' : mergedCtx.leadTemperature,
          whatsappConnected: true,
          updatedAt: nowIso
        };

        if (attribution) {
          updatedFields.trafficSource = attribution.trafficSource;
          if (attribution.campaignName) updatedFields.campaignName = attribution.campaignName;
          if (attribution.adName) updatedFields.adName = attribution.adName;
          updatedFields.utmData = attribution;
        }

        await matchedDoc.ref.set(updatedFields, { merge: true });
        mergedCtx.projectId = matchedDoc.id;
        mergedCtx.stage = nextStatus;
        syncedProject = { id: matchedDoc.id, ...existingData, ...updatedFields };
      } else {
        const newId = crypto.createHash('sha256').update(`${establishmentId}:whatsapp:${cleanPhone}`).digest('hex');
        const newRef = db.collection('automotive_projects').doc(newId);
        const newProjectData = {
          id: newId,
          establishmentId,
          customerName: mergedCtx.customerName || 'Cliente WhatsApp',
          phone: cleanPhone,
          brand: mergedCtx.brand || 'A identificar',
          model: mergedCtx.model || 'Em qualificação no WhatsApp',
          year: mergedCtx.year || '',
          version: mergedCtx.version || '',
          modifications: mergedCtx.modifications || '',
          objective: mergedCtx.objective || String(incomingText || 'Interesse em projeto via WhatsApp').slice(0, 400),
          cep: mergedCtx.cep || '',
          delivery: mergedCtx.delivery || 'A definir',
          references: mergedReferences,
          status: computedStage,
          source: attribution?.trafficSource ? 'paid_traffic' : 'whatsapp_ai',
          trafficSource: attribution?.trafficSource || 'ORGANIC',
          campaignName: attribution?.campaignName || 'Contato Direto WhatsApp',
          adName: attribution?.adName || '',
          utmData: attribution || null,
          quoteValue: 0,
          commissionPercent: 4,
          commissionValue: 0,
          conversationSummary: mergedCtx.summary,
          lastMessage: String(incomingText || '').slice(0, 400),
          lastAssistantReply: String(replyText || '').slice(0, 400),
          interactionCount: mergedCtx.interactionCount,
          leadTemperature: hasCompleteSpecs ? 'HOT' : mergedCtx.leadTemperature,
          whatsappConnected: true,
          contactConsentAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        await newRef.set(newProjectData, { merge: true });
        mergedCtx.projectId = newId;
        mergedCtx.stage = computedStage;
        syncedProject = newProjectData;
        isNewProject = true;
        if (computedStage === 'Análise técnica') {
          justQualified = true;
        }
      }

      // Disparar evento Lead via Meta Conversions API (CAPI) se qualificado ou novo lead de tráfego
      if ((isNewProject && (attribution?.trafficSource === 'META_ADS' || Boolean(attribution))) || justQualified) {
        try {
          const estSnap = await db.collection('establishments').doc(establishmentId).get();
          const estData = estSnap.data() || {};
          if (estData.metaCapiEnabled && estData.metaPixelId && estData.metaApiAccessToken) {
            void sendMetaConversionEvent({
              pixelId: estData.metaPixelId,
              accessToken: estData.metaApiAccessToken,
              testEventCode: estData.metaTestEventCode,
              enabled: true
            }, {
              eventName: 'Lead',
              customerPhone: cleanPhone,
              customerName: mergedCtx.customerName,
              contentName: `${mergedCtx.brand || ''} ${mergedCtx.model || ''} - ${mergedCtx.objective || 'Escapamento/Performance'}`.trim(),
              contentCategory: 'Performance Automotiva'
            });
          }
        } catch (capiErr: any) {
          console.warn('[Meta CAPI Lead Warning]:', capiErr.message);
        }
      }
    } catch (crmErr: any) {
      console.warn('[Automotive CRM Sync Warning]:', crmErr.message);
    }
  }

  // Persist conversation context per contact and establishment in both chats/{phone} and customers/{phone}
  await Promise.all([
    chatDocRef.set({
      customerPhone: cleanPhone,
      customerName: mergedCtx.customerName,
      segment: 'AUTOMOTIVE_PARTS',
      lastMessage: replyText || incomingText,
      lastUserMessage: incomingText,
      lastTimestamp: nowIso,
      interactionCount: mergedCtx.interactionCount,
      projectId: mergedCtx.projectId || null,
      automotiveContext: mergedCtx,
      leadScore: {
        temperature: hasCompleteSpecs ? 'HOT' : (mergedCtx.leadTemperature || 'WARM'),
        readyToVisit: mergedCtx.delivery === 'Atendimento local',
        updatedAt: nowIso
      },
      updatedAt: nowIso
    }, { merge: true }).catch(() => {}),
    customerDocRef.set({
      customerPhone: cleanPhone,
      name: mergedCtx.customerName,
      segment: 'AUTOMOTIVE_PARTS',
      projectId: mergedCtx.projectId || null,
      automotiveContext: mergedCtx,
      lastInteractionAt: nowIso,
      interactionCount: mergedCtx.interactionCount,
      updatedAt: nowIso
    }, { merge: true }).catch(() => {})
  ]);

  return {
    context: mergedCtx,
    project: syncedProject,
    isNewProject,
    justQualified
  };
}

export function registerAutomotiveRoutes(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/public/automotive/:storeId/projects', async (req, res) => {
    try {
      const storeId = String(req.params.storeId);
      const store = await db.collection('establishments').doc(storeId).get();
      if (store.data()?.segment !== 'AUTOMOTIVE_PARTS') return res.status(404).json({ error: 'Projeto indisponível.' });
      const body = req.body || {}; const data: Record<string, string> = {};
      for (const key of ['customerName', 'phone', 'brand', 'model', 'year', 'version', 'modifications', 'objective', 'cep', 'delivery']) {
        if (body[key] !== undefined && typeof body[key] !== 'string') return res.status(400).json({ error: 'Dados inválidos.' });
        data[key] = (body[key] || '').trim().slice(0, key === 'objective' || key === 'modifications' ? 600 : 100);
      }
      data.phone = data.phone.replace(/\D/g, ''); data.cep = data.cep.replace(/\D/g, '');
      if (!data.customerName || !data.brand || !data.model || !data.objective || !/^\d{10,15}$/.test(data.phone) || !/^\d{4}$/.test(data.year) || !['Envio nacional', 'Atendimento local'].includes(data.delivery) || (data.delivery === 'Envio nacional' && !/^\d{8}$/.test(data.cep)) || !/^[a-f0-9-]{36}$/i.test(body.requestId || '')) return res.status(400).json({ error: 'Confira nome, veículo, ano, WhatsApp e CEP.' });
      const ids = Array.isArray(body.referenceIds) ? [...new Set(body.referenceIds)].slice(0, 20) : [];
      const catalog = await store.ref.collection('products').get();
      const references = catalog.docs.filter(d => ids.includes(d.id) && d.data().available !== false && !isLegacyFoodSample({ id: d.id, ...d.data() })).map(d => ({ id: d.id, name: String(d.data().name || '').slice(0, 200) }));
      const id = crypto.createHash('sha256').update(`${storeId}:${body.requestId}`).digest('hex');
      const ref = db.collection('automotive_projects').doc(id);
      const bucket = Math.floor(Date.now() / 3600000);
      const limitRefs = [data.phone, req.ip || 'unknown'].map(value => db.collection('automotive_rate_limits').doc(crypto.createHash('sha256').update(`${storeId}:${bucket}:${value}`).digest('hex')));
      await db.runTransaction(async tx => {
        const existing = await tx.get(ref); if (existing.exists) return;
        const limits = await Promise.all(limitRefs.map(r => tx.get(r)));
        if (limits.some(s => Number(s.data()?.count || 0) >= 10)) throw new Error('RATE_LIMIT');
        limitRefs.forEach((r, i) => tx.set(r, { count: Number(limits[i].data()?.count || 0) + 1, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 86400000) }));
        tx.create(ref, { ...data, references, establishmentId: storeId, status: stages[0], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'public_site', contactConsentAt: new Date().toISOString() });
      });
      const phone = String(store.data()?.whatsappNumber || store.data()?.phone || '').replace(/\D/g, '');
      const message = `Olá! Enviei uma solicitação pelo site (protocolo ${id.slice(0, 8)}).\nVeículo: ${data.brand} ${data.model}, ${data.year}, ${data.version}.\nObjetivo: ${data.objective}\nModificações: ${data.modifications || 'Não informadas'}\n${data.delivery} — CEP ${data.cep || 'não informado'}\nReferências: ${references.map(r => r.name).join(', ') || 'A definir'}\nGostaria de uma análise técnica e orçamento.`;
      return res.json({ id, whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '' });
    } catch (e) { return res.status(e instanceof Error && e.message === 'RATE_LIMIT' ? 429 : 500).json({ error: e instanceof Error && e.message === 'RATE_LIMIT' ? 'Limite de solicitações atingido. Tente mais tarde.' : 'Não foi possível registrar a solicitação.' }); }
  });
  app.use('/api/automotive/projects', async (req, res, next) => {
    try {
      const token = await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''));
      res.locals.uid = token.uid; next();
    } catch { res.status(401).json({ error: 'Entre novamente para acessar os projetos.' }); }
  });
  app.get('/api/automotive/projects', async (_req, res) => {
    try {
      const result = await db.collection('automotive_projects').where('establishmentId', '==', res.locals.uid).get();
      res.json(result.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))));
    } catch { res.status(500).json({ error: 'Não foi possível carregar projetos.' }); }
  });
  app.get('/api/automotive/projects/:id/conversation', async (req, res) => {
    try {
      const projectSnap = await db.collection('automotive_projects').doc(String(req.params.id)).get();
      const projectData = projectSnap.data();
      if (!projectSnap.exists || projectData?.establishmentId !== res.locals.uid) {
        return res.status(403).json({ error: 'Não foi possível acessar a conversa deste projeto.' });
      }

      const storeId = res.locals.uid;
      const phoneVariants = normalizeBrPhoneVariants(projectData?.phone || '');
      let messages: any[] = [];
      let chatContext: any = null;

      for (const candidatePhone of phoneVariants) {
        const chatDocRef = db.collection('establishments').doc(storeId).collection('chats').doc(candidatePhone);
        const chatSnap = await chatDocRef.get().catch(() => null);
        if (chatSnap && chatSnap.exists && !chatContext) {
          chatContext = chatSnap.data()?.automotiveContext || chatSnap.data() || null;
        }
        const msgsSnap = await chatDocRef.collection('messages').orderBy('timestamp', 'asc').limitToLast(40).get().catch(() => null);
        if (msgsSnap && !msgsSnap.empty) {
          messages = msgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          break;
        }
      }

      return res.json({
        projectId: projectSnap.id,
        context: chatContext,
        messages
      });
    } catch {
      return res.status(500).json({ error: 'Não foi possível carregar o histórico da conversa.' });
    }
  });
  app.patch('/api/automotive/projects/:id', async (req, res) => {
    try {
      const ref = db.collection('automotive_projects').doc(String(req.params.id));
      const allowed = [
        'customerName', 'brand', 'model', 'year', 'version', 'modifications',
        'objective', 'cep', 'delivery', 'notes', 'quote', 'quoteValue',
        'commissionPercent', 'commissionValue', 'freight', 'leadTime',
        'tracking', 'status', 'trafficSource', 'campaignName', 'adName'
      ];
      const changes: Record<string, any> = {};
      for (const key of allowed) {
        if (typeof req.body[key] === 'string') {
          changes[key] = req.body[key].slice(0, 3000);
        } else if (typeof req.body[key] === 'number') {
          changes[key] = req.body[key];
        }
      }

      // Auto-recalculate commission if quoteValue is present
      const quoteVal = Number(changes.quoteValue ?? req.body.quoteValue ?? 0);
      const commPct = Number(changes.commissionPercent ?? req.body.commissionPercent ?? 4);
      if (quoteVal > 0) {
        changes.quoteValue = quoteVal;
        changes.commissionPercent = commPct;
        changes.commissionValue = Number(((quoteVal * commPct) / 100).toFixed(2));
      }

      if (changes.status && !stages.includes(changes.status)) {
        return res.status(400).json({ error: 'Etapa inválida.' });
      }

      let previousData: any = null;
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        previousData = snap.data();
        if (previousData?.establishmentId !== res.locals.uid) throw new Error('FORBIDDEN');
        tx.update(ref, { ...changes, updatedAt: new Date().toISOString() });
      });

      // Disparar evento Purchase no Meta Conversions API (CAPI) ao aprovar/concluir o projeto
      const becomesApproved = (changes.status === 'Aprovado' || changes.status === 'Concluído') &&
                              previousData?.status !== 'Aprovado' && previousData?.status !== 'Concluído';

      if (becomesApproved) {
        try {
          const estSnap = await db.collection('establishments').doc(res.locals.uid).get();
          const estData = estSnap.data() || {};
          if (estData.metaCapiEnabled && estData.metaPixelId && estData.metaApiAccessToken) {
            const finalValue = Number(changes.quoteValue || previousData.quoteValue || 0);
            void sendMetaConversionEvent({
              pixelId: estData.metaPixelId,
              accessToken: estData.metaApiAccessToken,
              testEventCode: estData.metaTestEventCode,
              enabled: true
            }, {
              eventName: 'Purchase',
              customerPhone: previousData.phone,
              customerName: changes.customerName || previousData.customerName,
              value: finalValue > 0 ? finalValue : 1500, // fallback de valor razoável para escape
              currency: 'BRL',
              contentName: `${changes.brand || previousData.brand || ''} ${changes.model || previousData.model || ''} - ${changes.objective || previousData.objective || 'Escapamento/Performance'}`.trim(),
              contentCategory: 'Venda de Escapamento / Performance'
            });
          }
        } catch (capiErr: any) {
          console.warn('[Meta CAPI Purchase Warning]:', capiErr.message);
        }
      }

      res.json({ success: true, changes });
    } catch {
      res.status(403).json({ error: 'Não foi possível atualizar este projeto.' });
    }
  });

  // ----------------------------------------------------
  // ROTAS DE GESTÃO DE TRÁFEGO PAGO, ROI & COMISSÃO
  // ----------------------------------------------------

  // 1. Estatísticas de Tráfego Pago & Comissão
  app.get('/api/automotive/traffic/stats', async (_req, res) => {
    try {
      const storeId = res.locals.uid;
      const projectsSnap = await db.collection('automotive_projects')
        .where('establishmentId', '==', storeId)
        .get();

      const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let totalLeads = projects.length;
      let paidLeads = 0;
      let qualifiedLeads = 0;
      let quotesSent = 0;
      let closedSales = 0;
      let totalRevenue = 0;
      let totalCommission = 0;

      const campaignsMap: Record<string, {
        campaignName: string;
        leads: number;
        qualified: number;
        closed: number;
        revenue: number;
        commission: number;
      }> = {};

      for (const p of projects as any[]) {
        const isPaid = p.trafficSource === 'META_ADS' || p.trafficSource === 'GOOGLE_ADS' || p.source === 'paid_traffic';
        if (isPaid) paidLeads++;

        const isQualified = ['Análise técnica', 'Orçamento enviado', 'Aprovado', 'Em execução', 'Enviado', 'Concluído'].includes(p.status);
        if (isQualified) qualifiedLeads++;

        if (['Orçamento enviado', 'Aprovado', 'Em execução', 'Enviado', 'Concluído'].includes(p.status)) quotesSent++;

        const isClosed = ['Aprovado', 'Em execução', 'Enviado', 'Concluído'].includes(p.status);
        if (isClosed) {
          closedSales++;
          const val = Number(p.quoteValue || 0);
          totalRevenue += val;
          const comm = Number(p.commissionValue || ((val * Number(p.commissionPercent || 4)) / 100) || 0);
          totalCommission += comm;
        }

        const cName = p.campaignName || (isPaid ? 'Campanha Anúncio Meta' : 'Orgânico / Direto');
        if (!campaignsMap[cName]) {
          campaignsMap[cName] = {
            campaignName: cName,
            leads: 0,
            qualified: 0,
            closed: 0,
            revenue: 0,
            commission: 0
          };
        }
        campaignsMap[cName].leads++;
        if (isQualified) campaignsMap[cName].qualified++;
        if (isClosed) {
          campaignsMap[cName].closed++;
          const val = Number(p.quoteValue || 0);
          campaignsMap[cName].revenue += val;
          campaignsMap[cName].commission += Number(p.commissionValue || ((val * Number(p.commissionPercent || 4)) / 100) || 0);
        }
      }

      res.json({
        totalLeads,
        paidLeads,
        qualifiedLeads,
        quotesSent,
        closedSales,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2)),
        conversionRate: paidLeads > 0 ? Number(((closedSales / paidLeads) * 100).toFixed(1)) : 0,
        campaigns: Object.values(campaignsMap)
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Erro ao carregar estatísticas de tráfego.' });
    }
  });

  // 2. Configurações de Meta CAPI do Estabelecimento
  app.get('/api/automotive/traffic/config', async (_req, res) => {
    try {
      const storeId = res.locals.uid;
      const doc = await db.collection('establishments').doc(storeId).get();
      const d = doc.data() || {};
      res.json({
        metaPixelId: d.metaPixelId || '',
        metaApiAccessToken: d.metaApiAccessToken ? '••••••••' + d.metaApiAccessToken.slice(-6) : '',
        metaCapiEnabled: Boolean(d.metaCapiEnabled),
        metaTestEventCode: d.metaTestEventCode || '',
        defaultCommissionPercent: d.defaultCommissionPercent ?? 4
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/automotive/traffic/config', async (req, res) => {
    try {
      const storeId = res.locals.uid;
      const {
        metaPixelId,
        metaApiAccessToken,
        metaCapiEnabled,
        metaTestEventCode,
        defaultCommissionPercent
      } = req.body;

      const updateData: Record<string, any> = {
        metaCapiEnabled: Boolean(metaCapiEnabled),
        defaultCommissionPercent: Number(defaultCommissionPercent || 4)
      };

      if (metaPixelId !== undefined) updateData.metaPixelId = String(metaPixelId || '').trim();
      if (metaApiAccessToken && !metaApiAccessToken.includes('••••')) {
        updateData.metaApiAccessToken = String(metaApiAccessToken).trim();
      }
      if (metaTestEventCode !== undefined) updateData.metaTestEventCode = String(metaTestEventCode || '').trim();

      await db.collection('establishments').doc(storeId).set(updateData, { merge: true });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Teste de Disparo ao vivo da Meta Conversions API
  app.post('/api/automotive/traffic/test-capi', async (req, res) => {
    try {
      const storeId = res.locals.uid;
      const doc = await db.collection('establishments').doc(storeId).get();
      const d = doc.data() || {};

      const pixelId = req.body.metaPixelId || d.metaPixelId;
      const token = (req.body.metaApiAccessToken && !req.body.metaApiAccessToken.includes('••••'))
        ? req.body.metaApiAccessToken
        : d.metaApiAccessToken;
      const testCode = req.body.metaTestEventCode ?? d.metaTestEventCode;

      if (!pixelId || !token) {
        return res.status(400).json({ error: 'Preencha o Pixel ID e o Access Token antes de testar.' });
      }

      const result = await sendMetaConversionEvent({
        pixelId,
        accessToken: token,
        testEventCode: testCode,
        enabled: true
      }, {
        eventName: 'Lead',
        customerPhone: '5511999998888',
        customerName: 'Piloto Teste Performance',
        contentName: 'Downpipe Inox 304 - Teste Meta CAPI'
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, fbtrace_id: result.fbtrace_id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Gerador de Links de Anúncios Rastreados
  app.post('/api/automotive/traffic/generate-link', async (req, res) => {
    try {
      const storeId = res.locals.uid;
      const doc = await db.collection('establishments').doc(storeId).get();
      const d = doc.data() || {};

      const phone = String(d.whatsappNumber || d.phone || '').replace(/\D/g, '');
      if (!phone) {
        return res.status(400).json({ error: 'Configure o WhatsApp da sua loja nas configurações primeiro.' });
      }

      const { campaignKey, carOrProduct, offerText, customGreeting } = req.body;
      if (!campaignKey) {
        return res.status(400).json({ error: 'Informe a identificação da campanha.' });
      }

      const generated = buildTrackedCampaignLink({
        phone,
        campaignKey,
        carOrProduct,
        offerText,
        customGreeting
      });

      res.json(generated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
