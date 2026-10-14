import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Box, Check, Loader2, Upload, X } from 'lucide-react';
import { getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { auth, storage } from '../lib/firebase';
import { MAX_MODEL3D_BYTES, sanitizeModel3d, validateGlb, type AutomotiveModel3D } from '../../functions/src/automotiveModel3d';

const ProjectModelScene = lazy(() => import('./AutomotiveProjectModelScene'));

interface AutomotiveModelEditorProps {
  establishmentId?: string;
  model?: AutomotiveModel3D | null;
  images: string[];
  projectName: string;
  accent?: string;
  disabled?: boolean;
  onChange: (model: AutomotiveModel3D | null) => void;
  onBusyChange: (busy: boolean) => void;
}

class ModelPreviewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <p role="alert" className="p-4 text-sm text-amber-200">A prévia 3D não pôde ser aberta. Salve as alterações antes de recarregar a página para tentar novamente.</p>;
    }
    return this.props.children;
  }
}

const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const MAX_REFERENCE_PHOTOS = 20;

export default function AutomotiveModelEditor({
  establishmentId, model, images, projectName, accent = '#5B84FF', disabled = false, onChange, onBusyChange,
}: AutomotiveModelEditorProps) {
  const [source, setSource] = useState<AutomotiveModel3D['source']>(model?.source || 'photos');
  const [referenceImages, setReferenceImages] = useState<string[]>(model?.referenceImages || []);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<UploadTask | null>(null);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const uniqueImages = Array.from(new Set(images.filter(image => /^https:\/\//.test(image) && image.length <= 2048)));
  const galleryKey = uniqueImages.join('\n');
  const modelReferenceKey = model?.referenceImages?.join('\n') || '';
  const selectedReferences = referenceImages.filter(image => uniqueImages.includes(image)).slice(0, MAX_REFERENCE_PHOTOS);
  const blocked = busy || disabled;

  useEffect(() => {
    if (model) setSource(model.source);
  }, [model?.url, model?.source]);

  useEffect(() => {
    if (model) setReferenceImages((model.referenceImages || []).filter(image => uniqueImages.includes(image)).slice(0, MAX_REFERENCE_PHOTOS));
  }, [model?.url, modelReferenceKey]);

  useEffect(() => {
    setReferenceImages(previous => previous.filter(image => uniqueImages.includes(image)).slice(0, MAX_REFERENCE_PHOTOS));
  }, [galleryKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      taskRef.current?.cancel();
      taskRef.current = null;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  const changeSource = (next: AutomotiveModel3D['source']) => {
    if (blocked) return;
    setSource(next);
    if (model) {
      const { referenceImages: _previous, ...rest } = model;
      onChange({ ...rest, source: next, ...(next === 'photos' ? { referenceImages: selectedReferences } : {}) });
    }
  };

  const toggleReference = (url: string) => {
    if (blocked) return;
    if (!selectedReferences.includes(url) && selectedReferences.length >= MAX_REFERENCE_PHOTOS) {
      setError(`Selecione até ${MAX_REFERENCE_PHOTOS} fotos de referência para este modelo.`);
      return;
    }
    setError('');
    const next = selectedReferences.includes(url) ? selectedReferences.filter(image => image !== url) : [...selectedReferences, url];
    setReferenceImages(next);
    if (model && source === 'photos') onChange({ ...model, referenceImages: next });
  };

  const cancelUpload = () => {
    operationRef.current += 1;
    taskRef.current?.cancel();
    taskRef.current = null;
    setBusy(false);
    setProgress(null);
    onBusyChange(false);
    setError('Envio cancelado. Nenhum modelo novo foi vinculado.');
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || blocked) return;
    setError('');
    if (!establishmentId || auth.currentUser?.uid !== establishmentId) {
      setError('Entre na conta responsável por este estabelecimento para enviar o modelo 3D.');
      return;
    }
    if (!/\.glb$/i.test(file.name)) {
      setError('Selecione um arquivo 3D no formato .glb. Fotos são referências para produzir o modelo.');
      return;
    }
    if (file.size > MAX_MODEL3D_BYTES) {
      setError(`O modelo deve ter no máximo ${formatSize(MAX_MODEL3D_BYTES)}.`);
      return;
    }
    if (file.name.length > 160 || /[\u0000-\u001f/\\]/.test(file.name)) {
      setError('Use um nome de arquivo com até 160 caracteres, sem barras ou caracteres especiais de controle.');
      return;
    }
    const operation = ++operationRef.current;
    const isCurrent = () => mountedRef.current && operation === operationRef.current;
    setBusy(true);
    setProgress(null);
    onBusyChange(true);
    try {
      validateGlb(await file.arrayBuffer());
      if (!isCurrent()) return;
      if (auth.currentUser?.uid !== establishmentId) throw new Error('Sua sessão mudou. Entre novamente antes de enviar o modelo.');
      const storageRef = ref(storage, `automotive-models/${establishmentId}/${crypto.randomUUID()}.glb`);
      const task = uploadBytesResumable(storageRef, file, { contentType: 'model/gltf-binary' });
      taskRef.current = task;
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', snapshot => {
          if (isCurrent()) setProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100));
        }, reject, resolve);
      });
      if (!isCurrent()) return;
      const url = await getDownloadURL(task.snapshot.ref);
      if (!isCurrent()) return;
      if (auth.currentUser?.uid !== establishmentId) throw new Error('Sua sessão mudou. Entre novamente antes de vincular o modelo.');
      const nextModel = sanitizeModel3d({
        url,
        fileName: file.name,
        sizeBytes: file.size,
        source,
        ...(source === 'photos' ? { referenceImages: selectedReferences } : {}),
      }, establishmentId);
      if (!nextModel) throw new Error('Não foi possível vincular o arquivo enviado. Tente novamente.');
      onChange(nextModel);
      setShowPreview(true);
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
      setError(code === 'storage/unauthorized'
        ? 'Sua conta não tem permissão para enviar modelos deste estabelecimento.'
        : code.startsWith('storage/')
          ? 'Não foi possível enviar o modelo. Verifique a conexão e tente novamente.'
          : cause instanceof Error ? cause.message : 'Não foi possível validar o arquivo 3D.');
    } finally {
      if (isCurrent()) {
        taskRef.current = null;
        setBusy(false);
        setProgress(null);
        onBusyChange(false);
      }
    }
  };

  return (
    <section className="space-y-3 border-t border-slate-800/80 pt-4" aria-labelledby="automotive-model-editor-title">
      <div>
        <h4 id="automotive-model-editor-title" className="flex items-center gap-2 text-sm font-bold text-white"><Box className="h-4 w-4 text-indigo-300" /> Escapamento 3D deste projeto</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">Envie o modelo pronto da peça em .glb para que o cliente explore este projeto. As fotos ajudam na modelagem; enviá-las à galeria não gera um 3D automaticamente.</p>
      </div>

      <fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
        <div>
          <label htmlFor="automotive-model-source" className="mb-1 block text-xs font-semibold text-slate-300">Como o modelo foi produzido?</label>
          <select id="automotive-model-source" value={source} onChange={event => changeSource(event.target.value as AutomotiveModel3D['source'])} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white">
            <option value="photos">Modelado a partir de fotos</option>
            <option value="cad">Projeto CAD da peça</option>
            <option value="scan">Escaneamento 3D / fotogrametria</option>
          </select>
        </div>

        {source === 'photos' && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-300">Fotos usadas como referência <span className="font-normal text-slate-500">(opcional, até {MAX_REFERENCE_PHOTOS})</span></p>
            {uniqueImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {uniqueImages.map((url, index) => {
                  const selected = selectedReferences.includes(url);
                  return <button type="button" key={url} aria-label={`Usar foto ${index + 1} como referência 3D`} aria-pressed={selected} onClick={() => toggleReference(url)} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${selected ? 'border-indigo-400' : 'border-slate-700'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300`}>
                    <img src={url} alt={`Foto de referência ${index + 1}`} className="h-full w-full object-cover" />
                    {selected && <span className="absolute right-1 top-1 rounded-full bg-indigo-500 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                  </button>;
                })}
              </div>
            ) : <p className="text-xs text-slate-500">Adicione as fotos do escapamento à galeria para selecioná-las aqui.</p>}
          </div>
        )}
      </fieldset>

      <input ref={inputRef} type="file" accept=".glb,model/gltf-binary" className="hidden" aria-label="Enviar arquivo GLB do escapamento" onChange={handleUpload} disabled={blocked} />
      {busy ? (
        <div className="space-y-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3" aria-busy="true">
          <div className="flex items-center justify-between gap-2">
            <p role="status" className="flex items-center gap-2 text-xs text-indigo-200"><Loader2 className="h-4 w-4 animate-spin" /> {progress === null ? 'Validando o modelo 3D...' : `Enviando modelo: ${progress}%`}</p>
            <button type="button" onClick={cancelUpload} className="rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">Cancelar envio</button>
          </div>
          {progress !== null && <progress aria-label="Progresso do envio do modelo 3D" value={progress} max={100} className="h-2 w-full accent-indigo-400" />}
          <p className="text-[11px] text-slate-400">Aguarde ou cancele o envio antes de salvar ou fechar o projeto.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          {model && <div className="mb-3 flex items-start gap-2 text-xs text-slate-300"><Box className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" /><div className="min-w-0"><p className="break-all font-semibold text-white">{model.fileName}</p><p className="mt-0.5 text-slate-500">{formatSize(model.sizeBytes)} · vinculado ao projeto</p></div></div>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> {model ? 'Substituir .glb' : 'Enviar modelo .glb'}</button>
            {model && <>
              <button type="button" onClick={() => setShowPreview(previous => !previous)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">{showPreview ? 'Ocultar prévia' : 'Visualizar modelo'}</button>
              <button type="button" disabled={disabled} onClick={() => { onChange(null); setShowPreview(false); setError(''); }} className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Desvincular 3D</button>
            </>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Até {formatSize(MAX_MODEL3D_BYTES)}. O arquivo deve incluir as próprias texturas. Salve o projeto para publicar a alteração.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}

      {model && showPreview && <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b0e12] text-white">
        <ModelPreviewBoundary key={model.url}>
          <Suspense fallback={<p role="status" className="flex items-center gap-2 p-4 text-xs text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo prévia 3D...</p>}>
            <ProjectModelScene accent={accent} model={model} projectName={projectName || 'Escapamento do projeto'} fallbackImage={images[0]} />
          </Suspense>
        </ModelPreviewBoundary>
        <p className="border-t border-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-400">Gire e aproxime para conferir a peça. A separação dos componentes aparece quando o modelo foi preparado com peças independentes.</p>
      </div>}
    </section>
  );
}
