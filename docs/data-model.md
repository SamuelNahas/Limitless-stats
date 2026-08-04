# Modelo de dados

## Snapshot público

O contrato publicado está em `apps/web/public/data/v1`. `manifest.json` declara
versão, período, formato, era, contagens e nomes dos recursos. Os demais JSONs
contêm decks, torneios, listas canônicas e matchups geral/MD1/MD3.

Contagens W/L/T são canônicas; taxas são derivadas na interface conforme a
política de empate. O snapshot não contém dados do Battle Journal.

## Journal local

No navegador, cada `JournalEvent` armazena:

```text
JournalEvent
├── identificação, nome, data, formato, era e modalidade
├── deck próprio e decklistText (snapshot bruto exportado pelo TCG Live)
└── JournalRound[]
    ├── arquétipo adversário e resultado
    ├── games, ordem de jogo e número da rodada
    └── notas opcionais
```

O array é persistido em `localStorage` sob uma chave versionada. Exclusões
destinadas à nuvem ficam em uma segunda lista de tombstones até uma
sincronização bem-sucedida.

## Supabase

O schema principal está em
`supabase/migrations/202608030001_initial_schema.sql`:

```text
auth.users
└── profiles
    ├── user_decklists
    │   └── user_decklist_cards
    ├── journal_events
    │   └── journal_rounds
    └── profile_share_links

formats
├── seasons
└── archetypes
```

RLS restringe perfis, listas, eventos, rodadas e links ao `auth.uid()` do
proprietário. A sincronização faz merge pelo identificador do cliente e mantém
a versão com `updatedAt` mais recente, persistido em `client_updated_at`; o
`updated_at` do banco permanece um relógio de auditoria do servidor. Depois do
merge, o resultado é gravado na nuvem e no navegador. Formato e temporada são
resolvidos por `format_slug` + `era_slug`, sendo o slug da temporada igual ao
`eraId` publicado.

Atualmente o cliente persiste o texto bruto da lista, status/erros do parser e
contagem de cartas em `user_decklists`. A tabela `user_decklist_cards` prepara a
normalização por carta, mas ainda não é preenchida pelo fluxo de sincronização.

## Compartilhamento

O segredo do link é retornado uma vez e somente seu SHA-256 fica no banco. A RPC
anônima valida link ativo e retorna uma allowlist:

- nome de exibição e política de empate;
- quantidade de eventos e W/L/T total;
- W/L/T agregado por deck próprio;
- W/L/T agregado por arquétipo adversário.

E-mail, eventos/datas individuais, nomes de pessoas adversárias, notas e texto
de listas não são retornados. Revogação preenche `revoked_at`; a RPC bloqueia o
décimo primeiro link ativo e a UI não oferece expiração automática.
