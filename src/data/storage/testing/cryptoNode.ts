import { randomBytes } from 'node:crypto';

/**
 * Implementação de `expo-crypto` para os testes.
 *
 * Entropia real, do Node: os ids gerados nos testes são tão únicos quanto os
 * do aparelho, e um teste que grave centenas de linhas não vai colidir por
 * acaso e falhar de forma intermitente.
 */
export function getRandomBytes(quantidade: number): Uint8Array {
  return new Uint8Array(randomBytes(quantidade));
}
