import type * as SQLite from 'expo-sqlite';

import { novoId } from './identidade';

/**
 * Migração do schema v1 (ids inteiros) para o v2 (ids UUID)
 * -----------------------------------------------------------------------
 * O v1 usava `INTEGER PRIMARY KEY AUTOINCREMENT`. Dois aparelhos offline
 * criam `id = 1` para compras diferentes, então esse schema não sincroniza:
 * qualquer envio ao servidor juntaria registros sem relação entre si.
 *
 * O v2 troca a chave por UUID v7 gerado no cliente e acrescenta, em toda
 * tabela sincronizável, `atualizado_em` (para resolver conflito) e
 * `excluido_em` (tombstone, para que uma exclusão viaje em vez de a linha
 * apenas sumir e ser ressuscitada no próximo sync).
 *
 * Estratégia: ler tudo para a memória, derrubar as tabelas antigas, criar as
 * novas e reinserir com os ids novos. O volume é de centenas de linhas, e
 * carregar tudo antes de destruir qualquer coisa é o que permite a operação
 * ser atômica: se a reinserção falhar, a transação volta e o banco continua
 * exatamente como estava.
 *
 * `ALTER TABLE ... RENAME TO` foi descartado de propósito: nas versões atuais
 * do SQLite ele reescreve as referências de chave estrangeira das outras
 * tabelas para o nome novo, o que deixaria `compras` apontando para
 * `mercados_v1` sem aviso nenhum.
 */

interface LinhaNomeada {
  id: number;
  nome: string;
}

interface LinhaCompra {
  id: number;
  mes: string;
  mercado_id: number;
  metodo_pagamento_id: number | null;
  total: number;
  created_at: number;
  updated_at: number | null;
}

interface LinhaItem {
  id: number;
  compra_id: number;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  extra: number;
}

interface LinhaCatalogo {
  id: number;
  nome: string;
  categoria: string;
}

/**
 * Decide se o banco aberto ainda está no v1.
 *
 * Um banco recém-criado não tem a tabela `compras`, e `PRAGMA table_info`
 * devolve zero linhas: não há o que migrar, o schema v2 será criado direto.
 */
export async function precisaMigrarParaSync(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const colunas = await db.getAllAsync<{ name: string; type: string }>(
    'PRAGMA table_info(compras)'
  );
  if (colunas.length === 0) return false;
  const id = colunas.find((coluna) => coluna.name === 'id');
  return (id?.type ?? '').toUpperCase().includes('INT');
}

/**
 * Converte o banco inteiro para o schema v2.
 *
 * `criarSchemaV2` é recebido como parâmetro em vez de importado para não
 * criar ciclo de módulos com `db.ts`, que é quem conhece o SQL do schema.
 */
