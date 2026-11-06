-- 001: modelo relacional. Mantidos os nomes exigidos no Anexo A.5.
CREATE TYPE plataforma_msg AS ENUM ('telegram', 'discord');
CREATE TYPE status_msg AS ENUM ('enfileirada', 'enviada', 'falha', 'respondida');
CREATE TYPE status_pedido AS ENUM ('recebido', 'pago', 'separado', 'enviado', 'entregue');

CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  telefone VARCHAR(24),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clientes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE RESTRICT,
  cep CHAR(8) NOT NULL,
  logradouro VARCHAR(180) NOT NULL,
  bairro VARCHAR(120) NOT NULL,
  cidade VARCHAR(120) NOT NULL,
  uf CHAR(2) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  complemento VARCHAR(120),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE produtos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(140) NOT NULL,
  descricao TEXT,
  preco_centavos BIGINT NOT NULL CHECK (preco_centavos > 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE pedidos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id),
  status status_pedido NOT NULL DEFAULT 'recebido',
  total_centavos BIGINT NOT NULL CHECK (total_centavos > 0),
  endereco_entrega JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE itens_pedido (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id),
  quantidade INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 999),
  preco_unitario_centavos BIGINT NOT NULL CHECK (preco_unitario_centavos > 0),
  UNIQUE (pedido_id, produto_id)
);
CREATE TABLE historico_status (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  status status_pedido NOT NULL,
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE vinculos_pendentes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  codigo_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE canais_usuario (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  plataforma plataforma_msg NOT NULL,
  chat_id TEXT NOT NULL,
  codigo_convite TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  vinculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plataforma, chat_id),
  UNIQUE (usuario_id, plataforma)
);
CREATE TABLE mensagens (
  id BIGSERIAL PRIMARY KEY,
  canal_usuario_id BIGINT REFERENCES canais_usuario(id),
  plataforma plataforma_msg NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('saida','entrada')),
  id_externo TEXT,
  conteudo TEXT NOT NULL,
  status status_msg NOT NULL DEFAULT 'enfileirada',
  erro_codigo TEXT,
  erro_descricao TEXT,
  payload_bruto JSONB,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviada_em TIMESTAMPTZ,
  respondida_em TIMESTAMPTZ,
  pedido_id BIGINT REFERENCES pedidos(id),
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  processando_em TIMESTAMPTZ
);
CREATE INDEX idx_mensagens_externo ON mensagens (plataforma, id_externo);
CREATE INDEX idx_mensagens_status ON mensagens (status);
CREATE UNIQUE INDEX idx_mensagem_entrada_unica ON mensagens (plataforma, direcao, id_externo) WHERE direcao = 'entrada' AND id_externo IS NOT NULL;
CREATE INDEX idx_mensagens_fila ON mensagens (proxima_tentativa_em) WHERE direcao='saida' AND status='enfileirada';
CREATE TABLE webhook_updates (
  update_id BIGINT PRIMARY KEY,
  payload_bruto JSONB NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ,
  processando_em TIMESTAMPTZ,
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
