import { Express } from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { isLegacyFoodSample } from './catalogPolicy';

const stages = ['Novo contato', 'Qualificação', 'Análise técnica', 'Orçamento enviado', 'Aprovado', 'Em execução', 'Enviado', 'Concluído', 'Cancelado'];
export function registerAutomotiveRoutes(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/public/automotive/:storeId/projects', async (req, res) => {
    try {
      const storeId = String(req.params.storeId);
      const store = await db.collection('establishments').doc(storeId).get();
      if (store.data()?.segment !== 'AUTOMOTIVE_PARTS') return res.status(404).json({ error: 'Projeto indisponível.' });
      const body = req.body || {}; const data: Record<string, string> = {};
      for (const key of ['customerName', 'phone', 'brand', 'model', 'year', 'version', 'modifications', 'objective', 'cep', 'delivery']) {
        if (body[key] !== undefined && typeof body[key] !== 'string') return res.status(400).json({ error: 'Dados inválidos.' });
        data[key] = (body[key] || '').trim().slice(0, key === 'objective' || key === 'modifications' ? 600 : 100);
      }
      data.phone = data.phone.replace(/\D/g, ''); data.cep = data.cep.replace(/\D/g, '');
      if (!data.customerName || !data.brand || !data.model || !data.objective || !/^\d{10,15}$/.test(data.phone) || !/^\d{4}$/.test(data.year) || !['Envio nacional', 'Atendimento local'].includes(data.delivery) || (data.delivery === 'Envio nacional' && !/^\d{8}$/.test(data.cep)) || !/^[a-f0-9-]{36}$/i.test(body.requestId || '')) return res.status(400).json({ error: 'Confira nome, veículo, ano, WhatsApp e CEP.' });
      const ids = Array.isArray(body.referenceIds) ? [...new Set(body.referenceIds)].slice(0, 20) : [];
      const catalog = await store.ref.collection('products').get();
      const references = catalog.docs.filter(d => ids.includes(d.id) && d.data().available !== false && !isLegacyFoodSample({ id: d.id, ...d.data() })).map(d => ({ id: d.id, name: String(d.data().name || '').slice(0, 200) }));
      const id = crypto.createHash('sha256').update(`${storeId}:${body.requestId}`).digest('hex');
      const ref = db.collection('automotive_projects').doc(id);
      const bucket = Math.floor(Date.now() / 3600000);
      const limitRefs = [data.phone, req.ip || 'unknown'].map(value => db.collection('automotive_rate_limits').doc(crypto.createHash('sha256').update(`${storeId}:${bucket}:${value}`).digest('hex')));
      await db.runTransaction(async tx => {
        const existing = await tx.get(ref); if (existing.exists) return;
        const limits = await Promise.all(limitRefs.map(r => tx.get(r)));
        if (limits.some(s => Number(s.data()?.count || 0) >= 10)) throw new Error('RATE_LIMIT');
        limitRefs.forEach((r, i) => tx.set(r, { count: Number(limits[i].data()?.count || 0) + 1, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 86400000) }));
        tx.create(ref, { ...data, references, establishmentId: storeId, status: stages[0], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'public_site', contactConsentAt: new Date().toISOString() });
      });
      const phone = String(store.data()?.whatsappNumber || store.data()?.phone || '').replace(/\D/g, '');
      const message = `Olá! Enviei uma solicitação pelo site (protocolo ${id.slice(0, 8)}).\nVeículo: ${data.brand} ${data.model}, ${data.year}, ${data.version}.\nObjetivo: ${data.objective}\nModificações: ${data.modifications || 'Não informadas'}\n${data.delivery} — CEP ${data.cep || 'não informado'}\nReferências: ${references.map(r => r.name).join(', ') || 'A definir'}\nGostaria de uma análise técnica e orçamento.`;
      return res.json({ id, whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '' });
    } catch (e) { return res.status(e instanceof Error && e.message === 'RATE_LIMIT' ? 429 : 500).json({ error: e instanceof Error && e.message === 'RATE_LIMIT' ? 'Limite de solicitações atingido. Tente mais tarde.' : 'Não foi possível registrar a solicitação.' }); }
  });
  app.use('/api/automotive/projects', async (req, res, next) => {
    try {
      const token = await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''));
      res.locals.uid = token.uid; next();
    } catch { res.status(401).json({ error: 'Entre novamente para acessar os projetos.' }); }
  });
  app.get('/api/automotive/projects', async (_req, res) => {
    try {
      const result = await db.collection('automotive_projects').where('establishmentId', '==', res.locals.uid).get();
      res.json(result.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)));
    } catch { res.status(500).json({ error: 'Não foi possível carregar projetos.' }); }
  });
  app.patch('/api/automotive/projects/:id', async (req, res) => {
    try {
      const ref = db.collection('automotive_projects').doc(String(req.params.id));
      const allowed = ['notes', 'quote', 'freight', 'leadTime', 'tracking', 'status'];
      const changes: Record<string, string> = {};
      for (const key of allowed) if (typeof req.body[key] === 'string') changes[key] = req.body[key].slice(0, 3000);
      if (changes.status && !stages.includes(changes.status)) return res.status(400).json({ error: 'Etapa inválida.' });
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.data()?.establishmentId !== res.locals.uid) throw new Error('FORBIDDEN');
        tx.update(ref, { ...changes, updatedAt: new Date().toISOString() });
      });
      res.json({ success: true });
    } catch { res.status(403).json({ error: 'Não foi possível atualizar este projeto.' }); }
  });
}
