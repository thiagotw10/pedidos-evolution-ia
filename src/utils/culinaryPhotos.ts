/**
 * Resolves high-definition, professional culinary and retail photos (100% Free via Unsplash Global CDN)
 * Automatically matches item name, category and ingredients to high-appeal gastronomic photography.
 */

interface PhotoMapping {
  keywords: string[];
  url: string;
}

const CULINARY_MAPPINGS: PhotoMapping[] = [
  // --- PIZZAS ---
  {
    keywords: ['calabresa', 'pepperoni', 'salame'],
    url: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['frango', 'catupiry', 'frango com catupiry'],
    url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['margherita', 'marguerita', 'manjericao'],
    url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['quatro queijos', '4 queijos', 'mussarela', 'queijo', 'gorgonzola', 'provolone'],
    url: 'https://images.unsplash.com/photo-1548369937-47519962c11a?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['portuguesa', 'presunto', 'ervilha', 'ovo'],
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['pizza doce', 'chocolate', 'nutella', 'brigadeiro', 'romeu e julieta', 'banana com canela'],
    url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['pizza'],
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'
  },

  // --- HAMBÚRGUERES & SANDUÍCHES ---
  {
    keywords: ['bacon', 'x-bacon', 'bacon burger'],
    url: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['salada', 'x-salada', 'cheeseburger', 'x-burger'],
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['smash', 'duplo', 'artesanal', 'gourmet', 'monster', 'cheddar', 'x-tudo', 'duplo cheddar'],
    url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['chicken burger', 'frango empanado', 'crispy chicken', 'x-frango'],
    url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['hot dog', 'cachorro quente', 'prensadão'],
    url: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['misto', 'misto quente', 'tostex', 'sanduiche', 'beirute', 'wrap'],
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['burger', 'hamburguer', 'lanche'],
    url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=600&q=80'
  },

  // --- PORÇÕES & PETISCOS ---
  {
    keywords: ['batata frita com cheddar', 'batata frita com bacon', 'batata especial', 'fritas especial'],
    url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['batata', 'frita', 'fritas', 'batata rustica', 'batatas'],
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['coxinha', 'salgado', 'salgadinhos', 'quibe', 'kibe', 'enroladinho'],
    url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['pastel', 'pasteis'],
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['frango a passarinho', 'asa', 'wings', 'nuggets', 'empanado'],
    url: 'https://images.unsplash.com/photo-1527477321055-43615862e771?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['cebola', 'onion rings', 'aneis de cebola'],
    url: 'https://images.unsplash.com/photo-1639024471287-032f664b5849?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['isca de peixe', 'camarao', 'lula', 'frutos do mar', 'tilapia frita'],
    url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['porcao', 'petisco', 'tabua', 'calabresa acebolada', 'mandioca'],
    url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=600&q=80'
  },

  // --- BEBIDAS ---
  {
    keywords: ['coca', 'coca-cola', 'coca cola', 'refri', 'refrigerante', 'pepsi'],
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['guarana', 'fanta', 'sprite', 'soda'],
    url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['cerveja', 'chopp', 'chope', 'heineken', 'amstel', 'budweiser', 'corona', 'brahma', 'skol'],
    url: 'https://images.unsplash.com/photo-1608270111586-1d1ebc806509?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['suco de laranja', 'laranja', 'limonada', 'suco de limao', 'maracuja'],
    url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['suco', 'suco de uva', 'suco de morango', 'polpa'],
    url: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['agua', 'agua mineral', 'agua com gas', 'agua sem gas'],
    url: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['energetico', 'red bull', 'monster'],
    url: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['cafe', 'espresso', 'cappuccino', 'cafe com leite'],
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['bebida', 'drinks', 'caipirinha', 'coquetel'],
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80'
  },

  // --- PRATOS, REFEIÇÕES & ALMOÇO ---
  {
    keywords: ['feijoada', 'prato feito', 'comercial', 'pf', 'marmita', 'marmitex'],
    url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['parmegiana', 'bife', 'file', 'alcatra', 'contra file', 'milanesa'],
    url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['strogonoff', 'estrogonofe', 'frango grelhado'],
    url: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['churrasco', 'picanha', 'maminha', 'costela', 'cupim'],
    url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['espaguete', 'macarrao', 'massa', 'lasanha', 'nhoque', 'pasta', 'fettuccine', 'penne'],
    url: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281e04?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['salada', 'caesar', 'fit', 'saudavel', 'legumes'],
    url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['salmao', 'peixe', 'tilapia', 'bacalhau'],
    url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80'
  },

  // --- SOBREMESAS & AÇAÍ ---
  {
    keywords: ['acai', 'açaí', 'copo de acai', 'tigela'],
    url: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['sorvete', 'gelato', 'picolé', 'sundae'],
    url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['milk shake', 'milkshake'],
    url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['pudim', 'petit gateau', 'brownie', 'sobremesa', 'mousse'],
    url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80'
  },
  {
    keywords: ['bolo', 'torta', 'fatia'],
    url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80'
  },

  // --- JAPONÊS & ORIENTAL ---
  {
    keywords: ['sushi', 'sashimi', 'temaki', 'hot roll', 'combinado', 'yakisoba', 'poke', 'japones'],
    url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80'
  }
];

// Fallback high-class gastronomic photo
const DEFAULT_CULINARY_PHOTO = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80';

/**
 * Normalizes text for clean keyword matching (removes accents, punctuation)
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

/**
 * Returns a high-definition, appetizing food photo matching the product name or category
 */
export function getFoodPhotoForProduct(name: string, category?: string, description?: string): string {
  const combined = normalizeText(`${name} ${category || ''} ${description || ''}`);

  // 1. Check exact or compound keyword match
  for (const mapping of CULINARY_MAPPINGS) {
    for (const kw of mapping.keywords) {
      const cleanKw = normalizeText(kw);
      if (cleanKw && combined.includes(cleanKw)) {
        return mapping.url;
      }
    }
  }

  // 2. Category-based fallback
  const cat = normalizeText(category || '');
  if (cat.includes('pizza')) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80';
  }
  if (cat.includes('burger') || cat.includes('lanche')) {
    return 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=600&q=80';
  }
  if (cat.includes('bebida') || cat.includes('refrigerante') || cat.includes('cerveja')) {
    return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80';
  }
  if (cat.includes('porcao') || cat.includes('petisco') || cat.includes('salgado')) {
    return 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=600&q=80';
  }
  if (cat.includes('sobremesa') || cat.includes('doce') || cat.includes('acai')) {
    return 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80';
  }
  if (cat.includes('almoco') || cat.includes('prato') || cat.includes('marmita')) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
  }

  return DEFAULT_CULINARY_PHOTO;
}
