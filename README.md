# TurnoSmart V26 — MTTR e MTBF dos últimos 3 dias

## MTTR

```text
Soma do tempo de reparo das OS corretivas concluídas
÷ quantidade de reparos concluídos
```

O tempo é obtido pela diferença entre `data_inicio` e `data_fim`. Quando essas datas não estiverem disponíveis, o aplicativo tenta usar o campo de duração retornado pelo SGMan.

## MTBF estimado

```text
Horas disponíveis no período menos tempo de parada
÷ quantidade de falhas corretivas
```

O período considerado é de 72 horas para cada máquina com falha registrada.

## Painel

O aplicativo mostra:

- MTTR geral;
- MTBF geral estimado;
- quantidade de falhas corretivas;
- máquinas reincidentes;
- MTTR, MTBF e parada por máquina;
- dados insuficientes quando faltarem horários válidos.

Os indicadores também aparecem no relatório gerencial, na mensagem da manutenção e na mensagem da produção.
