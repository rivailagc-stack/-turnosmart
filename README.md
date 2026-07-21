# TurnoSmart V15 — Executante automático

Não é necessário trocar o executante a cada turno.

Na tela **Escala**, cadastre uma vez para cada equipe:

- líder da manutenção;
- usuário exato do líder no SGMan;
- líder da produção;
- equipe/observação.

Exemplo:

```text
A1 — Líder: Emerson — Usuário SGMan: emerson
A2 — Líder: Ricardo — Usuário SGMan: ricardo
B1 — Líder: Danilo — Usuário SGMan: danilo
B2 — Líder: Fider — Usuário SGMan: fider
```

Quando o relatório for entregue:

- relatório do turno 1: a responsabilidade passa para a equipe 2;
- relatório do turno 2: a responsabilidade passa para a próxima equipe 1;
- a OS recebe automaticamente o usuário SGMan do líder da equipe responsável.

Se o campo “Usuário do líder no SGMan” ficar vazio, o aplicativo tenta usar o nome do líder. O campo de executante na Config é apenas uma opção de emergência.
