// Insere dados de demonstracao usando APENAS a API REST do proprio projeto.
import 'dotenv/config';
const api = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const key = process.env.ADMIN_API_KEY;
if (!key || key.startsWith('SUBSTITUA')) {
  console.error('Defina ADMIN_API_KEY em .env antes de executar');
  process.exit(1);
}
async function post(route, data) {
  const response = await fetch(api + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.erro}`);
  return payload;
}
try {
  const product = await post('/api/produtos', { nome: 'Mouse Sem Fio - Demo', descricao: 'Produto demonstrativo', preco_centavos: 8990 });
  const cliente = await post('/api/clientes', {
    nome: 'Cliente Demonstração', email: `demo.${Date.now()}@example.org`, telefone: '11999990000',
    cep: '01001000', numero: '100', complemento: 'Exemplo acadêmico'
  });
  const pedido = await post('/api/pedidos', { cliente_id: cliente.id, itens: [{ produto_id: product.id, quantidade: 2 }] });
  console.log('Dados de demonstracao criados:');
  console.log(JSON.stringify({ cliente_id: cliente.id, produto_id: product.id, pedido_id: pedido.id, estado: pedido.status, notificacao: pedido.notificacao, convite: cliente.link_telegram }, null, 2));
} catch (err) { console.error(err.message); process.exitCode = 1; }
