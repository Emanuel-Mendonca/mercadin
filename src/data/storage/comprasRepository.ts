import type { CompraComItens, ExportedCompra, ItemCompra, NovaCompraInput } from '@/types';
import { calcularTotal } from '@/utils/totals';

import { ensureCatalogoContem } from './catalogoRepository';
import { getDb } from './db';
import { agora, novoId } from './identidade';
import { getOrCreateMercado, limparMercadosOrfaos } from './mercadosRepository';
import { getOrCreateMetodoPagamento } from './metodosPagamentoRepository';

export { calcularTotal };

/**
 * A compra é a unidade de sincronização, e os itens são parte dela.
 *
 * O formulário de edição devolve a lista de itens inteira, sem identidade
 * própria por linha, então não existe "editar o item 3": o que o usuário faz
 * é substituir a lista. Tentar sincronizar item a item prometeria uma fusão
 * que a interface nunca produz. Por isso os itens são regravados junto com a
 * compra, e só a compra carrega tombstone.
 */

interface CompraRow {
  id: string;
  mes: string;
  mercado_id: string;
  mercado_nome: string;
  metodo_pagamento_id: string | null;
  metodo_pagamento_nome: string | null;
  total: number;
  created_at: number;
  updated_at: number | null;
}

interface ItemRow {
  id: string;
  compra_id: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  extra: number;
}

function mapItemRow(row: ItemRow): ItemCompra {
  return {
    id: row.id,
    compraId: row.compra_id,
    nome: row.nome,
    quantidade: row.quantidade,
    valorUnitario: row.valor_unitario,
    extra: row.extra === 1
  };
}

export interface FiltroCompras {
  mes?: string | null;
  mercadoNome?: string | null;
}

export async function listComprasComItens(filtro: FiltroCompras = {}): Promise<CompraComItens[]> {
  const db = await getDb();

  // A compra excluída continua no banco como tombstone, para a exclusão
  // conseguir viajar até os outros aparelhos. Toda leitura precisa filtrá-la.
  const condicoes: string[] = ['c.excluido_em IS NULL'];
  const params: (string | number)[] = [];

  if (filtro.mes) {
    condicoes.push('c.mes = ?');
    params.push(filtro.mes);
  }
  if (filtro.mercadoNome) {
    condicoes.push('m.nome = ?');
    params.push(filtro.mercadoNome);
  }

  const where = `WHERE ${condicoes.join(' AND ')}`;

  const compraRows = await db.getAllAsync<CompraRow>(
    `SELECT c.id, c.mes, c.mercado_id, m.nome as mercado_nome,
            c.metodo_pagamento_id, mp.nome as metodo_pagamento_nome,
            c.total, c.created_at, c.updated_at
     FROM compras c
     JOIN mercados m ON m.id = c.mercado_id
     LEFT JOIN metodos_pagamento mp ON mp.id = c.metodo_pagamento_id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );

  if (compraRows.length === 0) return [];

  const ids = compraRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const itemRows = await db.getAllAsync<ItemRow>(
    `SELECT id, compra_id, nome, quantidade, valor_unitario, extra
     FROM itens_compra
     WHERE compra_id IN (${placeholders})`,
    ids
  );

  const itensPorCompra = new Map<string, ItemCompra[]>();
  for (const row of itemRows) {
    const item = mapItemRow(row);
    const lista = itensPorCompra.get(item.compraId) ?? [];
    lista.push(item);
    itensPorCompra.set(item.compraId, lista);
  }

  return compraRows.map((row) => ({
    id: row.id,
    mes: row.mes,
    mercadoId: row.mercado_id,
    mercadoNome: row.mercado_nome,
    metodoPagamentoId: row.metodo_pagamento_id,
    metodoPagamentoNome: row.metodo_pagamento_nome,
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itens: itensPorCompra.get(row.id) ?? []
  }));
}

export async function criarCompra(input: NovaCompraInput): Promise<string> {
  const db = await getDb();
  const mercadoId = await getOrCreateMercado(input.mercadoNome);
  const metodoId = input.metodoPagamentoNome
    ? await getOrCreateMetodoPagamento(input.metodoPagamentoNome)
    : null;
  const total = calcularTotal(input.itens);
  const instante = agora();
  const compraId = novoId();

  await db.runAsync(
    `INSERT INTO compras
       (id, mes, mercado_id, metodo_pagamento_id, total, created_at, updated_at, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [compraId, input.mes, mercadoId, metodoId, total, instante, instante]
  );

  await gravarItens(db, compraId, input.itens, instante);

  await ensureCatalogoContem(input.itens.map((i) => i.nome));
  await limparMercadosOrfaos();

  return compraId;
}

export async function atualizarCompra(id: string, input: NovaCompraInput): Promise<void> {
  const db = await getDb();
  const mercadoId = await getOrCreateMercado(input.mercadoNome);
  const metodoId = input.metodoPagamentoNome
    ? await getOrCreateMetodoPagamento(input.metodoPagamentoNome)
    : null;
  const total = calcularTotal(input.itens);
  const instante = agora();

  await db.runAsync(
    `UPDATE compras
        SET mes = ?, mercado_id = ?, metodo_pagamento_id = ?, total = ?,
            updated_at = ?, atualizado_em = ?
      WHERE id = ?`,
    [input.mes, mercadoId, metodoId, total, instante, instante, id]
  );

  await db.runAsync('DELETE FROM itens_compra WHERE compra_id = ?', [id]);
  await gravarItens(db, id, input.itens, instante);

  await ensureCatalogoContem(input.itens.map((i) => i.nome));
  // A correção de um nome deixa o mercado antigo sem compras; sem esta
  // limpeza ele continuaria aparecendo no filtro do Histórico.
  await limparMercadosOrfaos();
}

/**
 * Exclusão lógica. A linha fica, com `excluido_em` preenchido.
 *
 * Um `DELETE` de verdade some sem deixar rastro, e uma linha ausente é
 * indistinguível de uma linha que o outro aparelho ainda não conhece: no
 * próximo sync ela voltaria. Ver docs/projeto/PLATAFORMA.md.
 *
 * Os itens ficam onde estão: eles pertencem à compra, e nenhuma consulta os
 * alcança sem passar por ela.
 */
export async function excluirCompra(id: string): Promise<void> {
  const db = await getDb();
  const instante = agora();
  await db.runAsync('UPDATE compras SET excluido_em = ?, atualizado_em = ? WHERE id = ?', [
    instante,
    instante,
    id
  ]);
  await limparMercadosOrfaos();
}

export async function listMesesComCompras(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ mes: string }>(
    'SELECT DISTINCT mes FROM compras WHERE excluido_em IS NULL ORDER BY mes DESC'
  );
  return rows.map((r) => r.mes);
}

