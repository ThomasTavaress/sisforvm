import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { hashPassword, type Row } from './db.ts';
import { CALCULO_PELO_SITE, EXEMPLOS_AEREO_SUBSTITUIDOS, EXEMPLOS_SUBSTITUIDOS, PESO_INFRAERO, TABELAS_AEREO, TABELAS_FORVM } from './armazenagem-forvm.ts';

export interface SeedOptions {
  adminUser?: string;
  adminPassword?: string;
  demo?: boolean;
  demoPassword?: string;
}

/** Dados iniciais. Só insere o que estiver vazio; seguro rodar a cada inicialização. */
export function seed(db: DatabaseSync, opts: SeedOptions = {}): { adminPasswordGenerated?: string } {
  const out: { adminPasswordGenerated?: string } = {};
  const count = (sql: string) => Number((db.prepare(sql).get() as Row).c);

  if (!count("SELECT COUNT(*) c FROM users WHERE role='admin'")) {
    let pw = opts.adminPassword;
    if (!pw) {
      pw = crypto.randomBytes(9).toString('base64url');
      out.adminPasswordGenerated = pw;
    }
    db.prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, 'Administrador FORVM', 'admin')").run(opts.adminUser || 'admin', hashPassword(pw));
  }

  if (!count('SELECT COUNT(*) c FROM icms_conditions')) {
    const ins = db.prepare(`INSERT INTO icms_conditions
      (code,label,regime_scope,finalidade,ex_tarifario,aliquota_efetiva,divisor,aliquota_credito,incluir_ipi,calc_dif_ipi,user_editable,auto_divisor,validado,sort,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const copy = 'Parâmetros iniciais copiados do Regime Normal — validar.';
    const rows: (string | number | null)[][] = [
      ['NORMAL_REVENDA', 'Regime Normal · Revenda (TTD 410)', 'NORMAL', 'REVENDA', 0, 1.4, 0.96, 4, 0, 1, 0, 0, 1, 10, 'IPI da nacionalização não compõe a base inicial do ICMS.'],
      ['NORMAL_INDUSTRIALIZACAO', 'Regime Normal · Industrialização (TTD 410)', 'NORMAL', 'INDUSTRIALIZACAO', 0, 4, 0.9, 10, 0, 1, 0, 0, 1, 20, 'Cenário vantajoso validado pelo operador.'],
      ['NORMAL_ATIVO', 'Regime Normal · Ativo Imobilizado (TTD 410)', 'NORMAL', 'ATIVO', 0, 1.4, 0.96, 4, 1, 1, 0, 0, 1, 30, 'IPI da nacionalização compõe a base inicial do ICMS.'],
      ['SIMPLES_REVENDA', 'Simples Nacional · Revenda', 'SIMPLES', 'REVENDA', 0, 1.4, 0.96, 4, 0, 1, 0, 0, 0, 40, copy],
      ['SIMPLES_INDUSTRIALIZACAO', 'Simples Nacional · Industrialização', 'SIMPLES', 'INDUSTRIALIZACAO', 0, 4, 0.9, 10, 0, 1, 0, 0, 0, 50, copy],
      ['SIMPLES_ATIVO', 'Simples Nacional · Ativo Imobilizado', 'SIMPLES', 'ATIVO', 0, 1.4, 0.96, 4, 1, 1, 0, 0, 0, 60, copy],
      ['CAMEX_EX', 'Lista CAMEX (com EX-tarifário)', 'TODOS', 'TODAS', 1, 2.5, 0.88, 12, 0, 1, 0, 0, 1, 70, 'Efetiva 2,5% / destaque 12%.'],
      ['CONV_52_91', 'Convênio ICMS 52/91 (máquinas e equipamentos)', 'TODOS', 'TODAS', 0, 8.8, 0.912, 8.8, 0, 1, 0, 0, 0, 80, 'Carga reduzida conforme Convênio 52/91 — parametrizar conforme o caso.'],
      ['SEM_TTD', 'Sem TTD · alíquota efetiva informada', 'TODOS', 'TODAS', 0, 17, 0.83, 17, 0, 1, 1, 1, 1, 90, 'O usuário informa a alíquota efetiva do estado; divisor = 1 − alíquota; mesma composição da base.'],
    ];
    for (const r of rows) ins.run(...r);
  }

  if (!count('SELECT COUNT(*) c FROM storage_tables')) {
    // Terminais ainda sem tabela na planilha da FORVM: exemplos a validar.
    const ins = db.prepare("INSERT INTO storage_tables (name,modal,location,linhas,acrescimo_pct,validado,notes) VALUES (?,?,?,?,0,0,?)");
    const ex = 'Valores de EXEMPLO — substituir pela tabela vigente do terminal.';
    const linhas = (pct: number, min: number, dias: number, fixas: number) =>
      JSON.stringify([
        { id: 'periodo1', descricao: `1º período (${dias} dias)`, tipo: 'pct_cif', pct, minimo: min, aplica: 'primeiro' },
        { id: 'taxas', descricao: 'Taxas fixas', tipo: 'fixo', valor: fixas },
      ]);
    ins.run('GRU Airport', 'AEREO', 'Guarulhos/SP', linhas(0.5, 250, 5, 180), ex);
    ins.run('Ponta Negra', 'AEREO', 'Navegantes/SC', linhas(0.4, 200, 5, 150), ex);
    ins.run('AMA Itajaí', 'LCL', 'Itajaí/SC', linhas(0.3, 420, 7, 320), ex);
  }
  importarArmazenagemFORVM(db);
  importarArmazenagemAereo(db);
  atualizarPesoInfraero(db);
  removerTaxa50kgInfraero(db);

  if (opts.demo && !count('SELECT COUNT(*) c FROM clients')) {
    const r = db.prepare(`INSERT INTO clients (company_name,tax_regime,city,state,cnpj,sigla,despacho_brl,honorarios_pct,honorarios_min,notes)
      VALUES ('Fast Importadora Ltda (DEMO)','LUCRO_REAL','Joinville','SC','00.000.000/0001-00','FAS',950,1,950,'Cliente de demonstração: honorários 1% da base do ICMS, mínimo R$ 950; despacho R$ 950')`).run();
    const cid = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO users (username,password_hash,name,role,client_id) VALUES ('fast',?,'Usuário Fast','cliente',?)").run(hashPassword(opts.demoPassword || 'fast2026demo'), cid);
    const fp = db.prepare(`INSERT INTO freight_profiles (client_id,label,modal,origin_country,origin_detail,dest_detail,incoterm,currency,rate,min_charge,origin_fees,dest_fees_brl,transit_days)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    fp.run(cid, 'China Aéreo FOB', 'AEREO', 'China', 'Aeroporto de Shenzhen', 'Aeroporto de Navegantes', 'FOB', 'USD', 6.5, 150, 0, 1800, '5-8');
    fp.run(cid, 'China Aéreo EXW', 'AEREO', 'China', 'Aeroporto de Shenzhen', 'Aeroporto de Navegantes', 'EXW', 'USD', 6.5, 150, 280, 1800, '7-10');
    fp.run(cid, 'China LCL FOB', 'LCL', 'China', 'Porto de Shenzhen', 'Porto de Navegantes', 'FOB', 'USD', 45, 90, 0, 2600, '40-45');
    fp.run(cid, "China FCL 20' FOB", 'FCL20', 'China', 'Porto de Ningbo', 'Porto de Itapoá', 'FOB', 'USD', 2200, 0, 0, 3800, '35-40');
    fp.run(cid, "China FCL 40' FOB", 'FCL40', 'China', 'Porto de Ningbo', 'Porto de Itapoá', 'FOB', 'USD', 3100, 0, 0, 4200, '35-40');
    fp.run(cid, 'Europa Aéreo FCA', 'AEREO', 'Itália', 'Aeroporto de Milão', 'Aeroporto de Guarulhos', 'FCA', 'EUR', 3.8, 120, 90, 1600, '3-5');
    fp.run(cid, 'Europa LCL EXW', 'LCL', 'Itália', 'Porto de Gênova', 'Porto de Navegantes', 'EXW', 'EUR', 70, 120, 150, 2400, '25-30');
    const pr = db.prepare("INSERT INTO products (client_id,code,description,ncm,ii,ii_ex,ipi,pis,cofins,confirmed,created_by_role) VALUES (?,?,?,?,?,?,?,?,?,1,'admin')");
    pr.run(cid, 'MOT-01', 'Motor elétrico trifásico 5 cv', '8501.52.10', 14, 0, 5.2, 2.1, 9.65);
    pr.run(cid, 'ROL-02', 'Rolamento de esferas', '8482.10.10', 12.6, null, 7.8, 2.1, 9.65);
    pr.run(cid, 'CNC-03', 'Centro de usinagem CNC', '8457.10.00', 11.2, 0, 0, 2.1, 9.65);
  }
  return out;
}

