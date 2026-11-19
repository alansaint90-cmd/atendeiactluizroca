#!/usr/bin/env node
// @ts-check
/**
 * check-compliance.mjs — Auditor de conformidade da Estrutura Base.
 *
 * Uso:
 *   node scripts/check-compliance.mjs                # escaneia src/ (ou cwd)
 *   node scripts/check-compliance.mjs --file <path>  # escaneia um arquivo
 *   node scripts/check-compliance.mjs --json         # saida JSON (CI/IA)
 *   node scripts/check-compliance.mjs --quiet        # so erros (esconde avisos)
 *   node scripts/check-compliance.mjs --help
 *
 * Exit code: 1 se houver ERROS, 0 caso contrario (avisos nao falham).
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, basename, resolve } from "node:path";
import { colunasDasFabricas } from "./colunas-fabricas.mjs";

const ROOT = process.cwd();
const MAX_LINES = 500;

/**
 * Excecao de caminho do limite de linhas. `src/components/ui/` e codigo de
 * terceiro vendorizado pelo CLI do shadcn, que a regra proibe editar. Vale SO
 * para `arquivo-grande` — as demais regras continuam valendo la dentro.
 */
const ISENTOS_DE_TAMANHO = ["src/components/ui/"];

const IGNORE_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage",
  ".turbo", "out", ".vercel", ".lixo-quarentena",
  "templates", // padroes-ouro com imports de exemplo, nao escanear
  "migrations", "drizzle", // SQL gerado por drizzle-kit
]);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const JSX_EXT = new Set([".tsx", ".jsx"]);
const SQL_EXT = new Set([".sql"]);

// Os proprios scripts de auditoria contem os padroes proibidos como DEFINICAO
// de regra (ex.: o regex que detecta Prisma). Nunca auto-sinalizar.
const SKIP_FILES = new Set(["check-compliance.mjs", "project-map.mjs"]);

// ---------------------------------------------------------------------------
// Regras baseadas em regex (linha a linha)
// ---------------------------------------------------------------------------

/**
 * `vale_em_comentario`: a regra dispara mesmo em linha de comentario.
 * @type {{id:string,level:'error'|'warn',re:RegExp,msg:string,ext?:Set<string>,vale_em_comentario?:boolean}[]}
 */
