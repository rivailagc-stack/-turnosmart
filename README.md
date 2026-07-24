# TurnoSmart V40 — OS concluídas no turno atual

## Turno diurno

Entre 06:00 e 18:20, o painel conta as OS concluídas:

```text
hoje às 06:00 → horário atual
```

Quando o turno termina, o limite programado é 18:20.

## Turno noturno

Entre 18:20 e 06:00, o painel conta:

```text
data de início às 18:20 → horário atual
```

A janela atravessa a madrugada corretamente.

## Exemplo

Às 20:57:

```text
Turno noturno
18:20 até 20:57
```

O aplicativo usa a data/hora de conclusão reconhecida na resposta do SGMan.
