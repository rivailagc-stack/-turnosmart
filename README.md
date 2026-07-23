# TurnoSmart V35 — Menos ações e análise mais precisa

## Quantidade de ações

Por relatório:

- até 5 ações de manutenção;
- até 3 ações de produção;
- ações repetidas da mesma máquina são agrupadas;
- OEE baixo sem problema técnico descrito não abre OS.

## Análise do SGMan

Para cada máquina:

1. consulta até 100 OS da própria máquina;
2. considera somente OS concluídas;
3. exige categoria técnica igual ou palavras importantes realmente coincidentes;
4. descarta referências fracas;
5. usa no máximo as 20 melhores referências;
6. prioriza os textos reais de conclusão que se repetem;
7. completa apenas com padrões técnicos recorrentes.

## Confiança

- alta: várias OS realmente semelhantes;
- média: pelo menos duas referências úteis;
- baixa: histórico insuficiente.

Quando a confiança é baixa, a resposta será:

```text
Histórico insuficiente para indicar uma causa específica.
Fazer diagnóstico no local antes de trocar componentes.
```

Assim o aplicativo não inventa uma resolução genérica.
