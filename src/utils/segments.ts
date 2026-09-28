export type BusinessSegment = 
  | 'FOOD'
  | 'VEHICLES'
  | 'REAL_ESTATE'
  | 'FASHION'
  | 'ELECTRONICS'
  | 'GENERAL';

export interface SegmentConfig {
  id: BusinessSegment;
  label: string;
  emoji: string;
  shortLabel: string;
  categoryDesc: string;
  catalogTitle: string;
  catalogSubtitle: string;
  itemAddLabel: string;
  itemNoun: string;
  ordersTitle: string;
  defaultWelcome: string;
  defaultPrompt: string;
  sampleItemName: string;
  sampleCategory: string;
  samplePrice: number;
  sampleDescription: string;
  deliveryTypeLabels: {
    delivery: string;
    pickup: string;
  };
}

export const SEGMENT_CONFIGS: Record<BusinessSegment, SegmentConfig> = {
  FOOD: {
    id: 'FOOD',
    label: 'Alimentação & Delivery',
    shortLabel: 'Delivery & Restaurante',
    emoji: '🍔',
    categoryDesc: 'Hamburguerias, Pizzarias, Restaurantes, Sushis, Açaí e Marmitex',
    catalogTitle: 'Cardápio & Produtos',
    catalogSubtitle: 'Cadastre os pratos, lanches, bebidas, adicionais e fotos. A IA envia os itens e fotos no WhatsApp em tempo real.',
    itemAddLabel: 'Cadastrar Item no Cardápio',
    itemNoun: 'Prato / Item',
    ordersTitle: 'Gestor de Pedidos',
    defaultWelcome: 'Olá! Seja muito bem-vindo ao {loja} 🍔! O que você gostaria de pedir hoje? Temos opções deliciosas!',
    defaultPrompt: 'Você é o atendente de Inteligência Artificial do estabelecimento "{loja}". Seu objetivo é atender os clientes de forma educada, ágil, simpática e acolhedora.\n\nApresente os itens do cardápio com foto quando pedirem (usando enviar_cardapio_com_fotos ou enviar_foto_produto). Quando o cliente escolher o que quer comer, confirme os itens, pergunte se prefere Delivery ou Retirada, endereço completo e forma de pagamento. Finalize sempre chamando registrar_pedido!',
    sampleItemName: 'X-Burger Artesanal com Bacon',
    sampleCategory: 'Hambúrgueres Artesanais',
    samplePrice: 32.90,
    sampleDescription: 'Pão brioche selado, blend artesanal 180g, queijo cheddar derretido, fatias crocantes de bacon e maionese da casa.',
    deliveryTypeLabels: {
      delivery: 'Entrega (Delivery)',
      pickup: 'Retirada no Balcão'
    }
  },
  VEHICLES: {
    id: 'VEHICLES',
    label: 'Veículos & Automotivo',
    shortLabel: 'Carros, Motos & Repasses',
    emoji: '🚗',
    categoryDesc: 'Lojas de Carros, Concessionárias, Motos, Repasses e Autopeças',
    catalogTitle: 'Catálogo de Veículos & Estoque',
    catalogSubtitle: 'Cadastre os carros, motos, fotos, ano, km, opcionais e preços. A IA envia fotos individuais e ficha técnica no WhatsApp!',
    itemAddLabel: 'Cadastrar Veículo / Carro',
    itemNoun: 'Veículo',
    ordersTitle: 'Propostas & Reservas',
    defaultWelcome: 'Olá! Seja muito bem-vindo à {loja} 🚗! Está buscando algum veículo específico (ano, modelo, valor) ou gostaria de ver nossos carros disponíveis com fotos?',
    defaultPrompt: 'Você é o consultor de vendas digital da concessionária/loja de veículos "{loja}". Seu objetivo é apresentar o estoque com entusiasmo, tirar dúvidas sobre ano, quilometragem, opcionais, câmbio, motorização e formas de pagamento.\n\nQuando o cliente demonstrar interesse em um veículo, acione a ferramenta de enviar fotos do carro (enviar_foto_produto). Pergunte se ele possui carro ou moto na troca ou se deseja simular financiamento com entrada facilitada. Convide para agendar um test-drive ou visita na loja e registre a proposta com registrar_pedido!',
    sampleItemName: 'Honda Civic 2021 EXL 2.0 Automático',
    sampleCategory: 'Sedans Premium',
    samplePrice: 119900.00,
    sampleDescription: 'Ano 2021/2021, 48.000 km originais, bancos em couro, teto solar, multimídia com CarPlay, câmera de ré. Revisões na concessionária, laudo cautelar 100% aprovado.',
    deliveryTypeLabels: {
      delivery: 'Entrega em Domicílio / Guincho',
      pickup: 'Retirada / Visita na Loja'
    }
  },
  REAL_ESTATE: {
    id: 'REAL_ESTATE',
    label: 'Imobiliária & Corretores',
    shortLabel: 'Imóveis, Aluguel & Venda',
    emoji: '🏠',
    categoryDesc: 'Imobiliárias, Corretores Autônomos, Lançamentos e Construtoras',
    catalogTitle: 'Catálogo de Imóveis',
    catalogSubtitle: 'Cadastre casas, apartamentos, terrenos, fotos e valores de aluguel ou venda. A IA envia fotos e qualifica os clientes.',
    itemAddLabel: 'Cadastrar Imóvel',
    itemNoun: 'Imóvel',
    ordersTitle: 'Leads & Agendamentos',
    defaultWelcome: 'Olá! Bem-vindo à {loja} 🏡! Você está buscando um imóvel para Alugar ou Comprar? Em qual bairro tem preferência?',
    defaultPrompt: 'Você é o consultor imobiliário virtual da imobiliária "{loja}". Atenda com extrema cordialidade e profissionalismo.\n\nDescubra o que o cliente procura: se quer comprar ou alugar, tipo de imóvel (apartamento, casa, terreno), número de quartos, vagas e faixa de orçamento. Apresente os imóveis do catálogo enviando fotos com enviar_foto_produto. Ofereça agendar uma visita presencial com nosso corretor responsável e registre o agendamento com registrar_pedido!',
    sampleItemName: 'Apartamento 3 Quartos c/ Suíte - Jardins',
    sampleCategory: 'Apartamentos Residenciais',
    samplePrice: 480000.00,
    sampleDescription: '85m² privativos, 3 quartos sendo 1 suíte, varanda gourmet com churrasqueira a carvão, 2 vagas de garagem cobertas. Condomínio com piscina aquecida, academia e portaria 24h.',
    deliveryTypeLabels: {
      delivery: 'Atendimento em Domicílio',
      pickup: 'Visita Presencial ao Imóvel'
    }
  },
  FASHION: {
    id: 'FASHION',
    label: 'Moda, Calçados & Boutique',
    shortLabel: 'Roupas, Calçados & Acessórios',
    emoji: '👗',
    categoryDesc: 'Lojas de Roupas, Boutiques, Calçados, Semijoias e Moda Praia',
    catalogTitle: 'Coleção & Catálogo',
    catalogSubtitle: 'Cadastre os looks, numerações (P, M, G / calçados), fotos, cores e valores. A IA envia fotos e tira dúvidas de caimento.',
    itemAddLabel: 'Cadastrar Peça / Look',
    itemNoun: 'Peça',
    ordersTitle: 'Pedidos & Sacola',
    defaultWelcome: 'Olá! Seja muito bem-vinda(o) à {loja} ✨👗! Está procurando alguma peça ou quer conhecer as novidades da nossa coleção?',
    defaultPrompt: 'Você é a consultora de estilo e atendimento virtual da loja de moda "{loja}". Seja atenciosa, elegante e prestativa.\n\nInforme os tamanhos disponíveis (P, M, G, GG), tecidos, cores e opções de envio (motoboy local ou Correios/transportadora). Quando pedirem para ver peças, use enviar_cardapio_com_fotos ou enviar_foto_produto para mandar as fotos reais. Monte a sacola de compras com o cliente e registre o pedido usando registrar_pedido!',
    sampleItemName: 'Vestido Midi Floral em Linho Puro',
    sampleCategory: 'Vestidos & Macacões',
    samplePrice: 189.90,
    sampleDescription: 'Confeccionado em 100% linho misto com elastano. Modelagem fluida, decote em V e cinto faixa removível. Disponível nos tamanhos P, M e G.',
    deliveryTypeLabels: {
      delivery: 'Entrega por Motoboy / Correios',
      pickup: 'Retirada na Loja Física'
    }
  },
  ELECTRONICS: {
    id: 'ELECTRONICS',
    label: 'Celulares & Eletrônicos',
    shortLabel: 'iPhones, Celulares & Tech',
    emoji: '📱',
    categoryDesc: 'Lojas de Celulares, iPhones, Assistência Técnica, Informática e Acessórios',
    catalogTitle: 'Catálogo de Aparelhos & Produtos',
    catalogSubtitle: 'Cadastre smartphones, notebooks, fones, saúde da bateria, fotos e valores. A IA responde dúvidas e envia fotos reais.',
    itemAddLabel: 'Cadastrar Aparelho / Item',
    itemNoun: 'Aparelho',
    ordersTitle: 'Pedidos & Reservas',
    defaultWelcome: 'Olá! Seja muito bem-vindo à {loja} 📱! Está buscando algum modelo de smartphone, iPhone ou acessório hoje?',
    defaultPrompt: 'Você é o especialista em tecnologia e atendimento da loja "{loja}". Tire dúvidas com precisão sobre modelos de celulares, capacidade de armazenamento (128GB, 256GB), saúde da bateria de seminovos, garantia e formas de pagamento (Pix com desconto ou até 12x no cartão).\n\nEnvie fotos reais dos aparelhos com enviar_foto_produto. Ajude o cliente a reservar ou fechar a compra com entrega rápida ou retirada!',
    sampleItemName: 'Apple iPhone 14 128GB - Meia-Noite',
    sampleCategory: 'iPhones Seminovos Premium',
    samplePrice: 3499.00,
    sampleDescription: 'Aparelho impecável sem marcas de uso. Bateria em 92% de saúde, nunca aberto, acompanha cabo original e película de vidro aplicada. 90 dias de garantia.',
    deliveryTypeLabels: {
      delivery: 'Entrega Rápida Express',
      pickup: 'Retirada na Loja / Balcão'
    }
  },
  GENERAL: {
    id: 'GENERAL',
    label: 'Comércio Geral, Varejo & Serviços',
    shortLabel: 'Comércio & Outros Nichos',
    emoji: '📦',
    categoryDesc: 'Autopeças, Mercadinhos, Materiais de Construção, Farmácias, Cosméticos e Serviços',
    catalogTitle: 'Catálogo de Produtos',
    catalogSubtitle: 'Cadastre os produtos, fotos, valores e descrições. A IA escuta áudios e tira dúvidas dos clientes no WhatsApp.',
    itemAddLabel: 'Cadastrar Produto',
    itemNoun: 'Produto',
    ordersTitle: 'Pedidos & Orçamentos',
    defaultWelcome: 'Olá! Seja muito bem-vindo à {loja} 👋! Como podemos te ajudar hoje?',
    defaultPrompt: 'Você é o atendente de Inteligência Artificial da loja "{loja}". Seu objetivo é atender com máxima simpatia, agilidade e clareza.\n\nTire dúvidas sobre disponibilidade em estoque, especificações técnicas, envie fotos dos itens quando solicitarem e monte orçamentos completos tanto por mensagem de texto quanto compreendendo mensagens de áudio dos clientes. Ao concluir, registre com registrar_pedido!',
    sampleItemName: 'Kit Manutenção & Reparo Profissional',
    sampleCategory: 'Ferramentas & Acessórios',
    samplePrice: 145.00,
    sampleDescription: 'Conjunto completo com acabamento de alta resistência e durabilidade. Pronta entrega com envio imediato.',
    deliveryTypeLabels: {
      delivery: 'Entrega / Envio',
      pickup: 'Retirada na Loja'
    }
  }
};

