import {execFile} from 'child_process';
import {promisify} from 'util';
import {mkdtemp,writeFile,readFile,rm} from 'fs/promises';
import {tmpdir} from 'os';
import path from 'path';
import ffmpeg from 'ffmpeg-static';
import {storeInboxMedia} from './inbox';
const exec=promisify(execFile);
export function decodeChatUpload(input:string, kind:string) {
  const match=/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(input);
  if(!match)throw new Error('Selecione um arquivo válido do aparelho.');
  const mime=match[1].toLowerCase();
  const allowed:any={image:['image/jpeg','image/png','image/webp','image/gif'],video:['video/mp4','video/webm','video/quicktime'],audio:['audio/webm','audio/ogg','audio/mp4','audio/m4a','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/mpeg','audio/mp3']};
  if(!allowed[kind]?.includes(mime))throw new Error('Formato de arquivo não suportado neste envio.');
  const bytes=Buffer.from(match[2],'base64');
  const max=kind==='image'?8*1024*1024:20*1024*1024;
  if(!bytes.length||bytes.length>max)throw new Error(kind==='image'?'A imagem deve ter até 8 MB.':'O arquivo deve ter até 20 MB.');
  return {mime,bytes,data:bytes.toString('base64')};
}
export async function normalizeChatAudio(data:string,mime:string):Promise<{data:string;mimeType:string}> {
  if(!ffmpeg)throw new Error('Conversor de áudio indisponível.');
  const folder=await mkdtemp(path.join(tmpdir(),'chat-audio-'));
  try {
    const input=path.join(folder,'input'),output=path.join(folder,'voice.m4a');
    await writeFile(input,Buffer.from(data,'base64'));
    await exec(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',input,'-vn','-c:a','aac','-b:a','96k','-movflags','+faststart',output],{timeout:45000,maxBuffer:1024*1024});
    return {data:(await readFile(output)).toString('base64'),mimeType:'audio/mp4'};
  } finally {await rm(folder,{recursive:true,force:true});}
}
export async function hostChatUpload(store:string,contact:string,input:string,kind:string) {
  const parsed=decodeChatUpload(input,kind);
  const media=kind==='audio'?await normalizeChatAudio(parsed.data,parsed.mime):{data:parsed.data,mimeType:parsed.mime};
  const url=await storeInboxMedia(store,contact,media);
  return {url,...media};
}
