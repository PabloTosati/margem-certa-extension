# Textos para as lojas (Chrome Web Store e Microsoft Edge Add-ons)

Copie e cole cada campo. O pacote para enviar é o `margem-certa-loja-1.0.0.zip` (o `manifest.json` fica na raiz do zip, como as lojas exigem).

## Campos comuns

**Nome** (vem do `manifest.json`, não precisa digitar)
Margem Certa – Calculadora de lucro para vendedores

**Resumo / descrição curta** (vem do `manifest.json`, 115 de 132 caracteres)
Veja o lucro real dos anúncios do Mercado Livre e da Shopee, já descontando comissão, tarifa fixa, frete e imposto.

**Idioma:** Português (Brasil)

**Site / página inicial:** https://github.com/PabloTosati/margem-certa-extension

**Suporte:** https://github.com/PabloTosati/margem-certa-extension/issues

**Política de privacidade:** https://github.com/PabloTosati/margem-certa-extension/blob/main/PRIVACY.md

**Descrição completa:**

```
Quanto sobra de verdade em cada venda?

A Margem Certa mostra o lucro real dos seus anúncios no Mercado Livre e na Shopee, direto na página do produto. Abra um anúncio e um cartão aparece no canto da tela com o preço já preenchido. Digite o custo do produto e o frete que você paga e pronto: você vê quanto recebe, quanto lucra e qual a sua margem.

O QUE ELA CALCULA
• Comissão do Mercado Livre (Clássico e Premium) e da Shopee
• Tarifa fixa por unidade dos produtos abaixo de R$ 79 no Mercado Livre
• Faixas de comissão e tarifa da Shopee (vendedor CNPJ ou CPF)
• Frete pago por você
• Imposto sobre a venda e gasto com anúncios, se você quiser incluir
• Preço mínimo para chegar na margem que você deseja

POR QUE USAR
• Descubra anúncios que dão prejuízo antes de vender
• Pare de fazer conta em planilha para cada produto
• A extensão lembra o custo de cada anúncio: abriu de novo, os valores continuam lá
• Calculadora rápida no ícone da extensão, para simular sem abrir um anúncio

SUAS TAXAS, DO SEU JEITO
As comissões mudam conforme a categoria. Na aba Configurações você ajusta a comissão, a tarifa fixa, o imposto, o gasto com anúncios e a margem desejada. Os padrões são as tarifas de novembro de 2026.

PRIVACIDADE
A Margem Certa não coleta nem envia nenhum dado. Não tem servidor, propaganda nem rastreamento. Tudo o que você digita fica salvo só no seu navegador.

AVISO
Projeto independente, sem ligação com o Mercado Livre ou a Shopee. Os valores são estimativas: confira sempre as tarifas da sua categoria no marketplace.
```

## Só na Chrome Web Store

**Categoria:** Produtividade › Ferramentas

**Finalidade única** (aba Práticas de privacidade):
```
Calcular o lucro e a margem de um anúncio do Mercado Livre ou da Shopee, descontando as tarifas do marketplace, o frete, o imposto e o custo do produto informado pelo usuário.
```

**Justificativa da permissão `storage`:**
```
Salvar as configurações de tarifas do usuário (comissão, tarifa fixa, imposto, gasto com anúncios e margem desejada) e o custo e o frete que ele digita para cada anúncio, para que os valores continuem lá quando ele voltar ao anúncio. Nada é enviado para fora do navegador.
```

**Justificativa da permissão de host** (os sites `mercadolivre.com.br` e `shopee.com.br`):
```
A extensão mostra o cartão de cálculo nas páginas de produto do Mercado Livre e da Shopee e lê o preço do anúncio na própria página para preencher a calculadora. Ela não roda em nenhum outro site e não envia dados da página para fora do navegador.
```

**Código remoto:** marque "Não, não estou usando código remoto".

**Uso de dados:** a extensão não envia nenhum dado para fora do computador, então deixe os tipos de dados desmarcados. Marque as três declarações no fim (não vende dados a terceiros, não usa para outra finalidade, não usa para crédito ou empréstimo).

## Só no Microsoft Edge Add-ons

**Categoria:** Produtividade

**Termos de pesquisa** (até 7):
```
calculadora mercado livre
margem de lucro
taxas shopee
tarifa mercado livre
calculadora shopee
lucro por venda
precificação
```

**Notas para a certificação** (campo opcional, ajuda o revisor):
```
Para testar: abra qualquer página de produto do Mercado Livre (produto.mercadolivre.com.br ou www.mercadolivre.com.br/.../p/MLB...) ou da Shopee (shopee.com.br/...-i.123.456). Um cartão aparece no canto inferior direito com o preço preenchido. Digite um custo para ver o lucro. Clique no ícone da extensão para a calculadora e as configurações. A extensão não precisa de login nem de conta.
```

## Imagens (pasta `store/`)

| Arquivo | Tamanho | Onde usar |
| --- | --- | --- |
| `screenshot-1-lucro.png` | 1280×800 | Capturas de tela (Chrome e Edge) |
| `screenshot-2-prejuizo.png` | 1280×800 | Capturas de tela |
| `screenshot-3-shopee.png` | 1280×800 | Capturas de tela |
| `screenshot-4-simular.png` | 1280×800 | Capturas de tela |
| `promo-pequeno-440x280.png` | 440×280 | Bloco promocional pequeno (Chrome e Edge) |
| `promo-grande-1400x560.png` | 1400×560 | Bloco promocional grande / letreiro (opcional) |
| `logo-300x300.png` | 300×300 | Logotipo da loja do Edge |
| `icons/icon128.png` (no projeto) | 128×128 | Ícone da Chrome Web Store |
