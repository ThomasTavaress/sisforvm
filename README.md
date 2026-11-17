# SISFORVM — Simulador de custos de importação

Sistema web da FORVM Comércio Exterior. Cada cliente tem um acesso personalizado para simular os custos de uma importação por Conta e Ordem. A FORVM deixa pré-configurados os fretes, as tabelas de armazenagem e as condições de ICMS.

## Rodar

```bash
npm install
npm start
```

Abra http://localhost:3000. O `npm start` compila o front-end e sobe o servidor. Requer Node.js 22.18 ou superior.

| Comando | O que faz |
|---|---|
| `npm start` | Build do front-end + servidor em produção (porta 3000) |
| `npm run dev` | Desenvolvimento: API com reload + Vite em http://localhost:5173 |
| `npm test` | Testes do motor de cálculo e da API (banco em memória) |
| `npm run typecheck` | Verificação de tipos TypeScript |

### Primeiro acesso
- **Admin FORVM:** na primeira execução, o usuário `admin` é criado com uma senha aleatória, gravada em `data/admin-inicial.txt`. Entre, troque a senha em **Conta** e apague o arquivo. Também é possível definir a senha antes da primeira execução com as variáveis `ADMIN_USER` e `ADMIN_PASSWORD`.
- **Cliente de demonstração:** empresa "Fast Importadora (DEMO)", usuário `fast`, senha `fast2026demo`. Para não criar o demo, use `SEED_DEMO=0`. O admin pode desativar ou excluir a empresa demo.

### Variáveis de ambiente
`PORT` (padrão 3000) · `DB_PATH` (padrão `data/sisforvm.db`) · `COOKIE_SECURE=1` (atrás de HTTPS) · `ADMIN_USER` / `ADMIN_PASSWORD` · `SEED_DEMO` · `DEMO_PASSWORD`

### Logo
Coloque a logo oficial em `public/logo.png`. Enquanto o arquivo não existir, aparece um wordmark provisório.

## Arquitetura

```
src/shared/   motor de cálculo + regras, usados pelo navegador e pelo servidor
  calc.ts       fórmulas do motor-calculo-saida.md, memória de cálculo e alertas
  build.ts      formulário + cadastros → entrada do cálculo (inclui quem pode ajustar o ICMS)
  schemas.ts    validação (zod) de tudo que chega na API
src/server/   Express 5 + SQLite nativo do Node (node:sqlite), sem dependências nativas
  app.ts        sessões, permissões, CRUD, estudos, Excel, PTAX
  db.ts         migrações versionadas, senhas (scrypt)
src/client/   React 19 + React Router 7 (Vite)
test/         testes do motor e da API
```

O resultado ao vivo do simulador é calculado **no servidor** (`POST /api/studies/preview`, com uma pequena espera ao digitar), para que o cliente nunca receba a negociação da FORVM. Ao salvar, o servidor grava esse valor oficial junto com um snapshot de todos os parâmetros usados. Assim, o histórico de um estudo não muda quando os cadastros mudam.

## Funcionalidades

**Equipe FORVM (admin)**
- Clientes: empresa, situação tributária, cidade/UF, CNPJ, sigla, despacho e honorários; usuários de acesso; fretes e produtos de cada cliente.
- Frete internacional por cliente: aéreo (kg taxável), LCL (CBM, W/M), FCL 20' e 40' (container). Cada opção combina país de origem e incoterm EXW, FOB ou FCA, com tarifa, frete mínimo, custos na origem, taxas no destino e transit time.
- Tabelas de armazenagem: GRU, Ponta Negra, Movecta, AMA Itajaí, Forte, Navegantes e Itapoá.
- Condições de ICMS: TTD 410 Regime Normal e Simples (revenda, industrialização e ativo), Lista CAMEX com EX, Convênio 52/91 e "sem TTD", em que o usuário informa a alíquota.
- **Parâmetros gerais:** Siscomex, % do seguro, % do AFRMM, cubagem e as premissas de cálculo (ver abaixo).
- Painel com pendências (produtos a conferir, tabelas e condições não validadas) e todos os estudos.
- Ao gerar um estudo, a FORVM pode ajustar o ICMS ou o Siscomex manualmente; o ajuste fica registrado no estudo.

