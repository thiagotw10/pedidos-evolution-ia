const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateSocialDraft,draftSocialComment}=require('../lib/instagramCommentPersona');
test('public persona separates praise from commercial intent and forbids DM, prices and links on praise',async()=>{
 assert.equal(validateSocialDraft({kind:'praise',publicReply:'Esse elogio deixou o feed no brilho! Valeu 😎'},'ficou lindo').kind,'praise');
 assert.equal(validateSocialDraft({kind:'praise',publicReply:'Valeu!'},'Lindo, quanto custa?').kind,'commercial');
 for(const text of ['Te enviei no Direct','Desconto de R$ 10','Veja https://a.test','Oi @cliente','Garantido!'])assert.equal(validateSocialDraft({kind:'praise',publicReply:text},'lindo').publicReply,'');
 for(const kind of ['commercial','complaint','ignore'])assert.equal(validateSocialDraft({kind,publicReply:'Este texto não pode sair'},'texto').publicReply,'');
 const draft=await draftSocialComment({comment:'Que nave!',caption:'Veículo exposto',segment:'VEHICLES',company:'Loja'},async(system,input)=>{assert.match(system,/humor leve/);assert.equal(input.comment,'Que nave!');return JSON.stringify({kind:'praise',publicReply:'Essa nave já ganhou torcida! Valeu 😎'});});assert.equal(draft.kind,'praise');
});
