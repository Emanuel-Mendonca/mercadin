import { getRandomBytes } from 'expo-crypto';

import { montarUuidV7 } from '@/utils/uuid';

/**
 * Identidade de um registro sincronizável.
 *
 * Fica separada de `@/utils/uuid` porque aquele arquivo é puro e roda nos
 * testes sem módulo nativo; aqui entra a fonte de entropia do sistema, que
 * só existe no aparelho. A separação é o que permite testar o formato do
 * UUID sem simular o `expo-crypto`.
 *
 * O id é gerado no cliente, não no servidor: uma compra registrada dentro do
 * supermercado, sem sinal, precisa de identidade na hora, e essa identidade
 * tem que continuar valendo quando a sincronização acontecer dias depois.
 */
export function novoId(): string {
  return montarUuidV7(Date.now(), getRandomBytes(10));
}

/** Carimbo de alteração usado pela sincronização. Sempre UTC, em ms. */
export function agora(): number {
  return Date.now();
}
