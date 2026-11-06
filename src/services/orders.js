import { transaction, database } from '../lib/db.js';
import { fail, nextStatus, formatBRL, validPositiveId, validPrice, validName, validEmail, inviteToken, tokenHash } from '../lib/utils.js';
import { consultarCEP } from './viacep.js';

function orderNotice(order, status) {
  const steps = { recebido: 'recebido', pago: 'pagamento aprovado', separado: 'separado para envio', enviado: 'enviado', entregue: 'entregue' };
  return `PedidoJá | Pedido #${order.id}\nStatus: ${steps[status]}\nTotal: ${formatBRL(order.total_centavos)}\nAcompanhe suas atualizacoes aqui no Telegram.`;
}
export async function queueMessage(client, { usuarioId, pedidoId = null, content }) {
  const link = await client.query(`SELECT id FROM canais_usuario WHERE usuario_id=$1 AND plataforma='telegram' AND ativo=true`, [usuarioId]);
  if (link.rowCount === 0) {
    await client.query(`INSERT INTO mensagens (plataforma,direcao,conteudo,status,erro_codigo,erro_descricao,pedido_id)
                        VALUES ('telegram','saida',$1,'falha','SEM_OPT_IN','Cliente ainda nao vinculou o Telegram',$2)`, [content, pedidoId]);
    return 'falha';
  }
  await client.query(`INSERT INTO mensagens (canal_usuario_id,plataforma,direcao,conteudo,pedido_id)
                      VALUES ($1,'telegram','saida',$2,$3)`, [link.rows[0].id, content, pedidoId]);
  return 'enfileirada';
}
export async function addClient(body) {
  const { nome, email, telefone, cep, numero, complemento } = body;
  if (!validName(nome) || !validEmail(email) || !(typeof numero === 'string' && numero.trim().length >= 1 && numero.trim().length <= 20)) fail('Nome, e-mail ou numero do endereco invalido');
  const address = await consultarCEP(cep);
  const token = inviteToken();
  const cliente = await transaction(async client => {
    const u = await client.query(`INSERT INTO usuarios (nome,email,telefone) VALUES ($1,$2,$3) RETURNING *`,
      [nome.trim(), email.trim().toLowerCase(), String(telefone || '').slice(0, 24)]);
    const c = await client.query(`INSERT INTO clientes (usuario_id,cep,logradouro,bairro,cidade,uf,numero,complemento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [u.rows[0].id, address.cep, address.logradouro, address.bairro, address.cidade, address.uf, String(numero).trim(), complemento || null]);
    await client.query(`INSERT INTO vinculos_pendentes (usuario_id,codigo_hash,expira_em)
                        VALUES ($1,$2,now() + interval '24 hours')`, [u.rows[0].id, tokenHash(token)]);
    return { ...c.rows[0], nome: u.rows[0].nome, email: u.rows[0].email };
  });
  return { ...cliente, link_telegram: makeInviteLink(token) };
}
function makeInviteLink(token) {
  const username = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  return username ? `https://t.me/${username}?start=${token}` : `Configure TELEGRAM_BOT_USERNAME e abra /start ${token} no bot`;
}
export async function newInvite(clientId) {
  if (!validPositiveId(clientId)) fail('Cliente invalido');
  const token = inviteToken();
  await transaction(async client => {
    const row = await client.query('SELECT usuario_id FROM clientes WHERE id=$1', [clientId]);
    if (!row.rowCount) fail('Cliente nao encontrado', 404);
    await client.query('UPDATE vinculos_pendentes SET usado_em=now() WHERE usuario_id=$1 AND usado_em IS NULL', [row.rows[0].usuario_id]);
    await client.query(`INSERT INTO vinculos_pendentes(usuario_id,codigo_hash,expira_em)
                        VALUES ($1,$2,now()+interval '24 hours')`, [row.rows[0].usuario_id, tokenHash(token)]);
  });
  return { link_telegram: makeInviteLink(token), expira_em_horas: 24 };
}
export async function addProduct(body) {
  const { nome, descricao, preco_centavos } = body;
  if (!validName(nome, 140) || !validPrice(preco_centavos)) fail('Nome ou preco (em centavos) invalido');
  const r = await database().query(`INSERT INTO produtos(nome,descricao,preco_centavos) VALUES($1,$2,$3) RETURNING *`,
    [nome.trim(), String(descricao || '').slice(0, 2000), Number(preco_centavos)]);
  return r.rows[0];
}
function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) fail('Pedido deve ter de 1 a 50 produtos');
  const ids = new Set();
  for (const item of items) {
    if (!validPositiveId(item.produto_id) || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 999) fail('Itens invalidos');
    if (ids.has(String(item.produto_id))) fail('Produto duplicado no mesmo pedido');
    ids.add(String(item.produto_id));
  }
}
export async function addOrder(body) {
  const { cliente_id, itens } = body;
  if (!validPositiveId(cliente_id)) fail('Cliente invalido');
  validateItems(itens);
  const info = await database().query('SELECT c.*, u.nome FROM clientes c JOIN usuarios u ON u.id=c.usuario_id WHERE c.id=$1', [cliente_id]);
  if (!info.rowCount) fail('Cliente nao encontrado', 404);
  const dbAddress = info.rows[0];
  const address = await consultarCEP(dbAddress.cep); // valida novamente o endereco de ENTREGA na emissao do pedido
  return transaction(async client => {
    const ids = itens.map(x => String(x.produto_id));
    const products = await client.query('SELECT * FROM produtos WHERE id = ANY($1::bigint[]) AND ativo=true', [ids]);
    if (products.rowCount !== itens.length) fail('Produto nao encontrado ou inativo');
    const byId = new Map(products.rows.map(p => [String(p.id), p]));
    let total = 0;
    for (const item of itens) {
      total += Number(byId.get(String(item.produto_id)).preco_centavos) * item.quantidade;
      if (!Number.isSafeInteger(total)) fail('Total do pedido excede o limite permitido');
    }
    const endereco = { ...address, numero: dbAddress.numero, complemento: dbAddress.complemento };
    const pedido = await client.query(`INSERT INTO pedidos (cliente_id,total_centavos,endereco_entrega)
                         VALUES ($1,$2,$3::jsonb) RETURNING *`, [cliente_id, total, JSON.stringify(endereco)]);
    const order = pedido.rows[0];
    for (const item of itens) {
      const p = byId.get(String(item.produto_id));
      await client.query(`INSERT INTO itens_pedido(pedido_id,produto_id,quantidade,preco_unitario_centavos)
                          VALUES($1,$2,$3,$4)`, [order.id, p.id, item.quantidade, p.preco_centavos]);
    }
    await client.query('INSERT INTO historico_status(pedido_id,status) VALUES($1,$2)', [order.id, order.status]);
    order.notificacao = await queueMessage(client, {
      usuarioId: dbAddress.usuario_id, pedidoId: order.id, content: orderNotice(order, order.status)
    });
    return order;
  });
}
export async function advanceOrder(id, status) {
  if (!validPositiveId(id)) fail('Pedido invalido');
  if (typeof status !== 'string') fail('Status invalido');
  return transaction(async client => {
    const res = await client.query(`SELECT p.*, c.usuario_id FROM pedidos p
       JOIN clientes c ON c.id=p.cliente_id WHERE p.id=$1 FOR UPDATE OF p`, [id]);
    if (!res.rowCount) fail('Pedido nao encontrado', 404);
    const old = res.rows[0];
    if (!nextStatus(old.status, status)) fail(`Transicao invalida. Status atual: ${old.status}; proximo permitido: pago, separado, enviado ou entregue, em ordem.`, 409);
    await client.query('UPDATE pedidos SET status=$2, atualizado_em=now() WHERE id=$1', [id, status]);
    await client.query('INSERT INTO historico_status(pedido_id,status) VALUES($1,$2)', [id, status]);
    const notificacao = await queueMessage(client, { usuarioId: old.usuario_id, pedidoId: id, content: orderNotice(old, status) });
    return { id: old.id, status, notificacao };
  });
}