const LINE_RULES = [
  {
    id: "prisma",
    level: "error",
    re: /@prisma\/client|new\s+PrismaClient|from\s+["']prisma["']|require\(["']@prisma\/client["']\)/,
    msg: "Prisma detectado. Este projeto usa Drizzle ORM. Remova o Prisma.",
  },
  {
    id: "sqlite",
    level: "error",
    re: /better-sqlite3|drizzle-orm\/better-sqlite3|from\s+["']sqlite3?["']|:memory:/,
    msg: "SQLite detectado. Este projeto usa PostgreSQL em todos os ambientes.",
  },
  {
    id: "delete-fisico",
    level: "error",
    // `tx.delete(` (dentro de transacao) e `DELETE FROM` (SQL cru) sao os dois
    // caminhos que o codigo novo usaria sem perceber.
    re: /\b(db|tx|trx)\.delete\s*\(|\.deleteMany\s*\(|\bdrizzle[\w.]*\.delete\s*\(|\bDELETE\s+FROM\b/i,
    msg: "Delete fisico detectado. Use soft delete (marcaDeExclusao em src/lib/db/soft-delete.ts).",
  },
  {
    id: "drop-destrutivo",
    level: "error",
    ext: SQL_EXT,
    re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
    msg: "DROP destrutivo em SQL. Proibido dropar estruturas de dados.",
  },
  {
    id: "segredo",
    level: "error",
    vale_em_comentario: true,
    // `sk-ant-…`/`sk-proj-…` tem hifen no meio; PKCS#8 comeca sem o algoritmo.
    re: /sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN\s+((RSA|EC|DSA|OPENSSH|ENCRYPTED)\s+)?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}/,
    msg: "Possivel segredo/credencial hardcoded. Mova para variavel de ambiente.",
  },
  {
    id: "timestamp-cru",
    level: "error",
    ext: CODE_EXT,
    // O Postgres guarda microssegundo; o Date do JS, milissegundo. Sem
    // precision 3, `eq(updated_at, valorDaTela)` nunca bate e toda edicao
    // legitima e recusada como colisao.
    re: /\btimestamp\s*\(\s*["'`][^"'`]+["'`]\s*\)/,
    msg: "timestamp() sem opcoes. Use instante() de src/lib/db/schema/_compartilhado.ts (timestamptz(3)).",
  },
  {
    id: "fk-sem-ondelete",
    level: "error",
    ext: CODE_EXT,
    re: /\.references\s*\(\s*\(\s*\)\s*=>\s*[\w.]+\s*\)/,
    msg: 'FK sem regra explicita. Use .references(() => pai.id, { onDelete: "restrict", onUpdate: "restrict" }).',
  },
  {
    id: "texto-cru",
    level: "error",
    ext: CODE_EXT,
    vale_em_comentario: true,
    // Mojibake: arquivo UTF-8 lido como cp1252 e regravado (acento vira `Ã` + outro).
    re: /[\u00C3\u00C2][\u0080-\u00BF]|\u00E2\u20AC/,
    msg: "Texto acentuado quebrado (mojibake). Os arquivos sao UTF-8: reescreva o caractere acentuado.",
  },
  {
    id: "texto-cru",
    level: "error",
    ext: JSX_EXT,
    // Em texto JSX o escape nao e interpretado: a tela mostra a barra e o codigo, nao o acento.
    re: /\\u00[c-fC-F][0-9a-fA-F]/,
    msg: "Escape unicode literal em .tsx/.jsx. Escreva o caractere acentuado direto.",
  },
  {
    id: "cascade",
    level: "warn",
    re: /onDelete:\s*["']cascade["']/i,
    msg: "CASCADE em FK. Preferir RESTRICT para dados criticos.",
  },
  {
    id: "onupdate-updated-at",
    level: "warn",
    re: /updated_at.*\$onUpdate|\$onUpdate.*updated_at/,
    msg: "$onUpdate em updated_at: todo UPDATE de sistema envelhece a trava de colisao. Grave updated_at na action.",
  },
];

// ---------------------------------------------------------------------------
// Coleta de arquivos
// ---------------------------------------------------------------------------

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      const ext = extname(e.name);
      if (CODE_EXT.has(ext) || SQL_EXT.has(ext)) acc.push(full);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Checagem de tabelas Drizzle (pgTable sem colunas de auditoria)
// ---------------------------------------------------------------------------

const AUDIT_COLS = ["created_at", "updated_at", "deleted_at", "is_deleted"];
/** Coluna de autoria: basta uma das duas. */
const RASTREIO = ["modified_by", "user_id"];
const TODAS = [...AUDIT_COLS, ...RASTREIO];

/**
 * Marcadores de excecao, escritos em comentario nas linhas acima do pgTable,
 * SEMPRE com a justificativa ao lado. Nao sao escape hatch generico.
 *
 * - `compliance:append-only`: a trilha de auditoria. Log que pode ser alterado
 *   ou "soft deletado" nao e trilha — ela nao tem updated_at/deleted_at/is_deleted.
 * - `compliance:framework`: tabela governada pela biblioteca de auth (ex.: o
 *   Better Auth apaga sessao e verificacao fisicamente e nao tem soft delete).
 *   `is_deleted = false` numa linha que a lib vai apagar e mentira gravada.
 */
const MARCADORES = ["compliance:append-only", "compliance:framework"];

/**
 * Devolve o trecho `{ ... }` que comeca em `openIdx`, balanceando as chaves.
 * @param {string} content @param {number} openIdx @returns {string|null}
 */
function corpoDoObjeto(content, openIdx) {
  if (content[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const c = content[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return content.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * Objetos que EMPACOTAM colunas de auditoria para serem espalhados nas tabelas
 * (`...colunasAuditoria`). Mapeia nome do pacote -> colunas que ele fornece.
 * Sem isto, o padrao que a propria base recomenda seria acusado em toda tabela.
 * @type {Map<string, Set<string>>}
 */
const PACOTES_AUDITORIA = new Map();

/**
 * Pre-passada: acha `const NOME = { ... }` que declare colunas de auditoria.
 * @param {string[]} files
 */
function coletarPacotesDeAuditoria(files) {
  for (const file of files) {
    if (!CODE_EXT.has(extname(file))) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const nome = m[1];
      const corpo = corpoDoObjeto(content, m.index + m[0].length - 1);
      if (!corpo) continue;
      const fornece = TODAS.filter((c) => corpo.includes(c));
      if (fornece.length === 0) continue;
      const acumulado = PACOTES_AUDITORIA.get(nome) ?? new Set();
      for (const c of fornece) acumulado.add(c);
      PACOTES_AUDITORIA.set(nome, acumulado);
    }
  }
}

/**
 * Extrai o corpo de cada pgTable('nome', { ... }) — ou da forma callback
 * pgTable('nome', (t) => ({ ... })) — e verifica as colunas.
 * @param {string} content @param {string} file @param {Finding[]} findings
 */
function checkDrizzleTables(content, file, findings) {
  const fabricas = colunasDasFabricas(content, TODAS);
  const re = /pgTable\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:\(?\s*\w*\s*\)?\s*=>\s*\(\s*)?\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const tableName = m[1];
    // Janela acima da declaracao: o marcador precisa estar perto da tabela.
    const janela = content.slice(Math.max(0, m.index - 600), m.index);
    if (MARCADORES.some((mk) => janela.includes(mk))) continue;
    const body = corpoDoObjeto(content, m.index + m[0].length - 1);
    if (!body) continue;

    // So conta o pacote que REALMENTE declara a coluna: espalhar um objeto
    // qualquer nao isenta a tabela.
    const viaPacote = new Set();
    for (const s of body.matchAll(/\.\.\.(\w+)(\s*\(\s*\))?/g)) {
      const pacote = s[2] ? fabricas.get(s[1]) : PACOTES_AUDITORIA.get(s[1]);
      for (const col of pacote ?? []) viaPacote.add(col);
    }
    const tem = (col) => body.includes(col) || viaPacote.has(col);

    const missing = AUDIT_COLS.filter((col) => !tem(col));
    if (!RASTREIO.some(tem)) missing.push("modified_by (ou user_id)");
    if (missing.length > 0) {
      const line = content.slice(0, m.index).split("\n").length;
      findings.push({
        level: "error",
        id: "tabela-sem-auditoria",
        file,
        line,
        msg: `Tabela "${tableName}" sem colunas de auditoria: ${missing.join(", ")}.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Checagem heuristica: query sem filtro is_deleted
// ---------------------------------------------------------------------------

// Helpers que JA aplicam o filtro de soft delete. Registre aqui o helper novo
// que o projeto adotar — nome fora desta lista vira aviso falso.
const HELPERS_SOFT_DELETE =
  /\b(vivos|travaDeColisao|marcaDeExclusao|ativo|ativos|ativoPorId|contarAtivos)\s*\(/;

const RE_FIND = /\.query\.\w+\.find(Many|First)\s*\(/;

/** @param {string} content @param {string} file @param {Finding[]} findings */
function checkSoftDeleteFilter(content, file, findings) {
  const temSelect = /\.from\s*\(/.test(content) && /\.select\s*\(/.test(content);
  const temFind = RE_FIND.test(content);
  if (!temSelect && !temFind) return;
  // `is_deleted` e o nome da coluna; `isDeleted` e o nome em camelCase.
  if (/is_deleted|isDeleted/.test(content)) return;
  if (HELPERS_SOFT_DELETE.test(content)) return;
  const idx = temSelect ? content.search(/\.from\s*\(/) : content.search(RE_FIND);
  const line = content.slice(0, idx).split("\n").length;
  findings.push({
    level: "warn",
    id: "query-sem-filtro",
    file,
    line,
    msg: "Arquivo consulta o banco mas nunca filtra is_deleted. Use vivos() de src/lib/db/soft-delete.ts.",
  });
}

// ---------------------------------------------------------------------------
// Analise de um arquivo
// ---------------------------------------------------------------------------

/**
 * @typedef {{level:'error'|'warn',id:string,file:string,line:number,msg:string}} Finding
 * @param {string} file @returns {Finding[]}
 */
function analyzeFile(file) {
  /** @type {Finding[]} */
  const findings = [];
  if (SKIP_FILES.has(basename(file))) return findings; // vale tambem no modo --file
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return findings;
  }
  const ext = extname(file);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const lines = content.split("\n");

  const isentoDeTamanho = ISENTOS_DE_TAMANHO.some((p) => rel.startsWith(p));
  if (lines.length > MAX_LINES && !isentoDeTamanho) {
    findings.push({
      level: "error",
      id: "arquivo-grande",
      file: rel,
      line: lines.length,
      msg: `Arquivo com ${lines.length} linhas (limite ${MAX_LINES}). Quebre em modulos.`,
    });
  }

  lines.forEach((text, i) => {
    // ignora linhas de comentario para reduzir falso-positivo de exemplos
    const trimmed = text.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    for (const rule of LINE_RULES) {
      if (rule.ext && !rule.ext.has(ext)) continue;
      if (isComment && !rule.vale_em_comentario) continue;
      if (rule.re.test(text)) {
        findings.push({ level: rule.level, id: rule.id, file: rel, line: i + 1, msg: rule.msg });
      }
    }
  });

  if (CODE_EXT.has(ext)) {
    checkDrizzleTables(content, rel, findings);
    checkSoftDeleteFilter(content, rel, findings);
  }

  if (["src/app/api/settings/integrations/route.ts", "src/app/api/settings/agent/route.ts"].includes(rel)) {
    const get = content.match(/export\s+async\s+function\s+GET\s*\([^)]*\)\s*\{([\s\S]*?)(?=\nexport\s+(?:async\s+)?function\s+|$)/)?.[1] ?? "";
    if (!/await\s+administradorHttp\s*\(\s*\)/.test(get)) {
      findings.push({ level: "error", id: "config-super-admin", file: rel, line: 1,
        msg: "A leitura de Configurações deve exigir super administrador via administradorHttp()." });
    }
  }

  if (rel === "src/lib/agent/worker.ts" && (!content.includes("estadoLote(") || !content.includes("agendaAulasDoAgente(") || !content.includes("contextoDoContato("))) {
    findings.push({ level: "error", id: "ct-agenda-contexto", file: rel, line: 1,
      msg: "O worker do CT exige agrupamento, agenda de aulas e contexto persistente." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("reservarAula(banco, cadastro.reserva") || !content.includes("confirmo") || !content.includes("systemUserId"))) {
    findings.push({ level: "error", id: "ct-reserva-confirmacao", file: rel, line: 1,
      msg: "A reserva pelo agente exige confirmação explícita e a transação validada da agenda." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("selecionarExperimentais(") || !content.includes("mostradas"))) {
    findings.push({ level: "error", id: "oferta-experimental-ct", file: rel, line: 1,
      msg: "A oferta deve apresentar horários em pares e preservar as opções já exibidas." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("O que você gostaria de alterar?") || !content.includes("aguardandoAjuda") || content.includes("Protocolo:"))) {
    findings.push({ level: "error", id: "confirmacao-natural-ct", file: rel, line: 1, msg: "Preservar confirmação natural, correção e retorno sem protocolo." });
  }
  if (rel === "src/lib/chatbots/prompt-servidor.ts" && !content.includes("CONHECIMENTO_CT")) {
    findings.push({ level: "error", id: "conhecimento-ct", file: rel, line: 1, msg: "Incorporar informações gerais confirmadas do CT sem substituir a grade." });
  }
  if (rel === "src/lib/aulas/agente.ts" && !content.includes("priorizarInfantil(candidatas")) {
    findings.push({ level: "error", id: "prioridade-infantil-ct", file: rel, line: 1, msg: "Preservar prioridade de Taekwondo para menores de 12 sem restringir pedidos explícitos." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("pediuAlternativas") || !content.includes("garrafinha de água"))) {
    findings.push({ level: "error", id: "alternativas-naturais-ct", file: rel, line: 1, msg: "Preservar consulta de alternativas e confirmação natural." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("LINK_LOCALIZACAO_CT") || content.includes("Brasília"))) {
    findings.push({ level: "error", id: "localizacao-direta-ct", file: rel, line: 1, msg: "Usar link direto do CT e omitir o rótulo de fuso nas mensagens." });
  }
  if (rel === "src/lib/agent/processor.ts" && (!content.includes("fluxoValido") || !content.includes("!historico.length") || !content.includes("RESERVAS CONFIRMADAS NO BANCO"))) findings.push({level:"error",id:"fluxo-entrada-seguro",file:rel,line:1,msg:"Fluxo só acolhe novo contato e revalida versão antes de enviar."});
  if (rel === "src/lib/aulas/lembretes.ts" && (!content.includes("etapa_aula") || !content.includes("revalidarLembreteAula") || !content.includes("programacao(r,r.etapa,config)"))) findings.push({level:"error",id:"followups-aula-etapas",file:rel,line:1,msg:"Preservar etapas por reserva e revalidação da configuração antes do envio."});
  if (rel === "src/lib/campanhas/repository.ts" && (!content.includes("m.direction='inbound'") || !content.includes("c.remote_jid=(substring(p.phone") || !content.includes("contatosElegiveis(banco,item.instancia)"))) findings.push({level:"error",id:"campanha-base-recebida",file:rel,line:1,msg:"Validar chip, telefone com mensagem recebida e revalidar antes de enviar."});
  if (rel === "src/lib/agendamentos/worker.ts" && (!content.includes("sincronizarLembretesAulas") || !content.includes("revalidarLembreteAula"))) {
    findings.push({ level: "error", id: "lembrete-aula-validado", file: rel, line: 1, msg: "Programar e revalidar lembretes vinculados à reserva antes do envio." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("identificarParticipante(texto)") || !content.includes("adultoSemIdade") || !content.includes("elegivelParaExperimental"))) {
    findings.push({ level: "error", id: "participante-aula-ct", file: rel, line: 1, msg: "Identificar participante e permitir adulto sem idade fictícia, preservando faixas infantis." });
  }
  if (rel === "src/lib/agent/providers.ts" && !content.includes("sinalizar_falha_atendimento")) {
    findings.push({level:"error",id:"falha-humana-ct",file:rel,line:1,msg:"Sinalizar inconsistência não resolvida com ferramenta, sem prometer transferência por texto livre."});
  }
  if (rel === "src/lib/agent/providers.ts" && (!content.includes("openai_conferencia_sem_preparo") || !content.includes("tool_choice") || !content.includes("CONFERÊNCIA ÚNICA"))) {
    findings.push({ level: "error", id: "conferencia-unica-aula", file: rel, line: 1, msg: "Conferência de aula exige proposta preparada pela ferramenta antes da única confirmação." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("intencaoModalidade(texto)") || !content.includes("primeiraIdentificacao") || !content.includes("604800"))) {
    findings.push({ level: "error", id: "memoria-interesse-ct", file: rel, line: 1, msg: "Preservar interesse inicial na memória temporária ao identificar participante pela primeira vez." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("modalidadePendente") || !content.includes("modalidade && !preferida"))) {
    findings.push({ level: "error", id: "intencao-modalidade-ct", file: rel, line: 1, msg: "Pedido explícito prevalece sobre recomendação e acompanha a troca de participante sem herdar filtros antigos." });
  }
  if (rel === "src/lib/aulas/agente.ts" && !content.includes("recomendarObjetivo(")) {
    findings.push({ level: "error", id: "objetivo-experimental-ct", file: rel, line: 1, msg: "Explicar a recomendação por objetivo antes dos horários reais." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (content.match(/elegivelParaExperimental\(/g)?.length ?? 0)<2) {
    findings.push({ level: "error", id: "taekwondo-geral-adolescente", file: rel, line: 1, msg: "Validar Taekwondo geral para adolescentes na consulta e preparação, mantendo responsável para menores." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("elegivelParaExperimental(") || /idade\s*<\s*18\s*&&\s*(?:a|aula)\.turma\s*===\s*["']Geral["']/.test(content))) {
    findings.push({ level: "error", id: "faixa-real-turma-geral", file: rel, line: 1, msg: "Usar elegibilidade comum e faixa real da aula, sem bloquear genericamente menores em turmas gerais." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("alternativasPorObjetivo(") || !content.includes("explicarBeneficioObjetivo(") || !content.includes("modalidadePreferida"))) {
    findings.push({ level: "error", id: "beneficios-alternativas-ct", file: rel, line: 1, msg: "Explicar benefícios e consultar alternativas compatíveis sem confundir indicação com preferência explícita." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("aberturaHorarios(") || content.includes("Tenho estas duas opções para você"))) {
    findings.push({ level: "error", id: "horarios-naturais-ct", file: rel, line: 1, msg: "Adaptar a apresentação dos horários à pergunta e à disponibilidade real." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("escolherHorario(") || !content.includes("opcaoEscolhida"))) {
    findings.push({ level: "error", id: "escolha-horario-ct", file: rel, line: 1, msg: "Reconhecer e preservar a escolha de horário antes de pedir dados." });
  }
  if (rel === "src/lib/aulas/agente.ts" && !content.includes("correspondeTurno(inicio, turno)")) {
    findings.push({ level: "error", id: "turno-experimental-ct", file: rel, line: 1, msg: "Filtrar as opções pelo turno solicitado." });
  }
  if (rel === "src/lib/aulas/agente.ts" && (!content.includes("interpretarDataCt(texto)") || !content.includes("dataLocalCt(Date.parse(inicio)) === data"))) {
    findings.push({ level: "error", id: "calendario-aulas-ct", file: rel, line: 1,
      msg: "A agenda deve resolver referências temporais e filtrar somente a data solicitada." });
  }
  if (rel === "src/lib/operacao/memoria.ts" && !content.includes("m.provider_message_id<>")) {
    findings.push({ level: "error", id: "historico-evento-atual", file: rel, line: 1,
      msg: "A restauração do histórico deve excluir o evento atual para preservar a recepção inicial." });
  }
  if (rel === "src/lib/operacao/atribuir-ia.ts" && !/await receberOperacao\(/.test(content)) {
    findings.push({ level: "error", id: "historico-resposta-ia", file: rel, line: 1,
      msg: "O envio confirmado da IA deve persistir a resposta sem depender do eco da Evolution." });
  }
  if (rel === "src/components/workspace.tsx" && !/ChatbotsPage\s+ativo=/.test(content)) {
    findings.push({ level: "error", id: "chatbots-atualizacao", file: rel, line: 1,
      msg: "Chatbot IA deve receber o estado de navegação para atualizar as instâncias ao abrir o menu." });
  }
  if (rel === "src/lib/ct/prompt.ts" && (!content.includes("31/12/2026") || !content.includes("31/03/2027") || !content.includes("grade regular não comprova vaga") || !content.includes("custo ou gratuidade ainda não foi informado") || !content.includes("DÚVIDAS APÓS A ESCOLHA E ENCERRAMENTO"))) {
    findings.push({ level: "error", id: "prompt-ct-condicoes", file: rel, line: 1,
      msg: "O prompt do CT exige validade comercial explícita e distinção entre grade, vaga e custo da experimental." });
  }
  if (rel === "src/lib/chatbots/defaults.ts" && !/context\s*:\s*(?:["']{2}|PROMPT_CT_LUIZ_ROCA)/.test(content)) {
    findings.push({ level: "error", id: "prompt-legado", file: rel, line: 1,
      msg: "O modelo inicial deve usar contexto vazio ou o prompt oficial PROMPT_CT_LUIZ_ROCA." });
  }
  if (rel === "src/lib/consultas/coleta.ts" && /const endereco = [^\n]*"uf"/.test(content)) {
    findings.push({ level: "error", id: "consulta-uf", file: rel, line: 1,
      msg: "O cadastro não deve solicitar estado/UF como dado pendente." });
  }
  if (rel === "src/lib/consultas/fluxo.ts" && (!/interpretarEscolha\(entrada/.test(content) || !/HORARIOS_CONSULTA\.some/.test(content) || !/=== escolha\.dia/.test(content))) {
    findings.push({ level: "error", id: "consulta-escolha", file: rel, line: 1,
      msg: "Escolhas naturais devem validar horário permitido e preservar a data solicitada." });
  }
  if (rel === "src/lib/consultas/fluxo.ts" && (!/camposPendentes/.test(content) || !/perguntaLocal/.test(content) || !/porta.extrair/.test(content) || !/menuDeVagas \|\| conferencia/.test(content) || !/partes\[1\] === avisoChegada/.test(content))) {
    findings.push({ level: "error", id: "consulta-coleta", file: rel, line: 1,
      msg: "Coleta exige campos pendentes, escolha de unidade e divisão do menu e da conferência em mensagens." });
  }
  if (rel === "src/lib/consultas/repository.ts" && (!/reservaConsultaSchema.parse/.test(content) || !/FOR UPDATE/.test(content) || !/await auditar\(tx, id, "consulta_confirmada"/.test(content))) {
    findings.push({ level: "error", id: "consulta-confirmacao", file: rel, line: 1,
      msg: "Reservas exigem cadastro completo validado, trava da vaga e auditoria na mesma transação." });
  }
  if (rel === "src/lib/agent/processor.ts" && (!/deveConsultarAgenda\([^\n]+, historico\)/.test(content) || !/if \(consulta\) partes = mensagensDaConsulta\(reply\)/.test(content))) {
    findings.push({ level: "error", id: "consulta-disponibilidade", file: rel, line: 1,
      msg: "Pedidos diretos consultam a agenda antes da resposta e enviam o menu em partes registradas." });
  }
  if (rel === "src/components/chatbots/page.tsx" && /\b(?:localStorage|loadChatbots|storageKey)\b/.test(content)) {
    findings.push({ level: "error", id: "prompt-legado", file: rel, line: 1,
      msg: "A página não pode importar prompts antigos do navegador automaticamente." });
  }
  if (rel === "src/lib/chatbots/prompt-servidor.ts" && /\b(?:contextoGeral|AI_SYSTEM_PROMPT)\b/.test(content)) {
    findings.push({ level: "error", id: "orquestrador-legado", file: rel, line: 1,
      msg: "O contexto geral legado não pode compor as instruções do chatbot." });
  }
  if (rel === "src/lib/chatbots/prompt-servidor.ts" && !/exclusivamente individuais/.test(content)) {
    findings.push({ level: "error", id: "mentoria-individual", file: rel, line: 1,
      msg: "As instruções da Thaís precisam afirmar que a mentoria com Wellington é individual." });
  }
  if (rel === "src/lib/agent/processor.ts" && (!/\bextrairNomeInformado\b[\s\S]*\brespostaComNome\b/.test(content) || !/turno.revisao === revisao/.test(content) || !/await port.registrarParte/.test(content))) {
    findings.push({ level: "error", id: "nome-cliente", file: rel, line: 1,
      msg: "O processador deve tratar o nome, filtrar revisões antigas e registrar cada balão da abertura antes de continuar." });
  }
  if (rel === "src/lib/agent/store.ts" && !/\bcontactName\b[\s\S]*\brememberName\b/.test(content)) {
    findings.push({ level: "error", id: "nome-cliente", file: rel, line: 1,
      msg: "O nome confirmado deve sobreviver ao histórico curto da conversa." });
  }
  if (rel === "src/lib/atendimento/atendimento.ts" && (!/FOR UPDATE OF c/.test(content) || !/chave:z\.uuid\(\)/.test(content.replace(/\s/g,"")) || !/status='incerto'/.test(content) || !/c\.assigned_to!==autor/.test(content))) {
    findings.push({ level: "error", id: "envio-manual", file: rel, line: 1,
      msg: "Envio manual exige conversa assumida pelo ator, trava, chave idempotente e tratamento de entrega incerta." });
  }
  if (rel === "src/lib/agent/worker.ts" && !/\batendimentoHumanoAtivo\b/.test(content)) {
    findings.push({ level: "error", id: "pausa-atendimento", file: rel, line: 1,
      msg: "O agente e seus follow-ups precisam respeitar as conversas assumidas pela equipe." });
  }
  if ((rel === "src/lib/agent/worker.ts" && (!/\bpausaManualAtiva\b/.test(content) || !/\bpausarTransferencia\b/.test(content))) || (rel === "src/lib/agent/pausa.ts" && !/duracaoPausaManual = 30 \* 60 \* 1000/.test(content))) {
    findings.push({ level: "error", id: "pausa-manual", file: rel, line: 1,
      msg: "O worker deve verificar a pausa por atendimento humano antes de responder." });
  }
  if ((rel === "src/lib/agent/worker.ts" && (!/settingsDaInstancia\(settings, instancia\)/.test(content) || !/dependencies.chatbot\(instancia\)/.test(content))) || (rel === "src/lib/evolution/instancias.ts" && !/EVOLUTION_THIRD_INSTANCE_NAME[\s\S]*FOLLOW_UP_THIRD_CONFIG/.test(content)) || (rel === "src/lib/agendamentos/worker.ts" && !(/settingsDaInstancia\(await configuracoes\(\), instancia\)/.test(content) || /const settingsAtuais = await configuracoes\(\);[\s\S]*settingsDaInstancia\(settingsAtuais, instancia\)/.test(content)))) {
    findings.push({ level: "error", id: "isolamento-instancias", file: rel, line: 1,
      msg: "Os três chips devem ter configuração própria e seleção da origem antes de responder, agendar ou enviar follow-ups." });
  }
  if (rel === "src/lib/evolution/queue.ts" && !/\bpausasManuaisParaEvento\b/.test(content)) {
    findings.push({ level: "error", id: "pausa-manual", file: rel, line: 1,
      msg: "O webhook deve registrar a pausa manual junto com o evento autenticado." });
  }
  if (rel === "src/components/agent-settings.tsx" && /\bAI_SYSTEM_PROMPT\b/.test(content)) {
    findings.push({ level: "error", id: "orquestrador-legado", file: rel, line: 1,
      msg: "Configurações não pode exibir nem editar o prompt legado do orquestrador." });
  }

  return findings;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(3, 27).join("\n").replace(/^ \* ?/gm, ""));
    process.exit(0);
  }
  const asJson = args.includes("--json");
  const quiet = args.includes("--quiet");
  const fileFlag = args.indexOf("--file");

  const srcDir = join(ROOT, "src");
  const scanRoot = existsSync(srcDir) ? srcDir : ROOT;
  const todosOsArquivos = walk(scanRoot, []);

  let files = [];
  if (fileFlag !== -1 && args[fileFlag + 1]) {
    const target = resolve(args[fileFlag + 1]);
    if (existsSync(target) && statSync(target).isFile()) files = [target];
  } else {
    files = todosOsArquivos;
  }

  // Pre-passada sempre sobre o projeto INTEIRO, mesmo com --file: o pacote de
  // colunas mora em outro arquivo (`_compartilhado.ts`).
  coletarPacotesDeAuditoria(todosOsArquivos);

  let findings = [];
  for (const f of files) findings = findings.concat(analyzeFile(f));

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");

  if (asJson) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      scanned: files.length,
      errors: errors.length,
      warnings: warns.length,
      findings,
    }, null, 2));
    process.exit(errors.length === 0 ? 0 : 1);
  }

  const show = quiet ? errors : findings;
  if (show.length === 0) {
    console.log(`OK — ${files.length} arquivo(s) escaneado(s), nenhuma violacao.`);
    process.exit(0);
  }

  /** @type {Map<string,Finding[]>} */
  const byFile = new Map();
  for (const f of show) {
    const arr = byFile.get(f.file) || [];
    arr.push(f);
    byFile.set(f.file, arr);
  }
  for (const [file, fs] of byFile) {
    console.log(`\n${file}`);
    for (const f of fs.sort((a, b) => a.line - b.line)) {
      const tag = f.level === "error" ? "ERRO " : "AVISO";
      console.log(`  ${tag} L${f.line}  [${f.id}] ${f.msg}`);
    }
  }
  console.log(`\n${"-".repeat(60)}`);
  console.log(`Escaneados: ${files.length} | Erros: ${errors.length} | Avisos: ${warns.length}`);
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
