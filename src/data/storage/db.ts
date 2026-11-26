import * as SQLite from 'expo-sqlite';

import {
  CATALOGO_INICIAL,
  CATEGORIA_PADRAO,
  DATABASE_NAME,
  METODOS_PAGAMENTO_INICIAIS
} from '@/constants';

import { agora, novoId } from './identidade';
import { migrarParaSync, precisaMigrarParaSync } from './migracaoSync';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Abertura em andamento. A store dispara várias consultas em paralelo
 * (`Promise.all` em `refreshTudo`) e todas chamam `getDb()` ao mesmo tempo.
 * Sem compartilhar a mesma promessa, cada uma roda o schema e as migrações
 * por conta própria, e duas que passem juntas pelo `PRAGMA table_info`
 * tentam o mesmo `ALTER TABLE`, derrubando a inicialização do banco com
 * "duplicate column name".
 */
let aberturaEmCurso: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Schema v2, preparado para sincronização.
 *
 * Toda tabela sincronizável carrega `atualizado_em` e `excluido_em`. A
 * justificativa está em docs/projeto/PLATAFORMA.md; em resumo:
 * `atualizado_em` decide quem vence um conflito, e `excluido_em` faz a
 * exclusão viajar até o outro aparelho, em vez de a linha simplesmente sumir
 * e ser recriada no próximo sync.
 *
 * `preferencias` fica de fora: é configuração do aparelho (o tema, por
 * exemplo), não dado do usuário, e não faz sentido propagar.
 *
 * A unicidade de nome virou índice parcial, com `WHERE excluido_em IS NULL`.
 * Com o UNIQUE na coluna, um mercado apagado continuaria ocupando o nome e
 * impediria o usuário de cadastrá-lo de novo.
 */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mercados (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  excluido_em INTEGER
);

CREATE TABLE IF NOT EXISTS metodos_pagamento (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  excluido_em INTEGER
);

CREATE TABLE IF NOT EXISTS catalogo_itens (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT '${CATEGORIA_PADRAO}',
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  excluido_em INTEGER
);

CREATE TABLE IF NOT EXISTS compras (
  id TEXT PRIMARY KEY,
  mes TEXT NOT NULL,
  mercado_id TEXT NOT NULL REFERENCES mercados(id),
  metodo_pagamento_id TEXT REFERENCES metodos_pagamento(id),
  total REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  excluido_em INTEGER
);

CREATE TABLE IF NOT EXISTS itens_compra (
  id TEXT PRIMARY KEY,
  compra_id TEXT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 0,
  valor_unitario REAL NOT NULL DEFAULT 0,
  extra INTEGER NOT NULL DEFAULT 0,
  atualizado_em INTEGER NOT NULL DEFAULT 0,
  excluido_em INTEGER
);

