import 'dotenv/config';

export function requiredConfig(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}
export function config() {
  return {
    port: Number(process.env.PORT || 3000),
    adminKey: requiredConfig('ADMIN_API_KEY'),
    webhookSecret: requiredConfig('TELEGRAM_WEBHOOK_SECRET'),
    botToken: process.env.TELEGRAM_TOKEN || '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
    publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
    workerPollMs: Math.max(500, Number(process.env.WORKER_POLL_MS || 1500))
  };
}
