import { DatabaseSync } from 'node:sqlite';

/**
 * Implementação de `expo-sqlite` para os testes
 * -----------------------------------------------------------------------
 * O módulo real é nativo e não existe no Node, então os repositórios nunca
 * tiveram teste. O preço disso apareceu: um `INSERT ... VALUES (??)` ficou
 * no código sem ser notado, porque SQL é string e nem o `tsc` nem o ESLint
 * olham para dentro dela.
 *
 * Aqui o SQL roda de verdade, contra o SQLite embutido no Node, em um banco
 * em memória. Erro de sintaxe, coluna inexistente e violação de chave
 * estrangeira passam a quebrar o teste, que é onde devem quebrar.
 *
 * Não é um simulacro do comportamento: é o mesmo motor, com a mesma gramática.
 * O que muda é só a forma de chamar, síncrona aqui, assíncrona no aparelho.
 */

type Parametro = string | number | null;

function adaptar(db: DatabaseSync) {
  return {
    async execAsync(sql: string): Promise<void> {
      db.exec(sql);
    },

    async getAllAsync<T>(sql: string, params: Parametro[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },

    async getFirstAsync<T>(sql: string, params: Parametro[] = []): Promise<T | null> {
      // `expo-sqlite` devolve `null` quando não há linha; `node:sqlite`
      // devolve `undefined`. A diferença importa: o código checa `if (linha)`
      // em uns lugares e `!== null` em outros.
      const linha = db.prepare(sql).get(...params);
      return (linha as T | undefined) ?? null;
    },

    async runAsync(
      sql: string,
      params: Parametro[] = []
    ): Promise<{ changes: number; lastInsertRowId: number }> {
      const resultado = db.prepare(sql).run(...params);
      return {
        changes: Number(resultado.changes),
        lastInsertRowId: Number(resultado.lastInsertRowid)
      };
    },

    async closeAsync(): Promise<void> {
      db.close();
    }
  };
}

export type BancoDeTeste = ReturnType<typeof adaptar>;

/** Banco novo e vazio, isolado por teste. */
export function criarBancoEmMemoria(): BancoDeTeste {
  return adaptar(new DatabaseSync(':memory:'));
}

/** Assinatura usada por `db.ts`. Cada abertura devolve um banco limpo. */
export async function openDatabaseAsync(): Promise<BancoDeTeste> {
  return criarBancoEmMemoria();
}
