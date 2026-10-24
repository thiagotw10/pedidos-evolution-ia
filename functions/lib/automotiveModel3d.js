"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model3dValidationError = exports.MAX_MODEL3D_TRIANGLES = exports.MAX_MODEL3D_VERTICES = exports.MODEL3D_STORAGE_BUCKET = exports.MAX_MODEL3D_BYTES = void 0;
exports.model3dStoragePath = model3dStoragePath;
exports.sanitizeModel3d = sanitizeModel3d;
exports.model3dUpdate = model3dUpdate;
exports.model3dForPublic = model3dForPublic;
exports.validateGlb = validateGlb;
exports.MAX_MODEL3D_BYTES = 70 * 1024 * 1024;
exports.MODEL3D_STORAGE_BUCKET = 'iapedido.firebasestorage.app';
exports.MAX_MODEL3D_VERTICES = 5_000_000;
exports.MAX_MODEL3D_TRIANGLES = 5_000_000;
const UUID_GLB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$/i;
class Model3dValidationError extends Error {
    constructor(message) { super(message); this.name = 'Model3dValidationError'; }
}
exports.Model3dValidationError = Model3dValidationError;
function invalid(message) { throw new Model3dValidationError(message); }
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function uint(value, max = Number.MAX_SAFE_INTEGER) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
/** Only the current project's Firebase download URLs, in this canonical tenant path. */
function model3dStoragePath(url, storeId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(storeId))
        invalid('Identificador da loja inválido.');
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        invalid('Endereço do modelo 3D inválido.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com' || parsed.port || parsed.username || parsed.password || parsed.hash)
        invalid('Use um modelo enviado para o armazenamento desta loja.');
    const prefix = `/v0/b/${exports.MODEL3D_STORAGE_BUCKET}/o/`;
    if (!parsed.pathname.startsWith(prefix) || parsed.searchParams.get('alt') !== 'media')
        invalid('Use um modelo enviado para o armazenamento deste projeto.');
    let storagePath;
    try {
        storagePath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    }
    catch {
        invalid('Caminho do modelo 3D inválido.');
    }
    const parts = storagePath.split('/');
    if (parts.length !== 3 || parts[0] !== 'automotive-models' || parts[1] !== storeId || !UUID_GLB.test(parts[2]))
        invalid('O modelo 3D precisa pertencer a esta loja.');
    return storagePath;
}
function sanitizeModel3d(value, storeId) {
    if (value === null || value === undefined)
        return null;
    if (!object(value))
        invalid('Dados do modelo 3D inválidos.');
    if (typeof value.url !== 'string' || value.url.length > 2048)
        invalid('Endereço do modelo 3D inválido.');
    model3dStoragePath(value.url, storeId);
    if (typeof value.fileName !== 'string' || !value.fileName.trim() || value.fileName.length > 160 || /[\u0000-\u001f/\\]/.test(value.fileName) || !/\.glb$/i.test(value.fileName.trim()))
        invalid('O modelo deve ser um arquivo .glb.');
    if (!uint(value.sizeBytes, exports.MAX_MODEL3D_BYTES) || value.sizeBytes < 28)
        invalid('O modelo 3D deve ter até 70 MB.');
    if (!['photos', 'cad', 'scan'].includes(value.source))
        invalid('Informe a origem do modelo 3D.');
    if (value.referenceImages !== undefined && (!Array.isArray(value.referenceImages) || value.referenceImages.length > 20 || value.referenceImages.some((item) => typeof item !== 'string' || item.length > 2048 || !/^https:\/\//.test(item))))
        invalid('Fotos de referência do modelo inválidas.');
    return {
        url: value.url, fileName: value.fileName.trim(), sizeBytes: value.sizeBytes, source: value.source,
        ...(value.referenceImages?.length ? { referenceImages: [...new Set(value.referenceImages)] } : {})
    };
}
function withGalleryReferences(model, galleryImages) {
    if (!model)
        return null;
    const gallery = new Set(Array.isArray(galleryImages) ? galleryImages.filter(item => typeof item === 'string') : []);
    const referenceImages = model.source === 'photos' ? model.referenceImages?.filter(url => gallery.has(url)) : undefined;
    const { referenceImages: _ignored, ...rest } = model;
    return referenceImages?.length ? { ...rest, referenceImages } : rest;
}
/** Missing field preserves an older model; explicit null removes its association. */
function model3dUpdate(body, storeId, galleryImages) {
    if (!Object.prototype.hasOwnProperty.call(body, 'model3d'))
        return {};
    const model = withGalleryReferences(sanitizeModel3d(body.model3d, storeId), galleryImages);
    // Firestore merge:true merges maps, so an empty array must explicitly replace old photos.
    return { model3d: model ? { ...model, referenceImages: model.referenceImages || [] } : null };
}
/** Legacy or manually altered metadata must never break the public catalog. */
function model3dForPublic(value, storeId, galleryImages) {
    try {
        return withGalleryReferences(sanitizeModel3d(value, storeId), galleryImages);
    }
    catch {
        return null;
    }
}
/** Validate a mobile-sized, static, self-contained GLB before GLTFLoader sees it. */
function validateGlb(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 28 || buffer.byteLength > exports.MAX_MODEL3D_BYTES)
        invalid('Envie um arquivo GLB de até 70 MB.');
    const data = new DataView(buffer);
    if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2 || data.getUint32(8, true) !== buffer.byteLength)
        invalid('Arquivo GLB inválido. Exporte no formato glTF 2.0 binário.');
    let offset = 12;
    let jsonBytes = null;
    let binaryOffset = 0;
    let binaryLength = 0;
    while (offset < buffer.byteLength) {
        if (offset + 8 > buffer.byteLength)
            invalid('Arquivo GLB incompleto.');
        const length = data.getUint32(offset, true);
        const type = data.getUint32(offset + 4, true);
        if (!length || length % 4 || offset + 8 + length > buffer.byteLength)
            invalid('Estrutura do arquivo GLB inválida.');
        if (offset === 12 && type === 0x4e4f534a)
            jsonBytes = new Uint8Array(buffer, offset + 8, length);
        else if (jsonBytes && type === 0x004e4942 && !binaryLength) {
            binaryOffset = offset + 8;
            binaryLength = length;
        }
        else
            invalid('Use um GLB com um bloco JSON e um único bloco binário.');
        offset += 8 + length;
    }
    if (!jsonBytes || !binaryLength)
        invalid('O arquivo GLB precisa conter as peças e a geometria.');
    let doc;
    try {
        doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
    }
    catch {
        invalid('JSON interno do GLB inválido.');
    }
    if (!object(doc) || !object(doc.asset) || doc.asset.version !== '2.0')
        invalid('Use um modelo glTF 2.0.');
    let visited = 0;
    const unsupported = new Set(['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression', 'EXT_mesh_gpu_instancing']);
    function inspect(value, depth = 0) {
        if (++visited > 300_000 || depth > 64)
            invalid('Modelo com metadados complexos demais. Simplifique o arquivo.');
        if (typeof value === 'number' && !Number.isFinite(value))
            invalid('O modelo contém valores numéricos inválidos.');
        if (Array.isArray(value)) {
            for (const item of value)
                inspect(item, depth + 1);
        }
        else if (object(value))
            for (const [key, child] of Object.entries(value)) {
                if (unsupported.has(key) || ((key === 'extensionsUsed' || key === 'extensionsRequired') && Array.isArray(child) && child.some(item => unsupported.has(item))))
                    invalid('Exporte sem compressão Draco, Meshopt, KTX2/Basis ou instâncias de GPU.');
                // No loader may make a second request from untrusted asset data.
                if (key === 'uri')
                    invalid('Inclua todas as texturas e peças dentro do arquivo GLB, sem links externos.');
                inspect(child, depth + 1);
            }
    }
    inspect(doc);
    if (doc.animations?.length || doc.skins?.length)
        invalid('Exporte um modelo estático, com as peças separadas e sem animações ou rigging.');
    function list(key, max, required = false) {
        if (doc[key] === undefined && !required)
            return [];
        if (!Array.isArray(doc[key]) || doc[key].length > max || (required && !doc[key].length) || doc[key].some((item) => !object(item)))
            invalid(`Estrutura ${key} do modelo inválida.`);
        return doc[key];
    }
    const buffers = list('buffers', 1, true);
    if (buffers.length !== 1 || !uint(buffers[0].byteLength, binaryLength) || buffers[0].byteLength < binaryLength - 3)
        invalid('Bloco binário do modelo inválido.');
    const views = list('bufferViews', 16_384, true);
    for (const view of views) {
        const start = view.byteOffset ?? 0;
        if (view.buffer !== 0 || !uint(start) || !uint(view.byteLength) || view.byteLength < 1 || start + view.byteLength > buffers[0].byteLength || (view.byteStride !== undefined && (!uint(view.byteStride, 252) || view.byteStride < 4 || view.byteStride % 4)))
            invalid('Geometria ou textura fora dos limites do arquivo.');
    }
    const accessors = list('accessors', 16_384, true);
    const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    const layouts = [];
    let inspectedComponents = 0;
    for (const accessor of accessors) {
        if (accessor.sparse !== undefined)
            invalid('Exporte o modelo sem accessors esparsos.');
        const view = uint(accessor.bufferView, views.length - 1) ? views[accessor.bufferView] : null;
        const bytes = componentBytes[accessor.componentType];
        const count = components[accessor.type];
        const start = accessor.byteOffset ?? 0;
        const columns = accessor.type === 'MAT2' ? 2 : accessor.type === 'MAT3' ? 3 : accessor.type === 'MAT4' ? 4 : 1;
        const elementBytes = columns > 1 ? columns * Math.ceil(count / columns * bytes / 4) * 4 : count * bytes;
        const stride = view?.byteStride || elementBytes;
        if (!view || !bytes || !count || !uint(accessor.count, exports.MAX_MODEL3D_VERTICES * 6) || accessor.count < 1 || !uint(start) || stride < elementBytes || start + (accessor.count - 1) * stride + elementBytes > view.byteLength + 64)
            invalid('Dados de geometria inválidos ou grandes demais.');
        inspectedComponents += accessor.count * count;
        if (inspectedComponents > 120_000_000)
            invalid('Modelo com dados de geometria repetidos ou complexos demais. Simplifique os accessors.');
        for (const key of ['min', 'max'])
            if (accessor[key] !== undefined && (!Array.isArray(accessor[key]) || accessor[key].length !== count || accessor[key].some((value) => typeof value !== 'number' || !Number.isFinite(value))))
                invalid('Limites da geometria inválidos.');
        const layout = { start: binaryOffset + (view.byteOffset ?? 0) + start, stride };
        layouts.push(layout);
        if (accessor.componentType === 5126) {
            const step = accessor.count > 50_000 ? Math.ceil(accessor.count / 50_000) : 1;
            for (let i = 0; i < accessor.count; i += step)
                for (let c = 0; c < count; c++)
                    if (!Number.isFinite(data.getFloat32(layout.start + i * stride + c * bytes, true)))
                        invalid('O modelo contém geometria com valores inválidos.');
        }
    }
    const meshes = list('meshes', 8192, true);
    let vertices = 0;
    let triangles = 0;
    let primitiveCount = 0;
    const meshBudgets = [];
    function accessorAt(index) {
        if (!uint(index, accessors.length - 1))
            invalid('Referência de geometria inválida.');
        return accessors[index];
    }
    for (const mesh of meshes) {
        const before = { vertices, triangles };
        if (!Array.isArray(mesh.primitives) || !mesh.primitives.length)
            invalid('O modelo precisa conter peças com geometria.');
        for (const primitive of mesh.primitives) {
            if (++primitiveCount > 16_384 || !object(primitive) || !object(primitive.attributes))
                invalid('Modelo com peças inválidas ou numerosas demais.');
            const position = accessorAt(primitive.attributes.POSITION);
            if (position.type !== 'VEC3' || position.componentType !== 5126)
                invalid('Posições das peças devem usar VEC3 em ponto flutuante.');
            vertices += position.count;
            for (const index of Object.values(primitive.attributes))
                if (accessorAt(index).count !== position.count)
                    invalid('Atributos de geometria incompatíveis.');
            if (primitive.targets !== undefined)
                invalid('Exporte as peças sem morph targets.');
            const mode = primitive.mode ?? 4;
            if (![4, 5, 6].includes(mode))
                invalid('Exporte superfícies trianguladas, sem linhas ou pontos.');
            let indicesCount = position.count;
            if (primitive.indices !== undefined) {
                const indices = accessorAt(primitive.indices);
                if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType))
                    invalid('Índices de geometria inválidos.');
                const layout = layouts[primitive.indices];
                indicesCount = indices.count;
                const step = indices.count > 50_000 ? Math.ceil(indices.count / 50_000) : 1;
                for (let i = 0; i < indices.count; i += step) {
                    const at = layout.start + i * layout.stride;
                    const index = indices.componentType === 5121 ? data.getUint8(at) : indices.componentType === 5123 ? data.getUint16(at, true) : data.getUint32(at, true);
                    if (index >= position.count)
                        invalid('Índice de geometria fora dos limites da peça.');
                }
            }
            if (indicesCount < 3 || (mode === 4 && indicesCount % 3))
                invalid('Superfície triangulada inválida.');
            triangles += mode === 4 ? indicesCount / 3 : indicesCount - 2;
            if (vertices > exports.MAX_MODEL3D_VERTICES || triangles > exports.MAX_MODEL3D_TRIANGLES)
                invalid('Simplifique para até 5 milhões de vértices e triângulos.');
        }
        meshBudgets.push({ vertices: vertices - before.vertices, triangles: triangles - before.triangles });
    }
    const nodes = list('nodes', 8192, true);
    const parents = new Set();
    for (const node of nodes) {
        if (node.mesh !== undefined && !uint(node.mesh, meshes.length - 1))
            invalid('Peça do modelo inexistente.');
        if (node.skin !== undefined)
            invalid('Exporte sem rigging.');
        for (const [key, length] of Object.entries({ matrix: 16, translation: 3, rotation: 4, scale: 3 }))
            if (node[key] !== undefined && (!Array.isArray(node[key]) || node[key].length !== length || node[key].some((value) => typeof value !== 'number' || !Number.isFinite(value))))
                invalid('Transformação de peça inválida.');
        if (node.children !== undefined) {
            if (!Array.isArray(node.children))
                invalid('Hierarquia de peças inválida.');
            for (const child of node.children) {
                if (!uint(child, nodes.length - 1) || parents.has(child))
                    invalid('Hierarquia de peças inválida.');
                parents.add(child);
            }
        }
    }
    const visiting = new Set();
    const seen = new Set();
    function visit(index, depth = 0) {
        if (visiting.has(index) || depth > 128)
            invalid('Hierarquia de peças circular ou complexa demais.');
        if (seen.has(index))
            return;
        visiting.add(index);
        for (const child of nodes[index].children || [])
            visit(child, depth + 1);
        visiting.delete(index);
        seen.add(index);
    }
    nodes.forEach((_node, index) => visit(index));
    const scenes = list('scenes', 64, true);
    if (doc.scene !== undefined && !uint(doc.scene, scenes.length - 1))
        invalid('Cena principal inválida.');
    for (const scene of scenes)
        if (!Array.isArray(scene.nodes) || scene.nodes.length > nodes.length || new Set(scene.nodes).size !== scene.nodes.length || scene.nodes.some((index) => !uint(index, nodes.length - 1) || parents.has(index)))
            invalid('Cena do modelo inválida.');
    const active = new Set();
    function activate(index) { if (active.has(index))
        return; active.add(index); for (const child of nodes[index].children || [])
        activate(child); }
    for (const index of scenes[doc.scene ?? 0].nodes)
        activate(index);
    if (![...active].some(index => nodes[index].mesh !== undefined))
        invalid('A cena principal precisa mostrar ao menos uma peça.');
    let sceneVertices = 0;
    let sceneTriangles = 0;
    for (const scene of scenes) {
        const sceneNodes = new Set();
        function collect(index) { if (sceneNodes.has(index))
            return; sceneNodes.add(index); for (const child of nodes[index].children || [])
            collect(child); }
        for (const index of scene.nodes)
            collect(index);
        for (const index of sceneNodes)
            if (nodes[index].mesh !== undefined) {
                sceneVertices += meshBudgets[nodes[index].mesh].vertices;
                sceneTriangles += meshBudgets[nodes[index].mesh].triangles;
            }
    }
    if (sceneVertices > exports.MAX_MODEL3D_VERTICES || sceneTriangles > exports.MAX_MODEL3D_TRIANGLES)
        invalid('Simplifique a quantidade de peças repetidas na cena para uso no celular.');
    const images = list('images', 64);
    let texturePixels = 0;
    for (const image of images) {
        if (!uint(image.bufferView, views.length - 1) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType))
            invalid('Inclua texturas PNG, JPEG ou WebP dentro do GLB.');
        const view = views[image.bufferView];
        const bytes = new Uint8Array(buffer, binaryOffset + (view.byteOffset ?? 0), view.byteLength);
        const [width, height] = textureSize(bytes, image.mimeType);
        texturePixels += width * height;
        if (!width || !height || width > 4096 || height > 4096 || texturePixels > 16_777_216)
            invalid('Use texturas de até 4096 px por lado e 16 megapixels no total.');
    }
    const samplers = list('samplers', 128);
    const textures = list('textures', 128);
    for (const texture of textures)
        if (!uint(texture.source, images.length - 1) || (texture.sampler !== undefined && !uint(texture.sampler, samplers.length - 1)))
            invalid('Textura do modelo inválida.');
    const materials = list('materials', 1024);
    for (const mesh of meshes)
        for (const primitive of mesh.primitives)
            if (primitive.material !== undefined && !uint(primitive.material, materials.length - 1))
                invalid('Material de peça inexistente.');
    function inspectTextures(value) {
        if (Array.isArray(value))
            value.forEach(inspectTextures);
        else if (object(value))
            for (const [key, child] of Object.entries(value)) {
                if (/Texture$/.test(key) && object(child) && !uint(child.index, textures.length - 1))
                    invalid('Referência de textura inválida.');
                inspectTextures(child);
            }
    }
    materials.forEach(inspectTextures);
}
/** Read image dimensions before image decoding can allocate large GPU/bitmap memory. */
function textureSize(bytes, mime) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset, value) => bytes.length >= offset + value.length && [...value].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
    if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 'IHDR'))
        return [view.getUint32(16), view.getUint32(20)];
    if (mime === 'image/jpeg' && bytes.length > 10 && view.getUint16(0) === 0xffd8) {
        let offset = 2;
        while (offset + 4 <= bytes.length) {
            if (bytes[offset++] !== 0xff)
                break;
            while (bytes[offset] === 0xff)
                offset++;
            const marker = bytes[offset++];
            if (marker === 0xd9 || marker === 0xda)
                break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
                continue;
            if (offset + 2 > bytes.length)
                break;
            const length = view.getUint16(offset);
            if (length < 2 || offset + length > bytes.length)
                break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8)
                return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
            offset += length;
        }
    }
    if (mime === 'image/webp' && bytes.length >= 20 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
        const uint24 = (offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
        if (ascii(12, 'VP8X') && bytes.length >= 30)
            return [uint24(24) + 1, uint24(27) + 1];
        if (ascii(12, 'VP8L') && bytes.length >= 25 && bytes[20] === 0x2f) {
            const packed = view.getUint32(21, true);
            return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
        }
        if (ascii(12, 'VP8 ') && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
            return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    invalid('Textura embutida inválida ou não reconhecida.');
}
//# sourceMappingURL=automotiveModel3d.js.map