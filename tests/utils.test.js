import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStatus, strongEqual, normalizeCEP, tokenHash, inviteToken, validPrice, formatBRL } from '../src/lib/utils.js';
import { buttonsForOrder } from '../src/services/telegram.js';

test('status avanca exatamente uma etapa por vez', () => {
  assert.equal(nextStatus('recebido','pago'),true);
  assert.equal(nextStatus('pago','separado'),true);
  assert.equal(nextStatus('separado','enviado'),true);
  assert.equal(nextStatus('enviado','entregue'),true);
  assert.equal(nextStatus('recebido','entregue'),false);
  assert.equal(nextStatus('entregue','entregue'),false);
});
test('comparacao de segredo nao aceita valor ausente ou incorreto', () => {
  assert.equal(strongEqual('meu-token-secreto','meu-token-secreto'),true);
  assert.equal(strongEqual('abc','xyz'),false);
  assert.equal(strongEqual(undefined,'abc'),false);
});
test('convite forte e hash de 64 caracteres', () => {
  const token=inviteToken();
  assert.match(token,/^[a-f0-9]{48}$/);
  assert.match(tokenHash(token),/^[a-f0-9]{64}$/);
});
test('CEP valido ou rejeitado', () => {
  assert.equal(normalizeCEP('01001-000'),'01001000');
  assert.throws(()=>normalizeCEP('ABC'),/8 digitos/);
  assert.throws(()=>normalizeCEP('AB01001000'),/8 digitos/);
});
test('preco em centavos e moeda',()=>{
  assert.equal(validPrice(14990),true);
  assert.equal(validPrice(0),false);
  assert.equal(validPrice(1.5),false);
  assert.match(formatBRL(14990),/149,90/);
});
test('callback de pedido referencia id numerico',()=>{
  assert.equal(buttonsForOrder(42).inline_keyboard[0][0].callback_data,'pedido:42:ciente');
});
