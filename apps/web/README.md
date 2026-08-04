# Frontend web

Aplicação Next.js 16 do Limitless Stats. Ela renderiza o metagame público a
partir do snapshot JSON v1 e mantém o Battle Journal local-first, com
sincronização manual opcional no Supabase. Consulte o [`README.md`](../../README.md)
da raiz para escopo, coleta, privacidade e deploy.

## Desenvolvimento

Na raiz do repositório:

```bash
npm --prefix apps/web ci
npm run dev
```

A aplicação abre em <http://localhost:3000>; a raiz renderiza a página de Meta,
também disponível em `/meta`.

Comandos do pacote:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run test
npm --prefix apps/web run build
npm --prefix apps/web run start
```

## Organização

```text
src/app/                  rotas e layouts do App Router
src/components/           UI por domínio
src/data/snapshot.ts      acesso tipado aos JSONs públicos
src/lib/                  fórmulas, parser, storage e cliente Supabase
src/types/domain.ts       contrato de domínio TypeScript
public/data/v1/           snapshot público versionado
```

Rotas principais: `/meta`, `/decks`, `/decks/[id]`, `/matchups`, `/journal`,
`/login`, `/auth/callback` e `/shared`.

## Dados e ambiente

O build precisa dos arquivos em `public/data/v1`. Para regenerá-los, use o
pipeline descrito no README da raiz; não edite percentuais gerados à mão.

Para o login opcional, copie `.env.example` da raiz para `.env.local` neste
diretório e informe:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Sem essas variáveis, todas as páginas públicas e o Journal local continuam
funcionando. Quando configurado, o painel do Journal oferece sincronização
manual, links agregados e revogação; o login sozinho não envia dados.

## Export estático

```bash
GITHUB_PAGES=true npm run build
```

Nesse modo, o Next.js gera `out/`, aplica o `basePath` `/Limitless-stats` e
desativa a otimização de imagens em runtime, tornando o artefato compatível com
GitHub Pages.
