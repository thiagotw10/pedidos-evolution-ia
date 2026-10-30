"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeChatUpload = decodeChatUpload;
exports.normalizeChatAudio = normalizeChatAudio;
exports.hostChatUpload = hostChatUpload;
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = __importDefault(require("path"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const inbox_1 = require("./inbox");
const exec = (0, util_1.promisify)(child_process_1.execFile);
function decodeChatUpload(input, kind) {
    const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(input);
    if (!match)
        throw new Error('Selecione um arquivo válido do aparelho.');
    const mime = match[1].toLowerCase();
    const allowed = { image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], video: ['video/mp4', 'video/webm', 'video/quicktime'], audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'] };
    if (!allowed[kind]?.includes(mime))
        throw new Error('Formato de arquivo não suportado neste envio.');
    const bytes = Buffer.from(match[2], 'base64');
    const max = kind === 'image' ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!bytes.length || bytes.length > max)
        throw new Error(kind === 'image' ? 'A imagem deve ter até 8 MB.' : 'O arquivo deve ter até 20 MB.');
    return { mime, bytes, data: bytes.toString('base64') };
}
async function normalizeChatAudio(data, mime) {
    if (!ffmpeg_static_1.default)
        throw new Error('Conversor de áudio indisponível.');
    const folder = await (0, promises_1.mkdtemp)(path_1.default.join((0, os_1.tmpdir)(), 'chat-audio-'));
    try {
        const input = path_1.default.join(folder, 'input'), output = path_1.default.join(folder, 'voice.m4a');
        await (0, promises_1.writeFile)(input, Buffer.from(data, 'base64'));
        await exec(ffmpeg_static_1.default, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', output], { timeout: 45000, maxBuffer: 1024 * 1024 });
        return { data: (await (0, promises_1.readFile)(output)).toString('base64'), mimeType: 'audio/mp4' };
    }
    finally {
        await (0, promises_1.rm)(folder, { recursive: true, force: true });
    }
}
async function hostChatUpload(store, contact, input, kind) {
    const parsed = decodeChatUpload(input, kind);
    const media = kind === 'audio' ? await normalizeChatAudio(parsed.data, parsed.mime) : { data: parsed.data, mimeType: parsed.mime };
    const url = await (0, inbox_1.storeInboxMedia)(store, contact, media);
    return { url, ...media };
}
//# sourceMappingURL=chatMedia.js.map