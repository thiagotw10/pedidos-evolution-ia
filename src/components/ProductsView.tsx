import React, { useState, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Image as ImageIcon, 
  Check, 
  X, 
  ToggleLeft, 
  ToggleRight, 
  Sparkles,
  Utensils,
  Upload,
  Camera,
  Loader2
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Product } from '../types';

interface ProductsViewProps {
  products: Product[];
  establishmentId?: string;
  onSaveProduct: (product: Partial<Product>) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  loading: boolean;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  establishmentId,
  onSaveProduct,
  onDeleteProduct,
  loading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract unique categories
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenAddModal = () => {
    setEditingProduct({
      name: '',
      price: 0,
      category: categories[0] || 'Geral',
      description: '',
      imageUrl: '',
      available: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct({ ...product });
    setIsModalOpen(true);
  };

  const handleToggleAvailable = async (product: Product) => {
    await onSaveProduct({
      ...product,
      available: !product.available
    });
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;

    if (file.size > 6 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 6MB.');
      return;
    }

    try {
      setUploadingImage(true);
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const store = establishmentId || 'default';
      const fileId = editingProduct.id || Date.now().toString();
      const storageRef = ref(storage, `establishments/${store}/products/${fileId}_${cleanFileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setEditingProduct(prev => prev ? { ...prev, imageUrl: downloadUrl } : null);
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem para o Firebase Storage:', err);
      alert('Não foi possível enviar a foto. Tente novamente ou use uma URL externa.');
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveImage = () => {
    setEditingProduct(prev => prev ? { ...prev, imageUrl: '' } : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.name || editingProduct.price === undefined) return;

    try {
      setSaving(true);
      await onSaveProduct(editingProduct);
      setIsModalOpen(false);
      setEditingProduct(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            Cardápio & Produtos para a IA
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Sincronizado com a IA
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Cadastre os itens, preços, fotos e descrições. O atendente inteligente usa essas informações em tempo real no WhatsApp!
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Cadastrar Produto</span>
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar produto por nome ou ingrediente..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
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

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <Utensils className="w-8 h-8 mx-auto mb-2 animate-bounce text-emerald-400" />
          <p>Carregando cardápio...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-12 text-center text-slate-400">
          <Utensils className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-200">Nenhum produto cadastrado</h3>
          <p className="text-sm mt-1 max-w-md mx-auto text-slate-400">
            Clique em "Cadastrar Produto" para adicionar itens ao cardápio da sua loja.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className={`bg-slate-900/90 rounded-2xl border transition shadow-lg overflow-hidden flex flex-col justify-between ${
                product.available 
                  ? 'border-slate-800/80 hover:border-slate-700' 
                  : 'border-slate-800/40 opacity-60'
              }`}
            >
              <div>
                {/* Product Image */}
                <div className="relative h-44 bg-slate-950 overflow-hidden group">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                      <ImageIcon className="w-10 h-10 mb-1" />
                      <span className="text-xs">Sem foto</span>
                    </div>
                  )}

                  {/* Category Badge */}
                  <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/80 text-emerald-300 border border-slate-700/80 backdrop-blur-sm">
                    {product.category}
                  </span>

                  {/* Availability Badge */}
                  <button
                    onClick={() => handleToggleAvailable(product)}
                    className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm transition cursor-pointer flex items-center gap-1 border"
                    style={{
                      backgroundColor: product.available ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: product.available ? '#34d399' : '#f87171',
                      borderColor: product.available ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                    }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${product.available ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {product.available ? 'Disponível' : 'Pausado'}
                  </button>
                </div>

                {/* Details */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-white text-sm line-clamp-1">{product.name}</h4>
                    <span className="font-extrabold text-emerald-400 font-mono text-sm whitespace-nowrap">
                      R$ {Number(product.price).toFixed(2)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {product.description || 'Sem descrição detalhada.'}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggleAvailable(product)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                >
                  {product.available ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-slate-600" />}
                  <span>{product.available ? 'Ativo' : 'Inativo'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(product)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Editar produto"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Deseja remover "${product.name}" do cardápio?`)) {
                        onDeleteProduct(product.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    title="Remover produto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h3 className="font-extrabold text-base text-white">
                {editingProduct.id ? 'Editar Produto' : 'Novo Produto para o Cardápio'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="Ex: X-Burger Artesanal com Bacon"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    placeholder="29.90"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Categoria *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.category || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    placeholder="Ex: Hambúrgueres, Bebidas"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              {/* Foto do Produto (Firebase Storage) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">
                    Foto do Produto <span className="text-[10px] text-emerald-400 font-normal">(A IA envia no WhatsApp quando pedirem)</span>
                  </label>
                  {editingProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Trash2 className="w-3 h-3" /> Remover foto
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {editingProduct.imageUrl ? (
                  <div className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-2 flex items-center gap-3">
                    <img
                      src={editingProduct.imageUrl}
                      alt="Pré-visualização"
                      className="w-20 h-20 rounded-lg object-cover border border-slate-800 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <Check className="w-3.5 h-3.5" /> Foto Vinculada
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {editingProduct.imageUrl}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="text-xs text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {uploadingImage ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3 text-slate-400" />
                            <span>Substituir Foto</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => !uploadingImage && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                      uploadingImage 
                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                        : 'border-slate-800 hover:border-emerald-500/50 bg-slate-950 hover:bg-slate-950/80'
                    }`}
                  >
                    {uploadingImage ? (
                      <div className="py-2 flex flex-col items-center gap-2 text-emerald-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs font-semibold">Fazendo upload para o Firebase Storage...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition">
                          <Camera className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">
                            Clique para selecionar uma foto do produto
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            JPG, PNG ou WebP até 6MB • Salvo automaticamente no Firebase Storage
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição e Ingredientes (Para a IA)</label>
                <textarea
                  rows={3}
                  value={editingProduct.description || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Descreva bem os ingredientes para a IA tirar dúvidas e recomendar ao cliente (ex: 2 carnes 90g, queijo cheddar, maionese temperada)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="availableCheck"
                  checked={editingProduct.available !== false}
                  onChange={e => setEditingProduct({ ...editingProduct, available: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-800 cursor-pointer"
                />
                <label htmlFor="availableCheck" className="text-xs text-slate-300 cursor-pointer font-medium">
                  Disponível para venda no WhatsApp
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  {saving ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
