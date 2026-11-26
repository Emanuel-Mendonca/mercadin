/**
 * Identificadores para sincronização
 * -----------------------------------------------------------------------
 * UUID v7, definido na RFC 9562. Os 48 bits mais significativos são o
 * horário em milissegundos, então os ids nascem em ordem crescente: um
 * índice sobre a chave primária não fragmenta, e ordenar por id é quase
 * ordenar por data de criação.
 *
 * Por que não v4: v4 é aleatório puro. Funciona como identidade, mas espalha
 * as inserções pelo índice inteiro, e perdemos de graça a ordenação temporal
 * que o v7 dá.
 *
 * Por que não continuar com `AUTOINCREMENT`: dois aparelhos offline criam
 * `id = 1` para compras diferentes. Ver docs/projeto/PLATAFORMA.md.
 *
 * `montarUuidV7` é pura de propósito: recebe o horário e os bytes aleatórios
 * em vez de buscá-los. É o que permite testá-la sem módulo nativo e com
 * valores conhecidos.
 */

function paraHex(bytes: Uint8Array): string {
  let saida = '';
  for (const byte of bytes) {
    saida += byte.toString(16).padStart(2, '0');
  }
  return saida;
}

/**
 * Monta um UUID v7 a partir de um instante e de 10 bytes aleatórios.
 *
 * Layout (16 bytes): 6 de horário, 2 que carregam a versão mais aleatório,
 * 8 que carregam a variante mais aleatório. Os bits de versão e variante são
 * obrigatórios: sem eles o valor é uma string de 36 caracteres que só parece
 * um UUID, e qualquer biblioteca que valide o formato recusa.
 */
export function montarUuidV7(agoraMs: number, aleatorios: Uint8Array): string {
  if (aleatorios.length < 10) {
    throw new Error('UUID v7 precisa de pelo menos 10 bytes aleatórios');
  }

  const bytes = new Uint8Array(16);

  // 48 bits de horário, big-endian. `Math.floor` protege contra um relógio
  // que devolva fração de milissegundo.
  let restante = Math.floor(agoraMs);
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = restante % 256;
    restante = Math.floor(restante / 256);
  }

  for (let i = 0; i < 10; i += 1) {
    bytes[6 + i] = aleatorios[i] as number;
  }

  // Versão 7 nos 4 bits altos do byte 6.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  // Variante RFC (10xx) nos 2 bits altos do byte 8.
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = paraHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

/** Extrai o instante de criação embutido no UUID v7. Útil em diagnóstico. */
export function instanteDoUuidV7(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}

/** Reconhece o formato, incluindo os bits de versão e variante. */
export function ehUuidV7(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(valor);
}
