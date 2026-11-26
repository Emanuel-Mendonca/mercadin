import type { MetodoPagamento } from '@/types';

import { getDb } from './db';
import { agora, novoId } from './identidade';

export async function listMetodosPagamento(): Promise<MetodoPagamento[]> {
  const db = await getDb();
  return db.getAllAsync<MetodoPagamento>(
    'SELECT id, nome FROM metodos_pagamento WHERE excluido_em IS NULL ORDER BY nome'
  );
}

/**
 * @returns `true` se a forma de pagamento entrou, `false` se já existia. O
 * índice único ignora linhas com tombstone, então um nome excluído antes
 * pode ser cadastrado de novo, com identidade nova.
 */
export async function addMetodoPagamento(nomeBruto: string): Promise<boolean> {
  const nome = nomeBruto.trim();
  if (!nome) return false;
  const db = await getDb();
  const resultado = await db.runAsync(
    'INSERT OR IGNORE INTO metodos_pagamento (id, nome, atualizado_em) VALUES (?, ?, ?)',
    [novoId(), nome, agora()]
  );
  return resultado.changes > 0;
}

export async function renameMetodoPagamento(id: string, novoNomeBruto: string): Promise<void> {
  const novoNome = novoNomeBruto.trim();
  if (!novoNome) return;
  const db = await getDb();
  await db.runAsync('UPDATE metodos_pagamento SET nome = ?, atualizado_em = ? WHERE id = ?', [
    novoNome,
    agora(),
    id
  ]);
}

/**
 * As compras que usavam esta forma de pagamento continuam existindo: só
 * perdem a referência (a coluna volta a ser nula). Apagar as compras junto
 * seria destruir histórico financeiro por causa de uma mudança de cadastro.
 */
export async function removeMetodoPagamento(id: string): Promise<void> {
  const db = await getDb();
  const instante = agora();
  await db.runAsync(
    'UPDATE compras SET metodo_pagamento_id = NULL, atualizado_em = ? WHERE metodo_pagamento_id = ?',
    [instante, id]
  );
  await db.runAsync(
    'UPDATE metodos_pagamento SET excluido_em = ?, atualizado_em = ? WHERE id = ?',
    [instante, instante, id]
  );
}

/** Retorna o id da forma de pagamento, criando-a se ainda não existir. */
export async function getOrCreateMetodoPagamento(nomeBruto: string): Promise<string | null> {
  const nome = nomeBruto.trim();
  if (!nome) return null;
  const db = await getDb();

  const existente = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM metodos_pagamento WHERE nome = ? AND excluido_em IS NULL',
    [nome]
  );
  if (existente) return existente.id;

  const id = novoId();
  await db.runAsync('INSERT INTO metodos_pagamento (id, nome, atualizado_em) VALUES (?, ?, ?)', [
    id,
    nome,
    agora()
  ]);
  return id;
}
