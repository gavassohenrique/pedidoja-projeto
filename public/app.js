/* global document, sessionStorage, navigator */
const $ = selector => document.querySelector(selector);
const state = { clients: [], products: [], orders: [], messages: [] };
const stages = ['recebido', 'pago', 'separado', 'enviado', 'entregue'];
const texts = { recebido: 'Recebido', pago: 'Pago', separado: 'Separado', enviado: 'Enviado', entregue: 'Entregue' };
let adminKey = sessionStorage.getItem('pedidoja_key') || '';
function textCell(content, bold = false) { const td = document.createElement('td'); const el = bold ? document.createElement('strong') : td; el.textContent = String(content ?? '—'); if (bold) td.appendChild(el); return td; }
function cellWithButton(row, name, cb) { const td = document.createElement('td'); const b = document.createElement('button'); b.className = 'action-button'; b.textContent = name; b.addEventListener('click', cb); td.appendChild(b); row.appendChild(td); }
function pillCell(content, variant = '') { const td = document.createElement('td'); const span = document.createElement('span'); span.className = `pill ${variant}`; span.textContent = content; td.appendChild(span); return td; }
function showAlert(message, error = false) { const target = $('#alert'); target.textContent = message; target.className = `alert${error ? ' error' : ''}`; target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
function money(value) { return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
async function request(route, options = {}) {
  if (!adminKey) throw new Error('Clique em “Definir chave do painel” e digite ADMIN_API_KEY do arquivo .env.');
  const response = await fetch(route, { ...options, headers: { 'X-Admin-Key': adminKey, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Falha HTTP ${response.status}`); }
  if (!response.ok) throw new Error(payload.erro || 'Erro inesperado');
  return payload;
}
function formObj(form) { return Object.fromEntries(new FormData(form).entries()); }
function renderTable(selector, rows, colspan, empty) {
  const body = $(selector); body.replaceChildren();
  if (!rows.length) { const tr = document.createElement('tr'); const td = textCell(empty); td.colSpan = colspan; tr.appendChild(td); body.appendChild(tr); }
  else rows.forEach(row => body.appendChild(row));
}
function renderClients() {
  const rows = state.clients.map(c => { const tr = document.createElement('tr'); tr.append(textCell(`#${c.id}`,true), textCell(c.nome,true), textCell(`${c.cidade}/${c.uf}`), pillCell(c.telegram_ativo ? 'Vinculado' : 'Pendente', c.telegram_ativo ? '' : 'gray')); cellWithButton(tr, 'Gerar convite', async () => {
    try { displayInvite(await request(`/api/clientes/${c.id}/vinculo`, { method: 'POST' })); showAlert(`Convite para ${c.nome} criado.`); } catch (err) { showAlert(err.message, true); }
  }); return tr; });
  renderTable('#clients-body', rows, 5, 'Nenhum cliente cadastrado.');
  const current = $('#order-client').value; $('#order-client').replaceChildren(new Option('Selecione um cliente', ''));
  state.clients.forEach(c => $('#order-client').add(new Option(`${c.nome} (#${c.id})`, String(c.id)))); $('#order-client').value = current;
}
function renderProducts() {
  const rows = state.products.map(p => { const tr = document.createElement('tr'); tr.append(textCell(`#${p.id}`),textCell(p.nome,true),textCell(money(p.preco_centavos)),pillCell(p.ativo ? 'Ativo' : 'Inativo',p.ativo ? '' : 'gray')); return tr; });
  renderTable('#products-body',rows,4,'Nenhum produto cadastrado.');
  const current = $('#order-product').value; $('#order-product').replaceChildren(new Option('Selecione um produto', ''));
  state.products.filter(p => p.ativo).forEach(p => $('#order-product').add(new Option(`${p.nome} • ${money(p.preco_centavos)}`,String(p.id)))); $('#order-product').value=current;
}
function renderOrders() {
  const rows = state.orders.map(p => { const tr = document.createElement('tr');
    tr.append(textCell(`#${p.id}`,true), textCell(p.cliente_nome), textCell(p.itens.map(i => `${i.quantidade}× ${i.produto}`).join(', ')),textCell(money(p.total_centavos)),pillCell(texts[p.status] || p.status, p.status==='entregue' ? '' : 'blue'));
    const index = stages.indexOf(p.status);
    if (index < stages.length - 1) cellWithButton(tr, `→ ${texts[stages[index + 1]]}`,async () => {
      try { await request(`/api/pedidos/${p.id}/status`,{method:'PATCH',body:JSON.stringify({ status: stages[index+1] })}); await refresh(); showAlert(`Pedido #${p.id}: atualizado para ${stages[index + 1]}.`); } catch(err){showAlert(err.message,true);}
    });
    else tr.appendChild(textCell('Concluído'));
    return tr;
  }); renderTable('#orders-body',rows,6,'Nenhum pedido criado.');
}
function renderMessages() {
  const rows = state.messages.map(m => { const tr = document.createElement('tr');tr.append(textCell(`#${m.id}`),textCell(m.pedido_id ? `#${m.pedido_id}` : '—'),textCell(m.direcao),textCell(m.conteudo.length > 100 ? `${m.conteudo.slice(0,100)}…` : m.conteudo),pillCell(m.status,m.status==='falha'?'red':m.status==='enfileirada'?'gray':'')); return tr; });
  renderTable('#messages-body',rows,5,'Nenhuma mensagem registrada.');
}
function displayInvite(data) { const box=$('#invite'); const link=$('#invite-link'); link.href=data.link_telegram.startsWith('https://')?data.link_telegram:'#'; link.textContent=data.link_telegram; box.classList.remove('hidden'); }
async function refresh() {
  try {
    const [summary,clients,products,orders,messages]= await Promise.all([
      request('/api/resumo'),request('/api/clientes'),request('/api/produtos'),request('/api/pedidos'),request('/api/mensagens')
    ]);
    state.clients=clients;state.products=products;state.orders=orders;state.messages=messages;
    $('#s-clientes').textContent=summary.clientes;$('#s-produtos').textContent=summary.produtos;$('#s-pedidos').textContent=summary.pedidos;$('#s-enviadas').textContent=summary.mensagens_enviadas;
    renderClients();renderProducts();renderOrders();renderMessages();
  } catch(err){showAlert(err.message,true);}
}
$('#key-btn').addEventListener('click',()=>{
  // A chave fica somente na sessao do navegador. Nunca a divulgue a outras pessoas.
  const next = window.prompt('Insira a ADMIN_API_KEY do arquivo .env:',adminKey);
  if(next===null)return;
  adminKey=next.trim();sessionStorage.setItem('pedidoja_key',adminKey);refresh();
});
$('#refresh-btn').addEventListener('click',refresh);
$('#client-form').addEventListener('submit',async e=>{
  e.preventDefault();try{const data=await request('/api/clientes',{method:'POST',body:JSON.stringify(formObj(e.target))});displayInvite(data);e.target.reset();await refresh();showAlert('Cliente cadastrado! Compartilhe o link de ativação do bot.');}catch(err){showAlert(err.message,true);}
});
$('#product-form').addEventListener('submit',async e=>{
  e.preventDefault();try{const data=formObj(e.target);data.preco_centavos=Math.round(Number(data.preco)*100);delete data.preco;await request('/api/produtos',{method:'POST',body:JSON.stringify(data)});e.target.reset();await refresh();showAlert('Produto adicionado ao catálogo.');}catch(err){showAlert(err.message,true);}
});
$('#order-form').addEventListener('submit',async e=>{
  e.preventDefault();try{const data={cliente_id:$('#order-client').value,itens:[{produto_id:$('#order-product').value,quantidade:Number($('#order-qty').value)}]};const order=await request('/api/pedidos',{method:'POST',body:JSON.stringify(data)});await refresh();showAlert(`Pedido #${order.id} criado! Notificação: ${order.notificacao}.`);}catch(err){showAlert(err.message,true);}
});
$('#copy-link').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('#invite-link').textContent);showAlert('Link copiado.');}catch{showAlert('Não foi possível copiar automaticamente.',true);}
});
if (adminKey) refresh();
