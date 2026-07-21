# TurnoSmart V31 — Análise de até 100 OS da própria máquina

## Regra principal

Uma ação da `MK-173` usa somente as OS da `MK-173`.

Uma ação da `MK-172` usa somente as OS da `MK-172`.

As últimas OS gerais da empresa não entram na sugestão técnica.

## Processo

1. O relatório identifica a máquina e o problema atual.
2. O aplicativo consulta até 100 OS recentes daquela TAG no SGMan.
3. Mantém as OS concluídas, pois elas possuem referência de solução.
4. Compara o problema atual com os problemas anteriores.
5. Seleciona as ocorrências semelhantes.
6. Conta as soluções mais recorrentes.
7. Monta a possibilidade de resolução.

## Exemplo

Problema atual:

```text
MK-173 — variação de altura
```

Resultado:

```text
Analisadas: 100 OS da MK-173
Semelhantes: 22
Mola: 11 ocorrências
Posição da faca: 8 ocorrências
Troca da faca: 6 ocorrências
Contrafaca/calços: 4 ocorrências
```

Possível resolução:

```text
Verificar mola quebrada, cansada ou fora de posição;
conferir posição, alinhamento e aperto da faca;
verificar desgaste e necessidade de troca da faca;
verificar contrafaca e calços.
```

## Cache

A consulta por máquina fica armazenada por seis horas. O botão **Atualizar análise** força uma nova consulta ao SGMan.