**Cliente**
- Novo estudo com resultado ao vivo e memória de cálculo.
- Produtos com NCM e alíquotas; os que o cliente cadastra ficam "a conferir" pela FORVM.
- Consulta das opções de frete e histórico de estudos.

**Estudo**
- Referência `SIGLA + sequência` (ex.: `FAS05`).
- Relatório no padrão visual FORVM, com impressão/PDF, **exportação para Excel** (resumo, custo por produto e memória de cálculo) e opção de duplicar para ajustar.
- Busca da taxa PTAX do Banco Central em um clique.

## Conferência com simulações reais da FORVM
`test/simulacoes-forvm.test.ts` reproduz **ao centavo** três planilhas pré-cálculo emitidas pela FORVM: WIND (LCL, FOB, comercialização), EUROMAC (marítimo, EXW, industrialização) e GAV (aéreo, FCA, 2 NCMs). Regras confirmadas por elas:
- Desembolso total **inclui o CIF**.
- Seguro = 0,15% × (FOB + frete), calculado na moeda e convertido.
- **AFRMM** = 8% do frete marítimo, truncado em centavos, **+ R$ 20,00**.
- **Siscomex** = R$ 115,67 por DI + R$ 38,56 por adição (1 NCM = 154,23; 2 NCMs = 192,79), com faixas editáveis.
- Cálculo em precisão total, exibido com arredondamento comercial em centavos (como o Excel).

## O que o cliente vê e o que é só da FORVM
Definido pela equipe FORVM no formulário de divisão de acessos (13/11/2026). Resumo das decisões:
- **Só a equipe FORVM:** cadastro de clientes e usuários (nome, regime, sigla, ativar/desativar); negociação de honorários e despacho; conferir e desativar produtos; fretes, tabelas de armazenagem, condições de ICMS e parâmetros gerais; ajuste manual de ICMS, Siscomex e **honorários por estudo**; estudos de todos os clientes; excluir estudo; painel.
- **Cliente e FORVM:** login e troca de senha; cadastrar e editar produtos; aviso de carga especial; criar estudo (PTAX, finalidade e condição de ICMS por produto, "sem TTD", armazenagem); planilha, memória de cálculo, alertas e custo por produto; histórico dos próprios estudos, duplicar, Excel e PDF.
- **Cliente:** ver os próprios dados cadastrais e a tabela de fretes.
- **Removido:** o cliente ver a própria negociação (honorários e despacho) e a comparação de modais.
- **Honorários para o cliente:** o valor aparece no resultado, mas o % negociado, o mínimo, o despacho e a fórmula nunca saem do servidor para o cliente (`/api/auth/me`, estudo, memória e Excel são filtrados em `src/server/redact.ts`).
- **Honorários manuais:** a FORVM pode informar o valor de um estudo à parte (ex.: casos negociados fora do padrão). Fica registrado em alerta visível só para a equipe.

## Armazenagem e AFRMM
Tabelas transcritas da planilha `ARMAZENAGEM & AFRMM - ATUALIZADO.xlsx` (13/11/2026) em `src/server/armazenagem-forvm.ts`: 17 tabelas de 13 terminais (Itapoá, Portonave, Movecta, Forte, Multilog, Barra do Rio, APM, EGA Santos, Poly, Conexão Marítima…). Cada tabela tem linhas como na planilha:
- **% do CIF com mínimo**: 1º período, ou cobrado por dia/período além do 1º (campo "Dias além do 1º período" no simulador);
- **valor fixo**, **por volume/pallet** (picking) e **% sobre as linhas anteriores** (tributos, ex.: 11,25% na Barra do Rio);
- **linhas opcionais** (zona primária, DTC/DTA…) que o usuário marca no simulador;
- **acréscimo de 5%** sobre o total (a Multilog LCL não aplica).
Conferido: WIND = Forte (LCL) R$ 3.112,15; EUROMAC = Portonave (FCL) + 5 dias R$ 10.907,32. A FORVM edita as tabelas em *Armazenagem* (editor com calculadora de conferência).

