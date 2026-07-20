# TurnoSmart V1

Aplicativo PWA para transformar relatórios de produção em resumo gerencial, ações de manutenção e prévia de ordens para o SGMan.

## O que já funciona

- Colar o relatório recebido no WhatsApp.
- Identificar turno, líder, faltas, presentes, produção, plano e OEE.
- Separar as ocorrências por máquina.
- Somar os tempos informados.
- Gerar ações com prioridade alta, média ou baixa.
- Aprovar e editar as ações antes do envio.
- Compartilhar a mensagem pelo menu do iPhone, inclusive para o WhatsApp.
- Cadastrar escala dos líderes da manutenção.
- Usar automaticamente o líder da data e do turno.
- Gerar uma prévia JSON das futuras ordens do SGMan.
- Salvar histórico no próprio aparelho.
- Instalar como aplicativo PWA.

## Publicar na Vercel pelo iPhone

1. Crie um repositório novo no GitHub, por exemplo `turnosmart`.
2. Extraia este ZIP no aplicativo Arquivos.
3. Envie todos os arquivos para a raiz do repositório.
4. Na Vercel, toque em **Add New > Project**.
5. Selecione o repositório `turnosmart`.
6. Em Framework Preset, use **Other**.
7. Não precisa cadastrar variável de ambiente nesta versão.
8. Toque em **Deploy**.

## Instalar no iPhone

1. Abra o endereço publicado no Safari.
2. Toque no botão de compartilhar.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme em **Adicionar**.

## Próximas integrações

### Supabase

Será usado para login, sincronização entre aparelhos, escala central, histórico e permissões.

### WhatsApp

A versão futura receberá relatórios em um número oficial e enviará alertas por integração autorizada.

### SGMan

O arquivo `api/sgman.js` já reserva o ponto de integração. Para concluir, serão necessários:

- URL/base da API utilizada pela Ecopack;
- método de autenticação;
- documentação dos endpoints;
- códigos dos ativos/máquinas;
- IDs dos usuários/líderes;
- campos obrigatórios para criação de chamado ou OS.

## Regra atual para ações

O aplicativo não abre ação para limpeza, troca normal de bobina, treinamento, preventiva ou falta de mão de obra como OS. Falta de mão de obra vira ação de gestão. Quebra, vazamento, alarme, variação, defeito de qualidade e ajustes longos podem virar OS simulada.
