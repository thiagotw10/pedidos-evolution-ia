import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  MapPin,
  Clock,
  Gauge,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Car,
  MessageCircle,
  Compass,
  ArrowUpRight,
  LocateFixed,
  Search,
  ExternalLink,
  Route,
  Maximize2,
  Plus,
  Minus,
  MousePointerClick,
  Eye
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export interface DealershipRouteScrollytellingProps {
  storeName?: string;
  storeTagline?: string;
  storeAddress?: string;
  storeLatitude?: number | null;
  storeLongitude?: number | null;
  storePhone?: string;
  accentColor?: string;
  whatsappUrl?: string;
  sectionId?: string;
  featuredVehicleName?: string;
  featuredVehicleImage?: string;
  featuredVehiclePrice?: string;
  onScheduleClick?: () => void;
}

interface Coords {
  lat: number;
  lng: number;
}

interface RouteCheckpoint {
  id: string;
  step: string;
  progressThreshold: number;
  routeFraction: number;
  label: string;
  title: string;
  subtitle: string;
  badge: string;
  remainingFactor: number;
}

const CHECKPOINTS: RouteCheckpoint[] = [
  {
    id: 'origin',
    step: '01',
    progressThreshold: 0.02,
    routeFraction: 0.0,
    label: '01 / PONTO DE PARTIDA',
    title: 'Sua Localização Conectada',
    subtitle: 'Início do trajeto pelas vias reais até o endereço da loja. Clique no mapa para alterar o ponto de saída.',
    badge: 'Origem',
    remainingFactor: 1.0
  },
  {
    id: 'waypoint-1',
    step: '02',
    progressThreshold: 0.34,
    routeFraction: 0.35,
    label: '02 / TRECHO INICIAL',
    title: 'Corredor Principal da Rota',
    subtitle: 'Vias e bairros do primeiro trecho do seu deslocamento até a loja.',
    badge: 'Via Principal',
    remainingFactor: 0.65
  },
  {
    id: 'waypoint-2',
    step: '03',
    progressThreshold: 0.68,
    routeFraction: 0.70,
    label: '03 / RETA FINAL',
    title: 'Acesso Final ao Bairro',
    subtitle: 'Vias de aproximação final chegando na região do estabelecimento.',
    badge: 'Acesso Final',
    remainingFactor: 0.30
  },
  {
    id: 'destination',
    step: '04',
    progressThreshold: 0.94,
    routeFraction: 1.0,
    label: '04 / DESTINO: LOJA FÍSICA',
    title: 'Chegada à Loja Física',
    subtitle: 'Você chegou ao destino cadastrado. Chame agora no WhatsApp para atendimento direto.',
    badge: 'Destino Final',
    remainingFactor: 0.0
  }
];

const DEFAULT_FALLBACK_COORDS: Coords = { lat: -23.5614, lng: -46.6559 };

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lng) > 0.001
  );
}

function haversineMeters(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const calc =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(calc), Math.sqrt(Math.max(0, 1 - calc)));
  return R * c;
}

function computeHaversineRoadDistance(a: Coords, b: Coords): { distanceKm: number; durationMin: number } {
  const straightKm = haversineMeters(a, b) / 1000;
  const roadKm = Math.max(0.8, Number((straightKm * 1.28).toFixed(1)));
  const avgSpeedKmh = roadKm > 45 ? 72 : 34;
  const durationMin = Math.max(3, Math.round((roadKm / avgSpeedKmh) * 60));
  return { distanceKm: roadKm, durationMin };
}

// Gera uma curva suave interpolada entre origem e destino como fallback instantâneo antes do OSRM responder
function buildFallbackCurvedRoute(origin: Coords, dest: Coords, steps = 48): Coords[] {
  const pts: Coords[] = [];
  const dLat = dest.lat - origin.lat;
  const dLng = dest.lng - origin.lng;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2) * 0.12;
    pts.push({
      lat: origin.lat + dLat * t + dLng * wave,
      lng: origin.lng + dLng * t - dLat * wave
    });
  }
  return pts;
}

