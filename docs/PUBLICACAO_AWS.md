# Guia de publicação do PedidoJá — AWS EC2 + RDS + Route 53 + HTTPS

**Escolha de arquitetura do projeto:** AWS EC2 pequena (`t3.micro`/`t4g.micro`, conforme elegibilidade/arquitetura escolhida), Amazon RDS for PostgreSQL com instância mínima elegível, Amazon Route 53 para DNS, e Caddy com Let's Encrypt rodando na EC2 para certificado HTTPS. O código e o `compose.prod.yml` estão prontos para essa topologia, mas a configuração efetiva **depende das credenciais, domínio e recursos AWS do grupo**.

## 1. Planejamento e custos

1. Defina a região da aplicação e do banco (preferencialmente a mesma, para reduzir latência e simplificar rede). Anote o nome da região no relatório.
2. Calcule a estimativa **atual** em https://calculator.aws. Não é possível garantir preço fixo, pois varia por região, instância, armazenamento e impostos.
3. Crie um orçamento no **AWS Budgets**, com alertas para US$ 25, US$ 50 e US$ 100, além de um teto compatível com os US$ 200 de crédito previstos no enunciado.
4. Escolha uma VM pequena de arquitetura compatível com a imagem Node 22 (x86_64 ou ARM64, conforme instância). Evite NAT Gateway, load balancer, multi-AZ RDS e grandes discos neste trabalho.
5. Planeje custo de zona hospedada Route 53, domínio, armazenamento, endereço IP público e snapshots. Recursos parados ainda podem gerar cobranças de disco/IP e componentes gerenciados. Confirme **cobrança e disponibilidade no console** antes de criar serviços.

## 2. Rede segura

1. Crie uma VPC simples e identifique sub-redes. Coloque a EC2 em sub-rede pública com acesso 80/443 e mantenha o RDS em sub-redes privadas, sem **Public access**.
2. Grupo de segurança `sg-pedidoja-ec2`: permitir TCP **80** (emissão/renovação do certificado), **443** (aplicação), **22** apenas do IP de administração (ou prefira Session Manager). Saída para Telegram API, ViaCEP e PostgreSQL.
3. Grupo de segurança `sg-pedidoja-rds`: permitir TCP **5432** **apenas** com *source = sg-pedidoja-ec2*. Nunca abra PostgreSQL para `0.0.0.0/0`.
4. Crie o RDS PostgreSQL em modo básico, com o menor tamanho que suporte o laboratório, backup curto conforme critério do professor, sem réplicas. Guarde **endpoint**, **porta 5432**, nome do banco, usuário e senha fora do código. Ative **SSL/TLS**.
5. Comprove com prints que RDS não está público e a regra de 5432 aponta somente para o Security Group da aplicação.

## 3. EC2 e Docker

1. Crie EC2 Ubuntu LTS (versão suportada), com disco pequeno e acesso administrativo seguro.
2. Instale Docker Engine e Compose Plugin conforme a documentação do Docker: https://docs.docker.com/engine/install/ubuntu/.
3. Na EC2, transfira/clone o repositório do PedidoJá.
4. Crie `certs/` e baixe o certificado global de CA do RDS em https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem. Revise as recomendações de TLS do RDS e não use `rejectUnauthorized:false`.
5. Crie `.env.production` **na EC2** (nunca commite), com modo 600, e configuração semelhante a:

   ```ini
   PORT=3000
   NODE_ENV=production
   ADMIN_API_KEY=COLOQUE_UMA_CHAVE_LONGA_GERADA_ALEATORIAMENTE
   TELEGRAM_TOKEN=COLOQUE_TOKEN_REAL_DO_BOT
   TELEGRAM_WEBHOOK_SECRET=COLOQUE_OUTRO_SEGREDO_LONGO
   TELEGRAM_BOT_USERNAME=nome_unico_do_bot
   PUBLIC_URL=https://pedidoja.seudominio.com.br
   DATABASE_URL=postgresql://USUARIO:SENHA@ENDPOINT_RDS:5432/pedidoja
   PG_SSL_CA_FILE=/run/secrets/aws-global-bundle.pem
   ```

   Se a senha contiver `@`, `#`, `:` ou `/`, aplique **URL encoding** no `DATABASE_URL`. A configuração TLS do Node lê o arquivo CA. Não adicione `sslmode=require` ao URL quando já usa `ssl` com CA validada, evitando sobrescrever opções no cliente PostgreSQL. Em cenário profissional, use AWS Systems Manager/Secrets Manager e IAM para injetar credenciais sem manter arquivo no host; essa alternativa não está automatizada no repositório.
6. Atualize `Caddyfile` para seu **domínio verdadeiro** antes de subir o ambiente.

## 4. DNS via Route 53

1. Adquira ou use um domínio que o grupo tenha permissão de gerenciar. No console AWS abra **Route 53 → Hosted zones → Create hosted zone** e selecione *Public hosted zone*.
2. Copie exatamente os **quatro name servers** (registros NS) atribuídos à zona. No registrador do domínio (Registro.br etc.), configure esses servidores autoritativos; sem isso os registros Route 53 podem não ser usados pela Internet.
3. Reserve um **Elastic IP** se precisar manter endereço estável (confira custo de IPv4 público na sua região), associe-o à EC2 e crie um registro **A** (`pedidoja.seudominio.com.br`) apontando para ele. Caso use um subdomínio, configure seu nome corretamente.
4. Consulte DNS público: `nslookup pedidoja.seudominio.com.br` (ou `dig +short pedidoja.seudominio.com.br`). Deve apontar para o IP da EC2. Aguarde propagação se necessário.
5. Registre prints da zona, NS, registro A e do comando `nslookup`.

