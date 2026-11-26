import { ehUuidV7, instanteDoUuidV7, montarUuidV7 } from './uuid';

const DEZ_BYTES = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const ZEROS = new Uint8Array(10);

describe('montarUuidV7', () => {
  it('produz o formato canônico de 36 caracteres', () => {
    const uuid = montarUuidV7(1_700_000_000_000, ZEROS);
    expect(uuid).toHaveLength(36);
    expect(uuid.split('-').map((p) => p.length)).toEqual([8, 4, 4, 4, 12]);
  });

  it('marca versão 7 e variante RFC mesmo com bytes todos ligados', () => {
    // Com 0xff em tudo, os bits de versão e variante só podem vir da máscara.
    expect(ehUuidV7(montarUuidV7(1_700_000_000_000, DEZ_BYTES))).toBe(true);
  });

  it('marca versão 7 e variante RFC mesmo com bytes todos zerados', () => {
    expect(ehUuidV7(montarUuidV7(1_700_000_000_000, ZEROS))).toBe(true);
  });

  it('embute o horário nos 48 bits iniciais', () => {
    const agora = 1_793_000_000_000;
    expect(instanteDoUuidV7(montarUuidV7(agora, ZEROS))).toBe(agora);
  });

  it('gera ids que ordenam como as datas que os originaram', () => {
    const antes = montarUuidV7(1_700_000_000_000, DEZ_BYTES);
    const depois = montarUuidV7(1_700_000_000_001, ZEROS);
    // Mesmo com a parte aleatória do primeiro toda ligada e a do segundo
    // zerada, o horário domina a comparação.
    expect(antes < depois).toBe(true);
  });

  it('ids do mesmo milissegundo diferem pela parte aleatória', () => {
    const a = montarUuidV7(1_700_000_000_000, ZEROS);
    const b = montarUuidV7(1_700_000_000_000, DEZ_BYTES);
    expect(a).not.toBe(b);
  });

  it('recusa entropia insuficiente em vez de completar com zeros', () => {
    expect(() => montarUuidV7(1_700_000_000_000, new Uint8Array(9))).toThrow(/pelo menos 10 bytes/);
  });
});

describe('ehUuidV7', () => {
  it('recusa um UUID v4', () => {
    expect(ehUuidV7('9f1a2b3c-4d5e-4f60-8123-456789abcdef')).toBe(false);
  });

  it('recusa variante inválida', () => {
    expect(ehUuidV7('9f1a2b3c-4d5e-7f60-0123-456789abcdef')).toBe(false);
  });

  it('recusa um id numérico do schema antigo', () => {
    expect(ehUuidV7('1')).toBe(false);
  });
});
