# ADR 0001 — Aplicação Next.js com coletor Python

- Status: aceito
- Data: 2026-08-03

## Contexto

O protótipo original coletava, analisava e renderizava todo o produto em um
script Python. Múltiplas rotas, dados pessoais, login e uma interface responsiva
exigem ciclos de vida e controles diferentes da coleta pública.

## Decisão

- `apps/web`: Next.js App Router, React e TypeScript.
- `configs/eras`: contrato versionado de escopo para a coleta e o snapshot.
- `analisar_limitless.py`: coletor dos dados públicos do Limitless, invocado
  por `scripts/run_collection.py` com a era selecionada.
- `scripts/build_snapshot_from_csv.py`: adaptador entre os CSVs legados e o
  contrato JSON `public/data/v1`.
- GitHub Actions + GitHub Pages: pipeline e hospedagem primários do export
  estático; Vercel permanece uma alternativa opcional.
- `localStorage`: persistência padrão do Journal, sem conta e sem custo.
- Supabase: Auth por e-mail, PostgreSQL e RLS opcionais; o Journal só é gravado no
  banco depois de uma ação explícita de sincronizar ou compartilhar.
- Links bearer: leitura anônima restrita a agregados allowlisted por uma RPC.

## Consequências

- O frontend não depende do HTML gerado pelo Python.
- O coletor publica W/L/T, não apenas percentuais.
- O Pages não precisa de servidor de aplicação para as rotas do produto.
- Dados privados nunca entram no snapshot público.
- Login, sincronização e compartilhamento hospedados dependem das variáveis
  públicas do Supabase no build e da migration aplicada.
- O merge local/nuvem e tombstones de exclusão precisam permanecer testados.
- Cada nova era exige uma migration incremental de temporada; migrations já
  aplicadas são imutáveis.
- Uma futura funcionalidade exclusivamente server-side pode exigir Vercel ou
  outro runtime e uma nova decisão arquitetural.