/**
 * Insere uma compra vinda de um backup importado, preservando as datas
 * originais (createdAt/updatedAt) em vez de usar Date.now(). O total é
 * sempre recalculado a partir dos itens, para não confiar em um valor
 * potencialmente adulterado no arquivo.
 */
export async function inserirCompraImportada(compra: ExportedCompra): Promise<void> {
  const db = await getDb();
  const mercadoId = await getOrCreateMercado(compra.mercadoNome);
  const metodoId = compra.metodoPagamentoNome
    ? await getOrCreateMetodoPagamento(compra.metodoPagamentoNome)
    : null;
  const total = compra.itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitario, 0);
  const compraId = novoId();

  await db.runAsync(
    `INSERT INTO compras
       (id, mes, mercado_id, metodo_pagamento_id, total, created_at, updated_at, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      compraId,
      compra.mes,
      mercadoId,
      metodoId,
      total,
      compra.createdAt,
      compra.updatedAt,
      // O carimbo de sincronização acompanha a história real da compra, não
      // o momento da importação: restaurar um backup não é editar tudo.
      compra.updatedAt ?? compra.createdAt
    ]
  );

  await gravarItens(db, compraId, compra.itens, compra.updatedAt ?? compra.createdAt);

  await ensureCatalogoContem(compra.itens.map((i) => i.nome));
}

interface ItemGravavel {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  extra: boolean;
}

async function gravarItens(
  db: Awaited<ReturnType<typeof getDb>>,
  compraId: string,
  itens: readonly ItemGravavel[],
  instante: number
): Promise<void> {
  for (const item of itens) {
    await db.runAsync(
      `INSERT INTO itens_compra
         (id, compra_id, nome, quantidade, valor_unitario, extra, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        novoId(),
        compraId,
        item.nome,
        item.quantidade,
        item.valorUnitario,
        item.extra ? 1 : 0,
        instante
      ]
    );
  }
}
