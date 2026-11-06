import { database } from '../lib/db.js';
import { telegramCall, buttonsForOrder } from './telegram.js';

export async function processOneOutgoing() {
  const db = database();
  const result = await db.query(`UPDATE mensagens SET processando_em=now(),tentativas=tentativas+1
    WHERE id=(SELECT id FROM mensagens
      WHERE direcao='saida' AND status='enfileirada' AND proxima_tentativa_em<=now()
      AND (processando_em IS NULL OR processando_em<now()-interval '2 minutes')
      ORDER BY criada_em,id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`);
  if (!result.rowCount) return false;
  const message = result.rows[0];
  try {
    const dest = await db.query('SELECT chat_id,ativo FROM canais_usuario WHERE id=$1', [message.canal_usuario_id]);
    if (!dest.rowCount || !dest.rows[0].ativo) throw Object.assign(new Error('Vinculo Telegram inativo'), { codigo: 'SEM_OPT_IN' });
    const sent = await telegramCall('sendMessage', {
      chat_id: dest.rows[0].chat_id, text: message.conteudo,
      ...(message.pedido_id ? { reply_markup: buttonsForOrder(message.pedido_id) } : {})
    });
    await db.query(`UPDATE mensagens SET status='enviada',id_externo=$2,enviada_em=now(),
      processando_em=NULL,erro_codigo=NULL,erro_descricao=NULL WHERE id=$1`, [message.id, String(sent.message_id)]);
  } catch (err) {
    const code = String(err.codigo || 'NETWORK');
    const permanent = ['403', '400', 'SEM_OPT_IN'].includes(code) || Number(message.tentativas) >= 5;
    if (code === '403' && message.canal_usuario_id) {
      await db.query('UPDATE canais_usuario SET ativo=false WHERE id=$1', [message.canal_usuario_id]);
    }
    const retrySeconds = code === '429' && err.retryAfter ? Math.ceil(err.retryAfter) : Math.min(300, 2 ** Number(message.tentativas));
    await db.query(`UPDATE mensagens SET status=$2,erro_codigo=$3,erro_descricao=$4,processando_em=NULL,
      proxima_tentativa_em=now()+($5::int * interval '1 second') WHERE id=$1`,
    [message.id, permanent ? 'falha' : 'enfileirada', code, err.message.slice(0, 500), retrySeconds]);
    console.warn(`Falha no envio #${message.id} (${code}): ${err.message}`);
  }
  return true;
}
