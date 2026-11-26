import { ehUuidV7 } from '@/utils/uuid';

import {
  addCatalogoItem,
  getPrecoMedioPorItem,
  listCatalogo,
  removeCatalogoItem
} from './catalogoRepository';
import {
  atualizarCompra,
  criarCompra,
  excluirCompra,
  listComprasComItens,
  listMesesComCompras
} from './comprasRepository';
import { getDb, resetDbInstanceForTests } from './db';
import { listMercadosNomes } from './mercadosRepository';
import {
  getComparativoMercados,
  getGastoPorMes,
  getGastoPorMetodoPagamento
} from './resumoRepository';

// O Babel iça as chamadas `jest.mock` para cima dos imports, então elas
// valem mesmo declaradas aqui embaixo. `expo-sqlite` e `expo-crypto` são
// módulos nativos e não existem no Node; as substituições rodam SQL de
// verdade (node:sqlite) e usam entropia de verdade (node:crypto).
jest.mock('expo-sqlite', () => jest.requireActual('./testing/sqliteNode'));
jest.mock('expo-crypto', () => jest.requireActual('./testing/cryptoNode'));

const COMPRA_BASE = {
  mes: '2026-10',
  mercadoNome: 'Supermercado Pilar',
  metodoPagamentoNome: 'Vale refeição',
  itens: [
    { nome: 'Arroz', quantidade: 1, valorUnitario: 20, extra: false },
    { nome: 'Feijão', quantidade: 2, valorUnitario: 5, extra: false }
  ]
};

beforeEach(() => {
  // Cada teste abre um banco em memória novo; sem isto o singleton de
  // conexão carregaria o estado do teste anterior.
  resetDbInstanceForTests();
});

describe('inicialização do banco', () => {
  it('semeia o catálogo inicial', async () => {
    // Este é o teste que faltava: a semente roda um INSERT que esteve
    // quebrado (`VALUES (??)`) sem ninguém perceber.
    const catalogo = await listCatalogo();
    expect(catalogo.length).toBeGreaterThan(0);
  });

  it('semeia as formas de pagamento', async () => {
    const db = await getDb();
    const linha = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM metodos_pagamento'
    );
    expect(linha?.total).toBeGreaterThan(0);
  });

  it('dá a cada item do catálogo um UUID v7', async () => {
    const catalogo = await listCatalogo();
    expect(catalogo.every((item) => ehUuidV7(item.id))).toBe(true);
  });
});

describe('catálogo', () => {
  it('insere um item novo e recusa o repetido', async () => {
    expect(await addCatalogoItem('Pão de queijo', 'Padaria')).toBe(true);
    expect(await addCatalogoItem('Pão de queijo', 'Padaria')).toBe(false);
  });

  it('trata nome equivalente sem acento como repetido', async () => {
    await addCatalogoItem('Açúcar mascavo');
    expect(await addCatalogoItem('Acucar mascavo')).toBe(false);
  });

  it('exclui de forma lógica, mantendo a linha para o sync', async () => {
    await addCatalogoItem('Rúcula', 'HortiFruti');
    const item = (await listCatalogo()).find((i) => i.nome === 'Rúcula');
    await removeCatalogoItem(item!.id);

    expect((await listCatalogo()).some((i) => i.nome === 'Rúcula')).toBe(false);

    const db = await getDb();
    const linha = await db.getFirstAsync<{ excluido_em: number | null }>(
      'SELECT excluido_em FROM catalogo_itens WHERE id = ?',
      [item!.id]
    );
    expect(linha?.excluido_em).toEqual(expect.any(Number));
  });

  it('libera o nome depois da exclusão, em vez de deixá-lo travado', async () => {
    await addCatalogoItem('Quiabo', 'HortiFruti');
    const item = (await listCatalogo()).find((i) => i.nome === 'Quiabo');
    await removeCatalogoItem(item!.id);
    // Com UNIQUE na coluna o nome ficaria preso ao registro com tombstone.
    expect(await addCatalogoItem('Quiabo', 'HortiFruti')).toBe(true);
  });
});

