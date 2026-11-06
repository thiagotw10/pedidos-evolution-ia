// Transport identity takes precedence over attribution (e.g. paid traffic).
export function projectChannel(p:{phone?:string;source?:string;whatsappConnected?:boolean}):'INSTAGRAM'|'WHATSAPP'|'SITE'|'OTHER'{
 if(/^(ig_|instagram_)/.test(String(p.phone||''))||p.source==='instagram_ai')return 'INSTAGRAM';
 if(p.source==='whatsapp_ai'||p.whatsappConnected)return 'WHATSAPP';
 if(p.source==='public_site')return 'SITE';
 return 'OTHER';
}
export function channelLeadCount(projects:Array<{id:string;phone?:string;source?:string;whatsappConnected?:boolean}>,channel:ReturnType<typeof projectChannel>){
 return new Set(projects.filter(p=>projectChannel(p)===channel).map(p=>p.phone?String(p.phone).replace(/^(ig_|instagram_)/,'ig_'):p.id)).size;
}
