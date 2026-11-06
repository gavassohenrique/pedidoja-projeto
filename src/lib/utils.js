import crypto from 'node:crypto';

export const STATES = ['recebido', 'pago', 'separado', 'enviado', 'entregue'];
export const LABELS = {
  recebido: 'Pedido recebido', pago: 'Pagamento confirmado',
  separado: 'Pedido separado', enviado: 'Pedido enviado', entregue: 'Pedido entregue'
};
export function nextStatus(current, requested) {
  const index = STATES.indexOf(current);
  return index >= 0 && index < STATES.length - 1 && STATES[index + 1] === requested;
}
export function strongEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}
export function inviteToken() { return crypto.randomBytes(24).toString('hex'); }
export function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
export function validEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 180; }
export function validName(s, max = 120) { return typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= max; }
export function validPositiveId(value) { return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0; }
export function validPrice(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100000000; }
export function formatBRL(cents) { return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function normalizeCEP(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{5}-?\d{3}$/.test(raw)) throw Object.assign(new Error('CEP deve ter exatamente 8 digitos'), { status: 422 });
  return raw.replace('-', '');
}
export function fail(message, status = 422) { throw Object.assign(new Error(message), { status }); }
