TurnoSmart Clean V3

FOCO:
Foto -> OEE -> Top 10 -> escolher 3 -> cruzar SGMan + Power BI + Produção -> Relatório.

HISTÓRICOS:
1. Relatório da produção:
   - cole no campo da tela Novo;
   - é salvo por data e turno;
   - máquinas citadas são indexadas automaticamente.

2. Power BI:
   - importe JSON ou CSV;
   - histórico fica por data/turno/máquina/produto/OEE.

3. SGMan:
   - consulta os últimos 90 dias;
   - não há aba de SGMan nem página de abrir OS.

PERSISTÊNCIA:
- Sempre salva também no localStorage do aparelho.
- Para histórico central/permanente, use Supabase.
- O pacote inclui SUPABASE_SETUP.sql.
- Variáveis esperadas na Vercel:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SGMAN_TOKEN
  GEMINI_API_KEY

Se Supabase não estiver configurado, o app continua funcionando com histórico local no aparelho.


V4 — GALERIA + ESCALA
- Dois botões separados: escolher foto da galeria / tirar foto agora.
- Escala 12x36 automática pela data.
- Referência: 20/07/2026 = A1 (dia) e A2 (noite); dia seguinte = B1/B2.
- Presença da equipe pode ser marcada no próprio turno.
- A presença fica salva localmente por data/equipe e entra no relatório.
- Edite TEAM_MEMBERS em app.js para colocar os nomes exatos da equipe.
