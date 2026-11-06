import { database, transaction } from '../lib/db.js';
import { tokenHash } from '../lib/utils.js';
import { queueMessage } from './orders.js';
import { telegramCall } from './telegram.js';

export async function acceptWebhook(payload) {
  if (!Number.isSafeInteger(payload?.update_id) || payload.update_id < 0) {
    throw Object.assign(new Error('update_id invalido'), { status: 400 });
  }
  const result = await database().query(`INSERT INTO webhook_updates(update_id,payload_bruto)
    VALUES ($1,$2::jsonb) ON CONFLICT (update_id) DO NOTHING`, [payload.update_id, JSON.stringify(payload)]);
  return result.rowCount > 0;
}
async function handleIncoming(client, update) {
  const message = update.message;
  const callback = update.callback_query;
  const event = message || callback;
  if (!event) return null;
  const chatId = message?.chat?.id || callback?.message?.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const chat = String(chatId);
  const link = await client.query(`SELECT id, usuario_id FROM canais_usuario WHERE plataforma='telegram' AND chat_id=$1 AND ativo=true`, [chat]);
  let linked = link.rows[0] || null;
  const incomingText = message?.text ?? `[clique] ${callback?.data ?? ''}`;
  const externalId = `tgupdate:${update.update_id}`; // unico mesmo com message_id repetido em chats distintos
  // Registra toda entrada, inclusive /start, comandos desconhecidos e clique.
  await client.query(`INSERT INTO mensagens(canal_usuario_id,plataforma,direcao,id_externo,conteudo,status,payload_bruto)
    VALUES($1,'telegram','entrada',$2,$3,'respondida',$4::jsonb)
    ON CONFLICT DO NOTHING`, [linked?.id || null, externalId, incomingText, JSON.stringify(update)]);

  if (message?.text?.startsWith('/start ')) {
    const code = message.text.trim().split(/\s+/)[1];
    if (!/^[a-f\d]{48}$/.test(code || '')) return null;
    const pending = await client.query(`SELECT usuario_id FROM vinculos_pendentes
      WHERE codigo_hash=$1 AND usado_em IS NULL AND expira_em>now() FOR UPDATE`, [tokenHash(code)]);
    if (!pending.rowCount) return null;
    const uid = pending.rows[0].usuario_id;
    // O mesmo chat_id nao pode pertencer a dois usuarios diferentes.
    const occupied = await client.query(`SELECT usuario_id FROM canais_usuario WHERE plataforma='telegram' AND chat_id=$1`, [chat]);
    if (occupied.rowCount && String(occupied.rows[0].usuario_id) !== String(uid)) return null;
    const upsert = await client.query(`INSERT INTO canais_usuario(usuario_id,plataforma,chat_id,ativo)
      VALUES($1,'telegram',$2,true) ON CONFLICT (usuario_id,plataforma)
      DO UPDATE SET chat_id=EXCLUDED.chat_id,ativo=true,vinculado_em=now() RETURNING id`, [uid, chat]);
    linked = { id: upsert.rows[0].id, usuario_id: uid };
    await client.query('UPDATE vinculos_pendentes SET usado_em=now() WHERE codigo_hash=$1', [tokenHash(code)]);
    await client.query(`UPDATE mensagens SET canal_usuario_id=$1 WHERE plataforma='telegram' AND direcao='entrada' AND id_externo=$2`, [linked.id, externalId]);
    await queueMessage(client, { usuarioId: uid, content: 'PedidoJá: vinculo confirmado! Voce recebera o andamento de seus pedidos aqui. Use /pedido NUMERO para consultar.' });
  } else if (message && linked) {
    let reply = 'PedidoJá: acompanhe as notificacoes por aqui. Para consultar, envie /pedido NUMERO.';
    const match = /^\/pedido\s+(\d+)\s*$/.exec(message.text || '');
    if (match) {
      const order = await client.query(`SELECT p.id,p.status FROM pedidos p JOIN clientes c ON c.id=p.cliente_id
        WHERE p.id=$1 AND c.usuario_id=$2`, [match[1], linked.usuario_id]);
      reply = order.rowCount ? `Pedido #${order.rows[0].id}: ${order.rows[0].status}` : 'Pedido nao encontrado para sua conta.';
    }
    await queueMessage(client, { usuarioId: linked.usuario_id, content: reply });
  }
  if (callback) {
    let confirmation = 'Recebido!';
    const match = /^pedido:(\d+):ciente$/.exec(callback.data || '');
    if (match && linked) {
      const updateResult = await client.query(`UPDATE mensagens SET status='respondida',respondida_em=now()
        WHERE id=(SELECT m.id FROM mensagens m JOIN pedidos p ON p.id=m.pedido_id
          JOIN clientes c ON c.id=p.cliente_id
          WHERE m.direcao='saida' AND m.pedido_id=$1 AND m.id_externo=$2
            AND m.canal_usuario_id=$3 AND c.usuario_id=$4 AND m.status IN ('enviada','respondida')
          ORDER BY m.id DESC LIMIT 1)`,
      [match[1], String(callback.message?.message_id || ''), linked.id, linked.usuario_id]);
      confirmation = updateResult.rowCount ? 'Confirmacao registrada. Obrigado!' : 'Mensagem nao localizada.';
    }
    return { callbackId: callback.id, response: confirmation };
  }
  return null;
}
export async function processOneWebhook() {
  const db = database();
  const reserved = await db.query(`UPDATE webhook_updates SET processando_em=now(),tentativas=tentativas+1
    WHERE update_id=(SELECT update_id FROM webhook_updates
      WHERE processado_em IS NULL AND (processando_em IS NULL OR processando_em < now()-interval '2 minutes')
      AND proxima_tentativa_em<=now() ORDER BY recebido_em LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING update_id,payload_bruto,tentativas`);
  if (!reserved.rowCount) return false;
  const job = reserved.rows[0];
  try {
    const ack = await transaction(async client => {
      const result = await handleIncoming(client, job.payload_bruto);
      await client.query('UPDATE webhook_updates SET processado_em=now(),processando_em=NULL,erro=NULL WHERE update_id=$1', [job.update_id]);
      return result;
    });
    if (ack) {
      try { await telegramCall('answerCallbackQuery', { callback_query_id: ack.callbackId, text: ack.response }); }
      catch (err) { console.warn('Nao foi possivel confirmar botao no Telegram:', err.message); }
    }
  } catch (err) {
    const delay = Math.min(300, 2 ** Math.min(job.tentativas, 8));
    await db.query(`UPDATE webhook_updates SET processando_em=NULL,erro=$2,
      proxima_tentativa_em=now()+($3::int * interval '1 second') WHERE update_id=$1`,
    [job.update_id, String(err.message).slice(0, 1000), delay]);
    console.error('Erro ao processar webhook:', err.message);
  }
  return true;
}
