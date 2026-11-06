# Manual da API — PedidoJá

Servidor local: `http://localhost:3000`. Todo endpoint `/api/` exige `X-Admin-Key` contendo o segredo configurado no `.env`. Exemplos com JSON, ids ilustrativos. A chave não deve ser mostrada em slides, prints ou repositório.

## 1. Consulta de CEP

`GET /api/cep/01001000`

Resposta ilustrativa: `{ "cep":"01001000", "logradouro":"Praça da Sé", "bairro":"Sé", "cidade":"São Paulo", "uf":"SP" }`.

CEP de formato inválido → HTTP 422; CEP não encontrado → 422; ViaCEP indisponível → 503. A API não comprova existência do número da residência.

## 2. Cadastro de cliente e vínculo

`POST /api/clientes`:

```json
{
  "nome": "Ana Oliveira",
  "email": "ana.exemplo@example.org",
  "telefone": "11999990000",
  "cep": "01001-000",
  "numero": "100",
  "complemento": "Sala 2"
}
```

Retorna HTTP 201 com dados do cliente e `link_telegram` (o link incorpora código aleatório **exclusivo**, validade de 24 horas). O `codigo_hash` fica no PostgreSQL; não o texto do código. O cliente abre no Telegram e inicia `/start codigo`. O webhook confirma o código e grava o `chat_id` em `canais_usuario`.

`GET /api/clientes`: lista com `telegram_ativo`.

`POST /api/clientes/1/vinculo`: revoga convites anteriores e cria novo link.

## 3. Cadastro de produto

`POST /api/produtos`:

```json
{ "nome":"Headset gamer", "descricao":"Fone com microfone", "preco_centavos":14990 }
```

Preços são armazenados em **centavos**. `14990` significa R$ 149,90. Não envie número fracionário como `149.90` neste campo.

`GET /api/produtos`: retorna catálogo.

## 4. Pedido

`POST /api/pedidos`:

```json
{
  "cliente_id": 1,
  "itens": [
    { "produto_id": 1, "quantidade": 2 },
    { "produto_id": 2, "quantidade": 1 }
  ]
}
```

A API revalida o CEP do cliente, consulta os preços no PostgreSQL, grava o endereço como snapshot, cria `itens_pedido`, registra o histórico e adiciona mensagem à fila. Resposta HTTP 201 contém `status: "recebido"`, `total_centavos` e `notificacao` (`enfileirada` ou `falha` quando sem opt-in).

`PATCH /api/pedidos/1/status`:

```json
{ "status":"pago" }
```

Ordem obrigatória: `recebido → pago → separado → enviado → entregue`. Uma transição inválida retorna HTTP **409**. Cada transição cria registro no `historico_status` e em `mensagens`.

`GET /api/pedidos`: retorna últimos 200 pedidos, cada um com cliente, itens e total.

`GET /api/pedidos/1/historico`: retorna status e data/hora.

## 5. Auditoria

`GET /api/mensagens`: últimas 100 entradas e saídas, incluindo `status`, `id_externo`, código e descrição de erro. `payload_bruto` completo fica no banco, por motivo de privacidade não vai na API do painel.

`GET /api/resumo`: contadores de clientes, produtos, pedidos, notificações enviadas e falhas.

`GET /health`: verifica acesso ao banco.

`GET /metrics`: métricas agregadas em formato Prometheus (não publica dados pessoais).

## 6. Webhook

`POST /webhook/telegram` recebe requisições da plataforma, com o cabeçalho `X-Telegram-Bot-Api-Secret-Token`. A checagem é feita em tempo constante sobre hashes SHA-256. Sem cabeçalho válido, HTTP **401**; com evento válido, salva JSON bruto em `webhook_updates` e retorna HTTP **200** rapidamente.

O worker processa `message` e `callback_query`, com idempotência de `update_id`. Para a mensagem de saída, `status = enfileirada` antes da tentativa; `enviada` após sucesso do Telegram; `falha` se sem vínculo ou falha permanente; `respondida` após o clique no botão `Confirmar ciência`. Telegram **não oferece confirmação de mensagem lida**; `respondida` é a prova de interação.

## 7. Erros usuais

| HTTP | Significado |
|---|---|
| 200 | Consulta/processamento aceito |
| 201 | Recurso criado |
| 400 | JSON ou update inválido |
| 401 | Segredo/credencial inválida |
| 404 | Pedido ou cliente não localizado |
| 409 | Duplicidade ou transição inválida |
| 422 | CEP inválido, item ou dado inválido |
| 503 | ViaCEP ou dependência externa indisponível |

**Nota:** em produção, configure rate-limiting no reverse proxy e controle de acesso apropriado para diferentes operadores. A autenticação por chave única atende à demonstração acadêmica, não constitui solução completa multiusuário de e-commerce.
