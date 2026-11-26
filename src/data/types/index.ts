/**
 * Tipos de domínio
 * -----------------------------------------------------------------------
 * Modelo normalizado (mercados / compras / itens_compra / catalogo_itens),
 * pensado para consultas SQL de agregação (SUM, AVG, GROUP BY) usadas nas
 * telas de Resumo e Histórico.
 *
 * Os identificadores são `string`, não `number`: são UUID v7 gerados no
 * aparelho, porque `AUTOINCREMENT` faz dois celulares offline criarem o
 * mesmo id para compras diferentes. Ver docs/projeto/PLATAFORMA.md.
 */

export interface Mercado {
  id: string;
  nome: string;
}

export interface MetodoPagamento {
  id: string;
  nome: string;
}

export interface CatalogoItem {
  id: string;
  nome: string;
  categoria: string;
}

export interface PrecoMedioItem {
  nome: string;
  precoMedio: number;
  quantidadeCompras: number;
}

export interface ItemCompra {
  id: string;
  compraId: string;
  nome: string;
  quantidade: number;
  valorUnitario: number;
  extra: boolean;
}

/** Payload usado ao criar/editar um item, antes de existir no banco. */
export type NovoItemCompra = Omit<ItemCompra, 'id' | 'compraId'>;

export interface Compra {
  id: string;
  mes: string; // formato "YYYY-MM"
  mercadoId: string;
  total: number;
  /** Nulo em compras registradas antes de existir forma de pagamento. */
  metodoPagamentoId: string | null;
  createdAt: number;
  updatedAt: number | null;
}

/** Compra "achatada" para exibição em tela, já com nome do mercado e itens. */
export interface CompraComItens extends Compra {
  mercadoNome: string;
  metodoPagamentoNome: string | null;
  itens: ItemCompra[];
}

/** Payload usado pelo formulário de Nova Compra / Edição. */
export interface NovaCompraInput {
  mes: string;
  mercadoNome: string;
  metodoPagamentoNome: string | null;
  itens: NovoItemCompra[];
}

export interface GastoPorMes {
  mes: string;
  total: number;
}

export interface GastoPorMetodoPagamento {
  /** Nome da forma de pagamento, ou `null` para compras sem forma informada. */
  metodoNome: string | null;
  totalGasto: number;
  quantidadeCompras: number;
}

export interface ComparativoMercado {
  mercadoId: string;
  mercadoNome: string;
  totalGasto: number;
  quantidadeCompras: number;
  mediaPorCompra: number;
}

/**
 * Preferência de tema. `sistema` acompanha o aparelho; as outras duas
 * forçam o modo independentemente do sistema.
 */
export type PreferenciaTema = 'claro' | 'escuro' | 'sistema';

/** Formato de arquivo usado pela exportação/importação de backup (JSON). */
export interface ExportedItem {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  extra: boolean;
}

export interface ExportedCompra {
  mes: string;
  mercadoNome: string;
  metodoPagamentoNome?: string | null;
  createdAt: number;
  updatedAt: number | null;
  itens: ExportedItem[];
}

export interface ExportPayload {
  versao: 1;
  exportadoEm: number;
  catalogo: string[];
  compras: ExportedCompra[];
}