describe('compras', () => {
  it('grava e relê uma compra com os itens', async () => {
    const id = await criarCompra(COMPRA_BASE);
    expect(ehUuidV7(id)).toBe(true);

    const compras = await listComprasComItens();
    expect(compras).toHaveLength(1);
    expect(compras[0]?.mercadoNome).toBe('Supermercado Pilar');
    expect(compras[0]?.metodoPagamentoNome).toBe('Vale refeição');
    expect(compras[0]?.itens).toHaveLength(2);
    expect(compras[0]?.total).toBeCloseTo(30);
  });

  it('cadastra no catálogo os itens usados na compra', async () => {
    await criarCompra({
      ...COMPRA_BASE,
      itens: [{ nome: 'Bergamota', quantidade: 1, valorUnitario: 7, extra: false }]
    });
    expect((await listCatalogo()).some((i) => i.nome === 'Bergamota')).toBe(true);
  });

  it('substitui a lista de itens ao editar', async () => {
    const id = await criarCompra(COMPRA_BASE);
    await atualizarCompra(id, {
      ...COMPRA_BASE,
      itens: [{ nome: 'Arroz', quantidade: 3, valorUnitario: 20, extra: false }]
    });

    const compras = await listComprasComItens();
    expect(compras[0]?.itens).toHaveLength(1);
    expect(compras[0]?.total).toBeCloseTo(60);
  });

  it('avança atualizado_em ao editar', async () => {
    const id = await criarCompra(COMPRA_BASE);
    const db = await getDb();
    const antes = await db.getFirstAsync<{ atualizado_em: number }>(
      'SELECT atualizado_em FROM compras WHERE id = ?',
      [id]
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    await atualizarCompra(id, { ...COMPRA_BASE, mes: '2026-09' });

    const depois = await db.getFirstAsync<{ atualizado_em: number }>(
      'SELECT atualizado_em FROM compras WHERE id = ?',
      [id]
    );
    expect(depois!.atualizado_em).toBeGreaterThan(antes!.atualizado_em);
  });

  it('exclui de forma lógica, somindo das listagens', async () => {
    const id = await criarCompra(COMPRA_BASE);
    await excluirCompra(id);

    expect(await listComprasComItens()).toHaveLength(0);
    expect(await listMesesComCompras()).toHaveLength(0);

    const db = await getDb();
    const linha = await db.getFirstAsync<{ excluido_em: number | null }>(
      'SELECT excluido_em FROM compras WHERE id = ?',
      [id]
    );
    // A linha continua lá: é o que permite a exclusão viajar no sync.
    expect(linha?.excluido_em).toEqual(expect.any(Number));
  });

  it('tira do resumo o que foi excluído', async () => {
    await criarCompra(COMPRA_BASE);
    const id = await criarCompra({ ...COMPRA_BASE, mercadoNome: 'Supermercado BH' });
    await excluirCompra(id);

    expect(await getGastoPorMes()).toEqual([{ mes: '2026-10', total: 30 }]);
    const comparativo = await getComparativoMercados();
    expect(comparativo.map((c) => c.mercadoNome)).toEqual(['Supermercado Pilar']);
  });

  it('tira do preço médio os itens de compras excluídas', async () => {
    await criarCompra({
      ...COMPRA_BASE,
      itens: [{ nome: 'Café', quantidade: 1, valorUnitario: 10, extra: false }]
    });
    const id = await criarCompra({
      ...COMPRA_BASE,
      itens: [{ nome: 'Café', quantidade: 1, valorUnitario: 30, extra: false }]
    });
    await excluirCompra(id);

    const medias = await getPrecoMedioPorItem();
    expect(medias['Café']?.precoMedio).toBeCloseTo(10);
  });

  it('não oferece no filtro um mercado que ficou sem compras', async () => {
    const id = await criarCompra(COMPRA_BASE);
    await atualizarCompra(id, { ...COMPRA_BASE, mercadoNome: 'Supermercado Pilar II' });

    expect(await listMercadosNomes()).toEqual(['Supermercado Pilar II']);
  });

  it('tira do gasto por forma de pagamento o que foi excluído', async () => {
    await criarCompra(COMPRA_BASE);
    const id = await criarCompra({ ...COMPRA_BASE, metodoPagamentoNome: 'Cartão de crédito' });
    await excluirCompra(id);

    const porMetodo = await getGastoPorMetodoPagamento();
    expect(porMetodo).toEqual([
      { metodoNome: 'Vale refeição', totalGasto: 30, quantidadeCompras: 1 }
    ]);
  });

  it('mantém a compra quando a forma de pagamento não é informada', async () => {
    await criarCompra({ ...COMPRA_BASE, metodoPagamentoNome: null });
    const compras = await listComprasComItens();
    expect(compras[0]?.metodoPagamentoId).toBeNull();
    expect(compras[0]?.metodoPagamentoNome).toBeNull();
  });
});
