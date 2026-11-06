import { normalizeCEP, fail } from '../lib/utils.js';

export async function consultarCEP(cepInput, fetchImpl = fetch) {
  const cep = normalizeCEP(cepInput);
  let response;
  try {
    response = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6500) });
  } catch { return fail('ViaCEP indisponivel. Tente novamente em instantes.', 503); }
  if (!response.ok) return fail('Nao foi possivel consultar o ViaCEP.', 503);
  let data;
  try { data = await response.json(); } catch { return fail('Resposta invalida do ViaCEP.', 503); }
  if (data.erro) return fail('CEP nao localizado no ViaCEP.', 422);
  if (!data.localidade || !data.uf || !data.cep) return fail('Resposta incompleta do ViaCEP.', 503);
  return {
    cep,
    logradouro: data.logradouro || '(logradouro nao informado)',
    bairro: data.bairro || '(bairro nao informado)',
    cidade: data.localidade,
    uf: data.uf
  };
}
