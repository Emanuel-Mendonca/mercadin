import { getDb } from './db';
import { agora, novoId } from './identidade';

/** Retorna o id do mercado, criando-o se ainda não existir. */
export async function getOrCreateMercado(nomeBruto: string): Promise<string> {
  const nome = nomeBruto.trim();
  const db = await getDb();

  // Um mercado com tombstone não conta como existente: se o usuário voltar a
  // comprar nele, o cadastro renasce com identidade nova, e a exclusão
  // anterior continua válida para sincronizar.
  const existente = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM mercados WHERE nome = ? AND excluido_em IS NULL',
    [nome]
  );
  if (existente) return existente.id;

  const id = novoId();
  await db.runAsync('INSERT INTO mercados (id, nome, atualizado_em) VALUES (?, ?, ?)', [
    id,
    nome,
    agora()
  ]);
  return id;
}

/**
 * Só mercados que têm pelo menos uma compra.
 *
 * Corrigir o nome de um mercado (editando uma compra) cria um registro novo e
 * deixa o antigo sem nenhuma compra apontando para ele. Listar a tabela
 * inteira faria o filtro do Histórico oferecer um mercado que, na prática,
 * não existe mais, e que não devolve resultado nenhum ao ser selecionado.
 */
export async function listMercadosNomes(): Promise<string[]> {
  const db = await getDb();
  const linhas = await db.getAllAsync<{ nome: string }>(
    `SELECT m.nome
       FROM mercados m
       JOIN compras c ON c.mercado_id = m.id AND c.excluido_em IS NULL
      WHERE m.excluido_em IS NULL
      GROUP BY m.id, m.nome
      ORDER BY m.nome`
  );
  return linhas.map((l) => l.nome);
}

/**
 * Marca como excluídos os mercados que ficaram sem nenhuma compra. Chamado
 * após gravar ou excluir uma compra, para a tabela não acumular nomes
 * abandonados por correções de digitação.
 *
 * Exclusão lógica, não `DELETE`: a compra que apontava para o mercado pode
 * existir como tombstone, e a chave estrangeira ainda precisa resolver.
 */
export async function limparMercadosOrfaos(): Promise<void> {
  const db = await getDb();
  const instante = agora();
  await db.runAsync(
    `UPDATE mercados
        SET excluido_em = ?, atualizado_em = ?
      WHERE excluido_em IS NULL
        AND id NOT IN (SELECT DISTINCT mercado_id FROM compras WHERE excluido_em IS NULL)`,
    [instante, instante]
  );
}
