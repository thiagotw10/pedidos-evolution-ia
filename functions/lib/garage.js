"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.garageTime = exports.emptyGarage = exports.operationSession = exports.operationsRef = void 0;
exports.localGarageDay = localGarageDay;
exports.validGarageDay = validGarageDay;
exports.garageState = garageState;
exports.validateGarageConfig = validateGarageConfig;
exports.kitFits = kitFits;
exports.garageSlots = garageSlots;
exports.reserveGarage = reserveGarage;
exports.transitionGarageBooking = transitionGarageBooking;
exports.registerGarageRoutes = registerGarageRoutes;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = __importDefault(require("crypto"));
const automotiveConversation_1 = require("./automotiveConversation");
const operationsRef = (db, id) => db.collection('automotiveOperations').doc(id);
exports.operationsRef = operationsRef;
const operationSession = (db, id, contact, profile) => (0, exports.operationsRef)(db, id).collection('sessions').doc(crypto_1.default.createHash('sha256').update(`${contact}:${profile}`).digest('hex'));
exports.operationSession = operationSession;
const emptyGarage = () => ({ config: { enabled: false, autoConfirm: false, open: '', close: '', weekdays: [], bufferMinutes: 0, leadMinutes: 60, horizonDays: 30 }, bays: [], kits: [], occupancies: {}, revision: 0 });
exports.emptyGarage = emptyGarage;
const now = () => new Date().toISOString();
const clean = (v, max = 120) => String(v || '').trim().slice(0, max);
const validId = (v) => /^[\w-]{1,80}$/.test(String(v || ''));
function localGarageDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function validGarageDay(day) { return /^20\d{2}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(`${day}T12:00:00-03:00`)) && localGarageDay(new Date(`${day}T12:00:00-03:00`)) === day; }
const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const garageTime = (day, time) => new Date(`${day}T${time}:00-03:00`).toISOString();
exports.garageTime = garageTime;
const timeOf = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function garageState(raw) { const e = (0, exports.emptyGarage)(); return { ...e, ...raw, config: { ...e.config, ...raw?.config }, bays: raw?.bays || [], kits: raw?.kits || [], occupancies: raw?.occupancies || {} }; }
function validateGarageConfig(raw) {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(raw.open || '') || !time.test(raw.close || '') || mins(raw.close) <= mins(raw.open))
        throw new Error('Informe um horário de abertura e fechamento válido.');
    const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : []).map(Number))];
    if (!weekdays.length || weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6))
        throw new Error('Selecione os dias de atendimento.');
    const number = (key, min, max) => { const n = Number(raw[key]); if (!Number.isInteger(n) || n < min || n > max)
        throw new Error('Confira os limites da agenda.'); return n; };
    return { enabled: raw.enabled === true, autoConfirm: raw.autoConfirm === true, open: raw.open, close: raw.close, weekdays, bufferMinutes: number('bufferMinutes', 0, 120), leadMinutes: number('leadMinutes', 0, 10080), horizonDays: number('horizonDays', 1, 90) };
}
function kitFits(kit, vehicle) {
    return !!(vehicle?.brand && vehicle?.model && vehicle?.year && (0, automotiveConversation_1.normalizeAuto)(kit.brand) === (0, automotiveConversation_1.normalizeAuto)(vehicle.brand) && (0, automotiveConversation_1.normalizeAuto)(kit.model) === (0, automotiveConversation_1.normalizeAuto)(vehicle.model) && /^\d{4}$/.test(vehicle.year)
        && vehicle.year >= kit.yearFrom && vehicle.year <= kit.yearTo && (!kit.version || (0, automotiveConversation_1.normalizeAuto)(kit.version) === (0, automotiveConversation_1.normalizeAuto)(vehicle.version)));
}
function garageSlots(state, bookings, kit, day, clock = Date.now()) {
    const c = state.config;
    if (!c.enabled || !validGarageDay(day) || day < localGarageDay(new Date(clock)) || day > localGarageDay(new Date(clock + c.horizonDays * 86400000)) || !c.weekdays.includes(new Date(`${day}T12:00:00-03:00`).getUTCDay()) || !kit.enabled || kit.onHand - kit.reserved < 1)
        return [];
    const result = [];
    const duration = kit.durationMinutes + c.bufferMinutes;
    for (let start = mins(c.open); start + duration <= mins(c.close); start += 30) {
        const startAt = (0, exports.garageTime)(day, timeOf(start)), endAt = (0, exports.garageTime)(day, timeOf(start + duration));
        if (Date.parse(startAt) < clock + c.leadMinutes * 60000)
            continue;
        for (const bay of state.bays.filter(b => b.enabled)) {
            const occupied = state.occupancies[bay.id];
            if (occupied && (occupied.status === 'ready' || Date.parse(occupied.endAt) <= clock || (occupied.startAt < endAt && occupied.endAt > startAt)))
                continue;
            if (bookings.some(b => b.bayId === bay.id && !['cancelled', 'completed'].includes(b.status) && b.startAt < endAt && b.endAt > startAt))
                continue;
            result.push({ day, bayId: bay.id, bayName: bay.name, startAt, endAt, kitId: kit.id });
            break; // Offer each time once; reservation chooses a concrete box and revalidates it.
        }
    }
    return result;
}
async function reserveGarage(db, storeId, offer, contact, actor) {
    if (!validId(offer.id) || !validGarageDay(offer.day))
        throw new Error('Proposta de horário inválida.');
    const root = (0, exports.operationsRef)(db, storeId), dayRef = root.collection('calendar').doc(offer.day), chatRef = db.collection('establishments').doc(storeId).collection('chats').doc(contact.chatId || '_manual');
    return db.runTransaction(async (tx) => {
        const rootSnap = await tx.get(root), daySnap = await tx.get(dayRef), chatSnap = await tx.get(chatRef);
        const state = garageState(rootSnap.data()), bookings = daySnap.data()?.bookings || [];
        const previous = bookings.find(b => b.id === offer.id);
        if (previous) {
            if (previous.status === 'cancelled')
                throw new Error('Essa reserva foi cancelada. Consulte um novo horário.');
            return previous;
        }
        if (actor === 'ai' && ((!state.config.autoConfirm) || (chatSnap.data()?.aiPaused) || (chatSnap.data()?.activeAutomotiveProfile || 'legacy') !== offer.profile))
            throw new Error('A confirmação automática não está disponível para esta conversa.');
        const kit = state.kits.find(k => k.id === offer.kitId);
        if (!kit || !kit.autoBook && actor === 'ai' || actor === 'ai' && !kitFits(kit, contact.vehicle))
            throw new Error('A aplicação do kit precisa ser validada pela equipe.');
        if (offer.expiresAt && offer.expiresAt < Date.now())
            throw new Error('Essa opção de horário expirou. Consulte a disponibilidade novamente.');
        if (!garageSlots(state, bookings, kit, offer.day).some(s => s.bayId === offer.bayId && s.startAt === offer.startAt && s.endAt === offer.endAt))
            throw new Error('Esse horário ou material não está mais disponível. Vamos consultar outra opção.');
        if (!clean(contact.name) || !/^\d{10,15}$/.test(contact.phone || ''))
            throw new Error('Informe nome e telefone de contato antes de confirmar.');
        if (bookings.length >= 200)
            throw new Error('Limite de reservas deste dia atingido.');
        const booking = { id: offer.id, day: offer.day, bayId: offer.bayId, bayName: state.bays.find(b => b.id === offer.bayId).name, kitId: kit.id, kitName: kit.name, startAt: offer.startAt, endAt: offer.endAt,
            status: 'confirmed', customerName: clean(contact.name), phone: contact.phone, chatId: contact.chatId || '', profile: offer.profile || '', vehicle: clean([contact.vehicle?.brand, contact.vehicle?.model, contact.vehicle?.year, contact.vehicle?.version].filter(Boolean).join(' '), 240), createdAt: now(), source: actor };
        tx.set(root, { ...state, kits: state.kits.map(k => k.id === kit.id ? { ...k, reserved: k.reserved + 1 } : k), revision: state.revision + 1, updatedAt: now() });
        tx.set(dayRef, { bookings: [...bookings, booking], updatedAt: now() });
        tx.set(root.collection('events').doc(), { type: 'reserved', bookingId: booking.id, kitId: kit.id, actor, at: now() });
        return booking;
    });
}
async function transitionGarageBooking(db, storeId, day, id, status) {
    if (!validGarageDay(day) || !validId(id) || !['installing', 'awaiting_parts', 'ready', 'completed', 'cancelled'].includes(status))
        throw new Error('Atualização inválida.');
    const root = (0, exports.operationsRef)(db, storeId), dayRef = root.collection('calendar').doc(day);
    return db.runTransaction(async (tx) => {
        const state = garageState((await tx.get(root)).data()), bookings = (await tx.get(dayRef)).data()?.bookings || [];
        const booking = bookings.find(b => b.id === id);
        if (!booking)
            throw new Error('Reserva não encontrada.');
        if (booking.status === status)
            return booking;
        const allowed = { confirmed: ['installing', 'awaiting_parts', 'cancelled'], awaiting_parts: ['installing', 'cancelled'], installing: ['awaiting_parts', 'ready', 'cancelled'], ready: ['completed', 'cancelled'] };
        if (!allowed[booking.status]?.includes(status))
            throw new Error('Essa mudança de etapa não é permitida.');
        const kit = state.kits.find(k => k.id === booking.kitId);
        if (!kit)
            throw new Error('Kit da reserva não encontrado.');
        const consumed = booking.materialConsumed === true;
        if (status === 'installing') {
            const occupancy = state.occupancies[booking.bayId];
            if (occupancy && occupancy.id !== booking.id)
                throw new Error('O box ainda está ocupado por outro carro.');
            if (!consumed) {
                if (kit.onHand < 1 || kit.reserved < 1)
                    throw new Error('Confira o estoque reservado antes de iniciar.');
                kit.onHand--;
                kit.reserved--;
                booking.materialConsumed = true;
            }
        }
        if (status === 'cancelled' && !consumed && !booking.materialConsumed)
            kit.reserved = Math.max(0, kit.reserved - 1);
        booking.status = status;
        booking.updatedAt = now();
        if (['installing', 'ready'].includes(status) || status === 'awaiting_parts' && booking.materialConsumed)
            state.occupancies[booking.bayId] = { id: booking.id, kitId: booking.kitId, day, status, startAt: booking.startAt, endAt: booking.endAt };
        if (['completed', 'cancelled'].includes(status) && state.occupancies[booking.bayId]?.id === booking.id)
            delete state.occupancies[booking.bayId];
        tx.set(root, { ...state, revision: state.revision + 1, updatedAt: now() });
        tx.set(dayRef, { bookings, updatedAt: now() });
        tx.set(root.collection('events').doc(), { type: status, bookingId: id, actor: 'owner', at: now(), materialConsumed: !!booking.materialConsumed });
        return booking;
    });
}
function registerGarageRoutes(app, db) {
    const owned = (fn) => async (req, res) => {
        let uid;
        try {
            uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid;
        }
        catch {
            return res.status(401).json({ error: 'Entre novamente para gerenciar a garagem.' });
        }
        const id = String(req.query.establishmentId || '');
        if (uid !== id)
            return res.status(403).json({ error: 'Acesso restrito à sua oficina.' });
        if ((await db.collection('establishments').doc(id).get()).data()?.segment !== 'AUTOMOTIVE_PARTS')
            return res.status(403).json({ error: 'Recurso exclusivo de Performance & Escapamentos.' });
        try {
            return await fn(req, res, id);
        }
        catch (e) {
            return res.status(400).json({ error: e.message || 'Não foi possível concluir.' });
        }
    };
    app.get('/api/garage/state', owned(async (req, res, id) => {
        const day = String(req.query.day || localGarageDay());
        if (!validGarageDay(day))
            throw new Error('Data inválida.');
        const root = (0, exports.operationsRef)(db, id), state = garageState((await root.get()).data()), bookings = (await root.collection('calendar').doc(day).get()).data()?.bookings || [];
        const busyDays = [...new Set(Object.values(state.occupancies).map((o) => o.day))].filter(d => d !== day);
        const old = await Promise.all(busyDays.map(d => root.collection('calendar').doc(d).get()));
        const occupiedBookings = old.flatMap(s => s.data()?.bookings || []).filter(b => state.occupancies[b.bayId]?.id === b.id);
        const todayBookings = day === localGarageDay() ? bookings : (await root.collection('calendar').doc(localGarageDay()).get()).data()?.bookings || [];
        return res.json({ ...state, day, bookings, todayBookings, occupiedBookings, timeZone: 'America/Recife' });
    }));
    app.post('/api/garage/config', owned(async (req, res, id) => {
        const config = validateGarageConfig(req.body);
        await db.runTransaction(async (tx) => { const root = (0, exports.operationsRef)(db, id), state = garageState((await tx.get(root)).data()); if (config.enabled && (!state.bays.some(b => b.enabled) || !state.kits.some(k => k.enabled)))
            throw new Error('Cadastre ao menos um box e um kit antes de ativar.'); tx.set(root, { ...state, config, revision: state.revision + 1, updatedAt: now() }); });
        return res.json({ success: true });
    }));
    app.post('/api/garage/bays', owned(async (req, res, id) => {
        const bay = { id: req.body.id || crypto_1.default.randomUUID(), name: clean(req.body.name, 60), enabled: req.body.enabled !== false };
        if (!validId(bay.id) || !bay.name)
            throw new Error('Informe o nome do box.');
        await db.runTransaction(async (tx) => { const root = (0, exports.operationsRef)(db, id), state = garageState((await tx.get(root)).data()); if (state.bays.length >= 20 && !state.bays.some(b => b.id === bay.id))
            throw new Error('Limite de 20 boxes.'); tx.set(root, { ...state, bays: [...state.bays.filter(b => b.id !== bay.id), bay], revision: state.revision + 1, updatedAt: now() }); });
        return res.json({ success: true });
    }));
    app.post('/api/garage/kits', owned(async (req, res, id) => {
        const input = req.body;
        const kit = { id: input.id || crypto_1.default.randomUUID(), name: clean(input.name), brand: clean(input.brand), model: clean(input.model), version: clean(input.version), yearFrom: clean(input.yearFrom, 4), yearTo: clean(input.yearTo, 4), onHand: Number(input.onHand), durationMinutes: Number(input.durationMinutes), autoBook: input.autoBook === true, enabled: input.enabled !== false };
        if (!validId(kit.id) || !kit.name || !kit.brand || !kit.model || kit.autoBook && !kit.version || !/^(19|20)\d{2}$/.test(kit.yearFrom) || !/^(19|20)\d{2}$/.test(kit.yearTo) || kit.yearFrom > kit.yearTo || !Number.isInteger(kit.onHand) || kit.onHand < 0 || kit.onHand > 100000 || !Number.isInteger(kit.durationMinutes) || kit.durationMinutes < 30 || kit.durationMinutes > 720)
            throw new Error('Confira identificação, aplicação, quantidade e duração do kit.');
        await db.runTransaction(async (tx) => { const root = (0, exports.operationsRef)(db, id), state = garageState((await tx.get(root)).data()), old = state.kits.find(k => k.id === kit.id); kit.reserved = old?.reserved || 0; if (kit.onHand < kit.reserved)
            throw new Error('O saldo físico não pode ser menor que o material reservado.'); if (old && (old.reserved > 0 || Object.values(state.occupancies).some((o) => o.kitId === kit.id)) && ['brand', 'model', 'version', 'yearFrom', 'yearTo', 'durationMinutes'].some(k => old[k] !== kit[k]))
            throw new Error('Não altere a aplicação ou duração de um kit com operação em andamento. Cadastre outro kit.'); if (state.kits.length >= 200 && !old)
            throw new Error('Limite de 200 kits.'); tx.set(root, { ...state, kits: [...state.kits.filter(k => k.id !== kit.id), kit], revision: state.revision + 1, updatedAt: now() }); tx.set(root.collection('events').doc(), { type: 'stock_count', kitId: kit.id, onHand: kit.onHand, previous: old?.onHand ?? null, actor: 'owner', at: now() }); });
        return res.json({ success: true });
    }));
    app.get('/api/garage/slots', owned(async (req, res, id) => { const root = (0, exports.operationsRef)(db, id), state = garageState((await root.get()).data()), day = String(req.query.day || localGarageDay()), kit = state.kits.find(k => k.id === req.query.kitId); if (!kit || !validGarageDay(day))
        throw new Error('Selecione kit e data.'); const bookings = (await root.collection('calendar').doc(day).get()).data()?.bookings || []; return res.json({ slots: garageSlots(state, bookings, kit, day).slice(0, 30) }); }));
    app.post('/api/garage/bookings', owned(async (req, res, id) => { return res.json({ booking: await reserveGarage(db, id, req.body.offer, req.body.contact, 'owner') }); }));
    app.post('/api/garage/bookings/status', owned(async (req, res, id) => { return res.json({ booking: await transitionGarageBooking(db, id, req.body.day, req.body.id, req.body.status) }); }));
}
//# sourceMappingURL=garage.js.map