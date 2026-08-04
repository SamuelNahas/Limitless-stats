# Como contribuir

Obrigado por ajudar a tornar o Limitless Stats mais confiável. Mudanças pequenas
e verificáveis são preferíveis: explique o problema, preserve o contrato de
dados e inclua testes quando o comportamento mudar.

## Preparação

```bash
git clone https://github.com/SamuelNahas/Limitless-stats.git
cd Limitless-stats
npm --prefix apps/web ci
npm run dev
```

Use Node.js 20.9 ou superior. Alterações no coletor ou no conversor também
exigem Python 3.12 ou superior.

## Fluxo recomendado

1. Abra uma issue para mudanças amplas de produto, schema ou pipeline.
2. Crie uma branch curta a partir de `main`.
3. Mantenha o PR focado e descreva motivação, comportamento anterior/novo e
   como a mudança foi validada.
4. Inclua capturas para mudanças visuais e informe os breakpoints conferidos.
5. Execute o quality gate antes de enviar:

   ```bash
   npm run check
   ```

Não inclua `.next/`, `out/`, `site/`, caches, credenciais ou exportações reais
do Battle Journal.

## Alterações de dados

- Trate `apps/web/public/data/v1` como saída gerada.
- Preserve W/L/T; percentuais configuráveis devem ser derivados na leitura.
- Atualize `manifest.json` por meio do conversor, não manualmente.
- Uma nova rotação começa em `configs/eras/`. Selecione o novo arquivo no
  workflow e crie uma nova migration que encerre a temporada corrente e insira
  a próxima com `seasons.slug` igual ao `eraId`; nunca reescreva uma migration
  que possa ter sido aplicada.
  Mantenha eras anteriores identificáveis; coletor, conversor e Journal
  consomem o contrato configurado. O arquivo deve respeitar
  `packages/contracts/schemas/era.schema.json`.
- Respeite o limitador de requisições e os termos da fonte ao testar o coletor.

Para converter uma pasta de CSVs compatíveis:

```bash
npm run data:from-csv -- \
  --input site \
  --output apps/web/public/data/v1
```

## Frontend e domínio pessoal

- Adicione ou atualize testes Vitest para fórmulas, parsing e regras de domínio.
- Preserve acessibilidade por teclado, nomes acessíveis e estados de foco.
- Verifique desktop e viewport móvel nas telas alteradas.
- Não conecte dados pessoais ao snapshot público.
- Mudanças Supabase precisam manter RLS habilitada e ser testadas com dois
  usuários distintos e com o papel anônimo.
- Preserve o opt-in manual da sincronização, a resolução por `updatedAt` e os
  tombstones de exclusão; nunca transforme o login em upload implícito.
- Compartilhamento deve permanecer opt-in, revogável e limitado a campos
  explicitamente aprovados. O segredo deve continuar fora da query string.

Decisões arquiteturais duradouras devem ganhar um ADR em `docs/adr/`. Para
falhas de segurança, não abra uma issue pública; siga o
[`SECURITY.md`](SECURITY.md).
