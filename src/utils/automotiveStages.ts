export const automotiveStages = ['Novo contato','Qualificação','Análise técnica','Orçamento enviado','Aprovado','Em execução','Pronto para retirada','Enviado','Concluído','Cancelado'];
export function boardStage(status?:string){return automotiveStages.includes(status||'')?status!:'Sem etapa reconhecida';}
export function boardColumns(projects:Array<{status?:string}>){return [...automotiveStages,...(projects.some(p=>boardStage(p.status)==='Sem etapa reconhecida')?['Sem etapa reconhecida']:[])];}
