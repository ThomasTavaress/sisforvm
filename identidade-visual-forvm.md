# Identidade Visual FORVM Comércio Exterior — guia de referência

Levantado em 09/11/2026 a partir de `image.png` (logo oficial), `180ab3dc-…png` (modelo padrão de simulação) e do site www.forvm.com.br.

## 1. Logo (`image.png`)

| Item | Valor medido |
|---|---|
| Composição | Ícone de globo (meridianos/paralelos) à esquerda + logotipo "FORVM" em caixa alta, sans-serif |
| Arquivo | PNG 162 × 56 px, **sem transparência** — fundo cinza claro `#F7F7F7` |
| Área útil | ≈ 151 × 37 px (margem de ~7 px) → proporção ≈ **4,1 : 1** |
| Azul do logotipo | ≈ `#1A5589` (média dos pixels sólidos do texto) |
| Azul do globo | ≈ `#225280` |

Regras (CLAUDE.md): obrigatória no cabeçalho de tudo, sem distorcer, recortar, recolorir ou trocar por texto.

**Limitações do arquivo atual**
- Resolução baixa: acima de ~160 px de largura fica serrilhado; em PDF/impressão, usar no máximo ~40 mm de largura.
- Fundo `#F7F7F7` opaco: sobre página branca aparece um retângulo cinza sutil. Ou se coloca o cabeçalho sobre `#F7F7F7`, ou se aceita o leve contraste.
- Ideal: obter da FORVM a logo em vetor (SVG/PDF/AI) ou PNG transparente em alta resolução.

## 2. Paleta (modelo padrão de simulação)

| Token | Hex | Uso no modelo |
|---|---|---|
| Azul FORVM | `#0077BE` | Faixas de título de seção, wordmark do cabeçalho, linha divisória |
| Marinho | `#1F4E78` | Barras de total / Desembolso / Custo Líquido, título do documento |
| Azul gelo | `#DDEBF7` | Linha de cabeçalho de colunas (DESCRIÇÃO / USD / R$) |
| Logo | `#1A5589` | Só na logo — fica entre o azul e o marinho |
| Texto | preto/cinza escuro | Valores e descrições |
| Cinza rótulo | cinza médio | Rótulos em caixa alta (CLIENTE, ORIGEM…), subtítulo, rodapé |
| Linhas | `#E2E6EA` a `#C9D1D9` | Separadores finos entre linhas |
| Fundo | `#FFFFFF` | Página |

Proporção visual: ~70% branco, ~15% marinho, ~13% azul — dominância de branco com blocos azuis fortes.

## 3. Tipografia
- Sans-serif neutra (Arial / Helvetica). Nada de serifas ou fontes decorativas.
- Títulos de seção: negrito, CAIXA ALTA, branco sobre azul, centralizados.
- Totais: negrito, CAIXA ALTA, branco sobre marinho; rótulo à esquerda, valor à direita.
- Painel de dados: rótulo cinza em caixa alta pequena + valor em negrito, em 2 colunas.
- Valores monetários alinhados à direita, formato BR (`R$ 1.234,56`, `USD 1.234,56`).

## 4. Estrutura de página (modelo)
1. **Cabeçalho**: marca à esquerda; à direita título em marinho caixa alta ("SIMULAÇÃO DE CUSTOS DE IMPORTAÇÃO") + subtítulo cinza ("CONTA E ORDEM | dd/mm/aaaa"); fio azul fino abaixo.
   - No modelo a marca aparece como texto "FORVM / COMÉRCIO EXTERIOR"; nas nossas saídas ela é substituída pela `image.png`, como manda o CLAUDE.md.
2. Faixa azul "PLANILHA PRÉ-CÁLCULO" + painel de dados gerais em 2 colunas.
3. Blocos repetidos: faixa azul de seção → linhas zebradas por fio → barra marinho de total.
4. Barras de destaque isoladas (DESEMBOLSO TOTAL, CUSTO LÍQUIDO FINAL) em marinho com respiro acima.
5. Rodapé: premissas em cinza pequeno à esquerda; "FORVM | Simulação gerencial" em negrito à direita.

Tom: corporativo, técnico, limpo, sem ícones nem ilustrações; a cor carrega a hierarquia.

## 5. Site www.forvm.com.br
- Feito em Wix; a home entregou praticamente só o bloco de newsletter, sem logo nem identidade aplicável.
- A paleta do tema Wix é genérica de template (vermelho, amarelo, `#0088CB`) → **não usar como referência**.
- Dados institucionais: Joinville/SC, fundada em 1997, comercial@forvm.com.br, (47) 3433-0641.

## 6. Divergências a decidir
| Fonte | Azul principal | Marinho |
|---|---|---|
| Modelo padrão (referência oficial de design) | `#0077BE` | `#1F4E78` |
| Logo | `#1A5589` (cor única) | — |
| App `forvm-cost-simulator` (`globals.css`, `pdf.tsx`) | `#0B6FB8` | `#1F3B63` |

O app está próximo, mas não idêntico ao modelo. Recomendação: adotar `#0077BE` / `#1F4E78` / `#DDEBF7` como tokens oficiais, já que o modelo é a referência de design declarada.

## 7. Tokens sugeridos
```css
:root {
  --forvm-azul: #0077BE;
  --forvm-marinho: #1F4E78;
  --forvm-gelo: #DDEBF7;
  --forvm-logo: #1A5589;
  --forvm-fundo-logo: #F7F7F7;
  --forvm-texto: #1F2937;
  --forvm-rotulo: #6B7280;
  --forvm-linha: #E2E6EA;
  --forvm-fonte: Arial, Helvetica, sans-serif;
}
```