CREATE TABLE IF NOT EXISTS preferencias (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mercados_nome
  ON mercados(nome) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_metodos_nome
  ON metodos_pagamento(nome) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_nome
  ON catalogo_itens(nome) WHERE excluido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_compras_mes ON compras(mes);
CREATE INDEX IF NOT EXISTS idx_compras_mercado ON compras(mercado_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra ON itens_compra(compra_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra_nome ON itens_compra(nome);

CREATE INDEX IF NOT EXISTS idx_compras_atualizado ON compras(atualizado_em);
CREATE INDEX IF NOT EXISTS idx_itens_atualizado ON itens_compra(atualizado_em);
`;

async function criarSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
}

/**
 * O catálogo começou com 6 categorias genéricas e passou a usar os
 * departamentos reais de supermercado. Itens gravados antes dessa mudança
 * ficariam apontando para um departamento que não existe mais (e sumiriam do
 * filtro), então reescrevemos os nomes antigos para os novos.
 *
 * Idempotente: depois da primeira execução nenhuma linha casa mais com os
 * nomes antigos, e o UPDATE não afeta nada.
 */
async function migrarCategoriasAntigas(db: SQLite.SQLiteDatabase): Promise<void> {
  const renomeacoes: readonly [string, string][] = [
    ['Laticínios', 'Frios e Laticínios'],
    ['Outros', CATEGORIA_PADRAO]
  ];

  for (const [antiga, nova] of renomeacoes) {
    await db.runAsync('UPDATE catalogo_itens SET categoria = ? WHERE categoria = ?', [
      nova,
      antiga
    ]);
  }
}

/**
 * Semeia as formas de pagamento padrão apenas uma vez. Se o usuário apagar
 * todas de propósito, não queremos ressuscitá-las a cada abertura, por isso
 * a checagem é feita sobre a existência de qualquer linha, e não item a item.
 */
async function seedMetodosPagamento(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM metodos_pagamento'
  );
  if (row && row.total > 0) return;

  const instante = agora();
  for (const nome of METODOS_PAGAMENTO_INICIAIS) {
    await db.runAsync(
      'INSERT OR IGNORE INTO metodos_pagamento (id, nome, atualizado_em) VALUES (?, ?, ?)',
      [novoId(), nome, instante]
    );
  }
}

async function seedCatalogoInicial(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM catalogo_itens'
  );
  if (row && row.total > 0) return;

  const instante = agora();
  for (const { nome, categoria } of CATALOGO_INICIAL) {
    await db.runAsync(
      'INSERT OR IGNORE INTO catalogo_itens (id, nome, categoria, atualizado_em) VALUES (?, ?, ?, ?)',
      [novoId(), nome, categoria, instante]
    );
  }
}

/**
 * Confere se a conexão guardada ainda está viva.
 *
 * O objeto nativo do SQLite pode ser destruído por baixo do JS, quando o app
 * fica um tempo em background e o Android recupera memória, por exemplo. O
 * singleton continua apontando para um handle morto, e a próxima escrita
 * falha com `NativeDatabase.prepareAsync has been rejected` /
 * `NullPointerException`. Uma consulta trivial detecta isso antes que uma
 * gravação real do usuário se perca.
 */
async function conexaoViva(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    await db.getFirstAsync('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre (ou cria) o banco e garante que o schema e os dados iniciais
 * existam. Chamado no início do app (ver app/_layout.tsx) e, depois disso,
 * por cada repositório antes de qualquer operação, se a conexão em cache
 * tiver morrido, reabre de forma transparente.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  let reabrindo = false;

  if (dbInstance) {
    if (await conexaoViva(dbInstance)) return dbInstance;
    console.warn('Conexão com o SQLite perdida, reabrindo o banco.');
    // Tira o handle morto do cache nativo. Pode falhar (o objeto já está
    // inválido), é esperado, e não impede a reabertura.
    await dbInstance.closeAsync().catch(() => undefined);
    dbInstance = null;
    reabrindo = true;
  }

  // Quem chegar enquanto a abertura roda espera a mesma promessa, em vez de
  // iniciar uma segunda inicialização concorrente.
  if (aberturaEmCurso) return aberturaEmCurso;

  aberturaEmCurso = abrirEInicializar(reabrindo).finally(() => {
    aberturaEmCurso = null;
  });
  return aberturaEmCurso;
}

async function abrirEInicializar(reabrindo: boolean): Promise<SQLite.SQLiteDatabase> {
  // O módulo nativo mantém um cache por caminho de arquivo e, sem
  // `useNewConnection`, `openDatabaseAsync` devolve o MESMO objeto que já
  // estava lá, inclusive quando ele está morto. Ao reabrir, forçamos uma
  // conexão realmente nova; na primeira abertura o cache está vazio e o
  // comportamento padrão basta.
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: reabrindo });

  await inicializarSchema(db);

  dbInstance = db;
  return db;
}

/**
 * Leva um banco recém-aberto ao estado atual: migra do v1 se for o caso,
 * cria o schema e semeia os dados iniciais.
 *
 * Exportada porque os testes abrem bancos em memória e precisam exatamente
 * deste caminho, sem passar pelo singleton de conexão.
 */
export async function inicializarSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  if (await precisaMigrarParaSync(db)) {
    // `PRAGMA foreign_keys` é ignorado dentro de uma transação, e a migração
    // abre a sua. Por isso o desligamento acontece aqui fora: sem ele, o
    // DROP das tabelas antigas esbarra nas referências entre elas.
    await db.execAsync('PRAGMA foreign_keys = OFF');
    try {
      await migrarParaSync(db, criarSchema, agora());
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON');
    }
  }

  await criarSchema(db);
  await migrarCategoriasAntigas(db);
  await seedCatalogoInicial(db);
  await seedMetodosPagamento(db);
}

/** Usado só em testes, para forçar reabertura do banco entre casos. */
export function resetDbInstanceForTests(): void {
  dbInstance = null;
}
