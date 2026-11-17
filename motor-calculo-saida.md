# Motor de calculo e saida FORVM

Execute esta etapa somente apos a validacao humana dos dados e parametros fiscais.

## Formulas obrigatorias

1. **Seguro internacional**
   - Se documentado, use o valor documental.
   - Caso contrario: `Seguro = (FOB + Frete Internacional) x 0,15%`.
2. **CIF**: `CIF = FOB + Frete Internacional + Seguro`.
3. **Siscomex**: use R$ 154,23 por padrao; se o operador informar outro valor, use-o e registre a alteracao.
4. **AFRMM**:
   - Maritimo: `Frete Internacional x 8%`.
   - Aereo: zero.
   - Modal incerto: exponha a pendencia ou premissa; nao assuma silenciosamente.
5. **Nacionalizacao**: calcule II, IPI, PIS e COFINS com as aliquotas oficiais das NCMs. Se uma aliquota nao estiver nos documentos, exija confirmacao ou, mediante pedido do usuario, use fonte confiavel e marque-a como estimada, presumida ou nao confirmada.
6. **Base inicial do ICMS**: `CIF + II + PIS + COFINS + Despacho Aduaneiro + Siscomex + Armazenagem + Honorarios FORVM + AFRMM + Taxas no Destino`. Inclua o IPI da nacionalizacao somente quando a condicao validada determinar. Nunca inclua o frete rodoviario nacional.
7. **Calculo por dentro**: `Base Final ICMS = Base Inicial ICMS / Divisor validado`.
8. **ICMS pago**: `Base Final ICMS x Aliquota Efetiva do Beneficio`.
9. **Diferenca de IPI**, quando aplicavel em operacao interna de SC com beneficio: use a Base Final ICMS como base do IPI de saida e calcule `IPI Saida - IPI Entrada`. Trate a diferenca como custo de Conta e Ordem. Exponha premissas nao confirmadas.
10. **Desembolso total**: some impostos da nacionalizacao, despesas aduaneiras e logisticas, custos de Conta e Ordem e frete rodoviario nacional.
11. **Creditos fiscais**: conforme finalidade, regime e condicao validada, apure ICMS sobre a Base Final e aliquota de saida, PIS, COFINS e IPI quando aproveitaveis. Explique limitacoes do regime e reflita-as no resultado.
12. **Custo liquido**: `Desembolso Total - Total dos Creditos de Impostos`.

Converta valores em moeda estrangeira pela taxa fiscal validada no ponto adequado da memoria. Evite arredondamentos intermediarios desnecessarios; apresente valores monetarios com duas casas decimais e preserve precisao suficiente nos calculos.

## Verificacao final

Confira NCM e aliquotas, finalidade e condicao de ICMS, regra de inclusao do IPI, divisor, ajustes manuais, classificacao das taxas, modal/AFRMM, armazenagem e somatorios. Destaque qualquer divergencia e seu impacto.

## Tabelas obrigatorias

Apresente em Markdown, nesta ordem:

### TABELA 1: DADOS GERAIS

NCM; Cliente; Moeda; Taxa Fiscal; Modal; Finalidade; Regime; Operacao TTD ou condicao de ICMS aplicada.

### TABELA 2: FORMACAO DO CIF

Valor Mercadoria; Frete Internacional; Seguro; Total CIF em Moeda; Total CIF em R$.

### TABELA 3: IMPOSTOS NA NACIONALIZACAO

II; IPI; PIS; COFINS; SISCOMEX; Total.

### TABELA 4: DESPESAS ADUANEIRAS & LOGISTICA

Honorarios Despachante ou Despacho Aduaneiro; Taxas no Destino; Armazenagem; Honorarios FORVM; AFRMM; Total.

### TABELA 5: CUSTOS CONTA E ORDEM & DESEMBOLSO

ICMS Pago; Diferenca de IPI; Frete de Entrega Nacional; Desembolso Total.

### TABELA 6: DESTAQUE DE IMPOSTOS & CUSTO LIQUIDO

IPI Saida; ICMS Destaque para Credito; Total do Credito dos Impostos; Custo Liquido Final.

Um resumo curto da memoria pode anteceder as tabelas, mas nao as substitui.

## Alertas do simulador

Ao final, registre objetivamente:

- dados estimados e presumidos;
- valores calculados por padrao;
- condicao de ICMS selecionada;
- campos da condicao ajustados manualmente;
- tabela e referencia da estimativa de armazenagem;
- divergencias de nomenclatura das taxas;
- premissas por ausencia documental;
- aliquotas nao confirmadas e respectivas fontes, quando houver.
