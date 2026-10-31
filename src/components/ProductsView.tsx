import React, { useState, useRef } from 'react';
import { visibleForSegment } from '../../functions/src/catalogPolicy';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Image as ImageIcon, 
  Check, 
  X, 
  Sparkles,
  Upload,
  Camera,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
  Film,
  Eye,
  Video,
  Star,
  Maximize2,
  Instagram,
  ExternalLink,
  CheckSquare,
  Square
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Product, Establishment } from '../types';
import { getSegmentConfig, getSegmentCatalogIcon } from '../utils/segments';
import { CarVideoStudioModal } from './CarVideoStudioModal';
import AutomotiveModelEditor from './AutomotiveModelEditor';
import { getThemeFromStore } from '../utils/automotiveThemes';

interface ProductsViewProps {
  products: Product[];
  establishmentId?: string;
  onSaveProduct: (product: Partial<Product>) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  loading: boolean;
  establishment?: Establishment | null;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products: allProducts,
  establishmentId,
  onSaveProduct,
  onDeleteProduct,
  loading,
  establishment
}) => {
  const segConfig = getSegmentConfig(establishment?.segment);
  const automotive = segConfig.id === 'AUTOMOTIVE_PARTS' || segConfig.id === 'VEHICLES';
  const products = visibleForSegment(allProducts, segConfig.id);
  const CatalogIcon = getSegmentCatalogIcon(establishment?.segment);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  
  // AI Video Studio state
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioProduct, setStudioProduct] = useState<Product | null>(null);

  const handleOpenStudio = (prod: Product | null) => {
    setStudioProduct(prod);
    setIsStudioOpen(true);
  };
  
  // Upload States
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const editorBusy = saving || uploadingModel || uploadingImage || uploadingGallery || uploadingVideo;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Lightbox / Media Viewer State
  const [previewMedia, setPreviewMedia] = useState<{
    product: Product;
    activeTab: 'photos' | 'video';
    currentPhotoIndex: number;
  } | null>(null);

  // Instagram Import State
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [parsingInstagram, setParsingInstagram] = useState(false);
  const [instagramParseError, setInstagramParseError] = useState('');
  const [instagramParsedData, setInstagramParsedData] = useState<{
    shortcode: string;
    caption: string;
    images: string[];
    videoUrl: string | null;
    suggested: {
      name: string;
      category: string;
      description: string;
    };
  } | null>(null);
  const [selectedInstagramImages, setSelectedInstagramImages] = useState<string[]>([]);
  const [importProjectForm, setImportProjectForm] = useState({
    name: '',
    category: '',
    description: '',
    includeVideo: true
  });
  const [importingToCatalog, setImportingToCatalog] = useState(false);

  const handleParseInstagramPost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!instagramUrl.trim()) return;

    setParsingInstagram(true);
    setInstagramParseError('');
    setInstagramParsedData(null);

    try {
      const res = await fetch('/api/instagram/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postUrl: instagramUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível analisar este post do Instagram.');
      }

      setInstagramParsedData(data);
      setSelectedInstagramImages(data.images || []);
      setImportProjectForm({
        name: data.suggested?.name || '',
        category: data.suggested?.category || (categories[0] || 'Porsche'),
        description: data.suggested?.description || data.caption || '',
        includeVideo: !!data.videoUrl
      });
    } catch (err: any) {
      setInstagramParseError(err.message || 'Falha ao buscar dados do post.');
    } finally {
      setParsingInstagram(false);
    }
  };

  const handleToggleInstagramImage = (imgUrl: string) => {
    setSelectedInstagramImages(prev => 
      prev.includes(imgUrl) ? prev.filter(url => url !== imgUrl) : [...prev, imgUrl]
    );
  };

  const handleSelectAllInstagramImages = () => {
    if (!instagramParsedData) return;
    if (selectedInstagramImages.length === instagramParsedData.images.length) {
      setSelectedInstagramImages([instagramParsedData.images[0]]);
    } else {
      setSelectedInstagramImages(instagramParsedData.images);
    }
  };

  const handleConfirmInstagramImport = async () => {
    if (!instagramParsedData || !importProjectForm.name.trim()) return;
    if (selectedInstagramImages.length === 0 && !importProjectForm.includeVideo) {
      alert('Selecione pelo menos uma foto ou o vídeo do projeto.');
      return;
    }

    setImportingToCatalog(true);
    try {
      const storeId = establishmentId || 'default';
      const payload = {
        establishmentId: storeId,
        shortcode: instagramParsedData.shortcode,
        name: importProjectForm.name.trim(),
        category: importProjectForm.category || 'Geral',
        description: importProjectForm.description.trim(),
        images: selectedInstagramImages,
        videoUrl: importProjectForm.includeVideo ? instagramParsedData.videoUrl : null
      };

      const res = await fetch('/api/instagram/import-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-establishment-id': storeId
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao importar o projeto.');
      }

      if (data.product) {
        await onSaveProduct(data.product);
      }

      setIsInstagramModalOpen(false);
      setInstagramParsedData(null);
      setInstagramUrl('');
    } catch (err: any) {
      alert(`Erro ao importar: ${err.message}`);
    } finally {
      setImportingToCatalog(false);
    }
  };

  // Extract unique categories
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenAddModal = () => {
    if (editorBusy) return;
    setSaveError('');
    setEditingProduct({
      name: '',
      price: 0,
      category: categories[0] || 'Geral',
      description: '',
      imageUrl: '',
      images: [],
      videoUrl: '',
      available: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    if (editorBusy) return;
    setSaveError('');
    const images = (product.images && product.images.length > 0)
      ? product.images
      : (product.imageUrl ? [product.imageUrl] : []);

    setEditingProduct({ 
      ...product,
      images,
      videoUrl: product.videoUrl || ''
    });
    setIsModalOpen(true);
  };

  const handleCloseEditModal = () => {
    if (editorBusy) return;
    setIsModalOpen(false);
    setEditingProduct(null);
    setSaveError('');
  };

  const handleToggleAvailable = async (product: Product) => {
    await onSaveProduct({
      ...product,
      available: !product.available
    });
  };

  // Upload Foto Principal de Capa
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadingModel || saving) return;
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 8MB.');
      return;
    }

    try {
      setUploadingImage(true);
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const store = establishmentId || 'default';
      const fileId = editingProduct.id || Date.now().toString();
      const storageRef = ref(storage, `establishments/${store}/products/${fileId}_cover_${cleanFileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setEditingProduct(prev => {
        if (!prev) return null;
        const currentImages = prev.images || [];
        const hasCoverInGallery = currentImages.includes(downloadUrl);
        return {
          ...prev,
          imageUrl: downloadUrl,
          images: hasCoverInGallery ? currentImages : [downloadUrl, ...currentImages]
        };
      });
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem:', err);
      alert('Não foi possível enviar a foto. Tente novamente.');
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  // Upload Múltiplas Fotos para a Galeria / Carrossel
  const handleMultipleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadingModel || saving) return;
    const files = e.target.files;
    if (!files || files.length === 0 || !editingProduct) return;

    try {
      setUploadingGallery(true);
      const store = establishmentId || 'default';
      const fileId = editingProduct.id || Date.now().toString();
      const newUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 8 * 1024 * 1024) continue;
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `establishments/${store}/products/${fileId}_slide_${Date.now()}_${cleanFileName}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        newUrls.push(downloadUrl);
      }

      setEditingProduct(prev => {
        if (!prev) return null;
        const currentImages = prev.images || (prev.imageUrl ? [prev.imageUrl] : []);
        const combined = [...currentImages, ...newUrls];
        return {
          ...prev,
          images: combined,
          imageUrl: prev.imageUrl || combined[0] || ''
        };
      });
    } catch (err) {
      console.error('Erro ao enviar fotos da galeria:', err);
      alert('Erro ao enviar fotos. Tente novamente.');
    } finally {
      setUploadingGallery(false);
      if (e.target) e.target.value = '';
    }
  };

  // Upload de Vídeo (.mp4, .mov, etc)
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadingModel || saving) return;
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;

    if (file.size > 40 * 1024 * 1024) {
      alert('O vídeo deve ter no máximo 40MB.');
      return;
    }

    try {
      setUploadingVideo(true);
      const store = establishmentId || 'default';
      const fileId = editingProduct.id || Date.now().toString();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `establishments/${store}/products/${fileId}_video_${cleanFileName}`);
      const snapshot = await uploadBytes(storageRef, file, { contentType: file.type || 'video/mp4' });
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setEditingProduct(prev => prev ? { ...prev, videoUrl: downloadUrl } : null);
    } catch (err) {
      console.error('Erro ao enviar vídeo:', err);
      alert('Erro ao enviar o vídeo. Tente novamente.');
    } finally {
      setUploadingVideo(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveGalleryImage = (indexToRemove: number) => {
    if (uploadingModel || saving) return;
    setEditingProduct(prev => {
      if (!prev) return null;
      const currentImages = prev.images || [];
      const updatedImages = currentImages.filter((_, idx) => idx !== indexToRemove);
      const currentCover = prev.imageUrl;
      const isRemovingCover = currentImages[indexToRemove] === currentCover;
      const referenceImages = prev.model3d?.referenceImages?.filter(image => updatedImages.includes(image));
      return {
        ...prev,
        images: updatedImages,
        imageUrl: isRemovingCover ? (updatedImages[0] || '') : currentCover,
        ...(prev.model3d ? { model3d: { ...prev.model3d, ...(referenceImages ? { referenceImages } : {}) } } : {}),
      };
    });
  };

  const handleSetCoverImage = (imgUrl: string) => {
    if (uploadingModel || saving) return;
    setEditingProduct(prev => prev ? { ...prev, imageUrl: imgUrl } : null);
  };

  const handleRemoveVideo = () => {
    if (uploadingModel || saving) return;
    setEditingProduct(prev => prev ? { ...prev, videoUrl: '' } : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editorBusy) return;
    if (!editingProduct?.name || editingProduct.price === undefined) return;

    try {
      setSaving(true);
      setSaveError('');
      const gallery = (editingProduct.images && editingProduct.images.length > 0)
        ? editingProduct.images
        : (editingProduct.imageUrl ? [editingProduct.imageUrl] : []);

      await onSaveProduct({
        ...editingProduct,
        images: gallery,
        imageUrl: editingProduct.imageUrl || gallery[0] || '',
        videoUrl: editingProduct.videoUrl || '',
        ...(editingProduct.model3d ? { model3d: { ...editingProduct.model3d, ...(editingProduct.model3d.referenceImages ? { referenceImages: editingProduct.model3d.referenceImages.filter(image => gallery.includes(image)).slice(0, 20) } : {}) } } : {}),
      });
      setIsModalOpen(false);
      setEditingProduct(null);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o projeto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            {segConfig.catalogTitle} para a IA
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Sincronizado com a IA
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {segConfig.catalogSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          {automotive && (
            <>
              <button
                type="button"
                onClick={() => handleOpenStudio(filteredProducts[0] || products[0] || null)}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:brightness-110 active:scale-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-600/25 whitespace-nowrap min-w-0"
                title="Criar vídeo de apresentação com influencer virtual ou locução"
              >
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="truncate">Estúdio Vídeo IA</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsInstagramModalOpen(true);
                  setInstagramParseError('');
                  setInstagramParsedData(null);
                }}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:brightness-110 active:scale-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-pink-500/20 whitespace-nowrap min-w-0"
              >
                <Instagram className="w-4 h-4 shrink-0" />
                <span className="truncate">Importar Instagram</span>
              </button>
            </>
          )}

          <button
            onClick={handleOpenAddModal}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[3] shrink-0" />
            <span className="truncate">{segConfig.itemAddLabel}</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-slate-800/80">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={automotive ? 'Buscar projeto, veículo ou configuração...' : 'Buscar produto por nome ou descrição...'}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto -mx-1 px-1 scrollbar-none pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
              selectedCategory === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todas ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category === cat).length;
            const isCatActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isCatActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Product Cards */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
          <p>Carregando {segConfig.catalogTitle.toLowerCase()}...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 border border-slate-800/80 rounded-2xl bg-slate-900/30">
          <CatalogIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">
            Nenhum(a) {segConfig.itemNoun.toLowerCase()} cadastrado(a)
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
            Clique em "{segConfig.itemAddLabel}" para adicionar ao catálogo da sua empresa.
          </p>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Cadastrar agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredProducts.map(product => (
            <ProductCardItem
              key={product.id}
              product={product}
              automotive={automotive}
              onEdit={handleOpenEditModal}
              onDelete={onDeleteProduct}
              onToggleAvailable={handleToggleAvailable}
              onOpenStudio={handleOpenStudio}
              onOpenLightbox={(prod, tab, photoIdx) => {
                setPreviewMedia({
                  product: prod,
                  activeTab: tab,
                  currentPhotoIndex: photoIdx || 0
                });
              }}
            />
          ))}
        </div>
      )}

      {/* Lightbox / Media Viewer Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {previewMedia.product.name}
                </h3>
                <span className="text-[11px] text-emerald-400 font-medium">
                  {previewMedia.product.category}
                </span>
              </div>

              {/* Tabs (Fotos vs Vídeo) */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {previewMedia.product.images && previewMedia.product.images.length > 0 && (
                  <button
                    onClick={() => setPreviewMedia(prev => prev ? { ...prev, activeTab: 'photos' } : null)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      previewMedia.activeTab === 'photos'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Fotos ({previewMedia.product.images.length})</span>
                  </button>
                )}
                {previewMedia.product.videoUrl && (
                  <button
                    onClick={() => setPreviewMedia(prev => prev ? { ...prev, activeTab: 'video' } : null)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      previewMedia.activeTab === 'video'
                        ? 'bg-rose-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Vídeo do Ronco 🎬</span>
                  </button>
                )}
                <button
                  onClick={() => setPreviewMedia(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 ml-1 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center bg-black/40 min-h-[300px]">
              {previewMedia.activeTab === 'video' && previewMedia.product.videoUrl ? (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="w-full rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-[500px]">
                    <video
                      src={previewMedia.product.videoUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    🔊 Este é o vídeo e o ronco real enviado automaticamente pelo chatbot aos clientes do WhatsApp.
                  </p>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-3">
                  {/* Photo Main View */}
                  {(() => {
                    const photos = previewMedia.product.images && previewMedia.product.images.length > 0
                      ? previewMedia.product.images
                      : (previewMedia.product.imageUrl ? [previewMedia.product.imageUrl] : []);
                    const currentIdx = previewMedia.currentPhotoIndex || 0;
                    const activePhoto = photos[currentIdx] || previewMedia.product.imageUrl;

                    return (
                      <>
                        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-black flex items-center justify-center min-h-[280px] max-h-[480px]">
                          {activePhoto ? (
                            <img
                              src={activePhoto}
                              alt="Foto ampliada"
                              className="max-w-full max-h-[480px] object-contain"
                            />
                          ) : (
                            <div className="text-slate-600 flex flex-col items-center gap-2">
                              <ImageIcon className="w-12 h-12" />
                              <span className="text-xs">Sem foto disponível</span>
                            </div>
                          )}

                          {/* Navigation Arrows */}
                          {photos.length > 1 && (
                            <>
                              <button
                                onClick={() => setPreviewMedia(prev => prev ? {
                                  ...prev,
                                  currentPhotoIndex: (currentIdx - 1 + photos.length) % photos.length
                                } : null)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-900 border border-slate-700/80 transition cursor-pointer"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => setPreviewMedia(prev => prev ? {
                                  ...prev,
                                  currentPhotoIndex: (currentIdx + 1) % photos.length
                                } : null)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-900 border border-slate-700/80 transition cursor-pointer"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-700/80 text-xs font-mono font-bold text-white">
                                {currentIdx + 1} / {photos.length}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Thumbnails Row */}
                        {photos.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto w-full p-2 scrollbar-none justify-center">
                            {photos.map((pUrl, idx) => (
                              <button
                                key={idx}
                                onClick={() => setPreviewMedia(prev => prev ? { ...prev, currentPhotoIndex: idx } : null)}
                                className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                                  idx === currentIdx
                                    ? 'border-emerald-500 scale-105 shadow-md shadow-emerald-500/30'
                                    : 'border-slate-800 opacity-60 hover:opacity-100'
                                }`}
                              >
                                <img src={pUrl} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar / Editar Projeto */}
      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800/80">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {editingProduct.id ? 'Editar' : 'Novo(a)'} {segConfig.itemNoun}
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={editorBusy}
                aria-label="Fechar edição do projeto"
                className="text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do(a) {segConfig.itemNoun} *
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  disabled={uploadingModel || saving}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder={`Ex: ${segConfig.sampleItemName}`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {automotive ? 'Valor definido no orçamento' : 'Preço (R$) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.price !== undefined ? editingProduct.price : 0}
                    disabled={uploadingModel || saving}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    placeholder={automotive ? '0 (Sob consulta)' : '0.00'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                  />
                  {automotive && (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Deixe 0 para exibir "Sob consulta" na vitrine.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {automotive ? 'Categoria / Família de veículos *' : 'Categoria *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.category || ''}
                    disabled={uploadingModel || saving}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    placeholder={`Ex: ${segConfig.sampleCategory}`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              {/* SEÇÃO 1: GALERIA DE FOTOS (CARROSSEL) */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      Galeria de Fotos (Carrossel / Álbum)
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Todas essas fotos ficam no mesmo card e a IA do WhatsApp pode enviá-las em álbum deslizável.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploadingGallery || uploadingModel || saving}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {uploadingGallery ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Fotos</span>
                      </>
                    )}
                  </button>
                </div>

                <input
                  type="file"
                  multiple
                  ref={galleryInputRef}
                  disabled={uploadingModel || saving}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleMultipleGalleryUpload}
                  className="hidden"
                />

                {/* Grade de Fotos da Galeria */}
                {editingProduct.images && editingProduct.images.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    {editingProduct.images.map((imgUrl, index) => {
                      const isCover = editingProduct.imageUrl === imgUrl;
                      return (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-900 aspect-square">
                          <img src={imgUrl} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                          
                          {/* Badge de Capa */}
                          {isCover && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500 text-slate-950 flex items-center gap-0.5 shadow">
                              <Star className="w-2.5 h-2.5 fill-current" /> Capa
                            </span>
                          )}

                          {/* Hover Actions */}
                          <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1 p-1">
                            {!isCover && (
                              <button
                                type="button"
                                onClick={() => handleSetCoverImage(imgUrl)}
                                disabled={uploadingModel || saving}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-white transition cursor-pointer"
                              >
                                Usar Capa
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(index)}
                              disabled={uploadingModel || saving}
                              className="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer"
                              title="Excluir esta foto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    onClick={() => galleryInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 text-center cursor-pointer bg-slate-950/50 flex flex-col items-center gap-1.5 transition"
                  >
                    <Camera className="w-6 h-6 text-slate-500" />
                    <p className="text-xs text-slate-300 font-semibold">Nenhuma foto adicionada na galeria</p>
                    <p className="text-[10px] text-slate-500">Clique para selecionar fotos do seu computador ou carrossel do Instagram</p>
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: VÍDEO DO PROJETO / RONCO */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-rose-400" />
                      Vídeo do Ronco / Projeto (.mp4)
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Vídeo que a IA envia no WhatsApp quando o cliente pedir para ouvir o som/ronco do escapamento.
                    </p>
                  </div>

                  {editingProduct.videoUrl ? (
                    <button
                      type="button"
                      onClick={handleRemoveVideo}
                      disabled={uploadingModel || saving}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Trash2 className="w-3 h-3" /> Remover Vídeo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploadingVideo || uploadingModel || saving}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {uploadingVideo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Adicionar Vídeo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={videoInputRef}
                  disabled={uploadingModel || saving}
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleVideoUpload}
                  className="hidden"
                />

                {editingProduct.videoUrl ? (
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-3 space-y-2">
                    <video
                      src={editingProduct.videoUrl}
                      controls
                      className="w-full max-h-48 rounded-lg bg-black"
                    />
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Vídeo Carregado e Pronto
                      </span>
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={uploadingVideo || uploadingModel || saving}
                        className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer"
                      >
                        Substituir Vídeo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => !uploadingVideo && videoInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800 hover:border-rose-500/50 rounded-xl p-4 text-center cursor-pointer bg-slate-950/50 flex flex-col items-center gap-1.5 transition"
                  >
                    {uploadingVideo ? (
                      <div className="flex flex-col items-center gap-2 text-rose-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs font-semibold">Enviando vídeo para a nuvem...</span>
                      </div>
                    ) : (
                      <>
                        <Video className="w-6 h-6 text-slate-500" />
                        <p className="text-xs text-slate-300 font-semibold">Nenhum vídeo vinculado</p>
                        <p className="text-[10px] text-slate-500">Clique para selecionar um arquivo de vídeo (.mp4 ou .mov) até 40MB</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {segConfig.id === 'AUTOMOTIVE_PARTS' && (
                <AutomotiveModelEditor
                  key={editingProduct.id || 'new-project'}
                  establishmentId={establishmentId}
                  model={editingProduct.model3d}
                  images={editingProduct.images?.length ? editingProduct.images : (editingProduct.imageUrl ? [editingProduct.imageUrl] : [])}
                  projectName={editingProduct.name || ''}
                  accent={getThemeFromStore(establishment || undefined).primary}
                  disabled={saving || uploadingImage || uploadingGallery || uploadingVideo}
                  onBusyChange={setUploadingModel}
                  onChange={model3d => setEditingProduct(previous => previous ? { ...previous, model3d } : null)}
                />
              )}

              {segConfig.id === 'AUTOMOTIVE_PARTS' && <fieldset className="rounded-xl border border-emerald-500/20 bg-slate-950/50 p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold text-emerald-300">Ficha técnica da referência</legend>
                <p className="text-xs text-slate-400">Preencha apenas dados confirmados deste projeto. Campos vazios permanecem desconhecidos para a IA.</p>
                <div className="grid grid-cols-2 gap-3">
                  {([{key:'brand',label:'Marca'}, {key:'model',label:'Modelo'}, {key:'generation',label:'Geração / chassi'}, {key:'engine',label:'Motorização'}, {key:'yearFrom',label:'Ano inicial'}, {key:'yearTo',label:'Ano final'}, {key:'material',label:'Material'}, {key:'configuration',label:'Configuração do escape'}] as const).map(({key,label})=><label key={key} className="text-xs text-slate-300">{label}<input disabled={editorBusy} value={editingProduct.automotiveSpecs?.[key] || ''} maxLength={key.startsWith('year')?4:150} inputMode={key.startsWith('year')?'numeric':'text'} onChange={e=>setEditingProduct({...editingProduct,automotiveSpecs:{...editingProduct.automotiveSpecs,[key]:e.target.value}})} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"/></label>)}
                  <label className="text-xs text-slate-300">Situação do projeto<select disabled={editorBusy} value={editingProduct.automotiveSpecs?.status || 'completed'} onChange={e=>setEditingProduct({...editingProduct,automotiveSpecs:{...editingProduct.automotiveSpecs,status:e.target.value as 'completed'|'development'}})} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"><option value="completed">Concluído</option><option value="development">Em desenvolvimento</option></select></label>
                  <label className="text-xs text-slate-300">Validação técnica<select disabled={editorBusy} value={editingProduct.automotiveSpecs?.validation || 'reference'} onChange={e=>setEditingProduct({...editingProduct,automotiveSpecs:{...editingProduct.automotiveSpecs,validation:e.target.value as 'reference'|'validated'}})} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"><option value="reference">Somente referência</option><option value="validated">Dados revisados pela equipe</option></select></label>
                </div>
                <p className="text-xs text-slate-500">A revisão desta ficha não garante compatibilidade com outro veículo.</p>
              </fieldset>}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {segConfig.id === 'VEHICLES' 
                    ? 'Ficha Técnica, Opcionais e Condições (Para a IA)' 
                    : segConfig.id === 'REAL_ESTATE' 
                    ? 'Detalhes do Imóvel, Metragem e Regras (Para a IA)' 
                    : 'Descrição e Detalhes do Produto (Para a IA)'}
                </label>
                <textarea
                  rows={3}
                  disabled={uploadingModel || saving}
                  value={editingProduct.description || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder={`Ex: ${segConfig.sampleDescription}`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="availableCheck"
                  disabled={uploadingModel || saving}
                  checked={editingProduct.available !== false}
                  onChange={e => setEditingProduct({ ...editingProduct, available: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-800 cursor-pointer"
                />
                <label htmlFor="availableCheck" className="text-xs text-slate-300 cursor-pointer font-medium">
                  {automotive ? 'Publicar como referência (não confirma disponibilidade para venda)' : 'Disponível para venda no WhatsApp'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  disabled={editorBusy}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editorBusy}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : `Salvar ${segConfig.itemNoun}`}
                </button>
              </div>
              {saveError && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{saveError}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Modal Importar do Instagram */}
      {isInstagramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-950/80 via-slate-900 to-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    Importar Projeto do Instagram
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      IA Gemini
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Extraia automaticamente carrossel de fotos, vídeo de ronco e especificações técnicas.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsInstagramModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
              {/* Step 1: Input Post URL */}
              <form onSubmit={handleParseInstagramPost} className="space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  Link da publicação do Instagram (Post, Carrossel ou Reel)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={instagramUrl}
                    onChange={e => setInstagramUrl(e.target.value)}
                    placeholder="https://www.instagram.com/p/DSC7P9-kaMK/ ou apenas o link do post"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition"
                  />
                  <button
                    type="submit"
                    disabled={parsingInstagram || !instagramUrl.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:brightness-110 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-rose-500/20 disabled:opacity-50 shrink-0"
                  >
                    {parsingInstagram ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analisando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analisar Post com IA</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Dica: Funciona com carrossel de até 10 fotos e vídeos com som de ronco.</span>
                  <a
                    href="https://www.instagram.com/flowgarage.escapamentos/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-400 hover:underline inline-flex items-center gap-1"
                  >
                    Abrir @flowgarage.escapamentos <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </form>

              {/* Error Message */}
              {instagramParseError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                  <span>{instagramParseError}</span>
                  <button onClick={() => setInstagramParseError('')} className="text-rose-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Step 2: Post Parsed Preview */}
              {instagramParsedData && (
                <div className="space-y-5 pt-4 border-t border-slate-800">
                  {/* Photo Carousel Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                        Fotos do Carrossel ({selectedInstagramImages.length} de {instagramParsedData.images.length} selecionadas)
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllInstagramImages}
                        className="text-[11px] font-semibold text-rose-400 hover:underline cursor-pointer"
                      >
                        {selectedInstagramImages.length === instagramParsedData.images.length ? 'Desmarcar extras' : 'Selecionar todas'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                      {instagramParsedData.images.map((imgUrl, idx) => {
                        const isChecked = selectedInstagramImages.includes(imgUrl);
                        return (
                          <div
                            key={idx}
                            onClick={() => handleToggleInstagramImage(imgUrl)}
                            className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition group ${
                              isChecked 
                                ? 'border-rose-500 ring-2 ring-rose-500/40 shadow-md' 
                                : 'border-slate-800 opacity-40 hover:opacity-80'
                            }`}
                          >
                            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 w-5 h-5 rounded-md bg-black/70 flex items-center justify-center text-white">
                              {isChecked ? <Check className="w-3 h-3 text-rose-400 stroke-[3]" /> : <Square className="w-3 h-3 text-slate-500" />}
                            </div>
                            <span className="absolute bottom-1 right-1 text-[9px] font-bold bg-black/70 text-slate-300 px-1 rounded">
                              #{idx + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Video Preview (if present) */}
                  {instagramParsedData.videoUrl && (
                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-amber-400" />
                          Vídeo do Ronco / Escapamento Detectado
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={importProjectForm.includeVideo}
                            onChange={e => setImportProjectForm({ ...importProjectForm, includeVideo: e.target.checked })}
                            className="rounded border-slate-800 text-rose-500 focus:ring-0"
                          />
                          <span>Incluir no projeto</span>
                        </label>
                      </div>

                      {importProjectForm.includeVideo && (
                        <video
                          src={instagramParsedData.videoUrl}
                          controls
                          className="w-full max-h-48 rounded-xl bg-black"
                        />
                      )}
                    </div>
                  )}

                  {/* Editable Technical Specifications */}
                  <div className="space-y-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Nome do Projeto (Sugerido pela IA) *
                      </label>
                      <input
                        type="text"
                        required
                        value={importProjectForm.name}
                        onChange={e => setImportProjectForm({ ...importProjectForm, name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Categoria / Marca do Veículo *
                      </label>
                      <input
                        type="text"
                        required
                        value={importProjectForm.category}
                        onChange={e => setImportProjectForm({ ...importProjectForm, category: e.target.value })}
                        placeholder="Ex: Porsche, BMW, Audi, Ferrari..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Descrição Técnica (Resumo da IA para o WhatsApp e Catálogo)
                      </label>
                      <textarea
                        rows={3}
                        value={importProjectForm.description}
                        onChange={e => setImportProjectForm({ ...importProjectForm, description: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {instagramParsedData && (
              <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400 hidden sm:inline">
                  {selectedInstagramImages.length} fotos {importProjectForm.includeVideo && instagramParsedData.videoUrl ? '+ vídeo' : ''} serão salvas na nuvem.
                </span>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setInstagramParsedData(null);
                      setInstagramUrl('');
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Descartar
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmInstagramImport}
                    disabled={importingToCatalog || !importProjectForm.name.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {importingToCatalog ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando na nuvem...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Confirmar e Publicar Projeto</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estúdio de Vídeo IA & Influencer Automotivo */}
      <CarVideoStudioModal
        isOpen={isStudioOpen}
        onClose={() => {
          setIsStudioOpen(false);
          setStudioProduct(null);
        }}
        product={studioProduct}
        establishmentId={establishmentId || ''}
        storeName={establishment?.name || 'Nossa Concessionária'}
        onProductUpdated={(updatedProd) => {
          if (editingProduct && editingProduct.id === updatedProd.id) {
            setEditingProduct(prev => prev ? { ...prev, ...updatedProd } : null);
          }
        }}
      />
    </div>
  );
};

// Componente Individual do Card do Produto com Mini-Carrossel e Ações de Vídeo
interface ProductCardItemProps {
  product: Product;
  automotive: boolean;
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => Promise<void>;
  onToggleAvailable: (product: Product) => Promise<void>;
  onOpenLightbox: (product: Product, tab: 'photos' | 'video', photoIndex?: number) => void;
  onOpenStudio?: (product: Product) => void;
}

const ProductCardItem: React.FC<ProductCardItemProps> = ({
  product,
  automotive,
  onEdit,
  onDelete,
  onToggleAvailable,
  onOpenLightbox,
  onOpenStudio
}) => {
  const slides = (product.images && product.images.length > 0)
    ? product.images
    : (product.imageUrl ? [product.imageUrl] : []);

  const [activeSlide, setActiveSlide] = useState(0);

  const handlePrevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide(prev => (prev - 1 + slides.length) % slides.length);
  };

  const handleNextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide(prev => (prev + 1) % slides.length);
  };

  const currentImage = slides[activeSlide] || product.imageUrl;

  return (
    <div
      className={`group rounded-2xl bg-slate-900 border transition overflow-hidden shadow-xl flex flex-col justify-between ${
        product.available ? 'border-slate-800 hover:border-slate-700' : 'border-rose-950/40 opacity-70'
      }`}
    >
      <div>
        {/* Imagem do Produto com Carrossel e Ações */}
        <div className="relative h-48 bg-slate-950 overflow-hidden group/image">
          {currentImage ? (
            <img
              src={currentImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover/image:scale-105 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
              <ImageIcon className="w-10 h-10 mb-1" />
              <span className="text-xs">Sem foto</span>
            </div>
          )}

          {/* Categoria Badge */}
          <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/80 text-emerald-300 border border-slate-700/80 backdrop-blur-sm shadow z-10">
            {product.category}
          </span>

          {/* Status Badge */}
          <button
            onClick={() => onToggleAvailable(product)}
            className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm transition cursor-pointer flex items-center gap-1 border z-10"
            style={{
              backgroundColor: product.available ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: product.available ? '#34d399' : '#f87171',
              borderColor: product.available ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${product.available ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {product.available ? (automotive ? 'Publicado' : 'Disponível') : 'Pausado'}
          </button>

          {/* Setas de navegação no Card (se tiver mais de 1 foto) */}
          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevSlide}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-950/80 text-white hover:bg-emerald-500 hover:text-slate-950 border border-slate-700/60 transition cursor-pointer opacity-0 group-hover/image:opacity-100 z-10 shadow"
                title="Foto anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextSlide}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-950/80 text-white hover:bg-emerald-500 hover:text-slate-950 border border-slate-700/60 transition cursor-pointer opacity-0 group-hover/image:opacity-100 z-10 shadow"
                title="Próxima foto"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Badges Inferiores de Mídia no Card */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 z-10">
            {/* Botão de Vídeo do Ronco */}
            {product.videoUrl ? (
              <button
                type="button"
                onClick={() => onOpenLightbox(product, 'video')}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white border border-rose-400/40 backdrop-blur-md flex items-center gap-1.5 shadow-lg transition cursor-pointer active:scale-95"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Ouvir Ronco 🎬</span>
              </button>
            ) : <div />}

            {/* Contador de Fotos do Carrossel */}
            {slides.length > 1 && (
              <button
                type="button"
                onClick={() => onOpenLightbox(product, 'photos', activeSlide)}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/85 hover:bg-slate-900 text-slate-200 border border-slate-700/80 backdrop-blur-sm shadow flex items-center gap-1 cursor-pointer transition"
              >
                <ImageIcon className="w-2.5 h-2.5 text-emerald-400" />
                <span>{activeSlide + 1} de {slides.length}</span>
              </button>
            )}
          </div>
        </div>

        {/* Detalhes do Produto */}
        <div className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-bold text-white text-sm line-clamp-1">{product.name}</h4>
            <span className="font-extrabold text-emerald-400 font-mono text-sm whitespace-nowrap">
              {automotive ? 'Sob consulta' : `R$ ${Number(product.price).toFixed(2)}`}
            </span>
          </div>

          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {product.description || 'Sem descrição cadastrada.'}
          </p>

          {/* Mini-Galeria de Miniaturas no Rodapé do Card */}
          {slides.length > 1 && (
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
              {slides.slice(0, 5).map((sUrl, sIdx) => (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => setActiveSlide(sIdx)}
                  className={`w-7 h-7 rounded-md overflow-hidden border shrink-0 transition cursor-pointer ${
                    sIdx === activeSlide ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={sUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {slides.length > 5 && (
                <button
                  type="button"
                  onClick={() => onOpenLightbox(product, 'photos', 5)}
                  className="w-7 h-7 rounded-md bg-slate-800 text-[9px] font-bold text-slate-400 flex items-center justify-center shrink-0 border border-slate-700 hover:text-white"
                >
                  +{slides.length - 5}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ações do Card */}
      <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenLightbox(product, 'photos', 0)}
            className="text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 text-[11px] font-semibold transition cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" /> Ver Mídias
          </button>

          {onOpenStudio && (
            <button
              type="button"
              onClick={() => onOpenStudio(product)}
              className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1 transition shadow-sm hover:text-white cursor-pointer"
              title="Abrir Estúdio de Vídeo IA & Influencer"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Vídeo IA</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(product)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Editar informações e mídias"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Remover "${product.name}"?`)) {
                onDelete(product.id);
              }
            }}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
