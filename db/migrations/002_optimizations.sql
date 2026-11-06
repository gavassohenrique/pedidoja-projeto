-- 002: indices para consultas e trilha de auditoria.
CREATE INDEX idx_pedidos_cliente_criado ON pedidos (cliente_id, criado_em DESC);
CREATE INDEX idx_historico_pedido ON historico_status (pedido_id, alterado_em DESC);
CREATE INDEX idx_webhook_fila ON webhook_updates (recebido_em) WHERE processado_em IS NULL;