/**
 * Importa (uma única vez) as tabelas da planilha "ARMAZENAGEM & AFRMM - ATUALIZADO" e
 * desativa os exemplos antigos que elas substituem. Estudos salvos não mudam (guardam snapshot).
 */
export function importarArmazenagemFORVM(db: DatabaseSync) {
  const FLAG = 'importacao_armazenagem_planilha_2026_11';
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(FLAG)) return;
  const ins = db.prepare('INSERT INTO storage_tables (name,modal,location,linhas,acrescimo_pct,validado,notes,active) VALUES (?,?,?,?,?,1,?,1)');
  const existe = db.prepare('SELECT 1 FROM storage_tables WHERE name = ?');
  for (const t of TABELAS_FORVM) {
    if (existe.get(t.name)) continue;
    ins.run(t.name, t.modal, t.location, JSON.stringify(t.linhas), t.acrescimo_pct, t.notes);
  }
  const desativa = db.prepare('UPDATE storage_tables SET active = 0 WHERE name = ? AND validado = 0');
  for (const n of EXEMPLOS_SUBSTITUIDOS) desativa.run(n);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(FLAG, JSON.stringify(new Date().toISOString()));
}

/** 2ª importação (uma vez): tabelas aeroportuárias GRU e Infraero; marca os terminais calculados pelo site do porto. */
export function importarArmazenagemAereo(db: DatabaseSync) {
  const FLAG = 'importacao_armazenagem_aereo_2026_11';
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(FLAG)) return;
  const ins = db.prepare('INSERT INTO storage_tables (name,modal,location,linhas,acrescimo_pct,validado,notes,active) VALUES (?,?,?,?,?,1,?,1)');
  const existe = db.prepare('SELECT 1 FROM storage_tables WHERE name = ?');
  for (const t of TABELAS_AEREO) {
    if (existe.get(t.name)) continue;
    ins.run(t.name, t.modal, t.location, JSON.stringify(t.linhas), t.acrescimo_pct, t.notes);
  }
  const desativa = db.prepare('UPDATE storage_tables SET active = 0 WHERE name = ? AND validado = 0');
  for (const n of EXEMPLOS_AEREO_SUBSTITUIDOS) desativa.run(n);
  const nota = db.prepare("UPDATE storage_tables SET notes = trim(coalesce(notes, '') || ' Valor oficial calculado pela FORVM no site do porto; esta tabela é estimativa.') WHERE name = ?");
  for (const n of CALCULO_PELO_SITE) nota.run(n);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(FLAG, JSON.stringify(new Date().toISOString()));
}

