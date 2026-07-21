# TurnoSmart V27 — Indicadores exclusivos do SGMan

Nenhum dado do relatório de produção, quadro de OEE ou tempo digitado manualmente entra nos cálculos.

## Fonte

Somente as ordens corretivas retornadas por:

```text
POST https://api.sgman.com.br/os/listar
```

## Indicadores

### MTTR

Média do tempo entre `data_inicio` e `data_fim` das OS corretivas concluídas.

### MTTF

Média do tempo entre a conclusão de um reparo e o início da próxima falha corretiva da mesma máquina.

### MTBF

Média do tempo entre o início de duas falhas corretivas consecutivas da mesma máquina.

### Confiabilidade

Probabilidade estimada de a máquina operar durante o próximo turno de 12 horas sem falhar:

```text
R(12h) = e ^ (-12h / MTBF)
```

## Regras de segurança dos dados

- apenas as últimas 72 horas;
- apenas OS corretivas;
- sem duas falhas na mesma máquina: MTBF indisponível;
- sem reparo concluído antes de nova falha: MTTF indisponível;
- sem início/fim ou duração válida: MTTR indisponível;
- nenhum valor é inventado ou completado pelo relatório de produção.
