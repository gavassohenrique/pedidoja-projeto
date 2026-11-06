# Plano de entrega e evidências — PedidoJá

## Arquivos já incluídos no pacote
- [x] Backend REST com Node.js/Express.
- [x] Integração ViaCEP, com validação de CEP de cadastro/entrega.
- [x] Telegram Bot API com envio, botões, webhook, segredo e log.
- [x] Opt-in por convite e vínculo de `chat_id`.
- [x] PostgreSQL com tabelas, constraints e migrations versionadas.
- [x] Registros de `enfileirada`, `enviada`, `falha`, `respondida`.
- [x] Idempotência por `update_id` e salvamento de payloads.
- [x] Docker Compose local (API, worker e banco) e observabilidade opcional.
- [x] Site administrativo responsivo.
- [x] Pipeline GitHub Actions de lint e testes.
- [x] Configuração prevista para AWS com RDS, DNS e HTTPS.
- [x] Documento de requisitos, API, implantação e roteiro de apresentação.
- [x] Testes unitários com mocks de Telegram/ViaCEP.

## Ações que o grupo ainda deve REALIZAR e comprovar
- [ ] Definir integrantes, turma e docente no documento e no GitHub.
- [ ] Instalar dependências no próprio computador e executar projeto com Docker Desktop.
- [ ] Criar bot pelo @BotFather, proteger o token e configurar URL do bot.
- [ ] Expor webhook HTTPS em dev e validar `setWebhook`.
- [ ] Testar opt-in com uma conta Telegram real, usando link do cadastro.
- [ ] Executar cenário ponta a ponta: cadastro, pedido, cinco status, botões, histórico.
- [ ] Registrar evidências visuais reais de execução (prints do painel, banco, API e bot).
- [ ] Testar erro 401 do webhook e idempotência do update_id.
- [ ] Criar repositório GitHub real e fazer commits/tags conforme aulas concluídas (`aula-01`…`aula-18`).
- [ ] Publicar na AWS EC2, com PostgreSQL obrigatoriamente no RDS.
- [ ] Configurar Route 53, nameservers, domínio real e HTTPS válido.
- [ ] Comprovar RDS privado, TLS, migrations e webcam Telegram no domínio público.
- [ ] Configurar orçamento AWS, coletar custos e anexar capturas de tela.
- [ ] Abrir release v1.0.0 após a última verificação e enviar URL pública ao professor.

## Recomendação de screenshots para slides/relatório
1. Tela inicial do painel com KPIs (sem chave visível).
2. Cadastro de cliente e preenchimento de endereço via ViaCEP.
3. Cliente com o estado Telegram vinculado.
4. Pedido criado em status recebido e histórico no banco.
5. Telegram mostrando mensagens nos status pago, separado, enviado e entregue.
6. Botão "Confirmar ciência" e log com status respondida.
7. Postman/Insomnia mostrando webhook 401 sem segredo e 200 com segredo.
8. Estrutura PostgreSQL/migrations executadas.
9. GitHub Actions com checks passando.
10. URL HTTPS pública, EC2/RDS, security groups, Route 53 e AWS Budgets.

Não crie prints falsos; a avaliação pode solicitar demonstração ao vivo.