export const SEGMENT_OPTIONS: SegmentConfig[] = [
  SEGMENT_CONFIGS.FOOD,
  SEGMENT_CONFIGS.VEHICLES,
  SEGMENT_CONFIGS.REAL_ESTATE,
  SEGMENT_CONFIGS.FASHION,
  SEGMENT_CONFIGS.ELECTRONICS,
  SEGMENT_CONFIGS.GENERAL
];

export function getSegmentConfig(segment?: string): SegmentConfig {
  if (!segment) return SEGMENT_CONFIGS.FOOD;
  
  const normalized = segment.toUpperCase();
  if (normalized.includes('VEIC') || normalized.includes('CARRO') || normalized.includes('MOTO') || normalized.includes('AUTO')) {
    return SEGMENT_CONFIGS.VEHICLES;
  }
  if (normalized.includes('IMOB') || normalized.includes('IMOVE') || normalized.includes('CORRETOR')) {
    return SEGMENT_CONFIGS.REAL_ESTATE;
  }
  if (normalized.includes('MODA') || normalized.includes('ROUPA') || normalized.includes('CALCAD') || normalized.includes('BOUTIQUE')) {
    return SEGMENT_CONFIGS.FASHION;
  }
  if (normalized.includes('ELETRO') || normalized.includes('CELULAR') || normalized.includes('IPHONE') || normalized.includes('TECH')) {
    return SEGMENT_CONFIGS.ELECTRONICS;
  }
  if (normalized.includes('GERAL') || normalized.includes('VAREJO') || normalized.includes('OUTRO')) {
    return SEGMENT_CONFIGS.GENERAL;
  }
  if (normalized.includes('FOOD') || normalized.includes('HAMBURG') || normalized.includes('PIZZA') || normalized.includes('RESTAURANTE') || normalized.includes('LANCHE')) {
    return SEGMENT_CONFIGS.FOOD;
  }

  // Fallback to direct key if exists
  if (SEGMENT_CONFIGS[segment as BusinessSegment]) {
    return SEGMENT_CONFIGS[segment as BusinessSegment];
  }

  return SEGMENT_CONFIGS.FOOD;
}