export const DealershipRouteScrollytelling: React.FC<DealershipRouteScrollytellingProps> = ({
  storeName = 'Showroom Veículos',
  storeTagline = 'Scrollytelling • Mapa Real Interativo até o Showroom',
  storeAddress,
  storeLatitude,
  storeLongitude,
  storePhone,
  accentColor = '#10b981',
  whatsappUrl,
  sectionId = 'como-funciona',
  featuredVehicleName,
  featuredVehicleImage,
  featuredVehiclePrice,
  onScheduleClick
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const pinContainerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const progressBarFillRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);

  // Instâncias do Leaflet (Mapa Real, Polilinhas e Marcadores)
  const leafletMapRef = useRef<L.Map | null>(null);
  const basePolylineRef = useRef<L.Polyline | null>(null);
  const activePolylineRef = useRef<L.Polyline | null>(null);
  const glowPolylineRef = useRef<L.Polyline | null>(null);
  const carMarkerRef = useRef<L.Marker | null>(null);
  const checkpointMarkersRef = useRef<L.Marker[]>([]);

  // Geometria real da rota OSRM e distâncias acumuladas para interpolação no scroll
  const routeGeometryRef = useRef<Coords[]>([]);
  const cumDistancesRef = useRef<number[]>([]);
  const totalGeomMetersRef = useRef<number>(1);
  const currentProgressRef = useRef<number>(0);

  const normalizedStoreAddress =
    storeAddress && storeAddress.trim() && storeAddress.trim() !== 'Rua Principal, 100 - Centro'
      ? storeAddress.trim()
      : storeAddress?.trim() || 'Av. Paulista, 1000 - São Paulo, SP';

  // Coordenadas da Loja (Destino)
  const [storeCoords, setStoreCoords] = useState<Coords | null>(() =>
    isValidCoordinate(storeLatitude, storeLongitude)
      ? { lat: Number(storeLatitude), lng: Number(storeLongitude) }
      : null
  );
  const [resolvedStoreAddress, setResolvedStoreAddress] = useState<string>(normalizedStoreAddress);

  // Coordenadas e Rótulo do Visitante (Origem)
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [originLabel, setOriginLabel] = useState<string>('Detectando sua localização atual...');
  const [locationSource, setLocationSource] = useState<'detecting' | 'gps' | 'cep' | 'ip' | 'map-click'>('detecting');
  const [cepInput, setCepInput] = useState<string>('');
  const [locating, setLocating] = useState<boolean>(false);
  const [locationFeedback, setLocationFeedback] = useState<string>('');

  // Telemetria e Controles de Câmera do Mapa Real
  const [baseDistanceKm, setBaseDistanceKm] = useState<number>(8.6);
  const [baseDurationMin, setBaseDurationMin] = useState<number>(16);
  const [routeEngine, setRouteEngine] = useState<'osrm' | 'gps-calc'>('gps-calc');
  const [scrollPercent, setScrollPercent] = useState<number>(0);
  const [activeCheckpointIdx, setActiveCheckpointIdx] = useState<number>(0);
  const [scrollSpeedKmh, setScrollSpeedKmh] = useState<number>(0);
  const [cameraFollowCar, setCameraFollowCar] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const cameraFollowCarRef = useRef<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  // Controle mobile: abrir gaveta de CEP/GPS e alternar entre rolar rota vs mover mapa livremente
  const [mobileOriginDrawerOpen, setMobileOriginDrawerOpen] = useState<boolean>(false);
  const [mobileFreePan, setMobileFreePan] = useState<boolean>(false);
  const mobileActiveCardRef = useRef<HTMLDivElement>(null);

  // Nomes reais das ruas e bairros intermediários nos Checkpoints 02 (35%) e 03 (70%)
  const [waypoint1Info, setWaypoint1Info] = useState<{ title: string; subtitle: string; place: string }>({
    title: 'Calculando via do 1º trecho...',
    subtitle: 'Identificando avenidas e bairros iniciais do seu trajeto.',
    place: 'Trecho 01'
  });
  const [waypoint2Info, setWaypoint2Info] = useState<{ title: string; subtitle: string; place: string }>({
    title: 'Calculando via de aproximação...',
    subtitle: 'Identificando ruas e bairro de acesso final até a loja.',
    place: 'Trecho 02'
  });

  useEffect(() => {
    cameraFollowCarRef.current = cameraFollowCar;
  }, [cameraFollowCar]);

  // Anima o card único mobile (estilo CarPlay/Waze) toda vez que o checkpoint ativo muda durante o scroll
  useEffect(() => {
    if (!mobileActiveCardRef.current) return;
    gsap.fromTo(
      mobileActiveCardRef.current,
      { autoAlpha: 0.35, y: 12, scale: 0.98 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, ease: 'power2.out', overwrite: 'auto' }
    );
  }, [activeCheckpointIdx]);

  const revealedCardsRef = useRef<boolean[]>([true, false, false, false]);

  // Interpola a posição exata [lat, lng], o ângulo do carro na rua e os pontos percorridos até `progress` (0 a 1)
  const sampleRouteAtProgress = useCallback((progress: number) => {
    const pts = routeGeometryRef.current;
    const cum = cumDistancesRef.current;
    const totalMeters = totalGeomMetersRef.current;

    if (!pts.length) {
      return {
        point: DEFAULT_FALLBACK_COORDS,
        angleDeg: 0,
        slicedLatLngs: [[DEFAULT_FALLBACK_COORDS.lat, DEFAULT_FALLBACK_COORDS.lng] as L.LatLngTuple]
      };
    }
    if (pts.length === 1 || totalMeters <= 0) {
      return {
        point: pts[0],
        angleDeg: 0,
        slicedLatLngs: [[pts[0].lat, pts[0].lng] as L.LatLngTuple]
      };
    }

    const clamped = Math.max(0, Math.min(1, progress));
    const targetDist = clamped * totalMeters;

    // Busca binária pelo segmento onde cai targetDist
    let low = 0;
    let high = cum.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (cum[mid] <= targetDist) low = mid;
      else high = mid;
    }

    const p1 = pts[low];
    const p2 = pts[high] || p1;
    const segLen = Math.max(0.0001, cum[high] - cum[low]);
    const segT = Math.max(0, Math.min(1, (targetDist - cum[low]) / segLen));

    const lat = p1.lat + (p2.lat - p1.lat) * segT;
    const lng = p1.lng + (p2.lng - p1.lng) * segT;

    // Calcula o ângulo de direção na tela (Mercator: Leste = +X, Norte = -Y)
    const lookAheadIdx = Math.min(pts.length - 1, high + 1);
    const lookBehindIdx = Math.max(0, low);
    const pAhead = pts[lookAheadIdx];
    const pBehind = pts[lookBehindIdx];
    const dX = (pAhead.lng - pBehind.lng) * Math.cos((lat * Math.PI) / 180);
    const dY = -(pAhead.lat - pBehind.lat);
    const angleDeg = Math.atan2(dY, dX) * (180 / Math.PI);

    const slicedLatLngs: L.LatLngTuple[] = [];
    for (let i = 0; i <= low; i++) {
      slicedLatLngs.push([pts[i].lat, pts[i].lng]);
    }
    slicedLatLngs.push([lat, lng]);

    return {
      point: { lat, lng },
      angleDeg,
      slicedLatLngs
    };
  }, []);

  // Atualiza a posição visual do carro e da polilinha acesa no mapa real
  const syncMapVisualsToProgress = useCallback(
    (progress: number) => {
      const { point, angleDeg, slicedLatLngs } = sampleRouteAtProgress(progress);

      if (activePolylineRef.current) {
        activePolylineRef.current.setLatLngs(slicedLatLngs);
      }
      if (glowPolylineRef.current) {
        glowPolylineRef.current.setLatLngs(slicedLatLngs);
      }
      if (carMarkerRef.current) {
        carMarkerRef.current.setLatLng([point.lat, point.lng]);
        const el = carMarkerRef.current.getElement();
        const rotatable = el?.querySelector<HTMLElement>('[data-car-rotatable]');
        if (rotatable) {
          rotatable.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
        }
      }

      if (cameraFollowCarRef.current && leafletMapRef.current) {
        leafletMapRef.current.panTo([point.lat, point.lng], { animate: false });
      }
    },
    [sampleRouteAtProgress]
  );

  // Carrega a geometria real das ruas no mapa e posiciona os 4 checkpoints nas ruas reais
  const applyRouteGeometryToMap = useCallback(
    (coordsList: Coords[], fitView = true) => {
      if (!coordsList.length) return;
      routeGeometryRef.current = coordsList;

      const cum: number[] = [0];
      let total = 0;
      for (let i = 1; i < coordsList.length; i++) {
        total += haversineMeters(coordsList[i - 1], coordsList[i]);
        cum.push(total);
      }
      cumDistancesRef.current = cum;
      totalGeomMetersRef.current = Math.max(1, total);

      const map = leafletMapRef.current;
      if (!map) return;

      const fullLatLngs: L.LatLngTuple[] = coordsList.map((c) => [c.lat, c.lng]);

      if (basePolylineRef.current) {
        basePolylineRef.current.setLatLngs(fullLatLngs);
      }

      // Atualiza a posição dos 4 marcadores de checkpoint ao longo das ruas reais da rota
      CHECKPOINTS.forEach((cp, idx) => {
        const { point } = sampleRouteAtProgress(cp.routeFraction);
        const marker = checkpointMarkersRef.current[idx];
        if (marker) {
          marker.setLatLng([point.lat, point.lng]);
        }
      });

      // Sincroniza o carro e a linha ativa com a porcentagem atual do scroll
      syncMapVisualsToProgress(currentProgressRef.current);

      if (fitView && fullLatLngs.length >= 2) {
        const bounds = L.latLngBounds(fullLatLngs);
        const isMob = window.innerWidth < 640;
        if (isMob) {
          map.fitBounds(bounds, {
            paddingTopLeft: [24, 110],
            paddingBottomRight: [24, 215],
            maxZoom: 15,
            animate: true
          });
        } else {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
        }
      }
    },
    [sampleRouteAtProgress, syncMapVisualsToProgress]
  );

  // Reverse Geocoding Nominatim para transformar um ponto clicado ou GPS em Rua/Bairro/Cidade
  const reverseGeocodeVisitor = useCallback(async (coords: Coords, source: 'gps' | 'ip' | 'map-click') => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const addr = data?.address || {};
      const road = addr.road || addr.pedestrian || addr.suburb || '';
      const neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || '';
      const city = addr.city || addr.town || addr.municipality || addr.state || '';
      const postcode = addr.postcode ? formatCep(addr.postcode) : '';

      if (postcode) {
        setCepInput(postcode);
      }

      const parts = [road, neighborhood, city].filter(Boolean);
      const uniqueParts = Array.from(new Set(parts));
      if (uniqueParts.length > 0) {
        const label = uniqueParts.slice(0, 2).join(' • ') + (postcode ? ` (${postcode})` : '');
        setOriginLabel(label);
        setLocationSource(source);
      }
    } catch {
      // Mantém o label anterior se falhar
    }
  }, []);

  // Inicializa o Mapa Real Interativo (Leaflet + CartoDB Dark Matter)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || leafletMapRef.current) return;

    const initialCenter: L.LatLngTuple = [
      storeCoords?.lat || DEFAULT_FALLBACK_COORDS.lat,
      storeCoords?.lng || DEFAULT_FALLBACK_COORDS.lng
    ];

    const isMobileViewport = window.innerWidth < 640;

    const map = L.map(container, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
      scrollWheelZoom: false, // Mantém o scroll vertical livre para o GSAP ScrollTrigger
      dragging: !isMobileViewport, // No mobile, libera o swipe vertical para conduzir o carro sem prender o dedo no mapa
      tapHold: false,
      attributionControl: false
    });

    leafletMapRef.current = map;

    // Tiles reais de ruas 100% livres de chave/marca d'água (OpenStreetMap com filtro Dark Luxury aplicado apenas nos tiles)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'scrolly-osm-dark-tiles'
    }).addTo(map);

    // 1. Polilinha guia completa (tracejada sobre as ruas reais)
    basePolylineRef.current = L.polyline([], {
      color: '#94a3b8',
      weight: 4,
      opacity: 0.4,
      dashArray: '8, 8',
      lineCap: 'round'
    }).addTo(map);

    // 2. Polilinha de brilho (glow) da rota percorrida
    glowPolylineRef.current = L.polyline([], {
      color: accentColor,
      weight: 12,
      opacity: 0.28,
      lineCap: 'round'
    }).addTo(map);

    // 3. Polilinha principal acesa conforme o scroll avança
    activePolylineRef.current = L.polyline([], {
      color: accentColor,
      weight: 5,
      opacity: 1,
      lineCap: 'round'
    }).addTo(map);

    // 4. Marcadores dos 4 Checkpoints sobre as ruas reais
    checkpointMarkersRef.current = CHECKPOINTS.map((cp, idx) => {
      const isDest = idx === CHECKPOINTS.length - 1;
      const icon = L.divIcon({
        className: 'scrolly-cp-marker',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `
          <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <span style="position:absolute;inset:0;border-radius:9999px;border:2px solid ${accentColor};opacity:${isDest ? '0.65' : '0.35'};animation:ping 2.2s cubic-bezier(0,0,0.2,1) infinite;"></span>
            <div style="position:relative;width:${isDest ? '28px' : '24px'};height:${isDest ? '28px' : '24px'};border-radius:9999px;background:${idx === 0 || isDest ? accentColor : '#0f172a'};color:${idx === 0 || isDest ? '#05060a' : '#f8fafc'};border:2px solid #ffffff;font-family:monospace;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,0.65);">
              ${cp.step}
            </div>
          </div>
        `
      });

      const marker = L.marker(initialCenter, { icon }).addTo(map);
      marker.on('click', () => {
        const st = scrollTriggerRef.current;
        if (st) {
          const targetScroll = st.start + (st.end - st.start) * Math.min(0.99, cp.progressThreshold + 0.02);
          window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
      });
      return marker;
    });

    // 5. Marcador do Carro Top-Down (gira na direção exata da rua!)
    const carIcon = L.divIcon({
      className: 'scrolly-car-marker',
      iconSize: [56, 56],
      iconAnchor: [28, 28],
      html: `
        <div data-car-rotatable style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;transition:transform 60ms linear;will-change:transform;">
          <svg width="56" height="56" viewBox="-28 -28 56 56" style="overflow:visible;filter:drop-shadow(0 6px 12px rgba(0,0,0,0.85));">
            <polygon points="10,-6 48,-20 48,20 10,6" fill="${accentColor}" opacity="0.32" />
            <rect x="-16" y="-8.5" width="32" height="17" rx="5.5" fill="#f8fafc" stroke="${accentColor}" stroke-width="2" />
            <path d="M -8 -6 L 6 -6 L 10 -4.5 L 10 4.5 L 6 6 L -8 6 Z" fill="#0f172a" />
            <polygon points="1,-5 7,-4 7,4 1,5" fill="#38bdf8" opacity="0.7" />
            <line x1="-14" y1="0" x2="14" y2="0" stroke="${accentColor}" stroke-width="1.4" />
            <rect x="-16" y="-6.5" width="2" height="4" rx="0.8" fill="#ef4444" />
            <rect x="-16" y="2.5" width="2" height="4" rx="0.8" fill="#ef4444" />
            <rect x="14" y="-6.5" width="2" height="4" rx="0.8" fill="#ffffff" />
            <rect x="14" y="2.5" width="2" height="4" rx="0.8" fill="#ffffff" />
          </svg>
        </div>
      `
    });

    carMarkerRef.current = L.marker(initialCenter, {
      icon: carIcon,
      zIndexOffset: 1000
    }).addTo(map);

    // 6. Permite que o visitante clique em qualquer rua do mapa para definir seu ponto de partida!
    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickedCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
      setUserCoords(clickedCoords);
      setLocationSource('map-click');
      setOriginLabel(`Ponto marcado no mapa (${clickedCoords.lat.toFixed(4)}, ${clickedCoords.lng.toFixed(4)})`);
      setLocationFeedback('Ponto de partida atualizado direto no mapa! Role para percorrer a nova rota.');
      reverseGeocodeVisitor(clickedCoords, 'map-click');
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      leafletMapRef.current = null;
    };
  }, [accentColor, reverseGeocodeVisitor]);

  // 1. RESOLUÇÃO DO ENDEREÇO CADASTRADO DA LOJA NA PLATAFORMA
  useEffect(() => {
    setResolvedStoreAddress(normalizedStoreAddress);

    if (isValidCoordinate(storeLatitude, storeLongitude)) {
      setStoreCoords({ lat: Number(storeLatitude), lng: Number(storeLongitude) });
      return;
    }

    const addrToGeocode = storeAddress?.trim();
    if (!addrToGeocode || addrToGeocode.length < 4) {
      setStoreCoords(DEFAULT_FALLBACK_COORDS);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(addrToGeocode)}`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (!cancelled && Array.isArray(nomData) && nomData.length > 0) {
            const lat = parseFloat(nomData[0].lat);
            const lon = parseFloat(nomData[0].lon);
            if (isValidCoordinate(lat, lon)) {
              setStoreCoords({ lat, lng: lon });
              return;
            }
          }
        }

        const apiRes = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addrToGeocode })
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (!cancelled && isValidCoordinate(apiData.latitude, apiData.longitude)) {
            setStoreCoords({ lat: Number(apiData.latitude), lng: Number(apiData.longitude) });
            return;
          }
        }
      } catch {
        // Fallback
      }
      if (!cancelled) {
        setStoreCoords((prev) => prev || DEFAULT_FALLBACK_COORDS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeAddress, storeLatitude, storeLongitude, normalizedStoreAddress]);

  // 2. BUSCA DA ROTA REAL EM RUAS (OSRM GEOJSON + STEPS) E BAIRROS INTERMEDIÁRIOS
  const enrichWaypointNeighborhood = useCallback(
    async (coords: Coords, fallbackStreet: string, setter: React.Dispatch<React.SetStateAction<{ title: string; subtitle: string; place: string }>>, stageLabel: string) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=16&addressdetails=1`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const addr = data?.address || {};
        const road = fallbackStreet || addr.road || addr.pedestrian || '';
        const suburb = addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.city || '';
        const city = addr.city || addr.town || addr.municipality || '';

        const mainTitle = [road, suburb].filter(Boolean).join(' • ') || road || suburb || stageLabel;
        const placeTag = suburb || city || road || stageLabel;
        const subText = [
          road ? `Seguindo por ${road}` : '',
          suburb ? `Bairro/Região: ${suburb}` : '',
          city ? city : ''
        ]
          .filter(Boolean)
          .join(' • ');

        setter({
          title: mainTitle,
          subtitle: subText || `Passando pela região de ${mainTitle} no trajeto até o destino.`,
          place: placeTag
        });
      } catch {
        // Mantém os dados extraídos dos steps do OSRM
      }
    },
    []
  );

  const calculateRealRoute = useCallback(
    async (origin: Coords, destination: Coords) => {
      // Aplica curva inicial imediata enquanto o OSRM carrega as ruas reais
      const fallbackMetrics = computeHaversineRoadDistance(origin, destination);
      setBaseDistanceKm(fallbackMetrics.distanceKm);
      setBaseDurationMin(fallbackMetrics.durationMin);
      const initialCurve = buildFallbackCurvedRoute(origin, destination);
      applyRouteGeometryToMap(initialCurve, true);

      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(osrmUrl);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          const route = data.routes[0];
          const realKm = Math.max(0.4, Number((route.distance / 1000).toFixed(1)));
          const realMin = Math.max(2, Math.round(route.duration / 60));
          setBaseDistanceKm(realKm);
          setBaseDurationMin(realMin);
          setRouteEngine('osrm');

          const rawCoords: [number, number][] = route.geometry?.coordinates || [];
          if (rawCoords.length >= 2) {
            const streetCoords: Coords[] = rawCoords.map(([lng, lat]) => ({ lat, lng }));
            applyRouteGeometryToMap(streetCoords, true);
          }

          // Extrai os nomes das ruas e avenidas reais dos steps do OSRM em ~35% e ~70% do caminho
          const steps: any[] = route.legs?.[0]?.steps || [];
          const namedSteps = steps
            .map((s) => ({
              name: String(s.name || s.ref || '').trim(),
              distance: Number(s.distance || 0)
            }))
            .filter((s) => s.name.length > 1);

          let streetAt35 = '';
          let streetAt70 = '';

          if (namedSteps.length > 0) {
            const totalNamedDist = namedSteps.reduce((acc, s) => acc + s.distance, 0) || 1;
            let acc = 0;
            for (const s of namedSteps) {
              acc += s.distance;
              const frac = acc / totalNamedDist;
              if (!streetAt35 && frac >= 0.25) streetAt35 = s.name;
              if (!streetAt70 && frac >= 0.65) streetAt70 = s.name;
            }
            if (!streetAt35) streetAt35 = namedSteps[0].name;
            if (!streetAt70) streetAt70 = namedSteps[Math.min(namedSteps.length - 1, Math.floor(namedSteps.length * 0.7))].name;
          }

          // Coleta uma lista resumida das principais vias do trecho 1 e trecho 2
          const uniqueStreetNames = Array.from(new Set(namedSteps.map((s) => s.name)));
          const firstHalfStreets = uniqueStreetNames.slice(0, 3).join(' → ');
          const secondHalfStreets = uniqueStreetNames.slice(Math.max(0, Math.floor(uniqueStreetNames.length / 2)), Math.floor(uniqueStreetNames.length / 2) + 3).join(' → ');

          if (streetAt35) {
            setWaypoint1Info({
              title: `Via ${streetAt35}`,
              subtitle: firstHalfStreets ? `Corredor: ${firstHalfStreets}` : `Passando por ${streetAt35}`,
              place: streetAt35
            });
          }
          if (streetAt70) {
            setWaypoint2Info({
              title: `Via ${streetAt70}`,
              subtitle: secondHalfStreets ? `Acesso: ${secondHalfStreets}` : `Aproximação por ${streetAt70}`,
              place: streetAt70
            });
          }

          // Enriquecimento com o nome do Bairro real em 35% e 70% da rota via Nominatim
          const pt35 = sampleRouteAtProgress(0.35).point;
          const pt70 = sampleRouteAtProgress(0.70).point;
          enrichWaypointNeighborhood(pt35, streetAt35, setWaypoint1Info, '1º Trecho da Rota');
          enrichWaypointNeighborhood(pt70, streetAt70, setWaypoint2Info, 'Acesso Final');
        }
      } catch {
        setRouteEngine('gps-calc');
      }
    },
    [applyRouteGeometryToMap, enrichWaypointNeighborhood, sampleRouteAtProgress]
  );

  useEffect(() => {
    if (userCoords && storeCoords) {
      calculateRealRoute(userCoords, storeCoords);
    }
  }, [userCoords, storeCoords, calculateRealRoute]);

  // 3. DETECÇÃO AUTOMÁTICA DA LOCALIZAÇÃO DO VISITANTE (GPS + IP FALLBACK)
  useEffect(() => {
    let isMounted = true;
    let gpsResolved = false;

    const fetchIpLocation = async () => {
      try {
        const res = await fetch('https://ipwho.is/');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && !gpsResolved && data?.success !== false && isValidCoordinate(data.latitude, data.longitude)) {
            const coords = { lat: Number(data.latitude), lng: Number(data.longitude) };
            setUserCoords(coords);
            const cityLabel = [data.city, data.region_code || data.region].filter(Boolean).join(', ');
            setOriginLabel(cityLabel ? `${cityLabel} (Sua Região Atual)` : 'Localização Detectada');
            setLocationSource('ip');
            if (data.postal) setCepInput((prev) => prev || formatCep(String(data.postal)));
            return;
          }
        }
      } catch {
        // Fallback para geojs
      }

      try {
        const res2 = await fetch('https://get.geojs.io/v1/ip/geo.json');
        if (res2.ok) {
          const data2 = await res2.json();
          const lat = parseFloat(data2.latitude);
          const lng = parseFloat(data2.longitude);
          if (isMounted && !gpsResolved && isValidCoordinate(lat, lng)) {
            setUserCoords({ lat, lng });
            const cityLabel = [data2.city, data2.region].filter(Boolean).join(', ');
            setOriginLabel(cityLabel ? `${cityLabel} (Sua Região Atual)` : 'Localização Detectada');
            setLocationSource('ip');
          }
        }
      } catch {
        if (isMounted && !gpsResolved) {
          setUserCoords({ lat: -23.5874, lng: -46.6576 });
          setOriginLabel('Informe seu CEP, ative o GPS ou clique no mapa');
        }
      }
    };

    fetchIpLocation();

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          gpsResolved = true;
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          setLocationSource('gps');
          setOriginLabel(`Seu GPS Exato (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
          reverseGeocodeVisitor(coords, 'gps');
        },
        () => {
          // Mantém IP ou clique no mapa
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }

    return () => {
      isMounted = false;
    };
  }, [reverseGeocodeVisitor]);

  const handleUseGeolocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationFeedback('Geolocalização não suportada neste navegador. Digite seu CEP ou clique no mapa.');
      return;
    }
    setLocating(true);
    setLocationFeedback('Capturando satélites GPS...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setLocationSource('gps');
        setOriginLabel(`GPS Exato (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
        await reverseGeocodeVisitor(coords, 'gps');
        setLocating(false);
        setLocationFeedback('Rota atualizada no mapa real com seu GPS!');
      },
      () => {
        setLocating(false);
        setLocationFeedback('Permissão de GPS bloqueada. Clique direto na sua rua no mapa ou digite seu CEP!');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const lookupCepAndRoute = useCallback(
    async (rawCep: string) => {
      const clean = rawCep.replace(/\D/g, '');
      if (clean.length < 8) {
        setLocationFeedback('Digite os 8 números do seu CEP.');
        return;
      }
      setLocating(true);
      setLocationFeedback('Buscando rua do CEP e traçando rota real no mapa...');
      try {
        const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await response.json();
        if (data && !data.erro) {
          const streetPart = data.logradouro ? `${data.logradouro}` : '';
          const districtPart = data.bairro || '';
          const cityPart = data.localidade ? `${data.localidade}/${data.uf}` : '';
          const formattedPlace =
            [streetPart || districtPart, cityPart].filter(Boolean).join(' • ') || `CEP ${formatCep(clean)}`;

          setOriginLabel(`${formattedPlace} (${formatCep(clean)})`);
          setLocationSource('cep');

          const query = [data.logradouro, data.bairro, data.localidade, data.uf, 'Brasil']
            .filter(Boolean)
            .join(', ');
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`,
            { headers: { 'Accept-Language': 'pt-BR' } }
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (Array.isArray(geoData) && geoData.length > 0) {
              const lat = parseFloat(geoData[0].lat);
              const lng = parseFloat(geoData[0].lon);
              if (isValidCoordinate(lat, lng)) {
                setUserCoords({ lat, lng });
                setLocationFeedback(`Rota real traçada no mapa de ${formattedPlace} até ${storeName}!`);
                setLocating(false);
                return;
              }
            }
          }

          if (data.localidade && data.uf) {
            const cityQuery = `${data.bairro ? data.bairro + ', ' : ''}${data.localidade}, ${data.uf}, Brasil`;
            const cityGeoRes = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(cityQuery)}`,
              { headers: { 'Accept-Language': 'pt-BR' } }
            );
            if (cityGeoRes.ok) {
              const cityGeoData = await cityGeoRes.json();
              if (Array.isArray(cityGeoData) && cityGeoData.length > 0) {
                const lat = parseFloat(cityGeoData[0].lat);
                const lng = parseFloat(cityGeoData[0].lon);
                if (isValidCoordinate(lat, lng)) {
                  setUserCoords({ lat, lng });
                  setLocationFeedback(`Rota real traçada no mapa de ${formattedPlace} até ${storeName}!`);
                  setLocating(false);
                  return;
                }
              }
            }
          }
        } else {
          setLocationFeedback('CEP não encontrado. Você também pode clicar direto no mapa!');
        }
      } catch {
        setLocationFeedback('Erro ao buscar CEP. Clique direto no mapa para definir sua origem!');
      } finally {
        setLocating(false);
      }
    },
    [storeName]
  );

  // 4. GSAP SCROLLTRIGGER (pin: true) VINCULADO AO CARRO NAS RUAS REAIS DO MAPA
  useEffect(() => {
    const sectionEl = sectionRef.current;
    const pinEl = pinContainerRef.current;
    if (!sectionEl || !pinEl) return;

    const ctx = gsap.context(() => {
      cardRefs.current.forEach((card, idx) => {
        if (!card) return;
        if (idx === 0) {
          gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
        } else {
          gsap.set(card, { autoAlpha: 0.16, y: 24, scale: 0.96 });
        }
      });

      const updateRouteByProgress = (progress: number) => {
        const clamped = Math.max(0, Math.min(1, progress));
        currentProgressRef.current = clamped;

        // Move o carro e desenha a linha acesa nas ruas reais do mapa Leaflet
        syncMapVisualsToProgress(clamped);

        if (progressBarFillRef.current) {
          progressBarFillRef.current.style.width = `${(clamped * 100).toFixed(1)}%`;
        }

        let highestReached = 0;
        CHECKPOINTS.forEach((cp, idx) => {
          const reached = clamped >= cp.progressThreshold || idx === 0;
          if (reached) highestReached = idx;

          const cardEl = cardRefs.current[idx];
          if (reached && !revealedCardsRef.current[idx]) {
            revealedCardsRef.current[idx] = true;
            if (cardEl) {
              gsap.to(cardEl, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.48,
                ease: 'power3.out',
                overwrite: 'auto'
              });
            }
          } else if (!reached && revealedCardsRef.current[idx] && idx !== 0) {
            revealedCardsRef.current[idx] = false;
            if (cardEl) {
              gsap.to(cardEl, {
                autoAlpha: 0.16,
                y: 24,
                scale: 0.96,
                duration: 0.35,
                ease: 'power2.inOut',
                overwrite: 'auto'
              });
            }
          }
        });

        setScrollPercent(Math.round(clamped * 100));
        setActiveCheckpointIdx(highestReached);
      };

      scrollTriggerRef.current = ScrollTrigger.create({
        trigger: sectionEl,
        pin: pinEl,
        pinSpacing: true,
        invalidateOnRefresh: true,
        start: 'top top',
        end: '+=260%',
        scrub: 0.45,
        anticipatePin: 1,
        onUpdate: (self) => {
          updateRouteByProgress(self.progress);
        }
      });

      // Atualiza as posições do ScrollTrigger caso cenas 3D ou imagens acima da seção mudem a altura da página
      let refreshTimer: number | undefined;
      const bodyResizeObserver = new ResizeObserver(() => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          ScrollTrigger.refresh();
        }, 180);
      });
      bodyResizeObserver.observe(document.body);

      let lastScrollY = window.scrollY;
      let currentSpeed = 0;
      const speedTicker = (_time: number, deltaTime: number) => {
        const nowScrollY = window.scrollY;
        const dt = Math.max(8, deltaTime) / 1000;
        const isPinnedActive = scrollTriggerRef.current?.isActive;

        let targetSpeed = 0;
        if (isPinnedActive) {
          const rawPxPerSec = Math.abs(nowScrollY - lastScrollY) / dt;
          targetSpeed = Math.min(124, rawPxPerSec / 17);
        }

        const lerpFactor = targetSpeed > currentSpeed ? 0.16 : 0.08;
        currentSpeed += (targetSpeed - currentSpeed) * lerpFactor;
        if (currentSpeed < 0.6 && targetSpeed === 0) currentSpeed = 0;

        setScrollSpeedKmh(Math.round(currentSpeed));
        lastScrollY = nowScrollY;
      };

      gsap.ticker.add(speedTicker);

      return () => {
        window.clearTimeout(refreshTimer);
        bodyResizeObserver.disconnect();
        gsap.ticker.remove(speedTicker);
      };
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, [syncMapVisualsToProgress]);

  const progressFraction = scrollPercent / 100;
  const remainingKm = Math.max(0, baseDistanceKm * (1 - progressFraction)).toFixed(1).replace('.', ',');
  const remainingMin = Math.max(0, Math.ceil(baseDurationMin * (1 - progressFraction)));

  const jumpToCheckpoint = (cp: RouteCheckpoint, idx: number) => {
    const st = scrollTriggerRef.current;
    if (st) {
      const targetScroll = st.start + (st.end - st.start) * Math.min(0.99, cp.progressThreshold + 0.03);
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    } else {
      setActiveCheckpointIdx(idx);
      setScrollPercent(Math.round(cp.progressThreshold * 100));
    }
  };

  const handleFitFullRoute = () => {
    const map = leafletMapRef.current;
    const pts = routeGeometryRef.current;
    if (!map || pts.length < 2) return;
    setCameraFollowCar(false);
    const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    if (window.innerWidth < 640) {
      map.fitBounds(bounds, {
        paddingTopLeft: [24, 110],
        paddingBottomRight: [24, 215],
        maxZoom: 15,
        animate: true
      });
    } else {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
    }
  };

  const toggleMobileFreePan = () => {
    const map = leafletMapRef.current;
    const next = !mobileFreePan;
    setMobileFreePan(next);
    if (map) {
      if (next) {
        map.dragging.enable();
        setCameraFollowCar(false);
      } else {
        map.dragging.disable();
        setCameraFollowCar(true);
        syncMapVisualsToProgress(currentProgressRef.current);
      }
    }
  };

  const handleZoom = (delta: number) => {
    const map = leafletMapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + delta);
  };

  const googleMapsUrl = (() => {
    const destParam = isValidCoordinate(storeCoords?.lat, storeCoords?.lng)
      ? `${storeCoords!.lat},${storeCoords!.lng}`
      : encodeURIComponent(`${storeName} ${resolvedStoreAddress}`);
    const originParam = isValidCoordinate(userCoords?.lat, userCoords?.lng)
      ? `&origin=${userCoords!.lat},${userCoords!.lng}`
      : '';
    return `https://www.google.com/maps/dir/?api=1&destination=${destParam}${originParam}`;
  })();

  const wazeUrl = isValidCoordinate(storeCoords?.lat, storeCoords?.lng)
    ? `https://waze.com/ul?ll=${storeCoords!.lat},${storeCoords!.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(resolvedStoreAddress)}&navigate=yes`;

  const cleanPhone = (storePhone || '').replace(/\D/g, '');
  const waNumber = cleanPhone.startsWith('55') ? cleanPhone : cleanPhone ? `55${cleanPhone}` : '';
  const dynamicWhatsappUrl = (() => {
    if (whatsappUrl && !waNumber) return whatsappUrl;
    if (!waNumber) return whatsappUrl;
    const itemPart = featuredVehicleName ? ` (referência: *${featuredVehicleName}*)` : '';
    const msg = `Olá! Estou no site da *${storeName}*${itemPart}.\n\n📍 Minha localização: ${originLabel}\n🏁 Distância até a loja (${resolvedStoreAddress}): ~${baseDistanceKm.toFixed(1).replace('.', ',')} km (~${baseDurationMin} min)\n\nGostaria de tirar dúvidas e agendar uma visita!`;
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <section
      ref={sectionRef}
      id={sectionId}
      aria-label="Mapa real interativo até a loja física"
      className="relative z-10 w-full bg-[#05060a] text-slate-100 border-y border-white/10 select-none clear-both"
      style={{ '--scrolly-accent': accentColor, isolation: 'isolate' } as React.CSSProperties}
    >
      <div
        ref={pinContainerRef}
        className="relative w-full h-[100svh] max-h-[100svh] overflow-hidden flex flex-col justify-between p-0 sm:py-5 sm:px-6 lg:px-12 max-w-[1720px] mx-auto box-border"
      >
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[860px] h-[380px] rounded-full blur-[150px] opacity-15"
          style={{ backgroundColor: accentColor }}
        />

        {/* 1. CABEÇALHO EDITORIAL + BUSCA DE CEP / GPS (VISÍVEL EM TABLET/DESKTOP; NO MOBILE FICA FLUTUANTE E IMERSIVO SOBRE O MAPA) */}
        <div className="hidden sm:flex relative z-10 shrink-0 flex-col lg:flex-row lg:items-end justify-between gap-2.5 pb-2.5 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10"
                style={{ color: accentColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
                {storeTagline}
              </span>

              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/10 text-slate-300">
                <Route className="w-3 h-3" style={{ color: accentColor }} />
                {locationSource === 'gps'
                  ? 'GPS de Alta Precisão Ativo'
                  : locationSource === 'map-click'
                  ? 'Origem Marcada Direto no Mapa'
                  : locationSource === 'cep'
                  ? 'CEP Verificado via ViaCEP'
                  : 'Localização Detectada Automaticamente'}
                {routeEngine === 'osrm' ? ' • Ruas Reais OSRM' : ''}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                Mapa Interativo até <span style={{ color: accentColor }}>{storeName}</span>
              </h2>
              <span className="text-[11px] text-slate-400 truncate max-w-md">
                📍 <strong className="text-slate-200">Loja Física:</strong> {resolvedStoreAddress}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookupCepAndRoute(cepInput);
              }}
              className="flex flex-wrap items-center gap-1.5"
            >
              <div className="relative flex items-center">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={cepInput}
                  onChange={(e) => {
                    const formatted = formatCep(e.target.value);
                    setCepInput(formatted);
                    if (formatted.replace(/\D/g, '').length === 8) {
                      lookupCepAndRoute(formatted);
                    }
                  }}
                  placeholder="Seu CEP (00000-000)"
                  aria-label="CEP de origem"
                  className="pl-8 pr-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/15 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-white/40 w-36 sm:w-40 transition"
                />
              </div>

              <button
                type="submit"
                disabled={locating}
                className="px-3 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" style={{ color: accentColor }} />
                <span>Traçar CEP</span>
              </button>

              <button
                type="button"
                onClick={handleUseGeolocation}
                disabled={locating}
                className="px-3 py-1.5 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer shadow-lg"
                style={{
                  backgroundColor: locationSource === 'gps' ? accentColor : `${accentColor}1f`,
                  borderColor: accentColor,
                  color: locationSource === 'gps' ? '#05060a' : accentColor
                }}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>
                  {locating
                    ? 'Obtendo GPS...'
                    : locationSource === 'gps'
                    ? 'GPS Conectado'
                    : 'Usar Meu GPS'}
                </span>
              </button>
            </form>

            {locationFeedback && (
              <span className="text-[10px] font-mono truncate max-w-md" style={{ color: accentColor }}>
                {locationFeedback}
              </span>
            )}
          </div>
        </div>

        {/* 2. PALCO CENTRAL: MAPA REAL INTERATIVO (FULL-SCREEN IMERSIVO NO MOBILE, ENQUADRADO NO DESKTOP) */}
        <div
          className="relative z-10 sm:my-2 sm:rounded-2xl sm:border sm:border-white/15 bg-[#080b12] shadow-2xl overflow-hidden flex-1 min-h-0 flex flex-col justify-between"
          style={{ isolation: 'isolate' }}
        >
          {/* HUD Superior Desktop/Tablet */}
          <div className="hidden sm:flex relative z-20 shrink-0 flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 bg-[#070a10] border-b border-white/10 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Compass className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                <span className="text-slate-400 text-[11px]">Saída:</span>
                <strong className="text-white truncate max-w-[160px] sm:max-w-[240px] font-mono text-[11px]">
                  {originLabel}
                </strong>
              </div>

              <span className="text-slate-600 hidden xl:inline">→</span>

              <div className="hidden xl:flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                <span className="text-slate-400 text-[11px]">Destino:</span>
                <strong className="text-slate-200 truncate max-w-[220px] font-mono text-[11px]">
                  {resolvedStoreAddress}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono">
              <div className="flex items-center gap-1">
                <Navigation className="w-3 h-3" style={{ color: accentColor }} />
                <span className="text-slate-400 text-[10px] uppercase">Faltam:</span>
                <strong className="text-white text-xs">{remainingKm} km</strong>
              </div>

              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" style={{ color: accentColor }} />
                <span className="text-slate-400 text-[10px] uppercase">ETA:</span>
                <strong className="text-white text-xs">
                  {remainingMin === 0 ? 'Na Loja!' : `~${remainingMin} min`}
                </strong>
              </div>

              <div className="hidden md:flex items-center gap-1">
                <Gauge className="w-3 h-3" style={{ color: accentColor }} />
                <strong className="text-white text-[11px]">{String(scrollSpeedKmh).padStart(2, '0')} km/h</strong>
              </div>

              <div
                className="px-2 py-0.5 rounded-full text-[10px] font-black text-slate-950"
                style={{ backgroundColor: accentColor }}
              >
                {scrollPercent}%
              </div>

              <div className="flex items-center gap-1 pl-1 border-l border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const next = !cameraFollowCar;
                    setCameraFollowCar(next);
                    if (next) syncMapVisualsToProgress(currentProgressRef.current);
                  }}
                  className="px-2 py-1 rounded-lg border text-[10px] font-mono font-bold inline-flex items-center gap-1 transition cursor-pointer"
                  style={{
                    backgroundColor: cameraFollowCar ? accentColor : 'rgba(255,255,255,0.05)',
                    borderColor: cameraFollowCar ? accentColor : 'rgba(255,255,255,0.15)',
                    color: cameraFollowCar ? '#05060a' : '#e2e8f0'
                  }}
                >
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">{cameraFollowCar ? 'Seguindo' : 'Seguir Carro'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleFitFullRoute}
                  className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-[10px] font-mono font-bold text-slate-200 inline-flex items-center gap-1 transition cursor-pointer"
                  title="Enquadrar rota inteira"
                >
                  <Maximize2 className="w-3 h-3" style={{ color: accentColor }} />
                  <span className="hidden md:inline">Rota Inteira</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleZoom(1)}
                  className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-slate-200 cursor-pointer"
                  aria-label="Aproximar mapa"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(-1)}
                  className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-slate-200 cursor-pointer"
                  aria-label="Afastar mapa"
                >
                  <Minus className="w-3 h-3" />
                </button>

                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-[10px] font-mono font-bold text-slate-200"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-2.5 h-2.5" style={{ color: accentColor }} />
                </a>

                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-[10px] font-mono font-bold text-slate-200"
                >
                  <span>Waze</span>
                  <ExternalLink className="w-2.5 h-2.5" style={{ color: accentColor }} />
                </a>
              </div>
            </div>
          </div>

          {/* Container do Mapa Real Interativo */}
          <div className="relative flex-1 w-full min-h-0 overflow-hidden" style={{ isolation: 'isolate' }}>
            <style>{`
              .scrolly-osm-dark-tiles {
                filter: invert(100%) hue-rotate(180deg) brightness(92%) contrast(92%) saturate(80%);
              }
              .leaflet-container {
                background: #07090e !important;
                font-family: inherit;
                z-index: 1 !important;
                touch-action: ${mobileFreePan ? 'none' : 'pan-y'} !important;
              }
            `}</style>
            <div
              ref={mapContainerRef}
              className="absolute inset-0 w-full h-full z-0"
              style={{ background: '#07090e' }}
            />

            {/* Vinhetas de Imersão Mobile (Topo e Base) */}
            <div className="sm:hidden pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#05060a]/90 via-[#05060a]/45 to-transparent z-10" />
            <div className="sm:hidden pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#05060a]/95 via-[#05060a]/55 to-transparent z-10" />

            {/* =================================================================
                HUD MOBILE IMERSIVO TOPO (ESTILO CARPLAY / WAZE DARK)
               ================================================================= */}
            <div className="sm:hidden absolute top-3 inset-x-3 z-20 space-y-2">
              <div className="rounded-2xl bg-[#070a12]/90 backdrop-blur-xl border border-white/15 px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full animate-ping shrink-0" style={{ backgroundColor: accentColor }} />
                    <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider truncate" style={{ color: accentColor }}>
                      ROTA ATÉ {storeName}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5 font-mono">
                    {originLabel.split('(')[0].trim()} → {resolvedStoreAddress.split('-')[0].trim()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <div className="text-right">
                    <strong className="block text-xs font-black text-white leading-none">{remainingKm} km</strong>
                    <span className="text-[10px] text-slate-400">
                      {remainingMin === 0 ? 'Chegou!' : `~${remainingMin} min`}
                    </span>
                  </div>
                  <div
                    className="px-2 py-1 rounded-xl text-[11px] font-black text-slate-950"
                    style={{ backgroundColor: accentColor }}
                  >
                    {scrollPercent}%
                  </div>
                </div>
              </div>

              {/* Pílulas de Ação Rápida Mobile (Mudar CEP/GPS, Seguir Carro, Explorar Mapa Livre) */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMobileOriginDrawerOpen((v) => !v)}
                    className="px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-xl border border-white/15 text-[11px] font-bold text-white inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <MapPin className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <span>{mobileOriginDrawerOpen ? 'Fechar Origem' : 'Mudar CEP / GPS'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUseGeolocation}
                    disabled={locating}
                    className="px-2.5 py-1.5 rounded-xl border text-[11px] font-black inline-flex items-center gap-1 backdrop-blur-xl shadow-lg"
                    style={{
                      backgroundColor: locationSource === 'gps' ? accentColor : 'rgba(7,10,18,0.88)',
                      borderColor: accentColor,
                      color: locationSource === 'gps' ? '#05060a' : accentColor
                    }}
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                    <span>{locating ? '...' : 'GPS'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleMobileFreePan}
                    className="px-2.5 py-1.5 rounded-xl border text-[10px] font-mono font-bold inline-flex items-center gap-1 backdrop-blur-xl shadow-lg"
                    style={{
                      backgroundColor: mobileFreePan ? accentColor : 'rgba(7,10,18,0.88)',
                      borderColor: mobileFreePan ? accentColor : 'rgba(255,255,255,0.18)',
                      color: mobileFreePan ? '#05060a' : '#e2e8f0'
                    }}
                  >
                    <span>{mobileFreePan ? '🔒 Voltar ao Scroll' : '🖐️ Mover Mapa'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFitFullRoute}
                    className="p-1.5 rounded-xl bg-black/85 border border-white/15 text-slate-200 backdrop-blur-xl"
                    aria-label="Ver rota completa"
                  >
                    <Maximize2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  </button>
                </div>
              </div>

              {/* Gaveta Retrátil Mobile para Digitar CEP */}
              {mobileOriginDrawerOpen && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    lookupCepAndRoute(cepInput);
                    setMobileOriginDrawerOpen(false);
                  }}
                  className="rounded-2xl bg-[#070a12]/95 backdrop-blur-2xl border border-white/20 p-3 shadow-2xl space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cepInput}
                      onChange={(e) => {
                        const formatted = formatCep(e.target.value);
                        setCepInput(formatted);
                        if (formatted.replace(/\D/g, '').length === 8) {
                          lookupCepAndRoute(formatted);
                          setMobileOriginDrawerOpen(false);
                        }
                      }}
                      placeholder="Digite seu CEP (00000-000)"
                      className="flex-1 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={locating}
                      className="px-3.5 py-2 rounded-xl font-black text-xs text-slate-950 shrink-0"
                      style={{ backgroundColor: accentColor }}
                    >
                      Calcular
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Dica: Você também pode tocar em &quot;🖐️ Mover Mapa&quot; e tocar na sua rua.
                  </p>
                </form>
              )}
            </div>

            {/* =================================================================
                HUD MOBILE IMERSIVO BASE (CARD ÚNICO DINÂMICO + STEPPER DE ROTA)
               ================================================================= */}
            <div className="sm:hidden absolute bottom-3 inset-x-3 z-20 space-y-2">
              {/* Stepper Interativo dos 4 Marcos da Rota */}
              <div className="rounded-2xl bg-[#070a12]/90 backdrop-blur-xl border border-white/15 px-3 py-2 shadow-xl">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  {CHECKPOINTS.map((cp, idx) => {
                    const reached = idx <= activeCheckpointIdx;
                    const current = idx === activeCheckpointIdx;
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => jumpToCheckpoint(cp, idx)}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-mono font-bold transition"
                        style={{
                          backgroundColor: current ? `${accentColor}26` : 'transparent',
                          color: reached ? '#ffffff' : '#64748b'
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: reached ? accentColor : 'rgba(255,255,255,0.08)',
                            color: reached ? '#05060a' : '#94a3b8'
                          }}
                        >
                          {cp.step}
                        </span>
                        <span className="truncate">
                          {idx === 0 ? 'Saída' : idx === 1 ? 'Via 1' : idx === 2 ? 'Acesso' : 'Loja'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Barra de Progresso Contínua Mobile */}
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full transition-none rounded-full"
                    style={{ width: `${scrollPercent}%`, backgroundColor: accentColor }}
                  />
                </div>
              </div>

              {/* Card Único Dinâmico do Checkpoint Ativo no Mobile */}
              {(() => {
                const cp = CHECKPOINTS[activeCheckpointIdx] || CHECKPOINTS[0];
                const cpDistKm = (baseDistanceKm * cp.remainingFactor).toFixed(1).replace('.', ',');
                const cpTimeMin = Math.ceil(baseDurationMin * cp.remainingFactor);
                const dynamicTitle =
                  activeCheckpointIdx === 0
                    ? `Saída: ${originLabel.split('(')[0].trim()}`
                    : activeCheckpointIdx === 1
                    ? waypoint1Info.title
                    : activeCheckpointIdx === 2
                    ? waypoint2Info.title
                    : `Chegada: ${storeName}`;
                const dynamicSub =
                  activeCheckpointIdx === 0
                    ? 'Deslize a tela para cima para conduzir o veículo pelas ruas até a loja.'
                    : activeCheckpointIdx === 1
                    ? waypoint1Info.subtitle
                    : activeCheckpointIdx === 2
                    ? waypoint2Info.subtitle
                    : `Endereço: ${resolvedStoreAddress}`;

                return (
                  <div
                    ref={mobileActiveCardRef}
                    className="rounded-2xl bg-[#090d16]/95 backdrop-blur-2xl border p-3.5 shadow-2xl space-y-2.5"
                    style={{
                      borderColor: accentColor,
                      boxShadow: `0 16px 40px -10px ${accentColor}45`
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[10px] font-mono font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: `${accentColor}24`, color: accentColor }}
                      >
                        ETAPA {cp.step}/04 • {cp.badge}
                      </span>

                      <span className="text-[11px] font-mono font-bold text-slate-200 flex items-center gap-1">
                        <Clock className="w-3 h-3" style={{ color: accentColor }} />
                        {cp.remainingFactor === 0 ? 'Destino Final' : `Faltam ${cpDistKm} km • ~${cpTimeMin} min`}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-black text-white leading-snug">{dynamicTitle}</h3>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug line-clamp-2">{dynamicSub}</p>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={wazeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/15 text-[10px] font-mono font-bold text-slate-200 inline-flex items-center gap-1"
                        >
                          <span>Waze</span>
                          <ExternalLink className="w-2.5 h-2.5" style={{ color: accentColor }} />
                        </a>
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/15 text-[10px] font-mono font-bold text-slate-200 inline-flex items-center gap-1"
                        >
                          <span>Maps</span>
                          <ExternalLink className="w-2.5 h-2.5" style={{ color: accentColor }} />
                        </a>
                      </div>

                      {dynamicWhatsappUrl ? (
                        <a
                          href={dynamicWhatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-black px-3.5 py-1.5 rounded-xl text-xs text-slate-950 shadow-lg"
                          style={{ backgroundColor: accentColor }}
                        >
                          <MessageCircle className="w-3.5 h-3.5 fill-current" />
                          <span>Chamar no WhatsApp</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onScheduleClick?.()}
                          className="inline-flex items-center gap-1.5 font-black px-3.5 py-1.5 rounded-xl text-xs text-slate-950 shadow-lg"
                          style={{ backgroundColor: accentColor }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Agendar Visita</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Instrução Interativa Inferior Discreta (Apenas Desktop/Tablet) */}
            <div className="hidden sm:flex pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/80 border border-white/15 text-[10px] font-mono uppercase tracking-wider text-slate-200 items-center gap-1.5 backdrop-blur-md whitespace-nowrap">
              <MousePointerClick className="w-3 h-3 shrink-0" style={{ color: accentColor }} />
              <span>Role para conduzir o carro • Clique no mapa para mudar sua origem</span>
            </div>
          </div>

          {/* Barra Linear de Progresso do Scroll (Desktop/Tablet) */}
          <div className="hidden sm:block h-1.5 w-full bg-white/5 shrink-0 overflow-hidden">
            <div
              ref={progressBarFillRef}
              className="h-full transition-none"
              style={{ width: '0%', backgroundColor: accentColor }}
            />
          </div>
        </div>

        {/* 3. CHECKPOINT CARDS DESKTOP/TABLET: Acionados com Fade-In conforme o carro avança pelas ruas reais */}
        <div className="hidden sm:grid relative z-10 shrink-0 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {CHECKPOINTS.map((cp, idx) => {
            const isActive = idx === activeCheckpointIdx;
            const isPassed = idx <= activeCheckpointIdx;
            const cpDistKm = (baseDistanceKm * cp.remainingFactor).toFixed(1).replace('.', ',');
            const cpTimeMin = Math.ceil(baseDurationMin * cp.remainingFactor);

            return (
              <div
                key={cp.id}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                onClick={() => jumpToCheckpoint(cp, idx)}
                className={`group rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 border transition-colors cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'bg-[#0d121d] shadow-xl'
                    : isPassed
                    ? 'bg-[#0a0e17]/85 border-white/15 hover:border-white/30'
                    : 'bg-[#070a10]/60 border-white/10'
                }`}
                style={
                  isActive
                    ? {
                        borderColor: accentColor,
                        boxShadow: `0 10px 28px -10px ${accentColor}40`
                      }
                    : undefined
                }
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span
                      className="text-[9px] sm:text-[10px] font-mono font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: isPassed ? `${accentColor}24` : 'rgba(255,255,255,0.05)',
                        color: isPassed ? accentColor : '#94a3b8'
                      }}
                    >
                      {cp.step} • {cp.badge}
                    </span>

                    <span className="text-[10px] font-mono font-bold text-slate-200 flex items-center gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 hidden sm:inline" style={{ color: accentColor }} />
                      {cp.remainingFactor === 0 ? '0,0 km' : `${cpDistKm} km • ~${cpTimeMin}m`}
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-black text-white leading-snug truncate">
                    {idx === 0
                      ? `Saída: ${originLabel.split('(')[0].trim()}`
                      : idx === 1
                      ? waypoint1Info.title
                      : idx === 2
                      ? waypoint2Info.title
                      : `Chegada: ${storeName}`}
                  </h3>
                  <p className="hidden sm: -webkit-box text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                    {idx === 0
                      ? cp.subtitle
                      : idx === 1
                      ? waypoint1Info.subtitle
                      : idx === 2
                      ? waypoint2Info.subtitle
                      : `Endereço: ${resolvedStoreAddress}. ${cp.subtitle}`}
                  </p>
                </div>

                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400 font-mono truncate max-w-[140px]">
                    {idx === 0
                      ? 'Ponto de Partida'
                      : idx === 1
                      ? waypoint1Info.place
                      : idx === 2
                      ? waypoint2Info.place
                      : resolvedStoreAddress}
                  </span>

                  {idx === CHECKPOINTS.length - 1 ? (
                    dynamicWhatsappUrl ? (
                      <a
                        href={dynamicWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-lg text-slate-950 transition hover:brightness-110 shrink-0 shadow"
                        style={{ backgroundColor: accentColor }}
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>WhatsApp</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onScheduleClick?.();
                        }}
                        className="inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-lg text-slate-950 transition hover:brightness-110 cursor-pointer shrink-0"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Agendar</span>
                      </button>
                    )
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 font-bold shrink-0"
                      style={{ color: isPassed ? accentColor : '#64748b' }}
                    >
                      {isPassed ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Ativo
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3 h-3" /> Rota
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DealershipRouteScrollytelling;
