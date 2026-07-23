# TurnoSmart V38 — Últimas 12 horas e cache corrigido

## OS concluídas

O cartão conta ordens com status concluída e `data_fim` dentro da janela:

```text
agora - 12 horas → agora
```

Exemplo, às 19:57:

```text
07:57 até 19:57
```

## MTTF

O indicador foi removido do HTML, JavaScript, relatórios e cartões.

## Confirmação da versão

Ao lado do nome TurnoSmart deve aparecer:

```text
V38.0.0
```

Caso o selo não apareça, o site publicado ainda não recebeu os arquivos da V38.

## Cache

`index.html`, `app.js`, `style.css` e `sw.js` usam `no-store`. O aplicativo também apaga caches antigos automaticamente.