export async function migrarParaSync(
  db: SQLite.SQLiteDatabase,
  criarSchemaV2: (db: SQLite.SQLiteDatabase) => Promise<void>,
  instante: number
): Promise<void> {
  const mercados = await db.getAllAsync<LinhaNomeada>('SELECT id, nome FROM mercados');
  const metodos = await lerMetodosPagamento(db);
  const catalogo = await lerCatalogo(db);
  const compras = await lerCompras(db);
  const itens = await db.getAllAsync<LinhaItem>(
    'SELECT id, compra_id, nome, quantidade, valor_unitario, extra FROM itens_compra'
  );

  // De id antigo para id novo. Sem este mapa as chaves estrangeiras das
  // compras e dos itens ficariam apontando para números que não existem mais.
  const idMercado = new Map<number, string>();
  const idMetodo = new Map<number, string>();
  const idCompra = new Map<number, string>();

  await db.execAsync('BEGIN');
  try {
    await db.execAsync(`
      DROP TABLE IF EXISTS itens_compra;
      DROP TABLE IF EXISTS compras;
      DROP TABLE IF EXISTS mercados;
      DROP TABLE IF EXISTS metodos_pagamento;
      DROP TABLE IF EXISTS catalogo_itens;
    `);
    await criarSchemaV2(db);

    for (const mercado of mercados) {
      const id = novoId();
      idMercado.set(mercado.id, id);
      await db.runAsync(
        'INSERT INTO mercados (id, nome, atualizado_em, excluido_em) VALUES (?, ?, ?, NULL)',
        [id, mercado.nome, instante]
      );
    }

    for (const metodo of metodos) {
      const id = novoId();
      idMetodo.set(metodo.id, id);
      await db.runAsync(
        'INSERT INTO metodos_pagamento (id, nome, atualizado_em, excluido_em) VALUES (?, ?, ?, NULL)',
        [id, metodo.nome, instante]
      );
    }

    for (const item of catalogo) {
      await db.runAsync(
        'INSERT INTO catalogo_itens (id, nome, categoria, atualizado_em, excluido_em) VALUES (?, ?, ?, ?, NULL)',
        [novoId(), item.nome, item.categoria, instante]
      );
    }

    for (const compra of compras) {
      const id = novoId();
      idCompra.set(compra.id, id);
      const mercadoId = idMercado.get(compra.mercado_id);
      // Uma compra sem mercado correspondente não tem como ser gravada: a
      // chave estrangeira é obrigatória. Isso só acontece se o banco já
      // estiver inconsistente, e perder a compra em silêncio seria pior.
      if (!mercadoId) {
        throw new Error(
          `Migração interrompida: a compra ${compra.id} aponta para o mercado ${compra.mercado_id}, que não existe.`
        );
      }
      const metodoId =
        compra.metodo_pagamento_id === null
          ? null
          : (idMetodo.get(compra.metodo_pagamento_id) ?? null);

      await db.runAsync(
        `INSERT INTO compras
           (id, mes, mercado_id, metodo_pagamento_id, total, created_at, updated_at, atualizado_em, excluido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          compra.mes,
          mercadoId,
          metodoId,
          compra.total,
          compra.created_at,
          compra.updated_at,
          // O histórico real de edição é o melhor carimbo disponível. Usar o
          // instante da migração apagaria a ordem das alterações do usuário.
          compra.updated_at ?? compra.created_at
        ]
      );
    }

    for (const item of itens) {
      const compraId = idCompra.get(item.compra_id);
      // Item órfão: a compra dele não existe. No v1 isso era invisível porque
      // a FK só era checada com `foreign_keys = ON`. Descartar é correto, o
      // item sozinho não significa nada, mas tem que ficar registrado.
      if (!compraId) {
        console.warn(
          `Migração: item "${item.nome}" descartado, a compra ${item.compra_id} não existe.`
        );
        continue;
      }
      await db.runAsync(
        `INSERT INTO itens_compra
           (id, compra_id, nome, quantidade, valor_unitario, extra, atualizado_em, excluido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [novoId(), compraId, item.nome, item.quantidade, item.valor_unitario, item.extra, instante]
      );
    }

    await db.execAsync('COMMIT');
  } catch (erro) {
    await db.execAsync('ROLLBACK').catch(() => undefined);
    throw erro;
  }
}

/**
 * Bancos criados antes das formas de pagamento não têm a tabela nem a coluna.
 * Ler defensivamente evita que a migração morra em um banco antigo legítimo.
 */
async function lerMetodosPagamento(db: SQLite.SQLiteDatabase): Promise<LinhaNomeada[]> {
  if (!(await tabelaExiste(db, 'metodos_pagamento'))) return [];
  return db.getAllAsync<LinhaNomeada>('SELECT id, nome FROM metodos_pagamento');
}

async function lerCatalogo(db: SQLite.SQLiteDatabase): Promise<LinhaCatalogo[]> {
  if (!(await tabelaExiste(db, 'catalogo_itens'))) return [];
  const temCategoria = await colunaExiste(db, 'catalogo_itens', 'categoria');
  if (!temCategoria) {
    const linhas = await db.getAllAsync<{ id: number; nome: string }>(
      'SELECT id, nome FROM catalogo_itens'
    );
    return linhas.map((linha) => ({ ...linha, categoria: 'Outros' }));
  }
  return db.getAllAsync<LinhaCatalogo>('SELECT id, nome, categoria FROM catalogo_itens');
}

async function lerCompras(db: SQLite.SQLiteDatabase): Promise<LinhaCompra[]> {
  const temMetodo = await colunaExiste(db, 'compras', 'metodo_pagamento_id');
  if (!temMetodo) {
    const linhas = await db.getAllAsync<Omit<LinhaCompra, 'metodo_pagamento_id'>>(
      'SELECT id, mes, mercado_id, total, created_at, updated_at FROM compras'
    );
    return linhas.map((linha) => ({ ...linha, metodo_pagamento_id: null }));
  }
  return db.getAllAsync<LinhaCompra>(
    `SELECT id, mes, mercado_id, metodo_pagamento_id, total, created_at, updated_at FROM compras`
  );
}

async function tabelaExiste(db: SQLite.SQLiteDatabase, nome: string): Promise<boolean> {
  const linha = await db.getFirstAsync<{ nome: string }>(
    "SELECT name as nome FROM sqlite_master WHERE type = 'table' AND name = ?",
    [nome]
  );
  return linha !== null;
}

async function colunaExiste(
  db: SQLite.SQLiteDatabase,
  tabela: string,
  coluna: string
): Promise<boolean> {
  const colunas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
  return colunas.some((atual) => atual.name === coluna);
}
