# TurnoSmart V34 — Correção do limite de armazenamento

## Problema

As versões anteriores podiam guardar no `localStorage` até 100 ordens completas de várias máquinas. No iPhone, esse armazenamento possui um limite pequeno e gerava:

```text
The quota has been exceeded
```

## Correções

- remove automaticamente o cache grande das versões anteriores;
- as 100 OS de cada máquina ficam somente na memória durante a sessão;
- o histórico local mantém no máximo 25 relatórios;
- os registros do histórico são compactados;
- nenhuma foto ou lista completa de OS é guardada no histórico;
- falha ao salvar histórico não bloqueia a análise;
- rascunho, configuração, escala e respostas do SGMan usam gravação segura.

## Efeito

O botão **Analisar relatório** continua funcionando mesmo quando o navegador não permite salvar mais dados localmente.
