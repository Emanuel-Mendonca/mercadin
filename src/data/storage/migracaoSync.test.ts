import type * as SQLite from 'expo-sqlite';

import { ehUuidV7 } from '@/utils/uuid';

import { inicializarSchema } from './db';
import { precisaMigrarParaSync } from './migracaoSync';
import { criarBancoEmMemoria } from './testing/sqliteNode';

// O Babel iça as chamadas `jest.mock` para cima dos imports, então elas
// valem mesmo declaradas aqui embaixo. `expo-sqlite` e `expo-crypto` são
// módulos nativos e não existem no Node; as substituições rodam SQL de
// verdade (node:sqlite) e usam entropia de verdade (node:crypto).
jest.mock('expo-sqlite', () => jest.requireActual('./testing/sqliteNode'));
jest.mock('expo-crypto', () => jest.requireActual('./testing/cryptoNode'));

/**
 * Schema v1, com ids inteiros. Reproduzido aqui de propósito, e não
 * importado de `db.ts`: o arquivo de produção já não o conhece, e é
 * exatamente esse estado antigo que a migração precisa saber ler.
 */
const SCHEMA_V1 = `
CREATE TABLE mercados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);
CREATE TABLE metodos_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);
CREATE TABLE catalogo_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL DEFAULT 'Mercearia'
);
CREATE TABLE compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes TEXT NOT NULL,
  mercado_id INTEGER NOT NULL REFERENCES mercados(id),
  total REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  metodo_pagamento_id INTEGER REFERENCES metodos_pagamento(id)
);
CREATE TABLE itens_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 0,
  valor_unitario REAL NOT NULL DEFAULT 0,
  extra INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE preferencias (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

type Banco = ReturnType<typeof criarBancoEmMemoria>;

async function bancoV1(): Promise<Banco> {
  const db = criarBancoEmMemoria();
  // Desligado para conseguir montar também os cenários inconsistentes que a
  // migração precisa saber tratar.
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await db.execAsync(SCHEMA_V1);
  return db;
}

async function popular(db: Banco): Promise<void> {
  await db.execAsync(`
    INSERT INTO mercados (id, nome) VALUES (1, 'Supermercado Pilar'), (2, 'Alvorada');
    INSERT INTO metodos_pagamento (id, nome) VALUES (1, 'Vale refeição');
    INSERT INTO catalogo_itens (id, nome, categoria) VALUES (1, 'Arroz', 'Mercearia');
    INSERT INTO compras (id, mes, mercado_id, total, created_at, updated_at, metodo_pagamento_id)
      VALUES (1, '2026-10', 1, 30, 1000, 2000, 1),
             (2, '2026-09', 2, 15, 900, NULL, NULL);
    INSERT INTO itens_compra (id, compra_id, nome, quantidade, valor_unitario, extra)
      VALUES (1, 1, 'Arroz', 1, 20, 0),
             (2, 1, 'Feijão', 2, 5, 0),
             (3, 2, 'Pão', 1, 15, 0);
  `);
}

/** `inicializarSchema` espera o tipo do módulo nativo. */
function comoSQLite(db: Banco): SQLite.SQLiteDatabase {
  return db as unknown as SQLite.SQLiteDatabase;
}

describe('precisaMigrarParaSync', () => {
  it('reconhece um banco v1 pelo tipo da chave primária', async () => {
    const db = await bancoV1();
    expect(await precisaMigrarParaSync(comoSQLite(db))).toBe(true);
  });

  it('não acusa migração pendente em um banco vazio', async () => {
    const db = criarBancoEmMemoria();
    expect(await precisaMigrarParaSync(comoSQLite(db))).toBe(false);
  });

  it('não acusa migração pendente depois de já ter migrado', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));
    expect(await precisaMigrarParaSync(comoSQLite(db))).toBe(false);
  });
});

describe('migração do v1 para o v2', () => {
  it('preserva as compras, com mercado e forma de pagamento corretos', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));

    const compras = await db.getAllAsync<{
      id: string;
      mes: string;
      total: number;
      mercado_nome: string;
      metodo_nome: string | null;
    }>(
      `SELECT c.id, c.mes, c.total, m.nome as mercado_nome, mp.nome as metodo_nome
         FROM compras c
         JOIN mercados m ON m.id = c.mercado_id
         LEFT JOIN metodos_pagamento mp ON mp.id = c.metodo_pagamento_id
        ORDER BY c.mes`
    );

    expect(compras).toHaveLength(2);
    expect(compras[0]).toMatchObject({
      mes: '2026-09',
      total: 15,
      mercado_nome: 'Alvorada',
      metodo_nome: null
    });
    expect(compras[1]).toMatchObject({
      mes: '2026-10',
      total: 30,
      mercado_nome: 'Supermercado Pilar',
      metodo_nome: 'Vale refeição'
    });
  });

  it('troca todo id inteiro por UUID v7', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));

    for (const tabela of ['mercados', 'compras', 'itens_compra', 'catalogo_itens']) {
      const linhas = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${tabela}`);
      expect(linhas.length).toBeGreaterThan(0);
      expect(linhas.every((linha) => ehUuidV7(linha.id))).toBe(true);
    }
  });

  it('mantém os itens ligados à compra certa', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));

    const itens = await db.getAllAsync<{ nome: string; mes: string }>(
      `SELECT i.nome, c.mes
         FROM itens_compra i
         JOIN compras c ON c.id = i.compra_id
        ORDER BY i.nome`
    );
    expect(itens).toEqual([
      { nome: 'Arroz', mes: '2026-10' },
      { nome: 'Feijão', mes: '2026-10' },
      { nome: 'Pão', mes: '2026-09' }
    ]);
  });

  it('usa a última edição como carimbo de sincronização, não o momento da migração', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));

    const linhas = await db.getAllAsync<{ mes: string; atualizado_em: number }>(
      'SELECT mes, atualizado_em FROM compras ORDER BY mes'
    );
    // A compra de setembro nunca foi editada: vale o created_at.
    expect(linhas[0]).toEqual({ mes: '2026-09', atualizado_em: 900 });
    // A de outubro foi editada: vale o updated_at.
    expect(linhas[1]).toEqual({ mes: '2026-10', atualizado_em: 2000 });
  });

  it('preserva o catálogo que já existia, sem resemear por cima', async () => {
    const db = await bancoV1();
    await popular(db);
    await inicializarSchema(comoSQLite(db));

    const catalogo = await db.getAllAsync<{ nome: string }>('SELECT nome FROM catalogo_itens');
    expect(catalogo).toEqual([{ nome: 'Arroz' }]);
  });

  it('descarta item órfão e registra o descarte', async () => {
    const db = await bancoV1();
    await popular(db);
    await db.execAsync(
      "INSERT INTO itens_compra (id, compra_id, nome, quantidade, valor_unitario, extra) VALUES (99, 404, 'Órfão', 1, 1, 0)"
    );
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await inicializarSchema(comoSQLite(db));

    const orfaos = await db.getAllAsync("SELECT id FROM itens_compra WHERE nome = 'Órfão'");
    expect(orfaos).toHaveLength(0);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('Órfão'));
    aviso.mockRestore();
  });

  it('aborta sem destruir nada quando uma compra aponta para mercado inexistente', async () => {
    const db = await bancoV1();
    await popular(db);
    await db.execAsync(
      "INSERT INTO compras (id, mes, mercado_id, total, created_at) VALUES (9, '2026-08', 404, 50, 800)"
    );

    await expect(inicializarSchema(comoSQLite(db))).rejects.toThrow(/mercado 404/);

    // O banco tem que continuar no v1, inteiro. Uma migração que destrói
    // metade dos dados e para no meio é pior que uma que não roda.
    expect(await precisaMigrarParaSync(comoSQLite(db))).toBe(true);
    const compras = await db.getAllAsync('SELECT id FROM compras');
    expect(compras).toHaveLength(3);
    const itens = await db.getAllAsync('SELECT id FROM itens_compra');
    expect(itens).toHaveLength(3);
  });

  it('migra um banco anterior às formas de pagamento', async () => {
    const db = criarBancoEmMemoria();
    await db.execAsync('PRAGMA foreign_keys = OFF');
    await db.execAsync(`
      CREATE TABLE mercados (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE);
      CREATE TABLE compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes TEXT NOT NULL,
        mercado_id INTEGER NOT NULL REFERENCES mercados(id),
        total REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );
      CREATE TABLE itens_compra (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        quantidade REAL NOT NULL DEFAULT 0,
        valor_unitario REAL NOT NULL DEFAULT 0,
        extra INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO mercados (id, nome) VALUES (1, 'Mercado Antigo');
      INSERT INTO compras (id, mes, mercado_id, total, created_at) VALUES (1, '2025-01', 1, 10, 500);
      INSERT INTO itens_compra (id, compra_id, nome, quantidade, valor_unitario, extra)
        VALUES (1, 1, 'Leite', 2, 5, 0);
    `);

    await inicializarSchema(comoSQLite(db));

    const compras = await db.getAllAsync<{ id: string; metodo_pagamento_id: string | null }>(
      'SELECT id, metodo_pagamento_id FROM compras'
    );
    expect(compras).toHaveLength(1);
    // Inventar uma forma de pagamento aqui seria fabricar dado que o usuário
    // nunca informou.
    expect(compras[0]?.metodo_pagamento_id).toBeNull();
    expect(ehUuidV7(compras[0]!.id)).toBe(true);
  });
});
