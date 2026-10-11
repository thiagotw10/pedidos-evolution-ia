export interface AutomotiveTheme {
  id: string;
  name: string;
  emoji: string;
  primary: string;       // Hex
  secondary: string;     // Hex
  accent: string;        // Hex
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  glowFrom: string;
  glowVia: string;
  borderClass: string;
  badgeClass: string;
}

export const PRESET_THEMES: AutomotiveTheme[] = [
  {
    id: 'racing_orange',
    name: 'Laranja Racing / Flow',
    emoji: '🔥',
    primary: '#f97316',
    secondary: '#f59e0b',
    accent: '#fbbf24',
    gradientFrom: '#f97316',
    gradientVia: '#f59e0b',
    gradientTo: '#ea580c',
    glowFrom: 'rgba(234, 88, 12, 0.16)',
    glowVia: 'rgba(245, 158, 11, 0.06)',
    borderClass: 'border-orange-500/30',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30'
  },
  {
    id: 'scuderia_red',
    name: 'Vermelho Scuderia / Track',
    emoji: '🏎️',
    primary: '#ef4444',
    secondary: '#dc2626',
    accent: '#f87171',
    gradientFrom: '#ef4444',
    gradientVia: '#f43f5e',
    gradientTo: '#dc2626',
    glowFrom: 'rgba(239, 68, 68, 0.16)',
    glowVia: 'rgba(220, 38, 38, 0.06)',
    borderClass: 'border-red-500/30',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30'
  },
  {
    id: 'titanium_cyan',
    name: 'Azul Titânio / Akrapovič',
    emoji: '⚡',
    primary: '#06b6d4',
    secondary: '#0284c7',
    accent: '#38bdf8',
    gradientFrom: '#06b6d4',
    gradientVia: '#38bdf8',
    gradientTo: '#0284c7',
    glowFrom: 'rgba(6, 182, 212, 0.16)',
    glowVia: 'rgba(2, 132, 199, 0.06)',
    borderClass: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
  },
  {
    id: 'acid_lime',
    name: 'Verde Ácido / GT3 RS',
    emoji: '🟢',
    primary: '#84cc16',
    secondary: '#65a30d',
    accent: '#a3e635',
    gradientFrom: '#84cc16',
    gradientVia: '#a3e635',
    gradientTo: '#65a30d',
    glowFrom: 'rgba(132, 204, 22, 0.16)',
    glowVia: 'rgba(101, 163, 13, 0.06)',
    borderClass: 'border-lime-500/30',
    badgeClass: 'bg-lime-500/15 text-lime-300 border-lime-500/30'
  },
  {
    id: 'forged_bronze',
    name: 'Bronze & Ouro Forjado',
    emoji: '🏆',
    primary: '#eab308',
    secondary: '#ca8a04',
    accent: '#fde047',
    gradientFrom: '#eab308',
    gradientVia: '#facc15',
    gradientTo: '#ca8a04',
    glowFrom: 'rgba(234, 179, 8, 0.16)',
    glowVia: 'rgba(202, 138, 4, 0.06)',
    borderClass: 'border-yellow-500/30',
    badgeClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
  },
  {
    id: 'midnight_purple',
    name: 'Ultraviolet / Roxo Noite',
    emoji: '💜',
    primary: '#a855f7',
    secondary: '#9333ea',
    accent: '#c084fc',
    gradientFrom: '#a855f7',
    gradientVia: '#c084fc',
    gradientTo: '#9333ea',
    glowFrom: 'rgba(168, 85, 247, 0.16)',
    glowVia: 'rgba(147, 51, 234, 0.06)',
    borderClass: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  }
];

export function getThemeFromStore(store?: { 
  brandColor?: string; 
  themePreset?: string; 
  brandTheme?: { preset?: string; primaryColor?: string }; 
}): AutomotiveTheme {
  const defaultTheme = PRESET_THEMES[0]; // racing_orange
  if (!store) return defaultTheme;

  const presetId = store.brandTheme?.preset || store.themePreset;
  const customHex = store.brandTheme?.primaryColor || store.brandColor;

  // 1. If preset matches
  if (presetId) {
    const found = PRESET_THEMES.find(t => t.id === presetId);
    if (found) {
      if (customHex && customHex !== found.primary) {
        // Preset with custom hex override
        return {
          ...found,
          primary: customHex,
          gradientFrom: customHex,
          glowFrom: `${customHex}26`
        };
      }
      return found;
    }
  }

  // 2. If custom HEX is provided directly (Option B)
  if (customHex && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customHex)) {
    return {
      id: 'custom',
      name: 'Cor Personalizada',
      emoji: '🎨',
      primary: customHex,
      secondary: customHex,
      accent: customHex,
      gradientFrom: customHex,
      gradientVia: customHex,
      gradientTo: customHex,
      glowFrom: `${customHex}2a`,
      glowVia: `${customHex}10`,
      borderClass: 'border-white/20',
      badgeClass: 'bg-white/10 text-white border-white/20'
    };
  }

  return defaultTheme;
}
