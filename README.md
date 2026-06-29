# Velas Cristal PCP

Sistema web SaaS para controle de producao, embalagem, bipagem, estoque, funcionarios, produtividade e custos da fabrica Velas Cristal.

O projeto foi preparado para rodar online:

- Frontend: Next.js na Vercel
- Backend/API REST: Node.js + Express na Railway ou Render
- Banco: PostgreSQL online na Railway ou Render
- ORM: Prisma
- Autenticacao: login com senha e JWT
- Repositorio: GitHub

URL desejada em producao: `https://pcp.velascristal.com.br`

## Modulos

- Dashboard diario
- Login, usuarios e permissoes
- Funcionarios
- Produtos
- Producao
- Embalagem
- Bipagem por codigo de barras/QR Code
- Entrada automatica no estoque
- Historico de bipagens
- Relatorios de produtividade
- Relatorios de custo por funcionario
- Integracao futura com VHSYS

## Fluxo da fabrica

A producao inicial nao precisa ser bipada. O sistema comeca o controle quando o produto vai para embalagem/empacotamento.

Na tela `Bipagem de Producao`, o responsavel informa:

- produto produzido
- funcionario que produziu
- funcionario que embalou
- funcionario que empacotou
- quantidade de pacotes
- codigo bipado
- data e hora
- entrada no estoque

O sistema calcula automaticamente:

- quantidade de caixas
- total de unidades
- produtividade por funcionario
- media de pacotes por hora
- media de caixas por hora
- custo por pacote
- custo por caixa
- producao total do dia
- estoque atualizado

Regra inicial dos dados de teste:

- 1 pacote = 8 unidades
- 1 caixa = 25 pacotes

Essas quantidades podem ser alteradas por produto no cadastro.

## Estrutura

```text
backend/
  prisma/
    schema.prisma
    migrations/
  src/
    modules/
frontend/
  app/
  src/
docker-compose.yml
render.yaml
pnpm-workspace.yaml
```

## Rodar localmente

Requisitos:

- Node.js 20+
- pnpm
- Docker, para PostgreSQL local

1. Instalar dependencias:

```bash
pnpm install
```

2. Copiar variaveis de ambiente:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

3. Subir PostgreSQL local:

```bash
docker compose up -d postgres
```

4. Aplicar migrations Prisma:

```bash
pnpm db:migrate
```

5. Criar dados de teste:

```bash
pnpm db:seed
```

6. Rodar frontend e backend:

```bash
pnpm dev
```

URLs locais:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## Usuarios de teste

Senha de todos: `123456`

| Perfil | Email |
| --- | --- |
| Administrador | `admin@velascristal.local` |
| Supervisor | `supervisor@velascristal.local` |
| Funcionario | `funcionario@velascristal.local` |
| Comercial | `comercial@velascristal.local` |

## Codigos de teste para bipagem

Produtos:

| Produto | SKU | Codigo pacote | Codigo caixa |
| --- | --- | --- | --- |
| Vela no 2 no plastico | `VC-N2-PL` | `7897000000211` | `7897000000212` |
| Vela 7 Dias Cristal | `VC-7D-BR` | `7897000000711` | `7897000000712` |
| Vela Aromatica Lavanda | `VC-ARO-LAV` | `7897000001811` | `7897000001812` |

Funcionarios:

- `EMP-SUP-001`
- `EMP-ANA-001`
- `EMP-ADM-001`

Etapas:

- `ETAPA:EMBALAMENTO`
- `ETAPA:EMPACOTAMENTO`
- `ETAPA:ESTOCADA`

## Variaveis de ambiente

Backend, na Railway/Render:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/banco
JWT_SECRET=um-segredo-grande-e-aleatorio
PORT=4000
FRONTEND_URL=https://pcp.velascristal.com.br
```

`FRONTEND_URL` aceita mais de uma origem separada por virgula, por exemplo:

```env
FRONTEND_URL=https://pcp.velascristal.com.br,https://velas-cristal.vercel.app
```

Frontend, na Vercel:

```env
NEXT_PUBLIC_API_URL=https://sua-api-na-railway.up.railway.app/api
```

## Publicar no GitHub

1. Crie um repositorio no GitHub, por exemplo `velas-cristal-pcp`.

2. No terminal, dentro da pasta do projeto:

```bash
git init -b main
git add .
git commit -m "Versao inicial SaaS Velas Cristal PCP"
git remote add origin https://github.com/SEU_USUARIO/velas-cristal-pcp.git
git push -u origin main
```

Depois disso, Vercel e Railway podem publicar automaticamente a partir do GitHub.

## Deploy do backend na Railway

1. Acesse `https://railway.app`.
2. Crie um novo projeto.
3. Adicione um banco `PostgreSQL`.
4. Adicione um novo servico a partir do repositorio GitHub.
5. Selecione o diretorio raiz do servico como `backend`.
6. Configure as variaveis:

```env
DATABASE_URL=<usar a URL gerada pelo PostgreSQL da Railway>
JWT_SECRET=<gerar um segredo forte>
FRONTEND_URL=https://pcp.velascristal.com.br
```

7. Deploy.

O comando de start do backend executa:

```bash
prisma migrate deploy && node src/server.js
```

Ou seja: ao publicar, as migrations do Prisma sao aplicadas automaticamente no banco online.

Para criar dados de teste no banco online, rode uma vez no terminal da Railway:

```bash
pnpm db:seed
```

Depois do deploy, teste:

```text
https://SUA-API.up.railway.app/api/health
```

## Deploy do backend no Render

O arquivo `render.yaml` ja esta preparado.

1. Acesse `https://render.com`.
2. Conecte o repositorio GitHub.
3. Escolha Blueprint.
4. Use o arquivo `render.yaml`.
5. Configure `FRONTEND_URL` com a URL final do frontend.
6. Publique.

## Deploy do frontend na Vercel

1. Acesse `https://vercel.com`.
2. Clique em `Add New Project`.
3. Importe o repositorio GitHub.
4. Configure:
   - Framework: Next.js
   - Root Directory: `frontend`
   - Build Command: `pnpm build`
5. Adicione a variavel:

```env
NEXT_PUBLIC_API_URL=https://SUA-API.up.railway.app/api
```

6. Clique em Deploy.

Depois do deploy, a Vercel gera uma URL parecida com:

```text
https://velas-cristal-pcp.vercel.app
```

## Usar dominio proprio

Para usar:

```text
https://pcp.velascristal.com.br
```

1. Na Vercel, abra o projeto do frontend.
2. Va em `Settings > Domains`.
3. Adicione `pcp.velascristal.com.br`.
4. No DNS do dominio, crie o registro indicado pela Vercel.
5. Atualize o backend:

```env
FRONTEND_URL=https://pcp.velascristal.com.br
```

6. Atualize o frontend se a API tiver mudado:

```env
NEXT_PUBLIC_API_URL=https://SUA-API.up.railway.app/api
```

## Comandos uteis

```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
```

## Observacoes de producao

- O banco local do Docker e apenas para desenvolvimento.
- Em producao, use sempre o PostgreSQL online da Railway ou Render.
- Nunca publique `.env` no GitHub.
- Troque `JWT_SECRET` por um valor forte antes de publicar.
- O leitor de codigo de barras/QR Code deve estar configurado como entrada de texto, enviando Enter ao final da leitura.
