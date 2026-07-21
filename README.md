# TurnoSmart V12 — Integração SGMan

## Endpoint oficial

`POST https://api.sgman.com.br/os/criar`

O navegador envia somente as ordens para `/api/sgman`.  
A função da Vercel adiciona o token e chama o SGMan. O token nunca é exposto no GitHub ou no celular.

## Variáveis na Vercel

Em **Settings → Environment Variables**, crie:

- `SGMAN_TOKEN`: token real fornecido pelo SGMan.
- `SGMAN_API_URL`: `https://api.sgman.com.br/os/criar` (opcional, já existe como padrão).

Depois faça um novo deploy.

## Campos usados

- data_programada
- qtd_executantes
- tipo_servico
- tipo_manutencao
- executante, quando configurado
- tag
- prioridade
- id_ext
- pendente
- duracao_estimada
- descricao
- comentario
- maquina_parada

Os campos `parametros` e `fotos` não são enviados nesta versão porque o formato interno completo não apareceu no print e eles não são necessários para a criação básica.

## Segurança

- confirmação obrigatória antes de enviar;
- TAG obrigatória por máquina;
- limite de 30 OS por envio;
- token somente no servidor;
- sem token no localStorage, GitHub ou JSON exibido.
