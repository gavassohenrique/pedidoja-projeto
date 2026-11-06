import 'dotenv/config';
const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL } = process.env;
if (!TELEGRAM_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !PUBLIC_URL?.startsWith('https://')) {
  console.error('Configure TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET e PUBLIC_URL (https://...) no .env');
  process.exit(1);
}
const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `${PUBLIC_URL.replace(/\/$/, '')}/webhook/telegram`,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false
  })
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
