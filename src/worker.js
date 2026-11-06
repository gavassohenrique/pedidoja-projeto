import { database } from './lib/db.js';
import { processOneWebhook } from './services/webhooks.js';
import { processOneOutgoing } from './services/outbox.js';

const poll = Math.max(500, Number(process.env.WORKER_POLL_MS || 1500));
let running = true;
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });
console.log('Worker PedidoJá iniciado');
while (running) {
  try {
    // Esvazia fila de entrada antes de enviar as respostas.
    const incoming = await processOneWebhook();
    const outgoing = await processOneOutgoing();
    if (!incoming && !outgoing) await new Promise(resolve => setTimeout(resolve, poll));
  } catch (err) {
    console.error('Worker:', err.message);
    await new Promise(resolve => setTimeout(resolve, poll));
  }
}
await database().end();