**Por que registro A?** Para essa arquitetura, a EC2 usa endereço IPv4. CNAME seria apropriado se o destino fosse outro hostname, como um serviço gerenciado com DNS próprio. A escolha deve refletir a arquitetura real.

## 5. Publicação e HTTPS

1. Depois de DNS apontar e de liberar TCP 80/443, na EC2 execute:

   ```bash
   chmod 600 .env.production
   docker compose -f compose.prod.yml up --build -d
   docker compose -f compose.prod.yml logs --tail=100 api caddy worker
   ```

2. A API executa as **migrations contra o RDS** durante a inicialização; o banco não roda dentro da EC2.
3. Caddy acessa `api:3000` na rede interna e obtém/renova automaticamente o certificado público via Let's Encrypt. O registro DNS e portas 80/443 devem estar funcionando **antes** da emissão.
4. Teste no navegador `https://pedidoja.seudominio.com.br`, verifique o cadeado e emissor do certificado. Teste `https://pedidoja.seudominio.com.br/health` para confirmar conexão com RDS.
5. No terminal da EC2 (não no container), configure o webhook oficial usando variáveis de ambiente ou execução Node local. Alternativa com Docker Compose:

   ```bash
   docker compose -f compose.prod.yml exec api node scripts/register-webhook.js
   ```

   Esse comando exige `PUBLIC_URL` HTTPS, `TELEGRAM_TOKEN` e segredo disponíveis no container, e registra `https://pedidoja.seudominio.com.br/webhook/telegram`. Não precisa ngrok/cloudflared em produção.
6. Consulte o endpoint `getWebhookInfo` pela Bot API para registrar que o webhook definitivo está correto.

**Importante:** não compartilhe prints com senha, token, URL contendo credenciais, API key ou connection string completa. Tarje os valores antes de colocar no documento final.

## 6. Evidências solicitadas no Anexo B

| Evidência | O que deve aparecer |
|---|---|
| E1 | Painel EC2: instância, região e estado *running* |
| E2 | Painel RDS: PostgreSQL gerenciado + endpoint mascarado |
| E3 | Grupo de segurança RDS: 5432 vindo somente do SG da EC2 |
| E4 | Log das migrations aplicadas contra o RDS |
| E5 | Route 53 Hosted Zone com NS, A e IP correto |
| E6 | Resultado do `nslookup` do domínio |
| E7 | Certificado HTTPS válido no navegador (emissor Let's Encrypt) |
| E8 | Webhook Telegram apontando para domínio definitivo |
| E9 | AWS Budgets: alertas de US$ 25/50/100 e consumo atual |
| E10 | Testes de mensagem enviada, recebida, clique e rejeição 401 |

Todos os prints acima precisam ser gerados **depois da publicação real**. Não são fornecidos como se a nuvem já tivesse sido configurada.

## 7. Ciclo de vida e encerramento

- Parar/reiniciar EC2 com atenção ao IP/DNS se não houver Elastic IP. **Atenção:** um IP público pode mudar ao iniciar a instância.
- RDS permite parar temporariamente algumas configurações, com regras de reinicialização automática após certo período; confirme comportamentos atuais na documentação do serviço. Armazenamento e backups continuam com custo.
- Antes de encerrar semestre, exporte dados necessários e apague RDS, EC2, Elastic IP, Hosted Zone e quaisquer outros recursos não usados, verificando cobranças restantes.

## 8. Pesquisa obrigatória do provedor (Anexo B.9)

As nove respostas abaixo devem ser **completadas com dados verdadeiros do grupo** (não presumidos):

1. **EC2 e mensalidade:** instância escolhida `[... ]`, região `[... ]`, preço da calculadora `[... ]`.
2. **RDS e endpoint:** classe `[... ]`, região `[... ]`, endpoint sem segredo `[... ]`.
3. **Regra do banco:** security group `[... ]`, origem da porta 5432 `[... ]`.
4. **DNS:** nome da zona hospedada Route 53 `[... ]`.
5. **Nameservers:** quatro registros NS `[... ]` e registrador `[... ]`.
6. **A/CNAME:** registro adotado e justificativa: A para IPv4 fixo da EC2 `[confirmar]`.
7. **Certificado:** Caddy + Let's Encrypt; validar emissor, renovação e motivo de não usar ACM direto na VM simples.
8. **Alerta de gasto:** orçamento `[... ]` e e-mail `[... ]` (mascarado no relatório).
9. **Parada e custo residual:** o que foi parado, o que segue cobrado, e data do encerramento `[... ]`.

## Referências oficiais

- https://docs.aws.amazon.com/ec2/ ; https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
- https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ ; https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html ; https://caddyserver.com/docs/automatic-https
- https://calculator.aws/ ; https://core.telegram.org/bots/api
