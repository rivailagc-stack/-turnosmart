# TurnoSmart V24 — Correção da listagem SGMan

A V23 estava conectando ao SGMan, mas podia mostrar todos os valores como zero porque o formato dos campos retornados não era reconhecido.

## Correções

- consulta 90 dias;
- não envia filtro de status na primeira consulta;
- segunda tentativa somente com `data_inicio`;
- reconhece campos com nomes completos, abreviados e objetos internos;
- lê JSON que venha dentro de texto;
- reconhece datas ISO e brasileiras;
- reconhece status como concluída, finalizada, fechada, atrasada, vencida, aberta, pendente e em andamento;
- mostra no aplicativo:
  - maior lista recebida da API;
  - quantidade de registros interpretados;
  - modo de consulta utilizado.

O mesmo `SGMAN_TOKEN` já configurado na Vercel continua sendo usado.
