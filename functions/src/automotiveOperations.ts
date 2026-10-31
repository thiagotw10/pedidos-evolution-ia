import {openInternalConsultation} from './internalConsultation';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import {normalizeAuto} from './automotiveConversation';
import {lookupPostalAddress,postalSummary,PostalAddress} from './postalAddress';
import {operationSession,operationsRef,garageState,garageSlots,kitFits,localGarageDay,validGarageDay,reserveGarage} from './garage';
const phoneOf=(id:string)=>/^(ig_|instagram_)/.test(id)?'':id.replace(/\D/g,'');
const affirmative=(t:string)=>/^(sim|sim pode|confirmo|confirmado|confirmar|pode confirmar|pode reservar|esta certo|isso|correto|correta|e isso|pode ser|ok)[.! ]*$/.test(normalizeAuto(t));
const negative=(t:string)=>/^(nao|negativo|errado|incorreto|cancelar|cancela|nao quero)[.! ]*$/.test(normalizeAuto(t));
export function operationDay(text:string,clock=Date.now()) {
  const t=normalizeAuto(text),iso=t.match(/\b(20\d{2}-\d{2}-\d{2})\b/),br=t.match(/\b(\d{2})\/(\d{2})(?:\/(20\d{2}))?\b/);
  if(iso)return validGarageDay(iso[1])?iso[1]:null;
  if(br){const day=`${br[3] || localGarageDay(new Date(clock)).slice(0,4)}-${br[2]}-${br[1]}`;return validGarageDay(day)?day:null;}
  if(/\bhoje\b/.test(t))return localGarageDay(new Date(clock));
  if(/\bamanha\b/.test(t))return localGarageDay(new Date(clock+86400000));
  const days=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  const target=days.findIndex(d=>new RegExp(`\\b${d}\\b`).test(t));
  if(target>=0){const current=new Date(`${localGarageDay(new Date(clock))}T12:00:00-03:00`).getUTCDay();return localGarageDay(new Date(clock+((target-current+7)%7 || 7)*86400000));}
  return null;
}
export function isOperationsRequest(text:string) {return /\b(cep|entrega|frete|envio|agendar|agendamento|marcar|vaga|vagas|estoque|disponibilidade|horario disponivel|tem.*(?:kit|escape|peca).*disponivel)\b/.test(normalizeAuto(text));}
export async function resolveAutomotiveOperations(db:admin.firestore.Firestore,storeId:string,contactId:string,profile:string,ctx:any,input:string,lookup=lookupPostalAddress,allowCommit=true):Promise<{replyText:string;kind:string}|null> {
  const sessionRef=operationSession(db,storeId,contactId,profile),session=(await sessionRef.get()).data() || {},t=normalizeAuto(input),iso=new Date().toISOString();
  const save=async(data:any)=>sessionRef.set({...data,updatedAt:iso,contactId,profile},{merge:true});
  const response=(replyText:string,kind='operations')=>({replyText:kind==='operations' && /\b(preco|valor|quanto custa)\b/.test(t)?replyText+'\nO valor precisa ser confirmado no orçamento da oficina.':replyText,kind});
  const diversion=/\b(fotos?|videos?|imagens?|preco|valor|orcamento|atendente|humano|endereco da loja|onde fica)\b/.test(t);
  if(/\b(cancelar|cancela|cancele|remarcar|reagendar|alterar.*(?:reserva|horario))\b/.test(t) && session.garage?.lastBooking) return response('Você já tem uma reserva confirmada. Para cancelá-la ou mudar o horário, fale com a equipe da oficina. Não alterei sua reserva.');
  if(negative(input) && (session.garage?.stage || session.shipping?.stage)) {await save({garage:null,shipping:null});return response('Tudo bem, interrompi essa etapa. Como posso ajudar?');}
  const cep=input.match(/\b(\d{5}-?\d{3})\b/)?.[1];
  const wantsShipping=/\b(cep|entrega|frete|envio)\b/.test(t) || ctx.delivery==='Envio nacional';
  if(cep && (wantsShipping || t.replace(/\D/g,'').length===8)) {
    try {
      const address=await lookup(cep);await save({shipping:{stage:'confirmCep',address,startedAt:Date.now()}});
      return response(`Consultei o CEP: ${[address.street,address.district,`${address.city}/${address.state}`].filter(Boolean).join(', ')}. É o endereço de entrega?`,'shipping');
    }catch(e:any){return response(e.message,'shipping');}
  }
  let shipping=session.shipping;
  if(shipping?.stage && !diversion && Date.now()-Number(shipping.startedAt || 0)<86400000) {
    const address:PostalAddress={...shipping.address};
    const next=async(stage:string,question:string)=>{await save({shipping:{...shipping,stage,address}});return response(question,'shipping');};
    const complete=async()=>{
      address.confirmed=true;
      const ref=db.collection('establishments').doc(storeId).collection('chats').doc(contactId);
      await save({shipping:{stage:null,address,completedAt:iso}});
      await ref.set({shippingAddress:address},{merge:true});
      if(ctx.projectId) {const project=db.collection('automotive_projects').doc(ctx.projectId),p=(await project.get()).data();if(p?.establishmentId===storeId)await project.set({shippingAddress:address},{merge:true});}
      return response(`Endereço de entrega confirmado: ${postalSummary(address)}. Destinatário: ${address.recipient}. O frete e o prazo ainda precisam ser cotados pela equipe.`,'shipping');
    };
    const advance=async()=>{
      if(!address.street)return next('street','Esse CEP não identifica uma rua específica. Qual é o nome da rua para entrega?');
      if(!address.number)return next('number','Qual é o número do endereço? Se não tiver número, diga “sem número”.');
      if(address.complement===undefined)return next('complement','Tem complemento, como apartamento ou bloco? Se não tiver, diga “sem complemento”.');
      if(!address.recipient)return next('recipient','Qual é o nome completo de quem vai receber a entrega?');
      if(!address.phone)return next('phone','Qual telefone com DDD podemos usar para contato sobre a entrega?');
      return next('confirmFull',`Confira o endereço completo: ${postalSummary(address)}. Destinatário: ${address.recipient}. Telefone: ${address.phone}. Está tudo correto?`);
    };
    if(shipping.stage==='confirmCep') {
      if(!affirmative(input))return response('Pode confirmar o endereço encontrado ou enviar o CEP correto?','shipping');
      address.phone=phoneOf(contactId) || '';
      if(ctx.customerName && ctx.customerName.trim().includes(' ') && !/^(cliente|visitante)/i.test(ctx.customerName))address.recipient=String(ctx.customerName);
      return advance();
    }
    if(shipping.stage==='confirmFull') {if(affirmative(input)){if(!allowCommit)return response('Para confirmar os dados de entrega, responda SIM por texto.','shipping');return complete();}return response('Se algum dado estiver errado, diga “cancelar” para reiniciar a coleta ou envie o CEP correto.','shipping');}
    const value=input.trim().slice(0,200);
    if(shipping.stage==='street'){if(value.length<3)return response('Informe o nome da rua, por favor.','shipping');address.street=value;}
    if(shipping.stage==='number'){if(!/^(?:\d{1,8}[a-zA-Z]?(?:[ -][a-zA-Z0-9]{1,10})?|s\/?n|sem n[uú]mero)$/i.test(value))return response('Informe somente o número do endereço ou “sem número”.','shipping');address.number=value;}
    if(shipping.stage==='complement')address.complement=/^(?:sem complemento|nao tem|nenhum|sem|nao)$/i.test(t)?'':value;
    if(shipping.stage==='recipient'){if(value.length<3 || affirmative(input))return response('Informe o nome de quem receberá a entrega.','shipping');address.recipient=value;}
    if(shipping.stage==='phone'){const phone=value.replace(/\D/g,'');if(!/^\d{10,15}$/.test(phone))return response('Informe um telefone válido com DDD.','shipping');address.phone=phone;}
    return advance();
  }
  if(/\b(cep|entrega|frete|envio)\b/.test(t) && !diversion)return response('Para consultar o endereço de entrega, qual é o seu CEP? A consulta do CEP não calcula o frete.','shipping');
  const garage=session.garage || {};
  const stockQuestion=/\b(estoque|saldo|disponivel|disponiveis)\b/.test(t) || /\b(tem|possui)\b.*\b(kit|escape|escapamento|peca)\b/.test(t) && !/\b(fotos?|videos?|imagens?|referencias?|projetos?)\b/.test(t);
  const wantsGarage=stockQuestion || /\b(quero|gostaria|pretendo|posso|preciso)\b.*\b(instalar|instalacao|colocar|montar)\b/.test(t) || operationDay(input)!==null && /\b(instalar|instalacao|colocar|montar|escape|escapamento)\b/.test(t) || /\b(agendar|agendamento|marcar|vagas?|estoque|disponibilidade|horario disponivel|tem.*(?:kit|escape|peca).*disponivel)\b/.test(t);
  if(!wantsGarage && (!garage.stage || diversion))return null;
  const root=operationsRef(db,storeId),state=garageState((await root.get()).data());

  if(stockQuestion && state.kits.some(k=>normalizeAuto(k.brand)!==normalizeAuto(ctx.brand) && t.includes(normalizeAuto(k.brand))))return response('Você quer consultar uma peça para outro veículo? Informe marca, modelo, ano e versão para eu consultar a aplicação certa.');
  if(!ctx.brand || !ctx.model){await save({garage:{...garage,stage:'qualify'}});return response('Para consultar o kit e a instalação certos, qual é a marca e o modelo do seu carro?');}
  if(!ctx.year || !/^(19|20)\d{2}$/.test(ctx.year)){await save({garage:{...garage,stage:'qualify'}});return response('Qual é o ano do carro? Preciso dele para consultar a aplicação cadastrada.');}
  if(!state.config.enabled)return openInternalConsultation(db,storeId,contactId,profile,ctx,'configuration',input,operationDay(input));
  if(!ctx.version && state.kits.some(k=>k.enabled && normalizeAuto(k.brand)===normalizeAuto(ctx.brand) && normalizeAuto(k.model)===normalizeAuto(ctx.model) && k.version)) {await save({garage:{...garage,stage:'qualify'}});return response('Qual é a versão ou motorização do carro? Preciso comparar com a aplicação aprovada do kit.');}
  const eligible=state.kits.filter(k=>k.enabled && kitFits(k,ctx));
  if(!eligible.length)return openInternalConsultation(db,storeId,contactId,profile,ctx,'technical',input,operationDay(input));
  const available=eligible.filter(k=>k.onHand-k.reserved>0);
  if(!available.length)return openInternalConsultation(db,storeId,contactId,profile,ctx,'stock',input,operationDay(input));
  if(stockQuestion && !/\b(agendar|marcar|vaga|horario)\b/.test(t))return response(`Consultei o saldo disponível: ${available.map(k=>`${k.name}: ${k.onHand-k.reserved} unidade(s)`).join('; ')}. A peça só fica reservada depois da confirmação do agendamento.`);
  const fingerprint=JSON.stringify([ctx.brand,ctx.model,ctx.year,ctx.version || '']);
  if(garage.fingerprint && garage.fingerprint!==fingerprint){await save({garage:null});return response('O veículo da conversa mudou. Vamos consultar uma nova disponibilidade para este projeto. Para qual dia você quer a instalação?');}
  if(garage.stage==='confirmBooking' && affirmative(input)) {
    if(!allowCommit)return response('Para reservar a peça e o horário combinados, responda SIM por texto.');
    try {
      const booking=await reserveGarage(db,storeId,garage.offer,{chatId:contactId,name:garage.name,phone:garage.phone,vehicle:ctx},'ai');
      await save({garage:{stage:null,lastBooking:booking.id,day:booking.day,fingerprint}});
      if(ctx.projectId){const ref=db.collection('automotive_projects').doc(ctx.projectId),p=(await ref.get()).data();if(p?.establishmentId===storeId)await ref.set({garageBooking:booking},{merge:true});}
      const date=new Date(booking.startAt).toLocaleString('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'});
      return response(`Instalação confirmada para ${date}, no ${booking.bayName}. Reservei 1 unidade de ${booking.kitName} para o seu projeto. Se precisar alterar ou cancelar, fale com nossa equipe.`,'booking_confirmed');
    }catch(e:any){await save({garage:{stage:null,fingerprint}});return response(e.message);}
  }
  if(!state.config.autoConfirm)return response('Há material cadastrado para o veículo, mas a confirmação da instalação está configurada para aprovação da equipe. Qual dia você prefere?');
  let kit=available.find(k=>k.id===garage.kitId);
  const selectedNumber=/^\s*([1-9])\s*[.!]?\s*$/.exec(input)?.[1];
  if(garage.stage==='chooseKit' && selectedNumber) {
    kit=available.find(k=>k.id===garage.options?.[Number(selectedNumber)-1]);
    if(!kit){await save({garage:null});return response('Essa opção não tem mais saldo disponível. Vamos consultar as opções novamente.');}
  }
  if(!kit && available.length===1)kit=available[0];
  if(!kit) {
    const options=available.slice(0,8);await save({garage:{stage:'chooseKit',options:options.map(k=>k.id),fingerprint,day:operationDay(input)}});
    return response(`Encontrei estas opções com saldo livre:\n${options.map((k,i)=>`${i+1}. ${k.name}`).join('\n')}\nQual delas você quer instalar? Responda pelo número.`);
  }
  if(!kit.autoBook)return openInternalConsultation(db,storeId,contactId,profile,ctx,'technical',input,operationDay(input));
  const day=operationDay(input) || garage.day;
  if(!day){await save({garage:{stage:'chooseDay',kitId:kit.id,fingerprint}});return response('Para qual dia você quer consultar a instalação? Pode informar dia/mês/ano.');}
  const bookings=(await root.collection('calendar').doc(day).get()).data()?.bookings || [];
  if(garage.stage==='chooseSlot' && selectedNumber) {
    const slot=garage.slots?.[Number(selectedNumber)-1];
    if(slot) {
      const offer={...slot,id:crypto.randomUUID(),profile,expiresAt:Date.now()+15*60000};
      const name=ctx.customerName && !/^(cliente|visitante)/i.test(ctx.customerName)?ctx.customerName:'';
      await save({garage:{stage:name?(phoneOf(contactId)?'confirmBooking':'phone'):'name',offer,kitId:kit.id,day,fingerprint,name,phone:phoneOf(contactId)}});
      if(!name)return response('Qual é o seu nome para a reserva?');
      if(!phoneOf(contactId))return response('Qual telefone com DDD podemos usar para contato sobre a instalação?');
      return response(`Posso confirmar ${kit.name} em ${new Date(offer.startAt).toLocaleString('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'})}, no ${offer.bayName}, em nome de ${name}? A peça e o horário só serão reservados após sua confirmação.`);
    }
  }
  if(['name','phone'].includes(garage.stage)) {
    const updated={...garage};
    if(garage.stage==='name'){if(input.trim().length<3 || affirmative(input))return response('Informe seu nome para a reserva.');updated.name=input.trim().slice(0,100);updated.stage=garage.phone?'confirmBooking':'phone';}
    else {const phone=input.replace(/\D/g,'');if(!/^\d{10,15}$/.test(phone))return response('Informe um telefone válido com DDD.');updated.phone=phone;updated.stage='confirmBooking';}
    await save({garage:updated});
    if(updated.stage==='phone')return response('Qual telefone com DDD podemos usar para contato sobre a instalação?');
    return response(`Posso confirmar ${kit.name} em ${new Date(updated.offer.startAt).toLocaleString('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'})}, no ${updated.offer.bayName}, para ${updated.name}?`);
  }
  const slots=garageSlots(state,bookings,kit,day).slice(0,5);
  if(!slots.length){await save({garage:{stage:'chooseDay',kitId:kit.id,fingerprint}});return response('Não há uma vaga livre com material e tempo suficientes nessa data. Qual outro dia funciona para você?');}
  await save({garage:{stage:'chooseSlot',kitId:kit.id,day,fingerprint,slots}});
  return response(`Para ${kit.name}, encontrei estes horários em ${day.split('-').reverse().join('/')} (horário de Recife):\n${slots.map((s,i)=>`${i+1}. ${new Date(s.startAt).toLocaleTimeString('pt-BR',{timeZone:'America/Recife',hour:'2-digit',minute:'2-digit'})}`).join('\n')}\nQual você prefere? Responda pelo número. A disponibilidade será conferida novamente na confirmação.`);
}
