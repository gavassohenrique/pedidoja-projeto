import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarCEP } from '../src/services/viacep.js';

test('ViaCEP devolve endereco normalizado e permite CEP sem hifen',async()=>{
  const result=await consultarCEP('01001-000',async url=>{
    assert.match(url,/01001000\/json/);
    return { ok:true, json:async()=>({cep:'01001-000',logradouro:'Praca da Se',bairro:'Se',localidade:'Sao Paulo',uf:'SP'}) };
  });
  assert.deepEqual(result,{cep:'01001000',logradouro:'Praca da Se',bairro:'Se',cidade:'Sao Paulo',uf:'SP'});
});
test('ViaCEP rejeita CEP inexistente',async()=>{
  await assert.rejects(()=>consultarCEP('99999999',async()=>({ok:true,json:async()=>({erro:true})})),/nao localizado/);
});
test('ViaCEP retorna erro amigavel em indisponibilidade',async()=>{
  await assert.rejects(()=>consultarCEP('01001000',async()=>{throw new Error('timeout');}),/indisponivel/);
});
