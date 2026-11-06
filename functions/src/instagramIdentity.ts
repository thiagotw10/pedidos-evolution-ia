import * as admin from 'firebase-admin';
export const instagramUsername=(value:any):string=>typeof value==='string'&&/^[a-zA-Z0-9._]{1,30}$/.test(value.replace(/^@/,''))?value.replace(/^@/,''):'';
export function identityPatch(profile:any,current:any={}) {
 const username=instagramUsername(profile?.username);
 const name=typeof profile?.name==='string'?profile.name.trim().slice(0,100):'';
 if(!username&&!name)return {};
 const generic=!current.customerName||['Cliente Instagram','Cliente',current.instagramUsername,'@'+current.instagramUsername].includes(current.customerName);
 return {...(username?{instagramUsername:username}:{}),...(name?{instagramProfileName:name}:{}),...(generic?{customerName:name||(username?'@'+username:current.customerName)}:{})};
}
// Owner-scoped lookup; never use an account token for another account's contact.
export async function refreshInstagramIdentity(db:admin.firestore.Firestore,storeId:string,chatId:string,graph:(path:string,token:string)=>Promise<any>) {
 const chat=db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
 const [saved,connection]=await Promise.all([chat.get(),db.collection('instagramConnections').doc(storeId).get()]);
 const current=saved.data(),c=connection.data();
 if(!current||current.channel!=='instagram'||!c?.connected||!c.accessToken||c.accountId!==current.instagramAccountId||!/^\d+$/.test(current.instagramSenderId||''))return {};
 if(Date.now()-Date.parse(current.instagramProfileCheckedAt||'')< (current.instagramUsername?86400000:3600000))return {};
 let patch:any={};let status='unavailable';
 try{patch=identityPatch(await graph(`${current.instagramSenderId}?fields=name,username`,c.accessToken),current);if(Object.keys(patch).length)status='resolved';}catch{/* Profile failure must never interrupt customer service. */}
 await db.runTransaction(async tx=>{const [live,account]=await Promise.all([tx.get(chat),tx.get(db.collection('instagramConnections').doc(storeId))]);if(live.data()?.instagramAccountId!==c.accountId||account.data()?.accountId!==c.accountId||!account.data()?.connected)return;const safe=identityPatch({username:patch.instagramUsername,name:patch.instagramProfileName},live.data());tx.set(chat,{...safe,instagramProfileCheckedAt:new Date().toISOString(),instagramProfileStatus:status},{merge:true});});
 return patch;
}
