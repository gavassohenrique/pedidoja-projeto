import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { database } from './lib/db.js';
import { config } from './lib/config.js';
import { strongEqual, validPositiveId, fail } from './lib/utils.js';
import { addClient, newInvite, addProduct, addOrder, advanceOrder } from './services/orders.js';
import { consultarCEP } from './services/viacep.js';
import { acceptWebhook } from './services/webhooks.js';

const cfg = config();
if (cfg.adminKey.length < 32 || cfg.adminKey.startsWith('SUBSTITUA')) throw new Error('ADMIN_API_KEY precisa ter pelo menos 32 caracteres aleatorios');
if (cfg.webhookSecret.length < 20 || cfg.webhookSecret.startsWith('SUBSTITUA')) throw new Error('TELEGRAM_WEBHOOK_SECRET precisa ser seguro e ter pelo menos 20 caracteres');
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public'), { extensions: ['html'] }));

function wrap(handler) { return (req, res, next) => Promise.resolve(handler(req, res)).catch(next); }
function admin(req, res, next) {
  if (!strongEqual(req.get('X-Admin-Key') || '', cfg.adminKey)) return res.status(401).json({ erro: 'Chave administrativa incorreta' });
  next();
}
app.get('/health', wrap(async (_req, res) => {
  await database().query('SELECT 1');
  res.json({ status: 'ok', servico: 'pedidoja', timestamp: new Date().toISOString() });
}));
app.get('/metrics', wrap(async (_req, res) => {
  const [orders, messages, failures] = await Promise.all([
    database().query('SELECT count(*)::integer AS count FROM pedidos'),
    database().query('SELECT count(*)::integer AS count FROM mensagens'),
    database().query("SELECT count(*)::integer AS count FROM mensagens WHERE status='falha'")
  ]);
  res.type('text/plain; version=0.0.4').send(
    `# HELP pedidoja_pedidos_total Total de pedidos criados\n# TYPE pedidoja_pedidos_total gauge\npedidoja_pedidos_total ${orders.rows[0].count}\n` +
    `# HELP pedidoja_mensagens_total Total de mensagens registradas\n# TYPE pedidoja_mensagens_total gauge\npedidoja_mensagens_total ${messages.rows[0].count}\n` +
    `# HELP pedidoja_mensagens_falha Total de mensagens com falha\n# TYPE pedidoja_mensagens_falha gauge\npedidoja_mensagens_falha ${failures.rows[0].count}\n`
  );
}));
// O webhook NAO usa chave do painel: valida o segredo definido no BotFather/setWebhook.
app.post('/webhook/telegram', (req, res, next) => {
  if (!strongEqual(req.get('X-Telegram-Bot-Api-Secret-Token') || '', cfg.webhookSecret)) return res.sendStatus(401);
  Promise.resolve(acceptWebhook(req.body)).then(inserted => res.status(200).json({ ok: true, novo: inserted })).catch(next);
});
app.use('/api', admin);
app.get('/api/cep/:cep', wrap(async (req, res) => res.json(await consultarCEP(req.params.cep))));
app.get('/api/clientes', wrap(async (_req, res) => {
  const result = await database().query(`SELECT c.id,u.nome,u.email,u.telefone,c.cep,c.logradouro,c.numero,c.cidade,c.uf,
    COALESCE(cu.ativo,false) AS telegram_ativo
    FROM clientes c JOIN usuarios u ON u.id=c.usuario_id
    LEFT JOIN canais_usuario cu ON cu.usuario_id=u.id AND cu.plataforma='telegram'
    ORDER BY c.id DESC LIMIT 200`);
  res.json(result.rows);
}));
app.post('/api/clientes', wrap(async (req, res) => res.status(201).json(await addClient(req.body || {}))));
app.post('/api/clientes/:id/vinculo', wrap(async (req, res) => res.json(await newInvite(req.params.id))));
app.get('/api/produtos', wrap(async (_req, res) => {
  const result = await database().query('SELECT * FROM produtos ORDER BY id DESC LIMIT 300');
  res.json(result.rows);
}));
app.post('/api/produtos', wrap(async (req, res) => res.status(201).json(await addProduct(req.body || {}))));
app.get('/api/pedidos', wrap(async (_req, res) => {
  const result = await database().query(`SELECT p.*, u.nome AS cliente_nome,
     (SELECT coalesce(json_agg(json_build_object('produto',pr.nome,'quantidade',i.quantidade,'preco_unitario_centavos',i.preco_unitario_centavos)), '[]'::json)
       FROM itens_pedido i JOIN produtos pr ON pr.id=i.produto_id WHERE i.pedido_id=p.id) AS itens
    FROM pedidos p JOIN clientes c ON c.id=p.cliente_id JOIN usuarios u ON u.id=c.usuario_id
    ORDER BY p.id DESC LIMIT 200`);
  res.json(result.rows);
}));
app.post('/api/pedidos', wrap(async (req, res) => res.status(201).json(await addOrder(req.body || {}))));
app.patch('/api/pedidos/:id/status', wrap(async (req, res) => res.json(await advanceOrder(req.params.id, req.body?.status))));
app.get('/api/pedidos/:id/historico', wrap(async (req, res) => {
  if (!validPositiveId(req.params.id)) fail('Pedido invalido');
  const result = await database().query('SELECT status,alterado_em FROM historico_status WHERE pedido_id=$1 ORDER BY id', [req.params.id]);
  res.json(result.rows);
}));
app.get('/api/mensagens', wrap(async (_req, res) => {
  const result = await database().query(`SELECT id,pedido_id,direcao,conteudo,status,erro_codigo,erro_descricao,id_externo,criada_em,enviada_em,respondida_em,tentativas
     FROM mensagens ORDER BY id DESC LIMIT 100`);
  res.json(result.rows);
}));
app.get('/api/resumo', wrap(async (_req, res) => {
  const [clients, products, orders, sent, failed] = await Promise.all([
    database().query('SELECT count(*)::integer AS n FROM clientes'),
    database().query('SELECT count(*)::integer AS n FROM produtos'),
    database().query('SELECT count(*)::integer AS n FROM pedidos'),
    database().query("SELECT count(*)::integer AS n FROM mensagens WHERE status IN ('enviada','respondida') AND direcao='saida'"),
    database().query("SELECT count(*)::integer AS n FROM mensagens WHERE status='falha' AND direcao='saida'")
  ]);
  res.json({ clientes: clients.rows[0].n, produtos: products.rows[0].n, pedidos: orders.rows[0].n,
    mensagens_enviadas: sent.rows[0].n, falhas: failed.rows[0].n });
}));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON invalido' });
  if (err.code === '23505') return res.status(409).json({ erro: 'Registro duplicado (e-mail, vinculo ou outro campo unico)' });
  if (err.code === '23503') return res.status(422).json({ erro: 'Relacionamento de banco invalido' });
  if (err.code === '22P02') return res.status(422).json({ erro: 'Identificador invalido' });
  console.error(err.status ? err.message : `Erro interno: ${err.message}`);
  res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro interno; consulte o log do servidor' });
});
app.listen(cfg.port, '0.0.0.0', () => console.log(`PedidoJá escutando na porta ${cfg.port}`));
