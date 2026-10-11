# Praça — escritório virtual

Plataforma de escritório virtual no estilo Gather: um mapa 2D onde cada pessoa é um avatar, e áudio/vídeo se conectam automaticamente quando você chega perto de alguém.

## Funcionalidades

- **Mapa 2D** em canvas: escritório com salas de reunião, cabines de foco, biblioteca, cozinha, lounge, recepção e jardim
- **Login** (Supabase Auth) restrito a uma lista de e-mails, validado no servidor a cada conexão
- **Espaços com código**: depois do login você entra direto no último espaço; "Sair" leva à tela inicial com os espaços visitados recentemente. Só entra quem é membro ou tem o link de convite/código. Dá para criar espaços novos
- **Editor de avatar** no estilo do Gather (cabelo, barba, roupas, sapatos, chapéu, óculos e cores), salvo na conta
- **Patinetes**: aperte X perto de um para subir e andar com o dobro da velocidade; X de novo estaciona onde você está
- **Movimento** com WASD/setas ou clique duplo no mapa (pathfinding BFS); arrastar move a câmera e a rodinha dá zoom no cursor
- **Multiplayer em tempo real** via Socket.IO, com validação de movimento no servidor
- **Vídeo e áudio por proximidade** (WebRTC P2P): conecta a até 3 tiles de distância, com volume que diminui conforme a distância
- **Áreas privadas**: dentro de uma sala de reunião/cabine, só quem está na mesma área se ouve
- **Compartilhamento de tela com áudio** (som da aba ou do sistema, mixado com o microfone), mutar microfone/câmera, vídeo em destaque (clique no tile)
- **Escolha de microfone, câmera e alto-falante** no lobby e durante a conversa (engrenagem na barra), com medidor de nível do microfone
- **Chat** "Todos" e "Por perto"
- **Emotes** (teclas 1–5), **Alt+F para fumar** (cigarro com fumaça, visível para todos) e personalização de avatar
- **Múltiplos espaços** por URL: `?space=nome-do-time`, cada um com suas salas salvas no Postgres (ou em `data/` localmente)
- **Mapa padrão no layout do escritório remoto do Gather**: refeitório, sala de foco, jardim zen, lounge, pátio com ilhas de mesas, salas de reunião, jogos e biblioteca — e a porta "All Hands" leva ao Auditório
- **Várias salas por espaço**, ligadas por **portais**
- **Interações com X**: TV, quadro branco (Excalidraw colaborativo), mural, documentos — site, vídeo, imagem, link ou nota
- **Mesas ocupáveis**: entre numa área de mesa e aperte X; seu nome aparece na mesa. Botão "Ir para minha mesa"
- **Holofote**: no palco do Auditório, você é ouvido pela sala toda
- **Mapmaker** (martelo), no estilo do Gather — veja [docs/referencia-gather.md](docs/referencia-gather.md):
  - Objetos: catálogo com busca, categorias, cores e rotação; selecionar, carimbar, apagar, mover
  - Efeitos de tile em camadas: Bloqueio, Entrada, Portal, Área privada (com "área de mesa") e Holofote
  - Piso com pincel e preenchimento retangular; fundo e primeiro plano por upload de imagem
  - Seleção retangular para copiar, mover e apagar grupos; desfazer/refazer; criar, renomear e apagar salas
  - Tudo sincronizado em tempo real para quem está no espaço

## Rodando localmente

Requer Node 20+.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. Para testar com outra pessoa, abra outra janela/navegador no mesmo endereço.

## Produção

```bash
npm run build      # front-end em dist/ e servidor em dist-server/
npm start          # porta $PORT (padrão 3001)
```

| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor (no Docker: 8080) |
| `DATABASE_URL` | Postgres para mapas, chat e imagens enviadas (também aceita `POSTGRES_URL`, `POSTGRESQL_URL` ou as variáveis `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`). **Sem ela, salva dentro do container e tudo se perde no próximo deploy** |
| `BASE_PATH` | **No build.** Prefixo público quando o app fica num subcaminho (ex.: `/workspace/`) |
| `SUPABASE_URL` | URL do projeto Supabase usado para o login (ex.: `https://<id>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Chave **anon / publishable** do Supabase (pública). **Nunca** a service role — o app recusa |
| `ALLOWED_USERS` | Quem pode entrar: `email=Pessoa,email2=Pessoa`. Vários e-mails da mesma pessoa compartilham salas trancadas e mesa |

**Em produção, sem `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `ALLOWED_USERS` o app fica fechado** (nunca abre sem login). Localmente (`npm run dev`) o login fica desligado.

As tabelas (`spaces` e `uploads`) são criadas sozinhas na primeira inicialização.

### Deploy no Dokploy (gprgai.top/workspace)

1. **Banco:** no mesmo projeto, crie um *Database → PostgreSQL*. Copie a **Internal Connection URL** (algo como `postgresql://usuario:senha@nome-do-servico:5432/banco`).
2. **App → Environment:** adicione `DATABASE_URL=<a URL interna do passo 1>`.
3. **App → General → Build Type:** *Dockerfile*, com Docker File `Dockerfile` e Context Path `.` (os padrões). O Dockerfile já usa `BASE_PATH=/workspace/`; para outro caminho, defina o build arg `BASE_PATH`.
4. **App → Domains:** Host `gprgai.top`, Path `/workspace`, Internal Path `/`, **Strip Path ligado**, Container Port `8080`, HTTPS com Let's Encrypt.
5. **Login:** em *Environment*, adicione também `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `ALLOWED_USERS` (tabela acima). No Supabase, crie as contas em *Authentication → Users → Add user → Create new user* (marque *Auto Confirm User*) e desligue o cadastro público em *Authentication → Sign In / Providers → Allow new users to sign up*.
6. Faça o deploy e abra https://gprgai.top/workspace.
7. **Confira o banco:** https://gprgai.top/workspace/health precisa mostrar `"storage":"postgres","persistent":true`. Se mostrar `"arquivos"`, a variável não chegou ao app — revise o passo 2 e faça o deploy de novo (o log do app também mostra um aviso ⚠️).

**Backup:** no Mapmaker, menu ☰ → *Baixar mapa (.json)* guarda uma cópia do espaço; *Importar mapa (.json)* restaura (só quem tem acesso às áreas trancadas pode importar).

> WebRTC exige HTTPS (o Let's Encrypt resolve). Para usuários atrás de NAT restritivo (redes corporativas, 4G), configure um servidor TURN (ex.: coturn) em `client/src/rtc/peers.ts`.

## Estrutura

```
shared/      tipos, mapa e regras de proximidade (usados por cliente e servidor)
server/      Express + Socket.IO: espaços, jogadores, chat, sinalização WebRTC; store.ts (Postgres ou arquivos)
client/src/
  game/      motor do jogo, renderização do mapa e avatares, pathfinding
  rtc/       mídia local e malha de conexões WebRTC
  components/ Lobby, Espaço, vídeos, chat e lista de pessoas
```

## Próximos passos

- SFU (LiveKit/mediasoup) para conversas com muitas pessoas (a malha P2P funciona bem até ~6–8)
- Permissões de edição (hoje qualquer pessoa no espaço pode editar o mapa) e tamanho de mapa configurável
- Indicador de quem está falando, status (ocupado/ausente), mensagens diretas
