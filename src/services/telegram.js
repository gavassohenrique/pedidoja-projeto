import { fail } from '../lib/utils.js';

export async function telegramCall(method, data, fetchImpl = fetch) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return fail('TELEGRAM_TOKEN nao configurado', 503);
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(8000)
    });
  } catch (e) { throw Object.assign(new Error(`Telegram indisponivel: ${e.message}`), { codigo: 'NETWORK' }); }
  let body;
  try { body = await response.json(); } catch { throw Object.assign(new Error('Resposta nao JSON do Telegram'), { codigo: 'NETWORK' }); }
  if (!body.ok) {
    const err = new Error(body.description || 'Erro do Telegram');
    err.codigo = String(body.error_code || response.status);
    err.retryAfter = Number(body.parameters?.retry_after || 0);
    throw err;
  }
  return body.result;
}
export function buttonsForOrder(orderId) {
  return { inline_keyboard: [[{ text: 'Confirmar ciencia', callback_data: `pedido:${orderId}:ciente` }]] };
}