**Aeroportos (GRU e Infraero/Ponta Negra, usada para Joinville e Florianópolis):** % do CIF por **faixa de dias úteis** (até 2, 5, 10 e 20 dias; depois +2,25% a cada 10 dias) + taxa sobre o peso bruto (GRU: R$ 0,0691/kg, mín. R$ 23,05; Infraero: tabela "carregamento de veículo" por faixa de peso, sempre × 2). Conferido: GAV (Joinville) = R$ 244,81. Total de dias úteis = 2 + "dias além do 1º período".

**Portonave e Itapoá (FCL):** a FORVM calcula o valor oficial no site do porto; o simulador mostra a tabela como estimativa e, se o link estiver cadastrado na tabela, exibe o site. **Carga especial** (flat rack, open top, perigosa) continua indo para cotação à parte.

**AFRMM** = trunc((frete + THC) × 8%) + R$ 20,00. O THC é cadastrado no perfil de frete e entra no CIF. Confirmado pela FORVM: sem o ×1,05 que aparece na planilha.

## Honorários FORVM
Negociados por cliente no cadastro: **honorários = máx(% × base do ICMS; mínimo)** + valor fixo opcional. Exemplo da Fast: 1% da base do ICMS, mínimo R$ 950,00, despacho R$ 950,00.
- A base é a base do ICMS **por dentro**, somando a base final de cada produto com o divisor da condição dele, e é calculada **antes** de incluir os próprios honorários.
- Os honorários resultantes entram na base do ICMS do estudo.
- Conferido na planilha WIND: 1% × R$ 134.999,31 = R$ 1.349,99. Na GAV vale o mínimo de R$ 1.085.

## ICMS por produto
Cada produto do estudo tem **a sua finalidade e a sua condição de ICMS**. Exemplo: um item com EX vai para a Lista CAMEX (2,5% / 12%, ÷ 0,88) enquanto outro segue a revenda TTD 410 (1,4% / 4%, ÷ 0,96).
- **Condição "Automática" (padrão):** produto com EX → Lista CAMEX; sem EX → condição da situação tributária + finalidade do produto. Pode ser escolhida manualmente em cada produto.
- **Rateio:** CIF, frete, seguro e despesas na base do ICMS (despacho, Siscomex, armazenagem, honorários, AFRMM e taxas no destino) são rateados pela participação de cada produto no valor da mercadoria.
- **Base de cada produto:** CIF rateado + II + PIS + COFINS + despesas rateadas (+ IPI quando a condição manda), ÷ divisor da condição do produto.
- **Relatório:** ICMS pago e crédito de ICMS por condição, base de cada condição e a condição de cada produto na tabela de custo por produto.
- **Ajustes:** sem TTD (alíquota informada) e os ajustes do admin valem por condição.

## Premissas configuráveis (tela Parâmetros)
| Premissa | Padrão | Alternativa |
|---|---|---|
| Desembolso total inclui o CIF? | Sim (custo total da importação) | Não, como no `motor-calculo-saida.md`; o custo com mercadoria aparece à parte |
| Base do seguro completo | Custo total do processo | CIF + II + IPI + PIS + COFINS |

**Créditos por regime:** Simples não gera crédito; Lucro Presumido credita ICMS e IPI; Lucro Real credita ICMS, IPI, PIS e COFINS. No ativo imobilizado, o IPI não é creditado e o ICMS entra via CIAP.

**Valores a validar:** as tabelas de armazenagem são exemplos, e as condições do Simples e do Convênio 52/91 são provisórias. Enquanto não forem marcadas como validadas, elas geram alerta em cada estudo.

## Segurança
- Senhas guardadas com scrypt; sessões com token aleatório, das quais só o hash fica no banco; cookie HttpOnly e SameSite.
- Limite de tentativas de login e troca de senha que encerra as outras sessões.
- CSP e cabeçalhos de segurança; API só aceita JSON; validação de entrada com zod.
- Isolamento por cliente verificado no servidor em todas as rotas, coberto pelos testes.
