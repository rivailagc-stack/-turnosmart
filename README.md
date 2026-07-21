# TurnoSmart V14 — Diagnóstico SGMan

A versão anterior dizia “9 OS enviadas” quando apenas confirmava que a requisição HTTP havia retornado.

## Correção

- envia cada OS separadamente;
- primeiro libera apenas uma OS de teste;
- classifica cada resposta como:
  - **ABERTA**: SGMan confirmou ou retornou número/ID;
  - **RECUSADA**: SGMan informou erro;
  - **NÃO CONFIRMADA**: resposta chegou, mas não confirmou criação;
- mostra a resposta bruta do SGMan por máquina;
- só libera o envio das restantes após um teste confirmado;
- salva os `id_ext` confirmados para evitar reenvio na mesma instalação.

Não envie todas novamente até testar uma e verificar o resultado.
