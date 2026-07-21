# TurnoSmart V28 — OS distribuídas para toda a equipe

## Funcionamento

Para cada equipe A1, A2, B1 e B2, cadastre:

- líder da manutenção;
- usuário exato do líder no SGMan;
- mecânico 1;
- mecânico 2;
- mecânico 3.

As ações já são ordenadas por prioridade. A distribuição fica:

1. líder;
2. mecânico 1;
3. mecânico 2;
4. mecânico 3;
5. volta para o líder.

Cada OS é criada com:

```text
qtd_executantes: 1
executante: usuário escolhido pelo rodízio
```

## Migração

O aplicativo tenta aproveitar automaticamente os nomes já escritos no campo “Equipe da manutenção / observação”. Quando encontra correspondência no diretório do SGMan, preenche os mecânicos da escala.

## Usuários disponíveis

A lista inclui os usuários de manutenção mostrados nas telas do SGMan, como Carlos Matos, Roberto Beraldo, Rogger Sampaio, Thiago Nascimento, Jeanderson Costa, Marcelo Souza, Marcos Roberto, Aleilson Almeida, Igor Henrique, Lucas Eletricista e outros.

Revise a escala uma vez após a atualização para confirmar os três mecânicos de cada equipe.
