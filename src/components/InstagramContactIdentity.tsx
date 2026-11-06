import React,{useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db} from '../lib/firebase';
export function InstagramContactIdentity({contactId}:{contactId:string}){
 const [identity,setIdentity]=useState<{instagramUsername?:string;instagramProfileName?:string}>({});
 useEffect(()=>{setIdentity({});const uid=auth.currentUser?.uid;if(!uid||!/^ig_\d+$/.test(contactId))return;return onSnapshot(doc(db,'establishments',uid,'chats',contactId),s=>setIdentity(s.data()||{}),()=>{});},[contactId]);
 const username=identity.instagramUsername;
 if(!username||!/^[a-zA-Z0-9._]{1,30}$/.test(username))return null;
 return <a href={`https://www.instagram.com/${username}/`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="block truncate text-xs text-pink-400" title="Abrir perfil no Instagram">{identity.instagramProfileName?`${identity.instagramProfileName} · `:''}@{username}</a>;
}
