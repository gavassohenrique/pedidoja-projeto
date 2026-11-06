import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramCall } from '../src/services/telegram.js';

test('Telegram envia dados via HTTPS e captura id externo',async()=>{
  process.env.TELEGRAM_TOKEN='token_fake_para_teste';
  const result=await telegramCall('sendMessage',{chat_id:'42',text:'Pedido recebido'},async (url,opts)=>{
    assert.match(url,/bottoken_fake_para_teste\/sendMessage/);
    assert.equal(opts.method,'POST');
    return {ok:true,json:async()=>({ok:true,result:{message_id:900}})};
  });
  assert.equal(result.message_id,900);
});
