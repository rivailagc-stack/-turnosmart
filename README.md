# TurnoSmart V23 — Histórico do SGMan

## Consulta de ordens

O backend protegido consulta:

```text
POST https://api.sgman.com.br/os/listar
```

O token continua somente na Vercel.

## Novidades

- consulta OS abertas, atrasadas e concluídas;
- mostra no relatório diário:
  - concluídas hoje, quando a API retorna data de conclusão;
  - concluídas no período como alternativa;
  - OS em atraso;
  - OS abertas;
- usa OS concluídas da mesma máquina para enriquecer a próxima possível resolução;
- para variação de altura, considera:
  - mola;
  - condição e posição da faca;
  - contrafaca;
  - calços e fixações;
  - acompanhamento da altura após o ajuste;
- mantém o alerta para testar e evitar retrabalho.

## Observação

A resposta do endpoint de listagem pode variar conforme a versão do SGMan. A V23 faz uma leitura flexível dos nomes dos campos e mantém o relatório funcionando mesmo quando não houver histórico disponível.