/** 3ª atualização (uma vez): taxa de peso da Infraero pela tabela de faixas × 2 (enviada em 13/11/2026). */
export function atualizarPesoInfraero(db: DatabaseSync) {
  const FLAG = 'atualizacao_peso_infraero_2026_11';
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(FLAG)) return;
  const rows = db.prepare("SELECT id, linhas, notes FROM storage_tables WHERE name LIKE 'Infraero%'").all() as { id: number; linhas: string; notes: string | null }[];
  const nota = TABELAS_AEREO.find((x) => x.name.startsWith('Infraero'))?.notes ?? null;
  for (const r of rows) {
    const linhas = JSON.parse(r.linhas) as { id: string }[];
    const novas = linhas.some((l) => l.id === 'peso') ? linhas.map((l) => (l.id === 'peso' ? PESO_INFRAERO : l)) : [...linhas, PESO_INFRAERO];
    db.prepare('UPDATE storage_tables SET linhas = ?, notes = ? WHERE id = ?').run(JSON.stringify(novas), nota, r.id);
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(FLAG, JSON.stringify(new Date().toISOString()));
}

/** 4ª atualização (uma vez): a FORVM confirmou que a taxa fixa de R$ 300 acima de 50 kg não soma com a faixa de peso. */
export function removerTaxa50kgInfraero(db: DatabaseSync) {
  const FLAG = 'remocao_taxa_50kg_infraero_2026_11';
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(FLAG)) return;
  const rows = db.prepare("SELECT id, linhas FROM storage_tables WHERE name LIKE 'Infraero%'").all() as { id: number; linhas: string }[];
  for (const r of rows) {
    const linhas = (JSON.parse(r.linhas) as { id: string }[]).filter((l) => l.id !== 'taxa_50kg');
    db.prepare('UPDATE storage_tables SET linhas = ? WHERE id = ?').run(JSON.stringify(linhas), r.id);
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(FLAG, JSON.stringify(new Date().toISOString()));
}
